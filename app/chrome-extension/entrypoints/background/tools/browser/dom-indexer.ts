import type { IndexedElement, PageAsset, PrunedDOMTreeResult } from 'chrome-mcp-shared';

/**
 * Standard structured self-healing guidance when an element is not found or expired
 */
export const DIAGNOSTIC_REFRESH_GUIDANCE =
  "ACTION REQUIRED: Please call 'chrome_read_dom' to refresh the index tree before re-attempting interaction";

/**
 * Isolated symbol to store element index map in the extension's execution context.
 * Prevents polluting global window scope and prevents host page hijacking.
 * Stored as WeakRef to prevent Detached DOM Trees in Blink C++ memory.
 */
const ISOLATED_INDEX_MAP_KEY = Symbol.for('__browser_use_isolated_index_map__');

export function derefElement(entry: any): Element | null {
  if (!entry) return null;
  if (typeof entry.deref === 'function') {
    return entry.deref() ?? null;
  }
  return (entry as Element) ?? null;
}

export function wrapElement(el: Element): any {
  if (typeof WeakRef !== 'undefined') {
    return new WeakRef(el);
  }
  return el;
}

export function getIsolatedIndexMap(): Map<number, any> {
  if (!(globalThis as any)[ISOLATED_INDEX_MAP_KEY]) {
    (globalThis as any)[ISOLATED_INDEX_MAP_KEY] = new Map<number, any>();
  }
  return (globalThis as any)[ISOLATED_INDEX_MAP_KEY];
}

/**
 * Mapping from DOM Element to its verified unoccluded safe click point
 * computed during 9-point grid occlusion sampling.
 *
 * Pinned to globalThis under a registered symbol for the same reason as the
 * isolated index map above: the in-page engine is injected as a file, and a
 * module-scope WeakMap is rebuilt whenever that file re-executes, silently
 * dropping the occlusion-safe click point between chrome_read_dom (writer) and
 * chrome_interact_index (reader) — which degraded clicks back to the geometric
 * centre of partially covered elements.
 */
const SAFE_CLICK_POINT_KEY = Symbol.for('__browser_use_safe_click_point_map__');

function getSafeClickPointMap(): WeakMap<
  Element,
  { x: number; y: number; offsetX: number; offsetY: number }
> {
  const g = globalThis as any;
  if (!g[SAFE_CLICK_POINT_KEY]) {
    g[SAFE_CLICK_POINT_KEY] = new WeakMap<
      Element,
      { x: number; y: number; offsetX: number; offsetY: number }
    >();
  }
  return g[SAFE_CLICK_POINT_KEY];
}

export const safeClickPointWeakMap = getSafeClickPointMap();

/**
 * Shadow DOM and composed tree traversal helpers.
 * These enable penetrating Shadow DOM boundaries to find the true interactive target.
 */
export function composedParent(element: Element | null): Element | null {
  if (!element) return null;
  if ((element as any).assignedSlot) return (element as any).assignedSlot;
  if (element.parentElement) return element.parentElement;
  const root = element.getRootNode ? element.getRootNode() : null;
  return root && root.nodeType === 11 ? (root as ShadowRoot).host : null;
}

export function composedChildren(element: Element): Element[] {
  if (!element) return [];
  if (element.tagName.toUpperCase() === 'SLOT') {
    const assigned = (element as HTMLSlotElement).assignedElements?.({ flatten: true }) || [];
    if (assigned.length > 0) return assigned;
  }
  const container = (element as HTMLElement).shadowRoot || element;
  return Array.from(container.children || []) as Element[];
}

export function hitElementAtPoint(target: Element, x: number, y: number): Element | null {
  const roots: (Document | ShadowRoot)[] = [];
  let parent: Element | null = target;
  while (parent) {
    const root = parent.getRootNode ? parent.getRootNode() : null;
    if (!root || typeof (root as any).elementsFromPoint !== 'function') break;
    roots.push(root as Document | ShadowRoot);
    if (root.nodeType === 9) break;
    parent = (root as ShadowRoot).host as Element;
  }

  let hitElement: Element | null = null;
  for (let index = roots.length - 1; index >= 0; index--) {
    const root = roots[index];
    const elements = (root as any).elementsFromPoint(x, y) as Element[];
    const innerElement = elements[0] || (root as any).elementFromPoint(x, y);
    if (!innerElement) break;
    hitElement = innerElement;
    if (index > 0 && innerElement !== (roots[index - 1] as ShadowRoot).host) break;
  }
  return hitElement;
}

export function interceptingElementAtPoint(target: Element, x: number, y: number): Element | null {
  const hitElement = hitElementAtPoint(target, x, y);
  if (!hitElement) return null;

  let current: Element | null = hitElement;
  while (current && current !== target) current = composedParent(current);
  if (current === target) return null;

  current = target;
  while (current && current !== hitElement) current = composedParent(current);
  if (current === hitElement) return null; // It's the target itself or inside it

  return hitElement;
}

export function describeHitTarget(element: Element): string {
  let modal: Element | null = element;
  while (modal) {
    const role = modal.getAttribute?.('role');
    const ariaModal = modal.getAttribute?.('aria-modal');
    if (role === 'dialog' || ariaModal === 'true') {
      const name =
        modal.getAttribute?.('aria-label') ||
        modal.getAttribute?.('aria-labelledby') ||
        modal.querySelector?.('h1,h2,h3,h4,h5,h6')?.textContent?.trim();
      return name ? `dialog "${name}"` : 'dialog';
    }
    modal = composedParent(modal);
  }

  const tag = element.tagName.toLowerCase();
  const id = element.id ? ` id="${element.id}"` : '';
  const roleAttr = element.getAttribute?.('role') ? ` role="${element.getAttribute('role')}"` : '';
  return `<${tag}${id}${roleAttr}>`;
}

/**
 * Whitelist check for interactive SVG nodes (e.g. icons, clickable vectors).
 * Prevents non-standard interactive SVG elements from being pruned as decorative.
 */
export function isInteractiveSvgNode(el: Element, style?: CSSStyleDeclaration): boolean {
  if (!el || (typeof Element !== 'undefined' && !(el instanceof Element))) return false;
  const tag = (el.tagName || '').toLowerCase();
  if (
    /^(defs|clippath|mask|pattern|lineargradient|radialgradient|filter|metadata|style|title|desc)$/i.test(
      tag,
    )
  ) {
    return false;
  }
  const role = el.getAttribute?.('role')?.toLowerCase();
  if (role && /^(button|link|checkbox|menuitem|tab|switch)$/.test(role)) return true;
  if (
    el.hasAttribute?.('onclick') ||
    el.hasAttribute?.('onmousedown') ||
    typeof (el as any).onclick === 'function'
  )
    return true;
  const tabIndex =
    typeof (el as HTMLElement).tabIndex === 'number' ? (el as HTMLElement).tabIndex : -1;
  if (
    tabIndex >= 0 ||
    (el.hasAttribute?.('tabindex') && !el.getAttribute('tabindex')?.startsWith('-'))
  )
    return true;
  if (style && (style.cursor === 'pointer' || /grab|grabbing|move/i.test(style.cursor)))
    return true;
  if (typeof el.getAttributeNames === 'function') {
    for (const name of el.getAttributeNames()) {
      if (
        /^data-(action|click|target|toggle|trigger|handler|command|interactive|button|nav|href|url|route|press|event)/i.test(
          name,
        )
      ) {
        return true;
      }
    }
  }
  const id = (el.id || el.getAttribute?.('id') || '').trim();
  if (id !== '') {
    // Exclude auto-generated machine SVG IDs (e.g. clip0_123, paint0_linear, path123, rect45)
    const isGenerated =
      /^(clip|paint|mask|gradient|linear|radial|pattern|filter|path|svg|layer|group|rect|circle|ellipse|shape|icon|image)[-_0-9a-z]*$/i.test(
        id,
      ) || /^[0-9a-f]{8,}$/i.test(id);
    if (!isGenerated) return true;
  }
  if (el.hasAttribute?.('aria-haspopup') || el.hasAttribute?.('aria-expanded')) return true;
  return false;
}

/**
 * Pierce open or closed ShadowRoot using chrome.dom.openOrClosedShadowRoot when available,
 * falling back to native el.shadowRoot.
 */
export function getShadowRoot(node: Node | null | undefined): ShadowRoot | null {
  if (!node || (typeof Element !== 'undefined' && !(node instanceof Element))) return null;
  try {
    if (typeof chrome !== 'undefined' && chrome?.dom?.openOrClosedShadowRoot) {
      const sr = chrome.dom.openOrClosedShadowRoot(node as HTMLElement);
      if (sr) return sr;
    }
  } catch {}
  return (node as Element).shadowRoot || null;
}

/**
 * Helper to find an element by index using pure in-memory WeakRef mapping without DOM attribute pollution.
 */
/**
 * Lightweight metadata fingerprint for self-healing DOM node recovery across React/Vue re-renders.
 */
const INDEX_FINGERPRINT_KEY = Symbol.for('__browser_use_index_fingerprint_map__');

export interface ElementFingerprint {
  tag: string;
  id?: string;
  name?: string;
  type?: string;
  placeholder?: string;
  testId?: string;
  ariaLabel?: string;
  role?: string;
  inShadowDom?: boolean;
}

export function getIndexFingerprintMap(): Map<number, ElementFingerprint> {
  const g = globalThis as any;
  if (!g[INDEX_FINGERPRINT_KEY]) {
    g[INDEX_FINGERPRINT_KEY] = new Map<number, ElementFingerprint>();
  }
  return g[INDEX_FINGERPRINT_KEY];
}

