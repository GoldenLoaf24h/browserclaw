import { createErrorResponse, ToolResult } from '../../../../common/tool-handler';
import { BaseBrowserToolExecutor } from '../base-browser';
import { TOOL_NAMES } from 'chrome-mcp-shared';
import { cdpSessionManager } from '../../../../utils/cdp-session-manager';
import {
  raceCdp,
  DialogOpenedError,
  createDialogInterruptResponse,
} from '../../../../utils/race-cdp';
import { executeInPage } from './in-page-engine';
import { waitForPageSettle } from '../../../../utils/action-watchdog';
import { inPageArmDeliveryProbe, inPageReadDeliveryProbe } from './dom-indexer';
import { screenshotContextManager, scaleCoordinates } from '../../../../utils/screenshot-context';
import { computeHumanizedPoints } from '../../../../utils/mouse-trajectory';
import type { CdpEventObserver } from '../../../../utils/cdp-session-manager';
import {
  parseUnifiedCoordinate,
  type PolymorphicCoordinate,
} from '../../../../utils/coordinate-parser';
import { sessionTabAffinity } from '../../../../utils/session-tab-affinity';
import { animateAgentCursor, animateAgentCursorClick } from './agent-cursor';
import { captureDeltaIfRequested } from '../../../../utils/delta-helper';
import { tabFaviconManager } from './tab-favicon';

export interface InteractIndexParams {
  index?: number;
  coordinate?: { x: number; y: number } | PolymorphicCoordinate;
  coordinateSpace?: 'viewport' | 'screenshot';
  points?: Array<{ x: number; y: number } | PolymorphicCoordinate>;
  intervalMs?: number;
  action?: 'click' | 'hover' | 'double_click' | 'right_click' | 'drag';
  path?: Array<{ x: number; y: number }>;
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
  includeDelta?: boolean;
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

export async function getSubframeViewportOffset(
  tabId: number,
  frameId: number,
): Promise<{ offsetX: number; offsetY: number }> {
  if (!frameId || frameId === 0) return { offsetX: 0, offsetY: 0 };
  try {
    if (typeof chrome !== 'undefined' && chrome.webNavigation?.getAllFrames) {
      const allFrames = await chrome.webNavigation.getAllFrames({ tabId }).catch(() => null);
      if (allFrames && allFrames.length > 0) {
        const frameMap = new Map<
          number,
          { frameId: number; parentFrameId: number; url?: string }
        >();
        for (const f of allFrames) {
          frameMap.set(f.frameId, f);
        }

        const chain: Array<{ parentId: number; childId: number; childUrl?: string }> = [];
        let curr = frameMap.get(frameId);
        while (curr && curr.frameId !== 0) {
          const parentId = curr.parentFrameId;
          chain.unshift({ parentId, childId: curr.frameId, childUrl: curr.url });
          curr = frameMap.get(parentId);
        }

        if (chain.length > 0) {
          let totalX = 0;
          let totalY = 0;
          for (const link of chain) {
            const results = await Promise.race([
              chrome.scripting
                .executeScript({
                  target: { tabId, frameIds: [link.parentId] },
                  func: (targetUrl?: string) => {
                    const iframes = Array.from(document.querySelectorAll('iframe'));
                    if (iframes.length === 0) return { offsetX: 0, offsetY: 0 };
                    let match = iframes.find((f) => {
                      try {
                        return (
                          targetUrl &&
                          f.src &&
                          (f.src === targetUrl ||
                            targetUrl.startsWith(f.src) ||
                            f.src.startsWith(targetUrl))
                        );
                      } catch {
                        return false;
                      }
                    });
                    if (!match) {
                      match = iframes[0];
                    }
                    if (match) {
                      const rect = match.getBoundingClientRect();
                      const style = window.getComputedStyle(match);
                      const borderLeft = parseFloat(style?.borderLeftWidth || '0') || 0;
                      const borderTop = parseFloat(style?.borderTopWidth || '0') || 0;
                      return {
                        offsetX: Math.round(rect.left + borderLeft),
                        offsetY: Math.round(rect.top + borderTop),
                      };
                    }
                    return { offsetX: 0, offsetY: 0 };
                  },
                  args: [link.childUrl],
                })
                .catch(() => null),
              new Promise<any>((r) => setTimeout(() => r(null), 400)),
            ]);

            const res = results?.[0]?.result;
            if (res) {
              totalX += res.offsetX;
              totalY += res.offsetY;
            }
          }
          return { offsetX: totalX, offsetY: totalY };
        }
      }
    }
  } catch (err) {
    console.warn(`Failed to resolve subframe ${frameId} cumulative offset:`, err);
  }
  return { offsetX: 0, offsetY: 0 };
}

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
    let coordResult: any = (
      await executeInPage({ tabId }, 'inPageGetElementCoordinates', [end.index])
    )?.[0]?.result;
    let endFrameId: number | undefined = undefined;
    if (!coordResult?.success) {
      const frameResults = await executeInPage(
        { tabId, allFrames: true },
        'inPageGetElementCoordinates',
        [end.index],
      );
      const match = frameResults.find((r) => r.result?.success);
      if (match?.result) {
        coordResult = match.result;
        endFrameId = match.frameId;
      }
    }
    if (
      coordResult?.success &&
      typeof coordResult.x === 'number' &&
      typeof coordResult.y === 'number'
    ) {
      let endX = coordResult.x;
      let endY = coordResult.y;
      if (
        endFrameId &&
        endFrameId !== 0 &&
        !coordResult.frameOffsetX &&
        !coordResult.frameOffsetY
      ) {
        const offset = await getSubframeViewportOffset(tabId, endFrameId);
        endX += offset.offsetX;
        endY += offset.offsetY;
      }
      return { x: endX, y: endY };
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
          const scaled = scaleCoordinates(
            (end.coordinate as any).x,
            (end.coordinate as any).y,
            ctx,
          );
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
    // Dispatch intermediate approach steps within 30px radius to guarantee realistic pointer tracking (avoids NO_POINTER_PATH)
    const deltas = [
      { dx: -65, dy: -38 },
      { dx: -42, dy: -24 },
      { dx: -24, dy: -14 },
      { dx: -12, dy: -7 },
      { dx: -4, dy: -2 },
      { dx: 0, dy: 0 },
    ];
    for (const d of deltas) {
      await cdpSessionManager.sendCommand(tabId, 'Input.dispatchMouseEvent', {
        type: 'mouseMoved',
        x: Math.round(targetX + d.dx),
        y: Math.round(targetY + d.dy),
        modifiers: modifierMask,
      });
      await new Promise((r) => setTimeout(r, 12));
    }
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
    await cdpSessionManager.sendCommand(tabId, 'Input.dispatchMouseEvent', {
      type: 'mouseMoved',
      x: pt.x,
      y: pt.y,
      modifiers: modifierMask,
    });
    await new Promise((r) => setTimeout(r, 12 + Math.floor(Math.random() * 15)));
  }

