import { createErrorResponse, ToolResult } from '@/common/tool-handler';
import { BaseBrowserToolExecutor } from '../base-browser';
import { TOOL_NAMES } from 'chrome-mcp-shared';
import { cdpSessionManager } from '@/utils/cdp-session-manager';

export interface ScrollToTextParams {
  text: string;
  tabId?: number;
  windowId?: number;
  sessionId?: string;
  sessionContext?: string;
}

/**
 * Scroll page to bring specific text into center view.
 * Aligns with browser-use logic: CDP DOM.performSearch + scrollIntoViewIfNeeded,
 * with JavaScript TreeWalker fallback.
 */
/**
 * Format string as safe XPath string literal using concat() if needed
 */
function toXPathString(str: string): string {
  if (!str.includes('"')) {
    return `"${str}"`;
  }
  if (!str.includes("'")) {
    return `'${str}'`;
  }
  const parts = str.split('"');
  const concatArgs: string[] = [];
  for (let i = 0; i < parts.length; i++) {
    if (parts[i].length > 0) {
      concatArgs.push(`"${parts[i]}"`);
    }
    if (i < parts.length - 1) {
      concatArgs.push(`'"'`);
    }
  }
  if (concatArgs.length === 0) return '""';
  if (concatArgs.length === 1) return concatArgs[0];
  return `concat(${concatArgs.join(', ')})`;
}

export class ScrollToTextTool extends BaseBrowserToolExecutor {
  name = TOOL_NAMES.BROWSER.SCROLL_TO_TEXT;

