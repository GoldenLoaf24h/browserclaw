import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  composedParent,
  composedChildren,
  hitElementAtPoint,
  interceptingElementAtPoint,
  describeHitTarget,
  actionPointForElement,
  scrollRequestForPoint,
  inPageCheckInterception,
  inPageDispatchSyntheticClick,
  getIsolatedIndexMap,
} from '../entrypoints/background/tools/browser/dom-indexer';

describe('ego-lite industrial parity mechanisms', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    getIsolatedIndexMap().clear();
  });

  describe('Shadow DOM & Composed Tree Navigation', () => {
    it('correctly resolves composedParent across slot and shadowRoot boundaries', () => {
      const host = document.createElement('div');
      const shadowRoot = host.attachShadow({ mode: 'open' });
      const slot = document.createElement('slot');
      shadowRoot.appendChild(slot);

      const slotted = document.createElement('span');
      host.appendChild(slotted);
      document.body.appendChild(host);

      expect(composedParent(host)).toBe(document.body);
      // Inner shadow root elements resolve parent to host
      expect(composedParent(slot)).toBe(host);
    });

    it('detects dialog interception and describes target with accessible name', () => {
      const dialog = document.createElement('div');
      dialog.setAttribute('role', 'dialog');
      dialog.setAttribute('aria-label', 'User License Agreement');

      const closeBtn = document.createElement('button');
      closeBtn.textContent = 'Close';
      dialog.appendChild(closeBtn);
      document.body.appendChild(dialog);

      const desc = describeHitTarget(closeBtn);
      expect(desc).toBe('dialog "User License Agreement"');
    });
  });

  describe('Optimal Action Point & Local Scrolling', () => {
    it('selects valid viewport action point for rendered elements', () => {
      const btn = document.createElement('button');
      btn.textContent = 'Click Me';
      document.body.appendChild(btn);

      // Mock getClientRects
      vi.spyOn(btn, 'getClientRects').mockReturnValue([
        {
          left: 100,
          top: 150,
          right: 200,
          bottom: 190,
          width: 100,
          height: 40,
        } as DOMRect,
      ] as any);

      const pt = actionPointForElement(btn, window);
      expect(pt).not.toBeNull();
      expect(pt?.x).toBe(150);
      expect(pt?.y).toBe(170);
    });

    it('detects internal scroll container for points outside local bounds', () => {
      const container = document.createElement('div');
      const child = document.createElement('div');
      container.appendChild(child);
      document.body.appendChild(container);

      // Mock scroll properties
      Object.defineProperty(container, 'scrollWidth', { value: 1000 });
      Object.defineProperty(container, 'clientWidth', { value: 400 });
      vi.spyOn(window, 'getComputedStyle').mockReturnValue({
        overflowX: 'auto',
        overflowY: 'hidden',
      } as any);
      vi.spyOn(container, 'getBoundingClientRect').mockReturnValue({
        left: 50,
        top: 50,
        right: 450,
        bottom: 300,
        width: 400,
        height: 250,
      } as any);

      const scrollReq = scrollRequestForPoint(child, 600, 100);
      expect(scrollReq).not.toBeNull();
      expect(scrollReq?.deltaX).toBeGreaterThan(0);
    });
  });

  describe('Click Probe Synthetic Fallback', () => {
    it('dispatches synthetic mouse sequence successfully to indexed target', () => {
      const target = document.createElement('button');
      document.body.appendChild(target);

      // Index it in the isolated map
      getIsolatedIndexMap().set(1, target);

      const clickSpy = vi.fn();
      target.addEventListener('click', clickSpy);

      const dispatched = inPageDispatchSyntheticClick(1, 120, 150);
      expect(dispatched).toBe(true);
      expect(clickSpy).toHaveBeenCalledTimes(1);
    });

    it('dispatches synthetic right_click with contextmenu event and button: 2', () => {
      const target = document.createElement('div');
      document.body.appendChild(target);
      getIsolatedIndexMap().set(2, target);

      let contextMenuEvent: MouseEvent | null = null;
      target.addEventListener('contextmenu', (e) => {
        contextMenuEvent = e as MouseEvent;
      });

      const dispatched = inPageDispatchSyntheticClick(2, 200, 250, 'right_click');
      expect(dispatched).toBe(true);
      expect(contextMenuEvent).not.toBeNull();
      expect(contextMenuEvent?.button).toBe(2);
    });
  });
});
