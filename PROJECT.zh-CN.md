# BrowserClaw 项目工程规范说明

[English Version](./PROJECT.md)

## 定位与核心设计哲学

BrowserClaw 是一个面向 AI Agent 的 Chrome 浏览器自动化 MCP 服务器。与传统的无头浏览器（Playwright、Puppeteer、Selenium）不同，它直接运行在用户日常使用的 Google Chrome 中，原生复用既有的登录态、Cookie、扩展插件及配置环境。通过 Native Messaging 与 Chrome DevTools Protocol (CDP)，将真实的浏览器控制能力暴露为 47 个严格校验 Schema 的规范 MCP 工具。

## Monorepo 模块架构 (pnpm)

1. **`packages/shared`** (`chrome-mcp-shared`)：
   - **唯一事实源**：集中维护全量 47 个规范 MCP 工具的 Schema（`TOOL_SCHEMAS`）、Profile 分层（`core`: 14, `crawl`: 12, `full`: 47）、`UnifiedLocatorOptions` 统一多态坐标契约以及标准化错误格式化模块。
2. **`app/native-server`** (`mcp-chrome-bridge`)：
   - **Fastify 原生宿主服务**：提供 Stdio 与 HTTP/SSE（默认 `127.0.0.1:12306`）双协议传输、`McpSessionManager` 会话隔离机制（每会话独立 Server 实例，10 分钟空闲自动回收）、`bridge-token` 鉴权与 Chromium 性能追踪分析。
3. **`app/chrome-extension`** (`chrome-mcp-server`)：
   - **WXT + Vue 3 Manifest V3 扩展**：后台 Service Worker 承载 47 个工具底层执行器与 CDP 会话管理器。内嵌 1:1 物理虚拟光标、标签组自动归整与清理、微光 Favicon；`inpage-engine` 负责在隔离世界中进行 DOM 剪枝与 1-based 动态编号索引。

## 关键架构与工程特性

- **工具面与 Schema 绝对对齐**：运行时 `toolsMap` 完全由 `TOOL_SCHEMAS` 声明推导生成，严禁调用未声明的内部执行器（通过 tool-surface-parity 测试严格锁定）。
- **Profile 分层与动态发现**：内置三大核心 Profile（`core`: 14, `crawl`: 12, `full`: 47）及 8 大工具类别。隐藏工具支持通过 `chrome_tool_docs` 按需动态激活（`activateForSession: true`），在 HTTP/SSE 与 Stdio 下均无需重启服务即可即时生效。
- **自驱 DOM Diff 回传**：交互类工具（`chrome_interact_index`、`chrome_fill_index`、`chrome_batch_actions`）支持 `includeDelta: true`，在动作返回中直接附带局部变动，降低 50% 往返网络消耗。
- **定向秒搜与多 Frame 穿透**：`chrome_grep` 支持多层 iframe 结构穿透与只读检索，匹配文本、`placeholder`、`aria-label` 与 `value`，杜绝大页面全量倾倒 DOM 带来的 Token 浪费。
- **闭环批处理流水线**：`chrome_batch_actions` 在单次网络往返中按序执行点击、输入、等待、断言（`assert`）与字段提取（`extract`），支持跨域 iframe 坐标自动重映射。
- **人机协同与安全撤销**：提供原生 CDP 穿透通道（`chrome_cdp_execute`）、纯 DOM 挂载的毛玻璃接管条（`chrome_request_human_intervention`，彻底免疫 DOM XSS）与 5 步环形栈撤销机制（`chrome_undo_last_action`）。
- **MV3 状态全持久化**：`SessionTabAffinityManager`、`TabGroupManager` 与 `TabFaviconManager` 全面接入 `chrome.storage.session`，抵抗 Service Worker 30 秒休眠回收。
- **CDP 域引用计数与防卡死**：`CDPSessionManager` 精细化管理域级生命周期，核心域常驻，异常与超时由底层 `timeout-guard` 快速触发物理脱钩（`chrome.debugger.detach`）防止死锁。
- **IPC 权限安全边界**：`chrome.runtime.onMessage` 严格拒绝来自 content script（`_sender.tab`）或外部扩展的请求，杜绝网页恶意脚本提权调用工具。
- **视觉离屏零泄露**：截图全链路内存处理零落盘，非激活后台标签页强制走 CDP `Page.captureScreenshot(fromSurface: true)`，彻底杜绝窃取用户前台隐私与 rAF 挂起假死。
- **真人体感与平台兼容**：CDP 原生物理级可信事件（`isTrusted: true`）、`dwellMs` 物理按压时长、macOS Cmd 键位掩码（`mod = 4`）与 `chrome_close_tabs` 活跃 Tab 防误关安全保护。

## 质量门与验证指标

- **扩展 Vitest**：306 项测试在 42 个套件中 100% 通过。
- **Native Server Jest**：86 项单元与集成测试 100% 通过。
- **E2E 规范套件**：153 项四层端到端测试 100% 通过。
- **Hermes 插件测试**：8 项 Pytest 100% 通过。
- **TypeScript 类型检查**：全仓库 0 错误（`pnpm typecheck`）。
