import { createErrorResponse, ToolResult } from '@/common/tool-handler';
import { BaseBrowserToolExecutor } from '../base-browser';
import { TOOL_NAMES, type BatchActionItem, type BatchActionResult } from 'chrome-mcp-shared';
import { DIAGNOSTIC_REFRESH_GUIDANCE } from './dom-indexer';
import { executeInPage } from './in-page-engine';
import { waitForPageSettle } from '@/utils/action-watchdog';
import { cdpSessionManager } from '@/utils/cdp-session-manager';
import {
  raceCdp as raceCdpBatch,
  DialogOpenedError,
  createDialogInterruptResponse,
} from '@/utils/race-cdp';
import { resolveTargetLocation } from './unified-locator';
import { captureDeltaIfRequested } from '@/utils/delta-helper';

export interface BatchActionsParams {
  actions: BatchActionItem[];
  tabId?: number;
  windowId?: number;
  waitForSettle?: boolean;
  settleTimeoutMs?: number;
  includeDelta?: boolean;
  sessionId?: string;
  sessionContext?: string;
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

      for (let i = 0; i < actions.length; i++) {
        const item = actions[i];

        // Runtime URL drift guard: verify URL has not navigated to a different origin
        const currentTab = await chrome.tabs.get(tabId).catch(() => null);
        if (!currentTab) {
          interruptedReason = `Tab was closed during batch execution`;
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
            case 'hover': {
              let x: number | undefined;
              let y: number | undefined;
              let coords: any;

              let targetFrameId = 0;
              const directCoord = item.coordinate ?? (item as any).coordinates;
              if (
                directCoord &&
                typeof directCoord.x === 'number' &&
                typeof directCoord.y === 'number'
              ) {
                x = directCoord.x;
                y = directCoord.y;
              } else if (typeof item.index === 'number') {
                const res = await executeInPage({ tabId }, 'inPageGetElementCoordinates', [
                  item.index,
                ]);
                coords = res?.[0]?.result;
                if (!coords?.success) {
                  const frameResults = await executeInPage(
                    { tabId, allFrames: true },
                    'inPageGetElementCoordinates',
                    [item.index],
                  );
                  const match = frameResults.find((r) => r.result?.success);
                  if (match?.result) {
                    coords = match.result;
                    targetFrameId = match.frameId ?? 0;
                  }
                }
                if (
                  !coords?.success ||
                  typeof coords.x !== 'number' ||
                  typeof coords.y !== 'number'
                ) {
                  throw new Error(
                    coords?.error ||
                      `Element with index [${item.index}] not found in active DOM index map. ${DIAGNOSTIC_REFRESH_GUIDANCE}`,
                  );
                }
                x = coords.x;
                y = coords.y;
              } else {
                throw new Error(
                  `Action ${i} of type '${item.type}' requires 'index' or 'coordinate' parameter`,
                );
              }

              if (typeof x !== 'number' || typeof y !== 'number') {
                throw new Error(`Failed to resolve coordinates for action ${i}`);
              }
              const targetX = x;
              const targetY = y;

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
                  isCrossOriginSubframe = !mainOrigin || !frameOrigin || mainOrigin !== frameOrigin;
                } catch {
                  isCrossOriginSubframe = true;
                }
              }

              if (isCrossOriginSubframe) {
                const frameResults = await executeInPage(
                  { tabId, frameIds: [targetFrameId] },
                  'inPageInteractIndex',
                  [item.index, item.type],
                );
                const frameOutcome = frameResults?.[0]?.result;
                if (!frameOutcome?.success) {
                  throw new Error(
                    frameOutcome?.error ||
                      `Failed to ${item.type} index [${item.index}] in cross-origin frame ${targetFrameId}`,
                  );
                }
                stepOutput = {
                  x: targetX,
                  y: targetY,
                  [item.type === 'click' ? 'clicked' : 'hovered']: true,
                  tagName: coords?.tagName,
                  frameId: targetFrameId,
                  method: 'synthetic_cross_origin_frame',
                };
              } else {
                await cdpSessionManager.withSession(tabId, 'batch-actions-mouse', async () => {
                  await raceCdpBatch(tabId, 'Input.dispatchMouseEvent', {
                    type: 'mouseMoved',
                    x: targetX,
                    y: targetY,
                  });

                  if (item.type === 'click') {
                    await raceCdpBatch(tabId, 'Input.dispatchMouseEvent', {
                      type: 'mousePressed',
                      x: targetX,
                      y: targetY,
                      button: 'left',
                      clickCount: 1,
                    });
                    await raceCdpBatch(tabId, 'Input.dispatchMouseEvent', {
                      type: 'mouseReleased',
                      x: targetX,
                      y: targetY,
                      button: 'left',
                      clickCount: 1,
                    });
                  }
                });

                stepOutput = {
                  x: targetX,
                  y: targetY,
                  [item.type === 'click' ? 'clicked' : 'hovered']: true,
                  tagName: coords?.tagName,
                  text: coords?.text,
                };
              }
              break;
            }

