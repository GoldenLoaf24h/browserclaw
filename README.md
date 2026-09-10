# BrowserClaw

> 把你**正在使用**的 Chrome 变成 AI agent 可控、可读、可验证的操作环境。
>
> 📖 English version: [README.en.md](./README.en.md) · 工具参考: [docs/TOOLS.md](./docs/TOOLS.md) · 故障排查: [docs/TROUBLESHOOTING.md](./docs/TROUBLESHOOTING.md)

BrowserClaw 是 [hangwin/mcp-chrome](https://github.com/hangwin/mcp-chrome)（MIT）的深度优化分支：WXT (Vue 3) MV3 扩展 + Fastify 原生宿主 + 共享 schema 包三层架构，经 Chrome Native Messaging 连接，把 CDP 能力封装为 **46 个 schema 校验的 MCP 工具**。

与无头浏览器方案（Playwright/Puppeteer）的本质区别：运行在用户**日常浏览器**里，天然携带登录态、Cookie、扩展环境，事件为浏览器原生可信事件（isTrusted=true）。

## 核心能力

### 感知层 —— 让 agent 看清页面

- **chrome_read_dom**：DOM 剪枝树 + 1-based 元素索引，含遮挡检测（isOccluded/occludedBy）与安全点击点；典型页面压缩比 0.6，输出仅数 KB
- **assets[] 视觉资源索引**：img/canvas/video/CSS 背景图全部带视口 bbox 输出；chrome_screenshot 按 assetIndex 直接返回图像字节（canvas 反爬内容也能读），跨域等不可得时回退视口裁剪
- **chrome_get_markdown**：结构化 Markdown 转换，fit 模式自动剥离 nav/header/footer/aside 噪声（crawl4ai fit-markdown 等价实现）
- **chrome_get_links**：链接图谱提取（绝对 URL + 锚文本 + 内外链 + nofollow），多页爬取的输入

### 交互层 —— 让 agent 点得准

- **统一定位器**：ref → selector → text/role → coordinate 四级降级，所有交互工具共用
- **chrome_computer**：16 种动作（left_click/drag/scroll/zoom/type/key…），dwellMs 按压时长对抗瞬击拒绝，coordinateSpace 显式声明坐标空间
- **chrome_interact_index**：索引直点 + drag（end/steps/holdMs/dnd）
- **chrome_batch_actions / chrome_burst_interact**：批量与低延迟序列，单次往返执行多步
- **反作弊合规**：CDP Input 原生可信事件、真实指针轨迹、isTrusted 全链路保持

### 可靠性设计

- 截图零落盘：>450KB 自动降质内联缩略图，右/下边缘黑边采样自愈重拍
- 工具面 = schema 面：未声明执行器不可调用（测试钉死）；profile 隐藏的工具可用 chrome_tool_docs 按类别查参数
- 错误信息面向 agent：结构化 + 有限 stack，无原始异常泄漏
- 安全护栏：chrome:// 受限页拦截、跨域截图域名校验、Session Tab Affinity

## 46 个工具 × 3 档 Profile

| Profile | 环境变量 | 工具数 | Schema 开销 | 场景 |
| --- | --- | --- | --- | --- |
| full | 不设置（默认） | 46 | ~17.2k tokens | 完整能力 |
| core | `CHROME_MCP_TOOL_PROFILE=core` | 28 | ~13.2k tokens | 日常浏览/操作/验证 |
| crawl | `CHROME_MCP_TOOL_PROFILE=crawl` | 12 | ~4.8k tokens | 批量网页读取/爬取 |

工具分组：导航与标签页（7）· 页面感知（5）· 交互操作（12）· 观察与滚动（5）· 数据管理（9）· 性能与诊断（8）——完整清单见 [docs/TOOLS.md](./docs/TOOLS.md)。

## 环境要求

| 依赖 | 版本 | 说明 |
| --- | --- | --- |
| Chrome / Edge | ≥ 120（MV3） | 你日常使用的浏览器即可，无需独立实例 |
| Node.js | ≥ 20（建议 22 LTS） | 原生宿主与构建 |
| pnpm | ≥ 9（lockfile v9） | 包管理器 |
| 操作系统 | Windows / macOS / Linux | 原生宿主注册路径自动适配 |

## 安装

### 1. 构建三包

```bash
git clone https://github.com/GoldenLoaf24h/browserclaw.git
cd browserclaw
pnpm install
pnpm build        # 顺序: shared → extension → native-server
```

构建产物：扩展在 `app/chrome-extension/.output/chrome-mv3`，宿主在 `app/native-server/dist`。

### 2. 加载扩展

Chrome 打开 `chrome://extensions` → 开启开发者模式 → 加载已解压的扩展程序 → 选择 `app/chrome-extension/.output/chrome-mv3`。Firefox 构建可用 `pnpm --filter chrome-mcp-server build:firefox`。

### 3. 注册原生宿主（一次性）

```bash
cd app/native-server
node dist/scripts/register-dev.js        # 用户级注册，无需管理员
```

在 Chrome 扩展管理页点击 BrowserClaw 的 service worker 或 popup 完成连接。注册脚本会把 Native Messaging manifest 写入浏览器配置目录（Windows: %APPDATA%\Google\Chrome\NativeMessagingHosts\ 等）。系统级注册用 `node dist/cli.js register --system`（需管理员）。

### 4. 连接 MCP 客户端

**HTTP**：端点 `http://127.0.0.1:12306/mcp`，Bearer token 在 `~/.chrome-mcp/bridge-token`（宿主首次启动自动生成）。

**stdio**：

```json
{
  "mcpServers": {
    "browserclaw": {
      "command": "node",
      "args": ["<repo-root>/app/native-server/dist/mcp/mcp-server-stdio.js"]
    }
  }
}
```

连接验证：调用 `chrome_tool_docs { "category": "perceive" }`（任何 profile 均可用）。配置详见 [skill/config/mcp-config.json](./skill/config/mcp-config.json) 与 [docs/mcp-cli-config.md](./docs/mcp-cli-config.md)。

## 工作原理

```
MCP Client (stdio/HTTP) ──► Native Host (Fastify, 127.0.0.1:12306)
        │  Bearer token 认证，会话隔离（10 分钟空闲回收）
        ▼
   Native Messaging（1MB 帧上限）
        ▼
Chrome Extension MV3 Service Worker
        │  46 个工具执行器 + Unified Locator + Screenshot Context
        ▼
Inpage Engine（隔离世界注入，20 个页面内入口）──► CDP (DOM/Page/Input/Runtime)
```

扩展 popup 提供连接开关与 agent 控制总开关（关闭后所有工具调用被拒绝）。

## 开发与测试

```bash
pnpm dev              # 并行 watch 三包
pnpm typecheck        # 全仓 tsc --noEmit（extension 用 vue-tsc）
pnpm lint && pnpm format
```

| 测试 | 命令 | 数量 |
| --- | --- | --- |
| 扩展单测（vitest） | `pnpm --filter chrome-mcp-server test` | 77 |
| 仓库回归（node:test） | `node --experimental-strip-types --test test/boost-*.test.ts test/p0-p1-hardening.test.ts` | 129 |
| E2E（4 层） | `pnpm test` | 153 |

修改扩展代码后需在 chrome://extensions 重载扩展。工具文档重新生成：`node scripts/gen-tools-doc.mjs`。

## 文档地图

| 文档 | 内容 |
| --- | --- |
| [skill/SKILL.md](./skill/SKILL.md) | agent 操作手册：双引擎工作流、批处理、视觉回退、索引失效自愈 |
| [docs/TOOLS.md](./docs/TOOLS.md) | 46 工具参数参考（schema 生成） |
| [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) | 架构与数据流（mermaid） |
| [docs/TROUBLESHOOTING.md](./docs/TROUBLESHOOTING.md) | 报错速查与连接排查 |
| [AGENT_CONFIG_GUIDE.md](./AGENT_CONFIG_GUIDE.md) | 各 MCP 客户端接入配置 |
| [TEST_INFRA.md](./TEST_INFRA.md) | E2E 测试基础设施规格 |

## License

MIT — 见 [LICENSE](./LICENSE)。上游 [hangwin/mcp-chrome](https://github.com/hangwin/mcp-chrome) 版权归其作者。
