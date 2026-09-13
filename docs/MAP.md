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
  3. Review **[TEST_INFRA.md](../TEST_INFRA.md)**: Comprehensive E2E test infrastructure specification, test tiers, and verification harnesses.

---

## 🗂️ 2. Repository & Monorepo Topology (代码拓扑地图)

```text
mcp-chrome-master/
├── packages/
│   └── shared/                  # 🌟 Single Source of Truth
│       └── src/
│           ├── tools.ts         # All 52 tool schemas, tool names
│           ├── tool-profiles.ts # Profile definitions (Core 24, Crawl 15, Full 52)
│           ├── types.ts         # Universal coordinate, batch item & diff result types
│           └── error-format.ts  # Standardized error reporting with stack control
│
├── app/
│   ├── chrome-extension/        # 🧩 Chrome MV3 Extension (WXT + Vue 3)
│   │   ├── entrypoints/
│   │   │   ├── background/      # Main Service Worker (52 Tool Executors)
│   │   │   │   └── tools/browser/tab-group-manager.ts # Tab grouping & orphan cleanup
│   │   │   ├── agent-cursor.content.ts # Closed Shadow DOM virtual mouse overlay
│   │   │   ├── inpage-engine.ts # Isolated-world DOM indexing & pruning engine
│   │   │   └── popup/           # Extension popup UI (Agent on/off)
│   │   └── utils/
│   │       ├── cdp-session-manager.ts # Session-aware CDP retention (10-min idle)
│   │       └── snapshot-cache-manager.ts # DOM fingerprint caching & delta diffing
│   │
│   └── native-server/           # 🔌 Fastify Native Messaging Bridge
│       ├── src/index.ts         # Fastify HTTP (127.0.0.1:12306) & Streamable SSE
│       ├── src/native-messaging-host.ts # StdIO IPC with Chrome (1MB buffer ceiling guard)
│       └── src/scripts/         # Auto-installer for Native Messaging manifest
│
├── docs/                        # 📚 Documentation Vault (MAP, TOOLS, ARCHITECTURE)
├── skill/                       # 🧠 AI Agent Skill Package (SKILL.md)
└── test/                        # 🧪 Integration & E2E Verification
```

---

## 📖 3. Complete Documentation Matrix (全量文档矩阵)

| 文档名称                                              | 语言 |    主要读者     | 核心定位与价值                                                  | 维护机制                      |
| :---------------------------------------------------- | :--: | :-------------: | :-------------------------------------------------------------- | :---------------------------- |
| **[README.md](../README.md)**                         | 英文 |  所有人 / 社区  | 项目主页、痛点背景、1 分钟快速开始、6 大核心功能全览            | 手动维护                      |
| **[README.zh-CN.md](../README.zh-CN.md)**             | 中文 |   中文开发者    | 详尽中文主页，完整覆盖 Windows 排他锁困境与极速上手指南         | 与主 README 同步              |
| **[docs/MAP.md](./MAP.md)**                           | 中英 |   所有人 / AI   | **项目地图导览中心**：全工程拓扑、阅读路线、文档矩阵与工具雷达  | 本文档                        |
| **[docs/TOOLS.md](./TOOLS.md)**                       | 英文 | Agent / 开发者  | 全量 52 个工具的完整参数输入/输出字典（按分类展示）             | `npm run docs:tools` 自动生成 |
| **[docs/ARCHITECTURE.md](./ARCHITECTURE.md)**         | 英文 | 架构师 / 审核者 | 三层架构拓扑、Native Messaging 通信协议、CDP 状态流转时序图     | 架构变更时更新                |
| **[docs/TROUBLESHOOTING.md](./TROUBLESHOOTING.md)**   | 中英 |  运维 / 排障者  | 常见报错代码速查（12306 连不上、401、CDP 超时、域校验失败等）   | 排障沉淀更新                  |
| **[AGENT_CONFIG_GUIDE.md](../AGENT_CONFIG_GUIDE.md)** | 中文 | Agent / 开发者  | Claude Desktop、Cursor、Windsurf 客户端配置 JSON 与六大交互准则 | 客户端适配更新                |
| **[skill/SKILL.md](../skill/SKILL.md)**               | 英文 |    AI Agent     | 供大模型直接吸纳的技能定义：双轨引擎、梯次升级协议、微模式      | 与 Schema 同步                |
| **[PROJECT.md](../PROJECT.md)**                       | 中英 |     维护者      | 项目工程化摘要、质量门基线、设计原则速览                        | 版本演进更新                  |
| **[TEST_INFRA.md](../TEST_INFRA.md)**                 | 英文 |  测试 / 审计者  | 4 层 E2E 自动化测试架构、测试 Harness 规范与 153 项用例矩阵     | 测试演进更新                  |

---

## 🛠️ 4. 52 Tools Capability Radar (52 工具能力全景雷达)

BrowserClaw 支持 **Profile 动态分层**，平衡初阶模型的 Token 负担与高阶模型的极致掌控力：

