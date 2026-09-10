/**
 * Mock Chrome Extension & Native Host Harness
 * Validates 2-way handshake, 2s heartbeat, and <3s self-healing reconnection
 */

import { EventEmitter } from 'node:events';

export type ExtensionConnectionState =
  | 'DISCONNECTED'
  | 'CONNECTING'
  | 'CONNECTED'
  | 'RECONNECTING'
  | 'ERROR';

export class MockExtensionNativeHost extends EventEmitter {
  public state: ExtensionConnectionState = 'DISCONNECTED';
  public lastPingReceivedAt = 0;
  public lastPongSentAt = 0;
  public pingPongCount = 0;
  public stateHistory: ExtensionConnectionState[] = [];
  public messageQueue: any[] = [];
  private portCrashSimulation: boolean;
  private heartbeatInterval?: NodeJS.Timeout;
  private reconnectTimeout?: NodeJS.Timeout;

  constructor(portCrashSimulation = false) {
    super();
    this.portCrashSimulation = portCrashSimulation;
  }

  private setState(newState: ExtensionConnectionState) {
    this.state = newState;
    this.stateHistory.push(newState);
    this.emit('stateChange', newState);
  }

  /**
   * Initiate 2-way handshake with Native Messaging Host
   */
  async initiateHandshake(): Promise<{ success: boolean; latencyMs: number }> {
    const startTime = Date.now();
    this.setState('CONNECTING');

    // Simulate Native Messaging connect and ACK
    await new Promise((resolve) => setTimeout(resolve, 80));

    if (this.portCrashSimulation) {
      this.setState('ERROR');
      return { success: false, latencyMs: Date.now() - startTime };
    }

    this.setState('CONNECTED');
    this.startHeartbeat();
    this.flushQueuedMessages();

    return { success: true, latencyMs: Date.now() - startTime };
  }

  /**
   * Active 2s Heartbeat Ping/Pong
   */
  private startHeartbeat() {
    if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);
    this.heartbeatInterval = setInterval(() => {
      if (this.state === 'CONNECTED') {
        this.lastPingReceivedAt = Date.now();
        this.lastPongSentAt = Date.now();
        this.pingPongCount++;
        this.emit('heartbeat', { count: this.pingPongCount, timestamp: this.lastPongSentAt });
      }
    }, 200); // Scaled for test speed (200ms represents 2s)
  }

  /**
   * Simulate a transient port disconnect, e.g. Native process reset
   */
  simulatePortDisconnect() {
    if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);
    this.setState('DISCONNECTED');

    // Self-healing: trigger reconnection
    this.setState('RECONNECTING');
    const startReconnect = Date.now();

    this.reconnectTimeout = setTimeout(() => {
      this.setState('CONNECTED');
      this.startHeartbeat();
      this.flushQueuedMessages();
      this.emit('reconnected', { recoveryTimeMs: Date.now() - startReconnect });
    }, 250); // Recovers in 250ms, well within 3000ms SLA
  }

  /**
   * Send message or queue if disconnected
   */
  sendMessage(msg: any): { queued: boolean; sent: boolean } {
    if (this.state === 'CONNECTED') {
      this.emit('message', msg);
      return { queued: false, sent: true };
    } else {
      this.messageQueue.push(msg);
      return { queued: true, sent: false };
    }
  }

  private flushQueuedMessages() {
    while (this.messageQueue.length > 0) {
      const msg = this.messageQueue.shift();
      this.emit('message', msg);
    }
  }

  cleanup() {
    if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);
    if (this.reconnectTimeout) clearTimeout(this.reconnectTimeout);
    this.setState('DISCONNECTED');
  }
}
