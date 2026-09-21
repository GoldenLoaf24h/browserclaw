import { executeInPage } from '../entrypoints/background/tools/browser/in-page-engine';
import { snapshotCacheManager, type DomDiffResult } from './snapshot-cache-manager';
import type { PrunedDOMTreeResult } from 'chrome-mcp-shared';

async function fetchCurrentDomElements(
  tabId: number,
): Promise<{ url: string; elements: any[] } | null> {
  let results: any[] | null = null;
  try {
    results = await executeInPage<PrunedDOMTreeResult>(
      { tabId, allFrames: true },
      'inPageDOMPruner',
      [
        {
          viewportThreshold: 500,
          highlight: false,
        },
      ],
    );
  } catch {
    try {
      results = await executeInPage<PrunedDOMTreeResult>(
        { tabId },
        'inPageDOMPruner',
        [
          {
            viewportThreshold: 500,
            highlight: false,
          },
        ],
      );
    } catch {
      return null;
    }
  }

  if (!results || results.length === 0) return null;

  const mainFrame = results.find((r) => r.frameId === 0) || results[0];
  const mainResult = mainFrame?.result;
  if (!mainResult) return null;

  const allElements: any[] = [...(mainResult.indexedElements || [])];
  let currentIndex = allElements.length + 1;

  for (const r of results) {
    if (r === mainFrame || !r.result) continue;
    const subData = r.result;
    if (subData.indexedElements && subData.indexedElements.length > 0) {
      for (const el of subData.indexedElements) {
        allElements.push({
          ...el,
          index: currentIndex++,
        });
      }
    }
  }

  const tab = await chrome.tabs.get(tabId).catch(() => null);
  return {
    url: tab?.url || '',
    elements: allElements,
  };
}

/**
 * Ensure baseline snapshot is established BEFORE an interaction occurs.
 * If includeDelta is requested and no valid baseline snapshot exists in cache,
 * this captures the pre-interaction state so subsequent diff will accurately
 * detect elements added/modified/removed by the immediate action (e.g. dropdowns/popups/modals).
 */
export async function ensureSnapshotBaseline(
  tabId: number,
  includeDelta?: boolean,
): Promise<void> {
  if (!includeDelta) return;
  if (snapshotCacheManager.isSnapshotValid(tabId)) return;

  try {
    const data = await fetchCurrentDomElements(tabId);
    if (!data) return;

    snapshotCacheManager.setSnapshot(tabId, {
      url: data.url,
      elementCount: data.elements.length,
      elements: data.elements,
    });
  } catch {
    // Non-fatal: if pre-interaction capture fails, captureDeltaIfRequested will fall back gracefully
  }
}

export async function captureDeltaIfRequested(
  tabId: number,
  includeDelta?: boolean,
  delayMs = 150,
): Promise<DomDiffResult | undefined> {
  if (!includeDelta) return undefined;
  try {
    if (delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }

    const data = await fetchCurrentDomElements(tabId);
    if (!data) return undefined;

    const allElements = data.elements;
    const diff = snapshotCacheManager.diffWithPrevious(tabId, allElements);
    snapshotCacheManager.setSnapshot(tabId, {
      url: data.url,
      elementCount: allElements.length,
      elements: allElements,
    });

    if (!diff.isDelta) {
      // First interaction with includeDelta without a prior baseline (e.g. if pre-capture was bypassed)
      // Prevent context explosion by returning empty lists for the baseline
      return {
        isDelta: false,
        unchanged: false,
        revision: diff.revision,
        added: [],
        modified: [],
        removed: [],
        totalCurrent: diff.totalCurrent,
        message:
          'Baseline snapshot established. Subsequent interactions will report incremental DOM deltas.',
      };
    }

    return diff;
  } catch (err) {
    return {
      isDelta: true,
      unchanged: false,
      revision: -1,
      added: [],
      modified: [],
      removed: [],
      totalCurrent: 0,
      error: err instanceof Error ? err.message : String(err),
    } as any;
  }
}
