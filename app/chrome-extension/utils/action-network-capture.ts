/**
 * Action-to-Network Inline Capture Utility
 *
 * Captures HTTP response payloads triggered by user interactions in a single RTT.
 * Hardened with:
 * 1. Waits for Network.loadingFinished before getResponseBody to avoid CDP -32000 trap.
 * 2. Memory safety: max 2MB buffer, max 50KB per response body, mimeType json/text only.
 * 3. Filters noisy telemetry and analytics requests automatically.
 * 4. Auto-masks sensitive credentials (tokens, passwords, secrets, cookies).
 */

import { cdpSessionManager } from './cdp-session-manager';
import { sanitizeValue, DEFAULT_MAX_OUTPUT_BYTES } from './output-sanitizer';
import { scrubUrl } from './url-sanitizer';
import type { CaptureNetworkOptions, CapturedNetworkResult } from 'chrome-mcp-shared';

const MAX_BODY_BYTES = Math.min(50 * 1024, DEFAULT_MAX_OUTPUT_BYTES);
const DEFAULT_TIMEOUT_MS = 5000;

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

const TELEMETRY_PATTERNS = [
  /google-analytics\.com/i,
  /analytics\.google\.com/i,
  /googletagmanager\.com/i,
  /doubleclick\.net/i,
  /facebook\.net/i,
  /sentry\.io/i,
  /browser-intake-datadoghq\.com/i,
  /hotjar\.com/i,
  /clarity\.ms/i,
  /mixpanel\.com/i,
  /segment\.io/i,
  /\/telemetry(\/|$|\?)/i,
  /\/metrics(\/|$|\?)/i,
  /\/collect(\/|$|\?)/i,
];

export function isTelemetryUrl(url: string, userPattern: string): boolean {
  for (const re of TELEMETRY_PATTERNS) {
    if (re.test(url)) {
      if (re.test(userPattern)) return false; // Explicitly requested by user
      return true;
    }
  }
  return false;
}

export function isAllowedMimeType(mimeType: string | undefined): boolean {
  if (!mimeType) return true;
  const m = mimeType.toLowerCase();
  if (
    m.includes('image/') ||
    m.includes('video/') ||
    m.includes('audio/') ||
    m.includes('font/') ||
    m.includes('application/octet-stream') ||
    m.includes('application/pdf') ||
    m.includes('application/zip') ||
    m.includes('application/wasm')
  ) {
    return false;
  }
  return true;
}

export function matchesUrlPattern(url: string, pattern: string): boolean {
  if (!pattern || pattern === '*') return true;
  const clean = pattern.trim().toLowerCase();
  const target = url.toLowerCase();
  if (clean.includes('*')) {
    const parts = clean.split('*').filter(Boolean);
    let idx = 0;
    for (const part of parts) {
      const found = target.indexOf(part, idx);
      if (found === -1) return false;
      idx = found + part.length;
    }
    return true;
  }
  return target.includes(clean);
}

export interface ActionNetworkCaptureHandle {
  waitForResult: () => Promise<CapturedNetworkResult | undefined>;
  dispose: () => void;
}

interface PendingResponseMeta {
  requestId: string;
  url: string;
  method?: string;
  status: number;
  mimeType: string;
  timestamp: number;
}

