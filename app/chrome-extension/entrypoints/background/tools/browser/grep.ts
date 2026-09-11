import { BaseBrowserToolExecutor } from '../base-browser';
import { TOOL_NAMES, type IndexedElement, type PrunedDOMTreeResult } from 'chrome-mcp-shared';
import { createErrorResponse, ToolResult } from '@/common/tool-handler';
import { executeInPage } from './in-page-engine';

export interface GrepParams {
  query: string;
  isRegex?: boolean;
  searchType?: 'interactive_only' | 'all_dom' | 'page_text';
  limit?: number;
  tabId?: number;
  windowId?: number;
  sessionId?: string;
  sessionContext?: string;
}

export class GrepTool extends BaseBrowserToolExecutor {
  name = TOOL_NAMES.BROWSER.GREP;

  async execute(args: GrepParams): Promise<ToolResult> {
    if (!args?.query || typeof args.query !== 'string') {
      return createErrorResponse('query parameter is required and must be a non-empty string');
    }

    try {
      const tab = await this.resolveAffinityTab({
        tabId: args.tabId,
        windowId: args.windowId,
        sessionId: args.sessionId || args.sessionContext,
      });

      if (!tab?.id) {
        return createErrorResponse('No active tab found for chrome_grep');
      }

      const tabId = tab.id;
      const limit = Math.min(Math.max(1, args.limit ?? 20), 50);
      const searchType = args.searchType || 'interactive_only';

      let pattern: RegExp;
      try {
        pattern = args.isRegex ? new RegExp(args.query, 'i') : new RegExp(args.query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      } catch (regexErr) {
        return createErrorResponse('Invalid regular expression: ' + (regexErr instanceof Error ? regexErr.message : String(regexErr)));
      }

      if (searchType === 'page_text') {
        const scriptRes = await this.safeExecuteScript(tabId, {
          target: { tabId },
          func: () => {
            return document.body?.innerText || '';
          },
        });
        const fullText = String(scriptRes?.[0]?.result || '');
        const lines = fullText.split('\n');
        const matches: Array<{ line: number; text: string }> = [];

        for (let idx = 0; idx < lines.length; idx++) {
          const line = lines[idx].trim();
          if (line && pattern.test(line)) {
            matches.push({
              line: idx + 1,
              text: line.length > 120 ? line.slice(0, 117) + '...' : line,
            });
            if (matches.length >= limit) break;
          }
        }

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  query: args.query,
                  searchType: 'page_text',
                  totalMatches: matches.length,
                  limit,
                  matches,
                },
                null,
                2,
              ),
            },
          ],
          isError: false,
        };
      }

      const prunerResults = await executeInPage<PrunedDOMTreeResult>(
        { tabId },
        'inPageDOMPruner',
        [
          {
            viewportThreshold: 1000,
            highlight: false,
          },
        ],
      );

      const mainRes = prunerResults?.[0]?.result;
      const elements: IndexedElement[] = mainRes?.indexedElements || [];
      const indexMap = mainRes?.indexMap || {};
      const matches: Array<{
        index: number;
        tagName: string;
        role?: string;
        text: string;
        isInteractive: boolean;
        selector?: string;
      }> = [];

      for (const el of elements) {
        if (searchType === 'interactive_only' && !el.isInteractive) {
          continue;
        }

        const elText = el.text || '';
        const searchableParts = [
          elText,
          el.role,
          el.tagName,
          (el as any).placeholder,
          (el as any).ariaLabel,
          (el as any).value,
        ].filter(Boolean).join(' ');

        if (pattern.test(searchableParts)) {
          matches.push({
            index: el.index,
            tagName: el.tagName,
            role: el.role,
            text: elText.length > 100 ? elText.slice(0, 97) + '...' : elText,
            isInteractive: el.isInteractive,
            selector: indexMap[el.index]?.selector,
          });
          if (matches.length >= limit) break;
        }
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                query: args.query,
                searchType,
                totalMatches: matches.length,
                limit,
                matches,
              },
              null,
              2,
            ),
          },
        ],
        isError: false,
      };
    } catch (error) {
      return createErrorResponse('Error executing chrome_grep: ' + (error instanceof Error ? error.message : String(error)));
    }
  }
}

export const grepTool = new GrepTool();
