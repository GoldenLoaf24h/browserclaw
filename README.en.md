# BrowserClaw (English)

> Turn the Chrome you **actually use** into a controllable, readable, verifiable environment for AI agents.
>
> 📖 中文文档：[README.md](./README.md) · Tool reference: [docs/TOOLS.md](./docs/TOOLS.md) · Troubleshooting: [docs/TROUBLESHOOTING.md](./docs/TROUBLESHOOTING.md)

BrowserClaw is a heavily optimized fork of [hangwin/mcp-chrome](https://github.com/hangwin/mcp-chrome) (MIT): a WXT (Vue 3) MV3 extension + Fastify native host + shared schema package, connected over Chrome Native Messaging, exposing CDP as **46 schema-validated MCP tools**.

Unlike headless browsers (Playwright/Puppeteer), it runs inside your daily browser — cookies, logins and extensions included — and every input event is a native trusted event (isTrusted=true).

## Highlights

### Perception

- **chrome_read_dom**: pruned DOM tree with 1-based indexes, occlusion detection (isOccluded/occludedBy) and safe click points; typical compression ratio 0.6
- **chrome_grep**: lightweight targeted search without full DOM dump; fast regex/text search over interactive elements, full DOM, or visible lines (< 150 tokens)
- **assets[] visual index**: img/canvas/video/CSS background images with viewport boxes; chrome_screenshot returns real image bytes by assetIndex (canvas anti-scrape content included), viewport-crop fallback when bytes are unobtainable
- **chrome_inspect_media**: targeted media extraction; lossless native-resolution Canvas/image extraction or 200%+ super-sampling close-up crop for captchas and complex charts
- **chrome_get_markdown**: structured markdown; fit:true strips nav/header/footer/aside noise (crawl4ai fit-markdown equivalent)
- **chrome_get_links**: link graph (absolute URL, anchor text, internal/external, nofollow)
- **chrome_intercept_api**: silent CDP Network API response sniffing and JSON interception, retrieving ground truth without messy DOM reverse engineering

### Interaction

- **Unified locator**: ref → selector → text/role → coordinate fallback, shared by every interaction tool
- **Self-driven Diff piggybacking**: pass `includeDelta: true` in `chrome_interact_index`, `chrome_fill_index`, and `chrome_batch_actions` to get incremental DOM changes directly in the action response, cutting 50% round trips
- **chrome_interact_index**: 1-based index clicks + smooth drag (end/steps/holdMs/dnd) with center-first occlusion compensation and CDP delivery verification
- **Enhanced Batch Pipeline (chrome_batch_actions)**: atomic multi-action sequence with `type: 'assert'` (pre/post condition checks) and `type: 'extract'` (in-pipeline text/value/attribute extraction)
- **1:1 ChatGPT Official Agent Cursor**: isolated closed Shadow DOM overlay, bezier arc motion, velocity stretch springs, luminous blue trail, and instant fade-out on human takeover
- **Native Chrome Tab Groups with Zero-Orphan Cleanup (TabGroupManager)**: dedicated colored tab groups ("Agent"), auto-destroyed on tab closure
- **Luminous Glowing Favicon (TabFaviconManager)**: real-time glowing SVG pulse indicator during tasks, cleanly restored on finish
- **Human-in-the-loop Interventions (chrome_request_human_intervention)**: frosted glass banner on 2FA/captchas, resumed instantly by button click or Enter
- **Action Snapshots and Rollback (chrome_undo_last_action)**: 5-step circular stack for navigation history and form value rollback
- **CDP Escape Hatch (chrome_cdp_execute)**: polymorphic Target routing with auto-detach timeout protection to prevent thread hangs

### Reliability

- Zero-disk screenshots: >450KB degrades to an inline thumbnail; black-bar sampling auto-recaptures once
- Tool surface = schema surface (pinned by tests); profile-hidden tools discoverable via chrome_tool_docs
- Agent-friendly errors: structured messages with bounded stacks, no raw exception leaks
- Guards: chrome:// page blocking, cross-origin screenshot domain check, Session Tab Affinity

## 52 tools x 3 profiles

| Profile | Env | Tools | Schema cost |
| --- | --- | --- | --- |
| full (default) | unset | 52 | ~19.5k tokens |
| core | CHROME_MCP_TOOL_PROFILE=core | 24 | ~11.5k tokens |
| crawl | CHROME_MCP_TOOL_PROFILE=crawl | 15 | ~5.8k tokens |

## Requirements

| Dependency | Version | Notes |
| --- | --- | --- |
| Chrome / Edge | >= 120 (MV3) | your daily browser; no separate instance |
| Node.js | >= 20 (22 LTS recommended) | native host & build |
| pnpm | >= 9 (lockfile v9) | package manager |
| OS | Windows / macOS / Linux | host registration paths auto-adapt |

## Install

```bash
git clone https://github.com/GoldenLoaf24h/browserclaw.git
cd browserclaw
pnpm install
pnpm build        # shared -> extension -> native-server
```

1. Load app/chrome-extension/.output/chrome-mv3 via chrome://extensions (developer mode). Firefox: pnpm --filter chrome-mcp-server build:firefox.
2. Register the native host (one-time, user-level, no admin):

```bash
cd app/native-server
node dist/scripts/register-dev.js
```

3. Point your MCP client at http://127.0.0.1:12306/mcp (Bearer token in ~/.chrome-mcp/bridge-token) or stdio:

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

System-level host registration: node dist/cli.js register --system (admin). Verify with chrome_tool_docs { "category": "perceive" }.

## How it works

```
MCP Client (stdio/HTTP) ──► Native Host (Fastify, 127.0.0.1:12306)
        |  Bearer auth, per-session isolation (10-min idle reclaim)
        v
   Native Messaging (1MB frame cap)
        v
Chrome Extension MV3 Service Worker
        |  46 tool executors + Unified Locator + Screenshot Context
        v
Inpage Engine (isolated world, 20 entrypoints) ──► CDP (DOM/Page/Input/Runtime)
```

The popup exposes connection controls and a master agent switch (off = all tool calls rejected).

## Development & tests

```bash
pnpm dev              # watch all packages
pnpm typecheck        # repo-wide tsc --noEmit (vue-tsc for the extension)
pnpm lint && pnpm format
```

| Suite | Command | Cases |
| --- | --- | --- |
| Extension unit (vitest) | pnpm --filter chrome-mcp-server test | 77 |
| Repo regression (node:test) | node --experimental-strip-types --test test/boost-*.test.ts test/p0-p1-hardening.test.ts | 129 |
| E2E (4 tiers) | pnpm test | 153 |

Reload the extension after code changes. Regenerate tool docs: node scripts/gen-tools-doc.mjs.

## Docs map

| Doc | Content |
| --- | --- |
| skill/SKILL.md | agent playbook: dual-engine workflow, batching, visual fallback, index recovery |
| docs/TOOLS.md | 46-tool parameter reference (schema-generated) |
| docs/ARCHITECTURE.md | architecture & data flow (mermaid) |
| docs/TROUBLESHOOTING.md | error lookup & connection debugging |
| AGENT_CONFIG_GUIDE.md | per-client MCP configuration |
| TEST_INFRA.md | E2E infrastructure spec |

## License

MIT — see LICENSE. Upstream hangwin/mcp-chrome is (c) its authors.
