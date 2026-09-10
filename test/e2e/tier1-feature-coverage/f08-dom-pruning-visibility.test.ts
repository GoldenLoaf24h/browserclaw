import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { E2ETestEnvironment } from '../fixtures/mock-server.ts';
import {
  createEcommerceDOM,
  create1500NodeFeedDOM,
  countTotalNodes,
} from '../fixtures/dom-samples.ts';
import { validateDOMCompression } from '../fixtures/oracle-evaluators.ts';

describe('Tier 1 - Feature 8: DOM Pruning & Visibility Filtering', () => {
  it('test_f08_non_content_tags_stripped: stage 1-2 drops script, style, head, and meta tags', () => {
    const env = new E2ETestEnvironment();
    const result = env.domEngine.pruneAndIndex(createEcommerceDOM());

    const hasForbiddenTags = result.indexedElements.some((el) =>
      ['script', 'style', 'head', 'meta', 'link', 'title'].includes(el.tagName.toLowerCase())
    );
    assert.strictEqual(hasForbiddenTags, false, 'Non-content tags should be pruned');
  });

  it('test_f08_zero_dimension_filtering: zero-width/height invisible elements are excluded', () => {
    const env = new E2ETestEnvironment();
    const result = env.domEngine.pruneAndIndex(createEcommerceDOM());

    for (const el of result.indexedElements) {
      const hasZeroArea = el.rect.width === 0 && el.rect.height === 0;
      assert.strictEqual(
        hasZeroArea && !el.isVisible,
        false,
        `Zero-dimension invisible element ${el.tagName} should not be indexed`
      );
    }
  });

  it('test_f08_viewport_boundary_culling: elements located >1000px beyond viewport are pruned', () => {
    const env = new E2ETestEnvironment();
    const result = env.domEngine.pruneAndIndex(createEcommerceDOM(), 1000);

    for (const el of result.indexedElements) {
      assert.ok(
        el.rect.y <= 1000,
        `Element ${el.tagName} at y=${el.rect.y} exceeds viewport threshold 1000px`
      );
    }
  });

  it('test_f08_hierarchical_occlusion_culling: elements occluded by overlay are culled', () => {
    const env = new E2ETestEnvironment();
    const result = env.domEngine.pruneAndIndex(create1500NodeFeedDOM());

    // In create1500NodeFeedDOM, items behind the modal overlay have isOccluded = true
    for (const el of result.indexedElements) {
      assert.strictEqual(
        (el as any).isOccluded,
        undefined,
        `Occluded element ${el.tagName} was not culled`
      );
    }
  });

  it('test_f08_token_reduction_ratio: achieves >= 85% compression ratio on 1000+ node DOM', () => {
    const env = new E2ETestEnvironment();
    const dom = create1500NodeFeedDOM();
    const totalOriginalNodes = countTotalNodes(dom);
    assert.ok(totalOriginalNodes >= 1000, `DOM should have at least 1000 nodes, got ${totalOriginalNodes}`);

    const result = env.domEngine.pruneAndIndex(dom, 1000);
    const evaluation = validateDOMCompression(totalOriginalNodes, result.elementCount);

    assert.ok(
      evaluation.passesCriterion,
      `Compression ratio ${(evaluation.compressionRatio * 100).toFixed(2)}% did not meet >= 85% requirement`
    );
    assert.ok(result.interactiveCount > 0, 'Must preserve visible interactive elements');
  });
});
