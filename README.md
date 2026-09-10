# BrowserClaw

> 📖 English version: [README.en.md](./README.en.md)

> Chrome 浏览器自动化 MCP 服务器 —— 把你正在使用的 Chrome 变成 AI agent 可控、可读、可验证的操作环境。

BrowserClaw 是 [hangwin/mcp-chrome](https://github.com/hangwin/mcp-chrome) 的深度优化分支（MIT）。项目基于 WXT (Vue 3) 扩展 + Fastify 原生宿主 + 共享 schema 包的三层架构，通过 Chrome 原生消息通道（Native Messaging）与扩展通信，把 CDP 能力封装为 46 个经过 schema 校验的 MCP 工具。

## 它解决什么问题

通用浏览器 MCP 的三个痛点，BrowserClaw 给出了工程答案：

1. **DOM 噪声**：完整 DOM 序列化动辄数百 KB。chrome_read_dom 输出剪枝树 + 1-based 元素索引（含遮挡检测与安全点击点），8 元素页面仅数百字节；视觉资源（img/canvas/video/CSS 背景图）单独输出 assets[] 清单并带视口坐标，chrome_screenshot 可按 assetIndex 直接取图像字节。
2. **坐标歧义**：所有坐标类工具统一走 unified-locator（ref → selector → text/role → coordinate 四级降级），坐标空间由 coordinateSpace 参数显式声明（viewport 默认 / screenshot 映射），不再被残留截图上下文静默缩放。
3. **反自动化误伤**：CDP Input 事件是浏览器原生可信事件（isTrusted=true），点击支持 dwellMs 按压时长（对抗"瞬击拒绝"）、拖拽 steps/holdMs、burst 轨迹序列。

## 46 个工具，按需暴露

| Profile | 工具数 | Schema 开销 | 用途 |
| --- | --- | --- | --- |
| full（默认） | 46 | ~17.2k tokens | 完整能力 |
| core | 28 | ~13.2k tokens | 浏览/操作/验证日常工作流 |
| crawl | 12 | ~4.8k tokens | 批量网页读取与爬取 |

被 profile 隐藏的工具不会消失：chrome_tool_docs（任何 profile 都可用）按类别输出紧凑参数文档，agent 按需发现。

能力速览：页面感知（read_dom / get_markdown / get_web_content / get_links）、交互（click / fill / keyboard / batch_actions / burst_interact / interact_index）、视觉（screenshot 含元素裁剪与 assetIndex、smart_scroll、computer 16 种动作）、诊断（console / javascript / storage 含 HttpOnly Cookie 与 WebSocket 帧 / network_request）。

## 架构

```
MCP Client (stdio/HTTP) ──► Native Host (Fastify, 127.0.0.1:12306)
                                  │ Native Messaging
                                  ▼
                           Chrome Extension (WXT + Vue 3, MV3 Service Worker)
                                  │ CDP / chrome.scripting
                                  ▼
                              Your Browser Tabs
```

- packages/shared —— 工具 schema、类型、坐标解析、错误格式化（所有包的唯一事实源）
- app/chrome-extension —— MV3 扩展：后台 SW 承载 46 个工具执行器 + in-page engine（隔离世界注入的 20 个页面内入口），popup 为 Vue 3
- app/native-server —— Fastify 原生宿主：MCP stdio/HTTP 双传输、会话管理（10 分钟空闲回收）、bridge token 认证

## 快速开始

```bash
pnpm install
pnpm build          # shared → extension → native server 依次构建
```

1. Chrome 打开 `chrome://extensions`，加载 `app/chrome-extension/.output/chrome-mv3`（开发者模式）
2. 按 `app/native-server/install.md` 注册原生宿主
3. MCP 客户端接入：`http://127.0.0.1:12306/mcp`（Bearer token 见 `~/.chrome-mcp/bridge-token`）或 stdio

选择工具子集：`CHROME_MCP_TOOL_PROFILE=core|crawl|full`（默认 full）。

## 开发

```bash
pnpm dev              # 并行 watch 三包
pnpm typecheck        # 全仓 tsc --noEmit
pnpm test             # E2E（4 层 153 项）
pnpm lint && pnpm format
```

扩展单测：`pnpm --filter chrome-mcp-server test`（vitest，77 项）；仓库回归：`node --experimental-strip-types --test test/boost-*.test.ts test/p0-p1-hardening.test.ts`（129 项）。

agent 使用细节见 [skill/SKILL.md](./skill/SKILL.md)（双引擎工作流、反作弊合规点击、索引失效自愈）；工具级文档见 [docs/TOOLS.md](./docs/TOOLS.md)。

## License

MIT，参见 [LICENSE](./LICENSE)。上游项目 hangwin/mcp-chrome 版权归其作者所有。
