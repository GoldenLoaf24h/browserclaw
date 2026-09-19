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
  // Region/crop dimensions in CSS viewport pixels before transport downscaling
  cropWidth?: number;
  cropHeight?: number;
  // Device pixel ratio at capture time (optional, for reference)
  devicePixelRatio?: number;
  // Hostname of the page when the screenshot was taken (used for domain safety checks)
  hostname?: string;
  // Scroll offsets at the exact moment of screenshot capture
  scrollX?: number;
  scrollY?: number;
  // Mode of capture to differentiate viewport vs fullpage vs element crops
  captureMode?: 'viewport' | 'fullpage' | 'element';
  // Full document dimensions when captureMode is fullpage
  docWidth?: number;
  docHeight?: number;
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

export interface ScaledCoordinateResult {
  x: number;
  y: number;
  isDocumentSpace?: boolean;
}

// Scale screenshot-space coordinates (x,y) to viewport or document CSS pixels
export function scaleCoordinates(
  x: number,
  y: number,
  ctx: ScreenshotContext,
): ScaledCoordinateResult {
  if (!ctx.screenshotWidth || !ctx.screenshotHeight) {
    return { x, y };
  }
  if (ctx.captureMode === 'fullpage') {
    const docW = ctx.docWidth ?? ctx.screenshotWidth;
    const docH = ctx.docHeight ?? ctx.screenshotHeight;
    const sx = (x / ctx.screenshotWidth) * docW;
    const sy = (y / ctx.screenshotHeight) * docH;
    return { x: Math.round(sx), y: Math.round(sy), isDocumentSpace: true };
  }
  const ox = ctx.originX || 0;
  const oy = ctx.originY || 0;
  const isCropped = Boolean(ctx.originX || ctx.originY || ctx.cropWidth || ctx.cropHeight);
  const targetW =
    ctx.cropWidth ??
    (isCropped ? (ctx.cropWidth ?? ctx.screenshotWidth) : ctx.viewportWidth || ctx.screenshotWidth);
  const targetH =
    ctx.cropHeight ??
    (isCropped
      ? (ctx.cropHeight ?? ctx.screenshotHeight)
      : ctx.viewportHeight || ctx.screenshotHeight);
  const sx = ox + (x / ctx.screenshotWidth) * targetW;
  const sy = oy + (y / ctx.screenshotHeight) * targetH;
  return { x: Math.round(sx), y: Math.round(sy) };
}
