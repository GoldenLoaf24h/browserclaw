import { describe, it, expect, beforeEach, vi } from 'vitest';
import { HumanInterventionTool } from '../entrypoints/background/tools/browser/human-intervention';

describe('HumanInterventionTool (Human-in-the-Loop Barrier Solver)', () => {
  let tool: HumanInterventionTool;

  beforeEach(() => {
    tool = new HumanInterventionTool();
    (globalThis as any).chrome = {
      tabs: {
        get: vi.fn(async (id: number) => ({ id, windowId: 1 })),
        query: vi.fn(async () => [{ id: 1, active: true, windowId: 1 }]),
        sendMessage: vi.fn(),
      },
    };
  });

  it('rejects calls without reason', async () => {
    const res = await tool.execute({ reason: '' } as any);
    expect(res.isError).toBe(true);
    expect((res.content[0] as any).text).toContain('reason is required');
  });

  it('dispatches banner request and resolves cleanly on user completion', async () => {
    (chrome.tabs.sendMessage as any).mockResolvedValueOnce({
      ok: true,
      action: 'completed_by_user',
    });

    const res = await tool.execute({
      tabId: 1,
      reason: '请在页面上输入短信验证码',
    });

    expect(res.isError).toBe(false);
    const parsed = JSON.parse((res.content[0] as any).text);
    expect(parsed.success).toBe(true);
    expect(parsed.resolved).toBe(true);
    expect(parsed.action).toBe('completed_by_user');
  });

  it('handles timeout when user does not intervene within deadline', async () => {
    (chrome.tabs.sendMessage as any).mockImplementationOnce(
      () => new Promise((resolve) => setTimeout(resolve, 500)),
    );

    const res = await tool.execute({
      tabId: 1,
      reason: '滑块验证',
      timeoutMs: 40, // fast timeout for test
    });

    expect(res.isError).toBe(true);
    expect((res.content[0] as any).text).toContain('timed out');
  });
});
