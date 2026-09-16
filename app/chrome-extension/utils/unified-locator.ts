import type { UnifiedLocatorOptions, UnifiedLocatorResult } from 'chrome-mcp-shared';
import { snapshotCacheManager } from './snapshot-cache-manager.ts';
import { parseUnifiedCoordinate } from './coordinate-parser.ts';

export type InPageLocatorExecutor = (
  target: { tabId: number; allFrames?: boolean },
  fnName: string,
  args: any[],
) => Promise<any[]>;

export type CdpCommandSender = (tabId: number, method: string, params: any) => Promise<any>;

export interface UnifiedLocatorDependencies {
  executeInPage?: InPageLocatorExecutor;
  sendCdpCommand?: CdpCommandSender;
  coordinateScaler?: (tabId: number, x: number, y: number) => { x: number; y: number };
}

/**
 * Core Unified Target Locator
 *
 * Implements P1-4 Unified Locator & Visual Coordinate Abstraction:
 * 1. Supports ref (default 1-based index or string ref), CSS/XPath selector, text/role, and coordinate (fallback).
 * 2. Strict degradation order: ref -> selector -> text/role -> coordinate.
 * 3. Reports actual resolutionPath ('ref' | 'selector' | 'text' | 'role' | 'coordinate') in response.
 * 4. In coordinate mode, validates coordinate integrity and coordinates scaling.
 */