function selfHealInShadowRoots(root: Node, fp: ElementFingerprint): Element | null {
  if (!root) return null;
  const shadow = getShadowRoot(root);
  if (shadow) {
    if (fp.id) {
      const escapeId =
        typeof CSS !== 'undefined' && typeof CSS.escape === 'function'
          ? CSS.escape(fp.id)
          : fp.id.replace(/([ #;?%&,.+*~':"!^$[\]()=>|/@])/g, '\\$1');
      const found = shadow.querySelector('#' + escapeId);
      if (found && found.tagName.toLowerCase() === fp.tag) return found;
    }
    if (fp.ariaLabel) {
      const found = shadow.querySelector(
        fp.tag + '[aria-label=' + JSON.stringify(fp.ariaLabel) + ']',
      );
      if (found) return found;
    }
    if (fp.placeholder) {
      const found = shadow.querySelector(
        fp.tag + '[placeholder=' + JSON.stringify(fp.placeholder) + ']',
      );
      if (found) return found;
    }
    if (fp.testId) {
      const found = shadow.querySelector('[data-testid=' + JSON.stringify(fp.testId) + ']');
      if (found && found.tagName.toLowerCase() === fp.tag) return found;
    }
    if (fp.name) {
      const found = shadow.querySelector(fp.tag + '[name=' + JSON.stringify(fp.name) + ']');
      if (found) return found;
    }
    for (const child of Array.from(shadow.children)) {
      const res = selfHealInShadowRoots(child, fp);
      if (res) return res;
    }
  }
  if ('children' in root && (root as Element).children) {
    for (const child of Array.from((root as Element).children)) {
      const res = selfHealInShadowRoots(child, fp);
      if (res) return res;
    }
  }
  return null;
}

function selfHealFindElement(fp: ElementFingerprint): Element | null {
  if (typeof document === 'undefined') return null;
  if (fp.id) {
    const byId = document.getElementById(fp.id);
    if (byId && byId.tagName.toLowerCase() === fp.tag) return byId;
  }
  if (fp.testId) {
    const byTestId = document.querySelector('[data-testid=' + JSON.stringify(fp.testId) + ']');
    if (byTestId && byTestId.tagName.toLowerCase() === fp.tag) return byTestId;
  }
  if (fp.ariaLabel) {
    const byAria = document.querySelector(
      fp.tag + '[aria-label=' + JSON.stringify(fp.ariaLabel) + ']',
    );
    if (byAria) return byAria;
  }
  if (fp.name) {
    const byName = document.querySelector(fp.tag + '[name=' + JSON.stringify(fp.name) + ']');
    if (byName) return byName;
  }
  if (fp.placeholder) {
    const byPl = document.querySelector(
      fp.tag + '[placeholder=' + JSON.stringify(fp.placeholder) + ']',
    );
    if (byPl) return byPl;
  }
  const searchRoot = document.body || document.documentElement || null;
  return searchRoot ? selfHealInShadowRoots(searchRoot, fp) : null;
}

export function findIndexedElement(index: number): Element | null {
  const isolatedMap = getIsolatedIndexMap();
  if (isolatedMap.has(index)) {
    const el = derefElement(isolatedMap.get(index));
    if (el) {
      const doc = typeof document !== 'undefined' ? document : undefined;
      const isConnected =
        typeof (el as any).isConnected === 'boolean'
          ? (el as any).isConnected
          : !doc ||
            typeof doc.contains !== 'function' ||
            doc.contains(el) ||
            (typeof el.getRootNode === 'function' &&
              typeof ShadowRoot !== 'undefined' &&
              el.getRootNode() instanceof ShadowRoot);
      if (isConnected) {
        return el;
      }
    }
  }

  // Self-healing recovery pass: if element reference disconnected or GC'd (e.g. React/Vue re-render)
  const fp = getIndexFingerprintMap().get(index);
  if (fp) {
    const recovered = selfHealFindElement(fp);
    if (recovered) {
      isolatedMap.set(index, wrapElement(recovered));
      return recovered;
    }
  }

  // Graceful fallback for mock unit tests that mock document.querySelector
  if (typeof document !== 'undefined' && typeof document.querySelector === 'function') {
    try {
      const fallback = document.querySelector(`[data-mcp-idx="${index}"]`);
      if (fallback) return fallback;
    } catch {}
  }

  return null;
}

/**
 * Remove Set-of-Mark visual badges overlay if present.
 */
export function inPageRemoveHighlights(): boolean {
  const overlay = document.getElementById('__mcp_som_overlay_container__');
  if (overlay) {
    overlay.remove();
    return true;
  }
  return false;
}

/**
 * Extract clean, high-signal text from an element:
 * - For <select>, extracts only currently selected option text (saving 90%+ tokens and exposing form state)
 * - For elements without text, checks ::before and ::after pseudo-element content
 */
export function extractCleanElementText(el: Element, maxLen = 120): string {
  if (!el) return '';
  const tag = (el.tagName || '').toLowerCase();
  let text = '';

  if (tag === 'select') {
    const selectEl = el as HTMLSelectElement;
    text = (selectEl.selectedOptions?.[0]?.text || selectEl.value || '').trim();
  } else {
    text = ((el as HTMLElement).innerText || el.textContent || '').trim();
  }

  if (!text) {
    try {
      const win =
        el.ownerDocument?.defaultView ||
        (typeof window !== 'undefined' ? window : (globalThis as any).window);
      if (win && typeof win.getComputedStyle === 'function') {
        const cleanContent = (c?: string): string => {
          if (!c || c === 'none' || c === 'normal') return '';
          let str = c.replace(/^["']|["']$/g, '').trim();
          // Decode CSS unicode escapes like \00d7, \u00d7, \2715, or \1F50D
          str = str.replace(/\\(?:u([0-9a-fA-F]{4})|([0-9a-fA-F]{1,6})\s?)/g, (_, uHex, hex) => {
            const code = parseInt(uHex || hex, 16);
            try {
              return isNaN(code) || code > 0x10ffff ? _ : String.fromCodePoint(code);
            } catch {
              return _;
            }
          });
          return str.trim();
        };
        const beforeContent = win.getComputedStyle(el, '::before')?.getPropertyValue('content');
        const afterContent = win.getComputedStyle(el, '::after')?.getPropertyValue('content');
        const bText = cleanContent(beforeContent);
        const aText = cleanContent(afterContent);
        const pseudoText = [bText, aText].filter(Boolean).join(' ').trim();
        if (pseudoText) {
          text = pseudoText;
        }
      }
    } catch {}
  }

  return text.slice(0, maxLen);
}

/**
 * Re-index elements in a subframe by applying an index offset.
 * Synchronizes the subframe's in-page index map, DOM attributes, and visual badges.
 */
export function inPageReindexFrame(offset: number, highlight = false): boolean {
  if (typeof offset !== 'number' || offset === 0) return false;
  const isolatedMap = getIsolatedIndexMap();
  const entries = Array.from(isolatedMap.entries()).sort((a, b) => a[0] - b[0]);
  isolatedMap.clear();

  const reindexedElements: IndexedElement[] = [];

  for (const [oldIdx, wrapped] of entries) {
    const el = derefElement(wrapped);
    if (!el || !(el instanceof Element)) continue;

    const newIdx = oldIdx + offset;
    isolatedMap.set(newIdx, wrapElement(el));

    if (highlight) {
      try {
        const rect = el.getBoundingClientRect();
        const text = extractCleanElementText(el);
        reindexedElements.push({
          index: newIdx,
          tagName: el.tagName.toLowerCase(),
          role: el.getAttribute('role') || undefined,
          text: text || undefined,
          attributes: {},
          rect: {
            x: Math.round(rect.x),
            y: Math.round(rect.y),
            width: Math.round(rect.width),
            height: Math.round(rect.height),
          },
          isInteractive: true,
        });
      } catch {}
    }
  }

  if (highlight && reindexedElements.length > 0) {
    inPageRenderHighlights(reindexedElements);
  }

  return true;
}

/**
 * Re-align Set-of-Mark visual badges overlay after scrolling or dynamic layout shifts.
 * Re-reads bounding rects of indexed elements in isolatedMap and updates the visual overlay.
 */
export function inPageRealignHighlights(): boolean {
  const overlay = document.getElementById('__mcp_som_overlay_container__');
  if (!overlay) return false;
  const isolatedMap = getIsolatedIndexMap();
  const reindexedElements: IndexedElement[] = [];

  for (const [idx, wrapped] of isolatedMap.entries()) {
    const el = derefElement(wrapped);
    if (!el || !(el instanceof Element)) continue;
    try {
      const rect = el.getBoundingClientRect();
      if (rect.width <= 0 && rect.height <= 0) continue;
      const text = extractCleanElementText(el);
      reindexedElements.push({
        index: idx,
        tagName: el.tagName.toLowerCase(),
        role: el.getAttribute('role') || undefined,
        text: text || undefined,
        attributes: {},
        rect: {
          x: Math.round(rect.x),
          y: Math.round(rect.y),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
        },
        isInteractive: true,
      });
    } catch {}
  }

  if (reindexedElements.length > 0) {
    inPageRenderHighlights(reindexedElements);
    return true;
  }
  return false;
}

/**
 * Scroll target element into center view by index inside active tab.
 */
export function inPageScrollToIndex(index: number): boolean {
  if (index <= 0) return false;
  const el = findIndexedElement(index);
  if (!el || !(el instanceof Element)) return false;
  try {
    el.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' as any });
    return true;
  } catch {
    return false;
  }
}

/**
 * Scroll by pixel deltas, rooted at the indexed element's nearest scrollable
 * ancestor (the element itself counts). Falls back to the window when no
 * ancestor on the requested axis is scrollable. Used by the chrome_scroll
 * script-side fallback where CDP wheel dispatch is unavailable.
 */
export function inPageScrollByIndex(
  index: number,
  dx: number,
  dy: number,
): { scrolled: boolean; scrollTop: number; scrollLeft: number } {
  if (index <= 0) return { scrolled: false, scrollTop: 0, scrollLeft: 0 };
  const el = findIndexedElement(index);
  if (!el || !(el instanceof Element)) return { scrolled: false, scrollTop: 0, scrollLeft: 0 };
  let node: Element | null = el;
  while (node) {
    const cs = getComputedStyle(node);
    const canY =
      dy !== 0 &&
      /(auto|scroll|overlay)/.test(cs.overflowY) &&
      node.scrollHeight > node.clientHeight + 1;
    const canX =
      dx !== 0 &&
      /(auto|scroll|overlay)/.test(cs.overflowX) &&
      node.scrollWidth > node.clientWidth + 1;
    if (canY || canX) {
      node.scrollBy({ left: dx, top: dy, behavior: 'instant' as any });
      return { scrolled: true, scrollTop: node.scrollTop, scrollLeft: node.scrollLeft };
    }
    node = node.parentElement;
  }
  window.scrollBy({ left: dx, top: dy, behavior: 'instant' as any });
  return { scrolled: true, scrollTop: window.scrollY, scrollLeft: window.scrollX };
}

/**
 * Render high-contrast Set-of-Mark visual badges on top of indexed elements (Set-of-Mark 2.0).
 * Features:
 * 1. Frustum Culling: skips elements strictly outside the current viewport.
 * 2. Anti-Collision: tracks badge locations and offsets badges if within 25px of an existing badge.
 * 3. Micro-Pill design: high legibility, compact footprint, semi-transparent background to prevent obscuring content.
 */
export function inPageRenderHighlights(indexedElements: IndexedElement[]): void {
  inPageRemoveHighlights();

  const overlay = document.createElement('div');
  overlay.id = '__mcp_som_overlay_container__';
  overlay.setAttribute('aria-hidden', 'true');
  overlay.style.cssText =
    [
      'position: fixed',
      'top: 0',
      'left: 0',
      'width: 100vw',
      'height: 100vh',
      'pointer-events: none',
      'z-index: 2147483647',
      'overflow: visible',
      'margin: 0',
      'padding: 0',
    ].join(' !important;') + ' !important;';

  const vw = window.innerWidth || document.documentElement.clientWidth || 1280;
  const vh = window.innerHeight || document.documentElement.clientHeight || 800;

  // Track placed badge centers for anti-collision
  const placedBadges: Array<{ x: number; y: number }> = [];

  for (const el of indexedElements) {
    if (!el.rect || (el.rect.width <= 0 && el.rect.height <= 0)) continue;

    // 1. Frustum Culling: skip elements completely outside the visible viewport
    if (
      el.rect.x + el.rect.width < 0 ||
      el.rect.y + el.rect.height < 0 ||
      el.rect.x > vw ||
      el.rect.y > vh
    ) {
      continue;
    }

    // Outlined bounding box
    const box = document.createElement('div');
    box.style.cssText =
      [
        'position: fixed',
        `left: ${el.rect.x}px`,
        `top: ${el.rect.y}px`,
        `width: ${el.rect.width}px`,
        `height: ${el.rect.height}px`,
        'border: 1.5px solid rgba(245, 158, 11, 0.85)',
        'background: rgba(245, 158, 11, 0.08)',
        'box-sizing: border-box',
        'pointer-events: none',
        'z-index: 2147483646',
      ].join(' !important;') + ' !important;';
    overlay.appendChild(box);

    // Numbered Badge position calculation with Anti-Collision
    const isSmall = el.rect.width < 60 || el.rect.height < 30;
    let badgeTop = isSmall ? Math.max(0, el.rect.y - 14) : el.rect.y;
    const badgeLeft = el.rect.x;

    // 2. Anti-Collision: check proximity to placed badges (< 25px)
    const isColliding = (bx: number, by: number): boolean => {
      for (const placed of placedBadges) {
        const dx = placed.x - bx;
        const dy = placed.y - by;
        if (dx * dx + dy * dy < 25 * 25) {
          return true;
        }
      }
      return false;
    };

    if (isColliding(badgeLeft + 10, badgeTop + 7)) {
      // Alternate placement: flip below element or shift vertically
      const altTop = el.rect.y + el.rect.height - 2;
      if (!isColliding(badgeLeft + 10, altTop + 7) && altTop + 14 <= vh) {
        badgeTop = altTop;
      } else {
        badgeTop = Math.max(0, badgeTop + 14);
      }
    }

    placedBadges.push({ x: badgeLeft + 10, y: badgeTop + 7 });

    // 3. Micro-Pill Badge
    const badge = document.createElement('div');
    badge.textContent = String(el.index);
    badge.style.cssText =
      [
        'position: fixed',
        `left: ${badgeLeft}px`,
        `top: ${badgeTop}px`,
        'background: rgba(250, 204, 21, 0.9)',
        'color: #000000',
        'font-size: 9px',
        'font-weight: 800',
        'font-family: monospace, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        'line-height: 11px',
        'padding: 1px 3px',
        'border-radius: 9999px',
        'border: 1px solid rgba(0, 0, 0, 0.7)',
        'box-shadow: 0 1px 3px rgba(0,0,0,0.35)',
        'pointer-events: none',
        'z-index: 2147483647',
        'user-select: none',
        'white-space: nowrap',
      ].join(' !important;') + ' !important;';

    overlay.appendChild(badge);
  }

  (document.body || document.documentElement).appendChild(overlay);
}

/**
 * DOM In-Page Indexer & Pruner
 * Evaluated inside the active tab context.
 */
export function inPageDOMPruner(options?: {
  viewportThreshold?: number;
  highlight?: boolean;
  startingIndex?: number;
  frameId?: string;
  maxTextLength?: number;
  format?: 'compact' | 'html';
  viewportOnly?: boolean;
}): PrunedDOMTreeResult {
  const isViewportOnly = options?.viewportOnly === true;
  const threshold = isViewportOnly ? 150 : (options?.viewportThreshold ?? 1000);
  const startingIndex = options?.startingIndex ?? 1;
  const frameId = options?.frameId;
  const maxTextLength =
    typeof options?.maxTextLength === 'number' && options.maxTextLength > 0
      ? options.maxTextLength
      : 120;
  const outputFormat = options?.format === 'html' ? 'html' : 'compact';
  const winHeight = window.innerHeight;
  const winWidth = window.innerWidth;

  const droppedTags = new Set([
    'script',
    'style',
    'head',
    'meta',
    'link',
    'title',
    'noscript',
    'template',
  ]);

  const svgInternalTags = new Set([
    'path',
    'rect',
    'circle',
    'ellipse',
    'line',
    'polyline',
    'polygon',
    'use',
    'defs',
    'clippath',
    'mask',
    'pattern',
    'text',
    'tspan',
    'g',
  ]);

  const interactiveRoles = new Set([
    'button',
    'link',
    'checkbox',
    'radio',
    'tab',
    'menuitem',
    'option',
    'textbox',
    'combobox',
    'searchbox',
    'switch',
    'slider',
    'spinbutton',
  ]);

  let totalOriginalNodes = 0;
  // Number of nodes retained in the pruned tree (interactive + informational + files).
  // Previously this counter was never incremented, so elementCount was always 0 and
  // compressionRatio was always 1 — both self-contradictory next to interactiveCount.
  let prunedElementCount = 0;
  const indexedElements: IndexedElement[] = [];
  const indexMap: Record<
    number,
    { selector?: string; backendNodeId?: number; frameId?: string; tagName?: string }
  > = {};

  const isolatedMap = getIsolatedIndexMap();
  if (startingIndex === 1) {
    isolatedMap.clear();
    getIndexFingerprintMap().clear();
  }

  let nextIndex = startingIndex;

  const PROPAGATING_ELEMENTS = new Set([
    'p',
    'span',
    'b',
    'strong',
    'i',
    'em',
    'small',
    'label',
    'h1',
    'h2',
    'h3',
    'h4',
    'h5',
    'h6',
    'div',
    'li',
    'td',
    'th',
    'sub',
    'sup',
  ]);

  function isInteractive(
    el: Element,
    style: CSSStyleDeclaration,
    parentHasPointer = false,
  ): boolean {
    const tag = el.tagName.toLowerCase();
    if (tag === 'body' || tag === 'html') {
      return false;
    }
    if (
      tag === 'button' ||
      tag === 'select' ||
      tag === 'textarea' ||
      tag === 'details' ||
      tag === 'summary' ||
      tag === 'option' ||
      tag === 'canvas'
    ) {
      return true;
    }
    if (tag === 'input' && (el as HTMLInputElement).type !== 'hidden') {
      return true;
    }
    if (tag === 'a' && (el as HTMLAnchorElement).href) {
      return true;
    }
    if (
      (el as HTMLElement).isContentEditable ||
      el.getAttribute('contenteditable') === 'true' ||
      el.getAttribute('contenteditable') === ''
    ) {
      return true;
    }
    const role = el.getAttribute('role')?.toLowerCase();
    if (role && interactiveRoles.has(role)) {
      return true;
    }
    if (
      el.hasAttribute('onclick') ||
      el.hasAttribute('oncontextmenu') ||
      el.hasAttribute('ondblclick') ||
      el.hasAttribute('draggable') ||
      el.hasAttribute('data-action') ||
      (el as HTMLElement).tabIndex >= 0 ||
      el.hasAttribute('aria-valuenow') ||
      el.hasAttribute('aria-controls') ||
      el.hasAttribute('aria-selected') ||
      el.hasAttribute('aria-checked')
    ) {
      return true;
    }
    const cls =
      typeof (el as HTMLElement).className === 'string' ? (el as HTMLElement).className : '';
    if (
      cls.includes('group/') ||
      cls.includes('hover') ||
      cls.includes('dropdown') ||
      cls.includes('menu-item') ||
      el.hasAttribute('aria-haspopup') ||
      el.hasAttribute('aria-expanded')
    ) {
      return true;
    }
    if (isInteractiveSvgNode(el, style)) {
      return true;
    }
    if (style.cursor && /grab|grabbing|resize|^move$|all-scroll/i.test(style.cursor)) {
      // Drag/resize targets carry grab/resize cursors instead of pointer.
      return true;
    }
    if (style.cursor === 'pointer') {
      // Browser-use enhancement: Block cursor: pointer inheritance from parent
      // on standard propagating containers to eliminate redundant fractured sub-elements
      if (parentHasPointer && PROPAGATING_ELEMENTS.has(tag)) {
        return false;
      }
      return true;
    }
    return false;
  }

  interface OcclusionResult {
    isFullyOccluded: boolean;
    isOccluded: boolean;
    occludedBy?: string;
    safeClickPoint: { x: number; y: number; offsetX: number; offsetY: number };
  }

  /**
   * 9-point grid occlusion sampling (3x3 grid at 15%, 50%, 85% width/height).
   * Determines whether an element is fully occluded, partially occluded, or clear,
   * and calculates the optimal unoccluded safe click point.
   */
  function checkOcclusionGrid(el: Element, rect: DOMRect): OcclusionResult {
    const defaultCenter = {
      x: Math.round(rect.left + rect.width / 2),
      y: Math.round(rect.top + rect.height / 2),
      offsetX: rect.width / 2,
      offsetY: rect.height / 2,
    };

    if (rect.width <= 0 || rect.height <= 0) {
      return { isFullyOccluded: false, isOccluded: false, safeClickPoint: defaultCenter };
    }
    if (rect.left < 0 || rect.top < 0 || rect.right > winWidth || rect.bottom > winHeight) {
      return { isFullyOccluded: false, isOccluded: false, safeClickPoint: defaultCenter };
    }

    const ratios = [0.15, 0.5, 0.85];
    let totalSampled = 0;
    let occludedCount = 0;
    let primaryOccluder: string | undefined = undefined;
    const clearPoints: Array<{ x: number; y: number; offsetX: number; offsetY: number }> = [];
    let centerClearPoint: { x: number; y: number; offsetX: number; offsetY: number } | null = null;

    for (const ry of ratios) {
      for (const rx of ratios) {
        const px = rect.left + rect.width * rx;
        const py = rect.top + rect.height * ry;

        if (px < 0 || py < 0 || px >= winWidth || py >= winHeight) {
          continue;
        }
        totalSampled++;

        let topEl: Element | null = null;
        try {
          if (typeof document.elementFromPoint === 'function') {
            topEl = document.elementFromPoint(px, py);
          }
        } catch {}

        if (!topEl) {
          const pt = {
            x: Math.round(px),
            y: Math.round(py),
            offsetX: rect.width * rx,
            offsetY: rect.height * ry,
          };
          clearPoints.push(pt);
          if (rx === 0.5 && ry === 0.5) centerClearPoint = pt;
          continue;
        }

        if (topEl === el || composedContains(el, topEl) || composedContains(topEl, el)) {
          const pt = {
            x: Math.round(px),
            y: Math.round(py),
            offsetX: rect.width * rx,
            offsetY: rect.height * ry,
          };
          clearPoints.push(pt);
          if (rx === 0.5 && ry === 0.5) centerClearPoint = pt;
          continue;
        }

        try {
          const topStyle = window.getComputedStyle(topEl);
          if (
            topStyle.display !== 'none' &&
            topStyle.visibility !== 'hidden' &&
            parseFloat(topStyle.opacity || '1') >= 0.8
          ) {
            occludedCount++;
            if (!primaryOccluder) {
              const tag = topEl.tagName?.toLowerCase() || 'element';
              const id = topEl.id ? `#${topEl.id}` : '';
              primaryOccluder = `${tag}${id}`;
            }
            continue;
          }
        } catch {}

        const pt = {
          x: Math.round(px),
          y: Math.round(py),
          offsetX: rect.width * rx,
          offsetY: rect.height * ry,
        };
        clearPoints.push(pt);
        if (rx === 0.5 && ry === 0.5) centerClearPoint = pt;
      }
    }

    if (totalSampled > 0 && occludedCount === totalSampled) {
      return {
        isFullyOccluded: true,
        isOccluded: true,
        occludedBy: primaryOccluder,
        safeClickPoint: defaultCenter,
      };
    }

    const isPartiallyOccluded = occludedCount > 0;
    let safePoint = defaultCenter;

    if (clearPoints.length > 0) {
      // Prefer the geometric center whenever it is unoccluded. Previously a
      // partially occluded element skipped this branch and averaged every clear
      // sample, which biased the point toward whichever 15%/85% column survived.
      // On a ~40px control that is a +8..+18px drift off center — enough to land
      // on a neighbouring element. Centre-first removes that bias.
      if (centerClearPoint) {
        safePoint = defaultCenter;
      } else {
        const avgOffsetX = clearPoints.reduce((sum, p) => sum + p.offsetX, 0) / clearPoints.length;
        const avgOffsetY = clearPoints.reduce((sum, p) => sum + p.offsetY, 0) / clearPoints.length;
        const avgX = Math.round(rect.left + avgOffsetX);
        const avgY = Math.round(rect.top + avgOffsetY);

        let centroidClear = false;
        try {
          if (typeof document.elementFromPoint === 'function') {
            const topAtAvg = document.elementFromPoint(avgX, avgY);
            if (
              !topAtAvg ||
              topAtAvg === el ||
              composedContains(el, topAtAvg) ||
              composedContains(topAtAvg, el)
            ) {
              centroidClear = true;
            }
          }
        } catch {}

        if (centroidClear) {
          safePoint = { x: avgX, y: avgY, offsetX: avgOffsetX, offsetY: avgOffsetY };
        } else {
          let bestDist = Infinity;
          let bestPt = clearPoints[0];
          for (const pt of clearPoints) {
            const d = Math.hypot(pt.x - avgX, pt.y - avgY);
            if (d < bestDist) {
              bestDist = d;
              bestPt = pt;
            }
          }
          safePoint = bestPt;
        }
      }
    }

    return {
      isFullyOccluded: false,
      isOccluded: isPartiallyOccluded,
      occludedBy: isPartiallyOccluded ? primaryOccluder : undefined,
      safeClickPoint: safePoint,
    };
  }

  function checkOcclusion(el: Element, rect: DOMRect): boolean {
    return checkOcclusionGrid(el, rect).isFullyOccluded;
  }

  // elementFromPoint does not pierce shadow boundaries: a shadow child would
  // be hit-tested against its own host and wrongly reported as occluded.
  function composedContains(ancestor: Node, descendant: Node): boolean {
    let n: Node | null = descendant;
    while (n) {
      if (n === ancestor) return true;
      const root: Node | null = typeof n.getRootNode === 'function' ? n.getRootNode() : null;
      n =
        typeof ShadowRoot !== 'undefined' && root instanceof ShadowRoot
          ? root.host
          : n.parentNode || null;
    }
    return false;
  }

  function isAdOrTrackingElement(el: Element): boolean {
    const tag = el.tagName?.toLowerCase() || '';
    if (tag === 'ins' && el.classList?.contains?.('adsbygoogle')) return true;
    const idAndClass = `${el.id || ''} ${(el as HTMLElement).className || ''}`.toLowerCase();
    if (
      /(^|[\s_-])(adsbygoogle|google[-_]?ads?|ad[-_]?banner|ad[-_]?wrapper|ad[-_]?container|taboola|outbrain|sponsored[-_]?post|advertisement)([\s_-]|$)/i.test(
        idAndClass,
      )
    ) {
      return true;
    }
    return false;
  }

  function isInformationalNode(el: Element): boolean {
    const tag = el.tagName?.toLowerCase() || '';
    if (/^h[1-6]$/.test(tag) || tag === 'th') return true;
    const role = (el.getAttribute('role') || '').toLowerCase();
    if (role === 'alert' || role === 'status' || role === 'heading') return true;
    if (el.hasAttribute('aria-live')) return true;
    // Leaf elements with concise visible text (labels, cards, badges, tiles, ritual plates)
    // are semantic informational nodes that agents need to perceive and target
    if (
      el.children.length === 0 &&
      el.textContent &&
      el.textContent.trim().length > 0 &&
      el.textContent.trim().length <= 80 &&
      !['script', 'style', 'noscript', 'meta', 'link'].includes(tag)
    ) {
      return true;
    }
    return false;
  }

  // Visual assets (img/canvas/video/CSS background images) with viewport
  // geometry, so the agent can request an individual asset by index.
  const assets: PageAsset[] = [];
  const assetRegistry: Array<{ kind: string; el: Element; src?: string }> = [];
  let assetSeq = 0;
  const pushAsset = (
    kind: PageAsset['kind'],
    el: Element,
    rect: DOMRect,
    src?: string,
    alt?: string,
  ) => {
    if (rect.width < 8 || rect.height < 8) return;
    if (rect.bottom < 0 || rect.right < 0 || rect.top > winHeight || rect.left > winWidth) return;
    assetSeq += 1;
    assetRegistry.push({ kind, el, src });
    assets.push({
      index: assetSeq,
      kind,
      rect: {
        x: Math.round(rect.left),
        y: Math.round(rect.top),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      },
      ...(src ? { src } : {}),
      ...(alt ? { alt } : {}),
    });
  };

  function traverse(
    node: Element,
    propagatingParentRect?: DOMRect | null,
    parentHasPointer = false,
    insideShadow = false,
  ) {
    totalOriginalNodes++;

    const tag = (node.tagName || '').toLowerCase();
    if (tag === 'body' || tag === 'html') {
      let style: CSSStyleDeclaration | null = null;
      try {
        style = window.getComputedStyle(node);
      } catch {}
      const currentHasPointer = style?.cursor === 'pointer';
      const nextPointer = currentHasPointer || parentHasPointer;
      const children = node.children ? Array.from(node.children) : [];
      for (const child of children) {
        traverse(child, propagatingParentRect, nextPointer, insideShadow);
      }
      return;
    }

    if (droppedTags.has(tag)) return;
    if (svgInternalTags.has(tag)) {
      const insideSvg = typeof node.closest === 'function' ? Boolean(node.closest('svg')) : true;
      if (insideSvg) {
        let nodeStyle: CSSStyleDeclaration | undefined;
        try {
          nodeStyle = window.getComputedStyle(node);
        } catch {}
        if (!isInteractiveSvgNode(node, nodeStyle)) {
          return;
        }
      }
    }
    if (typeof Element !== 'undefined' && !(node instanceof Element)) return;
    if (isAdOrTrackingElement(node)) return;

    const isFile = tag === 'input' && (node as HTMLInputElement).type === 'file';
    if (!isFile && typeof (node as any).checkVisibility === 'function') {
      if (!(node as any).checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) {
        return;
      }
    }

    const style = window.getComputedStyle(node);
    const rect = node.getBoundingClientRect();
    const isZeroSize = rect.width <= 0 || rect.height <= 0;

    if (!isFile) {
      if (style.display === 'none' || style.visibility === 'hidden') return;
      if (parseFloat(style.opacity || '1') <= 0) return;
      if (isZeroSize) {
        if (node.children.length === 0 && !getShadowRoot(node)) return;
      } else {
        if (rect.top > winHeight + threshold || rect.bottom < -threshold) return;
      }
    }

    // Inline visual asset detection during the single traverse pass (eliminates secondary querySelectorAll thrashing)
    if (!isZeroSize) {
      if (tag === 'img') {
        const img = node as HTMLImageElement;
        pushAsset('img', img, rect, img.currentSrc || img.src || undefined, img.alt || undefined);
      } else if (tag === 'canvas' || tag === 'video') {
        pushAsset(tag as 'canvas' | 'video', node, rect);
      } else if (assets.length < 40) {
        const bg = style.backgroundImage;
        if (bg && bg !== 'none') {
          const m = /url\(["']?([^"')]+)["']?\)/.exec(bg);
          if (m) pushAsset('bg-image', node, rect, m[1]);
        }
      }
    }

    const currentHasPointer = style.cursor === 'pointer';
    const interactive = isInteractive(node, style, parentHasPointer);
    const informational = !interactive && isInformationalNode(node);

    if (propagatingParentRect && !interactive && !isFile && !informational) {
      const xOverlap = Math.max(
        0,
        Math.min(rect.right, propagatingParentRect.right) -
          Math.max(rect.left, propagatingParentRect.left),
      );
      const yOverlap = Math.max(
        0,
        Math.min(rect.bottom, propagatingParentRect.bottom) -
          Math.max(rect.top, propagatingParentRect.top),
      );
      const overlapArea = xOverlap * yOverlap;
      const childArea = rect.width * rect.height;
      if (childArea > 0 && overlapArea / childArea >= 0.99) {
        const nextPointer = currentHasPointer || parentHasPointer;
        for (const child of Array.from(node.children)) {
          traverse(child, propagatingParentRect, nextPointer, insideShadow);
        }
        const shadow = getShadowRoot(node);
        if (shadow) {
          for (const shadowChild of Array.from(shadow.children)) {
            traverse(shadowChild, propagatingParentRect, nextPointer, true);
          }
        }
        return;
      }
    }

    const hasInfoText =
      informational && Boolean(((node as HTMLElement).innerText || node.textContent || '').trim());
    if (!isZeroSize && (interactive || isFile || (informational && hasInfoText))) {
      candidates.push({
        node,
        tag,
        rect,
        isFile,
        isInteractive: interactive || isFile,
        inShadowDom: insideShadow || undefined,
      });
    }

    const nextPropagatingRect =
      !isZeroSize && interactive && (tag === 'button' || tag === 'a')
        ? rect
        : propagatingParentRect;
    const nextPointer = currentHasPointer || parentHasPointer;

    // Traverse standard children
    for (const child of Array.from(node.children)) {
      traverse(child, nextPropagatingRect, nextPointer, insideShadow);
    }

    // Traverse Shadow DOM children (penetration for open and closed shadow roots)
    const shadow = getShadowRoot(node);
    if (shadow) {
      for (const shadowChild of Array.from(shadow.children)) {
        traverse(shadowChild, nextPropagatingRect, nextPointer, true);
      }
    }
  }

  const candidates: Array<{
    node: Element;
    tag: string;
    rect: DOMRect;
    isFile: boolean;
    isInteractive: boolean;
    inShadowDom?: boolean;
  }> = [];

  if (document.body) {
    traverse(document.body, null, false, false);
  }

  // Phase 2: Deterministic visual reading-order sort (top-to-bottom, left-to-right)
  candidates.sort((a, b) => {
    const ay = a.rect?.y ?? 0;
    const by = b.rect?.y ?? 0;
    const ax = a.rect?.x ?? 0;
    const bx = b.rect?.x ?? 0;
    const dy = Math.round(ay) - Math.round(by);
    if (Math.abs(dy) > 4) {
      return dy;
    }
    return Math.round(ax) - Math.round(bx);
  });

  // Phase 2: Decoupled batch hit-testing & indexing pass (eliminates layout thrashing)
  for (const cand of candidates) {
    const occlusion = checkOcclusionGrid(cand.node, cand.rect);
    if (occlusion.isFullyOccluded) continue;

    safeClickPointWeakMap.set(cand.node, occlusion.safeClickPoint);

    const assignedIndex = nextIndex++;
    isolatedMap.set(assignedIndex, wrapElement(cand.node));

    // Detect visual geometric shape if styled or transformed (diamond, circle, hex, triangle, square)
    let detectedShape: string | undefined = undefined;
    try {
      const targets = [
        cand.node,
        ...Array.from(cand.node.querySelectorAll('span, div, i, svg, polygon, circle, rect')),
      ];
      for (const t of targets) {
        const style = t.getAttribute('style') || '';
        if (/rotate\(\s*(45|135|225|315)deg\s*\)/i.test(style)) {
          detectedShape = 'diamond';
          break;
        }
        if (/border-radius:\s*(50%|9999px)/i.test(style)) {
          detectedShape = 'circle';
          break;
        }
        if (/clip-path:\s*polygon/i.test(style)) {
          const pts = (style.match(/%/g) || []).length;
          detectedShape = pts >= 12 ? 'hex' : 'triangle';
          break;
        }
        if (t.tagName.toLowerCase() === 'circle') {
          detectedShape = 'circle';
          break;
        }
        if (t.tagName.toLowerCase() === 'polygon') {
          detectedShape = 'polygon';
          break;
        }
      }
    } catch {}

    const attributes: Record<string, string> = {};
    const attrsToKeep = [
      'id',
      'name',
      'type',
      'placeholder',
      'aria-label',
      'role',
      'href',
      'title',
      'disabled',
      'aria-disabled',
      'contenteditable',
      'aria-checked',
      'aria-selected',
      'aria-expanded',
      'aria-pressed',
    ];
    for (const attr of attrsToKeep) {
      const val = cand.node.getAttribute(attr);
      if (val) attributes[attr] = val.slice(0, 100);
    }
    if (typeof cand.node.getAttributeNames === 'function') {
      for (const attr of cand.node.getAttributeNames()) {
        if (attr.startsWith('data-') && !attributes[attr]) {
          const val = cand.node.getAttribute(attr);
          if (val) attributes[attr] = val.slice(0, 100);
        }
      }
    }
    if (cand.isFile) {
      attributes['type'] = 'file';
    }
    if (detectedShape) {
      attributes['visual-shape'] = detectedShape;
    }

    getIndexFingerprintMap().set(assignedIndex, {
      tag: cand.tag,
      id: attributes.id,
      name: attributes.name,
      type: attributes.type,
      placeholder: attributes.placeholder,
      testId: attributes['data-testid'],
      ariaLabel: attributes['aria-label'],
      role: attributes.role,
      inShadowDom: cand.inShadowDom,
    });
    if (
      (cand.node as HTMLElement).isContentEditable ||
      cand.node.getAttribute('contenteditable') === 'true' ||
      cand.node.getAttribute('contenteditable') === ''
    ) {
      attributes['contenteditable'] = 'true';
    }
    if (
      (cand.node as any).disabled ||
      cand.node.hasAttribute('disabled') ||
      cand.node.getAttribute('aria-disabled') === 'true'
    ) {
      attributes['disabled'] = 'true';
    }

    // Expose live toggle state. React controlled inputs update the IDL property
    // (`el.checked`) without touching the content attribute, so the attribute
    // layer alone cannot tell a checked box from an unchecked one — agents had
    // to fall back to screenshots to verify form state.
    try {
      const node = cand.node as HTMLInputElement;
      const inputType = (attributes.type || node.getAttribute('type') || '').toLowerCase();
      if (cand.tag === 'input' && (inputType === 'checkbox' || inputType === 'radio')) {
        attributes['checked'] = node.checked ? 'true' : 'false';
      }
      if (cand.tag === 'option') {
        attributes['selected'] = (node as unknown as HTMLOptionElement).selected ? 'true' : 'false';
      }
    } catch {}

    // Scrollable container hint (P1-7)
    try {
      if (
        cand.node.scrollHeight > cand.node.clientHeight + 2 &&
        /(auto|scroll)/.test(window.getComputedStyle(cand.node).overflowY)
      ) {
        attributes['scrollable'] = 'true';
      }
    } catch {}

    // Form validation state. Agents previously had to submit a form and watch
    // for a re-render to learn whether a field was valid, and React/Angular
    // validators set aria-invalid without ever setting the DOM validity flags.
    // Report both: the native constraint state and the ARIA hint.
    try {
      const el = cand.node as HTMLInputElement;
      const supportsValidity =
        cand.tag === 'input' || cand.tag === 'textarea' || cand.tag === 'select';
      if (supportsValidity && el.validity) {
        if (el.validity.valid === false) attributes['invalid'] = 'true';
        if (el.validity.valid === true) attributes['valid'] = 'true';
        if (el.validity.valueMissing) attributes['invalidReason'] = 'valueMissing';
        else if (el.validity.typeMismatch) attributes['invalidReason'] = 'typeMismatch';
        else if (el.validity.patternMismatch) attributes['invalidReason'] = 'patternMismatch';
        else if (el.validity.tooShort) attributes['invalidReason'] = 'tooShort';
        else if (el.validity.tooLong) attributes['invalidReason'] = 'tooLong';
        else if (el.validity.rangeUnderflow) attributes['invalidReason'] = 'rangeUnderflow';
        else if (el.validity.rangeOverflow) attributes['invalidReason'] = 'rangeOverflow';
        else if (el.validity.stepMismatch) attributes['invalidReason'] = 'stepMismatch';
        else if (el.validity.badInput) attributes['invalidReason'] = 'badInput';
        else if (el.validity.customError) attributes['invalidReason'] = 'customError';
        if (el.validationMessage) {
          attributes['validationMessage'] = String(el.validationMessage).slice(0, 120);
        }
      }
      // Framework validators commonly only flip aria-invalid.
      if (cand.node.getAttribute('aria-invalid') === 'true') attributes['invalid'] = 'true';
      if (
        cand.node.hasAttribute('required') ||
        cand.node.getAttribute('aria-required') === 'true'
      ) {
        attributes['required'] = 'true';
      }
      // Constraint hints so an agent can satisfy the field without guessing.
      for (const attr of ['pattern', 'min', 'max', 'minlength', 'maxlength', 'step']) {
        if (attributes[attr]) continue;
        const val = cand.node.getAttribute(attr);
        if (val) attributes[attr] = val.slice(0, 100);
      }
    } catch {}

    // Dialog / modal status (P1-7)
    try {
      if (cand.node.closest('dialog, [role="dialog"], [role="alertdialog"], .modal')) {
        attributes['dialog'] = 'true';
      }
    } catch {}

    // Form value extraction with sensitive field masking (P1-7)
    let elemValue: string | undefined = undefined;
    if (cand.tag === 'input' || cand.tag === 'textarea' || cand.tag === 'select') {
      try {
        const rawVal = (cand.node as any).value;
        if (typeof rawVal === 'string' && rawVal.length > 0) {
          const type = (attributes.type || cand.node.getAttribute('type') || '').toLowerCase();
          const name = (attributes.name || cand.node.getAttribute('name') || '').toLowerCase();
          const id = (attributes.id || cand.node.getAttribute('id') || '').toLowerCase();
          const autocomplete = (cand.node.getAttribute('autocomplete') || '').toLowerCase();
          const ariaLabel = (
            attributes['aria-label'] ||
            cand.node.getAttribute('aria-label') ||
            ''
          ).toLowerCase();
          const isSensitive =
            type === 'password' ||
            /(password|passcode|secret|cc-|credit-card|cvv|cvc|card-number|one-time-code|otp|token)/i.test(
              `${name} ${id} ${autocomplete} ${ariaLabel}`,
            );

          if (isSensitive) {
            elemValue = '••••••••';
          } else {
            elemValue = rawVal.slice(0, 200);
          }
        }
      } catch {}
    }

    const text = extractCleanElementText(cand.node, maxTextLength);

    const indexedElem: IndexedElement = {
      index: assignedIndex,
      tagName: cand.tag,
      role: cand.node.getAttribute('role') || undefined,
      text: text || undefined,
      value: elemValue,
      attributes,
      rect: {
        x: Math.round(cand.rect.x),
        y: Math.round(cand.rect.y),
        width: Math.round(cand.rect.width),
        height: Math.round(cand.rect.height),
      },
      isInteractive: cand.isInteractive,
      isOccluded: occlusion.isOccluded,
      occludedBy: occlusion.occludedBy,
      inShadowDom: cand.inShadowDom,
      safeClickPoint: {
        x: occlusion.safeClickPoint.x,
        y: occlusion.safeClickPoint.y,
      },
    };

    indexedElements.push(indexedElem);
    prunedElementCount++;
    indexMap[assignedIndex] = {
      selector: attributes.id ? `#${attributes.id}` : `${cand.tag}`,
      frameId,
      tagName: cand.tag,
    };
  }

  // Calculate scroll guidance (pages_up / pages_down)
  const scrollY = window.scrollY || window.pageYOffset || document.documentElement.scrollTop || 0;
  const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 1;
  const totalHeight = Math.max(
    document.body?.scrollHeight || 0,
    document.documentElement?.scrollHeight || 0,
    document.body?.offsetHeight || 0,
    document.documentElement?.offsetHeight || 0,
    viewportHeight,
  );
  const pixelsAbove = Math.max(0, scrollY);
  const pixelsBelow = Math.max(0, totalHeight - (scrollY + viewportHeight));

  const pages_up = Number((pixelsAbove / viewportHeight).toFixed(1));
  const pages_down = Number((pixelsBelow / viewportHeight).toFixed(1));

  const scrollInfo = {
    pages_up,
    pages_down,
    scroll_y: Math.round(scrollY),
    total_height: Math.round(totalHeight),
    viewport_height: Math.round(viewportHeight),
  };

  const compressionRatio =
    totalOriginalNodes > 0
      ? Number(((totalOriginalNodes - prunedElementCount) / totalOriginalNodes).toFixed(4))
      : 0;

  const treeLines = indexedElements.map((el) => {
    if (outputFormat === 'html') {
      const attrStr = Object.entries(el.attributes)
        .map(([k, v]) => `${k}="${v}"`)
        .join(' ');
      const valPart = el.value ? ` value="${el.value}"` : '';
      const textPart = el.text ? ` "${el.text}"` : '';
      const occludedPart = el.isOccluded
        ? ` [occluded: partially by ${el.occludedBy || 'overlay'}]`
        : '';
      const shadowPart = el.inShadowDom ? ' [shadow]' : '';
      return `[${el.index}]${shadowPart} <${el.tagName}${attrStr ? ' ' + attrStr : ''}${valPart}>${textPart}</${el.tagName}>${occludedPart}`;
    }
    return renderCompactElementLine(el);
  });

  let treeString = treeLines.join('\n');

  let activeModal: string | undefined = undefined;
  let focusTrapped = false;
  let blockingLayerKind: 'modal' | 'mask' | undefined = undefined;

  try {
    const vpWidth = window.innerWidth || document.documentElement?.clientWidth || 1280;
    const vpHeight = window.innerHeight || document.documentElement?.clientHeight || 800;
    const vpArea = vpWidth * vpHeight;

    const positionedCandidates = Array.from(
      document.querySelectorAll(
        'dialog[open], [role="dialog"], [role="alertdialog"], [aria-modal="true"], div, section, aside',
      ),
    ) as HTMLElement[];

    let topBlocker: {
      el: HTMLElement;
      coverage: number;
      kind: 'modal' | 'mask';
      name?: string;
    } | null = null;

    for (const d of positionedCandidates) {
      if (!d || d.getAttribute('aria-hidden') === 'true') continue;
      const style = window.getComputedStyle(d);
      if (
        style.display === 'none' ||
        style.visibility === 'hidden' ||
        style.pointerEvents === 'none'
      )
        continue;
      const pos = style.position;
      const isPositioned = pos === 'fixed' || pos === 'absolute' || pos === 'sticky';
      const isDialogRole =
        d.tagName.toLowerCase() === 'dialog' ||
        d.getAttribute('role') === 'dialog' ||
        d.getAttribute('role') === 'alertdialog' ||
        d.getAttribute('aria-modal') === 'true';

      if (!isPositioned && !isDialogRole) continue;

      const rect = d.getBoundingClientRect();
      const ix = Math.max(0, Math.min(rect.right, vpWidth) - Math.max(rect.left, 0));
      const iy = Math.max(0, Math.min(rect.bottom, vpHeight) - Math.max(rect.top, 0));
      const cov = vpArea > 0 ? (ix * iy) / vpArea : 0;

      const qualifies = cov >= 0.6 || (isDialogRole && cov >= 0.12);
      if (!qualifies) continue;

      const hasInputs = !!d.querySelector('input, textarea, select, button, a');
      const kind: 'modal' | 'mask' =
        isDialogRole || hasInputs ? 'modal' : cov >= 0.85 ? 'mask' : 'modal';

      const tag = d.tagName.toLowerCase();
      const id = d.id ? `#${d.id}` : '';
      const name =
        d.getAttribute('aria-label') ||
        d.querySelector('h1, h2, h3, [role="heading"]')?.textContent?.trim()?.slice(0, 40);
      const desc = name
        ? `${tag}${id} "${name}"`
        : `${tag}${id || (kind === 'mask' ? '.mask' : '.modal')}`;

      if (!topBlocker || cov > topBlocker.coverage) {
        topBlocker = { el: d, coverage: cov, kind, name: desc };
      }
    }

    if (topBlocker) {
      focusTrapped = true;
      blockingLayerKind = topBlocker.kind;
      activeModal = topBlocker.name;
    }
  } catch {}

  try {
    if (!activeModal) {
      const dialogs = Array.from(
        document.querySelectorAll(
          'dialog[open], [role="dialog"], [role="alertdialog"], [aria-modal="true"]',
        ),
      ) as HTMLElement[];
      for (const d of dialogs) {
        const isAriaHidden = d.getAttribute('aria-hidden') === 'true';
        const isOpenAttr =
          d.tagName.toLowerCase() === 'dialog' ? (d as HTMLDialogElement).open : true;
        if (!isAriaHidden && isOpenAttr) {
          let isVis = false;
          try {
            const style = window.getComputedStyle(d);
            isVis = style.display !== 'none' && style.visibility !== 'hidden' && d.offsetWidth > 0;
          } catch {}
          if (isVis) {
            focusTrapped = true;
            const tag = d.tagName.toLowerCase();
            const id = d.id ? `#${d.id}` : '';
            const name =
              d.getAttribute('aria-label') ||
              d.querySelector('h1, h2, h3, [role="heading"]')?.textContent?.trim()?.slice(0, 40);
            activeModal = name ? `${tag}${id} "${name}"` : `${tag}${id || '.modal'}`;
            break;
          }
        }
      }
    }
  } catch {}

  if (activeModal) {
    treeString =
      `[Modal Guidance: Active modal focus trap (${activeModal}). Prioritize interacting with modal elements or dismissing it.]\n` +
      treeString;
  }

  if (pages_down > 0 || pages_up > 0) {
    treeString =
      `[Scroll Guidance: ${pages_up} pages above, ${pages_down} pages below. Use chrome_interact_index / scroll to reveal more content.]\n` +
      treeString;
  }

  // Handle visual Set-of-Mark badges if highlight is enabled
  if (options?.highlight) {
    inPageRenderHighlights(indexedElements);
  }

  (globalThis as any)[Symbol.for('__browser_use_page_assets__')] = assetRegistry;

  return {
    treeString,
    elementCount: prunedElementCount,
    // Informational nodes (h1-h6, th, role=alert/status/heading, aria-live) are
    // indexed with isInteractive:false, so counting every indexed element here
    // made interactiveCount identical to elementCount and told the agent nothing.
    interactiveCount: indexedElements.filter((el) => el.isInteractive).length,
    compressionRatio,
    indexMap,
    indexedElements,
    assets,
    pages_up,
    pages_down,
    scrollInfo,
    activeModal,
    focusTrapped: focusTrapped || undefined,
  };
}

export function actionPointForElement(
  target: Element,
  view: Window,
): { x: number; y: number } | null {
  const rects = Array.from(target.getClientRects?.() || []).filter(
    (rect) => rect.width > 0 && rect.height > 0,
  );
  if (rects.length === 0) {
    const rect = target.getBoundingClientRect?.();
    if (!rect || rect.width <= 0 || rect.height <= 0) return null;
    rects.push(rect);
  }

  let best = null;
  for (const rect of rects) {
    const left = Math.max(0, rect.left);
    const top = Math.max(0, rect.top);
    const right = Math.min(view.innerWidth, rect.right);
    const bottom = Math.min(view.innerHeight, rect.bottom);
    const visibleArea = Math.max(0, right - left) * Math.max(0, bottom - top);

    const centerX = (rect.left + rect.right) / 2;
    const centerY = (rect.top + rect.bottom) / 2;
    const distanceX = centerX - Math.max(0, Math.min(view.innerWidth, centerX));
    const distanceY = centerY - Math.max(0, Math.min(view.innerHeight, centerY));
    const viewportDistance = distanceX * distanceX + distanceY * distanceY;

    if (
      !best ||
      visibleArea > best.visibleArea ||
      (visibleArea === best.visibleArea && viewportDistance < best.viewportDistance)
    ) {
      best = { rect, left, top, right, bottom, visibleArea, viewportDistance };
    }
  }

  if (best && best.visibleArea > 0) {
    return {
      x: (best.left + best.right) / 2,
      y: (best.top + best.bottom) / 2,
    };
  }

  if (best) {
    return {
      x: (best.rect.left + best.rect.right) / 2,
      y: (best.rect.top + best.rect.bottom) / 2,
    };
  }
  return null;
}

export function scrollRequestForPoint(
  target: Element,
  x: number,
  y: number,
): { x: number; y: number; deltaX: number; deltaY: number } | null {
  const view = target.ownerDocument?.defaultView;
  if (!view) return null;

  let ancestor = composedParent(target);
  while (ancestor) {
    if (
      ancestor !== target.ownerDocument.body &&
      ancestor !== target.ownerDocument.documentElement
    ) {
      const style = view.getComputedStyle(ancestor);
      const canScrollX =
        /^(auto|scroll|overlay)$/.test(style.overflowX) &&
        ancestor.scrollWidth > ancestor.clientWidth + 1;
      const canScrollY =
        /^(auto|scroll|overlay)$/.test(style.overflowY) &&
        ancestor.scrollHeight > ancestor.clientHeight + 1;

      if (canScrollX || canScrollY) {
        const rect = ancestor.getBoundingClientRect();
        const area = {
          left: Math.max(0, rect.left),
          top: Math.max(0, rect.top),
          right: Math.min(view.innerWidth, rect.right),
          bottom: Math.min(view.innerHeight, rect.bottom),
        };

        if (area.right > area.left && area.bottom > area.top) {
          let deltaX =
            canScrollX && (x < area.left || x >= area.right) ? x - (area.left + area.right) / 2 : 0;
          let deltaY =
            canScrollY && (y < area.top || y >= area.bottom) ? y - (area.top + area.bottom) / 2 : 0;

          if (
            (deltaX < 0 && ancestor.scrollLeft <= 0) ||
            (deltaX > 0 && ancestor.scrollLeft >= ancestor.scrollWidth - ancestor.clientWidth - 1)
          )
            deltaX = 0;
          if (
            (deltaY < 0 && ancestor.scrollTop <= 0) ||
            (deltaY > 0 && ancestor.scrollTop >= ancestor.scrollHeight - ancestor.clientHeight - 1)
          )
            deltaY = 0;

          if (deltaX || deltaY) {
            return {
              x: (area.left + area.right) / 2,
              y: (area.top + area.bottom) / 2,
              deltaX,
              deltaY,
            };
          }
        }
      }
    }
    ancestor = composedParent(ancestor);
  }

  if (x >= 0 && y >= 0 && x < view.innerWidth && y < view.innerHeight) return null;

  return {
    x: Math.max(0, Math.min(view.innerWidth - 1, x)),
    y: Math.max(0, Math.min(view.innerHeight - 1, y)),
    deltaX: x - view.innerWidth / 2,
    deltaY: y - view.innerHeight / 2,
  };
}

export function extractElementLocationDetails(el: Element): {
  success: boolean;
  x: number;
  y: number;
  width: number;
  height: number;
  tagName: string;
  inputType?: string;
  text?: string;
  value?: string;
  frameOffsetX: number;
  frameOffsetY: number;
} {
  const win = el.ownerDocument?.defaultView || window;
  const initialRect = el.getBoundingClientRect();
  const vh = win.innerHeight || 0;
  const vw = win.innerWidth || 0;
  const inViewport =
    vh > 0 &&
    vw > 0 &&
    initialRect.top >= 0 &&
    initialRect.bottom <= vh &&
    initialRect.left >= 0 &&
    initialRect.right <= vw &&
    initialRect.width > 0 &&
    initialRect.height > 0;

  if (!inViewport) {
    // Try local scroll first
    const point = actionPointForElement(el, win);
    if (point) {
      const scrollReq = scrollRequestForPoint(el, point.x, point.y);
      if (scrollReq && (scrollReq.deltaX || scrollReq.deltaY)) {
        let ancestor = composedParent(el);
        let scrolled = false;
        while (ancestor && !scrolled) {
          if (ancestor !== el.ownerDocument.body && ancestor !== el.ownerDocument.documentElement) {
            const style = win.getComputedStyle(ancestor);
            const canScrollX =
              /^(auto|scroll|overlay)$/.test(style.overflowX) &&
              ancestor.scrollWidth > ancestor.clientWidth + 1;
            const canScrollY =
              /^(auto|scroll|overlay)$/.test(style.overflowY) &&
              ancestor.scrollHeight > ancestor.clientHeight + 1;
            if (canScrollX || canScrollY) {
              ancestor.scrollBy({
                left: scrollReq.deltaX,
                top: scrollReq.deltaY,
                behavior: 'instant' as any,
              });
              scrolled = true;
            }
          }
          ancestor = composedParent(ancestor);
        }
        if (!scrolled) {
          try {
            if (typeof (el as any).scrollIntoView === 'function') {
              el.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' as any });
            }
          } catch {}
        }
      } else {
        try {
          if (typeof (el as any).scrollIntoView === 'function') {
            el.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' as any });
          }
        } catch {}
      }
    } else {
      try {
        if (typeof (el as any).scrollIntoView === 'function') {
          el.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' as any });
        }
      } catch {}
    }
  }

  const rect = el.getBoundingClientRect();
  const text = extractCleanElementText(el).slice(0, 100);

  // Calculate cumulative viewport offset if inside an iframe (with border and zoom compensation)
  let frameOffsetX = 0;
  let frameOffsetY = 0;
  try {
    let curWin: Window = window;
    while (curWin !== curWin.top) {
      if (curWin.frameElement) {
        const fEl = curWin.frameElement;
        const fRect = fEl.getBoundingClientRect();
        const parentWin = curWin.parent || fEl.ownerDocument?.defaultView || window;
        const fStyle =
          typeof parentWin.getComputedStyle === 'function'
            ? parentWin.getComputedStyle(fEl)
            : undefined;
        const borderLeft = parseFloat(fStyle?.borderLeftWidth || '0') || 0;
        const borderTop = parseFloat(fStyle?.borderTopWidth || '0') || 0;
        const zoom = parseFloat((fStyle as any)?.zoom || '1') || 1;

        frameOffsetX += (fRect.left + borderLeft) / zoom;
        frameOffsetY += (fRect.top + borderTop) / zoom;
        curWin = curWin.parent;
      } else {
        break;
      }
    }
  } catch {
    // Cross-origin boundary fallback
  }

  const safePoint = safeClickPointWeakMap.get(el);
  let clickX, clickY;
  if (safePoint) {
    clickX = rect.left + safePoint.offsetX;
    clickY = rect.top + safePoint.offsetY;
  } else {
    const bestPoint = actionPointForElement(el, win);
    if (bestPoint) {
      clickX = bestPoint.x;
      clickY = bestPoint.y;
    } else {
      clickX = rect.left + rect.width / 2;
      clickY = rect.top + rect.height / 2;
    }
  }

  return {
    success: true,
    x: Math.round(clickX + frameOffsetX),
    y: Math.round(clickY + frameOffsetY),
    width: Math.round(rect.width),
    height: Math.round(rect.height),
    tagName: el.tagName.toLowerCase(),
    inputType:
      typeof (el as HTMLInputElement).type === 'string'
        ? (el as HTMLInputElement).type.toLowerCase()
        : undefined,
    text,
    value:
      typeof (globalThis as any).HTMLInputElement !== 'undefined' &&
      (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)
        ? String((el as any).value ?? '')
        : typeof (el as any)?.value === 'string'
          ? (el as any).value
          : undefined,
    frameOffsetX,
    frameOffsetY,
  };
}

/**
 * Retrieve element coordinates and info for native CDP interaction.
 * Supports numeric 1-based index or string ref (e.g. "1" or "ref_1").
 */
export function inPageGetElementCoordinates(refOrIndex: number | string): {
  success: boolean;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  tagName?: string;
  text?: string;
  value?: string;
  frameOffsetX?: number;
  frameOffsetY?: number;
  error?: string;
} {
  let index: number;
  if (typeof refOrIndex === 'string') {
    const parsed = refOrIndex.startsWith('ref_')
      ? parseInt(refOrIndex.slice(4), 10)
      : parseInt(refOrIndex, 10);
    if (isNaN(parsed)) {
      return { success: false, error: `Invalid index or ref format: ${refOrIndex}` };
    }
    index = parsed;
  } else {
    index = refOrIndex;
  }

  if (index <= 0) {
    return {
      success: false,
      error: `Index must be a positive 1-based integer. Received: ${index}`,
    };
  }

  const el = findIndexedElement(index);
  if (!el || !(el instanceof Element)) {
    return {
      success: false,
      error: `Element with index [${index}] not found in active DOM index map. ${DIAGNOSTIC_REFRESH_GUIDANCE}`,
    };
  }

  return extractElementLocationDetails(el);
}

/**
 * Post-dispatch delivery verification for CDP Input events.
 *
 * Chrome throttles CDP input to occluded/hidden tabs: the command acks
 * successfully but the renderer never records the event (TESTING-NOTES #27),
 * producing phantom successes. document.elementFromPoint cannot detect this -
 * layout is computed on demand even in hidden tabs - so verification uses
 * one-shot capture listeners armed BEFORE dispatch: if no trusted event
 * arrives, the input never reached the renderer.
 */
// Returns a marker because executeInPage's retrieve protocol throws on
// undefined returns (its undefined sentinel means 'entrypoint vanished').
export function inPageArmDeliveryProbe(events: string[]): { armed: true } {
  const g = globalThis as any;
  const prev = g.__MCP_DELIVERY_PROBE__;
  if (prev && typeof prev.remove === 'function') {
    try {
      prev.remove();
    } catch {}
  }
  const probe: any = { events, hits: [], armed: true, remove: () => {} };
  const listener = (e: Event) => {
    if (!probe.armed) return;
    probe.hits.push({
      type: e.type,
      isTrusted: (e as any).isTrusted === true,
      target: (e.target as Element | null | undefined)?.tagName?.toLowerCase?.(),
    });
    if (probe.hits.length > 8) probe.hits.shift();
  };
  probe.remove = () => {
    for (const t of events) {
      document.removeEventListener(t, listener, true);
    }
  };
  for (const t of events) {
    document.addEventListener(t, listener, true);
  }
  g.__MCP_DELIVERY_PROBE__ = probe;
  return { armed: true };
}

export function inPageReadDeliveryProbe(disarm?: boolean): {
  delivered: boolean;
  hits: any[];
  missing?: boolean;
} {
  const probe = (globalThis as any).__MCP_DELIVERY_PROBE__;
  if (!probe) return { delivered: false, hits: [], missing: true };
  const hits = probe.hits.slice();
  if (disarm !== false) {
    probe.armed = false;
    try {
      probe.remove();
    } catch {}
  }
  return { delivered: hits.length > 0, hits };
}

/**
 * Locate element coordinates and info using CSS or XPath selector.
 */
export function inPageLocateBySelector(
  selector: string,
  selectorType?: 'css' | 'xpath',
): {
  success: boolean;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  tagName?: string;
  text?: string;
  value?: string;
  frameOffsetX?: number;
  frameOffsetY?: number;
  error?: string;
} {
  if (!selector || typeof selector !== 'string') {
    return { success: false, error: 'Selector parameter must be a non-empty string' };
  }

  try {
    let targetEl: Element | null = null;
    const isXPath =
      selectorType === 'xpath' ||
      selector.startsWith('//') ||
      selector.startsWith('(') ||
      selector.startsWith('/html');

    if (isXPath && typeof document !== 'undefined' && typeof document.evaluate === 'function') {
      const xRes = document.evaluate(
        selector,
        document,
        null,
        XPathResult.FIRST_ORDERED_NODE_TYPE,
        null,
      );
      if (xRes.singleNodeValue instanceof Element) {
        targetEl = xRes.singleNodeValue;
      }
    } else if (typeof document !== 'undefined' && typeof document.querySelector === 'function') {
      targetEl = document.querySelector(selector);
    }

    if (!targetEl) {
      return { success: false, error: `Element not found by selector: ${selector}` };
    }

    return extractElementLocationDetails(targetEl);
  } catch (err) {
    return {
      success: false,
      error: `Selector lookup error: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

/**
 * Locate element coordinates and info by visible text content and/or ARIA role.
 */
export function inPageLocateByText(
  text: string,
  role?: string,
): {
  success: boolean;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  tagName?: string;
  text?: string;
  value?: string;
  frameOffsetX?: number;
  frameOffsetY?: number;
  error?: string;
} {
  if (!text && !role) {
    return { success: false, error: 'Either text or role must be provided' };
  }

  try {
    const normalizedTarget = (text || '').trim().toLowerCase();
    const selector = role
      ? `[role="${role}"], ${role}`
      : 'button, a, input, textarea, select, span, p, div, h1, h2, h3, h4, [role]';
    let elements: NodeListOf<Element>;
    try {
      elements = document.querySelectorAll(selector);
    } catch {
      elements = document.querySelectorAll('*');
    }

    let bestMatch: Element | null = null;
    let bestScore = -1;

    for (let i = 0; i < elements.length; i++) {
      const el = elements[i];
      if (!(el instanceof Element)) continue;
      const style = window.getComputedStyle(el);
      if (
        style.display === 'none' ||
        style.visibility === 'hidden' ||
        parseFloat(style.opacity || '1') <= 0
      )
        continue;
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) continue;

      if (role) {
        const elRole = el.getAttribute('role')?.toLowerCase() || el.tagName.toLowerCase();
        if (elRole !== role.toLowerCase()) continue;
      }

      if (normalizedTarget) {
        const elText = (el.textContent || '').trim().toLowerCase();
        const ariaLabel = (el.getAttribute('aria-label') || '').trim().toLowerCase();
        const placeholder = (el.getAttribute('placeholder') || '').trim().toLowerCase();

        if (
          elText === normalizedTarget ||
          ariaLabel === normalizedTarget ||
          placeholder === normalizedTarget
        ) {
          bestMatch = el;
          bestScore = 100;
          break; // exact match
        }
        if (elText.includes(normalizedTarget) || ariaLabel.includes(normalizedTarget)) {
          if (bestScore < 50) {
            bestMatch = el;
            bestScore = 50;
          }
        }
      } else {
        // Only role was specified
        bestMatch = el;
        bestScore = 10;
        break;
      }
    }

    if (!bestMatch) {
      return {
        success: false,
        error: `Element not found matching text="${text}" role="${role || ''}"`,
      };
    }

    return extractElementLocationDetails(bestMatch);
  } catch (err) {
    return {
      success: false,
      error: `Text lookup error: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

/**
 * Return the current frame's origin (used to distinguish cross-origin subframes from
 * same-origin iframes whose cumulative frame offset is 0).
 */
export function inPageGetFrameOrigin(): string {
  try {
    return window.location.origin;
  } catch {
    return '';
  }
}

/**
 * Retrieve element crop rectangle (viewport-relative) with optional padding for region-of-interest screenshot.
 * Optionally expands small elements (< 100x100) to a contextual bounding box (Midscene-inspired expandSearchArea).
 */
export function inPageGetIndexCropRect(
  index: number,
  padding: number = 0,
  autoExpand: boolean = false,
): {
  success: boolean;
  rect?: { x: number; y: number; width: number; height: number };
  devicePixelRatio?: number;
  error?: string;
} {
  if (index <= 0) {
    return {
      success: false,
      error: `Index must be a positive 1-based integer. Received: ${index}`,
    };
  }

  const el = findIndexedElement(index);
  if (!el || !(el instanceof Element)) {
    return {
      success: false,
      error: `Element with index [${index}] not found in active DOM index map. ${DIAGNOSTIC_REFRESH_GUIDANCE}`,
    };
  }

  try {
    el.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' as any });
  } catch {}

  const rawRect = el.getBoundingClientRect();

  let frameOffsetX = 0;
  let frameOffsetY = 0;
  try {
    let curWin: Window = window;
    while (curWin !== curWin.top) {
      if (curWin.frameElement) {
        const fEl = curWin.frameElement;
        const fRect = fEl.getBoundingClientRect();
        const parentWin = curWin.parent || fEl.ownerDocument?.defaultView || window;
        const fStyle =
          typeof parentWin.getComputedStyle === 'function'
            ? parentWin.getComputedStyle(fEl)
            : undefined;
        const borderLeft = parseFloat(fStyle?.borderLeftWidth || '0') || 0;
        const borderTop = parseFloat(fStyle?.borderTopWidth || '0') || 0;
        const zoom = parseFloat((fStyle as any)?.zoom || '1') || 1;

        frameOffsetX += (fRect.left + borderLeft) / zoom;
        frameOffsetY += (fRect.top + borderTop) / zoom;
        curWin = curWin.parent;
      } else {
        break;
      }
    }
  } catch {}

  // Micro-element adaptive expansion (Midscene-inspired expandSearchArea)
  // For small elements (< 100x100), expand to retain surrounding table headers, labels, and context
  let effectivePadding = Math.max(0, padding);
  if (autoExpand && (rawRect.width < 100 || rawRect.height < 100)) {
    // Expand by at least 100px on each side (or expand to at least 200x200)
    const minBoundingSize = 200;
    const neededPadX = Math.max(0, Math.round((minBoundingSize - rawRect.width) / 2));
    const neededPadY = Math.max(0, Math.round((minBoundingSize - rawRect.height) / 2));
    effectivePadding = Math.max(effectivePadding, Math.max(100, Math.max(neededPadX, neededPadY)));
  }

  const left = Math.max(0, Math.round(rawRect.left + frameOffsetX - effectivePadding));
  const top = Math.max(0, Math.round(rawRect.top + frameOffsetY - effectivePadding));
  const maxW =
    typeof window !== 'undefined' && typeof window.innerWidth === 'number' && window.innerWidth > 0
      ? Math.max(1, window.innerWidth - left)
      : undefined;
  const maxH =
    typeof window !== 'undefined' &&
    typeof window.innerHeight === 'number' &&
    window.innerHeight > 0
      ? Math.max(1, window.innerHeight - top)
      : undefined;
  const rawWidth = Math.round(rawRect.width + effectivePadding * 2);
  const rawHeight = Math.round(rawRect.height + effectivePadding * 2);
  const width = Math.max(1, maxW !== undefined ? Math.min(rawWidth, maxW) : rawWidth);
  const height = Math.max(1, maxH !== undefined ? Math.min(rawHeight, maxH) : rawHeight);

  return {
    success: true,
    rect: { x: left, y: top, width, height },
    devicePixelRatio: window.devicePixelRatio || 1,
  };
}

/**
 * One-shot pointer-move delivery for CDP-synthetic pointer drags: CDP routes
 * mouseMoved by hit-testing and page-side setPointerCapture does not stick
 * under synthetic presses, so narrow targets (resize handles, sliders) miss
 * every move once the cursor leaves their few-pixel hit area. Deliver the
 * final pointermove straight to the element under the press point carrying
 * the real end coordinates, so its onPointerMove sees the true final position.
 */
export function inPagePointerDragMove(
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
): { success: boolean; tag?: string; error?: string } {
  try {
    const el = document.elementFromPoint(fromX, fromY);
    if (!el) {
      return { success: false, error: `No element at point (${fromX}, ${fromY})` };
    }
    el.dispatchEvent(
      new PointerEvent('pointermove', {
        bubbles: true,
        cancelable: true,
        composed: true,
        pointerId: 1,
        pointerType: 'mouse',
        isPrimary: true,
        clientX: toX,
        clientY: toY,
        button: -1,
        buttons: 1,
      }),
    );
    return {
      success: true,
      tag: el.id || el.tagName.toLowerCase(),
    };
  } catch (err) {
    return { success: false, error: String(err instanceof Error ? err.message : err) };
  }
}

/**
 * Perform fallback in-page interaction by 1-based index inside active tab.
 */
/**
 * Focus an indexed element without firing click handlers.
 * chrome_keyboard previously used inPageInteractIndex(index, 'click'), which both
 * fired the element's click handlers as a side effect and never actually moved
 * focus for non-focusable nodes — so subsequent key events landed on whatever
 * document.activeElement already was. This focuses first, then falls back to a
 * click only for elements that cannot take focus directly.
 */
export function inPageFocusIndex(index: number): {
  success: boolean;
  index: number;
  tagName?: string;
  focused?: boolean;
  error?: string;
} {
  if (index <= 0) {
    return {
      success: false,
      index,
      error: `Index must be a positive 1-based integer. Received: ${index}`,
    };
  }

  const el = findIndexedElement(index);
  if (!el || !(el instanceof Element)) {
    return {
      success: false,
      index,
      error: `Element with index [${index}] not found in active DOM index map. ${DIAGNOSTIC_REFRESH_GUIDANCE}`,
    };
  }

  try {
    el.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' as any });
  } catch {}

  const htmlEl = el as HTMLElement;
  let focused = false;
  try {
    if (typeof htmlEl.focus === 'function') {
      htmlEl.focus({ preventScroll: true });
      focused = document.activeElement === el || el.contains(document.activeElement);
    }
  } catch {}

  // Non-focusable containers (plain div/li/canvas): make them programmatically
  // focusable for this session so keyboard events target the intended node.
  if (!focused && !el.hasAttribute('tabindex')) {
    try {
      el.setAttribute('tabindex', '-1');
      htmlEl.focus({ preventScroll: true });
      focused = document.activeElement === el || el.contains(document.activeElement);
    } catch {}
  }

  return {
    success: true,
    index,
    tagName: el.tagName.toLowerCase(),
    focused,
  };
}

export function inPageInteractIndex(
  index: number,
  action: 'click' | 'hover' | 'double_click' | 'right_click' = 'click',
): { success: boolean; index: number; tagName?: string; text?: string; error?: string } {
  if (index <= 0) {
    return {
      success: false,
      index,
      error: `Index must be a positive 1-based integer. Received: ${index}`,
    };
  }

  const el = findIndexedElement(index);
  if (!el || !(el instanceof Element)) {
    return {
      success: false,
      index,
      error: `Element with index [${index}] not found in active DOM index map. ${DIAGNOSTIC_REFRESH_GUIDANCE}`,
    };
  }

  try {
    el.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' as any });
  } catch {}

  const text = ((el as HTMLElement).innerText || el.textContent || '').trim().slice(0, 100);

  if (action === 'click') {
    el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
    (el as HTMLElement).click?.();
  } else if (action === 'double_click') {
    el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
    (el as HTMLElement).click?.();
    el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
    (el as HTMLElement).click?.();
    el.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true }));
  } else if (action === 'right_click') {
    const rawRect = el.getBoundingClientRect();
    const cx = Math.round(rawRect.left + rawRect.width / 2);
    const cy = Math.round(rawRect.top + rawRect.height / 2);
    const mouseOpts: MouseEventInit = {
      bubbles: true,
      cancelable: true,
      button: 2,
      buttons: 2,
      clientX: cx,
      clientY: cy,
    };
    try {
      el.dispatchEvent(new PointerEvent('pointerdown', { ...mouseOpts, pointerType: 'mouse' }));
    } catch {}
    el.dispatchEvent(new MouseEvent('mousedown', mouseOpts));
    try {
      el.dispatchEvent(
        new PointerEvent('pointerup', { ...mouseOpts, buttons: 0, pointerType: 'mouse' }),
      );
    } catch {}
    el.dispatchEvent(new MouseEvent('mouseup', { ...mouseOpts, buttons: 0 }));
    el.dispatchEvent(new MouseEvent('contextmenu', mouseOpts));
  } else if (action === 'hover') {
    el.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true, cancelable: true }));
    el.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, cancelable: true }));
    el.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, cancelable: true }));
  }

  return {
    success: true,
    index,
    tagName: el.tagName.toLowerCase(),
    text,
  };
}

