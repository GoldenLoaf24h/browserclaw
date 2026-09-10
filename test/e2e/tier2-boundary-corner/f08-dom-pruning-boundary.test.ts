import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { E2ETestEnvironment } from '../fixtures/mock-server.ts';
import { createDeeplyNestedDOM } from '../fixtures/dom-samples.ts';

describe('Tier 2 - Feature 8: DOM Pruning Boundary Cases', () => {
  it('test_f08_deeply_nested_dom_100_levels: traverses and prunes 100 levels deep without stack overflow', () => {
    const env = new E2ETestEnvironment();
    const deepDOM = createDeeplyNestedDOM(100);

    const result = env.domEngine.pruneAndIndex(deepDOM);
    assert.strictEqual(result.interactiveCount, 1);
    assert.strictEqual(result.indexedElements[0].text, 'Deepest Button');
    assert.strictEqual(result.indexedElements[0].index, 1);
  });

  it('test_f08_ten_thousand_text_nodes: handles 1,000+ synthetic text nodes without performance degradation', () => {
    const env = new E2ETestEnvironment();
    const root = {
      tagName: 'div',
      attributes: {},
      rect: { x: 0, y: 0, width: 800, height: 600 },
      isVisible: true,
      isInteractive: false,
      children: Array.from({ length: 1500 }, (_, i) => ({
        tagName: 'span',
        text: `Item text ${i}`,
        attributes: {},
        rect: { x: 0, y: 0, width: 50, height: 15 },
        isVisible: true,
        isInteractive: false,
        children: [],
      })),
    };

    const start = Date.now();
    const result = env.domEngine.pruneAndIndex(root as any);
    const duration = Date.now() - start;

    assert.strictEqual(result.interactiveCount, 0); // All are non-interactive spans
    assert.ok(duration < 200, `Took ${duration}ms, expected < 200ms`);
  });

  it('test_f08_zero_visible_interactive_elements: page with static content returns empty interactive index', () => {
    const env = new E2ETestEnvironment();
    const staticDOM = {
      tagName: 'article',
      attributes: {},
      rect: { x: 0, y: 0, width: 800, height: 600 },
      isVisible: true,
      isInteractive: false,
      children: [
        { tagName: 'h1', text: 'Privacy Policy', attributes: {}, rect: { x: 0, y: 0, width: 400, height: 40 }, isVisible: true, isInteractive: false, children: [] },
        { tagName: 'p', text: 'We respect your privacy.', attributes: {}, rect: { x: 0, y: 50, width: 600, height: 30 }, isVisible: true, isInteractive: false, children: [] },
      ],
    };

    const result = env.domEngine.pruneAndIndex(staticDOM as any);
    assert.strictEqual(result.interactiveCount, 0);
    assert.strictEqual(result.indexedElements.length, 0);
    assert.strictEqual(Object.keys(result.indexMap).length, 0);
  });

  it('test_f08_svg_complex_paths_collapsed: complex SVG paths collapsed into single parent', () => {
    const env = new E2ETestEnvironment();
    const svgDOM = {
      tagName: 'button',
      attributes: { id: 'svg-icon-btn' },
      rect: { x: 10, y: 10, width: 40, height: 40 },
      isVisible: true,
      isInteractive: true,
      children: [
        {
          tagName: 'svg',
          attributes: { viewBox: '0 0 24 24' },
          rect: { x: 10, y: 10, width: 24, height: 24 },
          isVisible: true,
          isInteractive: false,
          children: Array.from({ length: 50 }, (_, i) => ({
            tagName: 'path',
            attributes: { d: `M ${i} ${i} L ${i + 10} ${i + 10}` },
            rect: { x: 10, y: 10, width: 10, height: 10 },
            isVisible: true,
            isInteractive: false,
            children: [],
          })),
        },
      ],
    };

    const result = env.domEngine.pruneAndIndex(svgDOM as any);
    // Button should be indexed once
    assert.strictEqual(result.interactiveCount, 1);
    assert.strictEqual(result.indexedElements[0].tagName, 'button');
  });

  it('test_f08_fixed_header_boundary_elements: fixed elements at exact 1000px boundary are correctly retained', () => {
    const env = new E2ETestEnvironment();
    const boundaryDOM = {
      tagName: 'body',
      attributes: {},
      rect: { x: 0, y: 0, width: 1280, height: 2000 },
      isVisible: true,
      isInteractive: false,
      children: [
        {
          tagName: 'button',
          text: 'Boundary Target',
          attributes: { id: 'btn-exact-1000' },
          rect: { x: 100, y: 1000, width: 120, height: 40 }, // y = exactly 1000
          isVisible: true,
          isInteractive: true,
          children: [],
        },
        {
          tagName: 'button',
          text: 'Out of View Target',
          attributes: { id: 'btn-out-1001' },
          rect: { x: 100, y: 1001, width: 120, height: 40 }, // y = 1001 (culled)
          isVisible: true,
          isInteractive: true,
          children: [],
        },
      ],
    };

    const result = env.domEngine.pruneAndIndex(boundaryDOM as any, 1000);
    assert.strictEqual(result.interactiveCount, 1);
    assert.strictEqual(result.indexedElements[0].text, 'Boundary Target');
  });
});
