import { describe, it, expect, beforeEach } from 'vitest';
import {
  findIndexedElement,
  getIsolatedIndexMap,
  getIndexFingerprintMap,
  renderCompactElementLine,
  inPageDOMPruner,
  type IndexedElement,
} from '../entrypoints/background/tools/browser/dom-indexer';

describe('DOM Self-Healing & Visual Shape Decoding', () => {
  beforeEach(() => {
    getIsolatedIndexMap().clear();
    getIndexFingerprintMap().clear();
    document.body.innerHTML = '';
  });

  it('self-heals an element reference when React re-renders and replaces the DOM node', () => {
    const prevRect = Element.prototype.getBoundingClientRect;
    Element.prototype.getBoundingClientRect = function () {
      return {
        x: 10,
        y: 10,
        left: 10,
        top: 10,
        right: 110,
        bottom: 60,
        width: 100,
        height: 50,
        toJSON: () => ({}),
      } as DOMRect;
    };

    try {
      // 1. Initial render: button with id "submit-btn"
      const oldBtn = document.createElement('button');
      oldBtn.id = 'submit-btn';
      oldBtn.innerText = 'Submit';
      document.body.appendChild(oldBtn);

      // Prune and index
      inPageDOMPruner();
      const isolatedMap = getIsolatedIndexMap();
      expect(isolatedMap.size).toBeGreaterThan(0);

      // Find assigned index for submit-btn
      let targetIndex = 0;
      for (const [idx, ref] of isolatedMap.entries()) {
        const el = ref?.deref ? ref.deref() : ref;
        if (el?.id === 'submit-btn') {
          targetIndex = idx;
          break;
        }
      }
      expect(targetIndex).toBeGreaterThan(0);
      expect(findIndexedElement(targetIndex)).toBe(oldBtn);

      // 2. Simulate React component re-render: oldBtn is destroyed, newBtn is created
      oldBtn.remove();
      const newBtn = document.createElement('button');
      newBtn.id = 'submit-btn';
      newBtn.innerText = 'Submit (Updated)';
      document.body.appendChild(newBtn);

      // 3. Old element in isolatedMap is disconnected (oldBtn.isConnected === false)
      // findIndexedElement must detect disconnection and self-heal to newBtn!
      const healed = findIndexedElement(targetIndex);
      expect(healed).not.toBeNull();
      expect(healed).toBe(newBtn);
      expect(healed?.innerText).toBe('Submit (Updated)');
    } finally {
      Element.prototype.getBoundingClientRect = prevRect;
    }
  });

  it('decodes visual geometric shapes from transformed CSS styling in compact tree lines', () => {
    const el: IndexedElement = {
      index: 12,
      tagName: 'button',
      text: 'ACTION',
      attributes: {
        id: 'btn-1',
        'visual-shape': 'diamond',
      },
      rect: { x: 0, y: 0, width: 50, height: 50 },
    };

    const line = renderCompactElementLine(el);
    expect(line).toContain('[12] button "ACTION" #btn-1');
    expect(line).toContain('shape="diamond"');
  });

  it('automatically normalizes physical device coordinates from high-DPI Windows screens', async () => {
    const { parseUnifiedCoordinate } = await import('../utils/coordinate-parser');
    const { screenshotContextManager } = await import('../utils/screenshot-context');

    const testTabId = 9988;
    // Set up a high-DPI context: CSS viewport is 1280x800, but devicePixelRatio is 1.5 (physical: 1920x1200)
    screenshotContextManager.setContext(testTabId, {
      screenshotWidth: 1280,
      screenshotHeight: 800,
      viewportWidth: 1280,
      viewportHeight: 800,
      devicePixelRatio: 1.5,
    });

    // Vision model sent physical coordinate x: 1500 (which exceeds CSS viewport 1280, but within physical 1920)
    const parsed = parseUnifiedCoordinate({ x: 1500, y: 600 }, { tabId: testTabId });
    expect(parsed).not.toBeNull();
    // 1500 / 1920 * 1280 = 1000 CSS px!
    expect(parsed?.x).toBe(1000);
    expect(parsed?.y).toBe(400);
  });
});