/**
 * Fill input or textarea by 1-based index inside active tab.
 */
export function inPageFillIndex(
  refOrIndex: number | string,
  textToFill: string,
  clear = true,
): { success: boolean; index: number; tagName?: string; filledText?: string; error?: string } {
  let index: number;
  if (typeof refOrIndex === 'string') {
    const parsed = refOrIndex.startsWith('ref_')
      ? parseInt(refOrIndex.slice(4), 10)
      : parseInt(refOrIndex, 10);
    if (isNaN(parsed)) {
      return {
        success: false,
        index: 0,
        error: `Invalid index or ref format: ${refOrIndex}`,
      };
    }
    index = parsed;
  } else {
    index = refOrIndex;
  }

  if (index <= 0) {
    return {
      success: false,
      index,
      error: `Index must be a positive 1-based integer. Received: ${index}`,
    };
  }

  const el = findIndexedElement(index);
  if (!el || !(el instanceof Element)) {
    return {
      success: false,
      index,
      error: `Element with index [${index}] not found in active DOM index map. ${DIAGNOSTIC_REFRESH_GUIDANCE}`,
    };
  }

  try {
    el.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' as any });
  } catch {}

  if (typeof (el as HTMLElement).focus === 'function') {
    (el as HTMLElement).focus();
  }

  const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement?.prototype || {},
    'value',
  )?.set;
  const nativeCheckboxSetter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement?.prototype || {},
    'checked',
  )?.set;
  const nativeTextAreaValueSetter = Object.getOwnPropertyDescriptor(
    window.HTMLTextAreaElement?.prototype || {},
    'value',
  )?.set;

  if (el instanceof HTMLInputElement && (el.type === 'checkbox' || el.type === 'radio')) {
    const isTruthy =
      textToFill === 'true' ||
      textToFill === '1' ||
      textToFill === 'checked' ||
      textToFill === 'on' ||
      (textToFill !== 'false' && textToFill !== '0' && textToFill !== 'off' && Boolean(textToFill));
    if (nativeCheckboxSetter) {
      nativeCheckboxSetter.call(el, isTruthy);
    } else {
      el.checked = isTruthy;
    }
  } else if (el instanceof HTMLInputElement && nativeInputValueSetter) {
    if (clear) nativeInputValueSetter.call(el, '');
    nativeInputValueSetter.call(el, textToFill);
  } else if (el instanceof HTMLTextAreaElement && nativeTextAreaValueSetter) {
    if (clear) nativeTextAreaValueSetter.call(el, '');
    nativeTextAreaValueSetter.call(el, textToFill);
  } else if (el instanceof HTMLSelectElement) {
    let matched = false;
    for (const opt of Array.from(el.options)) {
      if (
        opt.value === textToFill ||
        opt.text === textToFill ||
        opt.text.trim() === textToFill.trim()
      ) {
        el.value = opt.value;
        matched = true;
        break;
      }
    }
    if (!matched) el.value = textToFill;
  } else if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
    if (clear) {
      el.value = '';
    }
    el.value = textToFill;
  } else if ((el as HTMLElement).isContentEditable) {
    if (clear) {
      (el as HTMLElement).innerText = '';
    }
    (el as HTMLElement).innerText = textToFill;
  } else {
    (el as any).value = textToFill;
  }

  el.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
  el.dispatchEvent(new Event('change', { bubbles: true, composed: true }));

  return {
    success: true,
    index,
    tagName: el.tagName.toLowerCase(),
    filledText: textToFill,
  };
}

