import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CdpExecuteTool } from '../entrypoints/background/tools/browser/cdp-execute';
import { cdpSessionManager } from '@/utils/cdp-session-manager';

describe('CdpExecuteTool (Raw CDP Pass-Through Channel)', () => {
  let tool: CdpExecuteTool;

  beforeEach(() => {
    tool = new CdpExecuteTool();
    (globalThis as any).chrome = {
      tabs: {
        get: vi.fn(async (id: number) => ({ id, windowId: 1 })),
        query: vi.fn(async () => [{ id: 1, active: true, windowId: 1 }]),
      },
    };
  });

  it('rejects calls without method', async () => {
    const res = await tool.execute({ method: '' } as any);
    expect(res.isError).toBe(true);
    expect((res.content[0] as any).text).toContain('method is required');
  });

  it('successfully delegates command to cdpSessionManager', async () => {
    vi.spyOn(cdpSessionManager, 'sendCommand').mockResolvedValueOnce({
      windowId: 42,
      bounds: { left: 0, top: 0, width: 1280, height: 800 },
    });

    const res = await tool.execute({
      tabId: 1,
      method: 'Browser.getWindowForTarget',
      params: {},
    });

    expect(res.isError).toBe(false);
    const parsed = JSON.parse((res.content[0] as any).text);
    expect(parsed.success).toBe(true);
    expect(parsed.method).toBe('Browser.getWindowForTarget');
    expect(parsed.result.windowId).toBe(42);
  });

  it('handles CDP command timeouts properly', async () => {
    vi.spyOn(cdpSessionManager, 'sendCommand').mockImplementationOnce(
      () => new Promise((resolve) => setTimeout(resolve, 500)),
    );

    const res = await tool.execute({
      tabId: 1,
      method: 'Page.navigate',
      params: { url: 'https://example.com' },
      timeoutMs: 50, // fast timeout
    });

    expect(res.isError).toBe(true);
    expect((res.content[0] as any).text).toContain('timed out after 50ms');
  });
});
