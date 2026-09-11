<div align="center">
  <img src="./docs/images/logo.png" width="100" alt="BrowserClaw Logo" />
  <h1>BrowserClaw</h1>
  <p><b>Take full control of everything in your own browser.</b></p>
  <p>
    <a href="./README.zh-CN.md">📖 简体中文说明</a> ·
    <a href="./docs/TOOLS.md">Tool Reference</a> ·
    <a href="./docs/TROUBLESHOOTING.md">Troubleshooting</a> ·
    <a href="https://github.com/GoldenLoaf24h/browserclaw/releases">GitHub Releases</a>
  </p>
</div>

---

<details>
<summary><b>💡 Project Background: The Windows Local Browser Dilemma (Click to expand)</b></summary>

<br/>

When deploying local AI agents (Hermes, Codex, Claude Code), browser automation is critical for real-time web retrieval, data extraction, and authenticated workflows. Ideally, agents should directly inherit the developer's active browser logins (Google, GitHub, internal SSO dashboards) and operate silently in the background without human intervention.

On Windows, however, all existing approaches break down due to low-level OS and Chromium constraints:

1. **Isolated Sandboxes (Playwright / Puppeteer / browser-use)**:
   - **Broken Logins**: Isolated profiles cannot inherit existing credentials, breaking flows on 2FA or captchas.
   - **Windows File Lock Collision (`WinError 32`)**: Attempting to hot-copy `User Data` to emulate login reuse fails immediately on Windows. Chromium holds strict **exclusive sharing locks** on `Cookies` and session databases while running, causing immediate `[WinError 32: The process cannot access the file because it is being used by another process]` crashes.
   - **Zombie Processes**: Process tree detachments frequently leave lingering headless `chrome.exe` instances that eat RAM and GPU resources.

2. **Native Remote Debugging (`--remote-debugging-port`)**:
   - **Intrusive Security Modals**: Modern Chromium displays a mandatory security dialog requiring a human to manually click "Allow" upon every external debugger attach, completely destroying unattended automation.
   - **No Dynamic Attach**: Cannot be attached to a running browser; requires killing all user windows and restarting with debugging flags.
   - **Directory Lock Deadlocks**: Multi-process access to the user profile triggers database locks or browser crashes.

3. **Lack of Windows-First Tooling**:
   - Popular lightweight alternatives consistently prioritize macOS/Linux, leaving Windows developers stranded.

**BrowserClaw** was engineered specifically to overcome this dilemma. By combining **Chrome Native Messaging + a Manifest V3 Extension**, it unlocks seamless session reuse and 100% unattended automation without killing processes or tripping Windows file locks.

</details>

---

## 📌 What is BrowserClaw?

**BrowserClaw** turns the Chrome browser you actually use every day into an ultra-fast, controllable, readable, and verifiable environment for AI agents.

Built on an industrial-grade three-tier architecture (WXT Vue 3 MV3 Extension + Fastify Native Host + Shared Schema) connected via Chrome Native Messaging, BrowserClaw exposes 52 schema-validated MCP tools. Unlike detached headless sandboxes (Playwright / Puppeteer), it lives inside your daily browser — keeping your active logins, cookies, enterprise SSO sessions, and extensions intact, while guaranteeing every dispatched action is a native trusted browser event (`isTrusted=true`).


