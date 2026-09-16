import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  TabFaviconManager,
  AGENT_FAVICON_DATA_URL,
} from '../entrypoints/background/tools/browser/tab-favicon';

describe('TabFaviconManager (Glowing Agent Favicon & Clean Restoration)', () => {
  let manager: TabFaviconManager;
  let executedScriptArgs: any[] = [];

  beforeEach(() => {
    executedScriptArgs = [];
    (globalThis as any).chrome = (globalThis as any).chrome || {};
    (globalThis as any).chrome.tabs = (globalThis as any).chrome.tabs || {};
    (globalThis as any).chrome.tabs.get = vi.fn(async (id: number) => ({
      id,
      url: 'https://example.com/dashboard',
      favIconUrl: 'https://example.com/favicon.ico',
    }));
    if (!(globalThis as any).chrome.tabs.onRemoved) {
      (globalThis as any).chrome.tabs.onRemoved = { addListener: vi.fn(), removeListener: vi.fn() };
    }
    if (!(globalThis as any).chrome.tabs.onCreated) {
      (globalThis as any).chrome.tabs.onCreated = { addListener: vi.fn(), removeListener: vi.fn() };
    }
    if (!(globalThis as any).chrome.tabs.onUpdated) {
      (globalThis as any).chrome.tabs.onUpdated = { addListener: vi.fn(), removeListener: vi.fn() };
    }
    (globalThis as any).chrome.scripting = {
      executeScript: vi.fn(async (opts: any) => {
        executedScriptArgs.push(opts);
        return [{ result: true }];
      }),
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

  it('tracks active tab through markTabActive and handleCallTool JSON parsing', async () => {
    const markSpy = vi.spyOn(manager, 'markTabActive');
    manager.markTabActive(77);
    expect(markSpy).toHaveBeenCalledWith(77);

    // Verify handleCallTool logic:
    const { handleCallTool } = await import('../entrypoints/background/tools/index');
    const { tabFaviconManager } =
      await import('../entrypoints/background/tools/browser/tab-favicon');
    const globalSpy = vi.spyOn(tabFaviconManager, 'markTabActive');

    (chrome.tabs as any).query = vi
      .fn()
      .mockResolvedValue([{ id: 42, url: 'https://example.com' }]);
    (chrome.tabs as any).get = vi.fn().mockResolvedValue({ id: 42, url: 'https://example.com' });
    (chrome.tabs as any).update = vi.fn().mockResolvedValue({ id: 42, url: 'https://example.com' });

    await handleCallTool({
      name: 'chrome_navigate',
      args: { url: 'https://example.com' },
    });

    expect(globalSpy).toHaveBeenCalledWith(42);
  });
});
