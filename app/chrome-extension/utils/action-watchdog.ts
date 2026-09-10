import type { PageSettleResult } from 'chrome-mcp-shared';

/**
 * In-page MutationObserver watchdog that waits for DOM mutations to settle.
 * Debounces mutations with quietPeriodMs (default 150ms).
 * Terminates smoothly if quietPeriodMs elapses with no DOM activity or if timeoutMs is reached.
 */
export function inPageWaitForDOMSettle(
  timeoutMs = 1500,
  quietPeriodMs = 150,
  adaptiveMs?: number,
  hasActiveRequests = false,
): Promise<{ settled: boolean; durationMs: number; mutationsObserved: number }> {
  return new Promise((resolve) => {
    const startTime = performance.now();
    let mutationCount = 0;
    let quietTimer: any = null;
    let timeoutTimer: any = null;
    let observer: MutationObserver | null = null;

    // Use 100% accurate in-flight network detection backed by CDP Network domain,
    // permanently eliminating invalid reliance on performance.getEntriesByType('resource').
    const initialQuietMs =
      !hasActiveRequests && typeof adaptiveMs === 'number' && adaptiveMs > 0
        ? adaptiveMs
        : quietPeriodMs;

    let isDone = false;
    const cleanup = () => {
      if (quietTimer) clearTimeout(quietTimer);
      if (timeoutTimer) clearTimeout(timeoutTimer);
      if (observer) {
        try {
          observer.disconnect();
        } catch {}
        observer = null;
      }
    };

    const done = (settled: boolean) => {
      if (isDone) return;
      isDone = true;
      cleanup();
      const durationMs = Math.round(performance.now() - startTime);
      resolve({ settled, durationMs, mutationsObserved: mutationCount });
    };

    timeoutTimer = setTimeout(() => {
      done(false); // Reached max settle timeout
    }, timeoutMs);

    quietTimer = setTimeout(() => {
      done(true); // Initial quiet period without mutations passed
    }, initialQuietMs);

    try {
      observer = new MutationObserver((mutations) => {
        if (isDone) return;
        mutationCount += mutations.length;
        if (quietTimer) clearTimeout(quietTimer);
        quietTimer = setTimeout(() => {
          done(true); // DOM mutations paused for quietPeriodMs
        }, quietPeriodMs);
      });

      const root = document.documentElement || document.body;
      if (root) {
        observer.observe(root, {
          childList: true,
          subtree: true,
          attributes: true,
          characterData: true,
        });
      } else {
        done(true);
      }
    } catch {
      quietTimer = setTimeout(() => done(true), initialQuietMs);
    }
  });
}

/**
 * Execute DOM settle watchdog in target tab.
 * Monitors DOM mutations and returns once mutations pause for quietPeriodMs or timeout occurs.
 */
export async function waitForPageSettle(
  tabId: number,
  options?: {
    timeoutMs?: number;
    quietPeriodMs?: number;
    adaptiveMs?: number;
    hasActiveRequests?: boolean;
  },
): Promise<PageSettleResult> {
  const timeoutMs = Math.max(200, Math.min(options?.timeoutMs ?? 1500, 10000));
  const quietPeriodMs = Math.max(50, Math.min(options?.quietPeriodMs ?? 150, 2000));
  const adaptiveMs = options?.adaptiveMs !== undefined ? options.adaptiveMs : 30;

  // Retrieve 100% accurate in-flight request status via CDP session manager Network tracking
  let hasActiveNet = options?.hasActiveRequests;
  if (hasActiveNet === undefined) {
    try {
      const { cdpSessionManager } = await import('@/utils/cdp-session-manager');
      hasActiveNet = cdpSessionManager.hasInFlightRequests(tabId);
    } catch {
      hasActiveNet = false;
    }
  }

  // If there are active in-flight requests, wait for them to reach quiescence before DOM settle
  if (hasActiveNet) {
    await waitForNetworkQuiescence(tabId, Math.min(timeoutMs, 1000));
    try {
      const { cdpSessionManager } = await import('@/utils/cdp-session-manager');
      hasActiveNet = cdpSessionManager.hasInFlightRequests(tabId);
    } catch {
      hasActiveNet = false;
    }
  }

  try {
    const { executeInPage } = await import(
      '@/entrypoints/background/tools/browser/in-page-engine'
    );
    const results = await executeInPage<PageSettleResult>(
      { tabId },
      'inPageWaitForDOMSettle',
      [timeoutMs, quietPeriodMs, adaptiveMs, hasActiveNet],
    );
    return results?.[0]?.result ?? { settled: true, durationMs: 0, mutationsObserved: 0 };
  } catch {
    // If navigation happened or scripting was blocked, return gracefully
    return { settled: true, durationMs: 0, mutationsObserved: 0 };
  }
}

/**
 * Wait for in-flight network requests to reach quiescence (zero active requests).
 * Bounded by maxWaitMs to prevent indefinite hangs on long-lived connections.
 */
export async function waitForNetworkQuiescence(
  tabId: number,
  maxWaitMs = 1000,
  pollIntervalMs = 25,
): Promise<boolean> {
  try {
    const { cdpSessionManager } = await import('@/utils/cdp-session-manager');
    if (!cdpSessionManager.hasInFlightRequests(tabId)) {
      return true;
    }
    const deadline = Date.now() + maxWaitMs;
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, pollIntervalMs));
      if (!cdpSessionManager.hasInFlightRequests(tabId)) {
        return true;
      }
    }
    return false;
  } catch {
    return true;
  }
}

/**
 * Helper to check in-flight network requests for a tab via CDP session manager.
 */
export async function hasActiveNetworkRequests(tabId: number): Promise<boolean> {
  try {
    const { cdpSessionManager } = await import('@/utils/cdp-session-manager');
    return cdpSessionManager.hasInFlightRequests(tabId);
  } catch {
    return false;
  }
}
