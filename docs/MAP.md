# 🗺️ BrowserClaw Project Map & Documentation Index

Welcome to the **BrowserClaw** Project Map. Whether you are an end-user, an AI agent developer, a prompt engineer, or a core contributor, this document serves as your single source of truth for navigating the architecture, code topology, tools, and documentation.

---

## 🧭 1. Reading Paths by Role (按角色导览路线)

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│                             Choose Your Journey                             │
├──────────────────────┬──────────────────────┬───────────────────────────────┤
│ 👤 End-User          │ 🤖 Agent Developer   │ 🏗️ Core Contributor           │
├──────────────────────┼──────────────────────┼───────────────────────────────┤
│ 1. README.md         │ 1. AGENT_CONFIG_GUIDE│ 1. docs/ARCHITECTURE.md       │
│    (Quick Start)     │ 2. skill/SKILL.md    │ 2. packages/shared/tools.ts   │
│ 2. Load Extension    │ 3. docs/TOOLS.md     │ 3. app/chrome-extension/      │
│ 3. Configure Client  │ 4. Batch Pipeline &  │ 4. app/native-server/         │
│                      │    Delta Strategies  │ 5. Test Suite (Vitest + Node) │
└──────────────────────┴──────────────────────┴───────────────────────────────┘
```

- **I just want my AI to drive my browser**:
  1. Read the **[Quick Start in README.md](../README.md#quick-start-let-ai-do-the-work)** or **[快速上手 (中文)](../README.zh-CN.md#极速上手-把项目交给-ai-即可)**.
  2. Download the prebuilt clean extension from **[Releases](https://github.com/GoldenLoaf24h/browserclaw/releases)** and load it in `chrome://extensions`.
  3. Copy your client JSON from **[AGENT_CONFIG_GUIDE.md](../AGENT_CONFIG_GUIDE.md)** into Cursor, Claude, or Codex.
- **I am an AI Agent / Prompt Engineer integrating BrowserClaw**:
  1. Study **[skill/SKILL.md](../skill/SKILL.md)**: Encodes dual-engine workflows (DOM-First vs Visual Fallback), the Escalation Ladder, and recovery patterns.
  2. Consult **[docs/TOOLS.md](./TOOLS.md)**: Auto-generated parameter references for all 52 tools across Core, Crawl, and Full profiles.
  3. Follow the 6 interaction rules in **[AGENT_CONFIG_GUIDE.md](../AGENT_CONFIG_GUIDE.md)** (especially `includeDelta: true` and `chrome_grep`).
- **I want to contribute or audit the architecture**:
  1. Inspect **[docs/ARCHITECTURE.md](./ARCHITECTURE.md)**: Complete system topology, IPC buffer guards, and sequence diagrams.
  2. Check **[PROJECT.md](../PROJECT.md)**: High-level package notes and quality gates.
  3. Review **[TESTING-NOTES.md](../TESTING-NOTES.md)**: Comprehensive regression history, hardening logs, and security audits.

---

## 🗂️ 2. Repository & Monorepo Topology (代码拓扑地图)

```text
mcp-chrome-master/
├── packages/
│   └── shared/                  # 🌟 Single Source of Truth
│       ├── src/
│       ├── tools.ts         # All 52 tool schemas, Profile definitions
│       ├── types.ts         # Universal coordinate, batch item & diff result types
│       └── error-format.ts  # Standardized error reporting with stack control
│
├── app/
│   ├── chrome-extension/        # 🧩 Chrome MV3 Extension (WXT + Vue 3)
│   │   ├── entrypoints/
│   │   │   ├── background/      # Main Service Worker (52 Tool Executors)
│   │   │   ├── agent-cursor.content.ts # Closed Shadow DOM virtual mouse overlay
│   │   │   ├── inpage-engine.ts # Isolated-world DOM indexing & pruning engine
│   │   │   └── popup/           # Extension popup UI (Agent on/off)
│   │   └── utils/
│   │       ├── cdp-session-manager.ts # Session-aware CDP retention (10-min idle)
│   │       ├── tab-group-manager.ts   # Automatic tab grouping & orphan cleanup
│   │       └── snapshot-cache-manager.ts # DOM fingerprint caching & delta diffing
│   │
│   └── native-server/           # 🔌 Fastify Native Messaging Bridge
│       ├── src/index.ts         # Fastify HTTP (127.0.0.1:12306) & Streamable SSE
│       ├── src/native-host.ts   # StdIO IPC with Chrome (1MB buffer ceiling guard)
│       └── src/scripts/         # Auto-installer for Native Messaging manifest
│
├── docs/                        # 📚 Documentation Vault (MAP, TOOLS, ARCHITECTURE)
├── skill/                       # 🧠 AI Agent Skill Package (SKILL.md)
└── test/                        # 🧪 Integration & E2E Verification
```

---

## 📖 3. Complete Documentation Matrix (全量文档矩阵)

