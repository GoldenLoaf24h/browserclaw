import { executeInPage } from '../entrypoints/background/tools/browser/in-page-engine';
import { snapshotCacheManager, type DomDiffResult } from './snapshot-cache-manager';
import type { PrunedDOMTreeResult } from 'chrome-mcp-shared';

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

    const results = await executeInPage<PrunedDOMTreeResult>(
      { tabId, allFrames: true },
      'inPageDOMPruner',
      [
        {
          viewportThreshold: 1000,
          highlight: false,
        },
      ],
    );

    if (!results || results.length === 0) return undefined;

    const mainFrame = results.find((r) => r.frameId === 0) || results[0];
    const mainResult = mainFrame?.result;
    if (!mainResult) return undefined;

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

    const diff = snapshotCacheManager.diffWithPrevious(tabId, allElements);
    const tab = await chrome.tabs.get(tabId).catch(() => null);
    snapshotCacheManager.setSnapshot(tabId, {
      url: tab?.url || '',
      elementCount: allElements.length,
      elements: allElements,
    });
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
  return undefined;
}