/**
 * Extract clean hierarchical markdown from document.
 * Deeply traverses paragraphs and containers to preserve links, bold, code, and structural elements.
 */
export function inPageExtractMarkdown(includeLinks = true, fit = false): string {
  const droppedTags = new Set([
    'script',
    'style',
    'head',
    'meta',
    'link',
    'title',
    'noscript',
    'template',
    'svg',
  ]);

  function isVisible(el: Element): boolean {
    if (!(el instanceof HTMLElement)) return true;
    const style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden') return false;
    if (parseFloat(style.opacity || '1') <= 0) return false;
    return true;
  }

  // fit 模式：crawl4ai 式启发降噪（chrome fit-markdown 的浏览器内等价物）。
  // 只删结构性噪声，不做 BM25/评分——agent 自己会过滤内容。
  let fitRoot: ParentNode = document;
  const fitNoise = new Set<Element>();
  if (fit) {
    try {
      const main = document.querySelector('article, main, [role=main], #content, .content');
      fitRoot =
        main instanceof HTMLElement && main.innerText.trim().length > 200 ? main : document.body;
      const noise = fitRoot.querySelectorAll(
        'nav, header, footer, aside, form, [role=navigation], [role=banner], [role=contentinfo], [aria-hidden=true]',
      );
      noise.forEach((el) => fitNoise.add(el));
    } catch {}
  }

  function serializeChildren(node: Node): string {
    let res = '';
    for (const child of Array.from(node.childNodes)) {
      res += serializeNode(child);
    }
    return res;
  }

  function serializeNode(node: Node): string {
    if (node.nodeType === Node.TEXT_NODE) {
      return (node.textContent || '').replace(/\r\n/g, '\n');
    }

    if (node.nodeType !== Node.ELEMENT_NODE) {
      return '';
    }

    const el = node as Element;
    const tag = el.tagName.toLowerCase();
    if (droppedTags.has(tag)) return '';
    if (fitNoise.size > 0 && fitNoise.has(el)) return '';
    if (!isVisible(el)) return '';

    // Handle image elements
    if (tag === 'img') {
      const src = (el as HTMLImageElement).src || el.getAttribute('src') || '';
      const alt = el.getAttribute('alt') || '';
      if (!src) return '';
      return alt ? `![${alt}](${src})` : `![](${src})`;
    }

    // Handle horizontal rule and line break
    if (tag === 'hr') return '\n\n---\n\n';
    if (tag === 'br') return '\n';

    let inner = '';
    const shadow = getShadowRoot(el);
    if (shadow) {
      for (const child of Array.from(shadow.childNodes)) {
        inner += serializeNode(child);
      }
    } else {
      inner = serializeChildren(el);
    }

    const trimmed = inner.trim();

    // Preserve whitespace around inline formatting tokens
    const leadingSpace = inner.match(/^\s*/)?.[0] || '';
    const trailingSpace = inner.match(/\s*$/)?.[0] || '';

    switch (tag) {
      case 'h1':
        return trimmed ? `\n\n# ${trimmed}\n\n` : '';
      case 'h2':
        return trimmed ? `\n\n## ${trimmed}\n\n` : '';
      case 'h3':
        return trimmed ? `\n\n### ${trimmed}\n\n` : '';
      case 'h4':
        return trimmed ? `\n\n#### ${trimmed}\n\n` : '';
      case 'h5':
        return trimmed ? `\n\n##### ${trimmed}\n\n` : '';
      case 'h6':
        return trimmed ? `\n\n###### ${trimmed}\n\n` : '';
      case 'p':
        return trimmed ? `\n\n${trimmed}\n\n` : '';
      case 'a': {
        const href = (el as HTMLAnchorElement).href || el.getAttribute('href');
        if (includeLinks && href && trimmed) {
          return `${leadingSpace}[${trimmed}](${href})${trailingSpace}`;
        }
        return `${leadingSpace}${trimmed}${trailingSpace}`;
      }
      case 'strong':
      case 'b':
        return trimmed ? `${leadingSpace}**${trimmed}**${trailingSpace}` : '';
      case 'em':
      case 'i':
        return trimmed ? `${leadingSpace}*${trimmed}*${trailingSpace}` : '';
      case 'code':
        return trimmed ? `${leadingSpace}\`${trimmed}\`${trailingSpace}` : '';
      case 'pre': {
        const codeText = (el.textContent || '').trim();
        return codeText ? `\n\n\`\`\`\n${codeText}\n\`\`\`\n\n` : '';
      }
      case 'blockquote':
        return trimmed ? `\n\n> ${trimmed.replace(/\n/g, '\n> ')}\n\n` : '';
      case 'li': {
        const parentTag = el.parentElement?.tagName.toLowerCase();
        if (parentTag === 'ol') {
          const siblings = Array.from(el.parentElement?.children || []).filter(
            (c) => c.tagName.toLowerCase() === 'li',
          );
          const idx = siblings.indexOf(el) + 1;
          return `\n${idx > 0 ? idx : 1}. ${trimmed}`;
        }
        return trimmed ? `\n- ${trimmed}` : '';
      }
      case 'ul':
      case 'ol':
        return trimmed ? `\n\n${trimmed}\n\n` : '';
      case 'button':
        return trimmed ? `[Button: ${trimmed}]` : '';
      case 'table':
        return trimmed ? `\n\n${trimmed}\n\n` : '';
      case 'tr': {
        const cells = Array.from(el.children).filter(
          (c) => c.tagName.toLowerCase() === 'td' || c.tagName.toLowerCase() === 'th',
        );
        if (cells.length === 0) return '';
        const rowStr =
          '| ' +
          cells.map((c) => (c.textContent || '').trim().replace(/\|/g, '\\|')).join(' | ') +
          ' |';
        const isHeaderRow =
          cells.every((c) => c.tagName.toLowerCase() === 'th') ||
          el.parentElement?.tagName.toLowerCase() === 'thead';
        if (isHeaderRow) {
          const sep = '| ' + cells.map(() => '---').join(' | ') + ' |';
          return `\n${rowStr}\n${sep}`;
        }
        return `\n${rowStr}`;
      }
      case 'td':
      case 'th':
        return trimmed;
      case 'thead':
      case 'tbody':
      case 'tfoot':
        return inner;
      case 'div':
      case 'section':
      case 'article':
      case 'main':
      case 'header':
      case 'footer':
      case 'aside':
      case 'nav':
        return trimmed ? `\n\n${trimmed}\n\n` : '';
      default:
        return inner;
    }
  }

  const rawSource: Node = fit ? fitRoot : (document.body as Node);
  const raw = rawSource ? serializeNode(rawSource) : '';

  // Apply light SPA JSON blob cleanup mirroring browser-use
  const processed = raw
    .replace(/`\{["\w].*?\}`/gs, '')
    .replace(/\{"\$type":[^}]{100,}\}/g, '')
    .replace(/\{"[^"]{5,}":\{[^}]{100,}\}/g, '');

  const lines = processed.split('\n');
  const filteredLines: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.length > 100 && (trimmed.startsWith('{') || trimmed.startsWith('{"'))) {
      try {
        JSON.parse(trimmed);
        continue;
      } catch {}
    }
    filteredLines.push(line.trimEnd());
  }

  try {
    delete (window as any).__mcpFitNoise__;
  } catch {}

  return filteredLines
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export interface DropdownOptionItem {
  text: string;
  value: string;
  index: number;
  selected: boolean;
}

