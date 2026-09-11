<div align="center">
  <img src="./docs/images/logo.png" width="100" alt="BrowserClaw Logo" />
  <h1>BrowserClaw</h1>
  <p>把你<b>正在使用</b>的 Chrome 变成 AI agent 可控、可读、可验证的高性能操作环境。</p>
  <p>
    <a href="./README.md">📖 English Version</a> ·
    <a href="./docs/TOOLS.md">工具参考</a> ·
    <a href="./docs/TROUBLESHOOTING.md">故障排查</a> ·
    <a href="https://github.com/GoldenLoaf24h/browserclaw/releases">GitHub Releases</a>
  </p>
</div>

---

<details>
<summary><b>💡 项目背景与初衷：Windows 环境下 Agent 操控本地浏览器的困境（点击展开）</b></summary>

<br/>

在本地运行 AI Agent（Hermes、Codex、Claude Code）时，调用浏览器进行数据检索与自动化交互是高频刚需。理想状态下，Agent 应当能直接复用开发者主浏览器现有的登录态（Google、GitHub、社区论坛、校企后台等），并在后台静默完成任务，无需人工干预。

但在 Windows 平台下，现存的主流方案均存在底层硬伤：

1. **无头沙盒与配置复制派（Playwright / Puppeteer / browser-use）**：
   - **登录态割裂**：采用独立沙盒环境，无法继承日常登录凭据，面对 2FA 和验证码时流程即刻阻断。
   - **配置热复制触发 `[WinError 32]`**：部分框架试图将主浏览器的 `User Data` 拷贝到临时目录来“伪复用”登录态。在 Windows 下，主 Chrome 只要运行，内核对 `Cookies`、`Session_*` 等文件施加严格的**排他共享锁（Exclusive Lock）**，直接崩溃抛出 `[WinError 32: 另一个程序正在使用此文件，进程无法访问]`。
   - **资源泄漏**：Windows 句柄继承机制容易在进程异常退出时残留无头 `chrome.exe` 僵尸进程，持续霸占系统内存。

2. **原生 CDP 远程调试（`--remote-debugging-port`）**：
   - **强制人工确认（致命阻断）**：现代 Chromium 加强了安全门禁，外部进程每次挂接调试端口时均会弹出全屏安全提示，必须人工手动点击“允许”，彻底破坏了自动化的无人值守特性。
   - **不支持动态注入**：主浏览器已运行时无法中途开放调试端口，必须关闭所有已有标签页并强杀进程后重新带参拉起。
   - **排他文件锁死锁**：多进程访问同一用户目录极易引发目录冲突与死锁崩溃。

3. **第三方方案跳票**：
   - 业内主打轻量化与免配置的方案长期优先支持 macOS 与 Linux，Windows 正式版迟迟未推出。

**BrowserClaw** 由此诞生：基于 **Chrome Native Messaging + MV3 扩展** 架构，无需杀进程、无惧文件锁、无需手动点弹窗，真正实现 Windows 平台上的**登录态无感复用**与**100% 完全无人值守**。

</details>

---

## 📌 BrowserClaw 是什么？