export async function resolveTargetLocation(
  tabId: number,
  options: UnifiedLocatorOptions,
  customDeps?: UnifiedLocatorDependencies,
): Promise<UnifiedLocatorResult> {
  const deps = customDeps || {};
  const coordParam = options.coordinate || options.coordinates;
  const targetText = options.targetText || options.text;
  const hasRef = options.ref !== undefined || options.index !== undefined;
  const hasSelector = Boolean(options.selector && typeof options.selector === 'string');
  const hasTextOrRole = Boolean(targetText || options.role);
  const parsedCoord = coordParam ? parseUnifiedCoordinate(coordParam, { tabId }) : null;
  const hasCoordinate = Boolean(
    parsedCoord ||
    (coordParam &&
      typeof (coordParam as any).x === 'number' &&
      typeof (coordParam as any).y === 'number' &&
      !isNaN((coordParam as any).x) &&
      !isNaN((coordParam as any).y)),
  );

  if (!hasRef && !hasSelector && !hasTextOrRole && !hasCoordinate) {
    return {
      success: false,
      x: 0,
      y: 0,
      resolutionPath: 'ref',
      error: 'No target locator provided. Please specify ref, selector, text/role, or coordinate.',
    };
  }

  const isSnapshotValid = hasRef ? snapshotCacheManager.isSnapshotValid(tabId) : true;
  const invalidationWarning =
    !isSnapshotValid && hasRef ? snapshotCacheManager.getInvalidationMessage(tabId) : undefined;

  // 1. Primary: Try ref / index
  if (hasRef && deps.executeInPage) {
    const rawRef = options.ref ?? options.index;
    try {
      const res = await deps.executeInPage({ tabId }, 'inPageGetElementCoordinates', [rawRef]);
      let match = res?.[0]?.result;
      let targetFrameId = 0;

      if (!match || !match.success) {
        const frameResults = await deps.executeInPage(
          { tabId, allFrames: true },
          'inPageGetElementCoordinates',
          [rawRef],
        );
        const subMatch = frameResults.find((r) => r.result?.success);
        if (subMatch?.result) {
          match = subMatch.result;
          targetFrameId = subMatch.frameId ?? 0;
        }
      }

      if (match?.success && typeof match.x === 'number' && typeof match.y === 'number') {
        return {
          success: true,
          x: match.x,
          y: match.y,
          resolutionPath: 'ref',
          tagName: match.tagName,
          inputType: match.inputType,
          text: match.text,
          value: match.value,
          frameId: targetFrameId,
          warning: invalidationWarning,
        };
      }
    } catch (e) {
      console.warn(`[UnifiedLocator] Ref lookup for "${rawRef}" failed, trying fallback:`, e);
    }
  }

  // 2. Secondary: Try CSS / XPath selector
  if (hasSelector && deps.executeInPage) {
    try {
      const res = await deps.executeInPage({ tabId }, 'inPageLocateBySelector', [
        options.selector!,
        options.selectorType,
      ]);
      let match = res?.[0]?.result;
      let targetFrameId = 0;

      if (!match || !match.success) {
        const frameResults = await deps.executeInPage(
          { tabId, allFrames: true },
          'inPageLocateBySelector',
          [options.selector!, options.selectorType],
        );
        const subMatch = frameResults.find((r) => r.result?.success);
        if (subMatch?.result) {
          match = subMatch.result;
          targetFrameId = subMatch.frameId ?? 0;
        }
      }

      if (match?.success && typeof match.x === 'number' && typeof match.y === 'number') {
        return {
          success: true,
          x: match.x,
          y: match.y,
          resolutionPath: 'selector',
          tagName: match.tagName,
          inputType: match.inputType,
          text: match.text,
          value: match.value,
          frameId: targetFrameId,
        };
      }
    } catch (e) {
      console.warn(`[UnifiedLocator] Selector lookup for "${options.selector}" failed:`, e);
    }
  }

  // 3. Tertiary: Try visible text and/or ARIA role
  if (hasTextOrRole && deps.executeInPage) {
    try {
      const res = await deps.executeInPage({ tabId }, 'inPageLocateByText', [
        targetText || '',
        options.role,
      ]);
      let match = res?.[0]?.result;
      let targetFrameId = 0;

      if (!match || !match.success) {
        const frameResults = await deps.executeInPage(
          { tabId, allFrames: true },
          'inPageLocateByText',
          [targetText || '', options.role],
        );
        const subMatch = frameResults.find((r) => r.result?.success);
        if (subMatch?.result) {
          match = subMatch.result;
          targetFrameId = subMatch.frameId ?? 0;
        }
      }

      if (match?.success && typeof match.x === 'number' && typeof match.y === 'number') {
        return {
          success: true,
          x: match.x,
          y: match.y,
          resolutionPath: targetText ? 'text' : 'role',
          tagName: match.tagName,
          inputType: match.inputType,
          text: match.text,
          value: match.value,
          frameId: targetFrameId,
        };
      }
    } catch (e) {
      console.warn('[UnifiedLocator] Text/role lookup failed:', e);
    }
  }

  // 4. Fallback: Visual Coordinate Mode
  if (hasCoordinate) {
    const rawX = parsedCoord ? parsedCoord.x : Number((coordParam as any)?.x ?? 0);
    const rawY = parsedCoord ? parsedCoord.y : Number((coordParam as any)?.y ?? 0);

    let targetX = Math.round(rawX);
    let targetY = Math.round(rawY);

    const wantsScreenshotSpace = (options as any)?.coordinateSpace === 'screenshot';
    if (
      deps.coordinateScaler &&
      wantsScreenshotSpace &&
      !parsedCoord &&
      typeof (coordParam as any)?.x === 'number' &&
      typeof (coordParam as any)?.y === 'number'
    ) {
      const scaled = deps.coordinateScaler(tabId, (coordParam as any).x, (coordParam as any).y);
      targetX = scaled.x;
      targetY = scaled.y;
    }

    let coordinateWarning: string | undefined = undefined;

    if (deps.sendCdpCommand) {
      try {
        const locRes: any = await deps.sendCdpCommand(tabId, 'DOM.getNodeForLocation', {
          x: targetX,
          y: targetY,
          includeUserAgentShadowDOM: true,
          ignorePointerEventsNone: false,
        });

        if (locRes && locRes.backendNodeId) {
          const boxRes: any = await deps
            .sendCdpCommand(tabId, 'DOM.getBoxModel', {
              backendNodeId: locRes.backendNodeId,
            })
            .catch(() => null);

          if (boxRes && boxRes.model) {
            const width = boxRes.model.width || 0;
            const height = boxRes.model.height || 0;
            if (width <= 0 && height <= 0) {
              coordinateWarning = `Target element at (${targetX}, ${targetY}) has zero dimensions or may be invisible according to CDP box model.`;
              console.warn(
                `[UnifiedLocator] Target at (${targetX}, ${targetY}) has 0 dimensions in box model`,
              );
            }
          }
        }
      } catch (cdpCheckErr) {
        console.warn(
          '[UnifiedLocator] CDP coordinate visibility check non-fatal notice:',
          cdpCheckErr,
        );
      }
    }

    return {
      success: true,
      x: targetX,
      y: targetY,
      resolutionPath: 'coordinate',
      tagName: 'visual_target',
      frameId: 0,
      warning: coordinateWarning,
    };
  }

  const invalidationPrefix = invalidationWarning ? `[Snapshot Stale: ${invalidationWarning}] ` : '';
  return {
    success: false,
    x: 0,
    y: 0,
    resolutionPath: hasRef ? 'ref' : hasSelector ? 'selector' : 'text',
    error: `${invalidationPrefix}Target not found using degradation chain (ref -> selector -> text -> coordinate). Specify a valid ref, selector, text, or coordinates.`,
  };
}
