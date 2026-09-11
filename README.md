<div align="center">
  <img src="./docs/images/logo.png" width="100" alt="BrowserClaw Logo" />
  <h1>BrowserClaw</h1>
  <p>Turn the Chrome you <b>actually use</b> into an ultra-fast, controllable, readable, and verifiable automation environment for AI agents.</p>
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

BrowserClaw is an industrial-grade browser automation engine built on top of [hangwin/mcp-chrome](https://github.com/hangwin/mcp-chrome) (MIT): featuring a three-tier architecture (WXT Vue 3 MV3 Chrome Extension + Fastify Native Host + Shared Type Schema), connected through Chrome Native Messaging, exposing CDP capabilities as **52 schema-validated MCP tools**.

Unlike headless browser drivers (Playwright, Puppeteer, Selenium), BrowserClaw runs directly inside your **real, everyday Chrome/Edge browser** — preserving your active logins, cookies, enterprise SSO sessions, and extensions. Every dispatched click and keystroke is a native, trusted browser event (`isTrusted=true`).

---

## 🚀 Quick Start (Let AI do the work!)

> **Total User Effort**: Under 1 minute. Let your AI agent handle the environment configuration, while you download the prebuilt extension into Chrome.

### Step 1. Hand it off to your AI Agent
Hand this project folder to your AI assistant (Claude Code, Cursor, Codex, Windsurf, Cline) or ask it:
> *"Please set up BrowserClaw MCP server for me."*

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

Done! Your AI agent now possesses seamless, authenticated control over your browser.

---

## 🛠️ Features & Capabilities (Expandable Categories)

<details open>
<summary><b>👁️ Perception Layer — Giving Agents Clear Sight</b></summary>

<br/>

- **`chrome_read_dom`**: Pruned DOM tree with 1-based element indices, real-time occlusion detection (`isOccluded`/`occludedBy`), and safe click points; typical 85%+ token compression ratio; supports `deltaOnly: true` for incremental fingerprint updates (< 200 tokens).
- **`chrome_grep`**: Lightweight targeted search without dumping the whole DOM. Instantly returns matching 1-based indices and CSS selectors for interactive elements, full DOM nodes, or visible text lines (< 150 tokens).
- **`assets[]` Visual Media Index**: Automatically catalogues `<img>`, `<canvas>`, `<video>`, and CSS background images with viewport bounding boxes.
- **`chrome_inspect_media`**: High-fidelity targeted media extraction. Extracts raw, lossless resolution bitmaps from Canvas/Images directly in-memory, or captures 200%+ super-sampled close-ups for noisy captchas and complex financial charts.
- **`chrome_get_markdown`**: Clean structural Markdown conversion with `fit: true` noise stripping (removes headers, footers, navigation, and sidebar clutter).
- **`chrome_intercept_api`**: CDP Network-domain silent sniffing and JSON response interception. Retrieves structured ground-truth API payloads directly, bypassing complex HTML scraping.

</details>

<details>
<summary><b>⚡ Precision Interaction Layer — Precision Action & Zero Roundtrip Lag</b></summary>

<br/>

- **Unified 4-Tier Locator**: Fallback degradation chain (`ref` → `selector` → `text/role` → `coordinate`) shared across all interaction tools.
- **Self-Driven Diff Piggybacking**: Pass `includeDelta: true` in `chrome_interact_index`, `chrome_fill_index`, or `chrome_batch_actions` to receive incremental DOM changes directly inside the action response, cutting agent roundtrips by 50%.
- **`chrome_interact_index`**: 1-based index clicks and friction-drag (`end`/`steps`/`holdMs`/`dnd`) with center-first occlusion compensation and CDP delivery verification (`deliveryVerified: true`).
- **Enhanced Pipeline (`chrome_batch_actions`)**: Atomic multi-action pipeline with zero network lag between steps. Supports `type: 'assert'` for runtime state validation and `type: 'extract'` for in-pipeline data extraction into `extractedData`.
- **1:1 ChatGPT Official Agent Cursor**: Isolated closed Shadow DOM overlay, bezier arc motion, velocity stretch springs, luminous blue trail, and instant fade-out upon physical human takeover.
- **Chrome Tab Groups with Zero-Orphan Cleanup**: Automatically organizes agent-spawned tabs under a dedicated colored Tab Group ("Agent") and purges empty groups upon completion.
- **Luminous Glowing Favicon**: Displays a real-time pulsing SVG glow on tabs being operated by the agent, cleanly restored upon task completion.

</details>

<details>
<summary><b>🤝 Human-in-the-Loop & Reliability</b></summary>

<br/>

- **Human Takeover Banner (`chrome_request_human_intervention`)**: Renders a frosted-glass top banner during 2FA, SMS verification, or slider captchas; resumes automatically on button click or `Enter`.
- **Action Snapshots & Rollback (`chrome_undo_last_action`)**: 5-step circular history stack supporting automatic page back-navigation and form input value reversal.
- **CDP Escape Hatch (`chrome_cdp_execute`)**: Polymorphic Target routing (`tabId` / `targetId` / `sessionId`) with anti-hang timeout detachment protection.
- **Zero-Disk Screenshots**: >450KB degrades to an inline thumbnail; black-bar sampling auto-recaptures once.
- **Security Guardrails**: `chrome://` page blocking, cross-origin screenshot domain check, and Session Tab Affinity.

</details>

<details>
<summary><b>🗂️ 52 Tools across 3 Profiles</b></summary>

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

MIT License — see [LICENSE](./LICENSE). Upstream hangwin/mcp-chrome is copyright its original authors.
