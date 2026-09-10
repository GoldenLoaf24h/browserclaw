import { createErrorResponse, ToolResult } from '@/common/tool-handler';
import { BaseBrowserToolExecutor } from '../base-browser';
import { TOOL_NAMES } from 'chrome-mcp-shared';
import { cdpSessionManager } from '@/utils/cdp-session-manager';
import { DialogOpenedError, createDialogInterruptResponse } from '@/utils/race-cdp';

export { DialogOpenedError, createDialogInterruptResponse };

interface HandleDialogParams {
  action: 'accept' | 'dismiss';
  promptText?: string;
  tabId?: number;
  windowId?: number;
  sessionId?: string;
  sessionContext?: string;
}

/**
 * Handle JavaScript dialogs (alert/confirm/prompt) via CDP Page.handleJavaScriptDialog
 */
class HandleDialogTool extends BaseBrowserToolExecutor {
  name = TOOL_NAMES.BROWSER.HANDLE_DIALOG;

  async execute(args: HandleDialogParams): Promise<ToolResult> {
    const { action, promptText } = args || ({} as HandleDialogParams);
    if (!action || (action !== 'accept' && action !== 'dismiss')) {
      return createErrorResponse('action must be "accept" or "dismiss"');
    }

    let tabId: number | undefined;
    try {
      const tab = await this.resolveAffinityTab({
        tabId: args?.tabId,
        windowId: args?.windowId,
        sessionId: args?.sessionId || args?.sessionContext,
      });
      if (!tab?.id) return createErrorResponse('No active tab found');
      tabId = tab.id!;

      // Use shared CDP session manager for safe attach/detach with refcount
      await cdpSessionManager.withSession(tabId, 'dialog', async () => {
        await cdpSessionManager.sendCommand(tabId!, 'Page.handleJavaScriptDialog', {
          accept: action === 'accept',
          promptText: action === 'accept' ? promptText : undefined,
        });
      });

      const handled = tabId !== undefined ? cdpSessionManager.getPendingDialog(tabId) : undefined;
      if (tabId !== undefined) cdpSessionManager.clearPendingDialog(tabId);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: true,
              action,
              promptText: promptText || null,
              handledDialog: handled
                ? {
                    type: handled.type,
                    message: handled.message,
                    defaultPrompt: handled.defaultPrompt,
                    openedAgoMs: Date.now() - handled.openedAtMs,
                  }
                : null,
            }),
          },
        ],
        isError: false,
      };
    } catch (error) {
      const pending = tabId !== undefined ? cdpSessionManager.getPendingDialog(tabId) : undefined;
      const hint = pending ? ` (pending dialog: ${pending.type} "${pending.message}")` : '';
      return createErrorResponse(
        `Failed to handle dialog: ${error instanceof Error ? error.message : String(error)}${hint}`,
      );
    }
  }
}

export const handleDialogTool = new HandleDialogTool();
