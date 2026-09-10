import { createErrorResponse, ToolResult } from '@/common/tool-handler';
import { BaseBrowserToolExecutor } from '../base-browser';
import { TOOL_NAMES } from 'chrome-mcp-shared';

export interface MoveTabParams {
  tabId?: number;
  tabIds?: number[];
  index: number;
  windowId?: number;
}

/**
 * Tool for moving browser tabs within a window or across windows.
 */
export class MoveTabTool extends BaseBrowserToolExecutor {
  name = TOOL_NAMES.BROWSER.MOVE_TAB;

  async execute(args: MoveTabParams): Promise<ToolResult> {
    if (typeof args?.index !== 'number' || args.index < -1) {
      return createErrorResponse('Index parameter must be a valid integer index (0-based, or -1 for end of window)');
    }

    try {
      let targetIds: number[] = [];
      if (Array.isArray(args.tabIds) && args.tabIds.length > 0) {
        targetIds = args.tabIds;
      } else if (typeof args.tabId === 'number' && args.tabId > 0) {
        targetIds = [args.tabId];
      } else {
        const activeTab = await this.getActiveTabOrThrowInWindow(args.windowId);
        if (activeTab.id) {
          targetIds = [activeTab.id];
        }
      }

      if (targetIds.length === 0) {
        return createErrorResponse('No target tabs specified or found to move');
      }

      const moveProperties: chrome.tabs.MoveProperties = {
        index: args.index,
      };
      if (typeof args.windowId === 'number' && args.windowId > 0) {
        moveProperties.windowId = args.windowId;
      }

      // Group target tabs by source windowId to prevent Chrome error when moving across different windows
      const tabsInfo = await Promise.all(
        targetIds.map(async (id) => {
          try {
            return await chrome.tabs.get(id);
          } catch {
            return null;
          }
        }),
      );

      const validTabs = tabsInfo.filter((t): t is chrome.tabs.Tab => t !== null && typeof t.id === 'number');
      if (validTabs.length === 0) {
        return createErrorResponse('None of the specified tabs were found');
      }

      const windowGroups = new Map<number, number[]>();
      for (const tab of validTabs) {
        const winId = tab.windowId;
        const list = windowGroups.get(winId) || [];
        list.push(tab.id!);
        windowGroups.set(winId, list);
      }

      const movedTabs: chrome.tabs.Tab[] = [];
      for (const [, ids] of windowGroups.entries()) {
        const moved =
          ids.length === 1
            ? await chrome.tabs.move(ids[0], moveProperties)
            : await chrome.tabs.move(ids, moveProperties);
        const arr = Array.isArray(moved) ? moved : [moved];
        movedTabs.push(...arr);
      }
      const resultData = movedTabs.map((t) => ({
        tabId: t.id,
        index: t.index,
        windowId: t.windowId,
        title: t.title,
        url: t.url,
      }));

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                success: true,
                message: `Successfully moved ${movedTabs.length} tab(s)`,
                tabs: resultData,
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
        `Error executing chrome_move_tab: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}

export const moveTabTool = new MoveTabTool();