  // Micro-approach steps within target's direct neighborhood (< 25px radius) to guarantee realistic pointer tracking (avoids NO_POINTER_PATH)
  const localDeltas = [
    { dx: -20, dy: -12 },
    { dx: -10, dy: -6 },
    { dx: -3, dy: -2 },
    { dx: 0, dy: 0 },
  ];
  for (const d of localDeltas) {
    await cdpSessionManager.sendCommand(tabId, 'Input.dispatchMouseEvent', {
      type: 'mouseMoved',
      x: Math.round(targetX + d.dx),
      y: Math.round(targetY + d.dy),
      modifiers: modifierMask,
    });
    await new Promise((r) => setTimeout(r, 15));
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
      (args?.coordinate && parseUnifiedCoordinate(args.coordinate)),
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
      // D3: snapshot BEFORE resolveAffinityTab — its active-tab fallback binds
      // the fallback tab, so post-resolution checks always pass (live-tested).
      const interactHadPreexistingBinding = sessionTabAffinity.hasBinding(
        args.sessionId || args.sessionContext,
      );
      const tab = await this.resolveAffinityTab({
        tabId: args.tabId,
        windowId: args.windowId,
        sessionId: args.sessionId || args.sessionContext,
      });
      const tabId = tab.id;
      if (!tabId) {
        return createErrorResponse('No active tab found for chrome_interact_index');
      }
      const previousUrl = tab.url || '';
      tabFaviconManager.markTabActive(tabId);

      // D3 (TESTING-NOTES #19): when no explicit tabId/session bound the
      // target, resolveAffinityTab fell through to the user's ACTIVE tab -
      // input silently landed on whatever page the user was viewing. Surface
      // that fallback in the response so the agent can correct with an
      // explicit tabId. Non-blocking for backward compatibility.
      const explicitOrBound = typeof args.tabId === 'number' || interactHadPreexistingBinding;
      const affinityWarning = explicitOrBound
        ? undefined
        : `input routed to active tab (tabId=${tabId}); pass explicit tabId to target another tab`;

      // Helper to project screenshot-space or polymorphic coordinates to viewport space
      const isScreenshotSpace = args.coordinateSpace === 'screenshot';
      const projectCoord = (c: any): { x: number; y: number } => {
        if (
          !isScreenshotSpace &&
          typeof c?.x === 'number' &&
          typeof c?.y === 'number' &&
          !c.box_2d &&
          !c.point
        ) {
          return { x: Math.round(c.x), y: Math.round(c.y) };
        }
        const parsed = parseUnifiedCoordinate(c, { tabId });
        if (parsed) return parsed;
        if (!isScreenshotSpace) return { x: Math.round(c.x), y: Math.round(c.y) };
        const ctx = screenshotContextManager.getContext(tabId);
        if (!ctx) return { x: Math.round(c.x), y: Math.round(c.y) };
        const scaled = scaleCoordinates(c.x, c.y, ctx);
        return { x: scaled.x, y: scaled.y };
      };

      // D1: arm one-shot delivery probe BEFORE dispatch (TESTING-NOTES #27).
      // Hidden-tab throttling acks CDP commands but drops the events; the
      // probe records whether any trusted event actually reached the page.
      let probeArmed = false;
      const armProbe = async () => {
        try {
          await executeInPage({ tabId }, 'inPageArmDeliveryProbe', [
            action === 'click' || action === 'double_click' || action === 'right_click'
              ? ['mousedown', 'mouseup', 'click']
              : action === 'drag'
                ? ['mousedown', 'mousemove', 'mouseup']
                : ['mousemove', 'mouseover'],
          ]);
          probeArmed = true;
        } catch {
          // Restricted page / renderer gone: dispatch below will error anyway.
        }
      };

      // Click sequence: CDP-dispatch a rapid burst of full clicks at the given
      // viewport points. One MCP round-trip, page-side interval down to ~35ms —
      // the only way to hit fast-moving canvas targets (rAF-animated hitboxes).
      if (hasPoints) {
        await armProbe();
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
        // D1: read back the delivery probe before returning. click_sequence is
        // a native-CDP path, so delivered=false here means throttling ate the
        // burst (TESTING-NOTES #27).
        let burstDelivery: Record<string, unknown> = {};
        if (probeArmed) {
          try {
            const probe = (await executeInPage({ tabId }, 'inPageReadDeliveryProbe', [true]))?.[0]
              ?.result;
            burstDelivery = probe?.delivered
              ? { deliveryVerified: true }
              : { deliveryVerified: false, deliveryHits: probe?.hits ?? [] };
          } catch {
            burstDelivery = {};
          }
        }
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  success: true,
                  action: 'click_sequence',
                  pointsDispatched: dispatched,
                  coordinates: scaledPoints,
                  ...(affinityWarning ? { affinityWarning } : {}),
                  ...burstDelivery,
                },
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
          const frameResults = await executeInPage(
            { tabId, allFrames: true },
            'inPageGetElementCoordinates',
            [args.index!],
          );
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
              (coordResult?.error ||
                `Element with index [${args.index}] not found in active DOM index map`) +
                `. Hint: Element may reside inside a dynamic or closed ShadowRoot. Try calling chrome_javascript to inspect or dispatch, or re-scan with chrome_read_dom.`,
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
        return createErrorResponse(`Failed to resolve valid pixel coordinates for interaction`);
      }