export interface DropdownOptionsResult {
  success: boolean;
  type: 'select' | 'aria' | 'custom';
  id?: string;
  name?: string;
  options: DropdownOptionItem[];
  error?: string;
}

/**
 * In-page dropdown options extractor.
 * Supports native <select>, ARIA comboboxes/menus, and common custom UI dropdowns.
 * Lives here (not get-dropdown-options.ts) so the bundled inpage-engine script
 * can register it for file-based injection.
 */
export async function inPageExtractDropdownOptions(
  targetIndex?: number,
  targetSelector?: string,
): Promise<DropdownOptionsResult> {
  let element: Element | null = null;
  if (typeof targetIndex === 'number' && targetIndex > 0) {
    element = findIndexedElement(targetIndex);
  }
  if (!element && targetSelector) {
    element = document.querySelector(targetSelector);
  }

  if (!element) {
    return {
      success: false,
      type: 'select',
      options: [],
      error: `Element not found for index: ${targetIndex} or selector: ${targetSelector}`,
    };
  }

  const tagName = element.tagName.toLowerCase();

  // 1. Native <select> element (or container wrapping a <select>)
  const selectEl =
    tagName === 'select' ? (element as HTMLSelectElement) : element.querySelector('select');
  if (selectEl) {
    const options: DropdownOptionItem[] = Array.from(selectEl.options).map((opt, idx) => ({
      text: opt.text.trim(),
      value: opt.value,
      index: idx,
      selected: opt.selected,
    }));

    return {
      success: true,
      type: 'select',
      id: selectEl.id || undefined,
      name: selectEl.name || undefined,
      options,
    };
  }

  // 2. ARIA combobox / listbox / menu
  const role = element.getAttribute('role')?.toLowerCase();
  const ariaControls = element.getAttribute('aria-controls');
  const ariaOwns = element.getAttribute('aria-owns');

  if (role === 'combobox' || role === 'listbox' || role === 'menu' || ariaControls || ariaOwns) {
    // If it's a closed combobox, try opening it and wait for React/Vue portal mount
    if (role === 'combobox' && element.getAttribute('aria-expanded') !== 'true') {
      try {
        (element as HTMLElement).focus?.();
        try {
          element.dispatchEvent(
            new PointerEvent('pointerdown', { bubbles: true, cancelable: true }),
          );
        } catch {}
        element.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
        element.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
        element.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
        (element as HTMLElement).click?.();
        // Micro-wait (50-100ms) for framework dropdown/portal to mount
        await new Promise((resolve) => setTimeout(resolve, 80));
      } catch {}
    }

    let searchRoot: Element = element;
    if (ariaControls) {
      const controlledEl = document.getElementById(ariaControls);
      if (controlledEl) searchRoot = controlledEl;
    } else if (ariaOwns) {
      const ownedEl = document.getElementById(ariaOwns);
      if (ownedEl) searchRoot = ownedEl;
    }

    let items = searchRoot.querySelectorAll('[role="option"], [role="menuitem"]');
    // If empty, search document-level active popups/listboxes (common in React/Vue portals)
    if (items.length === 0) {
      // Small sleep in case portal is mounting asynchronously
      await new Promise((resolve) => setTimeout(resolve, 60));
      const portalRoot = document.querySelector(
        '[role="listbox"], [role="menu"], .ant-select-dropdown, .el-select-dropdown, [class*="select-dropdown"], [class*="dropdown-menu"]',
      );
      if (portalRoot) {
        items = portalRoot.querySelectorAll(
          '[role="option"], [role="menuitem"], .ant-select-item-option, .el-select-dropdown__item',
        );
      }
    }

    const options: DropdownOptionItem[] = [];

    items.forEach((item, idx) => {
      const text = item.textContent?.trim() || '';
      if (text) {
        options.push({
          text,
          value: item.getAttribute('data-value') || item.getAttribute('value') || text,
          index: idx,
          selected:
            item.getAttribute('aria-selected') === 'true' ||
            item.classList.contains('selected') ||
            item.classList.contains('active') ||
            item.classList.contains('ant-select-item-option-selected'),
        });
      }
    });

    if (options.length > 0) {
      return {
        success: true,
        type: 'aria',
        id: element.id || undefined,
        name: element.getAttribute('aria-label') || undefined,
        options,
      };
    }
  }

  // 3. Custom dropdowns (Semantic UI, Bootstrap, Tailwind, etc.)
  const customItems = element.querySelectorAll('.item, .option, li[data-value], [data-value]');
  if (customItems.length > 0) {
    const options: DropdownOptionItem[] = [];
    customItems.forEach((item, idx) => {
      const text = item.textContent?.trim() || '';
      if (text) {
        options.push({
          text,
          value: item.getAttribute('data-value') || text,
          index: idx,
          selected: item.classList.contains('selected') || item.classList.contains('active'),
        });
      }
    });

    if (options.length > 0) {
      return {
        success: true,
        type: 'custom',
        id: element.id || undefined,
        name: element.getAttribute('aria-label') || undefined,
        options,
      };
    }
  }

  return {
    success: false,
    type: 'select',
    options: [],
    error: `Target element <${tagName}> is neither a native select nor an ARIA/custom dropdown menu`,
  };
}

