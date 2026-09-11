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

Traditional browser automation tools (Playwright, Puppeteer, browser-use) run in isolated throwaway sandboxes. They lose your active logins, cookies, and extensions. Attempting to copy user directories on Windows immediately crashes with `[WinError 32]` exclusive file locks, while `--remote-debugging-port` triggers intrusive security prompts.

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

## 🛠️ Tool Surface Overview (52 MCP Tools)

BrowserClaw organizes 52 schema-validated tools into dynamic profiles (**Core: 24**, **Crawl: 15**, **Full: 52**). Full parameter docs live in **[docs/TOOLS.md](./docs/TOOLS.md)**.

| Category | Tools Count | Key Capabilities |
| :--- | :---: | :--- |
| **Navigation & Tabs** | 7 | `navigate` (background-safe), `switch_tab`, `close_tabs`, `tab_groups` |
| **Content & Extraction** | 10 | `read_dom` (pruned), `get_markdown`, `grep` (sub-100 tokens), `get_links` |
| **Action & Interaction** | 8 | `interact_index` (with diff), `fill_index`, `batch_actions` (pipeline), `smart_scroll` |
| **Vision & Canvas** | 5 | `screenshot` (grid overlay), `inspect_media` (lossless canvas/img extract) |
| **Network & Intercept** | 6 | `intercept_api` (silent JSON catch), `network_capture`, `get_cookies` |
| **Control & Safeguards** | 16 | `request_human_intervention`, `undo_last_action`, `cdp_execute` (anti-hang) |

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
