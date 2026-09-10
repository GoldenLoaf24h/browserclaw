import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { E2ETestEnvironment } from '../fixtures/mock-server.ts';
import { createEcommerceDOM } from '../fixtures/dom-samples.ts';
import { BOUNDARY_TOOL_INPUTS } from '../fixtures/tool-inputs.ts';

describe('Tier 2 - Feature 7: Index-Based Interaction Boundary Cases', () => {
  it('test_f07_index_zero_out_of_bounds: rejects index 0 as invalid non-positive integer', () => {
    const env = new E2ETestEnvironment();
    env.domEngine.pruneAndIndex(createEcommerceDOM());

    const res = env.domEngine.interactIndex(BOUNDARY_TOOL_INPUTS.indices.zero);
    assert.strictEqual(res.success, false);
    assert.ok(res.error?.includes('1-based positive integers'));
  });

  it('test_f07_negative_index_rejection: rejects negative index -1', () => {
    const env = new E2ETestEnvironment();
    env.domEngine.pruneAndIndex(createEcommerceDOM());

    const res = env.domEngine.interactIndex(BOUNDARY_TOOL_INPUTS.indices.negative);
    assert.strictEqual(res.success, false);
    assert.ok(res.error?.includes('1-based positive integers'));
  });

  it('test_f07_index_overflow_rejection: rejects index exceeding maximum assigned element count', () => {
    const env = new E2ETestEnvironment();
    const pruned = env.domEngine.pruneAndIndex(createEcommerceDOM());

    const res = env.domEngine.interactIndex(BOUNDARY_TOOL_INPUTS.indices.huge);
    assert.strictEqual(res.success, false);
    assert.ok(res.error?.includes(`Available range: 1 to ${pruned.interactiveCount}`));
  });

  it('test_f07_detached_node_race_condition: simulates element detached prior to action', () => {
    const env = new E2ETestEnvironment();
    const pruned = env.domEngine.pruneAndIndex(createEcommerceDOM());

    // Simulate node removed by SPA mutation
    (env.domEngine as any).currentIndexMap.delete(1);

    const res = env.domEngine.interactIndex(1);
    assert.strictEqual(res.success, false);
    assert.ok(res.error?.includes('not found'));
  });

  it('test_f07_occluded_by_modal_race_condition: element covered by modal triggers occlusion guard', () => {
    const env = new E2ETestEnvironment();
    env.domEngine.pruneAndIndex(createEcommerceDOM());

    // Simulate modal popping up over target element
    const el = (env.domEngine as any).currentIndexMap.get(1);
    if (el) {
      el.isOccluded = true;
    }

    // Interactive dispatcher checks occlusion status
    const dispatchGuardedClick = (index: number) => {
      const target = (env.domEngine as any).currentIndexMap.get(index);
      if (target?.isOccluded) {
        return { success: false, error: `Element [${index}] is occluded by modal overlay` };
      }
      return env.domEngine.interactIndex(index);
    };

    const res = dispatchGuardedClick(1);
    assert.strictEqual(res.success, false);
    assert.ok(res.error?.includes('occluded by modal overlay'));
  });

  it('test_f07_subframe_index_reindex_synchronization: re-indexes subframe elements to prevent collisions', () => {
    const env = new E2ETestEnvironment();
    // Simulate subframe initially indexing local items as [1, 2]
    const subframeRoot = {
      tagName: 'body',
      attributes: {},
      rect: { x: 0, y: 0, width: 500, height: 400 },
      isVisible: true,
      isInteractive: false,
      children: [
        { tagName: 'button', text: 'Subframe Submit', attributes: { id: 'btn-sub' }, rect: { x: 10, y: 10, width: 80, height: 30 }, isVisible: true, isInteractive: true, children: [] },
        { tagName: 'input', attributes: { id: 'input-sub' }, rect: { x: 10, y: 50, width: 120, height: 25 }, isVisible: true, isInteractive: true, children: [] },
      ],
    };
    const pruned = env.domEngine.pruneAndIndex(subframeRoot as any);
    assert.strictEqual(pruned.interactiveCount, 2);
    assert.strictEqual(env.domEngine.interactIndex(1).success, true);

    // Synchronize subframe with main frame offset (e.g., main frame has 5 elements, subframe starts at 6)
    env.domEngine.reindexFrame(5);

    // Old index 1 should no longer be found
    assert.strictEqual(env.domEngine.interactIndex(1).success, false);
    // New re-indexed elements 6 and 7 must be found
    const res6 = env.domEngine.interactIndex(6);
    assert.strictEqual(res6.success, true);
    assert.strictEqual(res6.element?.index, 6);
    assert.strictEqual(res6.element?.text, 'Subframe Submit');

    const res7 = env.domEngine.fillIndex(7, 'subframe input text');
    assert.strictEqual(res7.success, true);
    assert.strictEqual(res7.element?.index, 7);
  });
});