export interface SmartScrollTargetInfo {
  found: boolean;
  isWindow: boolean;
  tagName: string;
  selector?: string;
  x: number;
  y: number;
  width: number;
  height: number;
  scrollLeft: number;
  scrollTop: number;
  scrollWidth: number;
  scrollHeight: number;
  clientWidth: number;
  clientHeight: number;
  canScrollDown: boolean;
  canScrollUp: boolean;
  canScrollRight: boolean;
  canScrollLeft: boolean;
}

/**
 * Identify the optimal scrollable container on the page, or target a specific
 * container by selector, ref, or coordinate.
 */
export function inPageFindSmartScrollTarget(options?: {
  selector?: string;
  ref?: number;
  coordinate?: { x: number; y: number };
  isWindow?: boolean;
}): SmartScrollTargetInfo {
  // If explicitly requested window scroll, skip container search
  if (!options?.isWindow) {
    let targetEl: Element | null = null;

    if (typeof options?.ref === 'number') {
      targetEl = findIndexedElement(options.ref);
    } else if (options?.selector) {
      try {
        targetEl = document.querySelector(options.selector);
      } catch {}
    } else if (options?.coordinate) {
      try {
        if (typeof document.elementFromPoint === 'function') {
          targetEl = document.elementFromPoint(options.coordinate.x, options.coordinate.y);
        }
      } catch {}
    }

    // If a target element was specified, check if it or an ancestor is scrollable
    if (targetEl) {
      let curr: Element | null = targetEl;
      while (curr && curr !== document.body && curr !== document.documentElement) {
        const isScrollable =
          (curr.scrollHeight > curr.clientHeight + 10 ||
            curr.scrollWidth > curr.clientWidth + 10) &&
          /(auto|scroll|overlay)/i.test(
            (window.getComputedStyle?.(curr)?.overflowY || '') +
              ' ' +
              (window.getComputedStyle?.(curr)?.overflowX || ''),
          );
        if (isScrollable) {
          targetEl = curr;
          break;
        }
        curr = curr.parentElement;
      }
      if (curr === document.body || curr === document.documentElement) {
        targetEl = null; // Fall back to window
      }
    }

    // If no explicit target, find the highest scoring scrollable container within viewport
    if (
      !targetEl &&
      typeof document !== 'undefined' &&
      typeof document.querySelectorAll === 'function'
    ) {
      let bestScore = -1;
      let bestEl: Element | null = null;
      const allElements = document.querySelectorAll('*');
      const winW = typeof window !== 'undefined' ? window.innerWidth || 800 : 800;
      const winH = typeof window !== 'undefined' ? window.innerHeight || 600 : 600;

      for (const el of Array.from(allElements)) {
        if (el === document.body || el === document.documentElement) continue;
        const sh = el.scrollHeight;
        const ch = el.clientHeight;
        const sw = el.scrollWidth;
        const cw = el.clientWidth;
        if (sh <= ch + 10 && sw <= cw + 10) continue;

        const style = window.getComputedStyle?.(el);
        if (!style) continue;
        const overflow = (style.overflowY || '') + ' ' + (style.overflowX || '');
        if (!/(auto|scroll|overlay)/i.test(overflow)) continue;
        if (
          style.display === 'none' ||
          style.visibility === 'hidden' ||
          parseFloat(style.opacity || '1') <= 0
        )
          continue;

        const rect =
          typeof el.getBoundingClientRect === 'function' ? el.getBoundingClientRect() : null;
        if (!rect) continue;

        const vLeft = Math.max(0, rect.left);
        const vTop = Math.max(0, rect.top);
        const vRight = Math.min(winW, rect.right);
        const vBottom = Math.min(winH, rect.bottom);
        const visibleWidth = vRight - vLeft;
        const visibleHeight = vBottom - vTop;
        if (visibleWidth < 50 || visibleHeight < 50) continue;

        const area = visibleWidth * visibleHeight;
        const interactiveCount =
          typeof el.querySelectorAll === 'function'
            ? el.querySelectorAll('button, a, input, select, textarea, [role="button"]').length
            : 0;
        const score = area * (1 + 0.5 * Math.min(10, interactiveCount));

        if (score > bestScore) {
          bestScore = score;
          bestEl = el;
        }
      }
      if (bestEl) {
        targetEl = bestEl;
      }
    }

    if (targetEl && typeof targetEl.getBoundingClientRect === 'function') {
      const rect = targetEl.getBoundingClientRect();
      const scrollTop = targetEl.scrollTop || 0;
      const scrollLeft = targetEl.scrollLeft || 0;
      const scrollHeight = targetEl.scrollHeight || 0;
      const scrollWidth = targetEl.scrollWidth || 0;
      const clientHeight = targetEl.clientHeight || 0;
      const clientWidth = targetEl.clientWidth || 0;

      const id = targetEl.id ? `#${targetEl.id}` : '';
      const selector = id || targetEl.tagName.toLowerCase();

      const winW = typeof window !== 'undefined' ? window.innerWidth || 800 : 800;
      const winH = typeof window !== 'undefined' ? window.innerHeight || 600 : 600;
      const vLeft = Math.max(0, rect.left);
      const vTop = Math.max(0, rect.top);
      const vRight = Math.min(winW, rect.right);
      const vBottom = Math.min(winH, rect.bottom);
      const visibleWidth = Math.max(1, vRight - vLeft);
      const visibleHeight = Math.max(1, vBottom - vTop);
      const dispatchX = Math.round(vLeft + visibleWidth / 2);
      const dispatchY = Math.round(vTop + visibleHeight / 2);

      return {
        found: true,
        isWindow: false,
        tagName: targetEl.tagName.toLowerCase(),
        selector,
        x: dispatchX,
        y: dispatchY,
        width: Math.round(rect.width),
        height: Math.round(rect.height),
        scrollLeft,
        scrollTop,
        scrollWidth,
        scrollHeight,
        clientWidth,
        clientHeight,
        canScrollDown: scrollTop + clientHeight < scrollHeight - 5,
        canScrollUp: scrollTop > 5,
        canScrollRight: scrollLeft + clientWidth < scrollWidth - 5,
        canScrollLeft: scrollLeft > 5,
      };
    }
  }

  // Fallback to Window / Document
  const win = typeof window !== 'undefined' ? window : (globalThis as any).window;
  const doc = (
    typeof document !== 'undefined' ? document.documentElement || document.body : null
  ) as HTMLElement | null;
  const scrollY = win?.scrollY || win?.pageYOffset || doc?.scrollTop || 0;
  const scrollX = win?.scrollX || win?.pageXOffset || doc?.scrollLeft || 0;
  const clientWidth = win?.innerWidth || doc?.clientWidth || 800;
  const clientHeight = win?.innerHeight || doc?.clientHeight || 600;
  const scrollHeight = Math.max(
    doc?.scrollHeight || 0,
    (typeof document !== 'undefined' ? document.body?.scrollHeight : 0) || 0,
    clientHeight,
  );
  const scrollWidth = Math.max(
    doc?.scrollWidth || 0,
    (typeof document !== 'undefined' ? document.body?.scrollWidth : 0) || 0,
    clientWidth,
  );

  return {
    found: true,
    isWindow: true,
    tagName: 'window',
    x: Math.round(clientWidth / 2),
    y: Math.round(clientHeight / 2),
    width: clientWidth,
    height: clientHeight,
    scrollLeft: scrollX,
    scrollTop: scrollY,
    scrollWidth,
    scrollHeight,
    clientWidth,
    clientHeight,
    canScrollDown: scrollY + clientHeight < scrollHeight - 5,
    canScrollUp: scrollY > 5,
    canScrollRight: scrollX + clientWidth < scrollWidth - 5,
    canScrollLeft: scrollX > 5,
  };
}

