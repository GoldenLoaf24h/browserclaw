import { describe, it, expect } from 'vitest';
import { TOOL_SCHEMAS } from 'chrome-mcp-shared';

/**
 * Guards the SKILL.md examples against drifting away from the tool schemas.
 *
 * Every entry below is an argument object copied from a runnable SKILL.md
 * example. Six of them previously named parameters that do not exist (ref
 * instead of index, enableGrid instead of grid, clickTargetRef instead of
 * clickTargetIndex, accept instead of action, and a scalar burstClicks), so an
 * agent following the docs hit "Either index or coordinate is required" or a
 * schema rejection on the first call.
 */
const SKILL_EXAMPLES: Array<[string, Record<string, unknown>]> = [
  ['chrome_interact_index', { index: 1, action: 'click' }],
  ['chrome_fill_index', { index: 2, text: 'developer@example.com', clear: true }],
  [
    'chrome_burst_interact',
    { burstClicks: { center: { x: 420, y: 280 }, count: 3, intervalMs: 30 } },
  ],
  ['chrome_screenshot', { grid: true, format: 'webp' }],
  ['chrome_upload_file', { index: 5, filePath: 'D:/data/document.pdf' }],
  ['chrome_upload_file', { clickTargetIndex: 5, filePath: 'D:/data/document.pdf' }],
  ['chrome_handle_dialog', { action: 'accept', promptText: 'confirmation_code' }],
  [
    'chrome_batch_actions',
    {
      actions: [
        { type: 'fill', index: 2, text: 'a@b.com', clear: true },
        { type: 'click', index: 4 },
        { type: 'wait', durationMs: 300 },
      ],
      waitForSettle: true,
    },
  ],
];

describe('SKILL.md parameter examples match the tool schemas', () => {
  const schemas = new Map(TOOL_SCHEMAS.map((t: any) => [t.name, t]));

  it.each(SKILL_EXAMPLES)('%s accepts its documented arguments', (name, args) => {
    const schema = schemas.get(name);
    expect(schema, `${name} must exist in TOOL_SCHEMAS`).toBeTruthy();

    const props = schema!.inputSchema?.properties || {};
    const unknown = Object.keys(args).filter((k) => !(k in props));
    const missing = ((schema!.inputSchema?.required as string[]) || []).filter(
      (k) => !(k in args),
    );

    expect(unknown, `${name} has undocumented params`).toEqual([]);
    expect(missing, `${name} is missing required params`).toEqual([]);
  });

  it('no longer documents the removed parameter names', async () => {
    const fs = await import('node:fs');
    const skill = fs.readFileSync('../../skill/SKILL.md', 'utf-8');

    for (const ghost of ['"ref":', 'enableGrid', 'targetRef', 'clickTargetRef', '"accept":']) {
      expect(skill.includes(ghost), `SKILL.md must not document ${ghost}`).toBe(false);
    }
  });
});
