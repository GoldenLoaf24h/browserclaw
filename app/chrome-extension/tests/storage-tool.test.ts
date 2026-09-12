import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TOOL_NAMES, TOOL_SCHEMAS, TOOL_NAME_TO_CATEGORY } from 'chrome-mcp-shared';
import { storageTool } from '../entrypoints/background/tools/browser/storage';

/**
 * chrome_storage reads Web Storage via an injected function and cookies via
 * chrome.cookies (which is the only way to see HttpOnly cookies).
 */
function mockTab(url = 'https://app.test/dashboard') {
  (storageTool as any).resolveAffinityTab = async () => ({ id: 7, url, title: 'App' });
}

function readPayload(res: any) {
  return JSON.parse(res.content[0].text as string);
}

describe('chrome_storage', () => {
  const prevChrome = (globalThis as any).chrome;

  beforeEach(() => {
    mockTab();
    (globalThis as any).chrome = {
      ...prevChrome,
      cookies: {
        getAll: vi.fn().mockResolvedValue([
          {
            name: 'sid',
            value: 'abc',
            domain: '.app.test',
            path: '/',
            secure: true,
            httpOnly: true,
            sameSite: 'lax',
            session: true,
          },
          {
            name: 'theme',
            value: 'dark',
            domain: '.app.test',
            path: '/',
            secure: false,
            httpOnly: false,
            sameSite: 'lax',
            session: false,
            expirationDate: 1900000000,
          },
        ]),
      },
    };
  });

  afterEach(() => {
    (globalThis as any).chrome = prevChrome;
    vi.restoreAllMocks();
  });

  it('is registered in the schema and maps to diagnose category', () => {
    expect(TOOL_NAMES.BROWSER.STORAGE).toBe('chrome_storage');
    expect(TOOL_SCHEMAS.some((t: any) => t.name === 'chrome_storage')).toBe(true);
    expect(TOOL_NAME_TO_CATEGORY['chrome_storage']).toBe('diagnose');
  });

  it('returns HttpOnly cookies that document.cookie cannot see', async () => {
    (storageTool as any).safeExecuteScript = async () => [
      {
        result: {
          localStorage: { available: true, entries: [{ key: 'token', value: 't1' }], total: 1 },
          sessionStorage: { available: true, entries: [], total: 0 },
        },
      },
    ];

    const payload = readPayload(await storageTool.execute({}));

    expect(payload.cookies.total).toBe(2);
    const sid = payload.cookies.entries.find((c: any) => c.name === 'sid');
    expect(sid.httpOnly).toBe(true);
    expect(sid.secure).toBe(true);
    expect(payload.localStorage.entries[0]).toEqual({ key: 'token', value: 't1' });
  });

  it('drops HttpOnly cookies when includeHttpOnly is false', async () => {
    (storageTool as any).safeExecuteScript = async () => [{ result: {} }];

    const payload = readPayload(
      await storageTool.execute({ types: ['cookies'], includeHttpOnly: false }),
    );

    expect(payload.cookies.entries.map((c: any) => c.name)).toEqual(['theme']);
  });

  it('applies the filter to cookies by name or value', async () => {
    (storageTool as any).safeExecuteScript = async () => [{ result: {} }];

    const payload = readPayload(await storageTool.execute({ types: ['cookies'], filter: 'dark' }));

    expect(payload.cookies.entries.map((c: any) => c.name)).toEqual(['theme']);
  });

  it('does not leak HttpOnly cookie values through filter oracle', async () => {
    (storageTool as any).safeExecuteScript = async () => [{ result: {} }];

    // 'abc' is the value of 'sid' which has httpOnly: true
    const payload = readPayload(await storageTool.execute({ types: ['cookies'], filter: 'abc' }));

    expect(payload.cookies.entries.map((c: any) => c.name)).toEqual([]);
  });

  it('only reads the stores requested', async () => {
    const spy = vi
      .fn()
      .mockResolvedValue([
        { result: { localStorage: { available: true, entries: [], total: 0 } } },
      ]);
    (storageTool as any).safeExecuteScript = spy;

    const payload = readPayload(await storageTool.execute({ types: ['localStorage'] }));

    expect(spy).toHaveBeenCalledTimes(1);
    expect(payload.cookies).toBeUndefined();
    expect(payload.sessionStorage).toBeUndefined();
  });
});
