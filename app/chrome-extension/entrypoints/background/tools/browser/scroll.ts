import { createErrorResponse, ToolResult } from '@/common/tool-handler';
import { BaseBrowserToolExecutor } from '../base-browser';
import { TOOL_NAMES } from 'chrome-mcp-shared';
import { cdpSessionManager } from '@/utils/cdp-session-manager';
import { raceCdp, DialogOpenedError, createDialogInterruptResponse } from '@/utils/race-cdp';
import { waitForPageSettle } from '@/utils/action-watchdog';
import { executeInPage } from './in-page-engine';
import { parseUnifiedCoordinate, type PolymorphicCoordinate } from '@/utils/coordinate-parser';

export interface ScrollToolParams {
  direction?: 'up' | 'down' | 'left' | 'right';
  amount?: number; // Distance in pixels
  pages?: number; // Number of viewport pages
  index?: number; // Optional 1-based element index to scroll
  coordinate?: { x: number; y: number } | PolymorphicCoordinate; // Optional pixel coordinates to dispatch wheel at
  tabId?: number;
  windowId?: number;
  sessionId?: string;
  sessionContext?: string;
}

// Background/occluded tabs never ack CDP wheel dispatches; remember the failure
// briefly so consecutive scrolls don't each burn the 3s race before falling back.
const wheelSkipUntil = new Map<number, number>();

if (typeof chrome !== 'undefined' && chrome.tabs) {
  chrome.tabs.onActivated?.addListener?.(({ tabId }) => {
    wheelSkipUntil.delete(tabId);
  });
  chrome.tabs.onUpdated?.addListener?.((tabId, changeInfo) => {
    if (changeInfo.status === 'loading' || changeInfo.url) {
      wheelSkipUntil.delete(tabId);
    }
  });
  chrome.tabs.onRemoved?.addListener?.((tabId) => {
    wheelSkipUntil.delete(tabId);
  });
}

/**
 * Physical Page Scrolling Tool
 * Dispatches CDP mouseWheel events to faithfully replicate human wheel scrolling,
 * with graceful in-page window.scrollBy fallback.
 */
export class ScrollTool extends BaseBrowserToolExecutor {
  name = TOOL_NAMES.BROWSER.SCROLL;

