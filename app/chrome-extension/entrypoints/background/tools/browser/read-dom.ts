import { createErrorResponse, ToolResult } from '@/common/tool-handler';
import { BaseBrowserToolExecutor } from '../base-browser';
import { TOOL_NAMES, type PrunedDOMTreeResult, type IndexedElement } from 'chrome-mcp-shared';
import { executeInPage } from './in-page-engine';
import { snapshotCacheManager } from '@/utils/snapshot-cache-manager';
import { renderCompactElementLine } from './dom-indexer';

export interface ReadDOMParams {
  viewportThreshold?: number;
  tabId?: number;
  windowId?: number;
  highlight?: boolean;
  sessionId?: string;
  sessionContext?: string;
  cursor?: number;
  limit?: number;
  deltaOnly?: boolean;
  maxTextLength?: number;
  format?: 'compact' | 'html';
  /**
   * Opt in to the bulky per-element detail blocks (indexedElements + indexMap).
   * Off by default: the pruned tree already carries index/tag/attributes/text
   * for every element, and the detail blocks duplicated it as pretty-printed
   * JSON — roughly 7x the payload for the same information. Only request them
   * when you need geometry (rect/safeClickPoint) or per-element flags.
   */
  includeDetails?: boolean;
}

export class ReadDOMTool extends BaseBrowserToolExecutor {
  name = TOOL_NAMES.BROWSER.READ_DOM;

  async execute(args: ReadDOMParams = {}): Promise<ToolResult> {
    try {
      const tab = await this.resolveAffinityTab({
        tabId: args.tabId,
        windowId: args.windowId,
        sessionId: args.sessionId || args.sessionContext,
      });
      if (!tab.id) {
        return createErrorResponse('No active tab found for chrome_read_dom');
      }

      let results: chrome.scripting.InjectionResult<PrunedDOMTreeResult>[] = [];
      try {
        // Multi-frame penetration using Chrome Extension native { allFrames: true }
        results = await executeInPage(
          { tabId: tab.id, allFrames: true },
          'inPageDOMPruner',
          [
            {
              viewportThreshold: args.viewportThreshold ?? 1000,
              highlight: args.highlight ?? false,
              maxTextLength: args.maxTextLength,
              format: args.format ?? 'compact',
            },
          ],
        );
      } catch (frameErr) {
        // Fallback to main frame only if allFrames fails
        results = await executeInPage(
          { tabId: tab.id },
          'inPageDOMPruner',
          [
            {
              viewportThreshold: args.viewportThreshold ?? 1000,
              highlight: args.highlight ?? false,
              maxTextLength: args.maxTextLength,
              format: args.format ?? 'compact',
            },
          ],
        );
      }

      if (!results || results.length === 0) {
        return createErrorResponse('Failed to execute DOM pruning and indexing');
      }

      // Merge multi-frame results
      const mainFrame = results.find((r) => r.frameId === 0) || results[0];
      const mainData = mainFrame?.result;
      if (!mainData) {
        return createErrorResponse('Failed to execute DOM pruning on main frame');
      }

      const mergedData: PrunedDOMTreeResult = {
        treeString: mainData.treeString,
        elementCount: mainData.elementCount,
        interactiveCount: mainData.interactiveCount,
        compressionRatio: mainData.compressionRatio,
        indexMap: { ...mainData.indexMap },
        indexedElements: [...(mainData.indexedElements || [])],
        assets: [...(mainData.assets || [])],
        pages_up: mainData.pages_up,
        pages_down: mainData.pages_down,
        scrollInfo: mainData.scrollInfo,
      };

      let currentIndex = (mergedData.indexedElements?.length || 0) + 1;
      const subframeLines: string[] = [];

      for (const r of results) {
        if (r === mainFrame || !r.result) continue;
        const subData = r.result;
        mergedData.elementCount += subData.elementCount;

        if (subData.indexedElements && subData.indexedElements.length > 0) {
          const startingIndexForFrame = currentIndex;
          const frameOffset = startingIndexForFrame - 1;

          subframeLines.push(`\n<!-- Frame ${r.frameId} -->`);
          for (const el of subData.indexedElements) {
            const remappedIndex = currentIndex++;
            const remappedEl: IndexedElement = {
              ...el,
              index: remappedIndex,
            };
            mergedData.indexedElements!.push(remappedEl);
            mergedData.indexMap[remappedIndex] = {
              selector: el.attributes?.id
                ? `#${el.attributes.id}`
                : `${el.tagName}[data-mcp-idx="${remappedIndex}"]`,
              frameId: String(r.frameId),
              tagName: el.tagName,
            };

            if (args.format === 'html') {
              const attrStr = Object.entries(el.attributes || {})
                .map(([k, v]) => `${k}="${v}"`)
                .join(' ');
              const textPart = el.text ? ` "${el.text}"` : '';
              subframeLines.push(
                `[${remappedIndex}] <${el.tagName}${attrStr ? ' ' + attrStr : ''} frame="${r.frameId}">${textPart}</${el.tagName}>`,
              );
            } else {
              subframeLines.push(renderCompactElementLine(remappedEl, r.frameId));
            }
          }

          // Crucial: Re-index the subframe in the tab context so its in-page isolatedMap, data-mcp-idx,
          // and visual Set-of-Mark badges match the merged index!
          try {
            await executeInPage({ tabId: tab.id, frameIds: [r.frameId] }, 'inPageReindexFrame', [frameOffset, args.highlight ?? false]);
          } catch (reindexErr) {
            console.warn(`Failed to synchronize subframe ${r.frameId} index map:`, reindexErr);
          }
        }
        if (subData.assets && subData.assets.length > 0 && mergedData.assets) {
          // Subframe asset geometry is viewport-local to that frame; tag them
          // with frameId so downstream crop/fetch can resolve the right frame.
          for (const a of subData.assets) {
            mergedData.assets.push({ ...a, src: a.src ? `${a.src}#@frame=${r.frameId}` : undefined });
          }
        }
      }

      // Count the interactive subset, not every indexed element: informational
      // nodes (headings, role=alert) are indexed with isInteractive:false, and
      // reusing the total length here collapsed interactiveCount back onto
      // elementCount for the whole chrome_read_dom response.
      mergedData.interactiveCount = (mergedData.indexedElements || []).filter(
        (el) => el.isInteractive,
      ).length;
      if (subframeLines.length > 0) {
        mergedData.treeString += '\n' + subframeLines.join('\n');
      }
      if (mergedData.assets && mergedData.assets.length > 0) {
        const assetLines = mergedData.assets
          .map(
            (a) =>
              `[asset ${a.index}] ${a.kind} ${a.rect.width}x${a.rect.height} @(${a.rect.x},${a.rect.y})${a.src ? " " + a.src.slice(0, 120) : ""}${a.alt ? " alt=" + JSON.stringify(a.alt.slice(0, 60)) : ""}`,
          )
          .join('\n');
        mergedData.treeString += `\n[Visual Assets: ${mergedData.assets.length} found. Pass assetIndex to chrome_screenshot to view one.]\n${assetLines}`;
      }

              // Delta DOM support: return only changed/added/removed diffs
        if (args.deltaOnly && tab.id) {
          const diff = snapshotCacheManager.diffWithPrevious(tab.id, mergedData.indexedElements || []);
          snapshotCacheManager.setSnapshot(tab.id, {
            url: tab.url || '',
            elementCount: mergedData.elementCount,
            elements: mergedData.indexedElements,
          });

          if (diff.isDelta && diff.unchanged) {
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(
                    {
                      success: true,
                      unchanged: true,
                      revision: diff.revision,
                      totalElements: diff.totalCurrent,
                      message: 'Page DOM unchanged since last snapshot. No new or modified interactive elements.',
                    },
                    null,
                    2,
                  ),
                },
              ],
              isError: false,
            };
          }

