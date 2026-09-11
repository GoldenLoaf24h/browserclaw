# Troubleshooting / 故障排查

BrowserClaw 由本地构建的三部分组成：扩展（MV3）、原生宿主（native-server）、MCP 端点（127.0.0.1:12306）。以下按现象排查，全部基于本仓库实际实现。

## 1. MCP 客户端连不上 127.0.0.1:12306

1. 确认原生宿主进程存活：宿主由 Chrome 扩展通过 Native Messaging 拉起，Chrome 未运行时宿主不存在是正常的。
2. 确认端口监听：`netstat -ano | findstr 12306`。
3. 确认 token：请求头 `Authorization: Bearer <token>`，token 在 `~/.chrome-mcp/bridge-token`（宿主首次启动自动生成）。401/403 检查该文件。
4. `CHROME_MCP_HOST` / `CHROME_MCP_PORT` 可覆盖默认 127.0.0.1:12306（见 app/native-server/src/constant/index.ts）。

## 2. 扩展 SW 未连接宿主

1. chrome://extensions → BrowserClaw → service worker 控制台查 `[NativeHost]` 日志。
2. 首次使用需在 popup 里连接；storage.session 的 `agentControlEnabled=false` 会拦截所有工具调用。
3. 扩展重载后 Native Messaging 连接断开，宿主需重启。

## 3. 工具调用报错速查

| 报错 | 原因与处理 |
| --- | --- |
| Cannot access a chrome:// URL | 受限页面，换普通页面 |
| executeScript timeout ... renderer not acking | 页面有原生弹窗或 renderer 卡死，先 chrome_handle_dialog |
| CDP_DISPATCH_TIMEOUT | 目标 tab 在后台且批量竞速超时，激活 tab 或重试 |
| Security check failed: Domain changed | 上次截图域名与当前 tab 不一致，重新截图 |
| Tool X is not exposed under the ... profile | 当前 profile 隐藏了该工具，用 chrome_tool_docs 查参数或改回 full |
| Tool X is not a BrowserClaw tool | 工具名不存在，tools/list 查看当前 52 个（或 core 24 / crawl 15 / full 52） |

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
