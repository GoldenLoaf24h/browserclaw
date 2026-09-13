import { actionHistoryManager } from '@/utils/action-history-manager';
import { createErrorResponse, ToolResult } from '@/common/tool-handler';
import { BaseBrowserToolExecutor } from '../base-browser';
import { TOOL_NAMES } from 'chrome-mcp-shared';
import { executeInPage } from './in-page-engine';
import { waitForPageSettle } from '@/utils/action-watchdog';
import { cdpSessionManager } from '@/utils/cdp-session-manager';
import { raceCdp, DialogOpenedError, createDialogInterruptResponse } from '@/utils/race-cdp';
import { sessionTabAffinity } from '@/utils/session-tab-affinity';
import { animateAgentCursor } from './agent-cursor';
import { captureDeltaIfRequested } from '@/utils/delta-helper';
import { getSubframeViewportOffset } from './interact-index';

export interface FillIndexParams {
  index: number;
  text?: string;
  value?: string;
  clear?: boolean;
  pressEnter?: boolean;
  tabId?: number;
  windowId?: number;
  waitForSettle?: boolean;
  settleTimeoutMs?: number;
  includeDelta?: boolean;
  sessionId?: string;
  sessionContext?: string;
}

export class FillIndexTool extends BaseBrowserToolExecutor {
  name = TOOL_NAMES.BROWSER.FILL_INDEX;

