import { createErrorResponse, ToolResult } from '@/common/tool-handler';
import { BaseBrowserToolExecutor } from '../base-browser';
import { TOOL_NAMES } from 'chrome-mcp-shared';
import { resolveTargetLocation } from './unified-locator';
import { executeInPage } from './in-page-engine';
import { cdpSessionManager } from '@/utils/cdp-session-manager';
import { waitForPageSettle } from '@/utils/action-watchdog';
import type { FillFormParams } from 'chrome-mcp-shared';

/**
 * Fill Form Tool (Batch Form Filling)
 *
 * Implements P1-6 batch form filling in a single MCP round-trip.
 * Resolves each field via unified locator and dispatches CDP input events.
 */
export class FillFormTool extends BaseBrowserToolExecutor {
  name = TOOL_NAMES.BROWSER.FILL_FORM;

  async execute(args: FillFormParams): Promise<ToolResult> {
    if (!args || !Array.isArray(args.fields) || args.fields.length === 0) {
      return createErrorResponse('fields parameter must be a non-empty array of field descriptors');
    }

    try {
      const tab = await this.resolveAffinityTab({
        tabId: args.tabId,
        windowId: args.windowId,
        sessionId: args.sessionId || args.sessionContext,
      });
      if (!tab.id) {
        return createErrorResponse('No active tab found for chrome_fill_form');
      }
      const tabId = tab.id;

      let isMac = false;
      try {
        const platform = await chrome.runtime.getPlatformInfo();
        isMac = platform?.os === 'mac';
      } catch {}
      const selectAllMod = isMac ? 4 : 2;

      const results: Array<{
        fieldIndex: number;
        success: boolean;
        ref?: string | number;
        selector?: string;
        resolutionPath?: string;
        error?: string;
      }> = [];

      await cdpSessionManager.withSession(tabId, 'fill-form', async () => {
        for (let i = 0; i < args.fields.length; i++) {
          const field = args.fields[i];
          const textToFill = String(field.value ?? field.text ?? '');

          const loc = await resolveTargetLocation(tabId, {
            ref: field.ref ?? field.index,
            index: field.index,
            selector: field.selector,
            targetText: (field as any).targetText,
            role: (field as any).role,
            coordinate: (field as any).coordinate,
          });

          if (!loc.success) {
            results.push({
              fieldIndex: i,
              success: false,
              ref: field.ref ?? field.index,
              selector: field.selector,
              error: loc.error || 'Field locator failed',
            });
            continue;
          }

          const isSpecial =
            loc.tagName === 'select' ||
            loc.inputType === 'color' ||
            loc.inputType === 'date' ||
            loc.inputType === 'range' ||
            loc.inputType === 'time' ||
            loc.inputType === 'datetime-local' ||
            loc.inputType === 'month' ||
            loc.inputType === 'week' ||
            loc.inputType === 'checkbox' ||
            loc.inputType === 'radio' ||
            loc.inputType === 'file';

          if (isSpecial) {
            const targetRef = field.ref ?? field.index;
            const targetIndex =
              typeof targetRef === 'number'
                ? targetRef
                : typeof targetRef === 'string' && /^\d+$/.test(targetRef)
                  ? parseInt(targetRef, 10)
                  : undefined;
            let outcome: any;
            if (typeof targetIndex === 'number' && targetIndex > 0) {
              const res = await executeInPage(
                loc.frameId ? { tabId, frameIds: [loc.frameId] } : { tabId },
                'inPageFillIndex',
                [targetIndex, textToFill, field.clear !== false],
              );
              outcome = res?.[0]?.result;
            } else if (field.selector) {
              const selRes = await this.safeExecuteScript(tabId, {
                target: loc.frameId ? { tabId, frameIds: [loc.frameId] } : { tabId },
                func: (sel: string, val: string, shouldClear: boolean) => {
                  const el = document.querySelector(sel);
                  if (!el) return { success: false, error: `Selector "${sel}" not found` };
                  if (typeof (el as HTMLElement).focus === 'function')
                    (el as HTMLElement).focus();

                  const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
                    window.HTMLInputElement?.prototype || {},
                    'value',
                  )?.set;
                  const nativeCheckboxSetter = Object.getOwnPropertyDescriptor(
                    window.HTMLInputElement?.prototype || {},
                    'checked',
                  )?.set;
                  const nativeTextAreaValueSetter = Object.getOwnPropertyDescriptor(
                    window.HTMLTextAreaElement?.prototype || {},
                    'value',
                  )?.set;

                  if (
                    el instanceof HTMLInputElement &&
                    (el.type === 'checkbox' || el.type === 'radio')
                  ) {
                    const isTruthy =
                      val === 'true' ||
                      val === '1' ||
                      val === 'checked' ||
                      val === 'on' ||
                      (val !== 'false' && val !== '0' && val !== 'off' && Boolean(val));
                    if (nativeCheckboxSetter) {
                      nativeCheckboxSetter.call(el, isTruthy);
                    } else {
                      el.checked = isTruthy;
                    }
                  } else if (el instanceof HTMLInputElement && nativeInputValueSetter) {
                    if (shouldClear) nativeInputValueSetter.call(el, '');
                    nativeInputValueSetter.call(el, val);
                  } else if (el instanceof HTMLTextAreaElement && nativeTextAreaValueSetter) {
                    if (shouldClear) nativeTextAreaValueSetter.call(el, '');
                    nativeTextAreaValueSetter.call(el, val);
                  } else if (el instanceof HTMLSelectElement) {
                    let matched = false;
                    for (const opt of Array.from(el.options)) {
                      if (
                        opt.value === val ||
                        opt.text === val ||
                        opt.text.trim() === val.trim()
                      ) {
                        el.value = opt.value;
                        matched = true;
                        break;
                      }
                    }
                    if (!matched) el.value = val;
                  } else if (
                    el instanceof HTMLInputElement ||
                    el instanceof HTMLTextAreaElement
                  ) {
                    if (shouldClear) el.value = '';
                    el.value = val;
                  } else if ((el as HTMLElement).isContentEditable) {
                    if (shouldClear) (el as HTMLElement).innerText = '';
                    (el as HTMLElement).innerText = val;
                  } else {
                    (el as any).value = val;
                  }

                  el.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
                  el.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
                  return { success: true, filledText: val };
                },
                args: [field.selector, textToFill, field.clear !== false],
              });
              outcome = selRes?.[0]?.result;
            }
            results.push({
              fieldIndex: i,
              success: outcome?.success !== false,
              ref: field.ref ?? field.index,
              selector: field.selector,
              resolutionPath: loc.resolutionPath,
            });
            continue;
          }

          try {
            // 1. Click to focus
            await cdpSessionManager.sendCommand(tabId, 'Input.dispatchMouseEvent', {
              type: 'mouseMoved',
              x: loc.x,
              y: loc.y,
            });
            await cdpSessionManager.sendCommand(tabId, 'Input.dispatchMouseEvent', {
              type: 'mousePressed',
              x: loc.x,
              y: loc.y,
              button: 'left',
              buttons: 1,
              clickCount: 1,
            });
            await cdpSessionManager.sendCommand(tabId, 'Input.dispatchMouseEvent', {
              type: 'mouseReleased',
              x: loc.x,
              y: loc.y,
              button: 'left',
              buttons: 0,
              clickCount: 1,
            });

            // 2. Clear if requested (default true)
            if (field.clear !== false) {
              await cdpSessionManager.sendCommand(tabId, 'Input.dispatchKeyEvent', {
                type: 'rawKeyDown',
                modifiers: selectAllMod,
                windowsVirtualKeyCode: 65,
                key: 'a',
                code: 'KeyA',
              });
              await cdpSessionManager.sendCommand(tabId, 'Input.dispatchKeyEvent', {
                type: 'keyUp',
                modifiers: selectAllMod,
                windowsVirtualKeyCode: 65,
                key: 'a',
                code: 'KeyA',
              });
              await cdpSessionManager.sendCommand(tabId, 'Input.dispatchKeyEvent', {
                type: 'rawKeyDown',
                windowsVirtualKeyCode: 8,
                key: 'Backspace',
                code: 'Backspace',
              });
              await cdpSessionManager.sendCommand(tabId, 'Input.dispatchKeyEvent', {
                type: 'keyUp',
                windowsVirtualKeyCode: 8,
                key: 'Backspace',
                code: 'Backspace',
              });
            }

            // 3. Insert text
            if (textToFill.length > 0) {
              await cdpSessionManager.sendCommand(tabId, 'Input.insertText', {
                text: textToFill,
              });
            }

            results.push({
              fieldIndex: i,
              success: true,
              ref: field.ref ?? field.index,
              selector: field.selector,
              resolutionPath: loc.resolutionPath,
            });
          } catch (err) {
            results.push({
              fieldIndex: i,
              success: false,
              ref: field.ref ?? field.index,
              selector: field.selector,
              error: String(err instanceof Error ? err.message : err),
            });
          }
        }
      });

      if (args.waitForSettle) {
        await waitForPageSettle(tabId, { timeoutMs: args.settleTimeoutMs ?? 1500 });
      }

      const allSuccess = results.every((r) => r.success);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                success: allSuccess,
                totalFields: args.fields.length,
                completedFields: results.filter((r) => r.success).length,
                results,
              },
              null,
              2,
            ),
          },
        ],
        isError: !allSuccess && results.every((r) => !r.success),
      };
    } catch (error) {
      return createErrorResponse(
        `Error executing chrome_fill_form: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}

export const fillFormTool = new FillFormTool();
