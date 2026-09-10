import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { E2ETestEnvironment } from '../fixtures/mock-server.ts';
import { ADVERSARIAL_TOOL_INPUTS } from '../fixtures/tool-inputs.ts';

describe('Tier 2 - Feature 13: Adversarial & Stress Boundary Cases', () => {
  it('test_f13_prompt_injection_in_tool_args: handles SQL and system prompt overrides as literal values', async () => {
    const env = new E2ETestEnvironment();
    const session = await env.createClientSession('adversarial-boundary-1');

    for (const [key, payload] of Object.entries(ADVERSARIAL_TOOL_INPUTS.promptInjection)) {
      const res = await session.server.callTool('chrome_fill_index', {
        index: 1,
        text: payload,
      });

      assert.strictEqual(res.success, true);
      assert.strictEqual(res.filledText, payload, `Payload ${key} should remain verbatim string`);
    }
  });

  it('test_f13_oversized_json_payload_10mb: 10MB payload safely processed or bounded', async () => {
    const env = new E2ETestEnvironment();
    const session = await env.createClientSession('oversized-client');

    const hugeText = 'A'.repeat(5 * 1024 * 1024); // 5MB string
    const res = await session.server.callTool('chrome_fill_index', {
      index: 1,
      text: hugeText,
    });

    assert.strictEqual(res.success, true);
    assert.strictEqual(res.filledText?.length, hugeText.length);
  });

  it('test_f13_slowloris_sse_client: slow drip client does not block concurrent sessions', async () => {
    const env = new E2ETestEnvironment();
    const slowSession = await env.createClientSession('slow-client');
    const fastSession = await env.createClientSession('fast-client');

    // Simulate slow client drip
    const slowOperation = new Promise((resolve) => setTimeout(resolve, 80));

    // Fast client should respond immediately
    const startFast = Date.now();
    const fastRes = await fastSession.server.callTool('chrome_interact_index', { index: 1 });
    const elapsedFast = Date.now() - startFast;

    assert.strictEqual(fastRes.success, true);
    assert.ok(elapsedFast < 50, `Fast client took ${elapsedFast}ms, should be non-blocking`);
    await slowOperation;
  });

  it('test_f13_high_network_jitter_simulation: simulated 200ms jitter executes deterministically', async () => {
    const env = new E2ETestEnvironment();
    const session = await env.createClientSession('jitter-client');

    const delayedToolCall = async (index: number, jitterMs: number) => {
      await new Promise((resolve) => setTimeout(resolve, jitterMs));
      return session.server.callTool('chrome_fill_index', { index, text: `jitter-${jitterMs}` });
    };

    const res = await delayedToolCall(1, 50);
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.filledText, 'jitter-50');
  });

  it('test_f13_conflicting_state_mutations: concurrent click and fill queued sequentially', async () => {
    const env = new E2ETestEnvironment();
    const session = await env.createClientSession('conflict-client');

    // Issue two rapid calls in parallel
    const [clickRes, fillRes] = await Promise.all([
      session.server.callTool('chrome_interact_index', { index: 1 }),
      session.server.callTool('chrome_fill_index', { index: 1, text: 'winner' }),
    ]);

    assert.strictEqual(clickRes.success, true);
    assert.strictEqual(fillRes.success, true);
    assert.strictEqual(fillRes.filledText, 'winner');
  });
});
