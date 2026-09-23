import { describe, expect, test, jest } from '@jest/globals';
import { NativeMessagingHost } from './native-messaging-host';
import { stdout } from 'process';

describe('Native Messaging Chunking Tests (Task B8)', () => {
  test('reassembles incoming chunks split into multiple messages', async () => {
    const host = new NativeMessagingHost();
    const handleMessageSpy = jest.spyOn(host as any, 'handleMessage');

    const originalPayload = {
      responseToRequestId: 'req-test-1',
      payload: { data: 'a'.repeat(2000), count: 42 },
    };
    const serialized = JSON.stringify(originalPayload);
    const chunk1 = serialized.slice(0, 1000);
    const chunk2 = serialized.slice(1000);

    const chunkId = 'test-chunk-uuid-1';
    const chunkMsg1 = {
      __chunked__: true,
      chunkId,
      index: 0,
      total: 2,
      chunk: chunk1,
    };
    const chunkMsg2 = {
      __chunked__: true,
      chunkId,
      index: 1,
      total: 2,
      chunk: chunk2,
    };

    // Process chunk 1
    await (host as any).handleMessage(chunkMsg1);
    // Should not have resolved the full payload yet
    expect(handleMessageSpy).toHaveBeenCalledTimes(1);

    // Process chunk 2
    await (host as any).handleMessage(chunkMsg2);
    // Should now have called handleMessage with the reassembled full message
    expect(handleMessageSpy).toHaveBeenCalledTimes(3);
    const reassembledCall = handleMessageSpy.mock.calls[2][0];
    expect(reassembledCall).toEqual(originalPayload);
  });

  test('chunks outgoing messages larger than threshold (950KB)', () => {
    const host = new NativeMessagingHost();
    const stdoutSpy = jest.spyOn(stdout, 'write').mockImplementation((() => true) as any);

    try {
      // Create a payload > 950KB (e.g. 1MB of text)
      const bigString = 'x'.repeat(1024 * 1000);
      const message = { type: 'big_data', payload: bigString };

      host.sendMessage(message);

      // Should have written multiple chunks
      expect(stdoutSpy).toHaveBeenCalled();
      const calls = stdoutSpy.mock.calls;
      expect(calls.length).toBeGreaterThan(1);

      // Verify each chunk is formatted with 4-byte header and __chunked__ flag
      const writtenChunks: any[] = [];
      for (const call of calls) {
        const buf = call[0] as Buffer;
        const len = buf.readUInt32LE(0);
        const json = JSON.parse(buf.slice(4, 4 + len).toString());
        expect(json.__chunked__).toBe(true);
        expect(json.chunkId).toBeDefined();
        expect(json.total).toBe(calls.length);
        writtenChunks.push(json);
      }

      // Verify order and reassembly
      writtenChunks.sort((a, b) => a.index - b.index);
      const reassembledStr = writtenChunks.map((c) => c.chunk).join('');
      const restored = JSON.parse(reassembledStr);
      expect(restored.type).toBe('big_data');
      expect(restored.payload.length).toBe(1024 * 1000);
    } finally {
      stdoutSpy.mockRestore();
    }
  });

  test('sends normal size message directly without chunking', () => {
    const host = new NativeMessagingHost();
    const stdoutSpy = jest.spyOn(stdout, 'write').mockImplementation((() => true) as any);

    try {
      const message = { type: 'ping', payload: 'hello' };
      host.sendMessage(message);

      expect(stdoutSpy).toHaveBeenCalledTimes(1);
      const buf = stdoutSpy.mock.calls[0][0] as Buffer;
      const len = buf.readUInt32LE(0);
      const json = JSON.parse(buf.slice(4, 4 + len).toString());
      expect(json.__chunked__).toBeUndefined();
      expect(json.type).toBe('ping');
    } finally {
      stdoutSpy.mockRestore();
    }
  });
});
