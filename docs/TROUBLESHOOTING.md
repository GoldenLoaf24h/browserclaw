# Troubleshooting / 故障排查

BrowserClaw 由本地构建的三部分组成：扩展（MV3）、原生宿主（native-server）、MCP 端点（127.0.0.1:12306）。以下按现象排查，全部基于本仓库实际实现。

## 1. MCP 客户端连不上 127.0.0.1:12306

1. 确认原生宿主进程存活：宿主由 Chrome 扩展通过 Native Messaging 拉起，Chrome 未运行时宿主不存在是正常的。
2. 确认端口监听：`netstat -ano | findstr 12306`。
3. 确认 token：请求头 `Authorization: Bearer <token>`，token 在 `~/.chrome-mcp/bridge-token`（宿主首次启动自动生成）。401/403 检查该文件。
4. `CHROME_MCP_HOST` / `CHROME_MCP_PORT` 可覆盖默认 127.0.0.1:12306（见 app/native-server/src/constant/index.ts）。
5. **Windows 僵尸进程防死锁说明（v2.3.8+）**：旧版本在 Chrome 关闭时可能因 HTTP Keep-Alive 未断开导致 Node 进程残留占用端口；当前版本已内置 `closeAllConnections()` 与 1000ms unref 硬看门狗强制退出。若遇历史残留，可执行 `taskkill /F /IM node.exe` 彻底清理。

## 2. 扩展 SW 未连接宿主

1. chrome://extensions → BrowserClaw → service worker 控制台查 `[NativeHost]` 日志。
2. 首次使用需在 popup 里连接；storage.session 的 `agentControlEnabled=false` 会拦截所有工具调用。
3. 扩展重载后 Native Messaging 连接断开，宿主需重启。

## 3. 工具调用报错速查

| 报错                                                                               | 原因与处理                                                                                                                                                   |
| ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Cannot access a chrome:// URL                                                      | 受限页面，换普通页面                                                                                                                                         |
| executeScript timeout ... renderer not acking                                      | 页面有原生弹窗或 renderer 卡死，先 chrome_handle_dialog                                                                                                      |
| CDP_DISPATCH_TIMEOUT                                                               | 目标 tab 在后台且批量竞速超时，激活 tab 或重试                                                                                                               |
| Security check failed: Domain changed                                              | 上次截图域名与当前 tab 不一致，重新截图                                                                                                                      |
| Tool X is not exposed under the ... profile                                        | 当前 profile 隐藏了该工具，可调用 `chrome_tool_docs({ category: "<category>", activateForSession: true })` 免重启动态激活，或设置环境变量改回 full           |
| Tool X is not a BrowserClaw tool                                                   | 工具名不存在，tools/list 查看当前 47 个（或 core 14 / crawl 12 / full 47）                                                                                   |
| No tabIds or url specified. To close the current active tab, pass confirm: true... | 安全防误关机制：调用 `chrome_close_tabs` 未指定 `tabIds` 且无会话亲缘时触发。若确需关闭前台活跃 Tab，请显式传 `confirm: true`，或传入 `tabIds` / `sessionId` |
| Target closed / not attached / timeout-guard detached                              | 页面崩溃或 CDP 响应超时，底层 `timeout-guard` 触发物理解挂防挂死。刷新页面或重新尝试调用工具                                                                 |
| captureScreenshot returned empty data for background tab                           | 后台 Tab 离屏截图失败，检查目标 Tab 是否已关闭或被系统内存冻结 (Discarded)                                                                                   |
| Failed to ... index [X] in cross-origin frame                                      | 跨域 iframe 坐标转换与动作失败，检查子 Frame 是否已卸载或受到严格沙箱 sandbox 属性限制                                                                       |
| Message sender rejected / unauthenticated content script                           | 扩展安全加固：`chrome.runtime.onMessage` 拦截了来自 content script (`_sender.tab`) 或外部扩展的未经授权工具调用或 Token 读取请求                             |

## 4. 构建问题

```bash
pnpm install
pnpm --filter chrome-mcp-shared build   # shared 必须最先构建，否则 TS7016 满天飞
pnpm build                              # 三包全量
```

- 扩展产物：app/chrome-extension/.output/chrome-mv3，改码后需在 chrome://extensions 重载扩展。
- native-server 构建：`pnpm --filter mcp-chrome-bridge build`。

## 5. 日志位置

- 扩展 SW：chrome://extensions → service worker 控制台（NativeHost / Screenshot Tool 前缀）。
- 宿主：随宿主进程 stdout；trace 文件默认写系统临时目录（performance 工具显式 saveToDownloads 才写 Downloads）。

## 6. 特殊场景与机制说明

1. **后台 Tab 离屏静默截图与隐私隔离**：
   对于非激活标签页（`active: false`），BrowserClaw 强制走 CDP `Page.captureScreenshot`（`fromSurface: true`），严禁使用 `chrome.tabs.captureVisibleTab`，既防止把用户当前正在看的前台活跃窗口截屏泄露给 Agent，又彻底消除了后台 Tab 因 `requestAnimationFrame` 挂起导致的死锁。

2. **Stdio 与 HTTP/SSE 模式下的动态 Profile 激活**：
   在 `core` 或 `crawl` 模式下，Agent 无需重启 MCP 进程，只需调用 `chrome_tool_docs({ category: "manage" | "diagnose" | "network", activateForSession: true })`，即可在当前会话中即时暴露并直接调用该类别的所有底层工具。

3. **`chrome_javascript` 单表达式即席执行**：
   执行无需手动包装 `(function(){ return ... })()`。对于 `document.title`、`window.location.href` 或任何合法单表达式，执行器会自动补齐 `return (...)` 包装，免去手写 return 的烦恼。