      // Animate virtual agent cursor to target position before physical interaction
      await animateAgentCursor(tabId, x, y, { waitForArrival: true, timeoutMs: 1200 });

      // Shadow DOM penetrating interception check (self-healing feedback)
      if (args.index !== undefined && !isFallback && action === 'click') {
        try {
          const interceptRes = (
            await executeInPage({ tabId }, 'inPageCheckInterception', [args.index, x, y])
          )?.[0]?.result;
          if (interceptRes?.intercepted && interceptRes?.description) {
            return createErrorResponse(
              `Element [${args.index}] click intercepted by ${interceptRes.description}. Please dismiss or interact with the overlay/dialog first. Hint: If this is an open modal, interact with its buttons to dismiss. If it is a captcha or human verification, call chrome_request_human_intervention.`,
            );
          }
        } catch {
          // Non-blocking on inspection failure
        }
      }

      const modifierMask = computeModifierMask(args.modifiers);
      let usedNativeCDP = false;
      // 2. Compensate cumulative frame offset if target is inside a nested or cross-origin subframe
      if (
        targetFrameId !== undefined &&
        targetFrameId !== 0 &&
        !isFallback &&
        !coordResult?.frameOffsetX &&
        !coordResult?.frameOffsetY
      ) {
        const offset = await getSubframeViewportOffset(tabId, targetFrameId);
        x += offset.offsetX;
        y += offset.offsetY;
      }

