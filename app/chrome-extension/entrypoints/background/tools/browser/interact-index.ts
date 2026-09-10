import { createErrorResponse, ToolResult } from '../../../../common/tool-handler';
import { BaseBrowserToolExecutor } from '../base-browser';
import { TOOL_NAMES } from 'chrome-mcp-shared';
import { cdpSessionManager } from '../../../../utils/cdp-session-manager';
import { raceCdp, DialogOpenedError, createDialogInterruptResponse } from '../../../../utils/race-cdp';
import { executeInPage } from './in-page-engine';
import { waitForPageSettle } from '../../../../utils/action-watchdog';
import { screenshotContextManager, scaleCoordinates } from '../../../../utils/screenshot-context';
import { computeHumanizedPoints } from '../../../../utils/mouse-trajectory';
import type { CdpEventObserver } from '../../../../utils/cdp-session-manager';
import { parseUnifiedCoordinate, type PolymorphicCoordinate } from '../../../../utils/coordinate-parser';

export interface InteractIndexParams {
  index?: number;
  coordinate?: { x: number; y: number } | PolymorphicCoordinate;
  coordinateSpace?: 'viewport' | 'screenshot';
  points?: Array<{ x: number; y: number } | PolymorphicCoordinate>;
  intervalMs?: number;
  action?: 'click' | 'hover' | 'double_click' | 'right_click' | 'drag';
  end?: { index?: number; coordinate?: { x: number; y: number } | PolymorphicCoordinate };
  steps?: number;
  holdMs?: number;
  dnd?: boolean;
  modifiers?: string[];
  tabId?: number;
  windowId?: number;
  waitForSettle?: boolean;
  settleTimeoutMs?: number;
  humanize?: boolean;
  sessionId?: string;
  sessionContext?: string;
}

/**
 * Track last known cursor position per tab for smooth humanized trajectories
 */
const lastMousePosMap = new Map<number, { x: number; y: number }>();

// Register tab removal listener to prevent memory leak
if (typeof chrome !== 'undefined' && chrome?.tabs?.onRemoved?.addListener) {
  try {
    chrome.tabs.onRemoved.addListener((closedTabId: number) => {
      lastMousePosMap.delete(closedTabId);
    });
  } catch {}
}

export { computeHumanizedPoints };

/**
 * Resolve drag end point from end.index / end.coordinate. Returns viewport coordinates.
 */
async function resolveDragEndPoint(
  tabId: number,
  end: InteractIndexParams['end'],
  coordinateSpace?: 'viewport' | 'screenshot',
): Promise<{ x: number; y: number } | null> {
  if (!end) return null;
  if (typeof end.index === 'number' && end.index > 0) {
    let coordResult: any = (await executeInPage({ tabId }, 'inPageGetElementCoordinates', [end.index]))?.[0]?.result;
    if (!coordResult?.success) {
      const frameResults = await executeInPage({ tabId, allFrames: true }, 'inPageGetElementCoordinates', [end.index]);
      const match = frameResults.find((r) => r.result?.success);
      if (match?.result) coordResult = match.result;
    }
    if (coordResult?.success && typeof coordResult.x === 'number' && typeof coordResult.y === 'number') {
      return { x: coordResult.x, y: coordResult.y };
    }
    return null;
  }
  if (end.coordinate) {
    const parsed = parseUnifiedCoordinate(end.coordinate, { tabId });
    if (parsed) return parsed;
    if (
      typeof (end.coordinate as any).x === 'number' &&
      typeof (end.coordinate as any).y === 'number' &&
      !isNaN((end.coordinate as any).x) &&
      !isNaN((end.coordinate as any).y)
    ) {
      if (coordinateSpace === 'screenshot') {
        const ctx = screenshotContextManager.getContext(tabId);
        if (ctx) {
          const scaled = scaleCoordinates((end.coordinate as any).x, (end.coordinate as any).y, ctx);
          return { x: scaled.x, y: scaled.y };
        }
      }
      return { x: Math.round((end.coordinate as any).x), y: Math.round((end.coordinate as any).y) };
    }
  }
  return null;
}

