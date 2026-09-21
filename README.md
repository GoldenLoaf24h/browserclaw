<div align="center">
  <img src="./docs/images/logo.png" width="100" alt="BrowserClaw Logo" />
  <h1>BrowserClaw</h1>
  <p><b>Control your everyday Chrome browser from AI agents, without losing logins or focus.</b></p>
  <p>
    <a href="./docs/MAP.md">Project Map</a> ·
    <a href="./docs/TOOLS.md">Tool Reference (49)</a> ·
    <a href="./AGENT_CONFIG_GUIDE.md">Client Config</a> ·
    <a href="./README.zh-CN.md">Chinese (zh-CN)</a> ·
    <a href="https://github.com/GoldenLoaf24h/browserclaw/releases">Releases</a>
  </p>
</div>

---

<details>
<summary><b>Background: Why BrowserClaw?</b></summary>

<br/>

Browser automation frameworks that drive a separate browser instance (Playwright, Puppeteer, browser-use) start from a clean profile. They do not inherit your active logins, cookies, or extensions, and copying a live Chrome profile on Windows fails with file-sharing locks. Attaching to an existing Chrome via a debug port triggers security banners.

BrowserClaw takes a different route: a Chrome MV3 extension plus a local Native Messaging bridge, running inside the Chrome you already use. Cookies, sessions, and extensions are preserved, and automation happens in background tabs without stealing focus.

</details>

---

## What is BrowserClaw?

BrowserClaw is a Chrome extension + local MCP server that lets AI agents operate your real browser. It exposes 49 tools across 7 categories (navigation, perception, action, observation, management, diagnostics, network), with a minimal 14-tool core profile for everyday sessions.

Two execution paths are available:

