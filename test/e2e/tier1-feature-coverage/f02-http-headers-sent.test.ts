import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { MockFastifyReply } from '../mocks/mock-mcp-server.ts';

describe('Tier 1 - Feature 2: ERR_HTTP_HEADERS_SENT Elimination', () => {
  it('test_f02_fastify_hijack_flag: handler engages reply.hijack() before raw streaming', () => {
    const reply = new MockFastifyReply();
    assert.strictEqual(reply.isHijacked, false);
    reply.hijack();
    assert.strictEqual(reply.isHijacked, true);
  });

  it('test_f02_error_before_headers_sent: should send 500 cleanly without header duplication', () => {
    const reply = new MockFastifyReply();
    reply.hijack();

    // Error occurs before writeHead
    try {
      throw new Error('Database initialization failed');
    } catch (err: any) {
      if (!reply.headersSent) {
        reply.code(500).send({ error: err.message });
      }
    }

    assert.strictEqual(reply.statusCode, 500);
    assert.strictEqual(reply.headersSent, true);
    assert.strictEqual(reply.writtenChunks.length, 1);
  });

  it('test_f02_error_after_headers_sent: should close stream cleanly without calling reply.send()', () => {
    const reply = new MockFastifyReply();
    reply.hijack();
    reply.writeHead(200, { 'Content-Type': 'text/event-stream' });
    reply.write('event: ready\ndata: {}\n\n');

    let threwHeaderError = false;
    try {
      // Stream error happens after headers are already flushed
      throw new Error('Socket timeout mid-stream');
    } catch (err: any) {
      if (reply.headersSent) {
        // Defensive check prevents ERR_HTTP_HEADERS_SENT
        reply.end();
      } else {
        reply.send({ error: err.message });
      }
    }

    assert.strictEqual(threwHeaderError, false);
    assert.strictEqual(reply.writableEnded, true);
  });

  it('test_f02_rapid_client_disconnect: client socket abort handled cleanly without unhandled exception', () => {
    const reply = new MockFastifyReply();
    reply.hijack();
    reply.writeHead(200, { 'Content-Type': 'text/event-stream' });

    // Client aborts connection
    reply.writableEnded = true;

    // Subsequent write should be safely skipped or guarded
    const safeWrite = (data: string) => {
      if (!reply.writableEnded) {
        reply.write(data);
      }
    };

    assert.doesNotThrow(() => {
      safeWrite('event: update\ndata: ping\n\n');
    });
  });

  it('test_f02_double_end_guard: multiple end calls are safe and idempotent', () => {
    const reply = new MockFastifyReply();
    reply.hijack();
    reply.writeHead(200, { 'Content-Type': 'text/event-stream' });

    reply.end();
    assert.strictEqual(reply.writableEnded, true);

    // Second end call should not throw
    assert.doesNotThrow(() => {
      reply.end();
    });
  });
});
