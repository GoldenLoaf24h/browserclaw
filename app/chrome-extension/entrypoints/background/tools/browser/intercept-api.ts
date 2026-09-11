import { createErrorResponse, ToolResult } from "@/common/tool-handler";
import { BaseBrowserToolExecutor } from "../base-browser";
import { TOOL_NAMES } from "chrome-mcp-shared";
import { cdpSessionManager } from "@/utils/cdp-session-manager";

export interface InterceptApiParams {
  urlPattern: string;
  triggerAction?: "inspect_recent" | "wait_next";
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
    if (!pattern || pattern === "*") return true;
    const clean = pattern.trim().toLowerCase();
    const targetUrl = url.toLowerCase();
    if (clean.includes("*")) {
      const sub = clean.replace(/\*/g, "");
      return targetUrl.includes(sub);
    }
    return targetUrl.includes(clean);
  }
}

const apiInterceptorStore = new ApiInterceptorStore();

export class InterceptApiTool extends BaseBrowserToolExecutor {
  name = TOOL_NAMES.BROWSER.INTERCEPT_API;

  async execute(args: InterceptApiParams): Promise<ToolResult> {
    if (!args || !args.urlPattern || !args.urlPattern.trim()) {
      return createErrorResponse("urlPattern is required (e.g. \"*/api/v1/data*\")");
    }

    const sessionId = args.sessionId || args.sessionContext;
    let targetTab: chrome.tabs.Tab;
    try {
      if (typeof args.tabId === "number") {
        const t = await this.tryGetTab(args.tabId, sessionId);
        if (!t || !t.id) return createErrorResponse("Tab not found");
        targetTab = t;
      } else {
        targetTab = await this.resolveAffinityTab({ tabId: args.tabId, sessionId });
      }
    } catch (e: any) {
      return createErrorResponse("Failed to resolve tab: " + e.message);
    }

    const tabId = targetTab.id;
    if (typeof tabId !== "number") return createErrorResponse("Invalid tab ID");

    const pattern = args.urlPattern.trim();
    const action = args.triggerAction || "inspect_recent";
    const timeoutMs = typeof args.timeoutMs === "number" && args.timeoutMs > 0 ? args.timeoutMs : 10000;

    if (action === "inspect_recent") {
      const cached = apiInterceptorStore.findRecent(tabId, pattern);
      if (cached) {
        return {
          content: [{ type: "text", text: JSON.stringify({ success: true, source: "recent-cache", ...cached }, null, 2) }],
          isError: false,
        };
      }
    }

    try {
      await cdpSessionManager.sendCommand(tabId, "Network.enable");
      const capturePromise = new Promise<CapturedApiResponse>((resolve) => {
        const listener = async (source: chrome.debugger.Debuggee, method: string, params?: any) => {
          if (source.tabId !== tabId) return;
          if (method === "Network.responseReceived" && params?.response) {
            const respUrl = params.response.url || "";
            if (apiInterceptorStore.matchesPattern(respUrl, pattern)) {
              chrome.debugger.onEvent.removeListener(listener);
              try {
                const bodyObj: any = await cdpSessionManager.sendCommand(tabId, "Network.getResponseBody", { requestId: params.requestId });
                let decoded = bodyObj?.body || "";
                if (bodyObj?.base64Encoded) { try { decoded = atob(decoded); } catch {} }
                let parsed: any = decoded;
                try { parsed = JSON.parse(decoded); } catch {}

                const item: CapturedApiResponse = {
                  requestId: params.requestId,
                  url: respUrl,
                  status: params.response.status,
                  mimeType: params.response.mimeType || "application/json",
                  timestamp: Date.now(),
                  data: parsed,
                };
                apiInterceptorStore.addResponse(tabId, item);
                resolve(item);
              } catch (e: any) {
                resolve({
                  requestId: params.requestId,
                  url: respUrl,
                  status: params.response.status,
                  mimeType: "unknown",
                  timestamp: Date.now(),
                  data: { error: e.message },
                });
              }
            }
          }
        };
        chrome.debugger.onEvent.addListener(listener);
      });

      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Timed out waiting for API response matching: " + pattern)), timeoutMs),
      );

      const outcome: any = await Promise.race([capturePromise, timeoutPromise]);
      return {
        content: [{ type: "text", text: JSON.stringify({ success: true, source: "live-intercept", ...outcome }, null, 2) }],
        isError: false,
      };
    } catch (e: any) {
      return createErrorResponse("API intercept failed: " + e.message);
    }
  }
}

export const interceptApiTool = new InterceptApiTool();
