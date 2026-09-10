import { cdpSessionManager } from '@/utils/cdp-session-manager';
import { executeInPage } from './in-page-engine';
import { screenshotContextManager, scaleCoordinates } from '@/utils/screenshot-context';
import type { UnifiedLocatorOptions, UnifiedLocatorResult } from 'chrome-mcp-shared';
import { resolveTargetLocation as baseResolveTargetLocation } from '@/utils/unified-locator';

export { baseResolveTargetLocation };

/**
 * Unified Element Locator Layer
 *
 * Implements the unified positioning abstraction (P1-4):
 * 1. Supports ref (default 1-based index or string ref), CSS/XPath selector, text/role, and coordinate (fallback).
 * 2. Strict degradation order: ref -> selector -> text/role -> coordinate.
 * 3. Reports actual resolutionPath ('ref' | 'selector' | 'text' | 'role' | 'coordinate') in response.
 * 4. In coordinate mode, validates target visibility via CDP DOM.getNodeForLocation / DOM.getBoxModel before returning.
 */
export async function resolveTargetLocation(
  tabId: number,
  options: UnifiedLocatorOptions,
): Promise<UnifiedLocatorResult> {
  return baseResolveTargetLocation(tabId, options, {
    executeInPage: (target, fnName, args) => executeInPage(target, fnName as any, args),
    coordinateScaler: (tId, x, y) => {
      const ctx = screenshotContextManager.getContext(tId);
      if (ctx) {
        return scaleCoordinates(x, y, ctx);
      }
      return { x: Math.round(x), y: Math.round(y) };
    },
    sendCdpCommand: async (tId, method, params) => {
      return cdpSessionManager.withSession(tId, 'validate-coordinate', async () => {
        return cdpSessionManager.sendCommand(tId, method, params);
      });
    },
  });
}
