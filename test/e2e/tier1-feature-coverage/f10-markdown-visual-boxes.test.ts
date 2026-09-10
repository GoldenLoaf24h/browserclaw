import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { E2ETestEnvironment } from '../fixtures/mock-server.ts';
import { createEcommerceDOM, createAdminPortalDOM } from '../fixtures/dom-samples.ts';

describe('Tier 1 - Feature 10: Structured Markdown & Visual Bounding Boxes', () => {
  it('test_f10_clean_markdown_extraction: extracts clean markdown representing page hierarchy', () => {
    const env = new E2ETestEnvironment();
    const markdown = env.domEngine.extractMarkdown(createAdminPortalDOM());

    assert.ok(markdown.includes('# Document Management Portal'));
    assert.ok(markdown.includes('[Button: Browse File...]'));
    assert.ok(markdown.includes('[Button: Upload & Submit]'));
  });

  it('test_f10_spa_state_blob_stripping: strips injected JSON state blobs and script tags from markdown', () => {
    const env = new E2ETestEnvironment();
    const markdown = env.domEngine.extractMarkdown(createEcommerceDOM());

    assert.strictEqual(markdown.includes('<script>'), false);
    assert.strictEqual(markdown.includes('analytics initialized'), false);
    assert.strictEqual(markdown.includes('<style>'), false);
  });

  it('test_f10_bounding_box_coordinates: computes accurate pixel bounding boxes for all indexed elements', () => {
    const env = new E2ETestEnvironment();
    env.domEngine.pruneAndIndex(createEcommerceDOM());
    const boxes = env.domEngine.getVisualBoundingBoxes();

    assert.ok(boxes.length > 0);
    for (const box of boxes) {
      assert.ok(box.index >= 1);
      assert.ok(['inside', 'above'].includes(box.badgePlacement));
      assert.strictEqual(typeof box.rect.x, 'number');
      assert.strictEqual(typeof box.rect.y, 'number');
      assert.strictEqual(typeof box.rect.width, 'number');
      assert.strictEqual(typeof box.rect.height, 'number');
    }
  });

  it('test_f10_overlay_injection_and_cleanup: badge positions avoid obscuring small interactive targets', () => {
    const env = new E2ETestEnvironment();
    env.domEngine.pruneAndIndex(createEcommerceDOM());
    const boxes = env.domEngine.getVisualBoundingBoxes();

    const smallBoxes = boxes.filter((b) => b.rect.width < 60 || b.rect.height < 30);
    for (const box of smallBoxes) {
      assert.strictEqual(
        box.badgePlacement,
        'above',
        `Badge for small element index ${box.index} should be positioned 'above'`
      );
    }
  });

  it('test_f10_empty_whitespace_omission: ignores whitespace-only paragraphs and redundant line breaks', () => {
    const env = new E2ETestEnvironment();
    const emptyParagraphsDOM = {
      tagName: 'body',
      attributes: {},
      rect: { x: 0, y: 0, width: 800, height: 600 },
      isVisible: true,
      isInteractive: false,
      children: [
        { tagName: 'h1', text: 'Valid Heading', attributes: {}, rect: { x: 0, y: 0, width: 100, height: 30 }, isVisible: true, isInteractive: false, children: [] },
        { tagName: 'p', text: '   \n\t  ', attributes: {}, rect: { x: 0, y: 40, width: 100, height: 20 }, isVisible: true, isInteractive: false, children: [] },
        { tagName: 'p', text: 'Valid paragraph text.', attributes: {}, rect: { x: 0, y: 70, width: 200, height: 20 }, isVisible: true, isInteractive: false, children: [] },
      ],
    };

    const markdown = env.domEngine.extractMarkdown(emptyParagraphsDOM);
    const paragraphs = markdown.split('\n\n').map((p) => p.trim()).filter(Boolean);
    assert.strictEqual(paragraphs.length, 2);
    assert.strictEqual(paragraphs[0], '# Valid Heading');
    assert.strictEqual(paragraphs[1], 'Valid paragraph text.');
  });
});
