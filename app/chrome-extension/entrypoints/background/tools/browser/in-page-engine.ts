/**
 * Dispatcher for in-page entrypoints registered by entrypoints/inpage-engine.ts.
 *
 * chrome.scripting.executeScript({ func }) serializes only the function body,
 * so in-page entrypoints that reference module-scope helpers crash with
 * ReferenceError in the page's isolated world. Instead, we inject the bundled
 * inpage-engine script (registers every entrypoint on globalThis.__MCP_INPAGE__)
 * and invoke the requested entrypoint by name with self-contained dispatchers.
 *
 * Chrome (verified on 150) does NOT await a Promise returned by an injected
 * async func: the InjectionResult.result silently becomes undefined. So every
 * dispatcher below is synchronous, and async entrypoints run via a
 * start -> poll -> retrieve protocol backed by a per-call box on globalThis.
 *
 * If the engine file is missing, the file injection rejects loudly instead of
 * silently returning undefined inside the page.
 */

import { isRestrictedChromeUrl, restrictedUrlErrorMessage } from '../../../../utils/restricted-url';

const INPAGE_NAMESPACE = '__MCP_INPAGE__';
const EXECUTE_TIMEOUT_MS = 15_000;
let callSequence = 0;

/**
 * chrome.scripting.executeScript itself can hang forever when the renderer is
 * blocked (e.g. a native dialog is open). Wrap every injection with a timeout
 * so the tool surfaces a structured error instead of deadlocking.
 */
async function raceInjection<T>(p: Promise<T>, what: string, ms = EXECUTE_TIMEOUT_MS): Promise<T> {
  let timer: any;
  try {
    return await Promise.race([
      p,
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () =>
            reject(
              new Error(
                `executeScript timeout (${what}, ${ms}ms): renderer not acking — a native dialog may be open, call chrome_handle_dialog first`,
              ),
            ),
          ms,
        );
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

export async function executeInPage<R = any>(
  target: chrome.scripting.InjectionTarget,
  fnName: string,
  args: unknown[],
): Promise<chrome.scripting.InjectionResult<R>[]> {
  // Reject browser internal / web store pages up front so read_dom,
  // interact_index, batch_actions, etc. return a friendly error instead of the
  // raw "Cannot access a chrome:// URL" exception.
  if (typeof target.tabId === 'number') {
    const tab = await chrome.tabs.get(target.tabId).catch(() => null);
    if (isRestrictedChromeUrl(tab?.url)) {
      throw new Error(restrictedUrlErrorMessage(tab?.url));
    }
  }

  await raceInjection(chrome.scripting.executeScript({ target, files: ['inpage-engine.js'] }), 'injection');

  const slot = `__MCP_CALL_${++callSequence}`;

  // 1) Start: launch the entrypoint synchronously, stash its promise in a box.
  const startResults = (await raceInjection(chrome.scripting.executeScript({
    target,
    func: (ns: string, name: string, fnArgs: unknown[], slotKey: string) => {
      const g = globalThis as any;
      const engine = g[ns];
      const fn = engine ? engine[name] : undefined;
      const box: {
        promise?: unknown;
        settled: boolean;
        listening?: boolean;
        value?: unknown;
        error?: string;
      } = {
        promise: undefined,
        settled: false,
        listening: false,
        value: undefined,
        error: undefined,
      };
      g[slotKey] = box;
      try {
        box.promise = typeof fn === 'function' ? fn.call(engine, ...fnArgs) : undefined;
      } catch (err) {
        box.settled = true;
        box.error = String(err instanceof Error ? `${err.message}\n${err.stack ?? ''}` : err);
      }
      return {
        engineType: typeof engine,
        fnType: typeof fn,
        promiseType: typeof box.promise,
      };
    },
    args: [INPAGE_NAMESPACE, fnName, args, slot],
  }), 'start')) as unknown as chrome.scripting.InjectionResult<{
    engineType: string;
    fnType: string;
    promiseType: string;
  }>[];

  for (const r of startResults ?? []) {
    const info = r?.result;
    if (!info || info.engineType !== 'object' || info.fnType !== 'function') {
      throw new Error(
        `In-page engine ${fnName} unavailable: ${info ? `engine=${info.engineType} fn=${info.fnType}` : 'no injection result'}`,
      );
    }
  }

  // 2) Poll: attach settle callbacks; every dispatcher stays synchronous.
  const deadline = Date.now() + EXECUTE_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const pollResults = (await raceInjection(chrome.scripting.executeScript({
      target,
      func: (slotKey: string) => {
        const box = (globalThis as any)[slotKey];
        if (!box) return { done: true, missing: true };
        if (box.settled) return { done: true };
        const promise = box.promise;
        if (promise && typeof promise.then === 'function') {
          if (box.listening) return { done: false };
          box.listening = true;
          promise.then(
            (value: unknown) => {
              box.value = value;
              box.settled = true;
            },
            (err: unknown) => {
              box.error = String(
                err instanceof Error ? `${err.message}\n${err.stack ?? ''}` : err,
              );
              box.settled = true;
            },
          );
          return { done: false };
        }
        box.value = promise;
        box.settled = true;
        return { done: true };
      },
        args: [slot],
      }), 'poll')) as unknown as chrome.scripting.InjectionResult<{ done: boolean }>[];

    if ((pollResults ?? []).every((r) => r?.result?.done)) break;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }

  // 3) Retrieve: collect settled values and clean the box up.
  const results = (await raceInjection(chrome.scripting.executeScript({
    target,
    func: (slotKey: string) => {
      const g = globalThis as any;
      const box = g[slotKey];
      delete g[slotKey];
      // A frame can navigate away between start and retrieve - drop it
      // silently; real engine-missing cases already fail at the start step.
      if (!box) return undefined;
      if (!box.settled) return { __mcpInpageError: 'timeout: entrypoint did not settle in 15s' };
      if (box.error !== undefined) return { __mcpInpageError: box.error };
      return box.value === undefined ? { __mcpInpageReturn: 'undefined' } : box.value;
    },
      args: [slot],
    }), 'retrieve')) as unknown as chrome.scripting.InjectionResult<R>[];

  for (const r of results ?? []) {
    const marker = r?.result as
      | { __mcpInpageError?: string; __mcpInpageReturn?: string }
      | null
      | undefined;
    if (marker?.__mcpInpageError) {
      throw new Error(`In-page engine ${fnName} failed: ${marker.__mcpInpageError}`);
    }
    if (marker?.__mcpInpageReturn === 'undefined') {
      throw new Error(`In-page engine ${fnName} returned undefined`);
    }
  }
  return results;
}
