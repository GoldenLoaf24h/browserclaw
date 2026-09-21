import { stdin, stdout } from 'process';
import { Server } from './server';
import { v4 as uuidv4 } from 'uuid';
import { NativeMessageType } from 'chrome-mcp-shared';
import { TIMEOUTS } from './constant';
import fileHandler from './file-handler';
import { getBridgeToken } from './server/token';
import { choice } from '@typesafe-ai/sdk';
import { JevClientWrapper, buildState, isSessionKeyInvalid, HeuristicEngine } from './jev';

interface PendingRequest {
  resolve: (value: any) => void;
  reject: (reason?: any) => void;
  timeoutId: NodeJS.Timeout;
}

export class NativeMessagingHost {
  private associatedServer: Server | null = null;
  private pendingRequests: Map<string, PendingRequest> = new Map();
  public isConnected = false;

  public setServer(serverInstance: Server): void {
    this.associatedServer = serverInstance;
  }

  // add message handler to wait for start server
  public start(): void {
    try {
      this.setupMessageHandling();
    } catch (error: any) {
      process.exit(1);
    }
  }

  private setupMessageHandling(): void {
    let buffer = Buffer.alloc(0);
    let expectedLength = -1;
    const MAX_MESSAGES_PER_TICK = 100; // Safety guard to avoid long-running loops per readable tick
    const MAX_MESSAGE_SIZE_BYTES = 1024 * 1024; // 1MB Chrome Native Messaging physical limit

    const processAvailable = () => {
      let processed = 0;
      while (processed < MAX_MESSAGES_PER_TICK) {
        // Read length header when needed
        if (expectedLength === -1) {
          if (buffer.length < 4) break; // not enough for header
          expectedLength = buffer.readUInt32LE(0);
          buffer = buffer.slice(4);

          // Validate length header: Chrome strictly caps messages at 1MB
          if (expectedLength <= 0 || expectedLength > MAX_MESSAGE_SIZE_BYTES) {
            console.error(
              `[NativeHost] Fatal protocol framing error: invalid message length ${expectedLength} (cap: ${MAX_MESSAGE_SIZE_BYTES})`,
            );
            this.sendError(`Invalid message length: ${expectedLength} (exceeds Chrome 1MB limit)`);
            expectedLength = -1;
            buffer = Buffer.alloc(0);
            if (process.env.NODE_ENV !== 'test') {
              setTimeout(() => process.exit(1), 50);
            }
            break;
          }
        }

        // Wait for complete body
        if (buffer.length < expectedLength) break;

        const messageBuffer = buffer.slice(0, expectedLength);
        buffer = buffer.slice(expectedLength);
        expectedLength = -1;
        processed++;

        try {
          const message = JSON.parse(messageBuffer.toString());
          this.handleMessage(message).catch((error: any) => {
            const errMsg = error instanceof Error ? error.message : String(error);
            console.error('Unhandled error processing native message:', error);
            if (message && typeof message === 'object' && message.requestId) {
              this.sendMessage({
                type: 'file_operation_response',
                responseToRequestId: message.requestId,
                error: errMsg,
              });
            } else {
              this.sendError(`Unhandled error processing message: ${errMsg}`);
            }
          });
        } catch (error: any) {
          this.sendError(`Failed to parse message: ${error.message}`);
        }
      }

      // If we hit the cap but still have at least one complete message pending, schedule to continue soon
      if (processed === MAX_MESSAGES_PER_TICK) {
        setImmediate(processAvailable);
      }
    };

    stdin.on('readable', () => {
      let chunk;
      while ((chunk = stdin.read()) !== null) {
        buffer = Buffer.concat([buffer, chunk]);
        processAvailable();
      }
    });

    stdin.on('end', () => {
      this.cleanup();
    });

    stdin.on('error', () => {
      this.cleanup();
    });
  }