1. **Deterministic tools** – indexed clicks, fills, batch pipelines, form wizards, screenshots, network capture, etc. The calling agent plans each step.
2. **\`chrome_act_toward_goal\`** – a local perception-action micro-loop. The native server perceives the page, decides the next action, and acts, without a network round-trip per step. It uses TypeSafe Jev System One inference when an API key is set, and falls back to a built-in heuristic engine otherwise.

---

## Key capabilities

- **Session continuity** – Runs inside your existing Chrome. Google, GitHub, and SSO logins are already there; no profile copying, no re-authentication.
- **Pruned, indexed DOM** – \`chrome_read_dom\` strips non-interactive and occluded nodes and assigns 1-based indices. On 1,000+ node pages this reduces node count by over 85% (test-validated), keeping snapshots small. A fast snapshot mode returns a viewport summary in ≤30 ms and ≤15 KB.
- **Card flattening and viewport virtualization** – \`flattenCards\` collapses repetitive feed cards into one-line summaries; \`virtualizeViewport\` folds off-screen list items into count placeholders.
- **Shadow DOM traversal** – Recursively walks open shadow roots; closed shadow hosts are tagged and interacted with at the host level. Accessible names are extracted from icon-only buttons (aria-label, title, SVG titles).
- **Batch pipelines** – \`chrome_batch_actions\` runs multi-step click/fill/wait/assert/extract sequences in a single MCP round-trip. \`chrome_form_pipeline\` advances multi-step forms locally.
- **Overlay dismissal** – \`chrome_dismiss_overlay\` closes marketing popups, cookie banners, and modals in one step, without dumping the DOM.
- **Delta piggybacking** – \`includeDelta: true\` returns DOM mutations in the same response as an action, removing the need for a follow-up DOM read.
- **Native event fidelity** – Clicks and keystrokes are dispatched as trusted CDP events (\`isTrusted: true\`), so React/Vue/Angular and Shadow DOM handlers fire normally.
- **Coordinate fallback** – When DOM indexing fails (canvas, WebGL, icon-only UI), a screenshot grid plus \`chrome_computer\` provides coordinate-based control with 24 px snap-to-edge.
- **Human handoff** – \`chrome_request_human_intervention\` dims the page, shows a banner, and parks the cursor so the user can complete 2FA or captchas; automation resumes afterward.
- **Tab and window management** – Create, group, move, and close tabs, query history and bookmarks, and capture performance traces, all under the user's existing credentials.

---

## Dual-brain execution

\`\`\`text
┌─ Macro planner (your reasoning LLM) ────────────────────┐
│ Task decomposition, cross-page strategy, recovery │
└───────────────────────────┬─────────────────────────────┘
│ MCP (low frequency)
▼
┌─ Semantic micro-loop (native server) ───────────────────┐
│ chrome_act_toward_goal: │
│ perceive → decide (Jev or heuristic) → act → verify │
│ No MCP round-trip per step │
└───────────────────────────┬─────────────────────────────┘
│ Native Messaging
▼
┌─ Chrome MV3 extension ──────────────────────────────────┐
│ 48 deterministic tools · CDP events · in-page engine │
└──────────────────────────────────────────────────────────┘
\`\`\`

Routing guideline:

- Fixed action sequence, known indices → deterministic tools (\`chrome_batch_actions\`, \`chrome_form_pipeline\`).
- Single-page goal in natural language → \`chrome_act_toward_goal\`.
- Long-horizon, multi-page, novel, or escalated situations → the calling agent drives.

The micro-loop is bounded: at most 60 steps in Jev mode (default 10), truncated to 5 steps in heuristic fallback. It intercepts 14 destructive action keywords (pay, delete, submit, etc.) and escalates ambiguous or low-confidence decisions back to the calling agent with candidate elements.

**Setup:** set the \`TYPESAFE_API_KEY\` environment variable to enable Jev inference. Without it, the micro-loop runs on the heuristic engine – always functional, slower, and more conservative.

---

## Quick start

### Option 1: Prebuilt release (no build)

1. Download the latest \`browserclaw-extension-v*.zip\` and \`browserclaw-skill-v*.zip\` from [Releases](https://github.com/GoldenLoaf24h/browserclaw/releases/latest).
2. Unzip both to persistent local folders.
3. Open \`chrome://extensions\`, enable Developer mode, and load the extension folder.
4. Copy the \`skill/\` folder into your agent's skills directory.

### Option 2: Install with an AI agent

Paste this to your agent:

> "Set up BrowserClaw: https://github.com/GoldenLoaf24h/browserclaw. Read INSTALL.md and follow the steps."

Then load the extension from \`app/chrome-extension/.output/chrome-mv3\` into \`chrome://extensions\`.

### Option 3: Build from source

\`\`\`bash
git clone https://github.com/GoldenLoaf24h/browserclaw.git
cd browserclaw && pnpm install && pnpm build
cd app/native-server && node dist/scripts/register-dev.js
\`\`\`

Then load \`app/chrome-extension/.output/chrome-mv3\` into \`chrome://extensions\`.

Full onboarding (native host registration, MCP client setup, Jev key, health check) is in [INSTALL.md](./INSTALL.md).

---

## Tool catalog

All 49 tools are grouped below. For machine-readable schemas and parameter details, see [docs/TOOLS.md](./docs/TOOLS.md).

### Autonomous execution (1)

- **\`chrome_act_toward_goal\`** – Local perception-action loop toward a natural-language goal. Jev inference with heuristic fallback; escalates on ambiguity or destructive actions.

### Navigation & tabs (7)

- **\`chrome_navigate\`** – Open URL, refresh, history back/forward, background tabs.
- **\`chrome_switch_tab\`** – Switch active tab or bind session affinity.
- **\`chrome_close_tabs\`** – Close tabs by id, URL, or session (requires confirm for active tab).
- **\`chrome_move_tab\`** – Reposition tabs or move across windows.
- **\`get_windows_and_tabs\`** – List windows and tabs with state.
- **\`chrome_attach_tab\` / \`chrome_detach_tab\`** – Attach or detach the CDP debugger.

### Perception & extraction (6)

- **\`chrome_read_dom\`** – Indexed, pruned DOM tree with shadow DOM traversal and fast snapshot mode.
- **\`chrome_grep\`** – Regex or text search returning element indices without a full DOM dump.
- **\`chrome_get_markdown\`** – Clean Markdown extraction for reading tasks.
- **\`chrome_inspect_media\`** – Extract image or canvas data; super-resolves small captchas.
- **\`chrome_get_dropdown_options\`** – List select/combobox options.
- **\`chrome_console\`** – Capture console logs and errors.

### Action & pipeline (15)

- **\`chrome_interact_index\`** – Trusted click, hover, double-click, drag by 1-based index.
- **\`chrome_fill_index\`** – Trusted text input with clear, submit, and multiline support.
- **\`chrome_batch_actions\`** – Multi-step pipeline (click/fill/wait/assert/extract) in one round-trip.
- **\`chrome_form_pipeline\`** – Autonomous multi-step form filling.
- **\`chrome_smart_scroll\`** – Scroll page or inner containers with progress reporting.
- **\`chrome_keyboard\`** – Raw key presses and shortcuts.
- **\`chrome_upload_file\`** – Native file-input upload.
- **\`chrome_insert_media\`** – Paste/drop a real File into rich-text editors.
- **\`chrome_handle_dialog\`** – Accept or dismiss native alert/confirm/prompt.
- **\`chrome_handle_download\`** – Wait for and locate downloads.
- **\`chrome_computer\`** – Coordinate-level mouse/keyboard control (visual fallback).
- **\`chrome_request_human_intervention\`** – Yield to the user for captcha/2FA.
- **\`chrome_undo_last_action\`** – Roll back the last mutation.
- **\`chrome_dismiss_overlay\`** – Close popups, modals, and cookie banners.
- **\`chrome_javascript\`** – Evaluate JavaScript in the page context.

### Observation & diagnostics (3)

- **\`chrome_screenshot\`** – Viewport, element, or full-page capture with optional coordinate grid.
- **\`chrome_cdp_execute\`** – Raw CDP escape hatch.
- **\`chrome_tool_docs\`** – Query tool schemas and activate hidden profiles.

### Management (9)

- **\`chrome_tab_group_create/update/list/ungroup/close\`** – Tab group lifecycle.
- **\`chrome_history\`** – Search browsing history.
- **\`chrome_bookmark_search/add/delete\`** – Bookmark operations.

### Network (3)

- **\`chrome_intercept_api\`** – Capture backend JSON responses matching a URL pattern.
- **\`chrome_network_capture\`** – Record network traffic.
- **\`chrome_network_request\`** – Authenticated HTTP requests through the browser session.

### Performance & health (4)

- **\`performance_start_trace / stop_trace / analyze_insight\`** – Record and analyze performance traces.
- **\`chrome_doctor\`** – Check port, extension link, token, and native host health.

---

## Architecture

\`\`\`text
AI client (any MCP-capable agent)
│ MCP over HTTP/SSE on 127.0.0.1:12306, or stdio
▼
Native bridge (Fastify + stdio host)
├── Jev micro-loop (chrome_act_toward_goal)
└── Passthrough for 48 deterministic tools
│ Chrome Native Messaging
▼
Chrome MV3 extension (service worker)
├── In-page engine (1-based DOM indexing)
├── CDP session manager
└── Agent cursor overlay
\`\`\`

For details, see [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md).

---

## Documentation

- [Project Map](./docs/MAP.md) – Navigation hub and reading paths.
- [Tool Reference](./docs/TOOLS.md) – Schemas for all 49 tools.
- [Install & Onboard](./INSTALL.md) – Step-by-step setup including Jev key.
- [Agent Integration](./AGENT_CONFIG_GUIDE.md) – MCP client configuration.
- [Architecture](./docs/ARCHITECTURE.md) – Design and decisions.
- [Troubleshooting](./docs/TROUBLESHOOTING.md) – Connection and execution issues.

---

## Acknowledgments

- [hangwin/mcp-chrome](https://github.com/hangwin/mcp-chrome) – MV3 extension and Native Messaging bridge foundation.
- [browser-use/browser-use](https://github.com/browser-use/browser-use) – DOM-first indexing principles.
- [BrowserOS](https://github.com/browseros-ai/BrowserOS) – DOM diffing and element grep patterns.
- [TypeSafe](https://docs.typesafe.ai) – Jev System One fast-decision models.

---

## License

[AGPL-3.0](./LICENSE). Modifications and SaaS deployments must remain open-source.

---

BrowserClaw is an independent Chrome extension and MCP automation project. It is not affiliated with the standalone \`browserclaw\` package on npm.