BrowserClaw 是 [hangwin/mcp-chrome](https://github.com/hangwin/mcp-chrome)（MIT）的深度优化分支：WXT (Vue 3) MV3 扩展 + Fastify 原生宿主 + 共享 schema 包三层架构，经 Chrome Native Messaging 连接，把 CDP 能力封装为 **52 个 schema 校验的 MCP 工具**。

与无头浏览器方案（Playwright/Puppeteer）的本质区别：运行在用户**日常浏览器**里，天然携带登录态、Cookie、扩展环境，事件为浏览器原生可信事件（isTrusted=true）。

---

## 🚀 极速上手 (把项目交给 AI 即可！)

> **用户操作仅需 1 分钟**：让 AI Agent 完成环境与服务配置，您只需手动将纯净扩展包下载并加载至 Chrome。

### 第 1 步：把项目交给你的 AI Agent
将本仓库目录直接提供给你的 AI 编程助手（Claude Code、Cursor、Codex、Windsurf、Cline），并对它说：
> *“帮我配置并启动 BrowserClaw MCP 服务器：https://github.com/GoldenLoaf24h/browserclaw”*

AI Agent 将自动执行后台桥接服务构建与原生注册：
```bash
git clone https://github.com/GoldenLoaf24h/browserclaw.git
cd browserclaw
pnpm install && pnpm build
cd app/native-server && node dist/scripts/register-dev.js
```
*(生成的 Bearer Token 位于 `~/.chrome-mcp/bridge-token`，默认监听端口 `http://127.0.0.1:12306/mcp`)*

### 第 2 步：在 Chrome 加载扩展（您唯一的手动操作）
1. 前往 **[GitHub Releases 下载最新纯净扩展包](https://github.com/GoldenLoaf24h/browserclaw/releases/latest)**（`browserclaw-extension-latest.zip`，仅 ~350KB）。
2. 解压到本地任意固定目录（如 `browserclaw-extension`）。
3. 打开 Chrome 或 Edge，在地址栏输入 `chrome://extensions/` 并开启右上角“**开发者模式**”。
4. 点击左上角“**加载已解压的扩展程序**”，选择解压后的文件夹。

完成！您的 AI Agent 现已获得对您当前浏览器安全、带登录态的高性能全自动操控能力。

---

## 🛠️ 核心功能全览（点击展开对应类别）

<details open>
<summary><b>🌐 1. 导航与标签页管理 (7 个工具)</b></summary>

<br/>

- **`chrome_navigate`**：页面 URL 跳转、前进（`"forward"`）、后退（`"back"`）或整页刷新。原生支持 `background: true`，保证后台静默打开，绝不抢占前台用户焦点。
- **`chrome_switch_tab`**：无感切换活跃标签页或绑定会话亲缘标签页。
- **`chrome_close_tabs`**：关闭指定标签页（支持 ID 数组）或按目标 URL 模式批量匹配关闭。
- **`chrome_move_tab`**：移动标签页在窗口内的排列位置或跨窗口迁移。
- **`get_windows_and_tabs`**：遍历并获取当前所有打开的 Chrome 窗口与标签页详细拓扑（ID、标题、激活状态与 URL）。
- **标签分组全生命周期管理 (`TabGroupManager`)**：
  - `chrome_tab_group_create`：创建带专属色彩与自定义名称的标签分组（默认标题“Agent”）。
  - `chrome_tab_group_update`：动态修改分组标题、折叠状态或色彩。
  - `chrome_tab_group_list`：列出当前窗口内所有活跃分组及其所属标签页。
  - `chrome_tab_group_ungroup`：将特定标签页移出父分组。
  - `chrome_tab_group_close`：一键关闭组内所有标签页并由底层自动销毁分组，杜绝孤儿分组残留。
- **`chrome_attach_tab` / `chrome_detach_tab`**：显式挂载或解除 CDP 调试器与会话亲缘。

</details>

<details open>
<summary><b>👁️ 2. 页面感知与结构化提取 (7 个工具)</b></summary>

<br/>

- **chrome_read_dom**：DOM 剪枝树 + 1-based 元素索引，含遮挡检测（isOccluded/occludedBy）与安全点击点；典型页面压缩比 0.6，输出仅数 KB；支持 `deltaOnly: true` 差量指纹更新模式，Token 消耗骤降 90%
- **chrome_grep**：页面轻量定向检索利器，免 dump 全量 DOM，支持毫秒级检索可交互元素索引、全量节点或可见纯文本行，单次调用仅消耗数十 Token
- **assets[] 视觉资源索引**：img/canvas/video/CSS 背景图全部带视口 bbox 输出；chrome_screenshot 按 assetIndex 直接返回图像字节（canvas 反爬内容也能读），跨域等不可得时回退视口裁剪
- **chrome_inspect_media**：局部高保真媒体透视，支持直接提取 Canvas/图片 原生无损分辨率或 200%+ 超采样特写截图（精准识别复杂验证码与图表）
- **chrome_get_markdown**：结构化 Markdown 转换，fit 模式自动剥离 nav/header/footer/aside 噪声（crawl4ai fit-markdown 等价实现）
- **chrome_get_links**：链接图谱提取（绝对 URL + 锚文本 + 内外链 + nofollow），多页爬取的输入
- **chrome_get_dropdown_options**：探测原生或模拟 `<select>` 下拉选框的全部可选菜单项。
- **chrome_intercept_api**：CDP Network 域静默嗅探与后端 JSON 接口拦截，直接获取结构化真值数据，降维绕过复杂 HTML 逆向

</details>

<details>
<summary><b>⚡ 3. 精准交互与表单自动化 (13 个工具)</b></summary>

<br/>

- **统一定位器**：ref → selector → text/role → coordinate 四级降级，所有交互工具共用
- **自驱 Diff 携带机制**：在 `chrome_interact_index`、`chrome_fill_index`、`chrome_batch_actions` 中传入 `includeDelta: true`，操作完成后自动携带页面增量 DOM，砍掉 50% 网络往返
- **chrome_interact_index**：紧凑 1-based 索引直点 + 阻尼滑翔拖拽（end/steps/holdMs/dnd），内置中心优先遮挡补偿与 CDP 送达回查校验
- **chrome_fill_index**：1-based 索引表单快速填充，输入前自动聚焦并派发真实 input/change 事件。
- **chrome_fill_form / chrome_fill_or_select**：针对复杂多字段表单的批量预填与选择器兼容交互。
- **增强批处理流水线 (chrome_batch_actions)**：原子级无往返执行多步交互，支持 `type: 'assert'` 校验状态与 `type: 'extract'` 提取页面字段，单次往返跑通“填表 -> 提交 -> 校验 -> 取数”全流程
- **chrome_burst_interact**：超低延迟连发点击与键盘序列（对抗动态画布/Canvas 游戏/即时移动目标）。
- **chrome_computer**：16 种底层原生鼠标与键盘复合动作，支持 `dwellMs` 按压时长防瞬击拦截。
- **chrome_keyboard**：物理键盘按键派发与组合快捷键触发（Control+A, Enter 等）。
- **chrome_upload_file**：无头文件上传注入（规避系统原生文件选择对话框死锁）。
- **chrome_handle_dialog**：自动捕获并响应浏览器 `alert`、`confirm`、`prompt` 原生对话框。
- **1:1 复刻 ChatGPT 官方扩展虚拟鼠标 (Agent Cursor)**：封闭 Shadow DOM 隔离渲染，贝塞尔圆弧飞行、弹簧速度拉伸形变、微光尾迹、真实用户接管瞬时淡出
- **原生 Chrome 标签组与无痕销毁 (TabGroupManager)**：自动归入专属色彩分组（默认标题“Agent”），所有任务标签关闭后底层自动销毁分组，绝不遗留孤儿分组
- **微光 Favicon 状态反馈 (TabFaviconManager)**：任务执行中动态将标签页 Favicon 替换为炫蓝脉冲光晕，任务结束或关闭前无感还原

</details>

<details>
<summary><b>🔭 4. 观察、截图与智能滚屏 (5 个工具)</b></summary>

<br/>

- **chrome_screenshot**：零落盘高清截图管线（>450KB 智能降质内联，右/下边缘黑边自愈重拍，支持按 `assetIndex` 定向截取媒体）。
- **chrome_smart_scroll**：智能感知页面或特定可滚动容器的最优滚动位置，返回精确的 `pages_up`/`pages_down` 剩余翻页数与溢出状态。
- **chrome_scroll_to_text**：基于 TreeWalker 的语义文本定位滚动，毫秒级将目标文本平滑滚至视口正中。
- **chrome_scroll**：底层物理滚轮派发（支持上下左右像素距离或按整页倍数滚动）。

</details>

<details>
<summary><b>🗂️ 5. 浏览器数据与状态管理 (历史、书签、存储与下载 - 9 个工具)</b></summary>

<br/>

- **chrome_history**：检索用户真实浏览历史，支持关键词模糊匹配与时间范围过滤（不丢失上下文）。
- **书签管理全套**：
  - `chrome_bookmark_search`：按标题、URL 或目录快速搜索 Chrome 书签；
  - `chrome_bookmark_add`：将当前或指定页面加入书签目录；
  - `chrome_bookmark_delete`：移除指定书签节点。
- **chrome_storage**：本地存储状态读取、修改与清空，完整支持 `localStorage`、`sessionStorage` 与 `IndexedDB` 审查。
- **chrome_handle_download**：监听并拦截下载请求，自动捕获下载 URL、文件名、文件哈希与本地落盘路径。

</details>

<details>
<summary><b>🛠️ 6. 诊断、底层 CDP 与人机协作 (11 个工具)</b></summary>

<br/>

- **chrome_console**：实时捕获页面控制台输出（`log`、`warn`、`error`、`unhandledrejection`），排查前端报错。
- **chrome_javascript**：在当前页面上下文中安全执行任意 JavaScript 代码片段并取回返回值。
- **chrome_cdp_execute**：原生 CDP 穿透逃生通道，支持多态 Target 路由，内置超时自动脱钩（Anti-Hang Detach Guard）保护。
- **性能分析全套 (Performance Tracing)**：
  - `performance_start_trace`：启动 Chromium 渲染与运行性能采样；
  - `performance_stop_trace`：结束采样并导出 DevTools Timeline 追踪数据；
  - `performance_analyze_insight`：自动诊断首屏耗时、长任务（Long Tasks）、CLS 与交互延迟瓶颈。
- **人机协同打断浮条 (chrome_request_human_intervention)**：遭遇 2FA 验证码、滑块或支付时自动唤起毛玻璃通知浮条，支持用户在页面一键或按 Enter 恢复自动化
- **会话操作回滚 (chrome_undo_last_action)**：5 步容量环形操作栈，支持跳转撤销与表单原值反向回填
- **逃生通道 (chrome_cdp_execute)**：对齐工业级 CDP 穿透标准，支持多态 Target 路由与超时自动解挂防挂死
- **`chrome_tool_docs`**：动态工具手册发现与会话级热插拔装配（`activateForSession: true`）。

</details>

<details>
<summary><b>📊 52 个工具 × 3 档 Profile 规格清单</b></summary>

<br/>

## 52 个工具 × 3 档 Profile

| Profile | 环境变量 | 工具数 | Schema 开销 | 场景 |
| --- | --- | --- | --- | --- |
| full | 不设置（默认） | 52 | ~19.5k tokens | 完整底层穿透、诊断与数据管理 |
| core | `CHROME_MCP_TOOL_PROFILE=core` | 24 | ~11.5k tokens | 核心高频利器（DOM 索引、表单、视觉、Grep 定向检索） |
| crawl | `CHROME_MCP_TOOL_PROFILE=crawl` | 15 | ~5.8k tokens | 极速批量网页抓取与数据提取 |

工具分组：导航与标签页（7）· 页面感知（7）· 交互操作（12）· 观察与滚动（6）· 数据管理（11）· 性能与诊断（9）——完整清单见 [docs/TOOLS.md](./docs/TOOLS.md)。

</details>

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
AI Agent 客户端 (Claude Desktop / Cursor / Codex / Cline)
        │
        ▼ (HTTP/SSE 或 Stdio JSON-RPC 带 Token 认证)
本地原生宿主 (Fastify 原生进程, 127.0.0.1:12306)
        │
        ▼ (Chrome Native Messaging 原生管道, <= 1MB 帧保护)
BrowserClaw 扩展 MV3 Service Worker
        │
        ▼ (隔离世界 Inpage Engine 与直连 CDP 通道)
活跃 Chrome 浏览器会话 (isTrusted: true, 专属无孤儿标签分组)
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
| 扩展单测（vitest） | `pnpm --filter chrome-mcp-server test` | 125 项全部通过 (100%) |
| 仓库回归（node:test） | `node --experimental-strip-types --test test/boost-*.test.ts test/p0-p1-hardening.test.ts` | 129 |
| E2E（4 层） | `pnpm test` | 153 |

修改扩展代码后需在 chrome://extensions 重载扩展。工具文档重新生成：`node scripts/gen-tools-doc.mjs`。

## 文档地图

| 文档 | 内容 |
| --- | --- |
| [skill/SKILL.md](./skill/SKILL.md) | agent 操作手册：双引擎工作流、52 工具梯次升级协议、微模式实践 |
| [docs/TOOLS.md](./docs/TOOLS.md) | 52 工具参数参考（schema 自动生成） |
| [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) | 架构与数据流（mermaid） |
| [docs/TROUBLESHOOTING.md](./docs/TROUBLESHOOTING.md) | 报错速查与连接排查 |
| [AGENT_CONFIG_GUIDE.md](./AGENT_CONFIG_GUIDE.md) | 各 MCP 客户端接入配置 |
| [TEST_INFRA.md](./TEST_INFRA.md) | E2E 测试基础设施规格 |

## License

MIT — 见 [LICENSE](./LICENSE)。上游 [hangwin/mcp-chrome](https://github.com/hangwin/mcp-chrome) 版权归其作者。
