# BrowserClaw 项目说明 / Project Notes

## 定位

BrowserClaw 是一个面向 AI agent 的 Chrome 浏览器自动化 MCP 服务器。与无头浏览器方案不同，它运行在用户日常使用的 Chrome 里（保留登录态、Cookie、扩展环境），通过 Native Messaging + CDP 把浏览器能力暴露为 schema 校验过的 MCP 工具。

## 包结构（pnpm monorepo）

1. `packages/shared`（npm 名 chrome-mcp-shared）——唯一事实源：47 个工具 schema（TOOL_SCHEMAS）、tool-profiles（core: 14 / crawl: 12 / full: 47）、UnifiedLocatorOptions 坐标契约、错误格式化。
2. `app/native-server`（npm 名 mcp-chrome-bridge）——Fastify 原生宿主：MCP stdio/HTTP 双传输、McpSessionManager（每会话隔离 Server 实例，10 分钟空闲回收）、bridge-token 认证、性能 trace 分析。
3. `app/chrome-extension`（npm 名 chrome-mcp-server）——WXT + Vue 3 MV3 扩展：后台 SW 承载工具执行器与 CDP 会话管理；包含 1:1 复刻的官方 Agent 虚拟鼠标、TabGroup 自动分组与无痕销毁、微光 Favicon；dom-indexer 提供 DOM 剪枝索引、inpage-engine 以隔离世界注入；popup 提供连接与控制开关。

## 关键设计

- **工具面 = schema 面**：toolsMap 由 TOOL_SCHEMAS 声明推导，未声明的内部执行器不可调用（tool-surface-parity 测试钉死）。
- **Profile 分层**：core（24）/ crawl（15）/ full（52），8 大工具类别（navigate, perceive, act, observe, manage, diagnose, network, crawl），隐藏工具经 chrome_tool_docs 按类别发现，支持在 HTTP/SSE 与 Stdio 模式下进行免重启会话级动态按需激活 (`activateForSession`)。
- **自驱 Diff 携带机制**：交互工具 (`interact_index`, `fill_index`, `batch_actions`) 支持 `includeDelta: true`，单步返回局部 DOM 变动，往返延迟降低 50%。
- **定向检索优化**：`chrome_grep` 支持多 Frame 层次化索引重映射与 placeholder/aria-label/value 检索，提供三种检索模式（可交互元素、全量 DOM、纯文本行），免除大页面 dump DOM 的巨额 Token 浪费。
- **闭环批处理流水线**：`chrome_batch_actions` 具备 `assert` 断言熔断与 `extract` 字段提取能力，支持跨域 iframe 坐标转换校验，单次网络调用跑通复杂表单流程。
- **逃生与人机协作**：`chrome_cdp_execute` 工业级 CDP 穿透通道 + `chrome_request_human_intervention` 纯 DOM 安全构建（免疫 DOM XSS）毛玻璃人机接管浮条 + `chrome_undo_last_action` 5 步环形栈撤销。
- **MV3 状态持久化**：`SessionTabAffinityManager`、`TabGroupManager` 与 `TabFaviconManager` 全面接入 `chrome.storage.session`，抵御 Service Worker 30 秒休眠回收。
- **CDP 域引用计数与防挂死**：`CDPSessionManager` 域级别引用计数管理，核心域常驻，超时由 `timeout-guard` 直通物理脱钩（`chrome.debugger.detach`）防止死锁。
- **权限安全边界**：`chrome.runtime.onMessage` 严格拒绝来自 content script（`_sender.tab`）或外部扩展的消息，杜绝恶意网页脚本提权调用工具。
- **视觉管线与离屏安全**：截图零落盘，后台静默 Tab 强制走离屏 CDP `Page.captureScreenshot(fromSurface: true)`，杜绝截取用户当前前台屏幕造成隐私泄露与 rAF 卡死。
- **反自动化合规与平台对齐**：CDP Input 原生可信事件、dwellMs 按压时长、batch/burst 低延迟序列；macOS Cmd 键位掩码对齐 `mod = 4`；`chrome_close_tabs` 活跃 Tab 误关确认保护。

## 质量门

- 扩展 vitest 139 项（涵盖新增的 close-tabs、javascript、grep、delta、batch-assert-extract、cdp-execute、media-inspect、undo 等全量单元测试，100% 通过）
- 仓库 node:test 129 项（boost-features / boost-phase1-phase4 / p0-p1-hardening）
- 原生宿主 Jest 30 项全部通过 (100%)
- E2E 4 层 153 项（node --experimental-strip-types test/e2e/runner.ts）
- vue-tsc + native-server tsc 双类型检查
