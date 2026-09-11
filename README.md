# BrowserClaw

> Turn the Chrome you **actually use** into an ultra-fast, controllable, readable, and verifiable automation environment for AI agents.
>
> 📖 [简体中文说明](./README.zh-CN.md) · [Tool Reference](./docs/TOOLS.md) · [Troubleshooting](./docs/TROUBLESHOOTING.md) · [GitHub Releases](https://github.com/GoldenLoaf24h/browserclaw/releases)

BrowserClaw is an industrial-grade browser automation engine built on top of [hangwin/mcp-chrome](https://github.com/hangwin/mcp-chrome) (MIT): featuring a three-tier architecture (WXT Vue 3 MV3 Chrome Extension + Fastify Native Host + Shared Type Schema), connected through Chrome Native Messaging, exposing CDP capabilities as **52 schema-validated MCP tools**.

Unlike headless browser drivers (Playwright, Puppeteer, Selenium), BrowserClaw runs directly inside your **real, everyday Chrome/Edge browser** — preserving your active logins, cookies, enterprise SSO sessions, and extensions. Every dispatched click and keystroke is a native, trusted browser event (`isTrusted=true`).

---

## 🌟 Highlights & Capabilities

### 👁️ Perception Layer — Giving Agents Clear Sight
- **`chrome_read_dom`**: Pruned DOM tree with 1-based element indices, real-time occlusion detection (`isOccluded`/`occludedBy`), and safe click points; typical 85%+ token compression ratio; supports `deltaOnly: true` for incremental fingerprint updates (< 200 tokens).
- **`chrome_grep`**: Lightweight targeted search without dumping the whole DOM. Instantly returns matching 1-based indices and CSS selectors for interactive elements, full DOM nodes, or visible text lines (< 150 tokens).
- **`assets[]` Visual Media Index**: Automatically catalogues `<img>`, `<canvas>`, `<video>`, and CSS background images with viewport bounding boxes.
- **`chrome_inspect_media`**: High-fidelity targeted media extraction. Extracts raw, lossless resolution bitmaps from Canvas/Images directly in-memory, or captures 200%+ super-sampled close-ups for noisy captchas and complex financial charts.
- **`chrome_get_markdown`**: Clean structural Markdown conversion with `fit: true` noise stripping (removes headers, footers, navigation, and sidebar clutter).
- **`chrome_intercept_api`**: CDP Network-domain silent sniffing and JSON response interception. Retrieves structured ground-truth API payloads directly, bypassing complex HTML scraping.

### ⚡ Interaction Layer — Precision Action & Zero Roundtrip Lag
- **Unified 4-Tier Locator**: Fallback degradation chain (`ref` → `selector` → `text/role` → `coordinate`) shared across all interaction tools.
- **Self-Driven Diff Piggybacking**: Pass `includeDelta: true` in `chrome_interact_index`, `chrome_fill_index`, or `chrome_batch_actions` to receive incremental DOM changes directly inside the action response, cutting agent roundtrips by 50%.
- **`chrome_interact_index`**: 1-based index clicks and friction-drag (`end`/`steps`/`holdMs`/`dnd`) with center-first occlusion compensation and CDP delivery verification (`deliveryVerified: true`).
- **Enhanced Pipeline (`chrome_batch_actions`)**: Atomic multi-action pipeline with zero network lag between steps. Supports `type: 'assert'` for runtime state validation and `type: 'extract'` for in-pipeline data extraction into `extractedData`.
- **1:1 ChatGPT Official Agent Cursor**: Isolated closed Shadow DOM overlay, bezier arc motion, velocity stretch springs, luminous blue trail, and instant fade-out upon physical human takeover.
- **Chrome Tab Groups with Zero-Orphan Cleanup**: Automatically organizes agent-spawned tabs under a dedicated colored Tab Group ("Agent") and purges empty groups upon completion.
- **Luminous Glowing Favicon**: Displays a real-time pulsing SVG glow on tabs being operated by the agent, cleanly restored upon task completion.
- **Human Takeover Banner (`chrome_request_human_intervention`)**: Renders a frosted-glass top banner during 2FA, SMS verification, or slider captchas; resumes automatically on button click or `Enter`.
- **Action Snapshots & Rollback (`chrome_undo_last_action`)**: 5-step circular history stack supporting automatic page back-navigation and form input value reversal.
- **CDP Escape Hatch (`chrome_cdp_execute`)**: Polymorphic Target routing (`tabId` / `targetId` / `sessionId`) with anti-hang timeout detachment protection.

---

## 🛠️ 52 Tools across 3 Profiles

| Profile | Environment Variable | Tool Count | Schema Overhead | Best For |
| :--- | :--- | :--- | :--- | :--- |
| **full** (default) | *Unset* | **52** | ~19.5k tokens | Full low-level CDP access, diagnostic tracing, and storage management |
| **core** | `CHROME_MCP_TOOL_PROFILE=core` | **24** | ~11.5k tokens | Daily browsing, semantic DOM indexing, form filling, and fast grep |
| **crawl** | `CHROME_MCP_TOOL_PROFILE=crawl` | **15** | ~5.8k tokens | High-speed batch scraping, clean markdown, and API interception |

> **Note**: Tools hidden by profiles can be inspected via `chrome_tool_docs` and activated on-the-fly via `activateForSession: true` without restarting the MCP server.

---

## 📋 Requirements

| Dependency | Version | Notes |
| :--- | :--- | :--- |
| **Chrome / Edge** | ≥ 120 (MV3) | Your everyday browser; no isolated instances required |
| **Node.js** | ≥ 20 (22 LTS recommended) | Native host runtime & build system |
| **pnpm** | ≥ 9 | Monorepo package manager |
| **Operating System** | Windows / macOS / Linux | Native Messaging Host manifests auto-configure |

---

## 🚀 Quick Start

### Method A: Download Clean Prebuilt Extension (Recommended)
1. Go to [GitHub Releases](https://github.com/GoldenLoaf24h/browserclaw/releases/latest) and download `browserclaw-extension-v2.0.0.zip` (~350 KB).
2. Unzip to any local folder (e.g. `browserclaw-extension`).
3. Open Chrome / Edge, navigate to `chrome://extensions/`, and enable **Developer mode**.
4. Click **Load unpacked** and select the unzipped directory.
5. (Optional) Download `browserclaw-skill-v2.0.0.zip` and unzip into your agent's skill directory (e.g. `~/.codex/skills/browserclaw`).

### Method B: Build from Source
```bash
git clone https://github.com/GoldenLoaf24h/browserclaw.git
cd browserclaw
pnpm install
pnpm build        # Builds shared -> extension -> native-server
```
- Extension output: `app/chrome-extension/.output/chrome-mv3`
- Native server output: `app/native-server/dist`

### Register the Native Messaging Host (One-Time)
```bash
cd app/native-server
node dist/scripts/register-dev.js        # User-level registration (No admin required)
```

### Connect Your MCP Client
- **HTTP / SSE endpoint**: `http://127.0.0.1:12306/mcp` (Bearer token stored in `~/.chrome-mcp/bridge-token`).
- **Stdio Configuration**:
```json
{
  "mcpServers": {
    "browserclaw": {
      "command": "node",
      "args": ["<repo-root>/app/native-server/dist/mcp/mcp-server-stdio.js"]
    }
  }
}
```

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
