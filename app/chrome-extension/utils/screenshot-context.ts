// Simple in-memory screenshot context manager per tab
// Used to scale coordinates from screenshot space to viewport space

export interface ScreenshotContext {
  // Final screenshot dimensions (in CSS pixels after any scaling)
  screenshotWidth: number;
  screenshotHeight: number;
  // Viewport dimensions (CSS pixels)
  viewportWidth: number;
  viewportHeight: number;
  // Viewport-relative origin offset for element crops (ROI)
  originX?: number;
  originY?: number;
  // Device pixel ratio at capture time (optional, for reference)
  devicePixelRatio?: number;
  // Hostname of the page when the screenshot was taken (used for domain safety checks)
  hostname?: string;
  // Timestamp
  timestamp: number;
}

const TTL_MS = 5 * 60 * 1000; // 5 minutes

const contexts = new Map<number, ScreenshotContext>();

if (typeof chrome !== 'undefined' && chrome.tabs?.onRemoved?.addListener) {
  try {
    chrome.tabs.onRemoved.addListener((closedTabId: number) => {
      contexts.delete(closedTabId);
    });
  } catch {}
}

export const screenshotContextManager = {
  setContext(tabId: number, ctx: Omit<ScreenshotContext, 'timestamp'>) {
    contexts.set(tabId, { ...ctx, timestamp: Date.now() });
  },
  getContext(tabId: number): ScreenshotContext | undefined {
    const ctx = contexts.get(tabId);
    if (!ctx) return undefined;
    if (Date.now() - ctx.timestamp > TTL_MS) {
      contexts.delete(tabId);
      return undefined;
    }
    return ctx;
  },
  // Remaining TTL in ms, or -1 when no live context exists
  getTtlRemaining(tabId: number): number {
    const ctx = contexts.get(tabId);
    if (!ctx) return -1;
    return TTL_MS - (Date.now() - ctx.timestamp);
  },
  clear(tabId: number) {
    contexts.delete(tabId);
  },
};

// Scale screenshot-space coordinates (x,y) to viewport CSS pixels
export function scaleCoordinates(
  x: number,
  y: number,
  ctx: ScreenshotContext,
): { x: number; y: number } {
  if (!ctx.screenshotWidth || !ctx.screenshotHeight || !ctx.viewportWidth || !ctx.viewportHeight) {
    return { x, y };
  }
  const ox = ctx.originX || 0;
  const oy = ctx.originY || 0;
  const sx = ox + (x / ctx.screenshotWidth) * ctx.viewportWidth;
  const sy = oy + (y / ctx.screenshotHeight) * ctx.viewportHeight;
  return { x: Math.round(sx), y: Math.round(sy) };
}
