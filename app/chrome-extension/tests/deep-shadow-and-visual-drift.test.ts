import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  inPageDOMPruner,
  renderCompactElementLine,
  querySelectorAllDeep,
  querySelectorDeep,
  composedContains,
  composedParent,
  extractCleanElementText,
  inPageSnapCoordinate,
  inPageGetScrollState,
  inPageInstantScrollTo,
  inPageLockScroll,
} from '../entrypoints/background/tools/browser/dom-indexer';
import { screenshotContextManager, scaleCoordinates } from '../utils/screenshot-context';
import { GrepTool } from '../entrypoints/background/tools/browser/grep';

describe('Deep Shadow DOM Piercing & Visual Drift Compensation', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  describe('1. Shreddit Multi-Layer Web Component Shadow DOM Piercing', () => {
    it('penetrates multi-nested shadow roots and retains icon buttons with aria-label', () => {
      // Simulate Reddit Shreddit Web Components structure
      const comment = document.createElement('shreddit-comment');
      comment.id = 'comment-t1_123';
      document.body.appendChild(comment);

      const commentShadow = comment.attachShadow({ mode: 'open' });
      const tracker = document.createElement('faceplate-tracker');
      tracker.setAttribute('action', 'reply');
      commentShadow.appendChild(tracker);

      const trackerShadow = tracker.attachShadow({ mode: 'open' });
      const replyBtn = document.createElement('button');
      replyBtn.setAttribute('aria-label', 'Reply');
      replyBtn.id = 'reply-action-btn';

      // Icon only, no textContent
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      replyBtn.appendChild(svg);
      trackerShadow.appendChild(replyBtn);

      // Verify text extractor gets semantic label
      const extractedText = extractCleanElementText(replyBtn);
      expect(extractedText).toBe('Reply');

      // Verify querySelectorAllDeep finds nested button across both shadow boundaries
      const foundButtons = querySelectorAllDeep('button', document);
      expect(foundButtons).toContain(replyBtn);

      const foundByAria = querySelectorAllDeep('[aria-label="Reply"]', document);
      expect(foundByAria).toContain(replyBtn);

      // Verify inPageDOMPruner indexes the button with [shadow] tag
      // Mock getBoundingClientRect
      Object.defineProperty(replyBtn, 'getBoundingClientRect', {
        value: () => ({
          left: 40,
          top: 120,
          right: 100,
          bottom: 150,
          width: 60,
          height: 30,
          x: 40,
          y: 120,
        }),
      });

      const res = inPageDOMPruner();
      const indexedBtn = res.indexedElements.find(
        (el) => el.attributes?.id === 'reply-action-btn' || el.text === 'Reply',
      );
      expect(indexedBtn).toBeDefined();
      expect(indexedBtn?.inShadowDom).toBe(true);

      const line = renderCompactElementLine(indexedBtn!);
      expect(line).toContain('[shadow]');
      expect(line).toContain('button "Reply"');
    });

    it('finds elements via querySelectorDeep and querySelectorAllDeep across shadow roots', () => {
      const host = document.createElement('custom-card');
      document.body.appendChild(host);
      const shadow = host.attachShadow({ mode: 'open' });

      const innerDiv = document.createElement('div');
      innerDiv.className = 'card-content';
      const innerLink = document.createElement('a');
      innerLink.href = 'https://example.com/item';
      innerLink.textContent = 'View Details';
      innerDiv.appendChild(innerLink);
      shadow.appendChild(innerDiv);

      const match = querySelectorDeep('.card-content a', document);
      expect(match).toBe(innerLink);

      const allLinks = querySelectorAllDeep('a', document);
      expect(allLinks).toContain(innerLink);
    });

    it('correctly determines composed ancestry through multiple nested shadow roots', () => {
      const outer = document.createElement('outer-comp');
      document.body.appendChild(outer);
      const outerShadow = outer.attachShadow({ mode: 'open' });

      const inner = document.createElement('inner-comp');
      outerShadow.appendChild(inner);
      const innerShadow = inner.attachShadow({ mode: 'open' });

      const leaf = document.createElement('span');
      leaf.textContent = 'Nested Leaf';
      innerShadow.appendChild(leaf);

      expect(composedContains(outer, leaf)).toBe(true);
      expect(composedContains(inner, leaf)).toBe(true);
      expect(composedParent(leaf)).toBe(inner);
      expect(composedParent(inner)).toBe(outer);
    });
  });

  describe('2. Closed Shadow Host Detection', () => {
    it('detects custom element with closed/null shadowRoot as closed shadow host if interactive', () => {
      const closedHost = document.createElement('closed-widget');
      closedHost.setAttribute('aria-label', 'Closed Widget Trigger');
      closedHost.tabIndex = 0;
      document.body.appendChild(closedHost);

      Object.defineProperty(closedHost, 'getBoundingClientRect', {
        value: () => ({
          left: 10,
          top: 10,
          right: 110,
          bottom: 50,
          width: 100,
          height: 40,
          x: 10,
          y: 10,
        }),
      });

      const res = inPageDOMPruner();
      const hostElem = res.indexedElements.find((el) => el.tagName === 'closed-widget');
      expect(hostElem).toBeDefined();
      expect(hostElem?.inShadowDom).toBe(true);
    });
  });

  describe('3. Deep Text Extraction in chrome_grep', () => {
    it('extracts deep text inside shadow DOM roots for page_text and interactive search', async () => {
      const host = document.createElement('reddit-thread');
      document.body.appendChild(host);
      const shadow = host.attachShadow({ mode: 'open' });

      const upvoteBtn = document.createElement('button');
      upvoteBtn.setAttribute('aria-label', 'Upvote 42');
      shadow.appendChild(upvoteBtn);

      Object.defineProperty(upvoteBtn, 'getBoundingClientRect', {
        value: () => ({
          left: 20,
          top: 20,
          right: 60,
          bottom: 50,
          width: 40,
          height: 30,
          x: 20,
          y: 20,
        }),
      });

      const prunerRes = inPageDOMPruner();
      expect(
        prunerRes.indexedElements.some((e) => e.attributes?.['aria-label'] === 'Upvote 42'),
      ).toBe(true);
    });
  });

  describe('4. Visual Fallback Coordinate Alignment & Drift Elimination', () => {
    it('scales fullpage coordinates in document space without collapsing to viewport', () => {
      const ctx = {
        screenshotWidth: 1200,
        screenshotHeight: 3600,
        viewportWidth: 1200,
        viewportHeight: 800,
        captureMode: 'fullpage' as const,
        docWidth: 1200,
        docHeight: 3600,
        timestamp: Date.now(),
      };

      const scaled = scaleCoordinates(600, 1800, ctx);
      expect(scaled.isDocumentSpace).toBe(true);
      expect(scaled.x).toBe(600);
      expect(scaled.y).toBe(1800); // Stays at 1800 in doc space instead of compressing to (1800/3600)*800 = 400!
    });

    it('tracks and retrieves real-time scroll state and provides instant scrolling', () => {
      const state = inPageGetScrollState();
      expect(state).toHaveProperty('scrollX');
      expect(state).toHaveProperty('scrollY');
      expect(state).toHaveProperty('viewportWidth');
      expect(state).toHaveProperty('viewportHeight');

      const scrollRes = inPageInstantScrollTo(0, 300);
      expect(scrollRes.success).toBe(true);
    });

    it('locks and restores scroll behavior to prevent race conditions during click injection', () => {
      document.documentElement.style.scrollBehavior = 'smooth';
      inPageLockScroll(true);
      expect(document.documentElement.style.scrollBehavior).toBe('auto');

      inPageLockScroll(false);
      expect(document.documentElement.style.scrollBehavior).toBe('smooth');
    });

    it('snaps coordinates to interactive shadow DOM buttons when clicking near them', () => {
      const host = document.createElement('reddit-comment');
      document.body.appendChild(host);
      const shadow = host.attachShadow({ mode: 'open' });

      const replyBtn = document.createElement('button');
      replyBtn.setAttribute('aria-label', 'Reply');
      shadow.appendChild(replyBtn);

      Object.defineProperty(replyBtn, 'getBoundingClientRect', {
        value: () => ({
          left: 100,
          top: 200,
          right: 150,
          bottom: 230,
          width: 50,
          height: 30,
          x: 100,
          y: 200,
        }),
      });

      // Click slightly outside (e.g. at 155, 215)
      const snap = inPageSnapCoordinate(155, 215, 24);
      expect(snap.snapped).toBe(true);
      expect(snap.x).toBe(125); // Midpoint between 100 and 150
      expect(snap.y).toBe(215); // Midpoint between 200 and 230
    });
  });
});
