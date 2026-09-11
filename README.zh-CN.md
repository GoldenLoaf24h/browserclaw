<div align="center">
  <img src="./docs/images/logo.png" width="100" alt="BrowserClaw Logo" />
  <h1>BrowserClaw</h1>
  <p><b>控制你自己的浏览器的一切。</b></p>
  <p>
    <a href="./docs/MAP.md">🗺️ 项目地图</a> ·
    <a href="./docs/TOOLS.md">工具参考 (52)</a> ·
    <a href="./AGENT_CONFIG_GUIDE.md">客户端配置</a> ·
    <a href="./README.md">📖 English</a> ·
    <a href="https://github.com/GoldenLoaf24h/browserclaw/releases">Releases</a>
  </p>
</div>

---

<details>
<summary><b>💡 项目背景：为什么需要 BrowserClaw？（点击展开）</b></summary>

<br/>

传统的浏览器自动化方案（Playwright、Puppeteer、browser-use）运行在孤立的无头沙盒中，完全丢失了你日常积累的登录凭证、Cookie 与扩展插件。在 Windows 平台下，试图复制用户数据目录会直接因文件排他共享锁崩溃抛出 `[WinError 32]`；而原生开启调试端口（`--remote-debugging-port`）则会遭遇 Chromium 强制弹窗警告，彻底破坏自动化的无人值守特性。

**BrowserClaw** 从浏览器内部彻底破局：基于 MV3 Chrome 扩展与本地原生通信网桥，常驻于你的主力日常浏览器中 —— 零登录态丢失、零文件锁冲突、零抢占前台焦点，为 AI Agent 打造极速、安全、可信的原生操控环境。

</details>

---

## ⚡ 什么是 BrowserClaw？

BrowserClaw 是一套面向 AI Agent 的工业级模型上下文协议（MCP）平台，赋予智能体对您日常 Chrome 浏览器的完整、可信操控能力：

- 🍪 **100% 继承日常会话**：无感复用 Google、GitHub、企业内网 SSO 登录态，免除重复登录与 2FA 阻断。
- 🎯 **双引擎高精定位**：极简剪枝 DOM 树（Token 消耗立省 85%+），配合 1:1 CSS 视口坐标网格视觉兜底。
- ⚡ **操作自驱局部 Diff (`includeDelta`)**：单步点击与填表同时回传局部 DOM 变动，减少 50% 交互网络往返。
- 🔍 **毫秒级定向检索 (`chrome_grep`)**：超大长页面无需 dump 全量 DOM，单次检索消耗 <100 Tokens。
- 🖱️ **真人体感视觉动效**：1:1 复刻弹簧动力学虚拟鼠标轨迹悬浮层，以及专属色彩的 Chrome 标签分组生命周期管理。
- 🛡️ **会话级零抖动保活**：10 分钟长闲置常驻机制，彻底消除黄条频繁下坠与页面拉风琴式抽搐。

---

## 🚀 极速上手 (让 AI 帮你完成配置)

### 步骤 1：把仓库交给你的 AI Agent
直接对你的 AI 助手（Claude Code、Cursor、Windsurf、Codex）发送：
> *“请帮我配置并启动 BrowserClaw MCP 服务：https://github.com/GoldenLoaf24h/browserclaw”*

或手动在本地终端执行：
```bash
git clone https://github.com/GoldenLoaf24h/browserclaw.git
cd browserclaw && pnpm install && pnpm build
cd app/native-server && node dist/scripts/register-dev.js
```
*(高熵 Token 自动生成于 `~/.chrome-mcp/bridge-token`，服务监听 `http://127.0.0.1:12306/mcp`)*

