import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ActionHistoryManager } from '../utils/action-history-manager';
import { UndoLastActionTool } from '../entrypoints/background/tools/browser/undo-action';

describe('UndoAction (History Manager & Rollback Execution)', () => {
  let historyManager: ActionHistoryManager;
  let tool: UndoLastActionTool;

  beforeEach(() => {
    historyManager = ActionHistoryManager.getInstance();
    historyManager.clear();
    tool = new UndoLastActionTool();

    (globalThis as any).chrome = {
      tabs: {
        get: vi.fn(async (id: number) => ({ id, windowId: 1 })),
        query: vi.fn(async () => [{ id: 1, active: true, windowId: 1 }]),
        goBack: vi.fn(async () => {}),
      },
      scripting: {
        executeScript: vi.fn(async () => [{ result: { success: true, restoredValue: 'original' } }]),
      },
    };
  });

  it('maintains bounded stack and pops most recent action', () => {
    for (let i = 1; i <= 7; i++) {
      historyManager.pushAction(1, { type: 'navigate', prevUrl: 'https://site.com/' + i, timestamp: i });
    }
    const last = historyManager.popAction(1);
    expect(last?.type).toBe('navigate');
    expect((last as any).prevUrl).toBe('https://site.com/7');
  });

  it('reverts navigate actions via tabs.goBack', async () => {
    historyManager.pushAction(1, {
      type: 'navigate',
      prevUrl: 'https://example.com/step1',
      timestamp: Date.now(),
    });

    const res = await tool.execute({ tabId: 1 });
    expect(res.isError).toBe(false);
    expect(chrome.tabs.goBack).toHaveBeenCalledWith(1);
    const parsed = JSON.parse((res.content[0] as any).text);
    expect(parsed.revertedAction).toBe('navigate');
  });

  it('restores input values for fill actions', async () => {
    historyManager.pushAction(1, {
      type: 'fill',
      index: 3,
      prevValue: 'hello-previous',
      timestamp: Date.now(),
    });

    const res = await tool.execute({ tabId: 1 });
    expect(res.isError).toBe(false);
    const parsed = JSON.parse((res.content[0] as any).text);
    expect(parsed.revertedAction).toBe('fill');
    expect(parsed.restoredValue).toBe('hello-previous');
  });

  it('returns friendly error when no action history exists', async () => {
    const res = await tool.execute({ tabId: 1 });
    expect(res.isError).toBe(true);
    expect((res.content[0] as any).text).toContain('No undoable action recorded');
  });
});