  private async handleMessage(message: any): Promise<void> {
    if (!message || typeof message !== 'object') {
      this.sendError('Invalid message format');
      return;
    }

    this.isConnected = true;

    if (message.responseToRequestId) {
      const requestId = message.responseToRequestId;
      const pending = this.pendingRequests.get(requestId);

      if (pending) {
        clearTimeout(pending.timeoutId);
        if (message.error) {
          pending.reject(new Error(message.error));
        } else {
          pending.resolve(message.payload);
        }
        this.pendingRequests.delete(requestId);
      } else {
        // just ignore
      }
      return;
    }

    // Handle directive messages from Chrome
    try {
      switch (message.type) {
        case NativeMessageType.START:
          await this.startServer(message.payload?.port || 12306);
          break;
        case NativeMessageType.STOP:
          await this.stopServer();
          break;
        // Keep ping/pong for simple liveness detection, but this differs from request-response pattern
        case 'ping_from_extension':
          this.sendMessage({ type: 'pong_to_extension' });
          break;
        case 'file_operation':
          await this.handleFileOperation(message);
          break;
        case 'jev_semantic_match':
          await this.handleJevSemanticMatch(message);
          break;
        case 'get_server_info':
        case 'get_token':
          this.sendMessage({
            type: 'server_info_response',
            responseToRequestId: message.requestId,
            payload: {
              isRunning: this.associatedServer?.isRunning ?? false,
              port: (this.associatedServer as any)?.port || 12306,
              token: getBridgeToken(),
            },
          });
          break;
        default:
          // Double check when message type is not supported
          if (!message.responseToRequestId) {
            this.sendError(
              `Unknown message type or non-response message: ${message.type || 'no type'}`,
            );
          }
      }
    } catch (error: any) {
      this.sendError(`Failed to handle directive message: ${error.message}`);
    }
  }

  /**
   * Handle file operations from the extension
   */
  private async handleFileOperation(message: any): Promise<void> {
    try {
      const result = await fileHandler.handleFileRequest(message.payload);

      if (message.requestId) {
        // Send response back with the request ID
        this.sendMessage({
          type: 'file_operation_response',
          responseToRequestId: message.requestId,
          payload: result,
        });
      } else {
        // No request ID, just send result
        this.sendMessage({
          type: 'file_operation_result',
          payload: result,
        });
      }
    } catch (error: any) {
      const errorResponse = {
        success: false,
        error: error.message || 'Unknown error during file operation',
      };

      if (message.requestId) {
        this.sendMessage({
          type: 'file_operation_response',
          responseToRequestId: message.requestId,
          error: errorResponse.error,
        });
      } else {
        this.sendError(`File operation failed: ${errorResponse.error}`);
      }
    }
  }

  /**
   * Handle Jev semantic matching requests from the extension (for form pipeline)
   */
  private async handleJevSemanticMatch(message: any): Promise<void> {
    const payload = message.payload;
    const query = String(payload?.query || '');
    const value = payload?.value ? String(payload.value) : '';
    const matchType = payload?.type || 'field';
    const candidates: Array<{ id: string | number; text: string }> = Array.isArray(
      payload?.candidates,
    )
      ? payload.candidates
      : [];

    const sendResponse = (data: any) => {
      this.sendMessage({
        type: 'file_operation_response',
        responseToRequestId: message.requestId,
        payload: data,
      });
    };

    if (candidates.length === 0) {
      sendResponse({ success: false, reason: 'no_candidates' });
      return;
    }

    // 1. Try TypeSafe Jev System One
    try {
      const jevClient = new JevClientWrapper();
      if (jevClient.isAvailable()) {
          const targetCriteria: Record<string, string | null> = {};
          for (const cand of candidates) {
            targetCriteria[String(cand.id)] = cand.text;
          }
          targetCriteria['none'] = 'None of the above candidates match';

          const prompt =
            matchType === 'choice'
              ? `Which candidate option best matches the desired choice "${value}" for query "${query}"?`
              : matchType === 'input'
                ? `Which input element best corresponds to the field "${query}"?`
                : `Which field best corresponds to the current screen question: "${query}"?`;

          const questions = {
            matched_target: choice(prompt, targetCriteria),
          };

          const state = buildState(
            `Match form field or option: ${query}`,
            '',
            '',
            candidates.map((c) => `[${c.id}] ${c.text}`),
            [],
          );

          const { result } = await jevClient.query(state, questions);
          const answer = (result?.answers as any)?.matched_target;
          if (answer && answer.choice && answer.choice !== 'none') {
            const originalCand = candidates.find((c) => String(c.id) === String(answer.choice));
            sendResponse({
              success: true,
              engine: 'jev',
              matchedId: originalCand ? originalCand.id : answer.choice,
              confidence: answer.confidence || 0.85,
              probabilities: answer.probabilities,
            });
            return;
          }
        }
      } catch (err) {
      console.warn('[NativeHost] Jev semantic evaluation error:', err);
    }

    // 2. Fallback to Heuristic Engine
    try {
      const heuristicEngine = new HeuristicEngine();
      const targetQuery = matchType === 'choice' && value ? value : query;
      const elements = candidates.map(
        (cand, idx) => `[${idx}] button "${cand.text}"`,
      );
      const decision = heuristicEngine.evaluate(targetQuery, elements, []);

      if (decision && decision.targetIndex !== undefined && decision.confidence >= 0.3) {
        const matched = candidates[decision.targetIndex];
        if (matched) {
          sendResponse({
            success: true,
            engine: 'heuristic',
            matchedId: matched.id,
            confidence: decision.confidence,
          });
          return;
        }
      }
    } catch (heurErr) {
      console.warn('[NativeHost] Heuristic evaluation error:', heurErr);
    }

    sendResponse({ success: false, engine: 'none' });
  }

