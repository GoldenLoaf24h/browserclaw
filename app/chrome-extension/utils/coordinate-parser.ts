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
          if (input.length === 2) {
            const isYFirst = options?.pointFormat === 'gemini' || options?.pointFormat === 'yx';
            rawX = Number(isYFirst ? input[1] : input[0]);
            rawY = Number(isYFirst ? input[0] : input[1]);
          } else if (input.length === 4) {
            rawX = (Number(input[1]) + Number(input[3])) / 2;
            rawY = (Number(input[0]) + Number(input[2])) / 2;
          }
        } else if (typeof input === 'object' && input !== null) {
          rawX = Number((input as any).x ?? (input as any).left);
          rawY = Number((input as any).y ?? (input as any).top);
        }
        const isNormalized =
          options?.scale === '1000' ||
          options?.scale === 'fraction' ||
          options?.pointFormat === 'gemini' ||
          (typeof rawX === 'number' &&
            typeof rawY === 'number' &&
            rawX <= 1.0 &&
            rawY <= 1.0 &&
            (rawX > 0 || rawY > 0));

        if (
          !isNormalized &&
          typeof rawX === 'number' &&
          typeof rawY === 'number' &&
          Number.isFinite(rawX) &&
          Number.isFinite(rawY)
        ) {
          const cropW = ctx.cropWidth || ctx.screenshotWidth;
          const cropH = ctx.cropHeight || ctx.screenshotHeight;
          if (
            (rawX > cropW && rawX <= (ctx.viewportWidth || 1920) + 50) ||
            (rawY > cropH && rawY <= (ctx.viewportHeight || 1080) + 50)
          ) {
            treatAsViewport = true;
          }
        }
      }

      if (treatAsViewport) {
        opts = {
          viewportWidth: ctx.viewportWidth || 1280,
          viewportHeight: ctx.viewportHeight || 800,
          originX: 0,
          originY: 0,
          ...options,
        };
      } else {
        let scWidth = ctx.screenshotWidth;
        let scHeight = ctx.screenshotHeight;
        const dpr = ctx.devicePixelRatio;

        // Auto-detect high-DPI physical coordinates: if model sent coordinates matching physical pixel dimensions
        if (typeof dpr === 'number' && dpr > 1) {
          let rx: number | undefined;
          let ry: number | undefined;
          if (Array.isArray(input)) {
            const isYFirst = options?.pointFormat === 'gemini' || options?.pointFormat === 'yx';
            rx = Number(isYFirst ? input[1] : input[0]);
            ry = Number(isYFirst ? input[0] : input[1]);
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
            if (
              (rx > vw && rx <= Math.round(vw * dpr + 10)) ||
              (ry > vh && ry <= Math.round(vh * dpr + 10))
            ) {
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
          cropWidth: ctx.cropWidth,
          cropHeight: ctx.cropHeight,
          originX: typeof options?.originX === 'number' ? options.originX : ctx.originX || 0,
          originY: typeof options?.originY === 'number' ? options.originY : ctx.originY || 0,
          ...options,
        };
      }
    }
  }

  return baseParseUnifiedCoordinate(input, opts);
}
