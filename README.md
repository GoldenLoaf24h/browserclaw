<div align="center">
  <img src="./docs/images/logo.png" width="100" alt="BrowserClaw Logo" />
  <h1>BrowserClaw</h1>
  <p><b>Take full control of everything in your own browser.</b></p>
  <p>
    <a href="./docs/MAP.md">🗺️ Project Map</a> ·
    <a href="./docs/TOOLS.md">Tool Reference (47)</a> ·
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

BrowserClaw is a **hierarchical dual-brain browser agent platform**. It pairs a high-performance MCP execution surface (47 tools, running inside your real Chrome) with a local semantic micro-loop — so a fast decision engine handles the high-frequency "perceive → decide → act" steps, while your reasoning LLM stays in charge of macro planning.

The result: agent browser control that is **3–5× faster and 70–80%+ cheaper on tokens**, without giving up CDP fidelity, Shadow-DOM penetration, or anti-bot resilience.

- 🧠 **Hierarchical Dual-Brain (`chrome_act_toward_goal`)**: a semantic micro-loop perceives, decides, and acts locally at ~200–400ms/step with **zero MCP round-trips**. Your LLM plans; the fast engine executes.
- 🪜 **Three-Engine Fallback Ladder**: TypeSafe Jev (System One) → zero-dependency heuristic scorer → structured escalate back to the planner with pre-fetched DOM. The tool **never hard-fails** — it degrades gracefully.
- 🍪 **100% Session & Auth Reuse**: Keeps your active Google, GitHub, and enterprise SSO sessions. No re-logging in.
- 🎯 **Dual-Engine Precision**: 1-based pruned DOM tree (token savings >85%) with 1:1 CSS viewport coordinate visual fallback.
- 🌲 **AX Compact Semantic Tree**: Accessibility-tree-inspired representation without verbose closing tags, slashing token usage by 60%~75%.
- 🔗 **Code-Driven Chained Execution (`mcp.*`)**: Run multi-step interactions (`mcp.click`, `mcp.fill`, `mcp.waitFor`, `mcp.extract`) in a single `chrome_javascript` call, reducing 4~6 roundtrips to 1.
- 🛡️ **Shadow DOM Penetration & Self-Healing Interception**: Deep composed-tree hit testing across closed shadow roots with actionable dialog names returned on obstruction.
- 🎯 **Optimal Action Point & Click Probe Fallback**: Viewport-weighted visible coordinates with automatic synthetic DOM fallback if Chromium throttles background CDP events.
- 📡 **4-Tier Layered Scraping Protocol**: Seamless escalation from zero-token direct API fetch (`chrome_network_request`) to silent response sniffing, compact DOM, and visual fallback.
- ⚡ **Autonomous DOM Diffing (`includeDelta`)**: Single-step click/fill responses include local DOM mutations, eliminating 50% of roundtrips.
- 🔍 **Targeted Grep (`chrome_grep`)**: Sub-100 token instant element and text search across large documents.
- 🖱️ **Human-Grade Aesthetics**: 1:1 spring-kinematics virtual cursor overlay and dedicated tab groups lifecycle management.
- 🛡️ **Zero-Jitter Session Retention**: 10-minute session-aware CDP retention eliminates infobar dropping and viewport accordion shifts.
- 🪟 **Window Isolation Mode & Color Tab Groups**: Toggle between quiet in-window Tab Groups (with background focus emulation) or a fully dedicated OS Window where CDP infobars are strictly confined.
- 🩺 **Instant Environment Doctor (chrome_doctor & CLI)**: One-command health checks for 12306 port connectivity, tokens, and browser settings.
- 📁 **Site Playbook Recipes (skill/recipes/)**: Cache and persist proven DOM interaction pipelines for specific websites, cutting exploration tokens by 80%+.
- 🌐 **Manage Everything in Your Real Browser**: Unlike conventional automation tools confined to throwaway headless bubbles, BrowserClaw gives your agent full, authenticated control to manage everything in your everyday local browser — active tabs, windows, cookies, browsing history, and bookmarks.

