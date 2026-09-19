# BrowserClaw Plugin for Hermes Agent & AI Agents

Official plugin for **BrowserClaw** — High-efficiency, zero-hallucination Chrome browser control and automation.

## Overview

BrowserClaw transforms your daily Google Chrome browser into an ultra-fast, controllable, readable, and verifiable automation environment for AI agents. With its dual-brain architecture (Jev System 1 heuristic micro-loop + System 2 frontier reasoning), it achieves sub-second page interaction while cutting token consumption by 85%+.

## Hermes Agent Installation

Install directly into Hermes via the Hermes plugin manager:

```bash
hermes plugins install GoldenLoaf24h/browserclaw --subdir plugins/browserclaw
```

Once added to the official Hermes catalog, you can install with:

```bash
hermes plugins install browserclaw
```

To enable the plugin:

```bash
hermes plugins enable browserclaw
```

## Prerequisites

1. **Load BrowserClaw Extension**: In Chrome, navigate to `chrome://extensions`, enable **Developer mode**, click **Load unpacked**, and select the `app/chrome-extension/.output/chrome-mv3` directory (or release archive).
2. **Start Native Bridge**: Run the native MCP bridge:
   ```bash
   npm run start:server
   ```
   The server listens on `http://127.0.0.1:12306/mcp` (or custom `BROWSERCLAW_MCP_URL`).

## Core Provided Tools

| Tool                               | Description                                                                |
| :--------------------------------- | :------------------------------------------------------------------------- |
| `browserclaw_act_toward_goal`      | Autonomous dual-brain micro-loop driven by Jev System 1 heuristics         |
| `browserclaw_navigate`             | Navigate active Chrome tab to a target URL                                 |
| `browserclaw_read_dom`             | Compact AX accessibility DOM tree with 1-based indices                     |
| `browserclaw_interact_index`       | Interact with elements by index (click, hover, focus, clear)               |
| `browserclaw_fill_index`           | High-precision form filling by 1-based index                               |
| `browserclaw_batch_actions`        | Atomic pipeline of actions (click, fill, assert, extract) in one roundtrip |
| `browserclaw_screenshot`           | High-resolution full-page or viewport capture                              |
| `browserclaw_smart_scroll`         | Intelligent overflow-aware scrolling with remaining page calculation       |
| `browserclaw_inspect_media`        | Direct extraction of images/canvas at native resolution                    |
| `browserclaw_grep`                 | Targeted in-memory regex/text search across interactive elements           |
| `browserclaw_get_markdown`         | Clean reader-mode markdown extraction (70% token savings)                  |
| `browserclaw_switch_tab`           | Switch active focus to a specific tab                                      |
| `browserclaw_close_tabs`           | Safe tab closure with session affinity protection                          |
| `browserclaw_get_windows_and_tabs` | Query all open windows, tab groups, and tabs                               |
| `browserclaw_tool_docs`            | Inspect documentation for all 52 BrowserClaw capabilities                  |

## Bundled Skill

This plugin bundles the complete `browserclaw` operator skill, loaded automatically via Hermes's namespaced skill system:

```text
skill_view("browserclaw:browserclaw")
```

## License

Apache-2.0
