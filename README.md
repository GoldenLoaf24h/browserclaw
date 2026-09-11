<div align="center">
  <img src="./docs/images/logo.png" width="100" alt="BrowserClaw Logo" />
  <h1>BrowserClaw</h1>
  <p><b>Take full control of everything in your own browser.</b></p>
  <p>
    <a href="./docs/MAP.md">🗺️ Project Map</a> ·
    <a href="./docs/TOOLS.md">Tool Reference (52)</a> ·
    <a href="./AGENT_CONFIG_GUIDE.md">Client Config</a> ·
    <a href="./README.zh-CN.md">📖 简体中文</a> ·
    <a href="https://github.com/GoldenLoaf24h/browserclaw/releases">Releases</a>
  </p>
</div>

---

<details>
<summary><b>💡 Background: Why BrowserClaw? (Click to expand)</b></summary>

<br/>

Traditional browser automation frameworks (Playwright, Puppeteer, browser-use) run in isolated, throwaway sandboxes. They fail to inherit your active logins, cookies, and extensions. Attempting to copy user profile directories on Windows crashes with `[WinError 32]` exclusive file sharing locks, while `--remote-debugging-port` triggers intrusive security banners that ruin unattended automation.

**BrowserClaw** solves this from the inside: an MV3 Chrome extension paired with a local Native Messaging bridge. It runs inside your everyday Chrome — zero login loss, zero file locks, and zero focus-stealing — turning your real browser into a secure, high-speed automation surface for AI agents.

</details>

---

## ⚡ What is BrowserClaw?

BrowserClaw is a high-performance Model Context Protocol (MCP) platform that gives AI agents complete, authenticated control over your active Chrome browser:

- 🍪 **100% Session & Auth Reuse**: Keeps your active Google, GitHub, and enterprise SSO sessions. No re-logging in.
- 🎯 **Dual-Engine Precision**: 1-based pruned DOM tree (token savings >85%) with 1:1 CSS viewport coordinate visual fallback.
- ⚡ **Autonomous DOM Diffing (`includeDelta`)**: Single-step click/fill responses include local DOM mutations, eliminating 50% of roundtrips.
- 🔍 **Targeted Grep (`chrome_grep`)**: Sub-100 token instant element and text search across large documents.
- 🖱️ **Human-Grade Aesthetics**: 1:1 spring-kinematics virtual cursor overlay and dedicated tab groups lifecycle management.
- 🛡️ **Zero-Jitter Session Retention**: 10-minute session-aware CDP retention eliminates infobar dropping and viewport accordion shifts.
- 🧠 **Personal Context & Second Brain**: AI doesn't just click — it understands your workflow through your browsing history and organizes messy bookmarks into a structured personal knowledge base.

---

## 🚀 Quick Start

### 1. Let your AI agent set up the backend
Ask your AI assistant (Claude Code, Cursor, Windsurf, Codex):
> *"Please set up BrowserClaw MCP server for me: https://github.com/GoldenLoaf24h/browserclaw"*

Or run manually:
```bash
git clone https://github.com/GoldenLoaf24h/browserclaw.git
cd browserclaw && pnpm install && pnpm build
cd app/native-server && node dist/scripts/register-dev.js
```
*(Token saved at `~/.chrome-mcp/bridge-token`; server listens on `http://127.0.0.1:12306/mcp`)*

