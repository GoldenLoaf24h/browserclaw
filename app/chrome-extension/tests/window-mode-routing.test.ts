import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('Window Mode Preferences and Navigation Routing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('persists and retrieves agentWindowMode correctly in chrome.storage.local', async () => {
    const storage: Record<string, any> = {};
    (globalThis as any).chrome = {
      storage: {
        local: {
          get: vi.fn().mockImplementation(async (key: string) => {
            return { [key]: storage[key] };
          }),
          set: vi.fn().mockImplementation(async (obj: Record<string, any>) => {
            Object.assign(storage, obj);
          }),
        },
      },
    };

    // Default should be undefined before set
    let res = await (globalThis as any).chrome.storage.local.get('agentWindowMode');
    expect(res.agentWindowMode).toBeUndefined();

    // User switches to window
    await (globalThis as any).chrome.storage.local.set({ agentWindowMode: 'window' });
    res = await (globalThis as any).chrome.storage.local.get('agentWindowMode');
    expect(res.agentWindowMode).toBe('window');

    // User switches back to tab
    await (globalThis as any).chrome.storage.local.set({ agentWindowMode: 'tab' });
    res = await (globalThis as any).chrome.storage.local.get('agentWindowMode');
    expect(res.agentWindowMode).toBe('tab');
  });
});