/**
 * Dispatch mouse movement to target coordinates.
 * When humanize is true, interpolates 3-5 steps along a cubic ease-out curve with micro-jitter.
 */
async function dispatchMouseMovement(
  tabId: number,
  targetX: number,
  targetY: number,
  modifierMask: number,
  humanize = false,
): Promise<void> {
  if (!humanize) {
    await cdpSessionManager.sendCommand(tabId, 'Input.dispatchMouseEvent', {
      type: 'mouseMoved',
      x: targetX,
      y: targetY,
      modifiers: modifierMask,
    });
    lastMousePosMap.set(tabId, { x: targetX, y: targetY });
    return;
  }

  const startPos = lastMousePosMap.get(tabId) || {
    x: Math.max(0, targetX - (50 + Math.floor(Math.random() * 80))),
    y: Math.max(0, targetY - (30 + Math.floor(Math.random() * 60))),
  };

  const steps = 3 + Math.floor(Math.random() * 3); // 3-5 steps
  const points = computeHumanizedPoints(startPos.x, startPos.y, targetX, targetY, steps);
  for (let i = 0; i < points.length; i++) {
    const pt = points[i];
    const isFinal = i === points.length - 1;

    await cdpSessionManager.sendCommand(tabId, 'Input.dispatchMouseEvent', {
      type: 'mouseMoved',
      x: pt.x,
      y: pt.y,
      modifiers: modifierMask,
    });

    if (!isFinal) {
      await new Promise((r) => setTimeout(r, 12 + Math.floor(Math.random() * 15)));
    }
  }

  lastMousePosMap.set(tabId, { x: targetX, y: targetY });
}

/**
 * Convert modifiers array to Chrome DevTools Protocol Input.dispatchMouseEvent modifiers bitmask:
 * Alt = 1, Control/Ctrl = 2, Meta/Command = 4, Shift = 8
 */
function computeModifierMask(modifiers?: string[]): number {
  if (!modifiers || !Array.isArray(modifiers)) return 0;
  let mask = 0;
  for (const mod of modifiers) {
    const m = String(mod).toLowerCase().trim();
    if (m === 'alt') mask |= 1;
    else if (m === 'ctrl' || m === 'control') mask |= 2;
    else if (m === 'meta' || m === 'cmd' || m === 'command') mask |= 4;
    else if (m === 'shift') mask |= 8;
  }
  return mask;
}

export class InteractIndexTool extends BaseBrowserToolExecutor {
  name = TOOL_NAMES.BROWSER.INTERACT_INDEX;