```text
┌────────────────────────────────────────────────────────────────────────┐
│                              52 MCP TOOLS                              │
├────────────────────────────────────────────────────────────────────────┤
│ 🟢 CORE (14 Tools) - High-Frequency Semantic & Visual Interaction     │
│   • Navigate (4): navigate, switch_tab, close_tabs, get_windows_and_tabs
│   • Perceive (4): read_dom, get_markdown, inspect_media, grep          │
│   • Act (3): interact_index, fill_index, batch_actions                 │
│   • Observe (2): screenshot, smart_scroll                              │
│   • Discovery (1): chrome_tool_docs                                    │
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

> **Dynamic Profile Switching & On-Demand Tool Unlocking**:
> Even in `core` or `crawl` profiles, agents can discover and dynamically expose tools for their session without restarting the server via:
> `chrome_tool_docs({ category: "manage" | "diagnose" | "network" | ..., activateForSession: true })`
> Supported categories: `navigate`, `perceive`, `act`, `observe`, `manage`, `diagnose`, `network`, `crawl`.
> Both **Fastify HTTP/SSE** and **Stdio transport** (`mcp-server-stdio.ts`) support dynamic tool exposure.

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

## 🛡️ 6. Hardened Security & MV3 Lifecycle Architecture (核心安全与架构加固)

| 架构维度                    | 实现机制                                                                                                 | 解决的痛点与安全隐患                                                                       |
| :-------------------------- | :------------------------------------------------------------------------------------------------------- | :----------------------------------------------------------------------------------------- |
| **Sender 权限隔离**         | `chrome.runtime.onMessage` 严格校验 `_sender.id === chrome.runtime.id` 并拒绝 `_sender.tab`              | 彻底杜绝恶意网页 content script 或外部扩展通过消息伪造窃取 Token 或执行特权工具            |
| **DOM XSS 防护**            | `agent-cursor.content.ts` 纯 DOM 原生 API 节点构建 (`createElement` / `createTextNode`)                  | 消除浮条原因字符串 `reason` 经由 `innerHTML` 拼接导致的 DOM XSS 风险                       |
| **跨 Frame 隔离防污染**     | 单 Frame 独立执行上下文 (`frameIds: [targetFrameId]`) + 纯符号 WeakRef 索引空间隔离                      | 杜绝跨 Frame 消息串扰，防止子 Frame 污染主 Frame 索引树与全局 WeakRef Map                  |
| **多 Frame 索引隔离与扫描** | `chrome_grep` 全 Frame 扫描 + 纯只读检索 (不污染子 Frame 索引偏移) + `placeholder/aria-label/value` 检索 | 攻破多层嵌套与跨域 iframe 盲区，消除子 Frame 索引篡改副作用                                |
| **CDP 域引用计数**          | `CDPSessionManager` 域级别引用计数 (`enableDomain` / `disableDomain`) + 核心域 (`Page`/`Network`) 常驻   | 解决并发与流水线工具中途 disable 导致后续监听器（Dialog / Network / Settle）崩溃的竞态问题 |
| **调试器防挂死脱钩**        | `timeout-guard` 与 `detachDebugger` 物理级快速强制解挂 (`chrome.debugger.detach`) 清理域引用计数         | 消除页面未响应或断开时引用计数下溢导致的调试会话假死与死锁                                 |
| **后台 Tab 离屏截图**       | 后台静默 Tab 强制走 CDP `Page.captureScreenshot(fromSurface: true)`                                      | 彻底消除 `captureVisibleTab` 截取前台活跃窗口导致的隐私泄露，消除非激活 Tab 的 rAF 卡死    |
| **MV3 会话持久化**          | `SessionTabAffinityManager` / `TabGroupManager` / `TabFaviconManager` 全面接入 `chrome.storage.session`  | 抵御 Chrome MV3 30 秒后台 Service Worker 休眠回收，Worker 重启后无损恢复状态               |
| **误关活跃 Tab 保护**       | `chrome_close_tabs` 空参数关闭活跃 Tab 必须显式传入 `confirm: true` 或携带会话亲缘 `sessionId`           | 杜绝大模型误调用导致意外关闭用户正在操作的日常标签页                                       |
| **平台按键位掩码**          | macOS Cmd 键位掩码严格对齐 `mod = 4` (Meta)                                                              | 修复 macOS 环境下全选、剪切等组合快捷键位掩码偏差                                          |
| **单表达式自动 return**     | `chrome_javascript` 智能语法检测，无 return 单表达式自动包装 `return (...)`                              | 提升 Agent 即席计算、DOM 属性查询的体验与容错率                                            |
| **事件驱动加载等待**        | `chrome_get_web_content` 监听 `chrome.tabs.onUpdated` / `onRemoved` 事件驱动完成                         | 替代盲等休眠，大幅降低等待延迟并增强鲁棒性                                                 |
| **Windows 宿主进程看门狗**  | Fastify `closeAllConnections()` + 1000ms unref 硬退出看门狗                                              | 彻底根治 Windows 平台 Keep-Alive 长连接导致的 12306 端口占用与僵尸进程                     |
| **多态坐标 Ajv 严格合规**   | 统一重构 `oneOf` 坐标定义，移除外层 `type: 'object'` 与顶层 `required: ['x', 'y']`                       | 确保大模型输出的 `[x, y]` 数组坐标 100% 通过 Ajv / Claude Desktop / Cursor 严格校验        |
| **后台标签页滚轮防假死**    | `scroll` 与 `smart_scroll` 识别后台 Tab 自动熔断走 JS 滚动 + Tab 激活/刷新即刻重置 60s 冷却缓存          | 消除 Chromium 挂起后台合成器帧导致的 3000ms 强制超时假死                                   |
| **脚本跨 Frame 隔离注入**   | `base-browser.ts` 缓存键升级为 `${files.join(',')}\|${world}\|${frameKey}`                               | 彻底防止主子 Frame 间脚本伪命中导致子 Frame 漏注                                           |

---

_Need quick help? Check [Troubleshooting Guide](./TROUBLESHOOTING.md) or open an issue on [GitHub](https://github.com/GoldenLoaf24h/browserclaw/issues)._