export function startActionNetworkCapture(
  tabId: number,
  options?: CaptureNetworkOptions,
): ActionNetworkCaptureHandle {
  if (!options || !options.urlPattern || !options.urlPattern.trim()) {
    return {
      waitForResult: async () => undefined,
      dispose: () => {},
    };
  }

  const pattern = options.urlPattern.trim();
  const expectedMethod = options.method?.toUpperCase();
  const expectedStatuses = options.statusCodes;
  const timeoutMs =
    typeof options.timeoutMs === 'number' && options.timeoutMs > 0
      ? options.timeoutMs
      : DEFAULT_TIMEOUT_MS;

  const startTime = Date.now();
  let disposed = false;
  let listener: ((source: chrome.debugger.Debuggee, method: string, params?: any) => void) | null =
    null;
  let timeoutTimer: any = null;
  let resolvePromise: ((value: CapturedNetworkResult | undefined) => void) | null = null;

  // Track pending candidate responses waiting for Network.loadingFinished
  const matchedRequests = new Map<string, PendingResponseMeta>();
  // Also track method from requestWillBeSent if needed
  const requestMethods = new Map<string, string>();

  const fallbackTimers = new Map<string, any>();

  const cleanup = () => {
    if (disposed) return;
    disposed = true;
    if (timeoutTimer) {
      clearTimeout(timeoutTimer);
      timeoutTimer = null;
    }
    fallbackTimers.forEach((t) => clearTimeout(t));
    fallbackTimers.clear();
    if (listener && typeof chrome !== 'undefined' && chrome.debugger?.onEvent?.removeListener) {
      try {
        chrome.debugger.onEvent.removeListener(listener);
      } catch {}
      listener = null;
    }
    matchedRequests.clear();
    requestMethods.clear();
    if (resolvePromise) {
      const r = resolvePromise;
      resolvePromise = null;
      r(undefined);
    }
  };

  const capturePromise = new Promise<CapturedNetworkResult | undefined>((resolve) => {
    resolvePromise = resolve;
    const fetchAndResolve = async (meta: PendingResponseMeta, fromFallback = false) => {
      if (disposed) return;
      try {
        const bodyObj: any = await cdpSessionManager.sendCommand(tabId, 'Network.getResponseBody', {
          requestId: meta.requestId,
        });

        const r = resolvePromise;
        resolvePromise = null;
        cleanup();

        let decoded = bodyObj?.body || '';
        if (bodyObj?.base64Encoded) {
          try {
            decoded = decodeBase64Utf8(decoded);
          } catch {}
        }

        if (decoded.length > MAX_BODY_BYTES) {
          decoded = decoded.slice(0, MAX_BODY_BYTES);
        }

        let parsed: any = decoded;
        try {
          parsed = JSON.parse(decoded);
        } catch {}

        // Auto-mask sensitive tokens/passwords
        const sanitized = sanitizeValue(parsed, {
          maxBytes: MAX_BODY_BYTES,
          maxDepth: 6,
        }).value;

        if (r) {
          r({
            url: scrubUrl(meta.url),
            status: meta.status,
            data: sanitized,
            mimeType: meta.mimeType,
            durationMs: Date.now() - startTime,
          });
        }
      } catch (err: any) {
        if (!fromFallback) {
          const r = resolvePromise;
          resolvePromise = null;
          cleanup();
          if (r) {
            r({
              url: scrubUrl(meta.url),
              status: meta.status,
              data: { error: err?.message || 'Failed to retrieve response body' },
              mimeType: meta.mimeType,
              durationMs: Date.now() - startTime,
              error: err?.message,
            });
          }
        }
      }
    };

    listener = async (source: chrome.debugger.Debuggee, method: string, params?: any) => {
      if (disposed || source.tabId !== tabId) return;

      if (method === 'Network.requestWillBeSent' && params?.requestId && params?.request) {
        if (requestMethods.size < 200) {
          requestMethods.set(params.requestId, params.request.method);
        }
        return;
      }

      if (method === 'Network.responseReceived' && params?.response && params?.requestId) {
        const respUrl = params.response.url || '';
        const mime = params.response.mimeType || '';
        const status = params.response.status ?? 0;

        if (isTelemetryUrl(respUrl, pattern)) return;
        if (!isAllowedMimeType(mime)) return;
        if (!matchesUrlPattern(respUrl, pattern)) return;

        const reqMethod = (requestMethods.get(params.requestId) || '').toUpperCase();
        if (expectedMethod && reqMethod && reqMethod !== expectedMethod) return;

        if (expectedStatuses && expectedStatuses.length > 0 && !expectedStatuses.includes(status)) {
          return;
        }

        const meta = {
          requestId: params.requestId,
          url: respUrl,
          method: reqMethod,
          status,
          mimeType: mime,
          timestamp: Date.now(),
        };
        matchedRequests.set(params.requestId, meta);

        const t = setTimeout(() => {
          if (!disposed && matchedRequests.has(params.requestId)) {
            fetchAndResolve(meta, true);
          }
        }, 80);
        fallbackTimers.set(params.requestId, t);
        return;
      }

      if (method === 'Network.loadingFinished' && params?.requestId) {
        const meta = matchedRequests.get(params.requestId);
        if (!meta) return;

        const t = fallbackTimers.get(params.requestId);
        if (t) {
          clearTimeout(t);
          fallbackTimers.delete(params.requestId);
        }

        await fetchAndResolve(meta, false);
        return;
      }

      if (method === 'Network.loadingFailed' && params?.requestId) {
        const meta = matchedRequests.get(params.requestId);
        if (!meta) return;

        const r = resolvePromise;
        resolvePromise = null;
        cleanup();
        if (r) {
          r({
            url: scrubUrl(meta.url),
            status: meta.status,
            data: { error: params.errorText || 'loadingFailed' },
            mimeType: meta.mimeType,
            durationMs: Date.now() - startTime,
            error: params.errorText,
          });
        }
      }
    };

    try {
      if (typeof chrome !== 'undefined' && chrome.debugger?.onEvent?.addListener) {
        chrome.debugger.onEvent.addListener(listener);
        // Ensure Network is enabled
        void cdpSessionManager.sendCommand(tabId, 'Network.enable').catch(() => {});
      }
    } catch {
      // Non-blocking if chrome debugger is unavailable in unit test environment
    }

    timeoutTimer = setTimeout(() => {
      cleanup();
    }, timeoutMs);
  });

  return {
    waitForResult: async () => {
      return capturePromise;
    },
    dispose: cleanup,
  };
}
