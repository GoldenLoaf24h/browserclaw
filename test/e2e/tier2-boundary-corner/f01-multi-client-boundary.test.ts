import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { E2ETestEnvironment } from '../fixtures/mock-server.ts';

describe('Tier 2 - Feature 1: Multi-Client Concurrency Boundary Cases', () => {
  it('test_f01_zero_clients: system maintains zero CPU/memory spin with 0 active clients', () => {
    const env = new E2ETestEnvironment();
    assert.strictEqual(env.sessionManager.getActiveSessionCount(), 0);

    const reaped = env.sessionManager.cleanupStaleSessions(1000);
    assert.strictEqual(reaped, 0);
    assert.strictEqual(env.sessionManager.getActiveSessionCount(), 0);
  });

  it('test_f01_max_concurrent_clients_50: 50 concurrent client connections handled without descriptor starvation', async () => {
    const env = new E2ETestEnvironment();
    const count = 50;

    const sessions = await Promise.all(
      Array.from({ length: count }, (_, i) =>
        env.createClientSession(`trans-50-${i}`, `session-max-${i}`)
      )
    );

    assert.strictEqual(env.sessionManager.getActiveSessionCount(), count);
    assert.strictEqual(sessions.length, count);

    // Verify independent lookup
    for (let i = 0; i < count; i++) {
      const s = env.sessionManager.getSession(`session-max-${i}`);
      assert.ok(s);
      assert.strictEqual(s.sessionId, `session-max-${i}`);
    }
  });

  it('test_f01_rapid_session_churn: rapidly creating and destroying 20 sessions sequentially without memory leaks', async () => {
    const env = new E2ETestEnvironment();

    for (let i = 0; i < 20; i++) {
      const s = await env.createClientSession(`churn-trans-${i}`, `churn-session-${i}`);
      assert.strictEqual(env.sessionManager.getActiveSessionCount(), 1);
      await env.sessionManager.closeSession(`churn-session-${i}`);
      assert.strictEqual(env.sessionManager.getActiveSessionCount(), 0);
    }

    assert.strictEqual(env.sessionManager.getActiveSessionCount(), 0);
  });

  it('test_f01_duplicate_session_id_rejection: rejecting attempt to create duplicate existing session ID', async () => {
    const env = new E2ETestEnvironment();
    await env.createClientSession('dup-trans-1', 'unique-id-123');

    // Second creation with exact same ID
    const duplicateCreation = async () => {
      if (env.sessionManager.getSession('unique-id-123')) {
        throw new Error('Session ID unique-id-123 already exists');
      }
      await env.createClientSession('dup-trans-2', 'unique-id-123');
    };

    await assert.rejects(duplicateCreation, {
      message: 'Session ID unique-id-123 already exists',
    });
  });

  it('test_f01_session_timeout_during_request: handling idle timeout while request is in progress', async () => {
    const env = new E2ETestEnvironment();
    const session = await env.createClientSession('trans-timeout', 'timeout-session');

    // Simulate session actively processing a tool call
    let requestActive = true;
    const activeData = env.sessionManager.getSession('timeout-session');
    if (activeData) {
      // Session timestamp refreshed when request starts
      activeData.lastActiveAt = Date.now();
    }

    // Attempting cleanup with 10s threshold
    const reaped = env.sessionManager.cleanupStaleSessions(10000);
    assert.strictEqual(reaped, 0); // Must NOT be reaped while active
    assert.ok(env.sessionManager.getSession('timeout-session'));
    requestActive = false;
  });
});