  async execute(args: ScrollToolParams = {}): Promise<ToolResult> {
    try {
      const tab = await this.resolveAffinityTab({
        tabId: args.tabId,
        windowId: args.windowId,
        sessionId: args.sessionId || args.sessionContext,
      });

      if (!tab.id) {
        return createErrorResponse('No active tab found for chrome_scroll');
      }

      const direction = args.direction || 'down';
      let pixelDistance = args.amount;

      // Default viewport dimension if pages is specified or amount is omitted
      const defaultPageHeight = 800;
      const defaultPageWidth = 1000;

      if (typeof pixelDistance !== 'number' || isNaN(pixelDistance) || pixelDistance <= 0) {
        const pages = typeof args.pages === 'number' && args.pages > 0 ? args.pages : 1;
        if (direction === 'left' || direction === 'right') {
          pixelDistance = Math.round(defaultPageWidth * pages);
        } else {
          pixelDistance = Math.round(defaultPageHeight * pages);
        }
      }

      let deltaX = 0;
      let deltaY = 0;

      switch (direction) {
        case 'up':
          deltaY = -pixelDistance;
          break;
        case 'down':
          deltaY = pixelDistance;
          break;
        case 'left':
          deltaX = -pixelDistance;
          break;
        case 'right':
          deltaX = pixelDistance;
          break;
      }

      // Determine wheel dispatch coordinate (x, y)
      let wheelX = 500;
      let wheelY = 400;

      if (args.coordinate) {
        const parsed = parseUnifiedCoordinate(args.coordinate, { tabId: tab.id });
        if (parsed) {
          wheelX = parsed.x;
          wheelY = parsed.y;
        } else if (
          typeof (args.coordinate as any).x === 'number' &&
          typeof (args.coordinate as any).y === 'number'
        ) {
          wheelX = (args.coordinate as any).x;
          wheelY = (args.coordinate as any).y;
        }
      } else if (typeof args.index === 'number' && args.index > 0) {
        const coordRes = await executeInPage({ tabId: tab.id }, 'inPageGetElementCoordinates', [
          args.index,
        ]);
        let coords = coordRes?.[0]?.result;
        if (!coords?.success) {
          const frameResults = await executeInPage(
            { tabId: tab.id, allFrames: true },
            'inPageGetElementCoordinates',
            [args.index],
          );
          const match = frameResults.find((r) => r.result?.success);
          if (match?.result) coords = match.result;
        }
        if (coords?.success && typeof coords.x === 'number' && typeof coords.y === 'number') {
          wheelX = coords.x;
          wheelY = coords.y;
        }
      } else {
        try {
          const vp = await this.safeExecuteScript(tab.id, {
            target: { tabId: tab.id },
            func: () => ({
              cx: Math.round(window.innerWidth / 2),
              cy: Math.round(window.innerHeight / 2),
            }),
          });
          if (vp?.[0]?.result?.cx && vp?.[0]?.result?.cy) {
            wheelX = vp[0].result.cx;
            wheelY = vp[0].result.cy;
          }
        } catch {}
      }

      let cdpSuccess = false;
      let method = 'window_scroll_by';
      const skipUntil = wheelSkipUntil.get(tab.id) || 0;
      const isBackground = Boolean(tab && !tab.active);
      // Primary: Dispatch physical mouse wheel events via CDP
      if (!isBackground && skipUntil < Date.now()) {
        try {
          await cdpSessionManager.withSession(tab.id, 'scroll', async () => {
            await raceCdp(tab.id!, 'Input.dispatchMouseEvent', {
              type: 'mouseWheel',
              x: wheelX,
              y: wheelY,
              deltaX,
              deltaY,
            });
            cdpSuccess = true;
            wheelSkipUntil.delete(tab.id!);
          });
        } catch (cdpErr) {
          if (cdpErr instanceof DialogOpenedError) {
            throw cdpErr;
          }
          wheelSkipUntil.set(tab.id!, Date.now() + 60_000);
          console.warn(
            '[ScrollTool] CDP wheel dispatch failed, falling back to script injection:',
            cdpErr,
          );
        }
      }

      // Fallback: If CDP failed, scroll the right root from the script side:
      // the indexed element's nearest scrollable ancestor when index is given,
      // otherwise the window.
      if (!cdpSuccess) {
        if (typeof args.index === 'number' && args.index > 0) {
          try {
            await executeInPage({ tabId: tab.id }, 'inPageScrollByIndex', [
              args.index,
              deltaX,
              deltaY,
            ]);
            method = 'element_scroll_by';
          } catch {}
        } else if (
          args.coordinate &&
          typeof args.coordinate.x === 'number' &&
          typeof args.coordinate.y === 'number'
        ) {
          try {
            const coordRes = await this.safeExecuteScript(tab.id, {
              target: { tabId: tab.id },
              func: (x: number, y: number, dx: number, dy: number) => {
                const el = document.elementFromPoint(x, y);
                let node: Element | null = el;
                while (node && node !== document.body && node !== document.documentElement) {
                  const cs = getComputedStyle(node);
                  const canY =
                    dy !== 0 &&
                    /(auto|scroll|overlay)/.test(cs.overflowY) &&
                    node.scrollHeight > node.clientHeight + 10;
                  const canX =
                    dx !== 0 &&
                    /(auto|scroll|overlay)/.test(cs.overflowX) &&
                    node.scrollWidth > node.clientWidth + 10;
                  if (canY || canX) {
                    node.scrollBy({ left: dx, top: dy, behavior: 'instant' as ScrollBehavior });
                    return {
                      scrolled: true,
                      scrollTop: node.scrollTop,
                      scrollLeft: node.scrollLeft,
                    };
                  }
                  node = node.parentElement;
                }
                return { scrolled: false };
              },
              args: [args.coordinate.x, args.coordinate.y, deltaX, deltaY],
            });
            if (coordRes?.[0]?.result?.scrolled) {
              method = 'coordinate_scroll_by';
            }
          } catch {}
        }
        if (method === 'window_scroll_by') {
          await this.safeExecuteScript(tab.id, {
            target: { tabId: tab.id },
            func: (dx: number, dy: number) => {
              window.scrollBy({ left: dx, top: dy, behavior: 'instant' as ScrollBehavior });
            },
            args: [deltaX, deltaY],
          });
        }
      }

      // Wait for layout to settle after scrolling. Guarded: the executeScript
      // injection behind waitForPageSettle can hang while a modal dialog keeps
      // the renderer paused.
      await Promise.race([
        waitForPageSettle(tab.id, { timeoutMs: 300, quietPeriodMs: 60 }),
        new Promise((r) => setTimeout(r, 2000)),
      ]);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: true,
              direction,
              deltaX,
              deltaY,
              method: cdpSuccess ? 'cdp_mouse_wheel' : method,
              tabId: tab.id,
              _canonicalRecommendation: "For viewport-aware scrolling and remaining page counts, prefer 'chrome_smart_scroll'.",
            }),
          },
        ],
        isError: false,
      };
    } catch (error) {
      if (error instanceof DialogOpenedError) {
        return createDialogInterruptResponse(error);
      }
      return createErrorResponse(
        `Error executing chrome_scroll: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}

export const scrollTool = new ScrollTool();
