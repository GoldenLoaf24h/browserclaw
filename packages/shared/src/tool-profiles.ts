import type { Tool } from '@modelcontextprotocol/sdk/types.js';

/**
 * Tool exposure profiles.
 *
 * The full tool list is ~44 schemas / ~58KB / ~16k tokens of fixed cost in every
 * session, and the agent pays it whether or not it ever touches tab groups or
 * performance traces. Profiles let a deployment expose only the tools a
 * browsing workflow actually needs.
 *
 * NOTE on the achievable saving: the biggest schemas (chrome_computer 5.2KB,
 * chrome_click_element 3.4KB, chrome_screenshot 3.2KB) are all core interaction
 * tools, so a usable core set cannot go below ~42KB. The real gain is ~25%
 * (~4.1k tokens/session), not the 80% a naive "13 tools" split suggests — those
 * 13 omit navigation entirely.
 */
export type ToolProfile = 'core' | 'crawl' | 'full';

/**
 * Tools an agent needs to browse, act, and verify. Everything here is either
 * taught in skill/SKILL.md or required to complete a basic session (navigation,
 * tab discovery). The omitted tools are management (tab groups, move/attach
 * tab), history/bookmarks, performance tracing, and the chrome_network_* pair.
 */
export const CORE_TOOL_NAMES: Set<string> = new Set([
  // Perceive
  'chrome_read_dom',
  'chrome_get_markdown',
  'chrome_get_web_content',
  // Act
  'chrome_interact_index',
  'chrome_fill_index',
  'chrome_batch_actions',
  'chrome_computer',
    'chrome_cdp_execute',
  'chrome_click_element',
  'chrome_fill_or_select',
  'chrome_keyboard',
  'chrome_upload_file',
  'chrome_handle_dialog',
  'chrome_fill_form',
  'chrome_burst_interact',
  'chrome_get_dropdown_options',
  // Navigate
  'chrome_navigate',
  'chrome_switch_tab',
  'chrome_close_tabs',
  'get_windows_and_tabs',
  // Observe
  'chrome_screenshot',
  'chrome_scroll',
  'chrome_smart_scroll',
  'chrome_scroll_to_text',
  // Diagnose
  'chrome_console',
  'chrome_javascript',
  'chrome_handle_download',
  'chrome_storage',
  'chrome_cdp_execute',
]);

// Tool discovery is part of every profile: chrome_tool_docs is how an agent
// learns about tools its current profile hides.
CORE_TOOL_NAMES.add('chrome_tool_docs');

/**
 * Resolve the active profile. Accepts the env value verbatim so callers can
 * pass process.env.CHROME_MCP_TOOL_PROFILE directly.
 *
 * Default is "full": existing deployments, docs, and manual verification
 * scripts reference tools outside the core set (tab-group and bookmark tools
 * in docs), so
 * silently hiding them would break those flows. Opt in to the trimmed list
 * with CHROME_MCP_TOOL_PROFILE=core.
 */
export function resolveToolProfile(raw?: string | null): ToolProfile {
  const v = String(raw ?? '').trim().toLowerCase();
  return v === 'core' ? 'core' : v === 'crawl' ? 'crawl' : 'full';
}

/**
 * Crawl-focused profile: page fetch/extract + scroll + storage + network.
 * For batch site-reading workflows without interaction-heavy tools.
 */
export const CRAWL_TOOL_NAMES: ReadonlySet<string> = new Set([
  'chrome_navigate',
  'chrome_get_web_content',
  'chrome_get_markdown',
  'chrome_read_dom',
  'chrome_smart_scroll',
  'chrome_scroll',
  'chrome_javascript',
  'chrome_storage',
  'chrome_cdp_execute',
  'chrome_network_request',
  'chrome_screenshot',
  'chrome_get_links',
  'chrome_tool_docs',
]);

/**
 * Tool categories, space-separated name lists. chrome_tool_docs reads this
 * so an agent can request one category's full schema set on demand.
 */
export const TOOL_CATEGORIES: Record<string, string> = {
  navigate: [
    'chrome_navigate',
    'chrome_switch_tab',
    'chrome_close_tabs',
    'chrome_move_tab',
    'chrome_attach_tab',
    'chrome_detach_tab',
    'get_windows_and_tabs',
  ].join(" "),
  perceive: [
    'chrome_read_dom',
    'chrome_get_markdown',
    'chrome_get_web_content',
    'chrome_get_links',
    'chrome_get_dropdown_options',
  ].join(" "),
  act: [
    'chrome_interact_index',
    'chrome_fill_index',
    'chrome_click_element',
    'chrome_fill_or_select',
    'chrome_fill_form',
    'chrome_keyboard',
    'chrome_upload_file',
    'chrome_handle_dialog',
    'chrome_handle_download',
    'chrome_batch_actions',
    'chrome_burst_interact',
    'chrome_computer',
    'chrome_cdp_execute',
  ].join(" "),
  observe: [
    'chrome_screenshot',
    'chrome_scroll',
    'chrome_smart_scroll',
    'chrome_scroll_to_text',
    'chrome_console',
  ].join(" "),
  manage: [
    'chrome_history',
    'chrome_bookmark_search',
    'chrome_bookmark_add',
    'chrome_bookmark_delete',
    'chrome_tab_group_create',
    'chrome_tab_group_update',
    'chrome_tab_group_list',
    'chrome_tab_group_ungroup',
    'chrome_tab_group_close',
  ].join(" "),
};

/** Filter the schema list for a profile. Unknown names are simply not exposed. */
export function filterToolSchemas(schemas: Tool[], profile: ToolProfile): Tool[] {
  if (profile === 'full') return schemas;
  const allow = profile === 'crawl' ? CRAWL_TOOL_NAMES : CORE_TOOL_NAMES;
  return schemas.filter((tool) => allow.has(tool.name));
}

/**
 * Message returned when a known tool is called outside the active profile.
 * Returning "not found" would be misleading — the tool exists, it is just not
 * exposed — and it would hide the fix from the caller.
 */
export function profileBlockedMessage(name: string, profile: ToolProfile): string {
  return `Tool "${name}" is not exposed under the "${profile}" tool profile. Call chrome_tool_docs (category lists) to inspect its parameters, or remove CHROME_MCP_TOOL_PROFILE (set "full") on the MCP server and restart the client to enable it.`;
}
