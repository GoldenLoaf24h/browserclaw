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
      opts = {
        viewportWidth: ctx.viewportWidth || ctx.screenshotWidth,
        viewportHeight: ctx.viewportHeight || ctx.screenshotHeight,
        screenshotWidth: ctx.screenshotWidth,
        screenshotHeight: ctx.screenshotHeight,
        originX: typeof options.originX === 'number' ? options.originX : (ctx.originX || 0),
        originY: typeof options.originY === 'number' ? options.originY : (ctx.originY || 0),
        ...options,
      };
    }
  }

  return baseParseUnifiedCoordinate(input, opts);
}
