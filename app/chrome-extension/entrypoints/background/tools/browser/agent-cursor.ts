/**
 * BrowserClaw Agent Cursor Controller (Background)
 *
 * Coordinates cursor movement animation in the target tab before physical
 * CDP input dispatch. Supports synchronization (waiting for arrival signal
 * within a safe timeout) and graceful fallback when tab is background/throttled.
 */

let globalMoveSequence = 0;
const pendingArrivals = new Map<number, (value?: any) => void>();

// Listen for arrival notifications from content scripts
if (typeof chrome !== 'undefined' && chrome.runtime?.onMessage) {
  chrome.runtime.onMessage.addListener((message) => {
    if (message?.type === 'AGENT_CURSOR_ARRIVED' && typeof message.moveSequence === 'number') {
      const resolver = pendingArrivals.get(message.moveSequence);
      if (resolver) {
        pendingArrivals.delete(message.moveSequence);
        resolver();
      }
    }
  });
}

export interface AnimateCursorOptions {
  waitForArrival?: boolean;
  timeoutMs?: number;
  immediate?: boolean;
}

export async function animateAgentCursor(
  tabId: number,
  x: number,
  y: number,
  options: AnimateCursorOptions = {},
): Promise<void> {
  if (typeof tabId !== 'number' || typeof x !== 'number' || typeof y !== 'number') {
    return;
  }

  const seq = ++globalMoveSequence;
  const timeoutMs = options.timeoutMs ?? 350;
  const shouldWait = options.waitForArrival !== false;

  try {
    // Fire move message to content script
    await chrome.tabs.sendMessage(tabId, {
      type: 'AGENT_CURSOR_MOVE',
      x: Math.round(x),
      y: Math.round(y),
      moveSequence: seq,
      immediate: options.immediate === true,
    });
  } catch {
    // Content script not loaded yet or tab unavailable: continue without blocking
    return;
  }

  if (!shouldWait || options.immediate) {
    return;
  }

  // Await arrival or timeout fallback (prevents hangs in background/throttled tabs)
  await new Promise<void>((resolve) => {
    const timer = setTimeout(() => {
      pendingArrivals.delete(seq);
      resolve();
    }, timeoutMs);

    pendingArrivals.set(seq, () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

export async function hideAgentCursor(tabId: number): Promise<void> {
  try {
    await chrome.tabs.sendMessage(tabId, { type: 'AGENT_CURSOR_HIDE' });
  } catch {}
}
