/**
 * In-Page Engine - Inject Script Entry Point
 *
 * chrome.scripting.executeScript({ func }) serializes only the function body,
 * so in-page entrypoints referencing module-scope helpers (dom-indexer's
 * wrapElement / getIsolatedIndexMap / findIndexedElement / ...) crash with
 * ReferenceError in the page's isolated world - silently breaking the whole
 * indexing toolchain in release builds (read_dom / interact_index / fill_index
 * / screenshot SoM / dropdown options).
 *
 * Every in-page entrypoint is registered here on a namespace object; the
 * background injects this bundled file via chrome.scripting.executeScript
 * { files } and dispatches entrypoints by name - see
 * entrypoints/background/tools/browser/in-page-engine.ts.
 *
 * Build output: .output/chrome-mv3/inpage-engine.js (self-contained IIFE)
 */

import {
  inPageDOMPruner,
  inPageReindexFrame,
  inPageRealignHighlights,
  inPageScrollToIndex,
  inPageScrollByIndex,
  inPageGetElementCoordinates,
  inPageGetFrameOrigin,
  inPageGetIndexCropRect,
  inPageGetAssetImage,
  inPageGetLinks,
  inPagePointerDragMove,
  inPageInteractIndex,
  inPageFocusIndex,
  inPageFillIndex,
  inPageExtractDropdownOptions,
  inPageExtractMarkdown,
  inPageLocateBySelector,
  inPageLocateByText,
  inPageFindSmartScrollTarget,
  inPagePerformSmartScroll,
} from './background/tools/browser/dom-indexer';

export default defineUnlistedScript(() => {
  // Versioned idempotency guard. executeInPage re-injects this 81KB bundle on
  // every call; without the guard each injection rebuilds the IIFE and resets
  // module-scope state (notably dom-indexer's safeClickPoint map, which then
  // reads back empty on the next tool call). Keyed on a version string rather
  // than a boolean so a rebuilt extension still replaces the old namespace.
  const ENGINE_VERSION = '2026-09-10.1';
  const g = globalThis as any;
  if (g.__MCP_INPAGE__ && g.__MCP_INPAGE_VERSION__ === ENGINE_VERSION) {
    return;
  }
  g.__MCP_INPAGE_VERSION__ = ENGINE_VERSION;
  (globalThis as any).__MCP_INPAGE__ = {
    inPageDOMPruner,
    inPageReindexFrame,
    inPageRealignHighlights,
    inPageScrollToIndex,
    inPageScrollByIndex,
    inPageGetElementCoordinates,
    inPageGetFrameOrigin,
    inPageGetIndexCropRect,
    inPageGetAssetImage,
    inPageGetLinks,
    inPagePointerDragMove,
    inPageInteractIndex,
    inPageFocusIndex,
    inPageFillIndex,
    inPageExtractDropdownOptions,
    inPageExtractMarkdown,
    inPageLocateBySelector,
    inPageLocateByText,
    inPageFindSmartScrollTarget,
    inPagePerformSmartScroll,
  };
});
