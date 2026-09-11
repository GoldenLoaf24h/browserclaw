# BrowserClaw

> 把你**正在使用**的 Chrome 变成 AI agent 可控、可读、可验证的操作环境。
>
> 📖 English version: [README.md](./README.md) · 工具参考: [docs/TOOLS.md](./docs/TOOLS.md) · 故障排查: [docs/TROUBLESHOOTING.md](./docs/TROUBLESHOOTING.md)

BrowserClaw 是 [hangwin/mcp-chrome](https://github.com/hangwin/mcp-chrome)（MIT）的深度优化分支：WXT (Vue 3) MV3 扩展 + Fastify 原生宿主 + 共享 schema 包三层架构，经 Chrome Native Messaging 连接，把 CDP 能力封装为 **46 个 schema 校验的 MCP 工具**。

与无头浏览器方案（Playwright/Puppeteer）的本质区别：运行在用户**日常浏览器**里，天然携带登录态、Cookie、扩展环境，事件为浏览器原生可信事件（isTrusted=true）。

## 核心能力

### 感知层 —— 让 agent 看清页面

- **chrome_read_dom**：DOM 剪枝树 + 1-based 元素索引，含遮挡检测（isOccluded/occludedBy）与安全点击点；典型页面压缩比 0.6，输出仅数 KB；支持 `deltaOnly: true` 差量指纹更新模式，Token 消耗骤降 90%
- **chrome_grep**：页面轻量定向检索利器，免 dump 全量 DOM，支持毫秒级检索可交互元素索引、全量节点或可见纯文本行，单次调用仅消耗数十 Token
- **assets[] 视觉资源索引**：img/canvas/video/CSS 背景图全部带视口 bbox 输出；chrome_screenshot 按 assetIndex 直接返回图像字节（canvas 反爬内容也能读），跨域等不可得时回退视口裁剪
- **chrome_inspect_media**：局部高保真媒体透视，支持直接提取 Canvas/图片 原生无损分辨率或 200%+ 超采样特写截图（精准识别复杂验证码与图表）
- **chrome_get_markdown**：结构化 Markdown 转换，fit 模式自动剥离 nav/header/footer/aside 噪声（crawl4ai fit-markdown 等价实现）
- **chrome_get_links**：链接图谱提取（绝对 URL + 锚文本 + 内外链 + nofollow），多页爬取的输入
- **chrome_intercept_api**：CDP Network 域静默嗅探与后端 JSON 接口拦截，直接获取结构化真值数据，降维绕过复杂 HTML 逆向

### 交互层 —— 让 agent 点得准

- **统一定位器**：ref → selector → text/role → coordinate 四级降级，所有交互工具共用
- **自驱 Diff 携带机制**：在 `chrome_interact_index`、`chrome_fill_index`、`chrome_batch_actions` 中传入 `includeDelta: true`，操作完成后自动携带页面增量 DOM，砍掉 50% 网络往返
- **chrome_interact_index**：紧凑 1-based 索引直点 + 阻尼滑翔拖拽（end/steps/holdMs/dnd），内置中心优先遮挡补偿与 CDP 送达回查校验
- **增强批处理流水线 (chrome_batch_actions)**：原子级无往返执行多步交互，支持 `type: 'assert'` 校验状态与 `type: 'extract'` 提取页面字段，单次往返跑通“填表 -> 提交 -> 校验 -> 取数”全流程
- **1:1 复刻 ChatGPT 官方扩展虚拟鼠标 (Agent Cursor)**：封闭 Shadow DOM 隔离渲染，贝塞尔圆弧飞行、弹簧速度拉伸形变、微光尾迹、真实用户接管瞬时淡出
- **原生 Chrome 标签组与无痕销毁 (TabGroupManager)**：自动归入专属色彩分组（默认标题“Agent”），所有任务标签关闭后底层自动销毁分组，绝不遗留孤儿分组
- **微光 Favicon 状态反馈 (TabFaviconManager)**：任务执行中动态将标签页 Favicon 替换为炫蓝脉冲光晕，任务结束或关闭前无感还原
- **人机协同打断浮条 (chrome_request_human_intervention)**：遭遇 2FA 验证码、滑块或支付时自动唤起毛玻璃通知浮条，支持用户在页面一键或按 Enter 恢复自动化
- **会话操作回滚 (chrome_undo_last_action)**：5 步容量环形操作栈，支持跳转撤销与表单原值反向回填
- **逃生通道 (chrome_cdp_execute)**：对齐工业级 CDP 穿透标准，支持多态 Target 路由与超时自动解挂防挂死
- **反作弊合规**：CDP Input 原生可信事件、真实指针轨迹、isTrusted 全链路保持

### 可靠性设计

- 截图零落盘：>450KB 自动降质内联缩略图，右/下边缘黑边采样自愈重拍
- 工具面 = schema 面：未声明执行器不可调用（测试钉死）；profile 隐藏的工具可用 chrome_tool_docs 按类别查参数
- 错误信息面向 agent：结构化 + 有限 stack，无原始异常泄漏
- 安全护栏：chrome:// 受限页拦截、跨域截图域名校验、Session Tab Affinity

## 52 个工具 × 3 档 Profile

| Profile | 环境变量 | 工具数 | Schema 开销 | 场景 |
| --- | --- | --- | --- | --- |
| full | 不设置（默认） | 52 | ~19.5k tokens | 完整底层穿透、诊断与数据管理 |
| core | `CHROME_MCP_TOOL_PROFILE=core` | 24 | ~11.5k tokens | 核心高频利器（DOM 索引、表单、视觉、Grep 定向检索） |
| crawl | `CHROME_MCP_TOOL_PROFILE=crawl` | 15 | ~5.8k tokens | 极速批量网页抓取与数据提取 |

工具分组：导航与标签页（7）· 页面感知（7）· 交互操作（12）· 观察与滚动（6）· 数据管理（11）· 性能与诊断（9）——完整清单见 [docs/TOOLS.md](./docs/TOOLS.md)。

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
