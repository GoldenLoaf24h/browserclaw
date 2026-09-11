import { createErrorResponse, ToolResult } from '@/common/tool-handler';
import { BaseBrowserToolExecutor } from '../base-browser';
import { TOOL_NAMES } from 'chrome-mcp-shared';
import { cdpSessionManager } from '@/utils/cdp-session-manager';

export interface CdpExecuteParams {
  tabId?: number;
  method: string;
  params?: Record<string, any>;
  timeoutMs?: number;
  sessionId?: string;
  sessionContext?: string;
}

/**
 * Low-level Chrome DevTools Protocol (CDP) execution tool.
 * Gives advanced models direct, unconstrained access to native CDP domains
 * (Page, DOM, Runtime, Input, Network, Emulation, etc.) with safe timeout handling.
 */
export class CdpExecuteTool extends BaseBrowserToolExecutor {
  name = TOOL_NAMES.BROWSER.CDP_EXECUTE;

  async execute(args: CdpExecuteParams): Promise<ToolResult> {
    if (!args || typeof args.method !== 'string' || !args.method.trim()) {
      return createErrorResponse('method is required and must be a valid CDP command string (e.g. "Page.navigate")');
    }

    const sessionId = args.sessionId || args.sessionContext;
    let targetTab: chrome.tabs.Tab;

    try {
      if (typeof args.tabId === 'number') {
        const t = await this.tryGetTab(args.tabId, sessionId);
        if (!t || !t.id) {
          return createErrorResponse(`Tab with ID ${args.tabId} not found`);
        }
        targetTab = t;
      } else {
        targetTab = await this.resolveAffinityTab({
          tabId: args.tabId,
          sessionId,
        });
      }
    } catch (error) {
      return createErrorResponse(`Failed to resolve target tab: ${error instanceof Error ? error.message : String(error)}`);
    }

    const tabId = targetTab.id;
    if (typeof tabId !== 'number') {
      return createErrorResponse('Invalid target tab ID');
    }

    const method = args.method.trim();
    const params = args.params || {};
    const timeoutMs = typeof args.timeoutMs === 'number' && args.timeoutMs > 0 ? args.timeoutMs : 10000;

    try {
      const sendPromise = cdpSessionManager.sendCommand(tabId, method, params);
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => {
          reject(new Error(`CDP command "${method}" timed out after ${timeoutMs}ms`));
        }, timeoutMs);
      });

      const result = await Promise.race([sendPromise, timeoutPromise]);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                success: true,
                tabId,
                method,
                result: result ?? {},
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
        `Error executing CDP command "${method}" on tab ${tabId}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}

export const cdpExecuteTool = new CdpExecuteTool();
