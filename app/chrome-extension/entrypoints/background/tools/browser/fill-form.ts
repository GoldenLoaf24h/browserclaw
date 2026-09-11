import { createErrorResponse, ToolResult } from '@/common/tool-handler';
import { BaseBrowserToolExecutor } from '../base-browser';
import { TOOL_NAMES } from 'chrome-mcp-shared';
import { resolveTargetLocation } from './unified-locator';
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
              clickCount: 1,
            });
            await cdpSessionManager.sendCommand(tabId, 'Input.dispatchMouseEvent', {
              type: 'mouseReleased',
              x: loc.x,
              y: loc.y,
              button: 'left',
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
