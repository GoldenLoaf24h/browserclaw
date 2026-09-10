# BrowserClaw (English)

> A Chrome browser automation MCP server — turning the Chrome you actually use into a controllable, readable, verifiable environment for AI agents. Chinese docs: [README.md](./README.md).

BrowserClaw is a heavily optimized fork of [hangwin/mcp-chrome](https://github.com/hangwin/mcp-chrome) (MIT): a WXT (Vue 3) MV3 extension + a Fastify native host + a shared schema package, connected over Chrome Native Messaging, exposing CDP as 46 schema-validated MCP tools.

## What it solves

1. **DOM noise** — chrome_read_dom emits a pruned element tree with 1-based indexes, occlusion detection and safe click points; visual assets get their own assets[] list with viewport boxes, and chrome_screenshot can return image bytes directly by assetIndex.
2. **Coordinate ambiguity** — all coordinate tools go through a unified locator (ref → selector → text/role → coordinate) with an explicit coordinateSpace (viewport default / screenshot mapping); no silent rescaling from stale screenshot contexts.
3. **Anti-automation traps** — CDP Input events are native trusted events; clicks support dwellMs hold time, drag steps/holdMs, and burst trajectories.

## Profiles

| Profile | Tools | Schema cost |
| --- | --- | --- |
| full (default) | 46 | ~17.2k tokens |
| core | 28 | ~13.2k tokens |
| crawl | 12 | ~4.8k tokens |

Hidden tools stay discoverable via chrome_tool_docs (available in every profile).

## Architecture & quick start

See the [Chinese README](./README.md) for the full architecture diagram and setup steps; the short version:

```bash
pnpm install && pnpm build
# load app/chrome-extension/.output/chrome-mv3 in chrome://extensions
# register the native host (app/native-server/install.md)
# MCP endpoint: http://127.0.0.1:12306/mcp (Bearer token in ~/.chrome-mcp/bridge-token) or stdio
```

`CHROME_MCP_TOOL_PROFILE=core|crawl|full` selects the tool surface.

## Development & tests

```bash
pnpm dev          # watch all packages
pnpm typecheck    # tsc --noEmit across the repo
pnpm test         # E2E: 4 tiers / 153 cases
```

Extension unit tests: 77 (vitest). Repo regression suite: 129 (node:test). Agent guidance: [skill/SKILL.md](./skill/SKILL.md). Tool docs: [docs/TOOLS.md](./docs/TOOLS.md).

## License

MIT — see [LICENSE](./LICENSE). Upstream hangwin/mcp-chrome is (c) its authors.
