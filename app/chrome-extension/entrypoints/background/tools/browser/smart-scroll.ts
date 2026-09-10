import { createErrorResponse, ToolResult } from '@/common/tool-handler';
import { BaseBrowserToolExecutor } from '../base-browser';
import { TOOL_NAMES } from 'chrome-mcp-shared';
import { cdpSessionManager } from '@/utils/cdp-session-manager';
import { raceCdp, DialogOpenedError, createDialogInterruptResponse } from '@/utils/race-cdp';
import { waitForPageSettle } from '@/utils/action-watchdog';
import { executeInPage } from './in-page-engine';
import type { SmartScrollTargetInfo } from './dom-indexer';
import { parseUnifiedCoordinate, type PolymorphicCoordinate } from '@/utils/coordinate-parser';

export interface SmartScrollParams {
  tabId?: number;
  windowId?: number;
  sessionId?: string;
  direction?: 'down' | 'up' | 'left' | 'right';
  amount?: string | number;
  selector?: string;
  ref?: number;
  coordinate?: { x: number; y: number } | PolymorphicCoordinate;
  smooth?: boolean;
  waitForSettle?: boolean;
  settleTimeoutMs?: number;
}

/**
 * Intelligent Container Scrolling Tool
 * Automatically discovers the most prominent scrollable container or targets
 * an element by selector, ref, or coordinate, executing physical wheel scroll with fallback.
 */
export class SmartScrollTool extends BaseBrowserToolExecutor {
  name = TOOL_NAMES.BROWSER.SMART_SCROLL;

  async execute(args: SmartScrollParams = {}): Promise<ToolResult> {
    try {
      const tab = await this.resolveAffinityTab({
        tabId: args.tabId,
        windowId: args.windowId,
        sessionId: args.sessionId,
      });

      if (!tab.id) {
        return createErrorResponse('No active tab found for chrome_smart_scroll');
      }

      const tabId = tab.id;
      const direction = args.direction || 'down';

      let resolvedCoordinate = args.coordinate;
      if (args.coordinate) {
        const parsed = parseUnifiedCoordinate(args.coordinate, { tabId });
        if (parsed) {
          resolvedCoordinate = parsed;
        }
      }

      // 1. Locate optimal scroll target container
      const targetResults = await executeInPage({ tabId }, 'inPageFindSmartScrollTarget', [
        {
          selector: args.selector,
          ref: args.ref,
          coordinate: resolvedCoordinate,
        },
      ]);

      const target = (targetResults?.[0]?.result || {
        found: true,
        isWindow: true,
        tagName: 'window',
        x: 400,
        y: 300,
        width: 800,
        height: 600,
        scrollLeft: 0,
        scrollTop: 0,
        scrollWidth: 800,
        scrollHeight: 1200,
        clientWidth: 800,
        clientHeight: 600,
        canScrollDown: true,
        canScrollUp: false,
        canScrollRight: false,
        canScrollLeft: false,
      }) as SmartScrollTargetInfo;

      // 2. Compute pixel distance
      let pixelDistance: number;
      const refHeight = target.isWindow ? target.height : target.clientHeight;
      const refWidth = target.isWindow ? target.width : target.clientWidth;

      if (args.amount === 'half_page') {
        pixelDistance = Math.round((direction === 'left' || direction === 'right' ? refWidth : refHeight) * 0.5);
      } else if (args.amount === 'page' || args.amount === undefined) {
        pixelDistance = Math.round((direction === 'left' || direction === 'right' ? refWidth : refHeight) * 0.85);
      } else {
        const parsed = Number(args.amount);
        pixelDistance = !isNaN(parsed) && parsed > 0 ? parsed : Math.round(refHeight * 0.85);
      }

      let deltaX = 0;
      let deltaY = 0;
      if (direction === 'down') deltaY = pixelDistance;
      else if (direction === 'up') deltaY = -pixelDistance;
      else if (direction === 'right') deltaX = pixelDistance;
      else if (direction === 'left') deltaX = -pixelDistance;

      // 3. Attempt physical CDP mouseWheel scroll
      let cdpSuccess = false;
      try {
        await cdpSessionManager.withSession(tabId, 'smart_scroll', async () => {
          await raceCdp(tabId, 'Input.dispatchMouseEvent', {
            type: 'mouseWheel',
            x: target.x,
            y: target.y,
            deltaX,
            deltaY,
          });
        });
        cdpSuccess = true;
      } catch (wheelErr) {
        if (wheelErr instanceof DialogOpenedError) {
          return createDialogInterruptResponse(wheelErr);
        }
        // Fall back to in-page scroll
      }

      // 4. In-page scroll fallback if CDP wheel failed
      if (!cdpSuccess) {
        await executeInPage({ tabId }, 'inPagePerformSmartScroll', [
          target.isWindow,
          target.selector,
          deltaX,
          deltaY,
          args.smooth !== false,
        ]);
      }

      // 5. Wait for page settle
      let settleResult: any = undefined;
      if (args.waitForSettle !== false) {
        settleResult = await waitForPageSettle(tabId, { timeoutMs: args.settleTimeoutMs });
      }

      // 6. Inspect updated container status
      let updatedStatus: SmartScrollTargetInfo | null = null;
      try {
        const updateCheck = await executeInPage({ tabId }, 'inPageFindSmartScrollTarget', [
          { selector: target.isWindow ? undefined : target.selector, ref: args.ref, isWindow: target.isWindow },
        ]);
        updatedStatus = updateCheck?.[0]?.result as SmartScrollTargetInfo;
      } catch {}

      const currentScrollTop = updatedStatus ? updatedStatus.scrollTop : target.scrollTop + deltaY;
      const currentScrollLeft = updatedStatus ? updatedStatus.scrollLeft : target.scrollLeft + deltaX;
      const maxScrollY = Math.max(1, (updatedStatus?.scrollHeight || target.scrollHeight) - (updatedStatus?.clientHeight || target.clientHeight));
      const scrollProgress = Math.round(Math.min(100, Math.max(0, (currentScrollTop / maxScrollY) * 100)));

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(
              {
                success: true,
                direction,
                scrolledPixels: pixelDistance,
                scrollProgress: `${scrollProgress}%`,
                target: {
                  isWindow: target.isWindow,
                  tagName: target.tagName,
                  selector: target.selector,
                  coordinate: { x: target.x, y: target.y },
                },
                container: {
                  scrollTop: currentScrollTop,
                  scrollLeft: currentScrollLeft,
                  scrollHeight: updatedStatus?.scrollHeight ?? target.scrollHeight,
                  clientHeight: updatedStatus?.clientHeight ?? target.clientHeight,
                },
                canScrollDown: updatedStatus ? updatedStatus.canScrollDown : currentScrollTop < maxScrollY,
                canScrollUp: updatedStatus ? updatedStatus.canScrollUp : currentScrollTop > 0,
                settle: settleResult,
              },
              null,
              2,
            ),
          },
        ],
        isError: false,
      };
    } catch (error) {
      if (error instanceof DialogOpenedError) {
        return createDialogInterruptResponse(error);
      }
      return createErrorResponse(
        `Error executing chrome_smart_scroll: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}

export const smartScrollTool = new SmartScrollTool();
