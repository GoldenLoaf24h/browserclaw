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
      { tabId },
      'inPageDOMPruner',
      [
        {
          viewportThreshold: 1000,
          highlight: false,
        },
      ],
    );

    const mainResult = results?.[0]?.result;
    const elements = mainResult?.indexedElements;
    if (elements && Array.isArray(elements)) {
      const diff = snapshotCacheManager.diffWithPrevious(tabId, elements);
      const tab = await chrome.tabs.get(tabId).catch(() => null);
      snapshotCacheManager.setSnapshot(tabId, {
        url: tab?.url || '',
        elementCount: elements.length,
        elements,
      });
      return diff;
    }
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
