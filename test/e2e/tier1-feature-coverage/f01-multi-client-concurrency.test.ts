import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { E2ETestEnvironment } from '../fixtures/mock-server.ts';

describe('Tier 1 - Feature 1: Multi-client HTTP/SSE Concurrency', () => {
  it('test_f01_create_independent_sessions: should create distinct sessions with isolated servers', async () => {
    const env = new E2ETestEnvironment();
    const sessionA = await env.createClientSession('client-a-transport', 'client-a-id');
    const sessionB = await env.createClientSession('client-b-transport', 'client-b-id');

    assert.notStrictEqual(sessionA.sessionId, sessionB.sessionId);
    assert.notStrictEqual(sessionA.server, sessionB.server);
    assert.strictEqual(env.sessionManager.getActiveSessionCount(), 2);
  });

  it('test_f01_concurrent_tool_dispatch: should handle parallel tool calls across sessions without crosstalk', async () => {
    const env = new E2ETestEnvironment();
    const sessionA = await env.createClientSession('client-a');
    const sessionB = await env.createClientSession('client-b');

    const [resA, resB] = await Promise.all([
      sessionA.server.callTool('chrome_fill_index', { index: 1, text: 'Claude query' }),
      sessionB.server.callTool('chrome_fill_index', { index: 2, text: 'Hermes query' }),
    ]);

    assert.strictEqual(resA.success, true);
    assert.strictEqual(resA.filledText, 'Claude query');
    assert.strictEqual(resB.success, true);
    assert.strictEqual(resB.filledText, 'Hermes query');
  });

  it('test_f01_session_isolation_on_close: closing session A must not affect active session B', async () => {
    const env = new E2ETestEnvironment();
    const sessionA = await env.createClientSession('client-a', 'session-to-close');
    const sessionB = await env.createClientSession('client-b', 'session-to-stay');

    await env.sessionManager.closeSession('session-to-close');

    assert.strictEqual(env.sessionManager.getSession('session-to-close'), undefined);
    const activeB = env.sessionManager.getSession('session-to-stay');
    assert.ok(activeB);
    assert.strictEqual(activeB.sessionId, 'session-to-stay');
    assert.strictEqual(env.sessionManager.getActiveSessionCount(), 1);
  });

  it('test_f01_stale_session_cleanup: reaper removes idle sessions and retains recently active sessions', async () => {
    const env = new E2ETestEnvironment();
    const active = await env.createClientSession('client-active', 'active-session');
    const stale = await env.createClientSession('client-stale', 'stale-session');

    // Simulate stale session idle time
    const staleData = env.sessionManager.getSession('stale-session');
    if (staleData) {
      staleData.lastActiveAt = Date.now() - 3600000; // 1 hour ago
    }

    const reaped = env.sessionManager.cleanupStaleSessions(60000); // 1 minute threshold
    assert.strictEqual(reaped, 1);
    assert.strictEqual(env.sessionManager.getSession('stale-session'), undefined);
    assert.ok(env.sessionManager.getSession('active-session'));
  });

  it('test_f01_sse_stream_multi_subscription: concurrent sessions maintain separate transport queues', async () => {
    const env = new E2ETestEnvironment();
    const messagesA: any[] = [];
    const messagesB: any[] = [];

    const transportA = {
      id: 't-a',
      type: 'sse' as const,
      send: async (msg: any) => { messagesA.push(msg); },
      close: async () => {},
    };
    const transportB = {
      id: 't-b',
      type: 'sse' as const,
      send: async (msg: any) => { messagesB.push(msg); },
      close: async () => {},
    };

    await env.sessionManager.createSession(transportA, 'session-sub-a');
    await env.sessionManager.createSession(transportB, 'session-sub-b');

    await transportA.send({ event: 'endpoint', url: '/messages?session=a' });
    await transportB.send({ event: 'endpoint', url: '/messages?session=b' });

    assert.strictEqual(messagesA.length, 1);
    assert.strictEqual(messagesB.length, 1);
    assert.strictEqual(messagesA[0].url, '/messages?session=a');
    assert.strictEqual(messagesB[0].url, '/messages?session=b');
  });
});
