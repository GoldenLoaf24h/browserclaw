import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { E2ETestEnvironment } from '../fixtures/mock-server.ts';
import { createEcommerceDOM } from '../fixtures/dom-samples.ts';
import { VALID_TOOL_INPUTS } from '../fixtures/tool-inputs.ts';

describe('Tier 1 - Feature 9: Batch Action Execution Pipeline', () => {
  it('test_f09_sequential_action_execution: executes compound action sequence in exact order', async () => {
    const env = new E2ETestEnvironment();
    env.domEngine.pruneAndIndex(createEcommerceDOM());

    const result = await env.batchPipeline.executeBatch([
      { type: 'fill', index: 1, text: 'laptop stand' },
      { type: 'wait', durationMs: 10 },
      { type: 'click', index: 2 },
    ]);

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.completedActions, 3);
    assert.strictEqual(result.totalActions, 3);
    assert.strictEqual(result.results[0].output?.filledValue, 'laptop stand');
    assert.strictEqual(result.results[1].output?.waitedMs, 10);
    assert.ok(result.results[2].output?.clickedElement);
  });

  it('test_f09_detailed_results_reporting: returns completedActions, totalActions, and per-action results', async () => {
    const env = new E2ETestEnvironment();
    env.domEngine.pruneAndIndex(createEcommerceDOM());

    const result = await env.batchPipeline.executeBatch([
      { type: 'hover', index: 1 },
      { type: 'click', index: 1 },
    ]);

    assert.strictEqual(result.completedActions, 2);
    assert.strictEqual(result.totalActions, 2);
    assert.strictEqual(result.results.length, 2);
    assert.strictEqual(result.results[0].actionIndex, 0);
    assert.strictEqual(result.results[0].success, true);
    assert.strictEqual(result.results[1].actionIndex, 1);
    assert.strictEqual(result.results[1].success, true);
  });

  it('test_f09_fail_fast_interruption: aborts on first failing action and outputs explicit interruptedReason', async () => {
    const env = new E2ETestEnvironment();
    env.domEngine.pruneAndIndex(createEcommerceDOM());

    const result = await env.batchPipeline.executeBatch([
      { type: 'click', index: 1 },
      { type: 'click', index: 9999 }, // Out of bounds, will fail
      { type: 'fill', index: 1, text: 'should not run' },
    ]);

    assert.strictEqual(result.success, false);
    assert.strictEqual(result.completedActions, 1);
    assert.strictEqual(result.totalActions, 3);
    assert.ok(result.interruptedReason?.includes('not found'));
    assert.strictEqual(result.results.length, 2); // 1 passed + 1 failed
    assert.strictEqual(result.results[1].success, false);
  });

  it('test_f09_duration_delay_execution: honors durationMs wait between actions', async () => {
    const env = new E2ETestEnvironment();
    const start = Date.now();

    const result = await env.batchPipeline.executeBatch([
      { type: 'wait', durationMs: 30 },
    ]);

    const elapsed = Date.now() - start;
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.completedActions, 1);
    assert.ok(elapsed >= 15, `Elapsed time ${elapsed}ms should reflect wait delay`);
  });

  it('test_f09_runtime_page_drift_guard: aborts remaining action steps when navigation drift is simulated', async () => {
    const env = new E2ETestEnvironment();
    env.domEngine.pruneAndIndex(createEcommerceDOM());

    const result = await env.batchPipeline.executeBatch(
      [
        { type: 'click', index: 1 },
        { type: 'wait', durationMs: 10 },
        { type: 'fill', index: 2, text: 'stale target' },
      ],
      { simulateNavigationAtStep: 2 } // Navigation triggers before step 2 (fill)
    );

    assert.strictEqual(result.success, false);
    assert.strictEqual(result.completedActions, 2);
    assert.ok(result.interruptedReason?.includes('navigation/URL drift detected'));
  });
});