---

## 🧠 How the Dual-Brain Works

```text
┌─ Tier 2 · Macro Planner (your reasoning LLM) ──────────┐
│  Task decomposition, long-horizon reasoning,           │
│  free-text generation, exception takeover              │
└───────────────────────────┬────────────────────────────┘
                            │ MCP (low frequency, macro goals)
                            ▼
┌─ Tier 1 · Semantic Micro-Loop (Native Server) ─────────┐
│  chrome_act_toward_goal internal loop:                 │
│  read_dom → Jev / heuristic decision → act → verify    │
│  ~200–400ms per step · zero MCP round-trips            │
└───────────────────────────┬────────────────────────────┘
                            │ Native Messaging
                            ▼
┌─ Tier 0 · Deterministic Primitives (47 MCP tools) ─────┐
│  batch_actions / form_pipeline / interact_index / ...  │
│  Chrome MV3 Extension · CDP physical events            │
└────────────────────────────────────────────────────────┘
```

**Routing rule of thumb:**

- Target index known, action sequence fixed → **Tier 0** (`chrome_batch_actions` / `chrome_form_pipeline`)
- Natural-language micro-goal, target on page but location unknown → **Tier 1** (`chrome_act_toward_goal`)
- Long-horizon task, novel situation, content generation, or Tier 1 escalates → **Tier 2** (your LLM drives the other tools)

**Setup:** set the `TYPESAFE_API_KEY` environment variable to enable the Jev engine. Without it, `chrome_act_toward_goal` automatically falls back to the built-in heuristic engine — always functional, gracefully degraded, and self-reporting via the `engine` field in every response.

### Real-world benchmark (real Jev API, T1–T5)

| Task                 | Wall-clock | Jev calls | Tokens (in/out) | Engine |
| -------------------- | ---------- | --------- | --------------- | ------ |
| T1 navigate + search | 2,062ms    | 2         | 1,737 / 52      | jev    |
| T2 form submit       | 586ms      | 2         | 1,666 / 48      | jev    |
| T3 select option     | 249ms      | 1         | 781 / 24        | jev    |
| T4 modal handling    | 518ms      | 2         | 1,654 / 50      | jev    |
| T5 multi-step        | 574ms      | 2         | 1,654 / 51      | jev    |

Single-step median **~260–350ms**; end-to-end speedup **>75%** and token reduction **>80%** vs an LLM-in-the-loop baseline.

---

## 🚀 Quick Start

### Option 1: Let AI Agent Install (Recommended)

Copy and paste this message directly to your AI assistant (Claude Code, Cursor, Windsurf, Codex):

> _"Set up BrowserClaw for me: https://github.com/GoldenLoaf24h/browserclaw. Read `INSTALL.md` and follow the steps."_