  async execute(args: ScrollToTextParams): Promise<ToolResult> {
    if (!args?.text || typeof args.text !== 'string' || !args.text.trim()) {
      return createErrorResponse('Text parameter is required and must be a non-empty string');
    }

    const text = args.text.trim();

    try {
      const tab = await this.resolveAffinityTab({
        tabId: args.tabId,
        windowId: args.windowId,
        sessionId: args.sessionId || args.sessionContext,
      });
      if (!tab.id) {
        return createErrorResponse('No active tab found for chrome_scroll_to_text');
      }

      const tabId = tab.id;
      let scrolled = false;
      // CDP DOM.scrollIntoViewIfNeeded is a no-op when the node already
      // intersects the viewport, so success alone does not prove the page
      // moved. Track the scroll offset so callers can tell the difference.
      let alreadyVisible = false;

      // Method 1: CDP DOM.performSearch and scrollIntoViewIfNeeded (matching browser-use)
      try {
        await cdpSessionManager.withSession(tabId, 'scroll-to-text', async () => {
          await cdpSessionManager.sendCommand(tabId, 'DOM.enable', {});

          // Try both plain text and XPath text content queries (with proper quote escaping)
          const queries = [text, `//*[contains(., ${toXPathString(text)})]`];

          for (const query of queries) {
            let searchId: string | undefined;
            try {
              const searchRes: any = await cdpSessionManager.sendCommand(tabId, 'DOM.performSearch', {
                query,
              });

              searchId = searchRes?.searchId;
              const resultCount = searchRes?.resultCount || 0;

              if (resultCount > 0 && searchId) {
                const results: any = await cdpSessionManager.sendCommand(tabId, 'DOM.getSearchResults', {
                  searchId,
                  fromIndex: 0,
                  toIndex: 1,
                });

                const nodeIds: number[] = results?.nodeIds || [];
                if (nodeIds.length > 0) {
                  try {
                    const metrics: any = await cdpSessionManager.sendCommand(
                      tabId,
                      'Page.getLayoutMetrics',
                      {},
                    );
                    const vp = metrics?.layoutViewport || metrics?.visualViewport;
                    const box: any = await cdpSessionManager.sendCommand(tabId, 'DOM.getBoxModel', {
                      nodeId: nodeIds[0],
                    });
                    const quad = box?.model?.border;
                    if (vp && quad && quad.length === 8) {
                      const xs = [quad[0], quad[2], quad[4], quad[6]];
                      const ys = [quad[1], quad[3], quad[5], quad[7]];
                      alreadyVisible =
                        Math.min(...ys) >= Number(vp.pageY) &&
                        Math.max(...ys) <= Number(vp.pageY) + Number(vp.clientHeight) &&
                        Math.min(...xs) >= Number(vp.pageX) &&
                        Math.max(...xs) <= Number(vp.pageX) + Number(vp.clientWidth);
                    }
                  } catch {}
                  await cdpSessionManager.sendCommand(tabId, 'DOM.scrollIntoViewIfNeeded', {
                    nodeId: nodeIds[0],
                  });
                  scrolled = true;
                  break;
                }
              }
            } finally {
              if (searchId) {
                try {
                  await cdpSessionManager.sendCommand(tabId, 'DOM.discardSearchResults', {
                    searchId,
                  });
                } catch {}
              }
            }
          }
        });
      } catch (cdpErr) {
        console.warn('CDP scroll to text failed, trying JS TreeWalker fallback:', cdpErr);
      }

      // Method 2: In-Page TreeWalker semantic fallback with visibility filtering & Shadow DOM traversal
      if (!scrolled) {
        const inPageSearchAndScroll = (searchText: string): { success: boolean; url: string } => {
          const checkAndScroll = (root: Node): boolean => {
            const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
              acceptNode(node) {
                const parent = node.parentElement;
                if (!parent) return NodeFilter.FILTER_REJECT;
                const tag = parent.tagName.toLowerCase();
                if (tag === 'script' || tag === 'style' || tag === 'noscript' || tag === 'template') {
                  return NodeFilter.FILTER_REJECT;
                }
                const style = window.getComputedStyle(parent);
                if (style.display === 'none' || style.visibility === 'hidden' || parseFloat(style.opacity || '1') <= 0) {
                  return NodeFilter.FILTER_REJECT;
                }
                return NodeFilter.FILTER_ACCEPT;
              },
            });

            let node: Node | null;
            while ((node = walker.nextNode())) {
              const content = node.textContent || '';
              if (content.toLowerCase().includes(searchText.toLowerCase())) {
                const parent = node.parentElement;
                if (parent) {
                  parent.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
                  // If in subframe, attempt to scroll subframe container
                  if (window !== window.top) {
                    try {
                      if (window.frameElement) {
                        window.frameElement.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
                      }
                    } catch {}
                  }
                  return true;
                }
              }
            }

            // Penetrate Shadow DOM
            const allElements = (root as Element).querySelectorAll?.('*') || [];
            for (const el of Array.from(allElements)) {
              if (el.shadowRoot && checkAndScroll(el.shadowRoot)) {
                return true;
              }
            }

            return false;
          };

          const found = checkAndScroll(document.body || document.documentElement);
          return { success: found, url: window.location.href };
        };

        const results = await this.safeExecuteScript(tabId, {
          target: { tabId },
          func: inPageSearchAndScroll,
          args: [text],
        });

        scrolled = Boolean(results?.[0]?.result?.success);

        // Try subframes if not found in main frame
        if (!scrolled) {
          const frameResults = await this.safeExecuteScript(tabId, {
            target: { tabId, allFrames: true },
            func: inPageSearchAndScroll,
            args: [text],
          });
          const matchFrame = frameResults.find((r) => r.result?.success && r.frameId !== undefined && r.frameId !== 0);
          if (matchFrame) {
            scrolled = true;
            // Scroll specifically the subframe's container iframe into view in the top-level window
            try {
              const subframeUrl = matchFrame.result?.url || '';
              await this.safeExecuteScript(tabId, {
                target: { tabId },
                func: (targetUrl: string) => {
                  const iframes = Array.from(document.querySelectorAll('iframe, frame')) as HTMLIFrameElement[];
                  let targetIframe = iframes.find((f) => {
                    try {
                      return f.src === targetUrl || f.contentWindow?.location.href === targetUrl;
                    } catch {
                      return f.src === targetUrl;
                    }
                  });
                  if (!targetIframe && iframes.length === 1) {
                    targetIframe = iframes[0];
                  }
                  if (targetIframe) {
                    targetIframe.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
                  }
                },
                args: [subframeUrl],
              });
            } catch {}
          } else if (frameResults.some((r) => r.result?.success)) {
            scrolled = true;
          }
        }
      }

      if (!scrolled) {
        return createErrorResponse(`Text not found in active page: "${text}"`);
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                success: true,
                message: alreadyVisible
                  ? `Text "${text}" was already in the viewport; scrollIntoViewIfNeeded was a no-op`
                  : `Scrolled to text: "${text}"`,
                text,
                tabId,
                alreadyVisible,
              },
              null,
              2,
            ),
          },
        ],
        isError: false,
      };
    } catch (error) {
      return createErrorResponse(
        `Error executing chrome_scroll_to_text: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}

export const scrollToTextTool = new ScrollToTextTool();
