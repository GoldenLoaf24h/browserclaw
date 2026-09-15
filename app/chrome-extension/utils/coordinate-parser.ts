import {
  parseUnifiedCoordinate as baseParseUnifiedCoordinate,
  type UnifiedCoordinateOptions,
  type PolymorphicCoordinate,
  type ParsedCoordinate,
} from 'chrome-mcp-shared';
import { screenshotContextManager } from './screenshot-context.ts';

export type { UnifiedCoordinateOptions, PolymorphicCoordinate, ParsedCoordinate };

/**
 * Context-aware wrapper for parseUnifiedCoordinate.
 * Automatically injects tab viewport dimensions and ROI origin offsets (originX, originY)
 * from screenshotContextManager when tabId is provided.
 */
export function parseUnifiedCoordinate(
  input: PolymorphicCoordinate,
  options?: UnifiedCoordinateOptions & { tabId?: number },
): ParsedCoordinate | null {
  let opts: UnifiedCoordinateOptions = { ...options };

  if (options?.tabId) {
    const ctx = screenshotContextManager.getContext(options.tabId);
    if (ctx) {
      const isCropped = Boolean(ctx.originX || ctx.originY);
      let treatAsViewport = false;
      if (isCropped) {
        let rawX: number | undefined;
        let rawY: number | undefined;
        if (Array.isArray(input)) {
          rawX = Number(input[0]);
          rawY = Number(input[1]);
        } else if (typeof input === 'object' && input !== null) {
          rawX = Number((input as any).x);
          rawY = Number((input as any).y);
        }
        if (
          typeof rawX === 'number' &&
          typeof rawY === 'number' &&
          Number.isFinite(rawX) &&
          Number.isFinite(rawY)
        ) {
          if (rawX > ctx.screenshotWidth || rawY > ctx.screenshotHeight) {
            treatAsViewport = true;
          }
        }
      }

      if (!treatAsViewport) {
        let scWidth = ctx.screenshotWidth;
        let scHeight = ctx.screenshotHeight;
        const dpr = ctx.devicePixelRatio;

        // Auto-detect high-DPI physical coordinates: if model sent coordinates matching physical pixel dimensions
        if (typeof dpr === 'number' && dpr > 1) {
          let rx: number | undefined;
          let ry: number | undefined;
          if (Array.isArray(input)) {
            rx = Number(input[0]);
            ry = Number(input[1]);
          } else if (typeof input === 'object' && input !== null) {
            rx = Number((input as any).x ?? (input as any).left);
            ry = Number((input as any).y ?? (input as any).top);
          }
          if (
            typeof rx === 'number' &&
            typeof ry === 'number' &&
            Number.isFinite(rx) &&
            Number.isFinite(ry)
          ) {
            const vw = ctx.viewportWidth || scWidth;
            const vh = ctx.viewportHeight || scHeight;
            if (rx > vw && rx <= Math.round(vw * dpr + 10)) {
              scWidth = Math.round(vw * dpr);
              scHeight = Math.round(vh * dpr);
            }
          }
        }

        opts = {
          viewportWidth: ctx.viewportWidth || ctx.screenshotWidth,
          viewportHeight: ctx.viewportHeight || ctx.screenshotHeight,
          screenshotWidth: scWidth,
          screenshotHeight: scHeight,
          originX: typeof options.originX === 'number' ? options.originX : ctx.originX || 0,
          originY: typeof options.originY === 'number' ? options.originY : ctx.originY || 0,
          ...options,
        };
      }
    }
  }

  return baseParseUnifiedCoordinate(input, opts);
}
