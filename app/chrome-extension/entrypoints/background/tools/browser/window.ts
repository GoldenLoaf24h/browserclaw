import { createErrorResponse, ToolResult } from '@/common/tool-handler';
import { BaseBrowserToolExecutor } from '../base-browser';
import { TOOL_NAMES } from 'chrome-mcp-shared';

class WindowTool extends BaseBrowserToolExecutor {
  name = TOOL_NAMES.BROWSER.GET_WINDOWS_AND_TABS;
  async execute(): Promise<ToolResult> {
    try {
      const windows = await chrome.windows.getAll({ populate: true });
      let tabCount = 0;

      const structuredWindows = windows.map((window) => {
        const tabs =
          window.tabs?.map((tab) => {
            tabCount++;
            return {
              tabId: tab.id || 0,
              url: tab.url || '',
              title: tab.title || '',
              active: tab.active || false,
              // 'unloaded'/'loading'/'complete' distinguishes blank placeholders
              // from real pages when debugging why input silently misses a tab.
              status: tab.status || 'unknown',
              // discardable = tab dropped from memory; a strong hint that the
              // renderer is not live and CDP input will not be acked.
              discarded: tab.discarded ?? false,
            };
          }) || [];

        return {
          windowId: window.id || 0,
          // Window geometry/state make occlusion observable: a minimized or
          // fully covered window is why CDP input can be dropped silently.
          focused: window.focused ?? false,
          state: window.state || 'normal',
          bounds: {
            left: window.left ?? null,
            top: window.top ?? null,
            width: window.width ?? null,
            height: window.height ?? null,
          },
          tabs: tabs,
        };
      });

      const result = {
        windowCount: windows.length,
        tabCount: tabCount,
        windows: structuredWindows,
      };

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result),
          },
        ],
        isError: false,
      };
    } catch (error) {
      console.error('Error in WindowTool.execute:', error);
      return createErrorResponse(
        `Error getting windows and tabs information: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}

export const windowTool = new WindowTool();
