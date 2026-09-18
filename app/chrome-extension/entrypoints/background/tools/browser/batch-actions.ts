import { createErrorResponse, ToolResult } from '@/common/tool-handler';
import { BaseBrowserToolExecutor } from '../base-browser';
import {
  TOOL_NAMES,
  type BatchActionItem,
  type BatchActionResult,
  type CaptureNetworkOptions,
} from 'chrome-mcp-shared';
import { DIAGNOSTIC_REFRESH_GUIDANCE, computePerceptiveDelta } from './dom-indexer';
import { executeInPage } from './in-page-engine';
import { waitForPageSettle, waitForNetworkQuiescence } from '@/utils/action-watchdog';
import { cdpSessionManager } from '@/utils/cdp-session-manager';
import { computeHumanizedPoints } from '@/utils/mouse-trajectory';
import {
  raceCdp as raceCdpBatch,
  DialogOpenedError,
  createDialogInterruptResponse,
} from '@/utils/race-cdp';
import { resolveTargetLocation } from './unified-locator';
import { captureDeltaIfRequested } from '@/utils/delta-helper';
import { getSubframeViewportOffset } from './interact-index';
import { tabFaviconManager } from './tab-favicon';
import { animateAgentCursor, animateAgentCursorClick } from './agent-cursor';
import { parseUnifiedCoordinate } from '@/utils/coordinate-parser';
import { sessionTabAffinity } from '@/utils/session-tab-affinity';
import { startActionNetworkCapture } from '@/utils/action-network-capture';

export interface BatchActionsParams {
  actions: BatchActionItem[];
  tabId?: number;
  windowId?: number;
  waitForSettle?: boolean;
  settleTimeoutMs?: number;
  /** Wait for network requests to settle after actions or batch */
  waitForNetworkQuiescence?: boolean;
  quiescenceTimeoutMs?: number;
  includeDelta?: boolean;
  sessionId?: string;
  sessionContext?: string;
  /** Inline capture of network response triggered during batch execution */
  captureNetwork?: CaptureNetworkOptions;
}

const KEY_ALIASES: Record<string, { key: string; code?: string; text?: string }> = {
  enter: { key: 'Enter', code: 'Enter' },
  return: { key: 'Enter', code: 'Enter' },
  backspace: { key: 'Backspace', code: 'Backspace' },
  delete: { key: 'Delete', code: 'Delete' },
  tab: { key: 'Tab', code: 'Tab' },
  escape: { key: 'Escape', code: 'Escape' },
  esc: { key: 'Escape', code: 'Escape' },
  space: { key: ' ', code: 'Space', text: ' ' },
  pageup: { key: 'PageUp', code: 'PageUp' },
  pagedown: { key: 'PageDown', code: 'PageDown' },
  home: { key: 'Home', code: 'Home' },
  end: { key: 'End', code: 'End' },
  arrowup: { key: 'ArrowUp', code: 'ArrowUp' },
  arrowdown: { key: 'ArrowDown', code: 'ArrowDown' },
  arrowleft: { key: 'ArrowLeft', code: 'ArrowLeft' },
  arrowright: { key: 'ArrowRight', code: 'ArrowRight' },
};

function resolveKey(token: string): { key: string; code?: string; text?: string } {
  const t = (token || '').toLowerCase();
  if (KEY_ALIASES[t]) return KEY_ALIASES[t];
  if (/^f([1-9]|1[0-2])$/.test(t)) {
    return { key: t.toUpperCase(), code: t.toUpperCase() };
  }
  if (token.length === 1) {
    const upper = token.toUpperCase();
    return { key: token, code: `Key${upper}`, text: token };
  }
  return { key: token, code: token };
}

const KEY_VK_CODES: Record<string, number> = {
  Enter: 13,
  Backspace: 8,
  Delete: 46,
  Tab: 9,
  Escape: 27,
  ' ': 32,
  PageUp: 33,
  PageDown: 34,
  End: 35,
  Home: 36,
  ArrowLeft: 37,
  ArrowUp: 38,
  ArrowRight: 39,
  ArrowDown: 40,
  Shift: 16,
  Control: 17,
  Alt: 18,
  Meta: 91,
};

function virtualKeyCode(key: string, code?: string): number | undefined {
  if (key in KEY_VK_CODES) return KEY_VK_CODES[key];
  if (/^F([1-9]|1[0-2])$/.test(key)) return 112 + Number(key.slice(1)) - 1;
  if (/^Key[A-Z]$/.test(code || '')) return 65 + (code as string).charCodeAt(3) - 65;
  if (/^Digit[0-9]$/.test(code || '')) return 48 + Number((code as string).slice(5));
  return undefined;
}

interface ModifierDef {
  key: string;
  code: string;
  vk: number;
  mask: number;
}

const MODIFIER_DEFS: Record<string, ModifierDef> = {
  Control: { key: 'Control', code: 'ControlLeft', vk: 17, mask: 2 },
  Meta: { key: 'Meta', code: 'MetaLeft', vk: 91, mask: 4 },
  Alt: { key: 'Alt', code: 'AltLeft', vk: 18, mask: 1 },
  Shift: { key: 'Shift', code: 'ShiftLeft', vk: 16, mask: 8 },
};

const MODIFIER_TOKENS: Record<string, 'Control' | 'Meta' | 'Alt' | 'Shift'> = {
  ctrl: 'Control',
  control: 'Control',
  meta: 'Meta',
  cmd: 'Meta',
  command: 'Meta',
  win: 'Meta',
  windows: 'Meta',
  alt: 'Alt',
  option: 'Alt',
  shift: 'Shift',
};

function parseKeyCombo(rawKey: string): {
  keyDef: { key: string; code?: string; text?: string };
  modifierDefs: ModifierDef[];
  modifiersMask: number;
} {
  const parts = (rawKey || '')
    .split('+')
    .map((part) => part.trim())
    .filter(Boolean);
  const modifierDefs: ModifierDef[] = [];
  let modifiersMask = 0;
  let mainToken = rawKey || '';
  if (parts.length > 1) {
    mainToken = parts[parts.length - 1];
    for (let i = 0; i < parts.length - 1; i++) {
      const modName = MODIFIER_TOKENS[parts[i].toLowerCase()];
      if (!modName) throw new Error('Unsupported key combo part: ' + parts[i]);
      modifierDefs.push(MODIFIER_DEFS[modName]);
      modifiersMask |= MODIFIER_DEFS[modName].mask;
    }
  }
  return { keyDef: resolveKey(mainToken), modifierDefs, modifiersMask };
}

export class BatchActionsTool extends BaseBrowserToolExecutor {
  name = TOOL_NAMES.BROWSER.BATCH_ACTIONS;