  /**
   * Send request to Chrome and wait for response
   * @param messagePayload Data to send to Chrome
   * @param timeoutMs Timeout for waiting response (milliseconds)
   * @returns Promise, resolves to Chrome's returned payload on success, rejects on failure
   */
  public sendRequestToExtensionAndWait(
    messagePayload: any,
    messageType: string = 'request_data',
    timeoutMs: number = TIMEOUTS.DEFAULT_REQUEST_TIMEOUT,
  ): Promise<any> {
    if (!this.isConnected) {
      return Promise.reject(new Error('Chrome extension is not connected'));
    }

    return new Promise((resolve, reject) => {
      const requestId = uuidv4(); // Generate unique request ID

      // Pre-check payload size to fail immediately rather than hang until timeout
      try {
        const testStr = JSON.stringify({
          type: messageType,
          payload: messagePayload,
          requestId,
        });
        const byteLen = Buffer.byteLength(testStr);
        if (byteLen >= 1000 * 1024) {
          reject(
            new Error(
              `Outgoing request payload (${byteLen} bytes) exceeds Chrome Native Messaging 1MB ceiling.`,
            ),
          );
          return;
        }
      } catch (err: any) {
        reject(new Error(`Failed to serialize outgoing request: ${err?.message || err}`));
        return;
      }

      const timeoutId = setTimeout(() => {
        this.pendingRequests.delete(requestId); // Remove from Map after timeout
        reject(new Error(`Request timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      // Store request's resolve/reject functions and timeout ID
      this.pendingRequests.set(requestId, { resolve, reject, timeoutId });

      // Send message with requestId to Chrome
      this.sendMessage({
        type: messageType, // Define a request type, e.g. 'request_data'
        payload: messagePayload,
        requestId: requestId, // <--- Key: include request ID
      });
    });
  }

  /**
   * Start Fastify server (now accepts Server instance)
   */
  private async startServer(port: number): Promise<void> {
    if (!this.associatedServer) {
      this.sendError('Internal error: server instance not set');
      return;
    }
    try {
      if (this.associatedServer.isRunning) {
        this.sendMessage({
          type: NativeMessageType.SERVER_STARTED,
          payload: { port, token: getBridgeToken() },
        });
        return;
      }

      await this.associatedServer.start(port, this);

      this.sendMessage({
        type: NativeMessageType.SERVER_STARTED,
        payload: { port, token: getBridgeToken() },
      });
    } catch (error: any) {
      this.sendError(`Failed to start server: ${error.message}`);
    }
  }

  /**
   * Stop Fastify server
   */
  private async stopServer(): Promise<void> {
    if (!this.associatedServer) {
      this.sendError('Internal error: server instance not set');
      return;
    }
    try {
      // Check status through associatedServer
      if (!this.associatedServer.isRunning) {
        this.sendMessage({
          type: NativeMessageType.ERROR,
          payload: { message: 'Server is not running' },
        });
        return;
      }

      await this.associatedServer.stop();
      // this.serverStarted = false; // Server should update its own status after successful stop

      this.sendMessage({ type: NativeMessageType.SERVER_STOPPED }); // Distinguish from previous 'stopped'
    } catch (error: any) {
      this.sendError(`Failed to stop server: ${error.message}`);
    }
  }

  /**
   * Send message to Chrome extension
   */
  public sendMessage(message: any): void {
    try {
      const messageString = JSON.stringify(message);
      const messageBuffer = Buffer.from(messageString);

      // Chrome Native Messaging hard limit is 1MB (1024 * 1024 bytes).
      // Writing >= 1MB payload to stdout terminates the process immediately.
      // We enforce a safe 1000KB boundary to protect the pipe and process lifecycle.
      const SAFE_MESSAGE_LIMIT_BYTES = 1000 * 1024;
      if (messageBuffer.length >= SAFE_MESSAGE_LIMIT_BYTES) {
        console.error(
          `[NativeHost] Blocked outgoing message exceeding 1MB ceiling: ${messageBuffer.length} bytes`,
        );
        if (
          message &&
          typeof message === 'object' &&
          message.requestId &&
          this.pendingRequests.has(message.requestId)
        ) {
          const pending = this.pendingRequests.get(message.requestId)!;
          this.pendingRequests.delete(message.requestId);
          clearTimeout(pending.timeoutId);
          pending.reject(
            new Error(
              `Outgoing request payload (${messageBuffer.length} bytes) exceeds Chrome Native Messaging 1MB ceiling.`,
            ),
          );
          return;
        }
        if (message && typeof message === 'object' && message.responseToRequestId) {
          const errMsg = {
            type: message.type || 'error',
            responseToRequestId: message.responseToRequestId,
            error: `Response payload (${messageBuffer.length} bytes) exceeds Chrome Native Messaging 1MB ceiling. Please access via local file path or stream.`,
          };
          const errBuf = Buffer.from(JSON.stringify(errMsg));
          const errHdr = Buffer.alloc(4);
          errHdr.writeUInt32LE(errBuf.length, 0);
          stdout.write(Buffer.concat([errHdr, errBuf]));
        }
        return;
      }

      const headerBuffer = Buffer.alloc(4);
      headerBuffer.writeUInt32LE(messageBuffer.length, 0);
      // Ensure atomic write
      stdout.write(Buffer.concat([headerBuffer, messageBuffer]), (err) => {
        if (err) {
          // Write failure
        }
      });
    } catch (error: any) {
      console.error('[NativeHost] Failed to serialize or send native message:', error);
    }
  }

  /**
   * Send error message to Chrome extension (mainly for sending non-request-response type errors)
   */
  private sendError(errorMessage: string): void {
    this.sendMessage({
      type: NativeMessageType.ERROR_FROM_NATIVE_HOST, // Use more explicit type
      payload: { message: errorMessage },
    });
  }

  /**
   * Clean up resources
   */
  private cleanup(): void {
    this.isConnected = false;
    // Reject all pending requests
    this.pendingRequests.forEach((pending) => {
      clearTimeout(pending.timeoutId);
      pending.reject(new Error('Native host is shutting down or Chrome disconnected.'));
    });
    this.pendingRequests.clear();

    // 1000ms unref'd watchdog exit timer to prevent orphaned processes from holding port 12306 on Windows
    setTimeout(() => process.exit(0), 1000).unref();

    if (this.associatedServer && this.associatedServer.isRunning) {
      this.associatedServer
        .stop()
        .then(() => {
          process.exit(0);
        })
        .catch(() => {
          process.exit(1);
        });
    } else {
      process.exit(0);
    }
  }
}

const nativeMessagingHostInstance = new NativeMessagingHost();
export default nativeMessagingHostInstance;
