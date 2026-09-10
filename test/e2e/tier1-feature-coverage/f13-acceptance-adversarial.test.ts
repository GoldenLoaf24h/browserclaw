import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { E2ETestEnvironment } from '../fixtures/mock-server.ts';
import { create1500NodeFeedDOM } from '../fixtures/dom-samples.ts';
import { ADVERSARIAL_TOOL_INPUTS } from '../fixtures/tool-inputs.ts';

describe('Tier 1 - Feature 13: Final E2E Acceptance & Adversarial Hardening', () => {
  it('test_f13_full_opaque_box_pipeline: executes full client -> session -> tool pipeline end-to-end', async () => {
    const env = new E2ETestEnvironment();
    const session = await env.createClientSession('client-opaque', 'opaque-session-1');

    // 1. Read DOM
    const domRes = await session.server.callTool('chrome_read_dom', {});
    assert.ok(domRes.interactiveCount > 0);

    // 2. Click element index 1
    const clickRes = await session.server.callTool('chrome_interact_index', { index: 1 });
    assert.strictEqual(clickRes.success, true);

    // 3. Batch action
    const batchRes = await session.server.callTool('chrome_batch_actions', {
      actions: [
        { type: 'wait', durationMs: 10 },
        { type: 'click', index: 1 },
      ],
    });
    assert.strictEqual(batchRes.success, true);
    assert.strictEqual(batchRes.completedActions, 2);

    // 4. Extract markdown
    const mdRes = await session.server.callTool('chrome_get_markdown', {});
    assert.ok(mdRes.markdown.length > 0);

    await env.sessionManager.closeSession('opaque-session-1');
  });

  it('test_f13_concurrency_stress_load: 10 parallel client sessions execute concurrent calls without collision', async () => {
    const env = new E2ETestEnvironment();
    const clientCount = 10;
    const sessions = await Promise.all(
      Array.from({ length: clientCount }, (_, i) =>
        env.createClientSession(`trans-${i}`, `stress-session-${i}`)
      )
    );

    assert.strictEqual(env.sessionManager.getActiveSessionCount(), clientCount);

    const results = await Promise.all(
      sessions.map((s, idx) =>
        s.server.callTool('chrome_fill_index', {
          index: 1,
          text: `concurrent payload from client ${idx}`,
        })
      )
    );

    for (let i = 0; i < clientCount; i++) {
      assert.strictEqual(results[i].success, true);
      assert.strictEqual(results[i].filledText, `concurrent payload from client ${i}`);
    }

    assert.strictEqual(env.sessionManager.getActiveSessionCount(), clientCount);
  });

  it('test_f13_reconnect_resilience: in-flight message queue preserved across simulated port disconnect', async () => {
    const env = new E2ETestEnvironment();
    await env.extensionHost.initiateHandshake();

    // Send message while connected
    const sentRes = env.extensionHost.sendMessage({ type: 'EXECUTE', action: 'focus' });
    assert.strictEqual(sentRes.sent, true);
    assert.strictEqual(sentRes.queued, false);

    // Disconnect
    env.extensionHost.simulatePortDisconnect();
    assert.strictEqual(env.extensionHost.state, 'RECONNECTING');

    // Message sent during disconnect must be safely queued
    const queuedRes = env.extensionHost.sendMessage({ type: 'EXECUTE', action: 'fill_after_reconnect' });
    assert.strictEqual(queuedRes.queued, true);
    assert.strictEqual(queuedRes.sent, false);

    // Wait for self-healing reconnection (<3000ms SLA)
    await new Promise((resolve) => setTimeout(resolve, 350));
    assert.strictEqual(env.extensionHost.state, 'CONNECTED');
    assert.strictEqual(env.extensionHost.messageQueue.length, 0); // Flushed
    env.cleanup();
  });

  it('test_f13_high_node_count_stability: processes 1,500+ node DOM within performance limits', () => {
    const env = new E2ETestEnvironment();
    const feed = create1500NodeFeedDOM();

    const start = Date.now();
    const result = env.domEngine.pruneAndIndex(feed, 1000);
    const duration = Date.now() - start;

    assert.ok(result.interactiveCount > 0);
    assert.ok(duration < 500, `Pruning 1500 nodes took ${duration}ms, should be < 500ms`);
  });

  it('test_f13_adversarial_input_sanitization: safely handles prototype pollution and prompt injections', async () => {
    const env = new E2ETestEnvironment();
    const session = await env.createClientSession('adversarial-client');

    // Prototype pollution injection
    const fillRes = await session.server.callTool('chrome_fill_index', {
      index: 1,
      text: JSON.stringify(ADVERSARIAL_TOOL_INPUTS.prototypePollution),
    });
    assert.strictEqual(fillRes.success, true);
    assert.strictEqual((Object.prototype as any).isAdmin, undefined);
    assert.strictEqual((Object.prototype as any).hacked, undefined);

    // SQL / Prompt injection characters handled as literal string
    const promptInjectionText = ADVERSARIAL_TOOL_INPUTS.promptInjection.aiBypass;
    const promptRes = await session.server.callTool('chrome_fill_index', {
      index: 1,
      text: promptInjectionText,
    });
    assert.strictEqual(promptRes.success, true);
    assert.strictEqual(promptRes.filledText, promptInjectionText);
  });
});