  async execute(args: BatchActionsParams): Promise<ToolResult> {
    const actions = args?.actions;
    if (!Array.isArray(actions) || actions.length === 0) {
      return createErrorResponse('actions parameter must be a non-empty array of actions');
    }

    try {
      const tab = await this.resolveAffinityTab({
        tabId: args.tabId,
        windowId: args.windowId,
        sessionId: args.sessionId || args.sessionContext,
      });
      if (!tab.id) {
        return createErrorResponse('No active tab found for chrome_batch_actions');
      }
      const tabId = tab.id;
      tabFaviconManager.markTabActive(tabId);

      return await sessionTabAffinity.runSerialized(tabId, async () => {
        const initialUrl = tab.url || '';
      const actionResults: Array<{
        actionIndex: number;
        success: boolean;
        error?: string;
        output?: any;
      }> = [];
      const extractedData: Record<string, string> = {};
      const assertions: Array<{
        actionIndex: number;
        passed: boolean;
        condition?: string;
        error?: string;
      }> = [];
      let interruptedReason: string | undefined;

      let spaDriftNotice: string | undefined;

      let isMac = false;
      try {
        const platform = await chrome.runtime.getPlatformInfo();
        isMac = platform?.os === 'mac';
      } catch {}

      const batchNetCapture = startActionNetworkCapture(tabId, args.captureNetwork);

      const preSignature = await executeInPage(
        { tabId },
        'inPageDetectPerceptiveSignature',
        [],
      )
        .then((r) => r?.[0]?.result)
        .catch(() => null);

      for (let i = 0; i < actions.length; i++) {
        const item = actions[i];
        if (item && typeof item === 'object') {
          if (typeof (item as any).index === 'string' && /^-?\d+$/.test((item as any).index.trim())) {
            item.index = parseInt((item as any).index.trim(), 10);
          }
          if (typeof (item as any).pressEnter === 'string') {
            item.pressEnter = (item as any).pressEnter.trim() === 'true';
          }
          if (typeof (item as any).submit === 'string') {
            (item as any).submit = (item as any).submit.trim() === 'true';
          }
          if (typeof (item as any).clear === 'string') {
            item.clear = (item as any).clear.trim() === 'true';
          }
        }
        const itemNetCapture = startActionNetworkCapture(tabId, item.captureNetwork);

        // Runtime URL drift guard: verify URL has not navigated to a different origin
        const currentTab = await chrome.tabs.get(tabId).catch(() => null);
        if (!currentTab) {
          interruptedReason = `Tab was closed during batch execution`;
          batchNetCapture.dispose();
          break;
        }
        if (currentTab.url !== initialUrl) {
          let sameOrigin = false;
          try {
            const initOrigin = new URL(initialUrl).origin;
            const curOrigin = currentTab.url ? new URL(currentTab.url).origin : '';
            if (initOrigin === curOrigin && curOrigin !== '') {
              sameOrigin = true;
            }
          } catch {}

          if (!sameOrigin) {
            interruptedReason = `Page URL changed or tab navigated to different origin during batch execution (from "${initialUrl}" to "${currentTab.url}")`;
            batchNetCapture.dispose();
            break;
          } else {
            // SPA path/hash navigation within the same origin: do not abort
            spaDriftNotice = `SPA navigation detected within origin (from "${initialUrl}" to "${currentTab.url}")`;
          }
        }

        try {
          // Precise scheduling: optional absolute epoch-ms deadline per action
          if (typeof item.at === 'number' && item.at > Date.now()) {
            await new Promise((resolve) => setTimeout(resolve, item.at! - Date.now()));
          }

          let stepOutput: any;

          switch (item.type) {
            case 'click':
            case 'double_click':
            case 'right_click':
            case 'hover': {
              const rawCoord =
                item.coordinate ??
                (item as any).coordinates ??
                (typeof item.x === 'number' && typeof item.y === 'number'
                  ? { x: item.x, y: item.y }
                  : undefined);

              const loc = await resolveTargetLocation(tabId, {
                ref: item.ref ?? item.index,
                selector: item.selector,
                text: item.text,
                coordinate: rawCoord,
              });

              if (!loc.success) {
                throw new Error(
                  loc.error ||
                    `Action ${i} of type '${item.type}' target not found. ${DIAGNOSTIC_REFRESH_GUIDANCE}`,
                );
              }

              let targetX = loc.x;
              let targetY = loc.y;
              const targetFrameId = loc.frameId ?? 0;

              if (targetFrameId !== 0) {
                const offset = await getSubframeViewportOffset(tabId, targetFrameId);
                const localX = (loc as any)?.frameOffsetX || 0;
                const localY = (loc as any)?.frameOffsetY || 0;
                targetX = targetX - localX + offset.offsetX;
                targetY = targetY - localY + offset.offsetY;
              }

              // Interception check & mask piercing
              let maskPierced: { description: string; reason: string } | undefined;
              const targetIndex =
                typeof item.index === 'number'
                  ? item.index
                  : typeof item.ref === 'number'
                    ? item.ref
                    : undefined;

              if (targetIndex !== undefined && item.type === 'click') {
                try {
                  const interceptRes = (
                    await executeInPage({ tabId }, 'inPageCheckInterception', [
                      targetIndex,
                      targetX,
                      targetY,
                    ])
                  )?.[0]?.result;
                  if (interceptRes?.intercepted && interceptRes?.description) {
                    if (interceptRes.canPierce && item.pierceOverlay !== false) {
                      maskPierced = {
                        description: interceptRes.description,
                        reason: interceptRes.pierceReason || 'transient_mask',
                      };
                    } else {
                      throw new Error(
                        `Action ${i} click intercepted by ${interceptRes.description}. Please dismiss or interact with the overlay/dialog first.`,
                      );
                    }
                  }
                } catch (e: any) {
                  if (e.message?.includes('intercepted')) throw e;
                }
              }

              void animateAgentCursor(tabId, targetX, targetY, {
                waitForArrival: false,
              });
              if (
                item.type === 'click' ||
                item.type === 'double_click' ||
                item.type === 'right_click'
              ) {
                void animateAgentCursorClick(tabId, targetX, targetY);
              }
              await cdpSessionManager.withSession(tabId, 'batch-actions-mouse', async () => {
                // Humanized micro-trajectory to bypass anti-bot path listeners
                const startX = Math.max(0, targetX - (40 + Math.floor(Math.random() * 50)));
                const startY = Math.max(0, targetY - (25 + Math.floor(Math.random() * 40)));
                const points = computeHumanizedPoints(startX, startY, targetX, targetY, 3);
                for (const pt of points) {
                  await raceCdpBatch(tabId, 'Input.dispatchMouseEvent', {
                    type: 'mouseMoved',
                    x: pt.x,
                    y: pt.y,
                  });
                  await new Promise((r) => setTimeout(r, 10));
                }

                if (item.type === 'click') {
                  await raceCdpBatch(tabId, 'Input.dispatchMouseEvent', {
                    type: 'mousePressed',
                    x: targetX,
                    y: targetY,
                    button: 'left',
                    buttons: 1,
                    clickCount: 1,
                  });
                  await new Promise((r) => setTimeout(r, 35));
                  await raceCdpBatch(tabId, 'Input.dispatchMouseEvent', {
                    type: 'mouseReleased',
                    x: targetX,
                    y: targetY,
                    button: 'left',
                    buttons: 0,
                    clickCount: 1,
                  });
                  if (maskPierced) {
                    try {
                      await executeInPage({ tabId }, 'inPageDispatchSyntheticClick', [
                        targetIndex ?? null,
                        targetX,
                        targetY,
                      ]);
                    } catch {}
                  }
                } else if (item.type === 'double_click') {
                  await raceCdpBatch(tabId, 'Input.dispatchMouseEvent', {
                    type: 'mousePressed',
                    x: targetX,
                    y: targetY,
                    button: 'left',
                    buttons: 1,
                    clickCount: 1,
                  });
                  await new Promise((r) => setTimeout(r, 35));
                  await raceCdpBatch(tabId, 'Input.dispatchMouseEvent', {
                    type: 'mouseReleased',
                    x: targetX,
                    y: targetY,
                    button: 'left',
                    buttons: 0,
                    clickCount: 1,
                  });
                  await new Promise((r) => setTimeout(r, 40));
                  await raceCdpBatch(tabId, 'Input.dispatchMouseEvent', {
                    type: 'mousePressed',
                    x: targetX,
                    y: targetY,
                    button: 'left',
                    buttons: 1,
                    clickCount: 2,
                  });
                  await raceCdpBatch(tabId, 'Input.dispatchMouseEvent', {
                    type: 'mouseReleased',
                    x: targetX,
                    y: targetY,
                    button: 'left',
                    buttons: 0,
                    clickCount: 2,
                  });
                } else if (item.type === 'right_click') {
                  try {
                    const rightClickTarget =
                      targetFrameId !== 0 ? { tabId, frameIds: [targetFrameId] } : { tabId };
                    if (typeof item.index === 'number' && item.index > 0) {
                      await executeInPage(rightClickTarget, 'inPageInteractIndex', [
                        item.index,
                        'right_click',
                      ]);
                    } else {
                      await executeInPage(rightClickTarget, 'inPageDispatchSyntheticClick', [
                        null,
                        targetX,
                        targetY,
                        'right_click',
                      ]);
                    }
                  } catch {}
                }
              });

              stepOutput = {
                x: targetX,
                y: targetY,
                action: item.type,
                [item.type]: true,
                tagName: loc.tagName,
                text: loc.text,
                isTrusted: item.type !== 'right_click' && !maskPierced,
                ...(maskPierced ? { piercedOverlay: maskPierced } : {}),
              };
              break;
            }

            case 'fill': {
              if (
                typeof item.index !== 'number' &&
                typeof item.ref === 'undefined' &&
                !item.selector
              ) {
                throw new Error(
                  `Action ${i} of type 'fill' requires 'ref', 'index', or 'selector' parameter`,
                );
              }
              const text = item.text ?? item.value ?? '';
              const isMultiLineOrPostText =
                text.includes('\n') ||
                text.length > 60 ||
                /(http|#|@|tweet|post|reply|thread)/i.test(text);
              let filledViaCdp = false;
              let coords: any;
              let isKnownEmpty = false;
              let disambiguationWarning: string | undefined;

              const targetRef = item.ref ?? item.index;
              const targetIndex =
                typeof targetRef === 'number'
                  ? targetRef
                  : typeof targetRef === 'string' && /^\d+$/.test(targetRef)
                    ? parseInt(targetRef, 10)
                    : undefined;

              let targetFrameId = 0;
              try {
                const loc = await resolveTargetLocation(tabId, {
                  ref: targetRef,
                  selector: item.selector,
                  preferComposer: item.preferComposer ?? isMultiLineOrPostText,
                });
                if (loc.success) {
                  coords = {
                    success: true,
                    x: loc.x,
                    y: loc.y,
                    value: loc.value,
                    tagName: loc.tagName,
                    inputType: loc.inputType,
                    isComposer: loc.isComposer,
                    isEditor: loc.isEditor,
                    isSearch: loc.isSearch,
                    attributes: loc.attributes,
                  };
                  targetFrameId = loc.frameId ?? 0;
                }

                const isSearchTarget = Boolean(
                  coords?.isSearch ||
                  coords?.inputType === 'search' ||
                  /(search|query|find|sousuo|搜索|查找)/i.test(
                    `${coords?.attributes?.name || ''} ${coords?.attributes?.id || ''} ${coords?.attributes?.['aria-label'] || ''} ${coords?.attributes?.placeholder || ''}`,
                  ),
                );

                if (isSearchTarget && isMultiLineOrPostText) {
                  disambiguationWarning = `[Input Disambiguation Notice] Batch action ${i} targeted a search input (searchbox), but the filled text looks like a multi-line post or comment. Verify targeting the [composer] element instead.`;
                  console.warn(`[BatchActionsTool] ${disambiguationWarning}`);
                }

                let isCrossOriginSubframe = false;
                if (targetFrameId !== 0 && !coords?.frameOffsetX && !coords?.frameOffsetY) {
                  try {
                    const mainOrigin = (
                      await executeInPage({ tabId }, 'inPageGetFrameOrigin', [])
                    )?.[0]?.result;
                    const frameOrigin = (
                      await executeInPage(
                        { tabId, frameIds: [targetFrameId] },
                        'inPageGetFrameOrigin',
                        [],
                      )
                    )?.[0]?.result;
                    isCrossOriginSubframe =
                      !mainOrigin || !frameOrigin || mainOrigin !== frameOrigin;
                  } catch {
                    isCrossOriginSubframe = true;
                  }
                }

                const isSpecialWidget =
                  loc.tagName === 'select' ||
                  loc.inputType === 'color' ||
                  loc.inputType === 'date' ||
                  loc.inputType === 'range' ||
                  loc.inputType === 'time' ||
                  loc.inputType === 'datetime-local' ||
                  loc.inputType === 'month' ||
                  loc.inputType === 'week' ||
                  loc.inputType === 'checkbox' ||
                  loc.inputType === 'radio' ||
                  loc.inputType === 'file';

                if (
                  !isCrossOriginSubframe &&
                  !isSpecialWidget &&
                  coords?.success &&
                  typeof coords.x === 'number' &&
                  typeof coords.y === 'number'
                ) {
                  let targetX = coords.x;
                  let targetY = coords.y;
                  if (targetFrameId !== 0) {
                    const offset = await getSubframeViewportOffset(tabId, targetFrameId);
                    const localX = loc.frameOffsetX || coords?.frameOffsetX || 0;
                    const localY = loc.frameOffsetY || coords?.frameOffsetY || 0;
                    targetX = targetX - localX + offset.offsetX;
                    targetY = targetY - localY + offset.offsetY;
                  }
                  isKnownEmpty =
                    (typeof coords.value === 'string' && coords.value === '') ||
                    (coords.value === undefined && (!coords.text || coords.text.trim() === ''));

                  let verification: any = null;
                  let fillMethod = 'cdp_native';
                  let submitExecuted = false;
                  let submitResult: any = undefined;
                  let submitMethod: string | undefined = undefined;

                  await cdpSessionManager.withSession(tabId, 'batch-actions-fill', async () => {
                    // Click to focus element
                    await raceCdpBatch(tabId, 'Input.dispatchMouseEvent', {
                      type: 'mouseMoved',
                      x: targetX,
                      y: targetY,
                    });
                    await raceCdpBatch(tabId, 'Input.dispatchMouseEvent', {
                      type: 'mousePressed',
                      x: targetX,
                      y: targetY,
                      button: 'left',
                      buttons: 1,
                      clickCount: 1,
                    });
                    await new Promise((r) => setTimeout(r, 35));
                    await raceCdpBatch(tabId, 'Input.dispatchMouseEvent', {
                      type: 'mouseReleased',
                      x: targetX,
                      y: targetY,
                      button: 'left',
                      buttons: 0,
                      clickCount: 1,
                    });

                    // Click settling pause (50ms) for dormant rich-text composers to mount and focus
                    await new Promise((r) => setTimeout(r, 50));

                    // Clear existing content if clear is not explicitly false
                    if (item.clear === true || (item.clear !== false && !isKnownEmpty)) {
                      // Cross-platform Deep Reset protocol (In-Page selection + beforeinput/execCommand delete)
                      try {
                        await executeInPage({ tabId }, 'inPageDeepResetElement', [targetRef ?? targetIndex]);
                      } catch {}

                      // Native CDP Backspace fallback (cross-platform)
                      await raceCdpBatch(tabId, 'Input.dispatchKeyEvent', {
                        type: 'rawKeyDown',
                        windowsVirtualKeyCode: 8,
                        key: 'Backspace',
                        code: 'Backspace',
                      });
                      await raceCdpBatch(tabId, 'Input.dispatchKeyEvent', {
                        type: 'keyUp',
                        windowsVirtualKeyCode: 8,
                        key: 'Backspace',
                        code: 'Backspace',
                      });
                    }

                    // Insert text via CDP Input.insertText (isTrusted: true)
                    if (text) {
                      await raceCdpBatch(tabId, 'Input.insertText', {
                        text: String(text),
                      });
                    }

                    // Allow React 18/19 concurrent event batching / microtasks to settle
                    await new Promise((r) => setTimeout(r, 40));

                    // True Input Commitment verification
                    try {
                      const vRes = await executeInPage(
                        { tabId },
                        'inPageVerifyInputCommitment',
                        [targetRef ?? targetIndex, text],
                      );
                      verification = vRes?.[0]?.result;
                    } catch {}

                    // Micro-retry for asynchronous framework debounce (e.g. Draft.js state update)
                    if (text && verification && verification.committed === false) {
                      await new Promise((r) => setTimeout(r, 60));
                      try {
                        const retryRes = await executeInPage(
                          { tabId },
                          'inPageVerifyInputCommitment',
                          [targetRef ?? targetIndex, text],
                        );
                        if (retryRes?.[0]?.result?.committed) {
                          verification = retryRes[0].result;
                        }
                      } catch {}
                    }

                    if (text && verification && verification.committed === false) {
                      console.warn(
                        `[BatchActionsTool] Reactive state commitment verification failed after Input.insertText for target [${targetRef}]. Retrying with CDP key-by-key typing...`,
                      );
                      for (const char of text) {
                        await raceCdpBatch(tabId, 'Input.dispatchKeyEvent', {
                          type: 'keyDown',
                          text: char,
                          unmodifiedText: char,
                          key: char,
                        });
                        await raceCdpBatch(tabId, 'Input.dispatchKeyEvent', {
                          type: 'keyUp',
                          key: char,
                        });
                        await new Promise((r) => setTimeout(r, 8));
                      }
                      fillMethod = 'cdp_key_by_key';

                      // Settling pause after key-by-key typing
                      await new Promise((r) => setTimeout(r, 50));

                      try {
                        const vRes2 = await executeInPage(
                          { tabId },
                          'inPageVerifyInputCommitment',
                          [targetRef ?? targetIndex, text],
                        );
                        verification = vRes2?.[0]?.result;
                      } catch {}
                    }

                    if (text && verification && verification.committed === false) {
                      throw new Error(
                        `True Input Commitment failed: ${verification.diagnostics || 'Framework reactive state did not update with filled text'}`,
                      );
                    }

                    submitExecuted = false;
                    submitResult = undefined;
                    submitMethod = undefined;

                    if (item.submit === true) {
                      if (verification?.submitButtonState?.found && typeof verification.submitButtonState.index === 'number') {
                        const btnIdx = verification.submitButtonState.index;
                        try {
                          const { interactIndexTool } = await import('./interact-index');
                          const clickRes = await interactIndexTool.execute({
                            index: btnIdx,
                            action: 'click',
                            tabId,
                            waitForSettle: false,
                          });
                          let submitSummary: any = (clickRes?.content?.[0] as any)?.text;
                          try {
                            submitSummary = JSON.parse(submitSummary);
                          } catch {}
                          submitExecuted = true;
                          submitMethod = 'click';
                          submitResult = submitSummary || { success: true };
                        } catch (clickErr) {
                          console.warn('Batch fill auto-submit click failed, falling back to Enter:', clickErr);
                          await raceCdpBatch(tabId, 'Input.dispatchKeyEvent', {
                            type: 'rawKeyDown',
                            windowsVirtualKeyCode: 13,
                            unmodifiedText: '\r',
                            text: '\r',
                            key: 'Enter',
                            code: 'Enter',
                          });
                          await raceCdpBatch(tabId, 'Input.dispatchKeyEvent', {
                            type: 'keyUp',
                            windowsVirtualKeyCode: 13,
                            key: 'Enter',
                            code: 'Enter',
                          });
                          submitExecuted = true;
                          submitMethod = 'pressEnter';
                        }
                      } else {
                        await raceCdpBatch(tabId, 'Input.dispatchKeyEvent', {
                          type: 'rawKeyDown',
                          windowsVirtualKeyCode: 13,
                          unmodifiedText: '\r',
                          text: '\r',
                          key: 'Enter',
                          code: 'Enter',
                        });
                        await raceCdpBatch(tabId, 'Input.dispatchKeyEvent', {
                          type: 'keyUp',
                          windowsVirtualKeyCode: 13,
                          key: 'Enter',
                          code: 'Enter',
                        });
                        submitExecuted = true;
                        submitMethod = 'pressEnter';
                      }
                    } else if (item.pressEnter === true) {
                      await raceCdpBatch(tabId, 'Input.dispatchKeyEvent', {
                        type: 'rawKeyDown',
                        windowsVirtualKeyCode: 13,
                        unmodifiedText: '\r',
                        text: '\r',
                        key: 'Enter',
                        code: 'Enter',
                      });
                      await raceCdpBatch(tabId, 'Input.dispatchKeyEvent', {
                        type: 'keyUp',
                        windowsVirtualKeyCode: 13,
                        key: 'Enter',
                        code: 'Enter',
                      });
                    }
                  });

                  stepOutput = {
                    success: true,
                    committed: true,
                    index: typeof targetIndex === 'number' ? targetIndex : undefined,
                    ref: targetRef,
                    filledText: text,
                    isTrusted: true,
                    method: fillMethod,
                    tagName: coords.tagName,
                    isComposer: coords?.isComposer,
                    isEditor: coords?.isEditor,
                    isSearch: coords?.isSearch,
                    submitButtonState: verification?.submitButtonState,
                    ...(submitExecuted ? { submitted: true, submitMethod, submitResult } : {}),
                    ...(disambiguationWarning ? { disambiguationWarning } : {}),
                  };
                  filledViaCdp = true;
                }
              } catch (cdpErr) {
                if (cdpErr instanceof DialogOpenedError) {
                  throw cdpErr;
                }
                console.warn(
                  `CDP native fill failed on [${targetRef ?? item.selector}], falling back:`,
                  cdpErr,
                );
              }

              if (!filledViaCdp) {
                let outcome: any;
                if (typeof targetIndex === 'number' && targetIndex > 0) {
                  const frameTarget = targetFrameId
                    ? { tabId, frameIds: [targetFrameId] }
                    : { tabId };
                  const shouldEnter = item.pressEnter === true || item.submit === true;
                  const res = await executeInPage(frameTarget, 'inPageFillIndex', [
                    targetIndex,
                    text,
                    item.clear !== false,
                    shouldEnter,
                  ]);
                  outcome = res?.[0]?.result;
                  if (!outcome?.success && !targetFrameId) {
                    const frameResults = await executeInPage(
                      { tabId, allFrames: true },
                      'inPageFillIndex',
                      [targetIndex, text, item.clear !== false, shouldEnter],
                    );
                    const match = frameResults.find((r) => r.result?.success);
                    if (match?.result) outcome = match.result;
                  }
                  if (item.submit === true && outcome?.submitButtonState?.found && typeof outcome.submitButtonState.index === 'number') {
                    try {
                      const { interactIndexTool } = await import('./interact-index');
                      await interactIndexTool.execute({
                        index: outcome.submitButtonState.index,
                        action: 'click',
                        tabId,
                        waitForSettle: false,
                      });
                      (outcome as any).submitted = true;
                      (outcome as any).submitMethod = 'click';
                    } catch {}
                  }
                } else if (item.selector) {
                  const selRes = await this.safeExecuteScript(tabId, {
                    target: targetFrameId ? { tabId, frameIds: [targetFrameId] } : { tabId },
                    func: (sel: string, val: string, shouldClear: boolean, shouldEnter: boolean) => {
                      const el = document.querySelector(sel);
                      if (!el) return { success: false, error: `Selector "${sel}" not found` };
                      if (typeof (el as HTMLElement).focus === 'function')
                        (el as HTMLElement).focus();

                      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
                        window.HTMLInputElement?.prototype || {},
                        'value',
                      )?.set;
                      const nativeCheckboxSetter = Object.getOwnPropertyDescriptor(
                        window.HTMLInputElement?.prototype || {},
                        'checked',
                      )?.set;
                      const nativeTextAreaValueSetter = Object.getOwnPropertyDescriptor(
                        window.HTMLTextAreaElement?.prototype || {},
                        'value',
                      )?.set;

                      if (
                        el instanceof HTMLInputElement &&
                        (el.type === 'checkbox' || el.type === 'radio')
                      ) {
                        const isTruthy =
                          val === 'true' ||
                          val === '1' ||
                          val === 'checked' ||
                          val === 'on' ||
                          (val !== 'false' && val !== '0' && val !== 'off' && Boolean(val));
                        if (nativeCheckboxSetter) {
                          nativeCheckboxSetter.call(el, isTruthy);
                        } else {
                          el.checked = isTruthy;
                        }
                      } else if (el instanceof HTMLInputElement && nativeInputValueSetter) {
                        if (shouldClear) nativeInputValueSetter.call(el, '');
                        nativeInputValueSetter.call(el, val);
                      } else if (el instanceof HTMLTextAreaElement && nativeTextAreaValueSetter) {
                        if (shouldClear) nativeTextAreaValueSetter.call(el, '');
                        nativeTextAreaValueSetter.call(el, val);
                      } else if (el instanceof HTMLSelectElement) {
                        let matched = false;
                        for (const opt of Array.from(el.options)) {
                          if (
                            opt.value === val ||
                            opt.text === val ||
                            opt.text.trim() === val.trim()
                          ) {
                            el.value = opt.value;
                            matched = true;
                            break;
                          }
                        }
                        if (!matched) el.value = val;
                      } else if (
                        el instanceof HTMLInputElement ||
                        el instanceof HTMLTextAreaElement
                      ) {
                        if (shouldClear) el.value = '';
                        el.value = val;
                      } else if ((el as HTMLElement).isContentEditable) {
                        if (shouldClear) (el as HTMLElement).innerText = '';
                        (el as HTMLElement).innerText = val;
                      } else {
                        (el as any).value = val;
                      }

                      el.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
                      el.dispatchEvent(new Event('change', { bubbles: true, composed: true }));

                      if (shouldEnter) {
                        el.dispatchEvent(
                          new KeyboardEvent('keydown', {
                            key: 'Enter',
                            code: 'Enter',
                            keyCode: 13,
                            which: 13,
                            bubbles: true,
                            composed: true,
                          }),
                        );
                        el.dispatchEvent(
                          new KeyboardEvent('keypress', {
                            key: 'Enter',
                            code: 'Enter',
                            keyCode: 13,
                            which: 13,
                            bubbles: true,
                            composed: true,
                          }),
                        );
                        el.dispatchEvent(
                          new KeyboardEvent('keyup', {
                            key: 'Enter',
                            code: 'Enter',
                            keyCode: 13,
                            which: 13,
                            bubbles: true,
                            composed: true,
                          }),
                        );
                        if (el instanceof HTMLInputElement && el.form) {
                          const submitBtn = el.form.querySelector(
                            'button[type="submit"], input[type="submit"]',
                          ) as HTMLElement | null;
                          if (submitBtn) {
                            submitBtn.click();
                          } else if (typeof el.form.requestSubmit === 'function') {
                            try {
                              el.form.requestSubmit();
                            } catch {}
                          }
                        }
                      }
                      return { success: true, filledText: val };
                    },
                    args: [item.selector, text, item.clear !== false, item.pressEnter === true || item.submit === true],
                  });
                  outcome = selRes?.[0]?.result;
                }
                if (!outcome?.success || outcome.committed === false) {
                  throw new Error(
                    outcome?.error ||
                      outcome?.diagnostics ||
                      `Fill failed on [${targetRef ?? item.selector}]. ${DIAGNOSTIC_REFRESH_GUIDANCE}`,
                  );
                }
                if (outcome && typeof outcome === 'object') {
                  outcome.committed = outcome.committed ?? true;
                  if (coords?.isComposer) outcome.isComposer = true;
                  if (coords?.isEditor) outcome.isEditor = true;
                  if (coords?.isSearch) outcome.isSearch = true;
                  if (disambiguationWarning) outcome.disambiguationWarning = disambiguationWarning;
                }
                stepOutput = outcome;
              }
              break;
            }

            case 'fill_form': {
              const fields = (item as any).fields;
              if (!Array.isArray(fields) || fields.length === 0) {
                throw new Error(
                  `Action ${i} of type 'fill_form' requires non-empty 'fields' array`,
                );
              }
              const fillFormResults: any[] = [];
              const selectAllMod = isMac ? 4 : 2;

              await cdpSessionManager.withSession(tabId, 'batch-actions-fill-form', async () => {
                for (let f = 0; f < fields.length; f++) {
                  const field = fields[f];
                  const loc = await resolveTargetLocation(tabId, {
                    ref: field.ref ?? field.index,
                    selector: field.selector,
                    text: field.text,
                  });
                  if (!loc.success) {
                    fillFormResults.push({
                      fieldIndex: f,
                      success: false,
                      error: loc.error || 'Field locator failed',
                    });
                    continue;
                  }

                  const textVal = String(field.value ?? field.text ?? '');
                  const isSpecial =
                    loc.tagName === 'select' ||
                    loc.inputType === 'color' ||
                    loc.inputType === 'date' ||
                    loc.inputType === 'range' ||
                    loc.inputType === 'time' ||
                    loc.inputType === 'datetime-local' ||
                    loc.inputType === 'month' ||
                    loc.inputType === 'week' ||
                    loc.inputType === 'checkbox' ||
                    loc.inputType === 'radio' ||
                    loc.inputType === 'file';

                  if (isSpecial) {
                    const targetRef = field.ref ?? field.index;
                    const targetIndex =
                      typeof targetRef === 'number'
                        ? targetRef
                        : typeof targetRef === 'string' && /^\d+$/.test(targetRef)
                          ? parseInt(targetRef, 10)
                          : undefined;
                    let outcome: any;
                    if (typeof targetIndex === 'number' && targetIndex > 0) {
                      const res = await executeInPage(
                        loc.frameId ? { tabId, frameIds: [loc.frameId] } : { tabId },
                        'inPageFillIndex',
                        [targetIndex, textVal, field.clear !== false],
                      );
                      outcome = res?.[0]?.result;
                    } else if (field.selector) {
                      const selRes = await this.safeExecuteScript(tabId, {
                        target: loc.frameId ? { tabId, frameIds: [loc.frameId] } : { tabId },
                        func: (sel: string, val: string, shouldClear: boolean) => {
                          const el = document.querySelector(sel);
                          if (!el) return { success: false, error: `Selector "${sel}" not found` };
                          if (typeof (el as HTMLElement).focus === 'function')
                            (el as HTMLElement).focus();

                          const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
                            window.HTMLInputElement?.prototype || {},
                            'value',
                          )?.set;
                          const nativeCheckboxSetter = Object.getOwnPropertyDescriptor(
                            window.HTMLInputElement?.prototype || {},
                            'checked',
                          )?.set;
                          const nativeTextAreaValueSetter = Object.getOwnPropertyDescriptor(
                            window.HTMLTextAreaElement?.prototype || {},
                            'value',
                          )?.set;

                          if (
                            el instanceof HTMLInputElement &&
                            (el.type === 'checkbox' || el.type === 'radio')
                          ) {
                            const isTruthy =
                              val === 'true' ||
                              val === '1' ||
                              val === 'checked' ||
                              val === 'on' ||
                              (val !== 'false' && val !== '0' && val !== 'off' && Boolean(val));
                            if (nativeCheckboxSetter) {
                              nativeCheckboxSetter.call(el, isTruthy);
                            } else {
                              el.checked = isTruthy;
                            }
                          } else if (el instanceof HTMLInputElement && nativeInputValueSetter) {
                            if (shouldClear) nativeInputValueSetter.call(el, '');
                            nativeInputValueSetter.call(el, val);
                          } else if (el instanceof HTMLTextAreaElement && nativeTextAreaValueSetter) {
                            if (shouldClear) nativeTextAreaValueSetter.call(el, '');
                            nativeTextAreaValueSetter.call(el, val);
                          } else if (el instanceof HTMLSelectElement) {
                            let matched = false;
                            for (const opt of Array.from(el.options)) {
                              if (
                                opt.value === val ||
                                opt.text === val ||
                                opt.text.trim() === val.trim()
                              ) {
                                el.value = opt.value;
                                matched = true;
                                break;
                              }
                            }
                            if (!matched) el.value = val;
                          } else if (
                            el instanceof HTMLInputElement ||
                            el instanceof HTMLTextAreaElement
                          ) {
                            if (shouldClear) el.value = '';
                            el.value = val;
                          } else if ((el as HTMLElement).isContentEditable) {
                            if (shouldClear) (el as HTMLElement).innerText = '';
                            (el as HTMLElement).innerText = val;
                          } else {
                            (el as any).value = val;
                          }

                          el.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
                          el.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
                          return { success: true, filledText: val };
                        },
                        args: [field.selector, textVal, field.clear !== false],
                      });
                      outcome = selRes?.[0]?.result;
                    }
                    fillFormResults.push({
                      fieldIndex: f,
                      success: outcome?.success !== false,
                      resolutionPath: loc.resolutionPath,
                    });
                    continue;
                  }

                  let targetX = loc.x;
                  let targetY = loc.y;
                  if (loc.frameId && loc.frameId !== 0) {
                    const offset = await getSubframeViewportOffset(tabId, loc.frameId);
                    const localX = loc.frameOffsetX || 0;
                    const localY = loc.frameOffsetY || 0;
                    targetX = targetX - localX + offset.offsetX;
                    targetY = targetY - localY + offset.offsetY;
                  }

                  await raceCdpBatch(tabId, 'Input.dispatchMouseEvent', {
                    type: 'mouseMoved',
                    x: targetX,
                    y: targetY,
                  });
                  await raceCdpBatch(tabId, 'Input.dispatchMouseEvent', {
                    type: 'mousePressed',
                    x: targetX,
                    y: targetY,
                    button: 'left',
                    buttons: 1,
                    clickCount: 1,
                  });
                  await new Promise((r) => setTimeout(r, 35));
                  await raceCdpBatch(tabId, 'Input.dispatchMouseEvent', {
                    type: 'mouseReleased',
                    x: targetX,
                    y: targetY,
                    button: 'left',
                    buttons: 0,
                    clickCount: 1,
                  });

                  if (field.clear !== false) {
                    await raceCdpBatch(tabId, 'Input.dispatchKeyEvent', {
                      type: 'rawKeyDown',
                      modifiers: selectAllMod,
                      windowsVirtualKeyCode: 65,
                      key: 'a',
                      code: 'KeyA',
                    });
                    await raceCdpBatch(tabId, 'Input.dispatchKeyEvent', {
                      type: 'keyUp',
                      modifiers: selectAllMod,
                      windowsVirtualKeyCode: 65,
                      key: 'a',
                      code: 'KeyA',
                    });
                    await raceCdpBatch(tabId, 'Input.dispatchKeyEvent', {
                      type: 'rawKeyDown',
                      windowsVirtualKeyCode: 8,
                      key: 'Backspace',
                      code: 'Backspace',
                    });
                    await raceCdpBatch(tabId, 'Input.dispatchKeyEvent', {
                      type: 'keyUp',
                      windowsVirtualKeyCode: 8,
                      key: 'Backspace',
                      code: 'Backspace',
                    });
                  }

                  if (textVal.length > 0) {
                    await raceCdpBatch(tabId, 'Input.insertText', {
                      text: textVal,
                    });
                  }

                  fillFormResults.push({
                    fieldIndex: f,
                    success: true,
                    resolutionPath: loc.resolutionPath,
                  });
                }
              });

              stepOutput = {
                success: true,
                fields: fillFormResults,
              };
              break;
            }

            case 'scroll': {
              const targetRef = item.ref ?? item.index;
              const targetIndex =
                typeof targetRef === 'number'
                  ? targetRef
                  : typeof targetRef === 'string' && /^\d+$/.test(targetRef)
                    ? parseInt(targetRef, 10)
                    : undefined;

              if (typeof targetIndex === 'number' && targetIndex > 0) {
                const scrollRes = await executeInPage({ tabId }, 'inPageScrollToIndex', [
                  targetIndex,
                ]);
                let scrolled = Boolean(scrollRes?.[0]?.result);
                if (!scrolled) {
                  const frameResults = await executeInPage(
                    { tabId, allFrames: true },
                    'inPageScrollToIndex',
                    [targetIndex],
                  );
                  scrolled = Boolean(frameResults.some((r) => r.result));
                }
                if (!scrolled) {
                  throw new Error(
                    `Element with index [${targetIndex}] not found for scroll. ${DIAGNOSTIC_REFRESH_GUIDANCE}`,
                  );
                }
                stepOutput = { scrolledIndex: targetIndex };
                break;
              }

              const rawAmount = Math.abs(item.amount ?? 500);
              // Honour all four directions. Previously deltaX was hard-coded to 0
              // and only up/down were mapped, so horizontal scrolls silently
              // turned into vertical ones.
              const isHorizontal = item.direction === 'left' || item.direction === 'right';
              const amount =
                item.direction === 'up' || item.direction === 'left' ? -rawAmount : rawAmount;
              const deltaX = isHorizontal ? amount : 0;
              const deltaY = isHorizontal ? 0 : amount;
              let cdpScrolled = false;
              try {
                const rawCoord =
                  item.coordinate ??
                  (item as any).coordinates ??
                  (typeof item.x === 'number' && typeof item.y === 'number'
                    ? { x: item.x, y: item.y }
                    : undefined);
                const parsedCoord = rawCoord ? parseUnifiedCoordinate(rawCoord, { tabId }) : null;
                const scrollX = parsedCoord?.x ?? 500;
                const scrollY = parsedCoord?.y ?? 400;
                await cdpSessionManager.withSession(tabId, 'batch-actions-scroll', async () => {
                  await raceCdpBatch(tabId, 'Input.dispatchMouseEvent', {
                    type: 'mouseWheel',
                    x: scrollX,
                    y: scrollY,
                    deltaX,
                    deltaY,
                  });
                  cdpScrolled = true;
                });
              } catch (scrollErr) {
                if (scrollErr instanceof DialogOpenedError) {
                  throw scrollErr;
                }
              }

              if (!cdpScrolled) {
                await this.safeExecuteScript(tabId, {
                  target: { tabId },
                  func: (dx, dy) => {
                    window.scrollBy({ left: dx, top: dy, behavior: 'instant' });
                  },
                  args: [deltaX, deltaY],
                });
              }
              stepOutput = {
                scrolled: amount,
                direction: item.direction ?? 'down',
                deltaX,
                deltaY,
                method: cdpScrolled ? 'cdp_wheel' : 'window_scroll_by',
              };
              break;
            }

            case 'wait': {
              const waitMs = Math.min(item.durationMs ?? 500, 10000);
              await new Promise((resolve) => setTimeout(resolve, waitMs));
              stepOutput = { waitedMs: waitMs };
              break;
            }

            case 'key':
            case 'press_key': {
              const { keyDef, modifierDefs, modifiersMask } = parseKeyCombo(item.key || 'Enter');
              const vk = virtualKeyCode(keyDef.key, keyDef.code);
              await cdpSessionManager.withSession(tabId, 'batch-actions', async () => {
                if (!modifierDefs.length && keyDef.text && keyDef.text.length === 1) {
                  try {
                    await raceCdpBatch(tabId, 'Input.insertText', { text: keyDef.text });
                  } catch {
                    await raceCdpBatch(tabId, 'Input.dispatchKeyEvent', {
                      type: 'keyDown',
                      key: keyDef.key,
                      code: keyDef.code,
                      text: keyDef.text,
                      windowsVirtualKeyCode: vk,
                    });
                    await raceCdpBatch(tabId, 'Input.dispatchKeyEvent', {
                      type: 'keyUp',
                      key: keyDef.key,
                      code: keyDef.code,
                      windowsVirtualKeyCode: vk,
                    });
                  }
                } else if (!modifierDefs.length) {
                  // keyDown (not rawKeyDown) so browser default actions fire:
                  // Tab focus traversal, Enter button activation, Escape dialog
                  // dismissal all rely on the keydown default behavior. Enter
                  // additionally needs text='\r' to generate the keypress that
                  // triggers activation (matches Puppeteer semantics).
                  await raceCdpBatch(tabId, 'Input.dispatchKeyEvent', {
                    type: 'keyDown',
                    key: keyDef.key,
                    code: keyDef.code,
                    text: keyDef.key === 'Enter' ? '\r' : undefined,
                    windowsVirtualKeyCode: vk,
                  });
                  await raceCdpBatch(tabId, 'Input.dispatchKeyEvent', {
                    type: 'keyUp',
                    key: keyDef.key,
                    code: keyDef.code,
                    windowsVirtualKeyCode: vk,
                  });
                } else {
                  let heldMask = 0;
                  for (const mod of modifierDefs) {
                    heldMask |= mod.mask;
                    await raceCdpBatch(tabId, 'Input.dispatchKeyEvent', {
                      type: 'rawKeyDown',
                      key: mod.key,
                      code: mod.code,
                      windowsVirtualKeyCode: mod.vk,
                      modifiers: heldMask,
                    });
                  }
                  await raceCdpBatch(tabId, 'Input.dispatchKeyEvent', {
                    type: 'rawKeyDown',
                    key: keyDef.key,
                    code: keyDef.code,
                    windowsVirtualKeyCode: vk,
                    modifiers: modifiersMask,
                  });
                  await raceCdpBatch(tabId, 'Input.dispatchKeyEvent', {
                    type: 'keyUp',
                    key: keyDef.key,
                    code: keyDef.code,
                    windowsVirtualKeyCode: vk,
                    modifiers: modifiersMask,
                  });
                  for (let i = modifierDefs.length - 1; i >= 0; i--) {
                    const mod = modifierDefs[i];
                    await raceCdpBatch(tabId, 'Input.dispatchKeyEvent', {
                      type: 'keyUp',
                      key: mod.key,
                      code: mod.code,
                      windowsVirtualKeyCode: mod.vk,
                      modifiers: heldMask,
                    });
                    heldMask &= ~mod.mask;
                  }
                }
              });
              stepOutput = { pressedKey: keyDef.key, modifiers: modifiersMask };
              break;
            }

            case 'assert': {
              const condition = item.condition || 'contains';
              const expected = item.expectedText ?? '';
              const timeoutMs = typeof item.timeoutMs === 'number' ? item.timeoutMs : 300;
              const deadline = Date.now() + Math.max(0, timeoutMs);

              let actualText = '';
              let isVisible = false;
              let disabled = false;
              let ariaDisabled = false;
              let validity: { valid: boolean } | undefined = undefined;
              let invalidReason: string | undefined = undefined;
              let checked: boolean | undefined = undefined;
              let selected: boolean | undefined = undefined;
              let passed = false;

              const targetRef = item.ref ?? item.index;
              const targetIndex =
                typeof targetRef === 'number'
                  ? targetRef
                  : typeof targetRef === 'string' && /^\d+$/.test(targetRef)
                    ? parseInt(targetRef, 10)
                    : undefined;

              while (true) {
                if (typeof targetIndex === 'number' && targetIndex > 0) {
                  const res = await executeInPage({ tabId }, 'inPageGetElementCoordinates', [
                    targetIndex,
                  ]);
                  let coords = res?.[0]?.result;
                  if (!coords?.success) {
                    const frameResults = await executeInPage(
                      { tabId, allFrames: true },
                      'inPageGetElementCoordinates',
                      [targetIndex],
                    );
                    const match = frameResults.find((r) => r.result?.success);
                    if (match?.result) coords = match.result;
                  }
                  if (coords?.success) {
                    isVisible = true;
                    actualText = String(coords.text ?? coords.value ?? '');
                    disabled = Boolean(coords.disabled);
                    ariaDisabled = Boolean(coords.ariaDisabled);
                    validity = coords.validity;
                    invalidReason = coords.invalidReason;
                    checked = coords.checked;
                    selected = coords.selected;
                  } else {
                    isVisible = false;
                    actualText = '';
                    disabled = false;
                    ariaDisabled = false;
                    validity = undefined;
                    invalidReason = undefined;
                    checked = undefined;
                    selected = undefined;
                  }
                } else if (item.selector) {
                  const selFunc = (sel: string) => {
                    const el = document.querySelector(sel);
                    if (!el) return { found: false };
                    const rect = el.getBoundingClientRect();
                    const visible =
                      rect.width > 0 &&
                      rect.height > 0 &&
                      window.getComputedStyle(el).visibility !== 'hidden' &&
                      window.getComputedStyle(el).display !== 'none';
                    const isAriaInvalid = el.getAttribute('aria-invalid') === 'true';
                    const valObj = (el as any).validity;
                    const validity = valObj
                      ? { valid: isAriaInvalid ? false : Boolean(valObj.valid) }
                      : isAriaInvalid
                        ? { valid: false }
                        : undefined;
                    const invalidReason =
                      (el as any).validationMessage || (isAriaInvalid ? 'aria-invalid' : undefined);
                    return {
                      found: true,
                      visible,
                      text: (el as HTMLElement).innerText ?? el.textContent ?? '',
                      value: (el as HTMLInputElement).value ?? '',
                      disabled: Boolean((el as any).disabled || el.hasAttribute('disabled')),
                      ariaDisabled: el.getAttribute('aria-disabled') === 'true',
                      validity,
                      invalidReason,
                      checked:
                        typeof (el as any).checked === 'boolean'
                          ? (el as any).checked
                          : el.getAttribute('aria-checked') === 'true'
                            ? true
                            : el.getAttribute('aria-checked') === 'false'
                              ? false
                              : undefined,
                      selected:
                        typeof (el as any).selected === 'boolean'
                          ? (el as any).selected
                          : el.getAttribute('aria-selected') === 'true'
                            ? true
                            : el.getAttribute('aria-selected') === 'false'
                              ? false
                              : undefined,
                    };
                  };
                  const selRes = await this.safeExecuteScript(tabId, {
                    target: { tabId },
                    func: selFunc,
                    args: [item.selector],
                  });
                  let data = selRes?.[0]?.result as any;
                  if (!data?.found) {
                    const frameResults = await this.safeExecuteScript(tabId, {
                      target: { tabId, allFrames: true },
                      func: selFunc,
                      args: [item.selector],
                    });
                    const match = frameResults.find((r: any) => r.result?.found);
                    if (match?.result) data = match.result;
                  }
                  if (data?.found) {
                    isVisible = Boolean(data.visible);
                    actualText = String(data.text || data.value || '');
                    disabled = Boolean(data.disabled);
                    ariaDisabled = Boolean(data.ariaDisabled);
                    validity = data.validity;
                    invalidReason = data.invalidReason;
                    checked = data.checked;
                    selected = data.selected;
                  } else {
                    isVisible = false;
                    actualText = '';
                    disabled = false;
                    ariaDisabled = false;
                    validity = undefined;
                    invalidReason = undefined;
                    checked = undefined;
                    selected = undefined;
                  }
                }

                switch (condition) {
                  case 'visible':
                    passed = isVisible;
                    break;
                  case 'not_visible':
                    passed = !isVisible;
                    break;
                  case 'enabled':
                    passed = isVisible && !disabled && !ariaDisabled;
                    break;
                  case 'disabled':
                    passed = disabled || ariaDisabled;
                    break;
                  case 'valid':
                    passed = validity ? validity.valid : !invalidReason;
                    break;
                  case 'invalid':
                    passed = validity ? !validity.valid : Boolean(invalidReason);
                    break;
                  case 'checked':
                    passed = checked !== undefined ? Boolean(checked) : Boolean(selected);
                    break;
                  case 'unchecked':
                    passed = checked !== undefined ? !checked : !selected;
                    break;
                  case 'matches':
                    try {
                      passed = new RegExp(expected).test(actualText);
                    } catch {
                      passed = false;
                    }
                    break;
                  case 'equals':
                    passed = actualText.trim() === expected.trim();
                    break;
                  case 'not_contains':
                    passed = !actualText.includes(expected);
                    break;
                  case 'contains':
                  default:
                    passed = actualText.includes(expected);
                    break;
                }

                if (passed || Date.now() >= deadline) break;
                const remaining = deadline - Date.now();
                if (remaining <= 0) break;
                await new Promise((r) => setTimeout(r, Math.min(50, remaining)));
              }

              assertions.push({
                actionIndex: i,
                passed,
                condition,
                error: passed
                  ? undefined
                  : `Assertion failed: expected "${expected}" with condition "${condition}", got "${actualText}" (visible=${isVisible}, disabled=${disabled || ariaDisabled}, valid=${validity ? validity.valid : !invalidReason}, checked=${checked})`,
              });

              if (!passed && item.abortOnFailure !== false) {
                throw new Error(
                  `Assertion failed at action ${i}: condition "${condition}" not met for expected "${expected}". Actual: "${actualText}"`,
                );
              }

              stepOutput = {
                asserted: true,
                passed,
                condition,
                actualText,
                isVisible,
                disabled,
                ariaDisabled,
                valid: validity ? validity.valid : !invalidReason,
                invalidReason,
                checked,
                selected,
              };
              break;
            }

            case 'extract': {
              let extractedValue = '';
              const prop = item.property || 'text';
              const targetRef = item.ref ?? item.index;
              const targetIndex =
                typeof targetRef === 'number'
                  ? targetRef
                  : typeof targetRef === 'string' && /^\d+$/.test(targetRef)
                    ? parseInt(targetRef, 10)
                    : undefined;

              if (typeof targetIndex === 'number' && targetIndex > 0) {
                const res = await executeInPage({ tabId }, 'inPageGetElementCoordinates', [
                  targetIndex,
                ]);
                let coords = res?.[0]?.result;
                if (!coords?.success) {
                  const frameResults = await executeInPage(
                    { tabId, allFrames: true },
                    'inPageGetElementCoordinates',
                    [targetIndex],
                  );
                  const match = frameResults.find((r) => r.result?.success);
                  if (match?.result) coords = match.result;
                }
                if (coords?.success) {
                  if (prop === 'attribute') {
                    const attrName = item.attributeName || '';
                    const attrs = (coords as any).attributes || {};
                    extractedValue =
                      attrs[attrName] ??
                      attrs[attrName.toLowerCase()] ??
                      '';
                  } else if (prop === 'value') {
                    extractedValue = String(coords.value ?? '');
                  } else {
                    extractedValue = String(coords.text ?? '');
                  }
                }
              } else if (item.selector) {
                const extractFunc = (sel: string, p: string, attr?: string) => {
                  const el = document.querySelector(sel);
                  if (!el) return null;
                  if (p === 'attribute' && attr) return el.getAttribute(attr) ?? '';
                  if (p === 'value') return (el as HTMLInputElement).value ?? '';
                  return (el as HTMLElement).innerText ?? el.textContent ?? '';
                };
                const selRes = await this.safeExecuteScript(tabId, {
                  target: { tabId },
                  func: extractFunc,
                  args: [item.selector, prop, item.attributeName || ''],
                });
                let val = selRes?.[0]?.result;
                if (val === null || val === undefined) {
                  const frameResults = await this.safeExecuteScript(tabId, {
                    target: { tabId, allFrames: true },
                    func: extractFunc,
                    args: [item.selector, prop, item.attributeName || ''],
                  });
                  const match = frameResults.find(
                    (r: any) => r.result !== null && r.result !== undefined,
                  );
                  if (match) val = match.result;
                }
                extractedValue = String(val ?? '');
              }

              const varName = item.variableName || `var_${i}`;
              extractedData[varName] = extractedValue;
              stepOutput = {
                extracted: true,
                variableName: varName,
                value: extractedValue,
                property: prop,
              };
              break;
            }

            default:
              throw new Error(`Unsupported batch action type: ${(item as any).type}`);
          }

          if (item.waitForNetworkQuiescence) {
            const qTimeout = item.quiescenceTimeoutMs || args.quiescenceTimeoutMs || 2000;
            const netSettled = await waitForNetworkQuiescence(tabId, qTimeout);
            if (typeof stepOutput === 'object' && stepOutput !== null) {
              stepOutput.networkSettled = netSettled;
            }
          }

          if (item.waitForSettle) {
            const itemSettle = await waitForPageSettle(tabId, { timeoutMs: item.settleTimeoutMs });
            if (typeof stepOutput === 'object' && stepOutput !== null) {
              stepOutput.settle = itemSettle;
            }
          }

          const itemNetResult = await itemNetCapture.waitForResult();
          if (itemNetResult) {
            stepOutput = {
              ...(typeof stepOutput === 'object' && stepOutput !== null ? stepOutput : {}),
              networkResult: itemNetResult,
            };
          }

          actionResults.push({
            actionIndex: i,
            success: true,
            output: stepOutput,
          });
        } catch (stepErr) {
          itemNetCapture.dispose();
          batchNetCapture.dispose();
          if (stepErr instanceof DialogOpenedError) {
            return createDialogInterruptResponse(stepErr);
          }
          actionResults.push({
            actionIndex: i,
            success: false,
            error: stepErr instanceof Error ? stepErr.message : String(stepErr),
          });
          interruptedReason = `Action ${i} (${item.type}) failed`;
          break;
        }
      }

      let networkSettled: boolean | undefined;
      if (args.waitForNetworkQuiescence) {
        networkSettled = await waitForNetworkQuiescence(tabId, args.quiescenceTimeoutMs || 2000);
      }

      let batchSettle: any = undefined;
      if (args.waitForSettle) {
        batchSettle = await waitForPageSettle(tabId, { timeoutMs: args.settleTimeoutMs });
      }

      const delta = await captureDeltaIfRequested(tabId, args.includeDelta);

      let currentUrl = initialUrl;
      try {
        const updatedTab = await chrome.tabs.get(tabId);
        currentUrl = updatedTab.url || initialUrl;
      } catch {}
      const urlChanged = Boolean(initialUrl && currentUrl && initialUrl !== currentUrl);

      if (interruptedReason) {
        batchNetCapture.dispose();
      }
      const batchNetResult = await batchNetCapture.waitForResult();

      const postSignature = await executeInPage(
        { tabId },
        'inPageDetectPerceptiveSignature',
        [],
      )
        .then((r) => r?.[0]?.result)
        .catch(() => null);
      const perceptiveDelta = computePerceptiveDelta(preSignature, postSignature);

      const totalCompleted = actionResults.filter((r) => r.success).length;
      const batchResult: BatchActionResult & { spaDriftNotice?: string; networkSettled?: boolean; perceptiveDelta?: any } = {
        success: totalCompleted === actions.length,
        completedActions: totalCompleted,
        totalActions: actions.length,
        urlChanged,
        previousUrl: initialUrl,
        currentUrl,
        results: actionResults,
        interruptedReason,
        settle: batchSettle,
        spaDriftNotice,
        ...(batchNetResult ? { networkResult: batchNetResult } : {}),
        ...(typeof networkSettled === 'boolean' ? { networkSettled } : {}),
        ...(Object.keys(extractedData).length > 0 ? { extractedData } : {}),
        ...(assertions.length > 0 ? { assertions } : {}),
        ...(delta ? { delta } : {}),
        ...(perceptiveDelta ? { perceptiveDelta } : {}),
      };

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(batchResult),
            },
          ],
          isError: !batchResult.success,
        };
      });
    } catch (error) {
      if (error instanceof DialogOpenedError) {
        return createDialogInterruptResponse(error);
      }
      return createErrorResponse(
        `Error executing chrome_batch_actions: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}

export const batchActionsTool = new BatchActionsTool();
