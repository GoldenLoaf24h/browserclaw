/**
 * Mock MCP Server & Session Manager Harness
 * Implements McpSessionManager interface from PROJECT.md
 */

import { EventEmitter } from 'node:events';

export interface MockTransport {
  id: string;
  type: 'sse' | 'http' | 'stdio';
  send(message: any): Promise<void>;
  close(): Promise<void>;
  onMessage?: (message: any) => void;
  onClose?: () => void;
}

export interface MockMcpServerInstance {
  name: string;
  version: string;
  transport?: MockTransport;
  tools: Map<string, any>;
  callTool(name: string, args: any): Promise<any>;
}

export interface SessionTransport {
  sessionId: string;
  transport: MockTransport;
  server: MockMcpServerInstance;
  createdAt: number;
  lastActiveAt: number;
}

export class MockMcpSessionManager {
  private sessions = new Map<string, SessionTransport>();
  private idCounter = 0;

  async createSession(transport: MockTransport, customSessionId?: string): Promise<{ sessionId: string; server: MockMcpServerInstance }> {
    const sessionId = customSessionId || `session_${++this.idCounter}_${Date.now()}`;
    if (this.sessions.has(sessionId)) {
      throw new Error(`Session with ID '${sessionId}' already exists`);
    }

    const server: MockMcpServerInstance = {
      name: 'ChromeMcpServer',
      version: '1.0.0',
      transport,
      tools: new Map(),
      async callTool(name: string, args: any) {
        const tool = server.tools.get(name);
        if (!tool) {
          throw new Error(`Tool '${name}' not found on server for session ${sessionId}`);
        }
        return await tool.handler(args, sessionId);
      },
    };

    const sessionData: SessionTransport = {
      sessionId,
      transport,
      server,
      createdAt: Date.now(),
      lastActiveAt: Date.now(),
    };

    this.sessions.set(sessionId, sessionData);
    return { sessionId, server };
  }

  getSession(sessionId: string): SessionTransport | undefined {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.lastActiveAt = Date.now();
    }
    return session;
  }

  async closeSession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (session) {
      if (session.transport.onClose) {
        session.transport.onClose();
      }
      await session.transport.close();
      this.sessions.delete(sessionId);
    }
  }

  cleanupStaleSessions(maxIdleMs: number): number {
    const now = Date.now();
    let reapedCount = 0;
    for (const [id, session] of this.sessions.entries()) {
      if (now - session.lastActiveAt > maxIdleMs) {
        this.sessions.delete(id);
        if (session.transport.onClose) {
          session.transport.onClose();
        }
        session.transport.close().catch(() => {});
        reapedCount++;
      }
    }
    return reapedCount;
  }

  getActiveSessionCount(): number {
    return this.sessions.size;
  }
}

/**
 * Mock HTTP/SSE Reply Harness
 * Tests ERR_HTTP_HEADERS_SENT prevention via Fastify reply.hijack() semantics
 */
export class MockFastifyReply extends EventEmitter {
  public headersSent = false;
  public writableEnded = false;
  public isHijacked = false;
  public statusCode = 200;
  public headers: Record<string, string> = {};
  public writtenChunks: string[] = [];

  hijack() {
    this.isHijacked = true;
    return this;
  }

  writeHead(statusCode: number, headers: Record<string, string>) {
    if (this.headersSent) {
      throw new Error('ERR_HTTP_HEADERS_SENT: Cannot set headers after they are sent to the client');
    }
    this.statusCode = statusCode;
    this.headers = { ...this.headers, ...headers };
    this.headersSent = true;
    return this;
  }

  write(chunk: string) {
    if (this.writableEnded) {
      throw new Error('ERR_STREAM_WRITE_AFTER_END: write after end');
    }
    if (!this.headersSent) {
      this.headersSent = true;
    }
    this.writtenChunks.push(chunk);
    return true;
  }

  end(finalChunk?: string) {
    if (this.writableEnded) {
      return this; // Safe idempotent end
    }
    if (finalChunk) {
      this.write(finalChunk);
    }
    this.writableEnded = true;
    this.emit('finish');
    return this;
  }

  send(payload: any) {
    if (this.headersSent) {
      throw new Error('ERR_HTTP_HEADERS_SENT: Cannot send after headers already sent');
    }
    this.headersSent = true;
    this.writableEnded = true;
    this.writtenChunks.push(typeof payload === 'string' ? payload : JSON.stringify(payload));
    return this;
  }

  code(status: number) {
    this.statusCode = status;
    return this;
  }
}

/**
 * Mock Stdio Process Lifecycle Harness
 * Tests stdin EOF, SIGTERM, and parent PID watchdog termination in < 1s
 */
export class MockStdioProcess extends EventEmitter {
  public isRunning = true;
  public exitCode: number | null = null;
  public terminationTimeMs: number | null = null;
  public parentPid: number;
  private spawnTime = Date.now();
  private watchdogInterval?: NodeJS.Timeout;

  constructor(parentPid = 12345) {
    super();
    this.parentPid = parentPid;
  }

  startWatchdog(checkParentAlive: (pid: number) => boolean) {
    this.watchdogInterval = setInterval(() => {
      if (!checkParentAlive(this.parentPid)) {
        this.terminate(0, 'Parent PID died');
      }
    }, 100);
  }

  closeStdin() {
    // stdio EOF received
    const startTime = Date.now();
    setTimeout(() => {
      this.terminate(0, 'stdin EOF');
      this.terminationTimeMs = Date.now() - startTime;
    }, 50); // Closes in 50ms, well below 1000ms threshold
  }

  sendSignal(signal: 'SIGTERM' | 'SIGINT') {
    const startTime = Date.now();
    setTimeout(() => {
      this.terminate(0, signal);
      this.terminationTimeMs = Date.now() - startTime;
    }, 60);
  }

  terminate(code: number, reason: string) {
    if (!this.isRunning) return;
    this.isRunning = false;
    this.exitCode = code;
    if (this.watchdogInterval) clearInterval(this.watchdogInterval);
    this.emit('exit', code, reason);
  }
}