| 文档名称 | 语言 | 主要读者 | 核心定位与价值 | 维护机制 |
| :--- | :---: | :---: | :--- | :--- |
| **[README.md](../README.md)** | 英文 | 所有人 / 社区 | 项目主页、痛点背景、1 分钟快速开始、6 大核心功能全览 | 手动维护 |
| **[README.zh-CN.md](../README.zh-CN.md)** | 中文 | 中文开发者 | 详尽中文主页，完整覆盖 Windows 排他锁困境与极速上手指南 | 与主 README 同步 |
| **[docs/MAP.md](./MAP.md)** | 中英 | 所有人 / AI | **项目地图导览中心**：全工程拓扑、阅读路线、文档矩阵与工具雷达 | 本文档 |
| **[docs/TOOLS.md](./TOOLS.md)** | 英文 | Agent / 开发者 | 全量 52 个工具的完整参数输入/输出字典（按分类展示） | `npm run docs:tools` 自动生成 |
| **[docs/ARCHITECTURE.md](./ARCHITECTURE.md)** | 英文 | 架构师 / 审核者 | 三层架构拓扑、Native Messaging 通信协议、CDP 状态流转时序图 | 架构变更时更新 |
| **[docs/TROUBLESHOOTING.md](./TROUBLESHOOTING.md)** | 中英 | 运维 / 排障者 | 常见报错代码速查（12306 连不上、401、CDP 超时、域校验失败等） | 排障沉淀更新 |
| **[AGENT_CONFIG_GUIDE.md](../AGENT_CONFIG_GUIDE.md)** | 中文 | Agent / 开发者 | Claude Desktop、Cursor、Windsurf 客户端配置 JSON 与六大交互准则 | 客户端适配更新 |
| **[skill/SKILL.md](../skill/SKILL.md)** | 英文 | AI Agent | 供大模型直接吸纳的技能定义：双轨引擎、梯次升级协议、微模式 | 与 Schema 同步 |
| **[PROJECT.md](../PROJECT.md)** | 中英 | 维护者 | 项目工程化摘要、质量门基线、设计原则速览 | 版本演进更新 |
| **[TESTING-NOTES.md](../TESTING-NOTES.md)** | 中文 | 测试 / 审计者 | 26 轮深度审计、P0/P1 硬化验证与黄条下坠抖动治理实录 | 审计后追加 |

---

## 🛠️ 4. 52 Tools Capability Radar (52 工具能力全景雷达)

BrowserClaw 支持 **Profile 动态分层**，平衡初阶模型的 Token 负担与高阶模型的极致掌控力：

```text
┌────────────────────────────────────────────────────────────────────────┐
│                              52 MCP TOOLS                              │
├────────────────────────────────────────────────────────────────────────┤
│ 🟢 CORE (24 Tools) - High-Frequency Semantic & Visual Interaction     │
│   • Navigation: navigate, get_active_tab, create_tab, close_tab...     │
│   • Content: read_dom, get_markdown, grep, inspect_media...            │
│   • Actions: interact_index, fill_index, batch_actions, smart_scroll...│
│   • Vision: screenshot, get_mouse_position                             │
├────────────────────────────────────────────────────────────────────────┤
│ 🟡 CRAWL (15 Tools) - Lightweight High-Throughput Web Extraction       │
│   • Content: get_markdown, read_dom, grep, get_links, get_html...       │
│   • Navigation & Network: navigate, get_cookies, intercept_api...      │
├────────────────────────────────────────────────────────────────────────┤
│ 🟣 FULL (52 Tools) - Comprehensive Low-Level & Enterprise Control      │
│   • Advanced CDP: cdp_execute (Target polymorphic routing + Anti-Hang) │
│   • Human-in-the-Loop: request_human_intervention, undo_last_action   │
│   • Network & Console: network_capture, get_console_logs, storage...   │
│   • Browser Mgmt: tab_groups, bookmarks, history, download...          │
└────────────────────────────────────────────────────────────────────────┘
```

> **Dynamic Profile Switching**: Even in `core` profile, agents can discover and dynamically unlock full capabilities for their session via `chrome_tool_docs({ category: "manage", activateForSession: true })`.

---

## ⚡ 5. Core Execution Pipelines (核心执行流水线)

### 5.1 DOM-First 智能点击流水线 (`chrome_interact_index`)
```text
AI Agent                Native Server             Chrome SW             Page (Isolated World)
   │                         │                        │                          │
   │── tools/call (index: 5)─▶│                        │                          │
   │   includeDelta: true    │── Native Messaging ───▶│                          │
   │                         │   (1000KB Guard)       │── animateAgentCursor ───▶│ (Virtual blue cursor
   │                         │                        │   (Spring kinematics)    │  flies smoothly)
   │                         │                        │                          │
   │                         │                        │── CDP dispatchMouseEvent▶│ (Native isTrusted=true)
   │                         │                        │                          │
   │                         │                        │── Settle & Snapshot ────▶│ (DOM Mutation Check)
   │                         │                        │                          │
   │                         │                        │◀── diffWithPrevious ─────│ (Compute local diff)
   │◀── Result + Delta ──────│◀── Native Response ────│                          │
   │    [+ added 3 nodes]    │                        │                          │
```

### 5.2 遇到滑块 / 2FA 验证的人机协作闭环 (`chrome_request_human_intervention`)
```text
AI Agent                            BrowserClaw Extension                     User (Human)
   │                                          │                                     │
   │── request_human_intervention ───────────▶│                                     │
   │   "Please solve slider captcha"          │── Mount Frosted Glass Top Banner ──▶│ (Screen dims softly)
   │                                          │   (Park cursor at top-right)        │
   │                                          │                                     │
   │                                          │                                     │ 🖱️ Solves captcha
   │                                          │◀── Clicks [Continue] / Presses Enter│
   │                                          │── Fade-out & Unmount Overlay ───────│
   │◀── { resolved: true, action: "resumed" }─│                                     │
   │                                          │                                     │
   │── (Continues Next Automation Step) ─────▶│                                     │
```

---

_Need quick help? Check [Troubleshooting Guide](./TROUBLESHOOTING.md) or open an issue on [GitHub](https://github.com/GoldenLoaf24h/browserclaw/issues)._