      let dragOutcome: any = undefined;
      if (action === 'drag') {
        dragOutcome = { dragIntercepted: false, dndDispatched: false };
        const hasPath = Array.isArray(args.path) && args.path.length > 0;
        let endPoint: { x: number; y: number } | null = null;
        if (!hasPath) {
          endPoint = await resolveDragEndPoint(tabId, args.end, args.coordinateSpace);
          if (!endPoint) {
            return createErrorResponse('drag requires end.index, end.coordinate, or a path array');
          }
        } else {
          const lastPt = args.path![args.path!.length - 1];
          endPoint = { x: Math.round(lastPt.x), y: Math.round(lastPt.y) };
        }

        if (!endPoint && !hasPath) {
          return createErrorResponse(
            'drag requires end.index or end.coordinate that resolves to a valid viewport point',
          );
        }
        await cdpSessionManager.withSession(tabId, 'interact-index-drag', async () => {
          const enableDnd = args.dnd !== false;
          const dragSteps = Math.max(2, Math.min(120, args.steps ?? 48));
          const holdMs = Math.max(0, Math.min(1000, args.holdMs ?? 80));
          if (enableDnd) {
            await cdpSessionManager.sendCommand(tabId, 'Input.setInterceptDrags', {
              enabled: true,
            });
          }
          let dragData: any = null;
          const observer: CdpEventObserver = (tid, method, params) => {
            if (tid === tabId && method === 'Input.dragIntercepted') {
              dragData = (params as any)?.data ?? null;
            }
          };
          cdpSessionManager.addCdpEventObserver(observer);
          try {
            const startX = hasPath ? Math.round(args.path![0].x) : x;
            const startY = hasPath ? Math.round(args.path![0].y) : y;

            await dispatchMouseMovement(tabId, startX, startY, modifierMask, false);
            const prePressPauseMs = Math.max(
              80,
              Math.min(300, (args as any).prePressDelayMs ?? 110),
            );
            await new Promise((r) => setTimeout(r, prePressPauseMs));

            await raceCdp(tabId, 'Input.dispatchMouseEvent', {
              type: 'mousePressed',
              x: startX,
              y: startY,
              button: 'left',
              buttons: 1,
              clickCount: 1,
              modifiers: modifierMask,
            });
            if (holdMs > 0) {
              await new Promise((r) => setTimeout(r, holdMs));
            }

            if (hasPath) {
              for (let pi = 1; pi < args.path!.length; pi++) {
                const pt = args.path![pi];
                await raceCdp(tabId, 'Input.dispatchMouseEvent', {
                  type: 'mouseMoved',
                  x: Math.round(pt.x),
                  y: Math.round(pt.y),
                  button: 'left',
                  buttons: 1,
                  modifiers: modifierMask,
                });
                await new Promise((r) => setTimeout(r, 16));
              }
            } else {
              // D2 fix (TESTING-NOTES #43): after dragIntercepted fires, Chrome
              // stops acking Input.dispatchMouseEvent entirely - the old loop
              // kept blind-sending mouseMoved and hung 30s+. Bail out of the
              // move loop the moment interception is observed; dispatchDragEvent
              // below completes the HTML5 drag without any further input acks.
              let dragIntercepted = false;
              for (let i = 1; i <= dragSteps && !dragIntercepted; i++) {
                const curX = Math.round(startX + (endPoint.x - startX) * (i / dragSteps));
                const curY = Math.round(startY + (endPoint.y - startY) * (i / dragSteps));
                await raceCdp(tabId, 'Input.dispatchMouseEvent', {
                  type: 'mouseMoved',
                  x: curX,
                  y: curY,
                  button: 'left',
                  buttons: 1,
                  modifiers: modifierMask,
                }).catch((err) => {
                  if (String(err?.message || '').startsWith('CDP_DISPATCH_TIMEOUT')) {
                    dragIntercepted = true;
                    return undefined;
                  }
                  throw err;
                });
                if (!dragIntercepted) {
                  dragIntercepted = Boolean(dragData);
                }
                await new Promise((r) => setTimeout(r, 12));
              }
            }
            if (enableDnd) {
              const deadline = Date.now() + 300;
              while (!dragData && Date.now() < deadline) {
                await new Promise((r) => setTimeout(r, 25));
              }
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
            void animateAgentCursor(tabId, endPoint.x, endPoint.y, {
              immediate: false,
              waitForArrival: false,
            });
            dragOutcome.dragIntercepted = Boolean(dragData);
            dragOutcome.dragSteps = dragSteps;
            // CDP-synthetic pointer drags: deliver one final pointermove to
            // the element under the press point, because hit-tested moves
            // stop reaching narrow targets (resize handles, sliders) once
            // the cursor outruns them. HTML5 drags skip this: they consume
            // dragIntercepted data instead of pointermove.
            if (!dragData && !hasPath) {
              try {
                const pmResult = (
                  await executeInPage({ tabId }, 'inPagePointerDragMove', [
                    x,
                    y,
                    endPoint.x,
                    endPoint.y,
                  ])
                )?.[0]?.result;
                dragOutcome.pointerMove = pmResult ?? null;
              } catch (pmErr) {
                dragOutcome.pointerMove = {
                  error: String(pmErr instanceof Error ? pmErr.message : pmErr),
                };
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
                await cdpSessionManager.sendCommand(tabId, 'Input.setInterceptDrags', {
                  enabled: false,
                });
              } catch {}
            }
          }
        });
        usedNativeCDP = true;
      } else {
        // Primary path: Native CDP Mouse Event Dispatch (isTrusted=true)
        try {
          await armProbe();
          await cdpSessionManager.withSession(tabId, 'interact-index', async () => {
            // Always dispatch mouse movement to target coordinates before pressing (ensures authentic pointer path)
            await dispatchMouseMovement(tabId, x, y, modifierMask, args.humanize === true);

            if (action === 'click') {
              const prePressPauseMs = Math.max(
                80,
                Math.min(300, (args as any).prePressDelayMs ?? 110),
              );
              await new Promise((r) => setTimeout(r, prePressPauseMs));
              void animateAgentCursorClick(tabId, x, y);
              await raceCdp(tabId, 'Input.dispatchMouseEvent', {
                type: 'mousePressed',
                x,
                y,
                button: 'left',
                buttons: 1,
                clickCount: 1,
                modifiers: modifierMask,
              });
              const clickHoldMs = Math.max(35, Math.min(3000, args.holdMs ?? 45));
              await new Promise((r) => setTimeout(r, clickHoldMs));
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
              void animateAgentCursorClick(tabId, x, y);
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
              await new Promise((r) => setTimeout(r, 35));
              await raceCdp(tabId, 'Input.dispatchMouseEvent', {
                type: 'mouseReleased',
                x,
                y,
                button: 'left',
                buttons: 0,
                clickCount: 1,
                modifiers: modifierMask,
              });
              await new Promise((r) => setTimeout(r, 40));
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
              void animateAgentCursorClick(tabId, x, y);
              await raceCdp(tabId, 'Input.dispatchMouseEvent', {
                type: 'mouseMoved',
                x,
                y,
                modifiers: modifierMask,
              });
              // Dispatch contextmenu directly in page to trigger web app onContextMenu handlers
              // without popping up OS-level native context menus that freeze the Chromium renderer
              try {
                if (typeof args.index === 'number' && args.index > 0) {
                  await executeInPage({ tabId }, 'inPageInteractIndex', [
                    args.index,
                    'right_click',
                  ]);
                } else {
                  await executeInPage({ tabId }, 'inPageDispatchSyntheticClick', [
                    null,
                    x,
                    y,
                    'right_click',
                  ]);
                }
              } catch {}
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
            let isCaptcha = false;
            try {
              const checkRes = (await executeInPage({ tabId }, 'inPageCheckCaptcha', []))?.[0]
                ?.result;
              isCaptcha = Boolean(checkRes?.detected);
            } catch {}
            if (isCaptcha) {
              return createErrorResponse(
                `[CAPTCHA_BLOCKED: Slider / human verification detected] The page is blocked by anti-bot verification. Call chrome_request_human_intervention to let the user solve it.`,
              );
            }
            return createErrorResponse(
              `${cdpErr instanceof Error ? cdpErr.message : String(cdpErr)}. Hint: If a native dialog is open, call chrome_handle_dialog. If this is a slider or captcha verification, call chrome_request_human_intervention.`,
            );
          }
          console.warn(
            `CDP native mouse event dispatch failed for tab ${tabId}, falling back to synthetic event:`,
            cdpErr,
          );
          // Fallback to inPageInteractIndex if CDP is unavailable and index is provided
          if (typeof args.index === 'number' && args.index > 0) {
            const frameTarget = targetFrameId ? { tabId, frameIds: [targetFrameId] } : { tabId };
            const fallbackResults = await executeInPage(frameTarget, 'inPageInteractIndex', [
              args.index,
              action,
            ]);
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

      // D1: read back the delivery probe. Only meaningful when armed and the
      // action used native CDP (synthetic fallback fires the same listeners
      // synchronously, so a false there would be a probe artifact).
      let deliveryVerified: boolean | undefined;
      let deliveryHits: any[] | undefined;
      let fallbackTriggered: string | undefined;
      if (probeArmed && usedNativeCDP) {
        try {
          const probe = (await executeInPage({ tabId }, 'inPageReadDeliveryProbe', [true]))?.[0]
            ?.result;
          deliveryVerified = Boolean(probe?.delivered);
          if (!deliveryVerified) {
            deliveryHits = probe?.hits ?? [];
            // Click Probe Fallback: if native CDP events were dropped (e.g. background tab throttling),
            // fall back to synthetic DOM event dispatch to ensure 100% execution.
            if (action === 'click') {
              try {
                const synRes = (
                  await executeInPage({ tabId }, 'inPageDispatchSyntheticClick', [
                    args.index ?? null,
                    x,
                    y,
                  ])
                )?.[0]?.result;
                if (synRes) {
                  deliveryVerified = true;
                  fallbackTriggered = 'synthetic_click_probe';
                  usedNativeCDP = false;
                }
              } catch {
                // Ignore fallback error
              }
            }
          }
        } catch {
          deliveryVerified = undefined;
        }
      }

      // Visibility: screenshot-context TTL silently expires after 5 minutes;
      // surface the remaining budget so stale coordinate projection is detected
      const ctxTtlMs = screenshotContextManager.getTtlRemaining(tabId);
      const screenshotCtxWarning =
        ctxTtlMs >= 0 && ctxTtlMs < 30_000
          ? `screenshot coordinate context expires in ${Math.round(ctxTtlMs / 1000)}s; re-capture to refresh`
          : undefined;

      const delta = await captureDeltaIfRequested(tabId, args.includeDelta);

      let currentUrl = previousUrl;
      try {
        const updatedTab = await chrome.tabs.get(tabId);
        currentUrl = updatedTab.url || previousUrl;
      } catch {}
      const urlChanged = Boolean(previousUrl && currentUrl && previousUrl !== currentUrl);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                success: true,
                urlChanged,
                previousUrl,
                currentUrl,
                index: args.index ?? null,
                action,
                tagName,
                text,
                isTrusted: usedNativeCDP,
                coordinates: { x, y },
                fallbackTriggered,
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
                ...(affinityWarning ? { affinityWarning } : {}),
                ...(delta ? { delta } : {}),
                ...(deliveryVerified === undefined
                  ? {}
                  : deliveryVerified
                    ? { deliveryVerified: true }
                    : { deliveryVerified: false, deliveryHits }),
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
