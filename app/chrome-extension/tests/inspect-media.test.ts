import { describe, it, expect, beforeEach, vi } from 'vitest';
import { InspectMediaTool } from '../entrypoints/background/tools/browser/inspect-media';
import { screenshotTool } from '../entrypoints/background/tools/browser/screenshot';

describe('InspectMediaTool (High-Fidelity Media Extraction)', () => {
  let tool: InspectMediaTool;

  beforeEach(() => {
    tool = new InspectMediaTool();
    (globalThis as any).chrome = {
      tabs: {
        get: vi.fn(async (id: number) => ({ id, windowId: 1, url: 'https://example.com' })),
        query: vi.fn(async () => [{ id: 1, active: true, windowId: 1, url: 'https://example.com' }]),
      },
      scripting: {
        executeScript: vi.fn(),
      },
    };
  });

  it('rejects calls without index or selector', async () => {
    const res = await tool.execute({} as any);
    expect(res.isError).toBe(true);
    expect((res.content[0] as any).text).toContain('must be provided');
  });

  it('returns lossless in-memory image when canvas/img is directly extractable', async () => {
    (chrome.scripting.executeScript as any).mockResolvedValueOnce([
      {
        result: {
          found: true,
          method: 'in-memory-canvas',
          tag: 'canvas',
          width: 200,
          height: 80,
          dataUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
        },
      },
    ]);

    const res = await tool.execute({ tabId: 1, index: 5 });
    expect(res.isError).toBe(false);
    const parsed = JSON.parse((res.content[0] as any).text);
    expect(parsed.success).toBe(true);
    expect(parsed.extractionTrack).toBe('in-memory-canvas');
    expect(res.content[1].type).toBe('image');
  });

  it('falls back to super-sampled screenshot crop when in-memory extraction cannot read pixels', async () => {
    (chrome.scripting.executeScript as any).mockResolvedValueOnce([
      { result: { found: true, method: 'requires-crop', tag: 'div', rect: { x: 10, y: 10, width: 100, height: 40 } } },
    ]);

    vi.spyOn(screenshotTool, 'execute').mockResolvedValueOnce({
      content: [
        { type: 'text', text: JSON.stringify({ success: true }) },
        { type: 'image', data: 'fakebase64', mimeType: 'image/png' },
      ],
      isError: false,
    });

    const res = await tool.execute({ tabId: 1, index: 12, zoom: 2.5 });
    expect(res.isError).toBe(false);
    const parsed = JSON.parse((res.content[0] as any).text);
    expect(parsed.extractionTrack).toBe('super-sampled-crop');
    expect(parsed.zoom).toBe(2.5);
  });
});