          if (diff.isDelta) {
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(
                    {
                      success: true,
                      isDelta: true,
                      revision: diff.revision,
                      addedCount: diff.added.length,
                      modifiedCount: diff.modified.length,
                      removedIndices: diff.removed,
                      added: diff.added,
                      modified: diff.modified,
                    },
                    null,
                    2,
                  ),
                },
              ],
              isError: false,
            };
          }
        }

        // Record snapshot in cache manager (P1-6)
      const snapshot = snapshotCacheManager.setSnapshot(tab.id, {
        url: tab.url || '',
        elementCount: mergedData.elementCount,
      });

      // Pagination cursor support (P1-6)
      // Pagination slices the pruned tree lines, which are the primary payload.
      // It previously sliced only indexedElements, so a paginated read still
      // shipped the whole tree and saved almost nothing on large pages.
      const allTreeLines = mergedData.treeString.split('\n');
      const totalElements = allTreeLines.length;
      const cursor = typeof args.cursor === 'number' ? Math.max(0, args.cursor) : 0;
      const limit = typeof args.limit === 'number' && args.limit > 0 ? args.limit : undefined;

      let treeString = mergedData.treeString;
      let returnElements = mergedData.indexedElements || [];
      let hasMore = false;
      let nextCursor: number | undefined = undefined;

      if (limit !== undefined) {
        const end = Math.min(cursor + limit, totalElements);
        treeString = allTreeLines.slice(cursor, end).join('\n');
        returnElements = returnElements.slice(cursor, end);
        hasMore = end < totalElements;
        nextCursor = hasMore ? end : undefined;
      }

      const resultPayload: Record<string, any> = {
        ...mergedData,
        treeString,
        indexedElements: returnElements,
        snapshotId: snapshot.snapshotId,
        tabUrl: tab.url,
        tabTitle: tab.title,
        cursor,
        limit,
        totalElements,
        hasMore,
        nextCursor,
      };

      // Default response is the pruned tree plus counters only. The detail
      // blocks (indexedElements / indexMap) have no in-extension consumer —
      // element resolution goes through the page-side isolated index map — and
      // they tripled the payload by restating what treeString already says.
      if (!args.includeDetails) {
        delete resultPayload.indexedElements;
        delete resultPayload.indexMap;
      }

      return {
        content: [
          {
            type: 'text',
            // Compact JSON: the 2-space indent alone cost ~37% of the response
            // and no consumer parses it as text.
            text: JSON.stringify(resultPayload),
          },
        ],
        isError: false,
      };
    } catch (error) {
      return createErrorResponse(
        `Error executing chrome_read_dom: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}

export const readDOMTool = new ReadDOMTool();