  async execute(args: FillIndexParams): Promise<ToolResult> {
    if (typeof args?.index !== 'number' || args.index <= 0) {
      return createErrorResponse('Index parameter must be a positive 1-based integer');
    }

    const textToFill = args.text ?? args.value ?? '';

    // D3: snapshot BEFORE resolveAffinityTab — its active-tab fallback binds
    // the fallback tab, so a post-resolution check would always see a
    // "valid" binding and never warn (verified by live testing).
    const sidForWarning = args.sessionId || args.sessionContext;
    const hadPreexistingBinding = sessionTabAffinity.hasBinding(sidForWarning);

    try {
      const tab = await this.resolveAffinityTab({
        tabId: args.tabId,
        windowId: args.windowId,
        sessionId: args.sessionId || args.sessionContext,
      });
      if (!tab.id) {
        return createErrorResponse('No active tab found for chrome_fill_index');
      }
      const targetTabId: number = tab.id;
      const previousUrl = tab.url || '';

      // D3 (TESTING-NOTES #19): surface active-tab fallback in the response.
      const fillIdxAffinityWarning =
        typeof args.tabId === 'number'
          ? undefined
          : hadPreexistingBinding
            ? undefined
            : `input routed to active tab (tabId=${targetTabId}); pass explicit tabId to target another tab`;

      let outcome: any = null;
      let filledViaCdp = false;

      // 1. Try CDP native mouse click + Input.insertText (isTrusted: true)
      try {
        const coordRes = await executeInPage(
          { tabId: targetTabId },
          'inPageGetElementCoordinates',
          [args.index],
        );
        let coords = coordRes?.[0]?.result;
        if (!coords?.success) {
          const frameResults = await executeInPage(
            { tabId: targetTabId, allFrames: true },
            'inPageGetElementCoordinates',
            [args.index],
          );
          const match = frameResults.find((r) => r.result?.success);
          if (match?.result) {
            coords = match.result;
            const targetFrameId = match.frameId ?? 0;
            if (targetFrameId !== 0 && !coords.frameOffsetX && !coords.frameOffsetY) {
              const offset = await getSubframeViewportOffset(targetTabId, targetFrameId);
              coords.x += offset.offsetX;
              coords.y += offset.offsetY;
            }
          }
        }

        if (coords?.success && typeof coords.x === 'number' && typeof coords.y === 'number') {
          const targetX = coords.x;
          const targetY = coords.y;

          // Animate virtual agent cursor to target input before click and type
          await animateAgentCursor(targetTabId, targetX, targetY, {
            waitForArrival: true,
            timeoutMs: 350,
          });

          // Skip the Ctrl+A + Backspace clear sequence when the field is already
          // empty: a trusted Backspace on an empty box can trigger page-level
          // "backspace retreats focus" logic (e.g. OTP inputs) and steal the
          // subsequent insertText into the previous box.
          const isKnownEmpty = typeof coords.value === 'string' && coords.value === '';
          if (typeof coords.value === 'string') {
            actionHistoryManager.pushAction(targetTabId, {
              type: 'fill',
              index: args.index,
              prevValue: coords.value,
              timestamp: Date.now(),
            });
          }

          await cdpSessionManager.withSession(targetTabId, 'fill-index', async () => {
            await raceCdp(targetTabId, 'Input.dispatchMouseEvent', {
              type: 'mouseMoved',
              x: targetX,
              y: targetY,
            });
            await raceCdp(targetTabId, 'Input.dispatchMouseEvent', {
              type: 'mousePressed',
              x: targetX,
              y: targetY,
              button: 'left',
              clickCount: 1,
            });
            await raceCdp(targetTabId, 'Input.dispatchMouseEvent', {
              type: 'mouseReleased',
              x: targetX,
              y: targetY,
              button: 'left',
              clickCount: 1,
            });

            if (args.clear !== false && !isKnownEmpty) {
              let isMac = false;
              try {
                const platform = await chrome.runtime.getPlatformInfo();
                isMac = platform?.os === 'mac';
              } catch {}
              const mod = isMac ? 4 : 2;
              await raceCdp(targetTabId, 'Input.dispatchKeyEvent', {
                type: 'rawKeyDown',
                modifiers: mod,
                windowsVirtualKeyCode: 65,
                key: 'a',
                code: 'KeyA',
              });
              await raceCdp(targetTabId, 'Input.dispatchKeyEvent', {
                type: 'keyUp',
                modifiers: mod,
                windowsVirtualKeyCode: 65,
                key: 'a',
                code: 'KeyA',
              });
              await raceCdp(targetTabId, 'Input.dispatchKeyEvent', {
                type: 'rawKeyDown',
                windowsVirtualKeyCode: 8,
                key: 'Backspace',
                code: 'Backspace',
              });
              await raceCdp(targetTabId, 'Input.dispatchKeyEvent', {
                type: 'keyUp',
                windowsVirtualKeyCode: 8,
                key: 'Backspace',
                code: 'Backspace',
              });
            }

            if (textToFill) {
              await raceCdp(targetTabId, 'Input.insertText', {
                text: String(textToFill),
              });
            }

            if (args.pressEnter === true) {
              await raceCdp(targetTabId, 'Input.dispatchKeyEvent', {
                type: 'keyDown',
                key: 'Enter',
                code: 'Enter',
                text: '\r',
                unmodifiedText: '\r',
                windowsVirtualKeyCode: 13,
                nativeVirtualKeyCode: 13,
              });
              await raceCdp(targetTabId, 'Input.dispatchKeyEvent', {
                type: 'keyUp',
                key: 'Enter',
                code: 'Enter',
                windowsVirtualKeyCode: 13,
                nativeVirtualKeyCode: 13,
              });
            }
          });

          outcome = {
            success: true,
            index: args.index,
            filledText: textToFill,
            isTrusted: true,
            method: 'cdp_native',
            tagName: coords.tagName,
          };
          filledViaCdp = true;
        }
      } catch (cdpErr) {
        if (cdpErr instanceof DialogOpenedError) {
          throw cdpErr;
        }
        console.warn(
          `CDP native fill failed on index [${args.index}], falling back to inPageFillIndex:`,
          cdpErr,
        );
      }

      // 2. Fallback to in-page synthetic fill
      if (!filledViaCdp) {
        const results = await executeInPage({ tabId: targetTabId }, 'inPageFillIndex', [
          args.index,
          textToFill,
          args.clear !== false,
        ]);

        outcome = results?.[0]?.result;
        if (!outcome || !outcome.success) {
          const frameResults = await executeInPage(
            { tabId: targetTabId, allFrames: true },
            'inPageFillIndex',
            [args.index, textToFill, args.clear !== false],
          );
          const match = frameResults.find((r) => r.result?.success);
          if (match?.result) {
            outcome = match.result;
          }
        }
      }

      if (!outcome || !outcome.success) {
        return createErrorResponse(
          (outcome?.error || `Failed to fill element with index [${args.index}]`) +
            `. Hint: If the element is within a ShadowRoot, try calling chrome_javascript or verifying the index with chrome_read_dom.`,
        );
      }

      if (args.waitForSettle) {
        const settleResult = await waitForPageSettle(targetTabId, {
          timeoutMs: args.settleTimeoutMs,
        });
        (outcome as any).settle = settleResult;
      }

      if (fillIdxAffinityWarning) {
        (outcome as any).affinityWarning = fillIdxAffinityWarning;
      }

      const delta = await captureDeltaIfRequested(targetTabId, args.includeDelta);
      if (delta) {
        (outcome as any).delta = delta;
      }

      let currentUrl = previousUrl;
      try {
        const updatedTab = await chrome.tabs.get(targetTabId);
        currentUrl = updatedTab.url || previousUrl;
      } catch {}
      const urlChanged = Boolean(previousUrl && currentUrl && previousUrl !== currentUrl);
      (outcome as any).urlChanged = urlChanged;
      (outcome as any).previousUrl = previousUrl;
      (outcome as any).currentUrl = currentUrl;

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(outcome),
          },
        ],
        isError: false,
      };
    } catch (error) {
      if (error instanceof DialogOpenedError) {
        return createDialogInterruptResponse(error);
      }
      return createErrorResponse(
        `Error executing chrome_fill_index: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}

export const fillIndexTool = new FillIndexTool();