export function inPagePerformSmartScroll(
  isWindow: boolean,
  selector: string | undefined,
  deltaX: number,
  deltaY: number,
  smooth = true,
): {
  success: boolean;
  newScrollTop: number;
  newScrollLeft: number;
  canScrollDown: boolean;
  canScrollUp: boolean;
} {
  const behavior = smooth ? ('smooth' as ScrollBehavior) : ('auto' as ScrollBehavior);
  if (isWindow || !selector) {
    if (typeof window !== 'undefined' && typeof window.scrollBy === 'function') {
      window.scrollBy({ left: deltaX, top: deltaY, behavior });
    }
    const doc = (
      typeof document !== 'undefined' ? document.documentElement || document.body : null
    ) as HTMLElement | null;
    const win = typeof window !== 'undefined' ? window : (globalThis as any).window;
    const scrollY = win?.scrollY || win?.pageYOffset || doc?.scrollTop || 0;
    const scrollX = win?.scrollX || win?.pageXOffset || doc?.scrollLeft || 0;
    const clientHeight = win?.innerHeight || doc?.clientHeight || 600;
    const scrollHeight = Math.max(
      doc?.scrollHeight || 0,
      (typeof document !== 'undefined' ? document.body?.scrollHeight : 0) || 0,
      clientHeight,
    );
    return {
      success: true,
      newScrollTop: Math.round(scrollY),
      newScrollLeft: Math.round(scrollX),
      canScrollDown: scrollY + clientHeight < scrollHeight - 5,
      canScrollUp: scrollY > 5,
    };
  }

  let el: Element | null = null;
  if (typeof document !== 'undefined' && typeof document.querySelector === 'function') {
    try {
      el = document.querySelector(selector);
    } catch {}
  }
  if (!el) {
    if (typeof window !== 'undefined' && typeof window.scrollBy === 'function') {
      window.scrollBy({ left: deltaX, top: deltaY, behavior });
    }
    const doc = (
      typeof document !== 'undefined' ? document.documentElement || document.body : null
    ) as HTMLElement | null;
    const win = typeof window !== 'undefined' ? window : (globalThis as any).window;
    return {
      success: true,
      newScrollTop: Math.round(win?.scrollY || doc?.scrollTop || 0),
      newScrollLeft: Math.round(win?.scrollX || doc?.scrollLeft || 0),
      canScrollDown: true,
      canScrollUp: false,
    };
  }

  if (typeof el.scrollBy === 'function') {
    el.scrollBy({ left: deltaX, top: deltaY, behavior });
  } else {
    el.scrollTop += deltaY;
    el.scrollLeft += deltaX;
  }
  return {
    success: true,
    newScrollTop: Math.round(el.scrollTop),
    newScrollLeft: Math.round(el.scrollLeft),
    canScrollDown: el.scrollTop + el.clientHeight < el.scrollHeight - 5,
    canScrollUp: el.scrollTop > 5,
  };
}