### 2. Load the Extension in Chrome
1. Download **[browserclaw-extension-latest.zip](https://github.com/GoldenLoaf24h/browserclaw/releases/latest)** (or use `app/chrome-extension/.output/chrome-mv3`).
2. Open `chrome://extensions`, enable **Developer mode** (top-right).
3. Click **Load unpacked** and select the folder.

> 🤫 **Pro Tip (Silent Debugging)**: Add `--silent-debugger-extension-api` to your Chrome launch shortcut to completely hide Chrome's top *"BrowserClaw is debugging this browser"* bar.

---

## ⚖️ How BrowserClaw Compares

Rather than generic checkboxes, here is how BrowserClaw's architecture objectively compares to alternative automation paradigms across the dimensions users and agent developers care about most:

| Capability / Architecture | **BrowserClaw (This Project)** | **browser-use (Python/CDP)** | **Playwright MCP (Microsoft)** | **Stagehand (Browserbase)** |
| :--- | :--- | :--- | :--- | :--- |
| **Real-World Browser Auth** | **Your Everyday Chrome (Extension)**<br>Reuses active Google, GitHub, and enterprise SSO sessions without credential re-entry | **Separate Chrome Instance**<br>Requires manual profile copying; frequently triggers anti-bot and 2FA challenges | **Ephemeral Headless Sandbox**<br>Starts from a blank profile each run; cannot access active desktop sessions | **Cloud-Hosted Browser**<br>Runs in remote sandboxes; relies on external proxies and manual cookie injection |
| **Windows OS Reliability** | **Native Messaging Dual-IPC**<br>Immune to file locks, zero port conflicts, runs silently in background | **Direct User Data Copy**<br>Crashes on Windows with `[WinError 32]` exclusive file lock collisions | **Process-Spawned Headless**<br>Leaves orphan `chrome.exe` background processes if killed abruptly | **Remote Execution**<br>Avoids local OS issues, but incurs high network latency and per-minute cloud costs |
| **Token Cost per Action** | **Extreme Efficiency (<200 ~ 800 Tokens)**<br>Pruned 1-based DOM tree + autonomous diff (`includeDelta` returns local changes only) | **Moderate (~3,000 - 8,000 Tokens)**<br>Full DOM snapshot evaluation or vision model roundtrip on each step | **High (~5,000 - 15,000 Tokens)**<br>Dumps full ARIA accessibility trees into the prompt on every interaction | **High (LLM-in-the-Loop)**<br>Relies on model inference to re-locate targets on every semantic command |
| **Massive Page Search** | **`chrome_grep` (<100 Tokens)**<br>Sub-millisecond regex/text scan across DOM and text lines without dumping the tree | **Full Dump Search**<br>Requires feeding entire DOM contents into LLM context to find elements | **Full Tree Traversal**<br>Agent must parse through tens of thousands of lines of raw accessibility text | **Semantic Search**<br>Cloud-side visual or prompt evaluation to locate elements |
| **Multi-Step Pipelines** | **Closed-Loop `batch_actions`**<br>Chains fills, clicks, waits, `assert` guards, and `extract` data captures in a single network RTT | **Step-by-Step Loop**<br>Each discrete keystroke or click requires a full agent decision roundtrip (10s+ latency) | **Single-Action Calls**<br>No built-in batching, verification assertions, or inline data extraction | **Semantic Single Actions**<br>`page.act("...")` calls execute individually with per-action billing |
| **Visual Aesthetics** | **1:1 Spring-Kinematics Virtual Cursor**<br>Retina cursor flies naturally; dedicated colored Chrome Tab Groups prevent window clutter | **Headless / Raw Jumps**<br>No visual cursor overlay; tabs pile up unorganized across the user window | **No Visual Layer**<br>Engineered strictly for test suites; zero visual feedback or takeover safety | **Canvas Stream**<br>Renders a remote browser feed in a web dashboard; no local overlay |
| **2FA & Captcha Takeover** | **`request_human_intervention`**<br>Softly dims page with frosted-glass banner, yields to human, and auto-resumes on continue | **Timeout / Crash**<br>Blocks on interactive challenges until action watchdog expires | **Assertion Failure**<br>Throws test timeouts when blocked by bot detection or captchas | **Dashboard Takeover**<br>Requires switching to cloud provider dashboard to solve manually |
| **Low-Level Escape Hatch** | **`cdp_execute` (Anti-Hang Guard)**<br>Target polymorphic routing with automatic detachment on timeout to prevent renderer freeze | **Python CDP Access**<br>Provides low-level CDP commands directly through Python async bindings | **Strict High-Level API**<br>Locked to exposed MCP tools; no raw CDP command passthrough | **Playwright-Only**<br>Limited to Playwright primitives; cannot execute raw DevTools protocol |
| **Personal Second Brain** | **Native History & Bookmarks Intelligence**<br>Agent reads browsing history to understand user habits and organizes messy bookmarks | **Task-Only Automation**<br>Operates as a stateless task runner; retains no personal browser memory | **Stateless Test Runner**<br>All state and browsing records are wiped upon session termination | **Cloud Session Only**<br>Isolated to specific tasks; no connection to developer's daily workflow |

### � Honest Architectural Boundaries
BrowserClaw is purpose-built for high-speed local browser control, and we maintain complete transparency regarding its design boundaries:
1. **Chromium-First Architecture**: Deeply optimized for Chromium-based browsers (Google Chrome, Microsoft Edge, Brave, Opera). It does not support Gecko (Firefox) or WebKit (Safari).
2. **Local Desktop Paradigm**: Designed for personal productivity, developers, and local agents (Cursor, Claude Code, Codex). It is not designed to spawn 1,000 ephemeral headless containers in the cloud.
3. **1MB IPC Ceiling**: Chrome Native Messaging enforces a 1MB payload ceiling. Large images and media assets are handled via local filesystem paths or streaming rather than inline JSON.

---

## 🛠️ Complete Tool Catalog (52 MCP Tools)

All 52 schema-validated tools are grouped into 6 logical categories below. **Click any category to expand its tool listing.**
For machine-readable JSON schemas and detailed option flags, consult **[docs/TOOLS.md](./docs/TOOLS.md)**.

<details>
<summary><b>🌐 1. Navigation & Tab Management (7 Tools)</b></summary>

<br/>

- **`chrome_navigate`**: Navigate to any URL, refresh, or travel history (`"back"` / `"forward"`). Native `background: true` opens tabs silently without stealing user focus.
- **`chrome_switch_tab`**: Switch the active browser tab or bind session-level tab affinity without disrupting the user.
- **`chrome_close_tabs`**: Close tabs by ID array, URL pattern, or safely close active/session tabs (requires `confirm: true` to protect personal tabs).
- **`chrome_move_tab`**: Reposition tabs by index or detach/transfer tabs across separate browser windows.
- **`get_windows_and_tabs`**: List all open Chrome windows and tabs with IDs, active state, URLs, and window titles.
- **`chrome_attach_tab`**: Explicitly attach the low-level Chrome DevTools Protocol debugger to a specific tab.
- **`chrome_detach_tab`**: Explicitly detach the debugger session from a tab.

</details>

<details>
<summary><b>📄 2. Content Perception & Data Extraction (7 Tools)</b></summary>

<br/>

- **`chrome_read_dom`**: Pruned interactive DOM tree with 1-based numeric indices. Reduces prompt token consumption by >85%.
- **`chrome_grep`**: Sub-100 token instant regex or text search across elements and text lines without full DOM dumping.
- **`chrome_get_markdown`**: Clean, structured Markdown content extraction optimized for long-form reading and article summarization.
- **`chrome_inspect_media`**: Lossless in-memory extraction of raw `<img>` and `<canvas>` data, with 200%+ super-sampling crop fallback for noisy captchas.
- **`chrome_get_web_content`**: Event-driven page content extraction with complete status waiting.
- **`chrome_get_links`**: Extract all hyperlinks, URLs, and associated anchor texts from the active page.
- **`chrome_get_dropdown_options`**: Inspect all selectable options within native or custom `<select>` dropdown elements.

</details>

<details>
<summary><b>🖱️ 3. Action Execution & Pipeline (15 Tools)</b></summary>

<br/>

- **`chrome_interact_index`**: Native trusted click, hover, or dblclick by 1-based index; supports `includeDelta: true` for autonomous DOM diff feedback.
- **`chrome_fill_index`**: Native trusted text input with automatic value clearing and `includeDelta: true` mutation checking.
- **`chrome_batch_actions`**: High-performance multi-step pipeline combining click, fill, press, and wait in a single roundtrip, with built-in `assert` and `extract` rules.
- **`chrome_smart_scroll`**: Viewport overflow-aware scrolling that returns accurate remaining page counts (`pages_down` / `pages_up`).
- **`chrome_scroll`**: Precise pixel-level and directional scroll control across the document or target scrollable containers.
- **`chrome_scroll_to_text`**: Automatically search for target text in the page and smoothly scroll it to the center of the viewport.
- **`chrome_keyboard`**: Dispatch physical keystrokes (Enter, Tab, Esc), combinations (Ctrl+C/V), or targeted text input.
- **`chrome_upload_file`**: Intercept file chooser dialogs dynamically or inject absolute local file paths into `<input type="file">`.
- **`chrome_handle_dialog`**: Handle or pre-arm responses for native JavaScript dialogs (alert, confirm, prompt).
- **`chrome_handle_download`**: Track, monitor, and manage active native browser file downloads.
- **`chrome_burst_interact`**: Low-latency burst click sequence designed for rapid successive triggers.
- **`chrome_computer`**: Anthropic Computer Use-compatible unified interface for mouse and keyboard control.
- **`chrome_cdp_execute`**: Industrial-grade low-level CDP escape hatch with target polymorphic routing and anti-hang auto-detach guards.
- **`chrome_request_human_intervention`**: Softly dim page, display a frosted-glass banner, park the virtual cursor, and yield control to the human for 2FA or slider captchas.
- **`chrome_undo_last_action`**: 5-step ring buffer undo engine to roll back recent navigation jumps or form input values.

</details>

<details>
<summary><b>👁️ 4. Vision & Viewport Control (3 Tools)</b></summary>

<br/>

- **`chrome_screenshot`**: Capture viewport or full-page PNGs with optional high-contrast pixel coordinate grid overlays for visual fallback.
- **`chrome_get_mouse_position`**: Query the real-time physical coordinates and position of the virtual cursor in the viewport.
- **`chrome_console`**: Capture, monitor, and filter page-level JavaScript console logs, warnings, and unhandled runtime exceptions.

</details>

<details>
<summary><b>📡 5. Network Intercept & Storage (6 Tools)</b></summary>

<br/>

- **`chrome_intercept_api`**: Silently sniff and decode backend API responses matching URL patterns to retrieve structured JSON data directly.
- **`chrome_network_capture`**: Start and stop full network traffic recording with status codes, headers, and request/response payloads.
- **`chrome_network_request`**: Dispatch native HTTP requests through the browser session, inheriting all active origin cookies and headers.
- **`chrome_storage`**: Read, write, or clear browser storage state (`localStorage`, `sessionStorage`, and cookies).
- **`chrome_javascript`**: Execute custom JavaScript expressions in the page context with automatic single-expression return detection.
- **`chrome_tool_docs`**: Dynamic in-session capability discovery and profile activation (`activateForSession: true`).

</details>

<details>
<summary><b>🗂️ 6. Tab Groups, Bookmarks & Diagnostics (9 Tools)</b></summary>

<br/>

- **`chrome_tab_group_create`**: Create dedicated colored tab groups with adaptive task titles (default: "Agent").
- **`chrome_tab_group_update`**: Dynamically rename, recolor, or toggle the collapsed state of tab groups.
- **`chrome_tab_group_list`**: List all active tab groups in the window and their associated tabs.
- **`chrome_tab_group_ungroup`**: Remove specific tabs from their parent group.
- **`chrome_tab_group_close`**: Close all tabs in a group and purge the group with zero orphan residue.
- **`chrome_history`**: Query and filter historical browser visits across customizable time ranges.
- **`chrome_bookmark_search` / `add` / `delete`**: Search, create, and remove browser bookmarks.
- **`performance_start_trace` / `stop_trace` / `analyze_insight`**: Record and analyze Core Web Vitals and Chromium performance traces.

</details>

---

## 🏗️ Architecture

```text
AI Client (Cursor / Claude / Codex)
         │  MCP (HTTP / SSE / Stdio) @ 127.0.0.1:12306
         ▼
Native Messaging Bridge (Fastify + Stdio Host)
         │  Chrome Native Messaging (1MB buffer guard)
         ▼
Chrome MV3 Extension (Service Worker + WXT + Vue 3)
         ├── Inpage DOM Engine (Isolated World, 1-based indexing)
         ├── CDP Session Manager (10-min retention, domain ref-counting)
         └── Agent Cursor (Closed Shadow DOM spring kinematics overlay)
```

See **[docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md)** for detailed topology and sequence flows.

---

## 📚 Documentation Map

- **[Project Map & Index](./docs/MAP.md)**: 🗺️ Master navigation hub, reading paths by role, and code topology.
- **[Tool Reference](./docs/TOOLS.md)**: Auto-generated parameter dictionary for all 52 tools.
- **[Agent Integration Guide](./AGENT_CONFIG_GUIDE.md)**: 6 core interaction rules and client configurations.
- **[Architecture Deep-Dive](./docs/ARCHITECTURE.md)**: Monorepo design, security boundaries, and ADR records.
- **[Troubleshooting](./docs/TROUBLESHOOTING.md)**: Instant diagnosis checklist for connection or execution errors.

---

## 💡 Acknowledgments & Prior Art

BrowserClaw synthesizes architectural wisdom from the open-source community:
- **[hangwin/mcp-chrome](https://github.com/hangwin/mcp-chrome)**: Foundational MV3 extension + Native Messaging IPC bridge.
- **[browser-use/browser-use](https://github.com/browser-use/browser-use)**: Token-efficient DOM-first indexing principles.
- **[browseros-ai/BrowserOS](https://github.com/browseros-ai/BrowserOS)**: Autonomous DOM diffing (`includeDelta`) and element grep (`chrome_grep`).
- **[ChatGPT Official Extension](https://chromewebstore.google.com/detail/chatgpt/hehggadaopoacecdllhhajmbjkdcmajg)**: Spring kinematics virtual cursor and tab group lifecycle patterns.

---

## 📄 License

[GNU Affero General Public License v3.0 (AGPL-3.0)](./LICENSE). Modifications or SaaS hosted deployments must remain open-source.

---

_Disambiguation: BrowserClaw MCP is an independent Chrome extension and Model Context Protocol automation ecosystem, built for AI agents to control everyday user browsers. It is not affiliated with the standalone `browserclaw` Playwright library on npm._