### 💡 Standing on the Shoulders of Giants (References & Prior Art)
BrowserClaw builds upon and synthesizes the cutting-edge insights from leading browser automation projects:
- **[hangwin/mcp-chrome](https://github.com/hangwin/mcp-chrome)**: The foundational Chrome MV3 extension + Native Messaging IPC bridge architecture.
- **[browser-use/browser-use](https://github.com/browser-use/browser-use)**: Token-efficient DOM-first indexing, human-like execution workflows, and high-performance action serialization.
- **[browseros-ai/BrowserOS](https://github.com/browseros-ai/BrowserOS)**: Autonomous DOM diffing (`includeDelta`), millisecond element grep (`chrome_grep`), and multi-step pipeline assertions.
- **[ChatGPT Official Extension](https://chromewebstore.google.com/detail/chatgpt/hehggadaopoacecdllhhajmbjkdcmajg)**: Spring kinematics virtual cursor overlay (`agent-cursor`), and dedicated Chrome Tab Groups lifecycle isolation.

---

## 🚀 Quick Start (Let AI do the work!)

> **Total User Effort**: Under 1 minute. Let your AI agent handle the environment configuration, while you download the prebuilt extension into Chrome.

### Step 1. Hand it off to your AI Agent
Hand this project folder to your AI assistant (Claude Code, Cursor, Codex, Windsurf, Cline) or ask it:
> *"Please set up BrowserClaw MCP server for me: https://github.com/GoldenLoaf24h/browserclaw"*

Your agent will run the local bridge setup:
```bash
git clone https://github.com/GoldenLoaf24h/browserclaw.git
cd browserclaw
pnpm install && pnpm build
cd app/native-server && node dist/scripts/register-dev.js
```
*(Bearer token is automatically generated under `~/.chrome-mcp/bridge-token`; HTTP endpoint listens at `http://127.0.0.1:12306/mcp`)*

### Step 2. Install Extension in Chrome (Your Only Manual Step)
1. Download **[browserclaw-extension-latest.zip](https://github.com/GoldenLoaf24h/browserclaw/releases/latest)** (~350 KB, clean prebuilt runtime).
2. Unzip it to a permanent local folder (e.g., `browserclaw-extension`).
3. In Chrome or Edge, open `chrome://extensions/` and toggle on **Developer mode** in the top-right corner.
4. Click **Load unpacked** (top-left) and select the unzipped folder.

### Step 3. (AI Proactive Setup) Silent Debugger Mode
> **Proactive Agent Guideline**: During environment setup, the AI assistant should proactively ask the user:
> *"Would you like me to enable Chrome's native silent debugging flag (`--silent-debugger-extension-api`)? This completely suppresses the top "BrowserClaw is debugging this browser" infobar and prevents any viewport shifting or jitter during automation. If you'd like, I can configure your Chrome shortcut for you automatically."*
>
> If the user agrees, append `--silent-debugger-extension-api` to the Chrome launch shortcut or startup command.

Done! Your AI agent now possesses seamless, authenticated control over your browser.

---

## 🛠️ Features & Capabilities (Expandable Categories)

<details open>
<summary><b>🌐 1. Navigation & Tab Management (7 Tools)</b></summary>

<br/>

- **`chrome_navigate`**: Navigate to any URL, refresh page, or navigate history (`"back"` / `"forward"`). Native `background: true` support guarantees tabs open silently in background without stealing foreground user focus.
- **`chrome_switch_tab`**: Switch active tab or bind session tab affinity without UI interference.
- **`chrome_close_tabs`**: Close specific tabs by ID array or close all tabs matching a target URL pattern.
- **`chrome_move_tab`**: Move tabs to new indices or detach/transfer tabs across browser windows.
- **`get_windows_and_tabs`**: Enumerate all open Chrome windows and tabs with IDs, active state, and titles.
- **Full Tab Group Lifecycle (`TabGroupManager`)**:
  - `chrome_tab_group_create`: Create designated colored tab groups with custom task titles (default: "Agent").
  - `chrome_tab_group_update`: Dynamically rename, recolor, or toggle collapsed state of tab groups.
  - `chrome_tab_group_list`: List all active groups in the window and their associated tabs.
  - `chrome_tab_group_ungroup`: Remove specific tabs from their parent group.
  - `chrome_tab_group_close`: Close all tabs in a group and automatically purge the group with zero orphan residue.
- **`chrome_attach_tab` / `chrome_detach_tab`**: Explicitly attach or detach CDP debugging sessions with tab affinity.

</details>

<details open>
<summary><b>👁️ 2. Perception & Content Extraction (7 Tools)</b></summary>

<br/>

- **`chrome_read_dom`**: Pruned DOM tree with 1-based element indices, real-time occlusion detection (`isOccluded`/`occludedBy`), and safe click points; typical 85%+ token compression ratio; supports `deltaOnly: true` for incremental fingerprint updates (< 200 tokens).
- **`chrome_grep`**: Lightweight targeted search without dumping the whole DOM. Instantly returns matching 1-based indices and CSS selectors for interactive elements, full DOM nodes, or visible text lines (< 150 tokens).
- **`assets[]` Visual Media Index**: Automatically catalogues `<img>`, `<canvas>`, `<video>`, and CSS background images with viewport bounding boxes.
- **`chrome_inspect_media`**: High-fidelity targeted media extraction. Extracts raw, lossless resolution bitmaps from Canvas/Images directly in-memory, or captures 200%+ super-sampled close-ups for noisy captchas and complex financial charts.
- **`chrome_get_markdown`**: Clean structural Markdown conversion with `fit: true` noise stripping (removes headers, footers, navigation, and sidebar clutter).
- **`chrome_get_links`**: Complete link graph extraction (absolute URLs, anchor texts, internal/external, and nofollow flags).
- **`chrome_get_dropdown_options`**: Inspect all selectable options within native or simulated `<select>` dropdowns.
- **`chrome_intercept_api`**: CDP Network-domain silent sniffing and JSON response interception. Retrieves structured ground-truth API payloads directly, bypassing complex HTML scraping.

</details>

<details>
<summary><b>⚡ 3. Precision Interaction & Form Automation (13 Tools)</b></summary>

<br/>

- **Unified 4-Tier Locator**: Fallback degradation chain (`ref` → `selector` → `text/role` → `coordinate`) shared across all interaction tools.
- **Self-Driven Diff Piggybacking**: Pass `includeDelta: true` in `chrome_interact_index`, `chrome_fill_index`, or `chrome_batch_actions` to receive incremental DOM changes directly inside the action response, cutting agent roundtrips by 50%.
- **`chrome_interact_index`**: 1-based index clicks and friction-drag (`end`/`steps`/`holdMs`/`dnd`) with center-first occlusion compensation and CDP delivery verification (`deliveryVerified: true`).
- **`chrome_fill_index`**: Fast form filling by 1-based index, auto-focusing and dispatching trusted `input` and `change` events.
- **`chrome_fill_form` / `chrome_fill_or_select`**: Multi-field batch filling and dropdown selection for legacy or non-indexed selectors.
- **Enhanced Pipeline (`chrome_batch_actions`)**: Atomic multi-action pipeline with zero network lag between steps. Supports `type: 'assert'` for runtime state validation and `type: 'extract'` for in-pipeline data extraction into `extractedData`.
- **`chrome_burst_interact`**: Ultra-low latency burst clicks and keypress sequences for dynamic canvas games and moving targets.
- **`chrome_computer`**: 16 native mouse and keyboard actions with `dwellMs` hold duration to defeat instant-click bot guards.
- **`chrome_keyboard`**: Physical keyboard keypress dispatch with modifier combos (Control+A, Enter, Tab).
- **`chrome_upload_file`**: Headless file upload injection directly into file input elements without modal deadlocks.
- **`chrome_handle_dialog`**: Automatically intercept and respond to native `alert`, `confirm`, and `prompt` JavaScript dialogs.
- **1:1 ChatGPT Official Agent Cursor**: Isolated closed Shadow DOM overlay, bezier arc motion, velocity stretch springs, luminous blue trail, and instant fade-out upon physical human takeover.
- **Luminous Glowing Favicon**: Displays a real-time pulsing SVG glow on tabs being operated by the agent, cleanly restored upon task completion.

</details>

<details>
<summary><b>🔭 4. Observation & Intelligent Scrolling (5 Tools)</b></summary>

<br/>

- **`chrome_screenshot`**: Zero-disk screenshot pipeline (>450KB auto-degrades to inline thumbnail, bottom/right black-bar auto-recapture, and targeted image extraction via `assetIndex`).
- **`chrome_smart_scroll`**: Intelligent container overflow detection; scrolls the most prominent scrollable element and calculates accurate `pages_up` / `pages_down` remaining page counts.
- **`chrome_scroll_to_text`**: TreeWalker semantic search scrolling; smoothly centers specific target text into viewport view.
- **`chrome_scroll`**: Direct physical wheel scrolling by pixel deltas or fractional viewport pages.

</details>

<details>
<summary><b>🗂️ 5. Browser Data & State Management (History, Bookmarks, Storage, Downloads - 9 Tools)</b></summary>

<br/>

- **`chrome_history`**: Search user browser history by query string with full visit timestamp and URL filtering.
- **Complete Bookmark Management**:
  - `chrome_bookmark_search`: Search bookmarks by title, URL, or folder hierarchy.
  - `chrome_bookmark_add`: Add new bookmarks with custom titles and destination folder IDs.
  - `chrome_bookmark_delete`: Remove obsolete bookmark nodes.
- **`chrome_storage`**: Comprehensive storage inspection, reading, updating, and clearing across `localStorage`, `sessionStorage`, and `IndexedDB`.
- **`chrome_handle_download`**: Intercept, monitor, and locate downloaded files on disk without dialog prompts.

</details>

<details>
<summary><b>🛠️ 6. Diagnostics, Low-Level CDP & Human Collaboration (11 Tools)</b></summary>

<br/>

- **`chrome_console`**: Real-time console log monitoring; captures `log`, `warn`, `error`, and unhandled promise rejections.
- **`chrome_javascript`**: Secure in-page JavaScript evaluation with immediate return value serialization.
- **`chrome_cdp_execute`**: Raw CDP escape hatch with polymorphic Target routing and auto-detach timeout guard.
- **Performance Tracing Suite**:
  - `performance_start_trace`: Start high-resolution timeline tracing.
  - `performance_stop_trace`: Stop tracing and export DevTools timeline trace logs.
  - `performance_analyze_insight`: Diagnose Core Web Vitals, Long Tasks, CLS, and FID bottlenecks.
- **Human Takeover Banner (`chrome_request_human_intervention`)**: Renders a frosted-glass top banner during 2FA, SMS verification, or slider captchas; resumes automatically on button click or `Enter`.
- **Action Snapshots & Rollback (`chrome_undo_last_action`)**: 5-step circular history stack supporting automatic page back-navigation and form input value reversal.
- **`chrome_tool_docs`**: Dynamic on-the-fly tool schema inspection and runtime category activation (`activateForSession: true`).

</details>

<details>
<summary><b>📊 52 Tools across 3 Profiles (Core, Crawl, Full)</b></summary>

<br/>

| Profile | Environment Variable | Tool Count | Schema Overhead | Best For |
| :--- | :--- | :--- | :--- | :--- |
| **full** (default) | *Unset* | **52** | ~19.5k tokens | Full low-level CDP access, diagnostic tracing, and storage management |
| **core** | `CHROME_MCP_TOOL_PROFILE=core` | **24** | ~11.5k tokens | Daily browsing, semantic DOM indexing, form filling, and fast grep |
| **crawl** | `CHROME_MCP_TOOL_PROFILE=crawl` | **15** | ~5.8k tokens | High-speed batch scraping, clean markdown, and API interception |

> **Note**: Tools hidden by profiles can be inspected via `chrome_tool_docs` and activated on-the-fly via `activateForSession: true` without restarting the MCP server.

</details>

---

## 🏗️ Architecture & Topology

```
AI Agent Client (Claude Desktop / Cursor / Codex / Cline)
        │
        ▼ (HTTP/SSE or Stdio JSON-RPC with Bearer Auth)
Local Native Host (Fastify, 127.0.0.1:12306)
        │
        ▼ (Chrome Native Messaging IPC, <= 1MB frame ceiling)
BrowserClaw Extension MV3 Service Worker
        │
        ▼ (Isolated World Inpage Engine & Direct CDP Channel)
Active Chrome Browser Session (isTrusted: true, zero-orphan tab groups)
```

---

## 🌍 Universal Cross-Platform Compatibility

BrowserClaw is architected from the ground up for seamless operation across all operating systems and Chromium-derived environments:

| Platform / Environment | Native Messaging Path | Shell Wrapper | OS-Specific Adaptations |
| :--- | :--- | :--- | :--- |
| **Windows** (10 / 11, x64 / ARM64) | `%APPDATA%\Google\Chrome\NativeMessagingHosts` + Registry | `run_host.bat` (auto node_path.txt) | Immune to `WinError 32` file locks; auto-handles Control key combos and `net session` elevation |
| **macOS** (Apple Silicon & Intel) | `~/Library/Application Support/Google/Chrome/NativeMessagingHosts` | `run_host.sh` (9-tier Node discovery) | Auto-adapts to Homebrew (`/opt/homebrew`), Volta, asdf, NVM; auto-maps `Meta` (Command+A) keys |
| **Linux** (x86_64 & aarch64) | `~/.config/google-chrome/NativeMessagingHosts` (XDG standard) | `run_host.sh` (XDG state logging) | Compliant with `$XDG_STATE_HOME`; zero display-server locks for headless or desktop automation |
| **Supported Browsers** | Chrome, Edge, Chromium, Brave, Arc, Opera | Direct Native Manifest | Multi-browser simultaneous discovery (`detectInstalledBrowsers`); Firefox target supported via WXT |

---

## 🧪 Quality Gate & Test Coverage

```bash
pnpm dev              # Watch all packages concurrently
pnpm typecheck        # Repo-wide tsc --noEmit & vue-tsc
pnpm lint && pnpm format
```

| Test Suite | Command | Test Cases |
| :--- | :--- | :--- |
| **Extension Unit (Vitest)** | `pnpm --filter chrome-mcp-server test` | **125 passed (100%)** |
| **Hardening Regression (node:test)** | `node test/p0-p1-hardening.test.ts` | **21 passed (100%)** |
| **Native Bridge (Jest)** | `pnpm --filter mcp-chrome-bridge test` | **30 passed (100%)** |
| **Type Check** | `pnpm --filter chrome-mcp-server compile` | **0 error** |

---

## 📚 Documentation Map

- [Tool Reference](./docs/TOOLS.md): Complete parameter references for all 52 tools (auto-generated).
- [Architecture Design](./docs/ARCHITECTURE.md): Detailed system topology, sequence flows, and ADR records.
- [Troubleshooting Guide](./docs/TROUBLESHOOTING.md): Quick diagnostic checklist for connection issues.
- [Agent Skill Playbook](./skill/SKILL.md): Agent instruction guide for dual-engine workflows, Escalation Ladder, and micro-patterns.
- [MCP Client Configuration](./AGENT_CONFIG_GUIDE.md): Ready-to-copy client configs for Claude, Cursor, Windsurf, Cline, and Antigravity.

---

## 📄 License

GNU Affero General Public License v3.0 (AGPL-3.0) — see [LICENSE](./LICENSE).

BrowserClaw is strictly protected under the AGPL-3.0 license: anyone modifying, bundling, or offering this software as a cloud service / SaaS API is legally mandated to open source their complete modified source code under the same license.

Portions of this software are derived from upstream hangwin/mcp-chrome (licensed under MIT, copyright its original authors).

---

_Disambiguation: BrowserClaw MCP is an independent Chrome extension and Model Context Protocol automation ecosystem, built for AI agents to control everyday user browsers. It is not affiliated with the standalone `browserclaw` Playwright library on npm._
