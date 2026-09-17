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

  ['chrome_fill_index', { index: 2, text: 'developer@example.com', clear: true, pressEnter: true }],
  ['chrome_screenshot', { grid: true, format: 'webp' }],
  ['chrome_upload_file', { index: 5, filePath: 'D:/data/document.pdf' }],
  ['chrome_upload_file', { clickTargetIndex: 5, filePath: 'D:/data/document.pdf' }],
  ['chrome_handle_dialog', { action: 'accept', promptText: 'confirmation_code' }],
  [
    'chrome_batch_actions',
    {
      actions: [
        { type: 'fill', index: 2, text: 'a@b.com', clear: true, pressEnter: true },
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

  it('verifies mcp-config.json autoApprove contains only valid canonical tools', async () => {
    const fs = await import('node:fs');
    const config = JSON.parse(fs.readFileSync('../../skill/config/mcp-config.json', 'utf-8'));
    const autoApprove: string[] = config.configurations.cline_and_roo_code.config.mcpServers.browserclaw.autoApprove;
    for (const tool of autoApprove) {
      expect(schemas.has(tool), `autoApprove tool "${tool}" must exist in canonical TOOL_SCHEMAS`).toBe(true);
    }
  });

  it('verifies user installed skills are synchronized with canonical skill', async () => {
    const fs = await import('node:fs');
    const crypto = await import('node:crypto');
    const canonical = fs.readFileSync('../../skill/SKILL.md', 'utf-8');
    const localPath = 'C:/Users/Lenovo/.gemini/config/skills/browserclaw/SKILL.md'; if (!fs.existsSync(localPath)) return; const installedBrowserclaw = fs.readFileSync(localPath, 'utf-8');

    expect(installedBrowserclaw).toBe(canonical);

    // Verify .browserclaw-managed.json hash matches installed SKILL.md
    const managedBc = JSON.parse(fs.readFileSync('C:/Users/Lenovo/.gemini/config/skills/browserclaw/.browserclaw-managed.json', 'utf-8'));
    const actualBcHash = crypto.createHash('sha256').update(installedBrowserclaw).digest('hex');
    expect(managedBc.contentHash).toBe(actualBcHash);

    // Verify mcp-chrome skill is also aligned (except name: mcp-chrome)
    const installedMcpChrome = fs.readFileSync('C:/Users/Lenovo/.gemini/config/skills/mcp-chrome/SKILL.md', 'utf-8');
    expect(installedMcpChrome).toBe(canonical.replace(/^name:\s*browserclaw/m, 'name: mcp-chrome'));
    const managedMc = JSON.parse(fs.readFileSync('C:/Users/Lenovo/.gemini/config/skills/mcp-chrome/.browserclaw-managed.json', 'utf-8'));
    const actualMcHash = crypto.createHash('sha256').update(installedMcpChrome).digest('hex');
    expect(managedMc.contentHash).toBe(actualMcHash);
  });
});

