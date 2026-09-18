import { actionHistoryManager } from '@/utils/action-history-manager';
import { createErrorResponse, ToolResult } from '@/common/tool-handler';
import { BaseBrowserToolExecutor } from '../base-browser';
import { TOOL_NAMES } from 'chrome-mcp-shared';
import { executeInPage } from './in-page-engine';
import { computePerceptiveDelta } from './dom-indexer';
import { waitForPageSettle } from '@/utils/action-watchdog';
import { cdpSessionManager } from '@/utils/cdp-session-manager';
import { raceCdp, DialogOpenedError, createDialogInterruptResponse } from '@/utils/race-cdp';
import { sessionTabAffinity } from '@/utils/session-tab-affinity';
import { animateAgentCursor, animateAgentCursorClick } from './agent-cursor';
import { captureDeltaIfRequested } from '@/utils/delta-helper';
import { getSubframeViewportOffset } from './interact-index';
import { tabFaviconManager } from './tab-favicon';
import { computeHumanizedPoints } from '@/utils/mouse-trajectory';

export interface FillIndexParams {
  index: number;
  text?: string;
  value?: string;
  clear?: boolean;
  pressEnter?: boolean;
  submit?: boolean;
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

      return await sessionTabAffinity.runSerialized(targetTabId, async () => {
        const previousUrl = tab.url || '';
        tabFaviconManager.markTabActive(targetTabId);

        const preSignature = await executeInPage(
          { tabId: targetTabId },
          'inPageDetectPerceptiveSignature',
          [],
        )
          .then((r) => r?.[0]?.result)
          .catch(() => null);

      // D3 (TESTING-NOTES #19): surface active-tab fallback in the response.
      const fillIdxAffinityWarning =
        typeof args.tabId === 'number'
          ? undefined
          : hadPreexistingBinding
            ? undefined
            : `input routed to active tab (tabId=${targetTabId}); pass explicit tabId to target another tab`;

      let outcome: any = null;
      let filledViaCdp = false;
      let coords: any = null;
      let disambiguationWarning: string | undefined;

      // 1. Try CDP native mouse click + Input.insertText (isTrusted: true)
      try {
        const coordRes = await executeInPage(
          { tabId: targetTabId },
          'inPageGetElementCoordinates',
          [args.index],
        );
        coords = coordRes?.[0]?.result;
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
            if (targetFrameId !== 0) {
              const offset = await getSubframeViewportOffset(targetTabId, targetFrameId);
              const localX = coords?.frameOffsetX || 0;
              const localY = coords?.frameOffsetY || 0;
              coords.x = coords.x - localX + offset.offsetX;
              coords.y = coords.y - localY + offset.offsetY;
            }
          }
        }

        const isSpecialWidget =
          (coords as any)?.inputType === 'color' ||
          (coords as any)?.inputType === 'date' ||
          (coords as any)?.inputType === 'range' ||
          (coords as any)?.inputType === 'time' ||
          (coords as any)?.inputType === 'datetime-local' ||
          (coords as any)?.inputType === 'month' ||
          (coords as any)?.inputType === 'week' ||
          (coords as any)?.inputType === 'checkbox' ||
          (coords as any)?.inputType === 'radio' ||
          (coords as any)?.inputType === 'file' ||
          coords?.tagName === 'select';

        const isSearchTarget = Boolean(
          (coords as any)?.isSearch ||
          coords?.inputType === 'search' ||
          /(search|query|find|sousuo|搜索|查找)/i.test(
            `${coords?.attributes?.name || ''} ${coords?.attributes?.id || ''} ${coords?.attributes?.['aria-label'] || ''} ${coords?.attributes?.placeholder || ''}`,
          ),
        );
        const isMultiLineOrPostText =
          textToFill.includes('\n') ||
          textToFill.length > 60 ||
          /(http|#|@|tweet|post|reply|thread)/i.test(textToFill);

        if (isSearchTarget && isMultiLineOrPostText) {
          disambiguationWarning = `[Input Disambiguation Notice] Targeted element [${args.index}] appears to be a search input (searchbox), but the filled text looks like a multi-line post or comment. If you intended to post or reply, verify with chrome_read_dom to target the [composer] element instead.`;
          console.warn(`[FillIndexTool] ${disambiguationWarning}`);
        }

        if (
          coords?.success &&
          typeof coords.x === 'number' &&
          typeof coords.y === 'number' &&
          !isSpecialWidget
        ) {
          const targetX = coords.x;
          const targetY = coords.y;

          // Animate virtual agent cursor to target input before click and type
          void animateAgentCursor(targetTabId, targetX, targetY);
          void animateAgentCursorClick(targetTabId, targetX, targetY);

          // Skip the Ctrl+A + Backspace clear sequence when the field is already
          // empty: a trusted Backspace on an empty box can trigger page-level
          // "backspace retreats focus" logic (e.g. OTP inputs) and steal the
          // subsequent insertText into the previous box.
          const isKnownEmpty =
            (typeof coords.value === 'string' && coords.value === '') ||
            (coords.value === undefined && (!coords.text || coords.text.trim() === ''));
          if (typeof coords.value === 'string') {
            actionHistoryManager.pushAction(targetTabId, {
              type: 'fill',
              index: args.index,
              prevValue: coords.value,
              timestamp: Date.now(),
            });
          }

          let verification: any = null;
          let fillMethod = 'cdp_native';

          await cdpSessionManager.withSession(targetTabId, 'fill-index', async () => {
            // Humanized micro-trajectory to bypass anti-bot path listeners
            const startX = Math.max(0, targetX - (40 + Math.floor(Math.random() * 50)));
            const startY = Math.max(0, targetY - (25 + Math.floor(Math.random() * 40)));
            const points = computeHumanizedPoints(startX, startY, targetX, targetY, 3);
            for (const pt of points) {
              await raceCdp(targetTabId, 'Input.dispatchMouseEvent', {
                type: 'mouseMoved',
                x: pt.x,
                y: pt.y,
              });
              await new Promise((r) => setTimeout(r, 10));
            }

            await raceCdp(targetTabId, 'Input.dispatchMouseEvent', {
              type: 'mousePressed',
              x: targetX,
              y: targetY,
              button: 'left',
              buttons: 1,
              clickCount: 1,
            });
            await new Promise((r) => setTimeout(r, 35));
            await raceCdp(targetTabId, 'Input.dispatchMouseEvent', {
              type: 'mouseReleased',
              x: targetX,
              y: targetY,
              button: 'left',
              buttons: 0,
              clickCount: 1,
            });

            // Click settling pause (50ms) for dormant rich-text composers to mount and focus
            await new Promise((r) => setTimeout(r, 50));

            if (args.clear === true || (args.clear !== false && !isKnownEmpty)) {
              // Cross-platform Deep Reset protocol (In-Page selection + beforeinput/execCommand delete)
              try {
                await executeInPage({ tabId: targetTabId }, 'inPageDeepResetElement', [args.index]);
              } catch {}

              // Native CDP Backspace fallback (cross-platform, works across Windows/Linux/macOS)
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

            // Allow React 18/19 concurrent event batching / microtasks to settle
            await new Promise((r) => setTimeout(r, 40));

            // True Input Commitment verification
            try {
              const vRes = await executeInPage(
                { tabId: targetTabId },
                'inPageVerifyInputCommitment',
                [args.index, textToFill],
              );
              verification = vRes?.[0]?.result;
            } catch {}

            // Micro-retry for asynchronous framework debounce (e.g. Draft.js state update)
            if (textToFill && verification && verification.committed === false) {
              await new Promise((r) => setTimeout(r, 60));
              try {
                const retryRes = await executeInPage(
                  { tabId: targetTabId },
                  'inPageVerifyInputCommitment',
                  [args.index, textToFill],
                );
                if (retryRes?.[0]?.result?.committed) {
                  verification = retryRes[0].result;
                }
              } catch {}
            }

            if (textToFill && verification && verification.committed === false) {
              console.warn(
                `[FillIndexTool] Reactive state commitment verification failed after Input.insertText for index [${args.index}]. Retrying with CDP key-by-key typing...`,
              );
              for (const char of textToFill) {
                await raceCdp(targetTabId, 'Input.dispatchKeyEvent', {
                  type: 'keyDown',
                  text: char,
                  unmodifiedText: char,
                  key: char,
                });
                await raceCdp(targetTabId, 'Input.dispatchKeyEvent', {
                  type: 'keyUp',
                  key: char,
                });
                await new Promise((r) => setTimeout(r, 8));
              }
              fillMethod = 'cdp_key_by_key';

              // Settling pause after key-by-key typing
              await new Promise((r) => setTimeout(r, 50));

              try {
                const vRes2 = await executeInPage(
                  { tabId: targetTabId },
                  'inPageVerifyInputCommitment',
                  [args.index, textToFill],
                );
                verification = vRes2?.[0]?.result;
              } catch {}
            }

            if (textToFill && verification && verification.committed === false) {
              throw new Error(
                `True Input Commitment failed: ${verification.diagnostics || 'Framework reactive state did not update with filled text'}`,
              );
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
            committed: true,
            index: args.index,
            filledText: textToFill,
            isTrusted: true,
            method: fillMethod,
            tagName: coords.tagName,
            isComposer: (coords as any)?.isComposer,
            isEditor: (coords as any)?.isEditor,
            isSearch: (coords as any)?.isSearch,
            submitButtonState: verification?.submitButtonState,
            disambiguationWarning,
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
          args.pressEnter === true,
        ]);

        outcome = results?.[0]?.result;
        if (!outcome || !outcome.success) {
          const frameResults = await executeInPage(
            { tabId: targetTabId, allFrames: true },
            'inPageFillIndex',
            [args.index, textToFill, args.clear !== false, args.pressEnter === true],
          );
          const match = frameResults.find((r) => r.result?.success);
          if (match?.result) {
            outcome = match.result;
          }
        }

        if (outcome && typeof outcome === 'object') {
          if ((coords as any)?.isComposer) outcome.isComposer = true;
          if ((coords as any)?.isEditor) outcome.isEditor = true;
          if ((coords as any)?.isSearch) outcome.isSearch = true;
          if (disambiguationWarning) {
            outcome.disambiguationWarning = disambiguationWarning;
          }

          if (outcome.success) {
            let fallbackVerify: any = null;
            try {
              const vRes = await executeInPage(
                { tabId: targetTabId },
                'inPageVerifyInputCommitment',
                [args.index, textToFill],
              );
              fallbackVerify = vRes?.[0]?.result;
            } catch {}

            if (textToFill && fallbackVerify && fallbackVerify.committed === false) {
              outcome.committed = false;
              outcome.diagnostics = fallbackVerify.diagnostics;
              outcome.submitButtonState = fallbackVerify.submitButtonState;
            } else {
              outcome.committed = true;
              if (fallbackVerify?.submitButtonState) {
                outcome.submitButtonState = fallbackVerify.submitButtonState;
              }
            }
          }
        }

        // If fallback fill succeeded and pressEnter requested, dispatch Enter via CDP
        if (outcome?.success && args.pressEnter === true) {
          try {
            await cdpSessionManager.withSession(targetTabId, 'fill-index-enter', async () => {
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
            });
          } catch {}
        }
      }

      if (!outcome || !outcome.success || outcome.committed === false) {
        return createErrorResponse(
          (outcome?.error || outcome?.diagnostics || `Failed to commit text into element with index [${args.index}]`) +
            `. Hint: If the element is within a ShadowRoot or custom rich-text composer, verify with chrome_read_dom or try clicking directly.`,
        );
      }

      if (args.submit === true && outcome.success) {
        if (outcome.submitButtonState?.found && typeof (outcome.submitButtonState as any).index === 'number') {
          const btnIdx = (outcome.submitButtonState as any).index;
          try {
            const { interactIndexTool } = await import('./interact-index');
            const clickRes = await interactIndexTool.execute({
              index: btnIdx,
              action: 'click',
              tabId: targetTabId,
              waitForSettle: false,
            });
            let submitSummary: any = (clickRes?.content?.[0] as any)?.text;
            try {
              submitSummary = JSON.parse(submitSummary);
            } catch {}
            (outcome as any).submitted = true;
            (outcome as any).submitMethod = 'click';
            (outcome as any).submittedButtonIndex = btnIdx;
            (outcome as any).submitResult = submitSummary || { success: true };
          } catch (clickErr) {
            console.warn('Auto-submit click failed, falling back to Enter:', clickErr);
            await raceCdp(targetTabId, 'Input.dispatchKeyEvent', {
              type: 'rawKeyDown',
              key: 'Enter',
              code: 'Enter',
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
            (outcome as any).submitted = true;
            (outcome as any).submitMethod = 'pressEnter';
          }
        } else {
          await raceCdp(targetTabId, 'Input.dispatchKeyEvent', {
            type: 'rawKeyDown',
            key: 'Enter',
            code: 'Enter',
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
          (outcome as any).submitted = true;
          (outcome as any).submitMethod = 'pressEnter';
        }
      }

      const shouldWaitSettle =
        args.waitForSettle ||
        (args.pressEnter === true && args.waitForSettle !== false) ||
        (args.submit === true && args.waitForSettle !== false);
      if (shouldWaitSettle) {
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

      const postSignature = await executeInPage(
        { tabId: targetTabId },
        'inPageDetectPerceptiveSignature',
        [],
      )
        .then((r) => r?.[0]?.result)
        .catch(() => null);
      const perceptiveDelta = computePerceptiveDelta(preSignature, postSignature);
      if (perceptiveDelta) {
        (outcome as any).perceptiveDelta = perceptiveDelta;
      }

      (outcome as any).pressEnter = Boolean(
        args.pressEnter || (args.submit && (outcome as any).submitMethod === 'pressEnter'),
      );
      if (args.pressEnter === true || (outcome as any).submitMethod === 'pressEnter') {
        (outcome as any).pressEnterDispatched = true;
      }

      if (outcome.submitButtonState?.found && typeof (outcome.submitButtonState as any).index === 'number') {
        const btnIdx = (outcome.submitButtonState as any).index;
        const btnTxt = outcome.submitButtonState.text || 'Submit';
        (outcome as any).submitButtonIndex = btnIdx;
        (outcome as any).submitButtonText = btnTxt;
        if (!args.submit) {
          (outcome as any).nextActionHint = `Submit button detected at index [${btnIdx}] ("${btnTxt}"). 1-Turn Optimal Paradigm: Use chrome_fill_index({ index: ${args.index}, text: '...', submit: true }), pass pressEnter: true, or use chrome_batch_actions([{type: 'fill', index: ${args.index}, text: '...'}, {type: 'click', index: ${btnIdx}}]) to eliminate extra turns.`;
        }
      } else if (!args.pressEnter && !args.submit) {
        (outcome as any).nextActionHint = `1-Turn Optimal Paradigm: Pass submit: true or pressEnter: true to chrome_fill_index, or use chrome_batch_actions to pipeline fill and submit in 1 turn.`;
      }

      const seen = new WeakSet();
      const safeText = JSON.stringify(outcome, (_key, value) => {
        if (typeof value === 'object' && value !== null) {
          if (seen.has(value)) return '[Circular]';
          seen.add(value);
        }
        return value;
      });

      return {
        content: [
          {
            type: 'text',
            text: safeText,
          },
        ],
        isError: false,
      };
      });
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