            case 'fill': {
              if (typeof item.index !== 'number') {
                throw new Error(`Action ${i} of type 'fill' requires 'index' parameter`);
              }
              const text = item.text ?? item.value ?? '';
              let filledViaCdp = false;
              let coords: any;
              // Skip Ctrl+A + Backspace clear when the field is already empty:
              // a trusted Backspace on an empty box can trigger page-level
              // "backspace retreats focus" logic (e.g. OTP inputs) and steal the
              // subsequent insertText into the previous box.
              let isKnownEmpty = false;

              let targetFrameId = 0;
              try {
                const res = await executeInPage({ tabId }, 'inPageGetElementCoordinates', [
                  item.index,
                ]);
                coords = res?.[0]?.result;
                if (!coords?.success) {
                  const frameResults = await executeInPage(
                    { tabId, allFrames: true },
                    'inPageGetElementCoordinates',
                    [item.index],
                  );
                  const match = frameResults.find((r) => r.result?.success);
                  if (match?.result) {
                    coords = match.result;
                    targetFrameId = match.frameId ?? 0;
                  }
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

                if (
                  !isCrossOriginSubframe &&
                  coords?.success &&
                  typeof coords.x === 'number' &&
                  typeof coords.y === 'number'
                ) {
                  const targetX = coords.x;
                  const targetY = coords.y;
                  isKnownEmpty = typeof coords.value === 'string' && coords.value === '';

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
                      clickCount: 1,
                    });
                    await raceCdpBatch(tabId, 'Input.dispatchMouseEvent', {
                      type: 'mouseReleased',
                      x: targetX,
                      y: targetY,
                      button: 'left',
                      clickCount: 1,
                    });

                    // Clear existing content if clear is not explicitly false
                    if (item.clear !== false && !isKnownEmpty) {
                      const mod = isMac ? 4 : 2; // Meta or Control
                      await raceCdpBatch(tabId, 'Input.dispatchKeyEvent', {
                        type: 'rawKeyDown',
                        modifiers: mod,
                        windowsVirtualKeyCode: 65,
                        key: 'a',
                        code: 'KeyA',
                      });
                      await raceCdpBatch(tabId, 'Input.dispatchKeyEvent', {
                        type: 'keyUp',
                        modifiers: mod,
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

                    // Insert text via CDP Input.insertText (isTrusted: true)
                    if (text) {
                      await raceCdpBatch(tabId, 'Input.insertText', {
                        text: String(text),
                      });
                    }
                  });

                  stepOutput = {
                    success: true,
                    index: item.index,
                    filledText: text,
                    isTrusted: true,
                    method: 'cdp_native',
                    tagName: coords.tagName,
                  };
                  filledViaCdp = true;
                }
              } catch (cdpErr) {
                if (cdpErr instanceof DialogOpenedError) {
                  throw cdpErr;
                }
                console.warn(
                  `CDP native fill failed on index [${item.index}], falling back to inPageFillIndex:`,
                  cdpErr,
                );
              }

              if (!filledViaCdp) {
                const res = await executeInPage({ tabId }, 'inPageFillIndex', [
                  item.index,
                  text,
                  item.clear !== false,
                ]);
                let outcome = res?.[0]?.result;
                if (!outcome?.success) {
                  const frameResults = await executeInPage(
                    { tabId, allFrames: true },
                    'inPageFillIndex',
                    [item.index, text, item.clear !== false],
                  );
                  const match = frameResults.find((r) => r.result?.success);
                  if (match?.result) outcome = match.result;
                }
                if (!outcome?.success) {
                  throw new Error(
                    outcome?.error ||
                      `Fill failed on index [${item.index}]. ${DIAGNOSTIC_REFRESH_GUIDANCE}`,
                  );
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
                  await raceCdpBatch(tabId, 'Input.dispatchMouseEvent', {
                    type: 'mouseMoved',
                    x: loc.x,
                    y: loc.y,
                  });
                  await raceCdpBatch(tabId, 'Input.dispatchMouseEvent', {
                    type: 'mousePressed',
                    x: loc.x,
                    y: loc.y,
                    button: 'left',
                    clickCount: 1,
                  });
                  await raceCdpBatch(tabId, 'Input.dispatchMouseEvent', {
                    type: 'mouseReleased',
                    x: loc.x,
                    y: loc.y,
                    button: 'left',
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

                  const textVal = String(field.value ?? field.text ?? '');
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
              if (typeof item.index === 'number') {
                const scrollRes = await executeInPage({ tabId }, 'inPageScrollToIndex', [
                  item.index,
                ]);
                let scrolled = Boolean(scrollRes?.[0]?.result);
                if (!scrolled) {
                  const frameResults = await executeInPage(
                    { tabId, allFrames: true },
                    'inPageScrollToIndex',
                    [item.index],
                  );
                  scrolled = Boolean(frameResults.some((r) => r.result));
                }
                if (!scrolled) {
                  throw new Error(
                    `Element with index [${item.index}] not found for scroll. ${DIAGNOSTIC_REFRESH_GUIDANCE}`,
                  );
                }
                stepOutput = { scrolledIndex: item.index };
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
                const coord = item.coordinate ?? (item as any).coordinates;
                const scrollX = coord?.x ?? 500;
                const scrollY = coord?.y ?? 400;
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
              let actualText = '';
              let isVisible = false;
              if (typeof item.index === 'number') {
                const res = await executeInPage({ tabId }, 'inPageGetElementCoordinates', [
                  item.index,
                ]);
                let coords = res?.[0]?.result;
                if (!coords?.success) {
                  const frameResults = await executeInPage(
                    { tabId, allFrames: true },
                    'inPageGetElementCoordinates',
                    [item.index],
                  );
                  const match = frameResults.find((r) => r.result?.success);
                  if (match?.result) coords = match.result;
                }
                if (coords?.success) {
                  isVisible = true;
                  actualText = String(coords.text ?? coords.value ?? '');
                }
              } else if (item.selector) {
                const selRes = await this.safeExecuteScript(tabId, {
                  target: { tabId },
                  func: (sel: string) => {
                    const el = document.querySelector(sel);
                    if (!el) return { found: false };
                    const rect = el.getBoundingClientRect();
                    const visible =
                      rect.width > 0 &&
                      rect.height > 0 &&
                      window.getComputedStyle(el).visibility !== 'hidden';
                    return {
                      found: true,
                      visible,
                      text: (el as HTMLElement).innerText ?? el.textContent ?? '',
                      value: (el as HTMLInputElement).value ?? '',
                    };
                  },
                  args: [item.selector],
                });
                const data = selRes?.[0]?.result as any;
                if (data?.found) {
                  isVisible = Boolean(data.visible);
                  actualText = String(data.text || data.value || '');
                }
              }

              const condition = item.condition || 'contains';
              const expected = item.expectedText ?? '';
              let passed = false;

              switch (condition) {
                case 'visible':
                  passed = isVisible;
                  break;
                case 'not_visible':
                  passed = !isVisible;
                  break;
                case 'equals':
                  passed = actualText.trim() === expected.trim();
                  break;
                case 'contains':
                default:
                  passed = actualText.includes(expected);
                  break;
              }

              assertions.push({
                actionIndex: i,
                passed,
                condition,
                error: passed
                  ? undefined
                  : `Assertion failed: expected "${expected}" with condition "${condition}", got "${actualText}" (visible=${isVisible})`,
              });

              if (!passed && item.abortOnFailure !== false) {
                throw new Error(
                  `Assertion failed at action ${i}: condition "${condition}" not met for expected "${expected}". Actual: "${actualText}"`,
                );
              }

              stepOutput = { asserted: true, passed, condition, actualText, isVisible };
              break;
            }

            case 'extract': {
              let extractedValue = '';
              const prop = item.property || 'text';
              if (typeof item.index === 'number') {
                const res = await executeInPage({ tabId }, 'inPageGetElementCoordinates', [
                  item.index,
                ]);
                let coords = res?.[0]?.result;
                if (!coords?.success) {
                  const frameResults = await executeInPage(
                    { tabId, allFrames: true },
                    'inPageGetElementCoordinates',
                    [item.index],
                  );
                  const match = frameResults.find((r) => r.result?.success);
                  if (match?.result) coords = match.result;
                }
                if (coords?.success) {
                  extractedValue =
                    prop === 'value' ? String(coords.value ?? '') : String(coords.text ?? '');
                }
              } else if (item.selector) {
                const selRes = await this.safeExecuteScript(tabId, {
                  target: { tabId },
                  func: (sel: string, p: string, attr?: string) => {
                    const el = document.querySelector(sel);
                    if (!el) return '';
                    if (p === 'attribute' && attr) return el.getAttribute(attr) ?? '';
                    if (p === 'value') return (el as HTMLInputElement).value ?? '';
                    return (el as HTMLElement).innerText ?? el.textContent ?? '';
                  },
                  args: [item.selector, prop, item.attributeName || ''],
                });
                extractedValue = String(selRes?.[0]?.result ?? '');
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

          if (item.waitForSettle) {
            const itemSettle = await waitForPageSettle(tabId, { timeoutMs: item.settleTimeoutMs });
            if (typeof stepOutput === 'object' && stepOutput !== null) {
              stepOutput.settle = itemSettle;
            }
          }

          actionResults.push({
            actionIndex: i,
            success: true,
            output: stepOutput,
          });
        } catch (stepErr) {
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

      let batchSettle: any = undefined;
      if (args.waitForSettle) {
        batchSettle = await waitForPageSettle(tabId, { timeoutMs: args.settleTimeoutMs });
      }

      const delta = await captureDeltaIfRequested(tabId, args.includeDelta);

      const totalCompleted = actionResults.filter((r) => r.success).length;
      const batchResult: BatchActionResult & { spaDriftNotice?: string } = {
        success: totalCompleted === actions.length,
        completedActions: totalCompleted,
        totalActions: actions.length,
        results: actionResults,
        interruptedReason,
        settle: batchSettle,
        spaDriftNotice,
        ...(Object.keys(extractedData).length > 0 ? { extractedData } : {}),
        ...(assertions.length > 0 ? { assertions } : {}),
        ...(delta ? { delta } : {}),
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
