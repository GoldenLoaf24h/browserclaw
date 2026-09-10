import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { E2ETestEnvironment } from '../fixtures/mock-server.ts';
import { createEcommerceDOM } from '../fixtures/dom-samples.ts';
import { BOUNDARY_TOOL_INPUTS } from '../fixtures/tool-inputs.ts';

describe('Tier 2 - Feature 9: Batch Actions Pipeline Boundary Cases', () => {
  it('test_f09_empty_action_array: submitting empty batch array returns success with 0 completed', async () => {
    const env = new E2ETestEnvironment();
    const result = await env.batchPipeline.executeBatch(BOUNDARY_TOOL_INPUTS.batchActions.empty.actions);

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.completedActions, 0);
    assert.strictEqual(result.totalActions, 0);
    assert.strictEqual(result.results.length, 0);
  });

  it('test_f09_oversized_batch_100_actions: executes large batch without exceeding stack or memory', async () => {
    const env = new E2ETestEnvironment();
    const actions = BOUNDARY_TOOL_INPUTS.batchActions.hugeCount.actions as any[];

    const result = await env.batchPipeline.executeBatch(actions);
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.completedActions, 100);
    assert.strictEqual(result.totalActions, 100);
  });

  it('test_f09_invalid_action_type_in_array: fails fast on unsupported action type', async () => {
    const env = new E2ETestEnvironment();
    env.domEngine.pruneAndIndex(createEcommerceDOM());

    const result = await env.batchPipeline.executeBatch([
      { type: 'click', index: 1 },
      { type: 'explode', index: 2 } as any,
      { type: 'click', index: 3 },
    ]);

    assert.strictEqual(result.success, false);
    assert.strictEqual(result.completedActions, 1);
    assert.ok(result.interruptedReason?.includes("Unsupported batch action type 'explode'"));
    assert.strictEqual(result.results.length, 2);
  });

  it('test_f09_detached_target_mid_batch: element detached before step 2 halts batch execution', async () => {
    const env = new E2ETestEnvironment();
    env.domEngine.pruneAndIndex(createEcommerceDOM());

    // Execute first step, then simulate deletion
    const actions: any[] = [
      { type: 'click', index: 1 },
      { type: 'click', index: 999 }, // missing element
    ];

    const result = await env.batchPipeline.executeBatch(actions);
    assert.strictEqual(result.success, false);
    assert.strictEqual(result.completedActions, 1);
    assert.ok(result.interruptedReason?.includes('not found'));
  });

  it('test_f09_zero_duration_wait_action: wait with durationMs: 0 yields immediately', async () => {
    const env = new E2ETestEnvironment();
    const start = Date.now();

    const result = await env.batchPipeline.executeBatch(
      BOUNDARY_TOOL_INPUTS.batchActions.zeroWait.actions as any[]
    );

    const elapsed = Date.now() - start;
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.completedActions, 1);
    assert.ok(elapsed < 100, `Wait 0ms took ${elapsed}ms, should be immediate`);
  });
});
