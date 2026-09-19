# BrowserClaw Project Specifications & Notes

[Chinese Version (zh-CN)](./PROJECT.zh-CN.md)

## Positioning & Core Philosophy

BrowserClaw is a high-performance Model Context Protocol (MCP) server engineered for AI agents to control the user's real Chrome browser. Unlike headless automation runtimes (Playwright, Puppeteer, Selenium), BrowserClaw operates directly within the user's everyday Google Chrome instance—preserving existing login sessions, cookies, and extension ecosystems. It exposes browser capabilities as 48 schema-validated canonical MCP tools via Chrome Native Messaging and the Chrome DevTools Protocol (CDP).

## Monorepo Architecture (pnpm)

1. **`packages/shared`** (`chrome-mcp-shared`):
   - **Single Source of Truth**: Houses all 48 canonical MCP tool schemas (`TOOL_SCHEMAS`), tool profiles (`core`: 14, `crawl`: 12, `full`: 48), the `UnifiedLocatorOptions` coordinate contract, and standardized error formatters.
2. **`app/native-server`** (`mcp-chrome-bridge`):
   - **Fastify Native Host**: Manages dual MCP transports (Stdio and HTTP/SSE on `127.0.0.1:12306`), `McpSessionManager` (isolated per-session server instances with 10-minute idle eviction), `bridge-token` authentication, and Chromium performance trace analyzers.
3. **`app/chrome-extension`** (`chrome-mcp-server`):
   - **WXT + Vue 3 Manifest V3 Extension**: Background Service Worker housing tool executors and CDP session management. Features a 1:1 spring-kinematics virtual cursor overlay, automatic colored tab grouping with zero-residue cleanup, and tab favicon illumination. The `inpage-engine` executes isolated-world 1-based DOM pruning and indexing.

## Key Architectural Principles

- **Tool Surface Strict Parity**: The runtime `toolsMap` is strictly derived from `TOOL_SCHEMAS`. Internal helper executors cannot be invoked directly without explicit schema declaration (guaranteed by tool surface parity test suites).
- **Profile Layering & Dynamic Discovery**: Features 3 primary profiles (`core`: 14, `crawl`: 12, `full`: 48) across 8 tool categories (`navigate`, `perceive`, `act`, `observe`, `manage`, `diagnose`, `network`, `crawl`). Hidden tools can be inspected via `chrome_tool_docs` and dynamically activated on-demand (`activateForSession: true`) across both HTTP and Stdio without process restarts.
- **Autonomous DOM Diff Piggybacking**: Interactive tools (`chrome_interact_index`, `chrome_fill_index`, `chrome_batch_actions`) support `includeDelta: true`, returning local element mutations directly in the action response to eliminate 50% of round-trip inspection overhead.
- **Targeted Grep Optimization**: `chrome_grep` supports multi-frame hierarchical remapping and matches against text, `placeholder`, `aria-label`, and `value`. It provides three distinct search modes (interactive elements, full DOM, and plain text), eliminating wasteful multi-thousand-token full DOM dumps.
- **Closed-Loop Action Pipelines**: `chrome_batch_actions` chains discrete clicks, fills, waits, assertions (`assert`), and field extractions (`extract`) within a single network round-trip, supporting cross-origin iframe coordinate translation.
- **Human-in-the-Loop & Undo Safety**: Combines raw CDP penetration (`chrome_cdp_execute`) with safe native DOM frosted-glass takeover banners (`chrome_request_human_intervention`, completely immune to DOM XSS) and a 5-step circular stack undo mechanism (`chrome_undo_last_action`).
- **MV3 Session State Persistence**: `SessionTabAffinityManager`, `TabGroupManager`, and `TabFaviconManager` persist state in `chrome.storage.session` to withstand 30-second Chrome Service Worker idle termination and restarts.
- **CDP Domain Reference Counting**: `CDPSessionManager` tracks domain-level references (`enableDomain` / `disableDomain`), keeping core domains active while low-level timeout guards trigger physical detachment (`chrome.debugger.detach`) to prevent deadlocks.
- **Security & Privilege Boundaries**: `chrome.runtime.onMessage` strictly rejects messages originating from webpage content scripts (`_sender.tab`) or external extensions, blocking unauthorized tool dispatch.
- **Diskless Visual Pipeline**: Screenshot data remains entirely in-memory. Inactive background tabs strictly dispatch offscreen CDP `Page.captureScreenshot(fromSurface: true)`, preventing foreground screen leaks and `requestAnimationFrame` freezing deadlocks.
- **Human Kinematics & Platform Alignment**: Dispatches native CDP `Input` events (`isTrusted: true`), configurable `dwellMs` press duration, macOS Command key alignment (`mod = 4`), and explicit confirmation protection (`confirm: true`) for `chrome_close_tabs`.

## Quality Gates & Verification Matrix

- **Chrome Extension Vitest**: 336 unit tests passing 100% across 44 suites (including tab closing, javascript execution, grep, delta diffs, batch assertions, media extraction, deep shadow DOM piercing, visual drift compensation, and undo).
- **Native Server Jest**: 89 unit and integration tests passing 100% (including Jev fast-decision engine, heuristic scoring, client resilience, and session managers).
- **End-to-End Suite**: 153 four-tier E2E tests passing 100% (`node --experimental-strip-types test/e2e/runner.ts`).
- **Plugin Integration**: 8 Pytest cases passing 100% (`plugins/browserclaw/tests/test_bridge_token.py`).
- **Type Checking**: 0 errors across all monorepo packages (`pnpm typecheck`).
