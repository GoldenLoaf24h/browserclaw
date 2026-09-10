import { screenshotContextManager } from './screenshot-context';

function hostnameOf(url: string | undefined): string {
  try {
    return new URL(url || '').hostname;
  } catch {
    return '';
  }
}

/**
 * Guard: the most recent screenshot for this tab must be from the same
 * origin the agent is about to act on, otherwise screenshot-space
 * coordinates would map onto a foreign page. Returns an error message when
 * the check fails, or null when it passes.
 */
export function screenshotOriginViolation(
  tabId: number,
  tabUrl: string | undefined,
  action: string,
): string | null {
  const ctx = screenshotContextManager.getContext(tabId);
  const contextHostname = ctx?.hostname;
  const currentHostname = hostnameOf(tabUrl);
  if (contextHostname && contextHostname !== currentHostname) {
    return `Security check failed: Domain changed since last screenshot (from ${contextHostname} to ${currentHostname}) during ${action}. Capture a new screenshot or use ref/selector.`;
  }
  return null;
}

/** Optional down-up dwell between press and release (anti-instant-click targets). */
export function dwell(ms: number | undefined): Promise<void> {
  if (!ms || ms <= 0) return Promise.resolve();
  return new Promise((r) => setTimeout(r, Math.min(ms, 2000)));
}
