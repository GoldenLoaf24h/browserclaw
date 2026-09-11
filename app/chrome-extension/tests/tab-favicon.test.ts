import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TabFaviconManager, AGENT_FAVICON_DATA_URL } from '../entrypoints/background/tools/browser/tab-favicon';

describe('TabFaviconManager (Glowing Agent Favicon & Clean Restoration)', () => {
  let manager: TabFaviconManager;
  let executedScriptArgs: any[] = [];

  beforeEach(() => {
    executedScriptArgs = [];
    (globalThis as any).chrome = {
      tabs: {
        get: vi.fn(async (id: number) => ({
          id,
          url: 'https://example.com/dashboard',
          favIconUrl: 'https://example.com/favicon.ico',
        })),
        onRemoved: { addListener: vi.fn() },
      },
      scripting: {
        executeScript: vi.fn(async (opts: any) => {
          executedScriptArgs.push(opts);
          return [{ result: true }];
        }),
      },
    };

    manager = new TabFaviconManager();
  });

  it('records original favicon and injects agent glowing favicon', async () => {
    const ok = await manager.setAgentFavicon(10);
    expect(ok).toBe(true);
    expect(manager.getOriginalFavicon(10)).toBe('https://example.com/favicon.ico');
    expect(executedScriptArgs.length).toBe(1);
    expect(executedScriptArgs[0].args[0]).toBe(AGENT_FAVICON_DATA_URL);
  });

  it('restores original favicon cleanly when automation ends', async () => {
    await manager.setAgentFavicon(10);
    const restored = await manager.restoreFavicon(10);
    expect(restored).toBe(true);
    expect(manager.getOriginalFavicon(10)).toBeUndefined();
    expect(executedScriptArgs.length).toBe(2);
    expect(executedScriptArgs[1].args[0]).toBe('https://example.com/favicon.ico');
  });

  it('safely skips restricted chrome:// URLs', async () => {
    (chrome.tabs.get as any).mockResolvedValueOnce({
      id: 20,
      url: 'chrome://settings',
      favIconUrl: undefined,
    });

    const ok = await manager.setAgentFavicon(20);
    expect(ok).toBe(false);
    expect(manager.getOriginalFavicon(20)).toBeUndefined();
    expect(executedScriptArgs.length).toBe(0);
  });
});