/**
 * Resolve an asset index (from inPageDOMPruner assets) to image data.
 * Primary path pulls real bytes: canvas -> toDataURL, img/bg-image ->
 * fetch + FileReader in page context (same-origin or CORS-enabled only).
 * Returns rect so background can fall back to viewport cropping when bytes
 * are not obtainable (tainted canvas, opaque cross-origin, video).
 */
export async function inPageGetAssetImage(assetIndex: number): Promise<{
  success: boolean;
  reason?: string;
  dataUrl?: string;
  rect?: { x: number; y: number; width: number; height: number };
  kind?: string;
  src?: string;
}> {
  const MAP_KEY = Symbol.for('__browser_use_page_assets__') as any;
  const assets = (globalThis as any)[MAP_KEY];
  const entry = assets && assets[assetIndex - 1];
  if (!entry)
    return { success: false, reason: `asset ${assetIndex} not found (run chrome_read_dom first)` };
  const rect = entry.el.getBoundingClientRect().toJSON();
  const out: any = {
    success: false,
    reason: 'unsupported',
    dataUrl: undefined,
    rect: {
      x: Math.round(rect.left),
      y: Math.round(rect.top),
      width: Math.round(rect.width),
      height: Math.round(rect.height),
    },
    kind: entry.kind,
    src: entry.src,
  };
  try {
    if (entry.kind === 'canvas') {
      out.dataUrl = (entry.el as HTMLCanvasElement).toDataURL('image/png');
      out.success = true;
      return out;
    }
    const src = entry.src;
    if (!src) {
      out.reason = 'no src (video/streams must be cropped)';
      return out;
    }
    const res = await fetch(src, { credentials: 'include' });
    if (!res.ok) {
      out.reason = `fetch ${res.status}`;
      return out;
    }
    const blob = await res.blob();
    out.dataUrl = await new Promise<string>((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(String(fr.result));
      fr.onerror = () => reject(new Error('FileReader failed'));
      fr.readAsDataURL(blob);
    });
    out.success = true;
    return out;
  } catch (err) {
    out.success = false;
    out.reason = String(err instanceof Error ? err.message : err);
    return out;
  }
}

/**
 * Extract crawlable links (absolute URL, anchor text, internal/external,
 * nofollow). Read-only; runs in the page's isolated world.
 */
export function inPageGetLinks(options?: {
  selector?: string;
  sameOriginOnly?: boolean;
  includeEmptyHref?: boolean;
}): Array<{ url: string; text: string; internal: boolean; nofollow: boolean }> {
  const root: ParentNode = options?.selector
    ? (document.querySelector(options.selector) ?? document)
    : document;
  const anchors = root.querySelectorAll('a[href]');
  const out: Array<{ url: string; text: string; internal: boolean; nofollow: boolean }> = [];
  const seen = new Set<string>();
  anchors.forEach((a) => {
    const href = (a as HTMLAnchorElement).href;
    if (!href || !/^https?:/i.test(href)) return;
    if (seen.has(href)) return;
    seen.add(href);
    const rel = (a.getAttribute('rel') || '').toLowerCase();
    const nofollow = rel.includes('nofollow');
    const internal = new URL(href, location.href).origin === location.origin;
    if (options?.sameOriginOnly && !internal) return;
    const text = (a.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 120);
    out.push({ url: href, text, internal, nofollow });
  });
  return out;
}
export function inPageCheckInterception(
  index: number,
  x: number,
  y: number,
): { intercepted: boolean; description?: string } {
  const el = findIndexedElement(index);
  if (!el || !(el instanceof Element)) return { intercepted: false };

  const intercepting = interceptingElementAtPoint(el, x, y);
  if (
    intercepting &&
    intercepting !== el &&
    !el.contains(intercepting) &&
    !intercepting.contains(el)
  ) {
    return { intercepted: true, description: describeHitTarget(intercepting) };
  }
  return { intercepted: false };
}

export function inPageDispatchSyntheticClick(
  index: number | null | undefined,
  x: number,
  y: number,
  action: 'click' | 'right_click' | 'double_click' = 'click',
): boolean {
  let el = typeof index === 'number' && index > 0 ? findIndexedElement(index) : null;
  if (!el && typeof document !== 'undefined' && typeof document.elementFromPoint === 'function') {
    el = document.elementFromPoint(x, y);
  }
  if (!el || !(el instanceof Element)) return false;

  const isRight = action === 'right_click';
  const button = isRight ? 2 : 0;
  const buttons = isRight ? 2 : 1;

  const init: MouseEventInit = {
    bubbles: true,
    cancelable: true,
    clientX: x,
    clientY: y,
    button,
  };

  try {
    el.dispatchEvent(new PointerEvent('pointerdown', { ...init, buttons, pointerType: 'mouse' }));
  } catch {}
  el.dispatchEvent(new MouseEvent('mousedown', { ...init, buttons }));
  try {
    el.dispatchEvent(new PointerEvent('pointerup', { ...init, buttons: 0, pointerType: 'mouse' }));
  } catch {}
  el.dispatchEvent(new MouseEvent('mouseup', { ...init, buttons: 0 }));

  if (isRight) {
    el.dispatchEvent(new MouseEvent('contextmenu', { ...init, buttons: 0 }));
  } else if (action === 'double_click') {
    el.dispatchEvent(new MouseEvent('click', { ...init, buttons: 0 }));
    try {
      el.dispatchEvent(new PointerEvent('pointerdown', { ...init, buttons, pointerType: 'mouse' }));
    } catch {}
    el.dispatchEvent(new MouseEvent('mousedown', { ...init, buttons }));
    try {
      el.dispatchEvent(
        new PointerEvent('pointerup', { ...init, buttons: 0, pointerType: 'mouse' }),
      );
    } catch {}
    el.dispatchEvent(new MouseEvent('mouseup', { ...init, buttons: 0 }));
    el.dispatchEvent(new MouseEvent('click', { ...init, buttons: 0 }));
    el.dispatchEvent(new MouseEvent('dblclick', { ...init, buttons: 0 }));
  } else {
    el.dispatchEvent(new MouseEvent('click', { ...init, buttons: 0 }));
  }

  return true;
}

/**
 * Format an indexed element into a concise, Accessibility-Tree-inspired line.
 * Omits closing tags and redundant markup, cutting token usage by 60%+.
 */
export function renderCompactElementLine(el: IndexedElement, frameId?: string | number): string {
  let role = el.role || el.tagName.toLowerCase();
  const tag = el.tagName.toLowerCase();
  const inputType = el.attributes?.type?.toLowerCase();

  if (tag === 'input') {
    if (inputType === 'checkbox') role = 'checkbox';
    else if (inputType === 'radio') role = 'radio';
    else if (inputType === 'submit' || inputType === 'button') role = 'button';
    else if (inputType === 'password') role = 'password';
    else if (inputType === 'file') role = 'file';
    else role = 'textbox';
  } else if (tag === 'a') {
    role = 'link';
  } else if (tag === 'button') {
    role = 'button';
  } else if (tag === 'textarea') {
    role = 'textbox';
  } else if (tag === 'select') {
    role = 'combobox';
  }

  let text = el.text ? `"${el.text}"` : '';
  if (!text && el.attributes?.['aria-label']) {
    text = `"${el.attributes['aria-label']}"`;
  } else if (!text && el.attributes?.title) {
    text = `"${el.attributes.title}"`;
  }

  const parts: string[] = [`[${el.index}]`];
  if (el.inShadowDom) {
    parts.push('[shadow]');
  }
  parts.push(role);
  if (text) parts.push(text);

  if (el.attributes?.id) parts.push(`#${el.attributes.id}`);
  if (el.attributes?.name) parts.push(`name="${el.attributes.name}"`);
  if (el.attributes?.placeholder) parts.push(`placeholder="${el.attributes.placeholder}"`);
  if (tag === 'a' && el.attributes?.href) parts.push(`href="${el.attributes.href}"`);
  if (el.value !== undefined && el.value !== '') {
    const isSensitive =
      inputType === 'password' ||
      el.attributes?.name?.toLowerCase().includes('password') ||
      el.attributes?.autocomplete?.toLowerCase().includes('password') ||
      el.attributes?.autocomplete?.toLowerCase().includes('cc-');
    const valDisplay = isSensitive ? '•••' : el.value;
    parts.push(`value="${valDisplay}"`);
  }
  if (el.attributes?.['visual-shape']) parts.push(`shape="${el.attributes['visual-shape']}"`);

  if (el.attributes?.required === 'true' || el.attributes?.required === '') parts.push('required');
  if (el.attributes?.disabled === 'true' || el.attributes?.disabled === '') parts.push('disabled');
  if (
    el.attributes?.['aria-checked'] === 'true' ||
    el.attributes?.checked === 'true' ||
    el.attributes?.checked === ''
  )
    parts.push('checked');
  if (el.attributes?.['aria-selected'] === 'true') parts.push('selected');
  if (el.attributes?.['aria-expanded']) parts.push(`expanded=${el.attributes['aria-expanded']}`);

  if (frameId !== undefined && frameId !== 0 && frameId !== '0') {
    parts.push(`frame="${frameId}"`);
  }

  if (el.isOccluded) {
    parts.push(`[occluded${el.occludedBy ? ` by ${el.occludedBy}` : ''}]`);
  }

  return parts.join(' ');
}

/**
 * In-page inspection to detect active slider verification or bot challenges.
 */
export function inPageCheckCaptcha(): { detected: boolean; type?: string } {
  try {
    const captchaSelectors = [
      '#captcha_modal',
      '.geetest_holder',
      '.nc_wrapper',
      '#nc_1_wrapper',
      '.yidun_modal',
      '.tcaptcha-transform',
      'iframe[src*="captcha"]',
      'iframe[src*="recaptcha"]',
      'iframe[src*="hcaptcha"]',
      'iframe[src*="turnstile"]',
      'iframe[src*="challenges.cloudflare.com"]',
      'iframe[src*="arkoselabs"]',
      'iframe[src*="funcaptcha"]',
      '.cf-turnstile',
      '#cf-turnstile',
      'div[class*="cf-turnstile" i]',
      '.h-captcha',
      '#hcaptcha',
      'div[class*="hcaptcha" i]',
      '#arkose',
      'div[id*="arkose" i]',
      'div[class*="arkose" i]',
      'div[id*="aws-waf" i]',
      'div[class*="aws-waf" i]',
      'div[class*="captcha" i]',
      'div[id*="captcha" i]',
      '.slider-verify',
      '.slide-verify',
      '[data-testid*="captcha" i]',
      '[data-testid*="turnstile" i]',
    ];
    for (const sel of captchaSelectors) {
      const els = document.querySelectorAll(sel);
      for (const el of Array.from(els)) {
        if (el && el instanceof HTMLElement) {
          const style = window.getComputedStyle(el);
          const rect = el.getBoundingClientRect();
          if (
            style.display !== 'none' &&
            style.visibility !== 'hidden' &&
            (el.offsetWidth > 0 || el.offsetHeight > 0 || rect.width > 0 || rect.height > 0)
          ) {
            return { detected: true, type: sel };
          }
        }
      }
    }
  } catch {}
  return { detected: false };
}
