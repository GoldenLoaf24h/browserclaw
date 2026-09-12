import { describe, it, expect, vi, beforeEach } from 'vitest';
import { animateAgentCursor, hideAgentCursor } from '../entrypoints/background/tools/browser/agent-cursor';
import fs from 'node:fs';
import path from 'node:path';

describe('Agent Cursor (Virtual Mouse) Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('verifies cursor asset cursor-chat.png exists and has valid PNG header', () => {
    const assetPath = path.resolve(__dirname, '../public/images/cursor-chat.png');
    expect(fs.existsSync(assetPath)).toBe(true);

    const buf = fs.readFileSync(assetPath);
    // PNG signature: 89 50 4E 47 0D 0A 1A 0A
    expect(buf[0]).toBe(0x89);
    expect(buf[1]).toBe(0x50);
    expect(buf[2]).toBe(0x4e);
    expect(buf[3]).toBe(0x47);
    expect(buf.length).toBeGreaterThan(1000);
  });

  it('sends AGENT_CURSOR_MOVE with expected coordinates and sequence', async () => {
    let sentMessage: any = null;
    (globalThis as any).chrome = {
      runtime: {
        onMessage: { addListener: vi.fn() },
      },
      tabs: {
        sendMessage: vi.fn().mockImplementation(async (_tabId, msg) => {
          sentMessage = msg;
          return { ok: true };
        }),
      },
    };

    // Animate with immediate: true to skip wait
    await animateAgentCursor(101, 350, 420, { immediate: true });

    expect(sentMessage).toBeTruthy();
    expect(sentMessage.type).toBe('AGENT_CURSOR_MOVE');
    expect(sentMessage.x).toBe(350);
    expect(sentMessage.y).toBe(420);
    expect(typeof sentMessage.moveSequence).toBe('number');
  });

  it('safely handles timeouts without throwing when waiting for arrival', async () => {
    (globalThis as any).chrome = {
      runtime: {
        onMessage: { addListener: vi.fn() },
      },
      tabs: {
        sendMessage: vi.fn().mockResolvedValue({ ok: true }),
      },
    };

    const start = Date.now();
    // Wait with a short 50ms timeout
    await animateAgentCursor(102, 100, 200, { waitForArrival: true, timeoutMs: 50 });
    const elapsed = Date.now() - start;

    expect(elapsed).toBeGreaterThanOrEqual(40);
  });

  it('sends AGENT_CURSOR_HIDE on hideAgentCursor', async () => {
    let sentMessage: any = null;
    (globalThis as any).chrome = {
      runtime: {
        onMessage: { addListener: vi.fn() },
      },
      tabs: {
        sendMessage: vi.fn().mockImplementation(async (_tabId, msg) => {
          sentMessage = msg;
          return { ok: true };
        }),
      },
    };

    await hideAgentCursor(103);
    expect(sentMessage).toBeTruthy();
    expect(sentMessage.type).toBe('AGENT_CURSOR_HIDE');
  });

  it('verifies content script initializes cursor with strict hidden state', () => {
    const contentScriptPath = path.resolve(__dirname, '../entrypoints/agent-cursor.content.ts');
    const source = fs.readFileSync(contentScriptPath, 'utf-8');
    
    // Verify cursorContainer is styled hidden and opacity 0 on mount
    expect(source).toContain("cursorContainer.style.opacity = '0'");
    expect(source).toContain("cursorContainer.style.visibility = 'hidden'");
    // Verify renderCursor hides cursor when vis <= 0.001
    expect(source).toContain('if (vis <= 0.001)');
    // Verify initial call to renderCursor()
    expect(source).toContain('renderCursor();');
  });
});
