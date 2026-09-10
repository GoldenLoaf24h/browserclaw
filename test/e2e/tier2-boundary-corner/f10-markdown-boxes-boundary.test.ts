import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { E2ETestEnvironment } from '../fixtures/mock-server.ts';

describe('Tier 2 - Feature 10: Markdown & Visual Boxes Boundary Cases', () => {
  it('test_f10_empty_body_document: document with empty body returns empty markdown without error', () => {
    const env = new E2ETestEnvironment();
    const emptyDOM = {
      tagName: 'html',
      attributes: {},
      rect: { x: 0, y: 0, width: 800, height: 600 },
      isVisible: true,
      isInteractive: false,
      children: [
        { tagName: 'head', attributes: {}, rect: { x: 0, y: 0, width: 0, height: 0 }, isVisible: false, isInteractive: false, children: [] },
        { tagName: 'body', attributes: {}, rect: { x: 0, y: 0, width: 800, height: 600 }, isVisible: true, isInteractive: false, children: [] },
      ],
    };

    const markdown = env.domEngine.extractMarkdown(emptyDOM as any);
    assert.strictEqual(markdown.trim(), '');
  });

  it('test_f10_xss_script_injection_in_dom: malicious scripts and onerror handlers completely stripped', () => {
    const env = new E2ETestEnvironment();
    const xssDOM = {
      tagName: 'body',
      attributes: {},
      rect: { x: 0, y: 0, width: 800, height: 600 },
      isVisible: true,
      isInteractive: false,
      children: [
        { tagName: 'script', text: 'alert("xss")', attributes: {}, rect: { x: 0, y: 0, width: 0, height: 0 }, isVisible: false, isInteractive: false, children: [] },
        { tagName: 'h1', text: 'Safe Title', attributes: { onerror: 'alert(1)' }, rect: { x: 0, y: 0, width: 100, height: 30 }, isVisible: true, isInteractive: false, children: [] },
        { tagName: 'p', text: 'Normal text content', attributes: {}, rect: { x: 0, y: 35, width: 200, height: 20 }, isVisible: true, isInteractive: false, children: [] },
      ],
    };

    const markdown = env.domEngine.extractMarkdown(xssDOM as any);
    assert.ok(markdown.includes('# Safe Title'));
    assert.ok(markdown.includes('Normal text content'));
    assert.strictEqual(markdown.includes('alert("xss")'), false);
    assert.strictEqual(markdown.includes('<script>'), false);
  });

  it('test_f10_negative_viewport_coordinates: clamped properly without crashing', () => {
    const env = new E2ETestEnvironment();
    const negativeCoordDOM = {
      tagName: 'body',
      attributes: {},
      rect: { x: 0, y: 0, width: 1280, height: 800 },
      isVisible: true,
      isInteractive: false,
      children: [
        {
          tagName: 'button',
          text: 'Scrolled Off Left',
          attributes: { id: 'btn-negative' },
          rect: { x: -150, y: -20, width: 100, height: 35 },
          isVisible: true,
          isInteractive: true,
          children: [],
        },
      ],
    };

    const result = env.domEngine.pruneAndIndex(negativeCoordDOM as any);
    assert.strictEqual(result.interactiveCount, 1);
    const boxes = env.domEngine.getVisualBoundingBoxes();
    assert.strictEqual(boxes.length, 1);
    assert.strictEqual(boxes[0].rect.x, -150);
  });

  it('test_f10_bounding_box_fullscreen: verifies bounding box computation in 4K resolution layout', () => {
    const env = new E2ETestEnvironment();
    const ultraHdDOM = {
      tagName: 'body',
      attributes: {},
      rect: { x: 0, y: 0, width: 3840, height: 2160 },
      isVisible: true,
      isInteractive: false,
      children: [
        {
          tagName: 'button',
          text: 'Corner Action',
          attributes: { id: 'btn-corner' },
          rect: { x: 3700, y: 2050, width: 120, height: 50 },
          isVisible: true,
          isInteractive: true,
          children: [],
        },
      ],
    };

    env.domEngine.pruneAndIndex(ultraHdDOM as any, 3000);
    const boxes = env.domEngine.getVisualBoundingBoxes();
    assert.strictEqual(boxes.length, 1);
    assert.strictEqual(boxes[0].rect.x, 3700);
    assert.strictEqual(boxes[0].rect.y, 2050);
  });

  it('test_f10_nested_overflow_scroll_containers: handles element inside scroll container', () => {
    const env = new E2ETestEnvironment();
    const scrollableDOM = {
      tagName: 'div',
      attributes: { class: 'scroll-pane', style: 'overflow-y: scroll;' },
      rect: { x: 50, y: 50, width: 400, height: 300 },
      isVisible: true,
      isInteractive: false,
      children: [
        {
          tagName: 'button',
          text: 'Action Inside Container',
          attributes: { id: 'btn-pane' },
          rect: { x: 70, y: 80, width: 140, height: 35 },
          isVisible: true,
          isInteractive: true,
          children: [],
        },
      ],
    };

    const result = env.domEngine.pruneAndIndex(scrollableDOM as any);
    assert.strictEqual(result.interactiveCount, 1);
    assert.strictEqual(result.indexedElements[0].text, 'Action Inside Container');
  });

  it('test_f10_table_and_image_markdown_extraction: preserves table structure and image attributes', () => {
    const env = new E2ETestEnvironment();
    const tableAndImageDOM = {
      tagName: 'body',
      attributes: {},
      rect: { x: 0, y: 0, width: 800, height: 600 },
      isVisible: true,
      isInteractive: false,
      children: [
        {
          tagName: 'img',
          attributes: { src: 'https://example.com/logo.png', alt: 'Company Logo' },
          rect: { x: 10, y: 10, width: 100, height: 50 },
          isVisible: true,
          isInteractive: false,
          children: [],
        },
        {
          tagName: 'table',
          attributes: {},
          rect: { x: 10, y: 70, width: 400, height: 200 },
          isVisible: true,
          isInteractive: false,
          children: [
            {
              tagName: 'tr',
              attributes: {},
              rect: { x: 10, y: 70, width: 400, height: 30 },
              isVisible: true,
              isInteractive: false,
              children: [
                { tagName: 'th', text: 'Item', attributes: {}, rect: { x: 10, y: 70, width: 200, height: 30 }, isVisible: true, isInteractive: false, children: [] },
                { tagName: 'th', text: 'Price', attributes: {}, rect: { x: 210, y: 70, width: 200, height: 30 }, isVisible: true, isInteractive: false, children: [] },
              ],
            },
            {
              tagName: 'tr',
              attributes: {},
              rect: { x: 10, y: 100, width: 400, height: 30 },
              isVisible: true,
              isInteractive: false,
              children: [
                { tagName: 'td', text: 'Coffee', attributes: {}, rect: { x: 10, y: 100, width: 200, height: 30 }, isVisible: true, isInteractive: false, children: [] },
                { tagName: 'td', text: '$4.50', attributes: {}, rect: { x: 210, y: 100, width: 200, height: 30 }, isVisible: true, isInteractive: false, children: [] },
              ],
            },
          ],
        },
      ],
    };

    const markdown = env.domEngine.extractMarkdown(tableAndImageDOM as any);
    assert.ok(markdown.includes('![Company Logo](https://example.com/logo.png)'));
    assert.ok(markdown.includes('| Item | Price |'));
    assert.ok(markdown.includes('| --- | --- |'));
    assert.ok(markdown.includes('| Coffee | $4.50 |'));
  });
});
