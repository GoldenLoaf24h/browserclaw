import { describe, it, expect } from 'vitest';
import { networkDebuggerStartTool } from '../entrypoints/background/tools/browser/network-capture-debugger';

/**
 * WebSocket frames arrive as CDP Network.webSocketFrame* events. The capture
 * must keep text frames (truncated), record binary by size only, and cap the
 * per-connection frame list so a chatty socket cannot blow up the result.
 */
function makeToolWithCapture(tabId = 5) {
  // The exported instance is a singleton, so each test resets its map entry.
  const tool = networkDebuggerStartTool as any;
  tool.captureData.delete(tabId);
  tool.captureData.set(tabId, {
    startTime: Date.now(),
    requests: {},
    webSockets: {},
    limitReached: false,
    inactivityTimeout: 0,
  });
  return tool;
}

describe('WebSocket frame capture', () => {
  it('records a connection and keeps text frames', () => {
    const tool = makeToolWithCapture();

    tool.handleWebSocketCreated(5, { requestId: 'ws1', url: 'wss://app.test/live' });
    tool.handleWebSocketFrame(5, { requestId: 'ws1', response: { opcode: 1, payloadData: '{"t":"ping"}' }, timestamp: 1.5 }, 'sent');
    tool.handleWebSocketFrame(5, { requestId: 'ws1', response: { opcode: 1, payloadData: 'pong' }, timestamp: 1.6 }, 'received');

    const conn = tool.captureData.get(5).webSockets.ws1;
    expect(conn.url).toBe('wss://app.test/live');
    expect(conn.sentCount).toBe(1);
    expect(conn.receivedCount).toBe(1);
    expect(conn.frames).toHaveLength(2);
    expect(conn.frames[0]).toMatchObject({ direction: 'sent', type: 'text', payload: '{"t":"ping"}' });
    expect(conn.frames[0].timestamp).toBe(1500);
  });

  it('records binary frames by size without the payload blob', () => {
    const tool = makeToolWithCapture();

    tool.handleWebSocketCreated(5, { requestId: 'ws2', url: 'wss://app.test/bin' });
    tool.handleWebSocketFrame(5, { requestId: 'ws2', response: { opcode: 2, payloadData: 'AAECAw==' }, timestamp: 2 }, 'received');

    const frame = tool.captureData.get(5).webSockets.ws2.frames[0];
    expect(frame.type).toBe('binary');
    expect(frame.payload).toBeUndefined();
    expect(frame.payloadLength).toBe(8);
  });

  it('truncates oversized text frames and flags it', () => {
    const tool = makeToolWithCapture();
    const huge = 'x'.repeat(5000);

    tool.handleWebSocketCreated(5, { requestId: 'ws3', url: 'wss://app.test/big' });
    tool.handleWebSocketFrame(5, { requestId: 'ws3', response: { opcode: 1, payloadData: huge }, timestamp: 3 }, 'sent');

    const frame = tool.captureData.get(5).webSockets.ws3.frames[0];
    expect(frame.payload).toHaveLength(4000);
    expect(frame.truncated).toBe(true);
    expect(frame.payloadLength).toBe(5000);
  });

  it('caps frames per connection instead of growing without bound', () => {
    const tool = makeToolWithCapture();

    tool.handleWebSocketCreated(5, { requestId: 'ws4', url: 'wss://app.test/flood' });
    for (let i = 0; i < 250; i++) {
      tool.handleWebSocketFrame(5, { requestId: 'ws4', response: { opcode: 1, payloadData: 'm' + i }, timestamp: i }, 'received');
    }

    const conn = tool.captureData.get(5).webSockets.ws4;
    expect(conn.frames).toHaveLength(200);
    expect(conn.framesTruncated).toBe(true);
    expect(conn.receivedCount).toBe(250);
  });

  it('ignores frames for tabs or connections it is not capturing', () => {
    const tool = makeToolWithCapture();

    expect(() => tool.handleWebSocketFrame(5, { requestId: 'unknown', response: { opcode: 1, payloadData: 'x' } }, 'sent')).not.toThrow();
    expect(() => tool.handleWebSocketFrame(999, { requestId: 'ws1', response: { opcode: 1, payloadData: 'x' } }, 'sent')).not.toThrow();
  });

  it('marks a connection closed without dropping its frames', () => {
    const tool = makeToolWithCapture();

    tool.handleWebSocketCreated(5, { requestId: 'ws5', url: 'wss://app.test/bye' });
    tool.handleWebSocketFrame(5, { requestId: 'ws5', response: { opcode: 1, payloadData: 'last' }, timestamp: 1 }, 'received');
    tool.handleWebSocketClosed(5, { requestId: 'ws5' });

    const conn = tool.captureData.get(5).webSockets.ws5;
    expect(conn.closed).toBe(true);
    expect(conn.frames).toHaveLength(1);
  });
});