  async execute(args: InteractIndexParams): Promise<ToolResult> {
    const hasIndex = typeof args?.index === 'number' && args.index > 0;
    const hasPoints = Array.isArray(args?.points) && args.points.length > 0;
    const hasCoord = Boolean(
      (args?.coordinate &&
        typeof (args.coordinate as any).x === 'number' &&
        typeof (args.coordinate as any).y === 'number' &&
        !isNaN((args.coordinate as any).x) &&
        !isNaN((args.coordinate as any).y)) ||
      (args?.coordinate && parseUnifiedCoordinate(args.coordinate))
    );

    if (!hasIndex && !hasCoord && !hasPoints) {
      return createErrorResponse(
        'Either index (positive 1-based integer) or coordinate ({ x: number, y: number }) must be provided for chrome_interact_index',
      );
    }

    const action = args.action ?? 'click';
    const validActions = ['click', 'hover', 'double_click', 'right_click', 'drag'];
    if (!validActions.includes(action)) {
      return createErrorResponse(
        `Unsupported action "${action}". Allowed actions: ${validActions.join(', ')}`,
      );
    }

    try {
      const tab = await this.resolveAffinityTab({
        tabId: args.tabId,
        windowId: args.windowId,
        sessionId: args.sessionId || args.sessionContext,
      });
      const tabId = tab.id;
      if (!tabId) {
        return createErrorResponse('No active tab found for chrome_interact_index');
      }

      // Helper to project screenshot-space or polymorphic coordinates to viewport space
      const isScreenshotSpace = args.coordinateSpace === 'screenshot';
      const projectCoord = (c: any): { x: number; y: number } => {
        const parsed = parseUnifiedCoordinate(c, { tabId });
        if (parsed) return parsed;
        if (!isScreenshotSpace) return { x: Math.round(c.x), y: Math.round(c.y) };
        const ctx = screenshotContextManager.getContext(tabId);
        if (!ctx) return { x: Math.round(c.x), y: Math.round(c.y) };
        const scaled = scaleCoordinates(c.x, c.y, ctx);
        return { x: scaled.x, y: scaled.y };
      };

      // Click sequence: CDP-dispatch a rapid burst of full clicks at the given
      // viewport points. One MCP round-trip, page-side interval down to ~35ms —
      // the only way to hit fast-moving canvas targets (rAF-animated hitboxes).
      if (hasPoints) {
        const interval = Math.min(500, Math.max(5, args.intervalMs ?? 35));
        const scaledPoints = (args.points || []).map(projectCoord);
        let dispatched = 0;
        try {
          await cdpSessionManager.withSession(tabId, 'interact-index', async () => {
            for (const pt of scaledPoints) {
              await raceCdp(tabId, 'Input.dispatchMouseEvent', {
                type: 'mousePressed',
                x: pt.x,
                y: pt.y,
                button: 'left',
                buttons: 1,
                clickCount: 1,
              });
              await raceCdp(tabId, 'Input.dispatchMouseEvent', {
                type: 'mouseReleased',
                x: pt.x,
                y: pt.y,
                button: 'left',
                buttons: 0,
                clickCount: 1,
              });
              dispatched++;
              if (dispatched < scaledPoints.length) {
                await new Promise((r) => setTimeout(r, interval));
              }
            }
          });
          lastMousePosMap.set(tabId, { x: scaledPoints.at(-1)!.x, y: scaledPoints.at(-1)!.y });
        } catch (burstErr) {
          if (burstErr instanceof DialogOpenedError) {
            return createDialogInterruptResponse(burstErr);
          }
          return createErrorResponse(
            `click_sequence failed after ${dispatched} points: ${burstErr instanceof Error ? burstErr.message : String(burstErr)}`,
          );
        }
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                { success: true, action: 'click_sequence', pointsDispatched: dispatched, coordinates: scaledPoints },
                null,
                2,
              ),
            },
          ],
          isError: false,
        };
      }

      // 1. Locate element coordinates inside the tab (DOM index vs pure visual coordinate)
      let x: number;
      let y: number;
      let tagName: string | undefined;
      let text: string | undefined;
      let targetFrameId: number | undefined;
      let coordResult: any = undefined;
      let isFallback = false;

      if (hasCoord && !hasIndex) {
        const projected = projectCoord(args.coordinate!);
        x = projected.x;
        y = projected.y;
        tagName = 'visual_target';
        text = undefined;
        targetFrameId = 0;
      } else {
        coordResult = (
          await executeInPage({ tabId }, 'inPageGetElementCoordinates', [args.index!])
        )?.[0]?.result;

        // Check subframes if not in main frame
        if (!coordResult || !coordResult.success) {
          const frameResults = await executeInPage({ tabId, allFrames: true }, 'inPageGetElementCoordinates', [args.index!]);
          const match = frameResults.find((r) => r.result?.success);
          if (match?.result) {
            coordResult = match.result;
            targetFrameId = match.frameId;
          }
        }

        if (!coordResult || !coordResult.success) {
          if (hasCoord) {
            // Hybrid Visual Fallback: DOM extraction failed, fallback to coordinate
            const projected = projectCoord(args.coordinate!);
            x = projected.x;
            y = projected.y;
            tagName = 'visual_fallback';
            targetFrameId = 0;
            isFallback = true;
          } else {
            return createErrorResponse(
              coordResult?.error || `Element with index [${args.index}] not found in active DOM index map`,
            );
          }
        } else {
          x = coordResult.x!;
          y = coordResult.y!;
          tagName = coordResult.tagName;
          text = coordResult.text;
        }
      }

      if (typeof x !== 'number' || typeof y !== 'number') {
        return createErrorResponse(
          `Failed to resolve valid pixel coordinates for interaction`,
        );
      }
      const modifierMask = computeModifierMask(args.modifiers);
      let usedNativeCDP = false;
      // 2. Perform event dispatch
      // If element is in a cross-origin subframe (where frameOffsetX/Y couldn't be calculated),
      // dispatch synthetic DOM event directly inside the isolated subframe.
      let isCrossOriginSubframe = false;
      if (
        targetFrameId !== undefined &&
        targetFrameId !== 0 &&
        !isFallback &&
        !coordResult?.frameOffsetX &&
        !coordResult?.frameOffsetY
      ) {
        // Cumulative frame offset is unavailable both for cross-origin iframes AND for
        // same-origin iframes positioned at (0,0) (e.g. srcdoc). Compare origins to decide:
        // same-origin iframes must go through native CDP dispatch (isTrusted=true).
        try {
          const mainOrigin = (await executeInPage({ tabId }, 'inPageGetFrameOrigin', []))?.[0]?.result;
          const frameOrigin = (await executeInPage({ tabId, frameIds: [targetFrameId] }, 'inPageGetFrameOrigin', []))?.[0]?.result;
          isCrossOriginSubframe = !mainOrigin || !frameOrigin || mainOrigin !== frameOrigin;
        } catch {
          isCrossOriginSubframe = true;
        }
      }

      let dragOutcome: any = undefined;
      if (action === 'drag') {
        dragOutcome = { dragIntercepted: false, dndDispatched: false };
        const endPoint = await resolveDragEndPoint(tabId, args.end, args.coordinateSpace);
        if (!endPoint) {
          return createErrorResponse(
            'drag requires end.index or end.coordinate that resolves to a valid viewport point',
          );
        }
        await cdpSessionManager.withSession(tabId, 'interact-index-drag', async () => {
          const enableDnd = args.dnd !== false;
          const dragSteps = Math.max(2, Math.min(120, args.steps ?? 48));
          const holdMs = Math.max(0, Math.min(1000, args.holdMs ?? 80));
          if (enableDnd) {
            await cdpSessionManager.sendCommand(tabId, 'Input.setInterceptDrags', { enabled: true });
          }
          let dragData: any = null;
          const observer: CdpEventObserver = (tid, method, params) => {
            if (tid === tabId && method === 'Input.dragIntercepted') {
              dragData = (params as any)?.data ?? null;
            }
          };
          cdpSessionManager.addCdpEventObserver(observer);
          try {
            // No pre-press hover move: for narrow right-anchored drag targets
            // (resize handles) the hover move itself lands on the target and
            // advances its drag state before mousePressed, shifting the
            // element away from the press point. Pressing directly at the
            // resolved point is exact; the move loop below provides motion.
            await raceCdp(tabId, 'Input.dispatchMouseEvent', {
              type: 'mousePressed',
              x,
              y,
              button: 'left',
              buttons: 1,
              clickCount: 1,
              modifiers: modifierMask,
            });
            if (holdMs > 0) {
              await new Promise((r) => setTimeout(r, holdMs));
            }
            for (let i = 1; i <= dragSteps; i++) {
              const curX = Math.round(x + (endPoint.x - x) * (i / dragSteps));
              const curY = Math.round(y + (endPoint.y - y) * (i / dragSteps));
              await cdpSessionManager.sendCommand(tabId, 'Input.dispatchMouseEvent', {
                type: 'mouseMoved',
                x: curX,
                y: curY,
                button: 'left',
                buttons: 1,
                modifiers: modifierMask,
              });
              await new Promise((r) => setTimeout(r, 12));
            }
            const deadline = Date.now() + 300;
            while (!dragData && Date.now() < deadline) {
              await new Promise((r) => setTimeout(r, 25));
            }
            if (dragData) {
              await cdpSessionManager.sendCommand(tabId, 'Input.dispatchDragEvent', {
                type: 'dragEnter',
                x: endPoint.x,
                y: endPoint.y,
                data: dragData,
                modifiers: modifierMask,
              });
              await cdpSessionManager.sendCommand(tabId, 'Input.dispatchDragEvent', {
                type: 'dragOver',
                x: endPoint.x,
                y: endPoint.y,
                data: dragData,
                modifiers: modifierMask,
              });
              await cdpSessionManager.sendCommand(tabId, 'Input.dispatchDragEvent', {
                type: 'drop',
                x: endPoint.x,
                y: endPoint.y,
                data: dragData,
                modifiers: modifierMask,
              });
              dragOutcome.dndDispatched = true;
            }
            dragOutcome.dragIntercepted = Boolean(dragData);
            dragOutcome.dragSteps = dragSteps;
            // CDP-synthetic pointer drags: deliver one final pointermove to
            // the element under the press point, because hit-tested moves
            // stop reaching narrow targets (resize handles, sliders) once
            // the cursor outruns them. HTML5 drags skip this: they consume
            // dragIntercepted data instead of pointermove.
            if (!dragData) {
              try {
                const pmResult = (await executeInPage({ tabId }, 'inPagePointerDragMove', [x, y, endPoint.x, endPoint.y]))?.[0]?.result;
                dragOutcome.pointerMove = pmResult ?? null;
              } catch (pmErr) {
                dragOutcome.pointerMove = { error: String(pmErr instanceof Error ? pmErr.message : pmErr) };
              }
            }
            await raceCdp(tabId, 'Input.dispatchMouseEvent', {
              type: 'mouseReleased',
              x: endPoint.x,
              y: endPoint.y,
              button: 'left',
              buttons: 0,
              clickCount: 1,
              modifiers: modifierMask,
            });
            lastMousePosMap.set(tabId, { x: endPoint.x, y: endPoint.y });
          } finally {
            cdpSessionManager.removeCdpEventObserver(observer);
            if (enableDnd) {
              try {
                await cdpSessionManager.sendCommand(tabId, 'Input.setInterceptDrags', { enabled: false });
              } catch {}
            }
          }
        });
        usedNativeCDP = true;
      } else if (isCrossOriginSubframe) {
        const frameResults = await executeInPage({ tabId, frameIds: [targetFrameId!] }, 'inPageInteractIndex', [args.index!, action]);
        const frameOutcome = frameResults?.[0]?.result;
        if (!frameOutcome?.success) {
          return createErrorResponse(
            frameOutcome?.error || `Failed to interact with index [${args.index}] in frame ${targetFrameId}`,
          );
        }
      } else {
        // Main frame, visual coordinates, or same-origin subframe with compensated viewport coordinates:
        // Perform native CDP Mouse Event Dispatch (isTrusted=true)
        try {
          await cdpSessionManager.withSession(tabId, 'interact-index', async () => {
            if (action === 'hover' || args.humanize === true) {
              await dispatchMouseMovement(tabId, x, y, modifierMask, args.humanize === true);
            } else {
              lastMousePosMap.set(tabId, { x, y });
            }

            if (action === 'click') {
              await raceCdp(tabId, 'Input.dispatchMouseEvent', {
                type: 'mousePressed',
                x,
                y,
                button: 'left',
                buttons: 1,
                clickCount: 1,
                modifiers: modifierMask,
              });
              await raceCdp(tabId, 'Input.dispatchMouseEvent', {
                type: 'mouseReleased',
                x,
                y,
                button: 'left',
                buttons: 0,
                clickCount: 1,
                modifiers: modifierMask,
              });
            } else if (action === 'double_click') {
              // First click
              await raceCdp(tabId, 'Input.dispatchMouseEvent', {
                type: 'mousePressed',
                x,
                y,
                button: 'left',
                buttons: 1,
                clickCount: 1,
                modifiers: modifierMask,
              });
              await raceCdp(tabId, 'Input.dispatchMouseEvent', {
                type: 'mouseReleased',
                x,
                y,
                button: 'left',
                buttons: 0,
                clickCount: 1,
                modifiers: modifierMask,
              });
              // Second click
              await raceCdp(tabId, 'Input.dispatchMouseEvent', {
                type: 'mousePressed',
                x,
                y,
                button: 'left',
                buttons: 1,
                clickCount: 2,
                modifiers: modifierMask,
              });
              await raceCdp(tabId, 'Input.dispatchMouseEvent', {
                type: 'mouseReleased',
                x,
                y,
                button: 'left',
                buttons: 0,
                clickCount: 2,
                modifiers: modifierMask,
              });
            } else if (action === 'right_click') {
              await raceCdp(tabId, 'Input.dispatchMouseEvent', {
                type: 'mouseMoved',
                x,
                y,
                modifiers: modifierMask,
              });
              await raceCdp(tabId, 'Input.dispatchMouseEvent', {
                type: 'mousePressed',
                x,
                y,
                button: 'right',
                buttons: 2,
                clickCount: 1,
                modifiers: modifierMask,
              });
              await raceCdp(tabId, 'Input.dispatchMouseEvent', {
                type: 'mouseReleased',
                x,
                y,
                button: 'right',
                buttons: 0,
                clickCount: 1,
                modifiers: modifierMask,
              });
              if (typeof args.index === 'number' && args.index > 0) {
                try {
                  await executeInPage({ tabId }, 'inPageInteractIndex', [args.index, 'right_click']);
                } catch {}
              }
            } else if (action === 'hover') {
              // Mouse movement already dispatched above
            }
          });
        usedNativeCDP = true;
        } catch (cdpErr) {
          if (cdpErr instanceof DialogOpenedError) {
            throw cdpErr;
          }
          if (String((cdpErr as Error)?.message || '').startsWith('CDP_DISPATCH_TIMEOUT')) {
            // A modal dialog opened during dispatch; synthetic fallback would hang the same way.
            return createErrorResponse(cdpErr instanceof Error ? cdpErr.message : String(cdpErr));
          }
          console.warn(
            `CDP native mouse event dispatch failed for tab ${tabId}, falling back to synthetic event:`,
            cdpErr,
          );
          // Fallback to inPageInteractIndex if CDP is unavailable and index is provided
          if (typeof args.index === 'number' && args.index > 0) {
            const fallbackResults = await executeInPage({ tabId }, 'inPageInteractIndex', [args.index, action]);
            const fallbackOutcome = fallbackResults?.[0]?.result;
            if (!fallbackOutcome?.success) {
              return createErrorResponse(
                fallbackOutcome?.error || `Failed to interact with index [${args.index}]`,
              );
            }
          } else {
            return createErrorResponse(
              `CDP mouse event dispatch failed for visual coordinates (${x}, ${y}): ${cdpErr instanceof Error ? cdpErr.message : String(cdpErr)}`,
            );
          }
        }
      }

      // 3. Action Settle & Auto-Wait Watchdog
      let settleResult: any = undefined;
      if (args.waitForSettle) {
        settleResult = await waitForPageSettle(tabId, { timeoutMs: args.settleTimeoutMs });
      }

      // Visibility: screenshot-context TTL silently expires after 5 minutes;
      // surface the remaining budget so stale coordinate projection is detected
      const ctxTtlMs = screenshotContextManager.getTtlRemaining(tabId);
      const screenshotCtxWarning =
        ctxTtlMs >= 0 && ctxTtlMs < 30_000
          ? `screenshot coordinate context expires in ${Math.round(ctxTtlMs / 1000)}s; re-capture to refresh`
          : undefined;

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                success: true,
                index: args.index ?? null,
                action,
                tagName,
                text,
                isTrusted: usedNativeCDP,
                coordinates: { x, y },
                mode: isFallback
                  ? 'hybrid_visual_fallback'
                  : hasCoord && !hasIndex
                    ? 'visual_coordinate'
                    : 'dom_index',
                modifiers: args.modifiers || [],
                humanized: Boolean(args.humanize),
                drag: action === 'drag' ? dragOutcome : undefined,
                settle: settleResult,
                screenshotCtxWarning,
              },
              null,
              2,
            ),
          },
        ],
        isError: false,
      };
    } catch (error) {
      if (error instanceof DialogOpenedError) {
        return createDialogInterruptResponse(error);
      }
      return createErrorResponse(
        `Error executing chrome_interact_index: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}

export const interactIndexTool = new InteractIndexTool();
