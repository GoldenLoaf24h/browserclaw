import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { E2ETestEnvironment } from '../fixtures/mock-server.ts';
import { createEcommerceDOM } from '../fixtures/dom-samples.ts';

describe('Tier 1 - Feature 7: Index-Based Element Interaction', () => {
  it('test_f07_compact_index_assignment: interactive elements receive sequential 1-based indices', () => {
    const env = new E2ETestEnvironment();
    const result = env.domEngine.pruneAndIndex(createEcommerceDOM());

    assert.ok(result.interactiveCount > 0);
    assert.strictEqual(result.indexedElements[0].index, 1);

    for (let i = 0; i < result.indexedElements.length; i++) {
      assert.strictEqual(
        result.indexedElements[i].index,
        i + 1,
        `Index at position ${i} should be strictly 1-based sequential (${i + 1})`
      );
    }
  });

  it('test_f07_interact_index_click: dispatches click event to element specified by index', async () => {
    const env = new E2ETestEnvironment();
    env.domEngine.pruneAndIndex(createEcommerceDOM());

    const clickRes = env.domEngine.interactIndex(1);
    assert.strictEqual(clickRes.success, true);
    assert.ok(clickRes.element);
    assert.strictEqual(clickRes.element.index, 1);
  });

  it('test_f07_fill_index_text: updates target element value with provided text', async () => {
    const env = new E2ETestEnvironment();
    const result = env.domEngine.pruneAndIndex(createEcommerceDOM());

    // Locate an input element index
    const inputElem = result.indexedElements.find((el) => el.tagName === 'input');
    assert.ok(inputElem, 'Should find an input element in ecommerce DOM');

    const fillRes = env.domEngine.fillIndex(inputElem.index, 'wireless headphones');
    assert.strictEqual(fillRes.success, true);
    assert.strictEqual(fillRes.filledText, 'wireless headphones');
    assert.strictEqual(fillRes.element?.attributes.value, 'wireless headphones');
  });

  it('test_f07_out_of_bounds_index_error: returns structured error when index is outside valid range', async () => {
    const env = new E2ETestEnvironment();
    const result = env.domEngine.pruneAndIndex(createEcommerceDOM());

    const outOfBoundsIndex = result.interactiveCount + 100;
    const clickRes = env.domEngine.interactIndex(outOfBoundsIndex);
    assert.strictEqual(clickRes.success, false);
    assert.ok(clickRes.error?.includes(`Available range: 1 to ${result.interactiveCount}`));

    const zeroRes = env.domEngine.interactIndex(0);
    assert.strictEqual(zeroRes.success, false);
    assert.ok(zeroRes.error?.includes('1-based positive integers'));
  });

  it('test_f07_index_map_integrity: index map accurately associates numbers with backend node IDs and selectors', () => {
    const env = new E2ETestEnvironment();
    const result = env.domEngine.pruneAndIndex(createEcommerceDOM());

    assert.strictEqual(Object.keys(result.indexMap).length, result.interactiveCount);

    for (const [indexStr, info] of Object.entries(result.indexMap)) {
      const idx = Number(indexStr);
      assert.ok(idx >= 1 && idx <= result.interactiveCount);
      assert.ok(info.tagName, `Index ${idx} must have tagName`);
      assert.ok(info.backendNodeId, `Index ${idx} must have backendNodeId`);
      assert.ok(info.selector, `Index ${idx} must have selector`);
    }
  });
});
