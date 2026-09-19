import { createErrorResponse, ToolResult } from '@/common/tool-handler';
import { BaseBrowserToolExecutor } from '../base-browser';
import { TOOL_NAMES } from 'chrome-mcp-shared';
import { cdpSessionManager } from '@/utils/cdp-session-manager';

export interface InterceptApiParams {
  urlPattern: string;
  triggerAction?: 'inspect_recent' | 'wait_next';
  timeoutMs?: number;
  tabId?: number;
  sessionId?: string;
  sessionContext?: string;
}

interface CapturedApiResponse {
  requestId: string;
  url: string;
  status: number;
  mimeType: string;
  timestamp: number;
  data: any;
}

export function decodeBase64Utf8(base64Str: string): string {
  try {
    if (typeof Buffer !== 'undefined') {
      return Buffer.from(base64Str, 'base64').toString('utf-8');
    }
    const binStr = atob(base64Str);
    const bytes = new Uint8Array(binStr.length);
    for (let i = 0; i < binStr.length; i++) {
      bytes[i] = binStr.charCodeAt(i);
    }
    return new TextDecoder('utf-8').decode(bytes);
  } catch {
    try {
      return atob(base64Str);
    } catch {
      return base64Str;
    }
  }
}

class ApiInterceptorStore {
  private recentResponses = new Map<number, CapturedApiResponse[]>();

  public addResponse(tabId: number, item: CapturedApiResponse): void {
    const list = this.recentResponses.get(tabId) || [];
    list.push(item);
    if (list.length > 20) list.shift();
    this.recentResponses.set(tabId, list);
  }

  public findRecent(tabId: number, pattern: string): CapturedApiResponse | undefined {
    const list = this.recentResponses.get(tabId);
    if (!list) return undefined;
    for (let i = list.length - 1; i >= 0; i--) {
      if (this.matchesPattern(list[i].url, pattern)) return list[i];
    }
    return undefined;
  }

  public matchesPattern(url: string, pattern: string): boolean {
    if (!pattern || pattern === '*') return true;
    const clean = pattern.trim().toLowerCase();
    const targetUrl = url.toLowerCase();
    if (clean.includes('*')) {
      try {
        const escaped = clean.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
        let regexStr = escaped;
        if (clean.startsWith('*') || /^[a-z]+:\/\//i.test(clean)) {
          regexStr = '^' + regexStr;
        } else if (clean.startsWith('/')) {
          regexStr = '(?:^|[a-z]+://[^/?#]+)' + regexStr;
        }

        if (clean.endsWith('*')) {
          regexStr = regexStr + '$';
        } else {
          regexStr = regexStr + '(?=[/?#]|$)';
        }

        return new RegExp(regexStr).test(targetUrl);
      } catch {
        return false;
      }
    }
    return targetUrl.includes(clean);
  }
  public clearTab(tabId: number): void {
    this.recentResponses.delete(tabId);
  }
}

const apiInterceptorStore = new ApiInterceptorStore();

if (typeof chrome !== 'undefined' && chrome.tabs?.onRemoved?.addListener) {
  try {
    chrome.tabs.onRemoved.addListener((tabId: number) => {
      apiInterceptorStore.clearTab(tabId);
    });
  } catch {}
}

export class InterceptApiTool extends BaseBrowserToolExecutor {
  name = TOOL_NAMES.BROWSER.INTERCEPT_API;

  public matchesPattern(url: string, pattern: string): boolean {
    return apiInterceptorStore.matchesPattern(url, pattern);
  }