Your agent will configure the backend automatically. Afterwards, download **[browserclaw-extension-latest.zip](https://github.com/GoldenLoaf24h/browserclaw/releases/latest)**, open `chrome://extensions` (with Developer mode enabled), and drag the unpacked folder in.

### Option 2: Add via ChatGPT / Codex Plugin Marketplace

In ChatGPT or Codex, open the Plugin Store / Marketplace, click **`+`** in the top-right corner to add a new marketplace, and enter:

```text
https://github.com/GoldenLoaf24h/browserclaw
```

Then click install on **BrowserClaw**.

### Option 3: Install via Hermes Agent

Install directly from terminal into your active Hermes environment:

```bash
hermes plugins install GoldenLoaf24h/browserclaw --subdir plugins/browserclaw
hermes plugins enable browserclaw
```

### Option 4: Manual Developer Installation

```bash
git clone https://github.com/GoldenLoaf24h/browserclaw.git
cd browserclaw && pnpm install && pnpm build
cd app/native-server && node dist/scripts/register-dev.js
```

Then load `app/chrome-extension/.output/chrome-mv3` into `chrome://extensions`.

---

## ⚖️ How BrowserClaw Compares

Every tool in the browser automation ecosystem has distinct architectural tradeoffs and sweet spots. Here is an objective comparison across the dimensions developers and users care about most:

| Capability / Architecture                 | **BrowserClaw (This Project)**                                                                            | **browser-use (Python/CDP)**                                                                       | **Playwright MCP (Microsoft)**                                                               | **Stagehand (Browserbase)**                                                                      |
| :---------------------------------------- | :-------------------------------------------------------------------------------------------------------- | :------------------------------------------------------------------------------------------------- | :------------------------------------------------------------------------------------------- | :----------------------------------------------------------------------------------------------- |
| **Everyday Chrome Auth & Logins**         | ✅ **100% Native Extension**<br>Directly reuses active Google, GitHub, and SSO sessions                   | ⚠️ **Manual Profile Setup**<br>Separate process; profile copying often triggers bot challenges     | ❌ **Ephemeral Sandbox**<br>Fresh blank profile on every run; no access to daily logins      | ❌ **Cloud Sandbox**<br>Remote cloud container; requires manual cookie exports                   |
| **Fast Local Decision Loop**              | ✅ **Dual-Brain Micro-Loop**<br>~200–400ms/step local perceive→decide→act, zero MCP round-trips           | ⚠️ **LLM-in-Loop**<br>Full agent decision round-trip per step (10s+)                               | ❌ **Tools Only**<br>External orchestrator decides every step                                | ⚠️ **Semantic Steps**<br>Per-step model inference on every action                                |
| **Decision Fallback & Resilience**        | ✅ **Three-Engine Ladder**<br>Jev → heuristic → structured escalate; never hard-fails                     | ❌ **Single Brain**<br>LLM timeout or failure blocks the whole loop                                | ❌ **N/A**<br>No local decision layer at all                                                 | ⚠️ **Model Retry**<br>Relies on upstream model availability                                      |
| **Autonomous Agent Loop Included**        | ⚠️ **MCP Surface + Micro-Loop**<br>Plug into your existing agent (Cursor, Claude, Codex)                  | ✅ **Batteries-Included**<br>Built-in autonomous LLM reasoning loop out of the box                 | ❌ **MCP Tools Only**<br>Pure protocol tools; requires an external agent orchestrator        | ✅ **Natural Language**<br>Drive actions directly via `page.act("click login")`                  |
| **Cross-Engine Support (Firefox/WebKit)** | ❌ **Chromium-Only**<br>Deeply optimized for Chrome, Edge, Brave, and Opera                               | ⚠️ **Chromium-Centric**<br>Primarily targets Chromium via CDP                                      | ✅ **Full Native Engines**<br>Native multi-browser support for Chromium, Firefox & WebKit    | ⚠️ **Chromium-Centric**<br>Cloud containers primarily run Chromium                               |
| **Cloud Elastic Concurrency**             | ❌ **Local Desktop First**<br>Built for your local workspace, not cloud container clusters                | ⚠️ **Self-Hosted Docker**<br>Requires provisioning your own multi-container infrastructure         | ⚠️ **Self-Hosted CI**<br>Requires setting up your own GitHub Actions / runner matrix         | ✅ **Elastic Cloud Fleet**<br>Instantly scales to thousands of remote browsers on Browserbase    |
| **Token Cost per Action**                 | ✅ **Ultra-Low (<800 Tokens)**<br>Pruned 1-based DOM tree + autonomous diff (`includeDelta`)              | ⚠️ **Moderate (~5,000 Tokens)**<br>Full DOM snapshot evaluation or vision model roundtrip per step | ❌ **High (>10,000 Tokens)**<br>Dumps full raw ARIA accessibility trees on every interaction | ❌ **High (LLM-in-Loop)**<br>Re-infers target locators through models on every semantic step     |
| **Massive Page Targeted Search**          | ✅ **`chrome_grep` (<100 Tokens)**<br>Sub-millisecond regex/text scan without dumping the DOM             | ❌ **Full DOM Ingestion**<br>Must dump entire page contents into LLM prompt context                | ❌ **Raw Tree Traversal**<br>Agent must parse through tens of thousands of lines of text     | ⚠️ **Semantic Query**<br>Re-evaluates page context via prompt inference                          |
| **Multi-Step Action Pipelines**           | ✅ **Closed-Loop `batch_actions`**<br>Chains fills, clicks, waits, `assert` and `extract` in 1 RTT        | ⚠️ **Step-by-Step Loop**<br>Each discrete action requires a full agent decision roundtrip (10s+)   | ❌ **Single-Action Calls**<br>No built-in batching, assertions, or data extraction           | ⚠️ **Single Semantic Steps**<br>`page.act()` executes actions individually with per-step billing |
| **Visual Polish & Human Coexistence**     | ✅ **1:1 Spring Virtual Cursor**<br>Retina cursor flies naturally; dedicated colored Chrome Tab Groups    | ❌ **Headless / Raw Jumps**<br>No visual cursor overlay; tabs pile up unorganized                  | ❌ **No Visual Layer**<br>Designed strictly for test suites; zero visual feedback            | ⚠️ **Remote Canvas Stream**<br>Renders browser feed in cloud web dashboard                       |
| **2FA & Captcha Takeover**                | ✅ **Frosted Banner Takeover**<br>Softly dims page, yields to human, and auto-resumes on continue         | ❌ **Timeout / Crash**<br>Blocks on interactive challenges until action watchdog expires           | ❌ **Test Failure**<br>Throws timeout exception when blocked by challenges                   | ⚠️ **Cloud Dashboard**<br>Must open cloud provider web console to solve manually                 |
| **Windows OS Reliability**                | ✅ **Native Messaging**<br>Zero file locks, zero port conflicts, runs silently in background              | ❌ **WinError 32 Collision**<br>Direct profile copying triggers Windows exclusive sharing locks    | ⚠️ **Orphan Processes**<br>Abrupt exits may leave background `chrome.exe` zombies            | ✅ **Cloud-Isolated**<br>Runs completely off-device, avoiding local OS lock issues               |
| **Full Local Browser Management**         | ✅ **Tabs, History & Bookmarks**<br>Agent directly manages everyday tabs, windows, history, and bookmarks | ❌ **Stateless Sandbox**<br>Isolated container; cannot access or manage host browser               | ❌ **Test Sandbox Only**<br>Throwaway profile wiped upon termination                         | ❌ **Remote Cloud Only**<br>Isolated cloud run; zero host browser integration                    |

### 🧭 Choosing the Right Tool for Your Stack

- **Choose [browser-use](https://github.com/browser-use/browser-use)** if you want a complete, standalone Python agent that runs its own autonomous loop from the terminal.
- **Choose [Playwright MCP](https://github.com/microsoft/playwright-mcp)** if you need an official Microsoft tool to run cross-browser test suites across Firefox, WebKit, and Chromium in CI/CD.
- **Choose [Stagehand](https://github.com/browserbase/stagehand)** if you need to scale to thousands of ephemeral cloud browsers without managing local desktop infrastructure.
- **Choose BrowserClaw** if you want your AI coding assistants (Claude Code, Cursor, Windsurf, Codex) to **control the Chrome you actually use every day** — inheriting all your active logins, a fast local dual-brain decision loop, 85%+ token savings, and human-grade cursor aesthetics with graceful 2FA takeover.

---

## 🛠️ Complete Tool Catalog (47 MCP Tools)

All 47 schema-validated tools are grouped into 6 logical categories below. **Click any category to expand its tool listing.**
For machine-readable JSON schemas and detailed option flags, consult **[docs/TOOLS.md](./docs/TOOLS.md)**.

<details>
<summary><b>🧠 0. Autonomous Goal Execution (1 Tool) — New in v2.8</b></summary>

<br/>

- **`chrome_act_toward_goal`**: Autonomous semantic micro-loop that perceives, decides, and acts toward a natural-language goal within a local Native Server loop (~200–400ms/step). Powered by TypeSafe Jev System One with seamless fallback to heuristic scoring when no API key is available or on quota/network degradation. Automatically escalates ambiguous, destructive, or complex actions back to the macro planner with pre-fetched page context and a Top-3 decision probability distribution.

</details>

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
<summary><b>📄 2. Content Perception & Data Extraction (5 Tools)</b></summary>

<br/>

- **`chrome_read_dom`**: Pruned interactive DOM tree with 1-based numeric indices. Reduces prompt token consumption by >85%.
- **`chrome_grep`**: Sub-100 token instant regex or text search across elements and text lines without full DOM dumping.
- **`chrome_get_markdown`**: Clean, structured Markdown content extraction (supports `includeLinks: true` for link graph extraction) optimized for long-form reading and article summarization.
- **`chrome_inspect_media`**: Lossless in-memory extraction of raw `<img>` and `<canvas>` data, with 200%+ super-sampling crop fallback for noisy captchas.
- **`chrome_get_dropdown_options`**: Inspect all selectable options within native or custom `<select>` dropdown elements.

</details>

<details>
<summary><b>🖱️ 3. Action Execution & Pipeline (12 Tools)</b></summary>

<br/>

- **`chrome_interact_index`**: Native trusted click, hover, dblclick, or click sequence (`points` array) by 1-based index; supports `includeDelta: true` for autonomous DOM diff feedback.
- **`chrome_fill_index`**: Native trusted text input with automatic value clearing, Enter key submission, and `includeDelta: true` mutation checking.
- **`chrome_batch_actions`**: High-performance multi-step pipeline combining click, fill, press, and wait in a single roundtrip, with built-in `assert` and `extract` rules.
- **`chrome_form_pipeline`**: Deterministic multi-step wizard/questionnaire form pipeline — zero model calls, fastest and most reliable for standard form flows.
- **`chrome_smart_scroll`**: Viewport overflow-aware scrolling with pixel precision and accurate remaining page counts (`pages_down` / `pages_up`).
- **`chrome_keyboard`**: Dispatch physical keystrokes (Enter, Tab, Esc), combinations (Ctrl+C/V), or targeted text input.
- **`chrome_upload_file`**: Intercept file chooser dialogs dynamically or inject absolute local file paths into `<input type="file">`.
- **`chrome_handle_dialog`**: Handle or pre-arm responses for native JavaScript dialogs (alert, confirm, prompt).
- **`chrome_handle_download`**: Track, monitor, and manage active native browser file downloads.
- **`chrome_computer`**: Anthropic Computer Use-compatible unified interface for mouse and keyboard control. _(Legacy compatibility path — prefer `chrome_act_toward_goal` for new autonomous loops.)_
- **`chrome_request_human_intervention`**: Softly dim page, display a frosted-glass banner, park the virtual cursor, and yield control to the human for 2FA or slider captchas.
- **`chrome_undo_last_action`**: 5-step ring buffer undo engine to roll back recent navigation jumps or form input values.

</details>

<details>
<summary><b>👁️ 4. Vision, Console & Low-Level CDP (3 Tools)</b></summary>

<br/>

- **`chrome_screenshot`**: Capture viewport or full-page PNGs with optional high-contrast pixel coordinate grid overlays for visual fallback.
- **`chrome_console`**: Capture, monitor, and filter page-level JavaScript console logs, warnings, and unhandled runtime exceptions.
- **`chrome_cdp_execute`**: Industrial-grade low-level CDP escape hatch with target polymorphic routing and anti-hang auto-detach guards.

</details>

<details>
<summary><b>📡 5. Network Intercept & Storage (5 Tools)</b></summary>

<br/>

- **`chrome_intercept_api`**: Silently sniff and decode backend API responses matching URL patterns to retrieve structured JSON data directly.
- **`chrome_network_capture`**: Start and stop full network traffic recording with status codes, headers, and request/response payloads.
- **`chrome_network_request`**: Dispatch native HTTP requests through the browser session, inheriting all active origin cookies and headers.
- **`chrome_storage`**: Read, write, or clear browser storage state (`localStorage`, `sessionStorage`, and cookies).
- **`chrome_javascript`**: Execute custom JavaScript expressions in the page context with automatic single-expression return detection.

</details>

<details>
<summary><b>🗂️ 6. Tab Groups, Bookmarks & Diagnostics (14 Tools)</b></summary>

<br/>

- **`chrome_tab_group_create`**: Create dedicated colored tab groups with adaptive task titles (default: "Agent").
- **`chrome_tab_group_update`**: Dynamically rename, recolor, or toggle the collapsed state of tab groups.
- **`chrome_tab_group_list`**: List all active tab groups in the window and their associated tabs.
- **`chrome_tab_group_ungroup`**: Remove specific tabs from their parent group.
- **`chrome_tab_group_close`**: Close all tabs in a group and purge the group with zero orphan residue.
- **`chrome_history`**: Query and filter historical browser visits across customizable time ranges.
- **`chrome_bookmark_search` / `add` / `delete`**: Search, create, and remove browser bookmarks.
- **`performance_start_trace` / `stop_trace` / `analyze_insight`**: Record and analyze Core Web Vitals and Chromium performance traces.
- **`chrome_tool_docs`**: Dynamic in-session capability discovery and profile activation (`activateForSession: true`).
- **`chrome_doctor`**: Diagnose environment health, check port 12306, Native Messaging Host, and extension bridge connectivity.

</details>

---

## 🏗️ Architecture

```text
AI Client (Cursor / Claude / Codex)
         │  MCP (HTTP / SSE / Stdio) @ 127.0.0.1:12306
         ▼
Native Messaging Bridge (Fastify + Stdio Host)
         ├── Fast Decision Engine (Jev client + heuristic fallback + micro-loop)
         └── Passthrough for 46 deterministic tools + 1 autonomous micro-loop (47 tools total)
         │  Chrome Native Messaging (1MB buffer guard)
         ▼
Chrome MV3 Extension (Service Worker + WXT + Vue 3)
         ├── Inpage DOM Engine (Isolated World, 1-based indexing)
         ├── CDP Session Manager (10-min retention, domain ref-counting)
         └── Agent Cursor (Closed Shadow DOM spring kinematics overlay)
```

See **[docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md)** for detailed topology and ADR records (including ADR-023: the dual-brain decision layer).

---

## 📚 Documentation Map

- **[Project Map & Index](./docs/MAP.md)**: 🗺️ Master navigation hub, reading paths by role, and code topology.
- **[Tool Reference](./docs/TOOLS.md)**: Auto-generated parameter dictionary for all 47 tools.
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
- **[TypeSafe Jev](https://docs.typesafe.ai)** — and the [jev-browser](https://github.com/jkudish/jev-browser), [jev-voice-browser](https://github.com/moritzkremb/jev-voice-browser) & [jev-ultrafast](https://github.com/browser-use/jev-ultrafast) reference implementations: System One fast-decision patterns, speculative fan-out, and semantic-find criteria design.

---

## 📄 License

[GNU Affero General Public License v3.0 (AGPL-3.0)](./LICENSE). Modifications or SaaS hosted deployments must remain open-source.

---

_Disambiguation: BrowserClaw MCP is an independent Chrome extension and Model Context Protocol automation ecosystem, built for AI agents to control everyday user browsers. It is not affiliated with the standalone `browserclaw` Playwright library on npm._
