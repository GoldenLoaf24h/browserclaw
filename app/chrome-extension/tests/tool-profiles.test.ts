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
 * The full tool list costs ~58KB / ~16k tokens of fixed schema overhead in every
 * session. The refined core profile trims redundant/duplicate tools (click_element,
 * fill_or_select, fill_form, burst_interact, scroll) in favor of best-in-class primary
 * tools (interact_index, fill_index, batch_actions, smart_scroll).
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
      expect(fullNames.has(name), String(name) + ' is not a real tool').toBe(true);
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
      'chrome_smart_scroll',
      'chrome_navigate',
      'chrome_switch_tab',
      'get_windows_and_tabs',
      'chrome_handle_dialog',
      'chrome_upload_file',
    ]) {
      expect(core.has(required), String(required) + ' must stay in core').toBe(true);
    }
  });

  it('confirms redundant legacy tools are pruned from core to prevent agent choice confusion', () => {
    const core = new Set(filterToolSchemas(TOOL_SCHEMAS, 'core').map((t: any) => t.name));

    // Redundant selector/duplicate tools pruned from core
    expect(core.has('chrome_click_element')).toBe(false);
    expect(core.has('chrome_fill_or_select')).toBe(false);
    expect(core.has('chrome_fill_form')).toBe(false);
    expect(core.has('chrome_burst_interact')).toBe(false);
    expect(core.has('chrome_scroll')).toBe(false);
    expect(core.has('chrome_cdp_execute')).toBe(false); // cdp_execute belongs in full profile
  });

  it('trims a material share of the fixed schema cost', () => {
    const fullBytes = JSON.stringify(TOOL_SCHEMAS).length;
    const coreBytes = JSON.stringify(filterToolSchemas(TOOL_SCHEMAS, 'core')).length;

    // Core is significantly leaner than full
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
