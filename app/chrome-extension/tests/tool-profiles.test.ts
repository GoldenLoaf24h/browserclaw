import { describe, it, expect } from 'vitest';
import {
  CORE_TOOL_NAMES,
  CRAWL_TOOL_NAMES,
  filterToolSchemas,
  profileBlockedMessage,
  resolveToolProfile,
  TOOL_SCHEMAS,
} from 'chrome-mcp-shared';

/**
 * The 44-tool list costs ~57KB / ~16k tokens of fixed schema overhead in every
 * session. The core profile trims that to 26 tools / ~42KB. These tests pin the
 * contract: core stays a strict subset, every core name is a real tool, and the
 * saving stays material.
 */
describe('tool profiles', () => {
  it('defaults to full and only trims on an explicit core', () => {
    expect(resolveToolProfile()).toBe('full');
    expect(resolveToolProfile(undefined)).toBe('full');
    expect(resolveToolProfile(null)).toBe('full');
    expect(resolveToolProfile('')).toBe('full');
    expect(resolveToolProfile('full')).toBe('full');
    expect(resolveToolProfile('garbage')).toBe('full');
    expect(resolveToolProfile('core')).toBe('core');
    expect(resolveToolProfile('CORE')).toBe('core');
    expect(resolveToolProfile('  Core  ')).toBe('core');
  });

  it('full profile exposes every schema untouched', () => {
    const full = filterToolSchemas(TOOL_SCHEMAS, 'full');
    expect(full).toHaveLength(TOOL_SCHEMAS.length);
    expect(full).toEqual(TOOL_SCHEMAS);
  });

  it('core profile is a strict subset of the real tool list', () => {
    const core = filterToolSchemas(TOOL_SCHEMAS, 'core');
    const fullNames = new Set(TOOL_SCHEMAS.map((t: any) => t.name));

    expect(core.length).toBeGreaterThan(0);
    expect(core.length).toBeLessThan(TOOL_SCHEMAS.length);

    // No ghost names: every entry in CORE_TOOL_NAMES must exist in the schema.
    for (const name of CORE_TOOL_NAMES) {
      expect(fullNames.has(name), `${name} is not a real tool`).toBe(true);
    }
    // And every returned schema must come from the core set.
    for (const tool of core) {
      expect(CORE_TOOL_NAMES.has(tool.name)).toBe(true);
    }
  });

  it('keeps the tools a browsing session cannot do without', () => {
    const core = new Set(filterToolSchemas(TOOL_SCHEMAS, 'core').map((t: any) => t.name));

    for (const required of [
      'chrome_read_dom',
      'chrome_interact_index',
      'chrome_fill_index',
      'chrome_batch_actions',
      'chrome_computer',
      'chrome_screenshot',
      'chrome_scroll',
      'chrome_navigate',
      'chrome_switch_tab',
      'get_windows_and_tabs',
      'chrome_handle_dialog',
      'chrome_upload_file',
    ]) {
      expect(core.has(required), `${required} must stay in core`).toBe(true);
    }
  });

  it('trims a material share of the fixed schema cost', () => {
    const fullBytes = JSON.stringify(TOOL_SCHEMAS).length;
    const coreBytes = JSON.stringify(filterToolSchemas(TOOL_SCHEMAS, 'core')).length;

    // Measured saving is ~25%. Assert a floor so a future regression that
    // silently grows core (or shrinks the trim) fails loudly.
    expect(coreBytes / fullBytes).toBeLessThan(0.8);
  });

  it('explains a profile-blocked call instead of reporting "not found"', () => {
    const msg = profileBlockedMessage('chrome_history', 'core');

    expect(msg).toContain('chrome_history');
    expect(msg).toContain('CHROME_MCP_TOOL_PROFILE');
  });

  it('crawl profile exposes the crawl set including discovery tools', () => {
    const names = filterToolSchemas(TOOL_SCHEMAS, 'crawl').map((t) => t.name);
    for (const n of CRAWL_TOOL_NAMES) expect(names).toContain(n);
    expect(names).not.toContain('chrome_computer');
  });
});