### 步骤 2：在 Chrome 中加载扩展
1. 下载 **[最新纯净扩展包](https://github.com/GoldenLoaf24h/browserclaw/releases/latest)**（或直接使用本工程 `app/chrome-extension/.output/chrome-mv3`）。
2. 在 Chrome / Edge 地址栏打开 `chrome://extensions`，开启右上角**“开发者模式”**。
3. 点击左上角**“加载已解压的扩展程序”**，选择该文件夹。

> 🤫 **进阶技巧（彻底隐藏调试横条）**：在桌面 Chrome 快捷方式启动参数中加入 `--silent-debugger-extension-api`，浏览器将完全隐藏顶部长黄条，页面零位移静默运行。

---

## 🛠️ 核心工具全览 (52 个 MCP 工具)

BrowserClaw 将 52 个 Schema 校验的工具划分为三大动态 Profile（**Core: 24**, **Crawl: 15**, **Full: 52**）。完整参数字典详见 **[docs/TOOLS.md](./docs/TOOLS.md)**。

| 类别 | 工具数 | 核心代表能力 |
| :--- | :---: | :--- |
| **导航与标签管理** | 7 | `navigate` (后台防偷焦), `switch_tab`, `close_tabs`, `tab_groups` |
| **内容分析与检索** | 10 | `read_dom` (剪枝交互树), `get_markdown`, `grep` (定向秒搜), `get_links` |
| **页面交互与流水线** | 8 | `interact_index` (自驱Diff), `fill_index`, `batch_actions` (断言/提取流水线) |
| **视觉与高清捕获** | 5 | `screenshot` (像素标尺网格), `inspect_media` (无损图片/Canvas提取) |
| **网络捕获与拦截** | 6 | `intercept_api` (静默捕获接口JSON), `network_capture`, `get_cookies` |
| **控制与人机协作** | 16 | `request_human_intervention` (毛玻璃接管), `undo_last_action`, `cdp_execute` |

---

## 🏗️ 架构拓扑

```text
AI 智能体 (Cursor / Claude / Codex)
         │  MCP 协议 (HTTP / SSE / Stdio) @ 127.0.0.1:12306
         ▼
本地原生网桥 (Fastify + Stdio 宿主)
         │  Chrome Native Messaging 本地双向管道 (1MB 物理截断保护)
         ▼
Chrome MV3 扩展 (Service Worker + WXT + Vue 3)
         ├── 页内 DOM 引擎 (隔离世界注入，1-based 动态索引)
         ├── CDP 会话管理器 (10分钟长闲置常驻，Domain 引用计数)
         └── Agent 虚拟光标 (Closed Shadow DOM 弹簧物理悬浮层)
```

系统详细设计与交互时序见 **[docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md)**。

---

## 📚 项目全景文档库

- **[项目地图导览](./docs/MAP.md)**：🗺️ 快速按角色导航、全工程 Monorepo 代码拓扑树与文档矩阵。
- **[全量工具字典](./docs/TOOLS.md)**：自动化生成的 52 个工具完整参数输入输出参考手册。
- **[Agent 交互实操心法](./AGENT_CONFIG_GUIDE.md)**：面向大模型的六大高能交互准则与主流客户端配置样例。
- **[深度系统架构](./docs/ARCHITECTURE.md)**：多进程拓扑、IPC 安全边界与设计决策记录 (ADR)。
- **[故障排查指南](./docs/TROUBLESHOOTING.md)**：常见报错代码与连接异常秒级诊断排查。

---

## 💡 站在巨人的肩膀上（参考开源项目）

BrowserClaw 在设计与实现中汲取了开源社区的卓越智慧：
- **[hangwin/mcp-chrome](https://github.com/hangwin/mcp-chrome)**：奠定坚实的 MV3 扩展 + Native Messaging 双向 IPC 底座。
- **[browser-use/browser-use](https://github.com/browser-use/browser-use)**：启发极致省 Token 的 1-based DOM 索引理念。
- **[browseros-ai/BrowserOS](https://github.com/browseros-ai/BrowserOS)**：引入操作自驱 Diff 回传（`includeDelta`）与定向快速检索（`chrome_grep`）。
- **[ChatGPT 官方 Chrome 扩展](https://chromewebstore.google.com/detail/chatgpt/hehggadaopoacecdllhhajmbjkdcmajg)**：1:1 复刻弹簧动力学虚拟鼠标悬浮层与专属标签组生命周期管理。

---

## 📄 开源许可协议

采用 [GNU Affero General Public License v3.0 (AGPL-3.0)](./LICENSE) 协议。任何修改、衍生打包或提供网络 SaaS API 服务均须强制同等开源。

---

_说明与消歧义：BrowserClaw MCP 是一个面向 AI Agent 自动化操控日常真实浏览器的独立 Chrome 扩展与 Model Context Protocol 生态，与 npm 上的同名 Playwright 库互不关联。_