  async execute(args: InterceptApiParams): Promise<ToolResult> {
    if (!args || !args.urlPattern || !args.urlPattern.trim()) {
      return createErrorResponse('urlPattern is required (e.g. "*/api/v1/data*")');
    }

    const sessionId = args.sessionId || args.sessionContext;
    let targetTab: chrome.tabs.Tab;
    try {
      if (typeof args.tabId === 'number') {
        const t = await this.tryGetTab(args.tabId, sessionId);
        if (!t || !t.id) return createErrorResponse('Tab not found');
        targetTab = t;
      } else {
        targetTab = await this.resolveAffinityTab({ tabId: args.tabId, sessionId });
      }
    } catch (e: any) {
      return createErrorResponse('Failed to resolve tab: ' + e.message);
    }

    const tabId = targetTab.id;
    if (typeof tabId !== 'number') return createErrorResponse('Invalid tab ID');

    const pattern = args.urlPattern.trim();
    const action = args.triggerAction || 'inspect_recent';
    const timeoutMs =
      typeof args.timeoutMs === 'number' && args.timeoutMs > 0 ? args.timeoutMs : 10000;

    if (action === 'inspect_recent') {
      const cached = apiInterceptorStore.findRecent(tabId, pattern);
      if (cached) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ success: true, source: 'recent-cache', ...cached }, null, 2),
            },
          ],
          isError: false,
        };
      }
    }

    let listener:
      ((source: chrome.debugger.Debuggee, method: string, params?: any) => void) | null = null;
    let timeoutTimer: any = null;
    const fallbackTimers = new Map<string, any>();

    try {
      await cdpSessionManager.sendCommand(tabId, 'Network.enable');
      const capturePromise = new Promise<CapturedApiResponse>((resolve) => {
        const pendingResponses = new Map<
          string,
          { url: string; status: number; mimeType: string }
        >();
        let resolved = false;

        const processBody = async (
          requestId: string,
          meta: { url: string; status: number; mimeType: string },
          fromFallback = false,
        ) => {
          if (resolved) return;
          try {
            const bodyObj: any = await cdpSessionManager.sendCommand(
              tabId,
              'Network.getResponseBody',
              { requestId },
            );
            resolved = true;
            fallbackTimers.forEach((t) => clearTimeout(t));
            fallbackTimers.clear();
            if (listener) {
              chrome.debugger.onEvent.removeListener(listener);
              listener = null;
            }
            let decoded = bodyObj?.body || '';
            if (bodyObj?.base64Encoded) {
              try {
                decoded = decodeBase64Utf8(decoded);
              } catch {}
            }
            let parsed: any = decoded;
            try {
              parsed = JSON.parse(decoded);
            } catch {}

            const item: CapturedApiResponse = {
              requestId,
              url: meta.url,
              status: meta.status,
              mimeType: meta.mimeType,
              timestamp: Date.now(),
              data: parsed,
            };
            apiInterceptorStore.addResponse(tabId, item);
            resolve(item);
          } catch (e: any) {
            if (!fromFallback) {
              resolved = true;
              fallbackTimers.forEach((t) => clearTimeout(t));
              fallbackTimers.clear();
              resolve({
                requestId,
                url: meta.url,
                status: meta.status,
                mimeType: 'unknown',
                timestamp: Date.now(),
                data: { error: e.message },
              });
            }
          }
        };

        listener = async (source: chrome.debugger.Debuggee, method: string, params?: any) => {
          if (source.tabId !== tabId || resolved) return;

          if (method === 'Network.responseReceived' && params?.response && params?.requestId) {
            const respUrl = params.response.url || '';
            if (apiInterceptorStore.matchesPattern(respUrl, pattern)) {
              const meta = {
                url: respUrl,
                status: params.response.status,
                mimeType: params.response.mimeType || 'application/json',
              };
              pendingResponses.set(params.requestId, meta);

              const t = setTimeout(() => {
                if (!resolved && pendingResponses.has(params.requestId)) {
                  processBody(params.requestId, meta, true);
                }
              }, 80);
              fallbackTimers.set(params.requestId, t);
            }
            return;
          }

          if (method === 'Network.loadingFinished' && params?.requestId) {
            const meta = pendingResponses.get(params.requestId);
            if (!meta) return;
            const t = fallbackTimers.get(params.requestId);
            if (t) {
              clearTimeout(t);
              fallbackTimers.delete(params.requestId);
            }
            await processBody(params.requestId, meta, false);
            return;
          }

          if (method === 'Network.loadingFailed' && params?.requestId) {
            const meta = pendingResponses.get(params.requestId);
            if (!meta) return;
            const t = fallbackTimers.get(params.requestId);
            if (t) {
              clearTimeout(t);
              fallbackTimers.delete(params.requestId);
            }
            resolved = true;
            fallbackTimers.forEach((tm) => clearTimeout(tm));
            fallbackTimers.clear();
            if (listener) {
              chrome.debugger.onEvent.removeListener(listener);
              listener = null;
            }
            resolve({
              requestId: params.requestId,
              url: meta.url,
              status: meta.status,
              mimeType: meta.mimeType || 'unknown',
              timestamp: Date.now(),
              data: { error: params.errorText || 'loadingFailed' },
            });
          }
        };
        chrome.debugger.onEvent.addListener(listener);
      });

      const timeoutPromise = new Promise<never>((_, reject) => {
        timeoutTimer = setTimeout(() => {
          fallbackTimers.forEach((t) => clearTimeout(t));
          fallbackTimers.clear();
          if (
            listener &&
            typeof chrome !== 'undefined' &&
            chrome.debugger?.onEvent?.removeListener
          ) {
            try {
              chrome.debugger.onEvent.removeListener(listener);
              listener = null;
            } catch {}
          }
          reject(new Error('Timed out waiting for API response matching: ' + pattern));
        }, timeoutMs);
      });

      const outcome: any = await Promise.race([capturePromise, timeoutPromise]);
      clearTimeout(timeoutTimer);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({ success: true, source: 'live-intercept', ...outcome }, null, 2),
          },
        ],
        isError: false,
      };
    } catch (e: any) {
      clearTimeout(timeoutTimer);
      return createErrorResponse('API intercept failed: ' + e.message);
    } finally {
      fallbackTimers.forEach((t) => clearTimeout(t));
      fallbackTimers.clear();
      if (listener && typeof chrome !== 'undefined' && chrome.debugger?.onEvent?.removeListener) {
        try {
          chrome.debugger.onEvent.removeListener(listener);
          listener = null;
        } catch {}
      }
    }
  }
}

export const interceptApiTool = new InterceptApiTool();
