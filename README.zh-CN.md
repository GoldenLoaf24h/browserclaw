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

## ⚖️ 开源方案全景横向对比

| 特性 / 架构维度 | **BrowserClaw (本项目)** | **browser-use** | **Stagehand (Browserbase)** | **Playwright MCP** | **browserclaw (idan-rubin)** |
| :--- | :---: | :---: | :---: | :---: | :---: |
| **运行宿主环境** | **你日常的真实 Chrome (扩展)** | 无头 / 独立 Chrome 实例 | 云端托管 / 远程无头浏览器 | 本地无头 Chromium | Playwright 独立脚本库 |
| **复用既有登录态与 Cookie** | ✅ **100% 原生继承** | ⚠️ 配置繁琐易失效 | ❌ 临时干净沙盒 | ❌ 临时干净沙盒 | ❌ 临时干净沙盒 |
| **Windows 文件排他锁免疫** | ✅ **Native Messaging (无锁冲突)** | ❌ 遭遇 `WinError 32` 崩溃 | N/A (云端无头) | N/A (云端无头) | ❌ 遭遇 `SingletonLock` 争用 |
| **后台静默执行 (防抢焦)** | ✅ **零弹窗 / 零警告横幅** | ❌ CDP 强制弹窗确认 | ⚠️ 仅限远程屏幕 | ⚠️ 虚拟显示器模拟 | ❌ 端口占用冲突隐患 |
| **元素交互定位系统** | ✅ **DOM 1-based 索引 + 坐标标尺** | 纯 DOM 数字索引 | 自然语言大模型推断 | 原生 ARIA 快照 | ARIA 文本树 Ref 引用 |
| **操作自驱局部 Diff** | ✅ **支持 (`includeDelta`)** | ❌ 需全量重评估 | ❌ 需全量重评估 | ❌ 需全量重评估 | ❌ 需全量重新快照 |
| **定向轻量检索 (<100 Token)** | ✅ **支持 (`chrome_grep`)** | ❌ 仅能 Dump 全量 DOM | ❌ 依赖自然语言推测 | ❌ 仅能 Dump 全量 DOM | ❌ 仅能 Dump 全量 DOM |
| **真人体感虚拟光标** | ✅ **1:1 弹簧动力学悬浮层** | ❌ 无视觉悬浮层 | ❌ 无视觉悬浮层 | ❌ 无视觉悬浮层 | ❌ 无视觉悬浮层 |
| **标签页生命周期隔离** | ✅ **专属色彩 Chrome 标签分组** | ❌ 杂乱标签堆积 | ❌ 无分组隔离 | ❌ 无分组隔离 | ❌ 无分组隔离 |
| **2FA / 滑块人机协作接管** | ✅ **毛玻璃顶栏挂起 + 一键恢复** | ❌ 超时报错死锁 | ⚠️ 手动控制台暂停 | ❌ 无接管设计 | ⚠️ 仅代码异常捕获 |
| **底层逃生通道** | ✅ **`cdp_execute` (防挂熔断)** | ⚠️ Python 裸调 CDP | ❌ 仅限 Playwright API | ❌ 受限于固定工具集 | ⚠️ Playwright 页面接口 |

### 🔍 客观局限与当前设计边界
在绝大多数日常浏览器操作场景中，BrowserClaw 具备明显优势，但我们坚持开源坦诚原则，明确指出当前架构的三项边界：
1. **仅适配 Chromium 内核**：BrowserClaw 深度依赖 Chromium 扩展 API 与 CDP 协议（Chrome、Edge、Brave、Opera），暂不兼容 Firefox (Gecko) 或 Safari (WebKit)。
2. **本地桌面操作定位**：专为你个人日常使用的浏览器与本地 AI 智能体（Cursor、Claude Code、Codex）打造，定位不是云端无头测试集群（无法像云端 SaaS 一样瞬间并发拉起 1,000 个无头 Docker）。
3. **Native Messaging 1MB 传输限制**：遵循 Chrome 本地进程通信安全规范，单条 JSON 消息负载上限为 1MB。对于超大图片或长视频提取，推荐直接通过本地绝对文件路径引用。

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

## 🛠️ 全量工具分类全览 (52 个 MCP 工具)

全量 52 个 Schema 校验的工具按功能归纳为以下 6 大类别。**点击对应分类即可展开查看工具清单。**
完整 JSON Schema 与入参定义请参阅 **[docs/TOOLS.md](./docs/TOOLS.md)**。

<details>
<summary><b>🌐 1. 导航与标签页管理 (7 个工具)</b></summary>

<br/>

- **`chrome_navigate`**：URL 网页跳转、前进、后退或整页刷新。原生支持 `background: true`，后台静默打开绝不抢占前台焦点。
- **`chrome_switch_tab`**：平滑切换活跃标签页，或绑定 Agent 会话与特定标签页的上下文亲和度。
- **`chrome_close_tabs`**：按 ID 数组、URL 通配规则批量关闭标签页，安全关闭前台页面需显式 `confirm: true` 保护。
- **`chrome_move_tab`**：精确调整标签页在窗口中的索引位置，或在不同浏览器窗口之间迁移/分离标签页。
- **`get_windows_and_tabs`**：枚举当前打开的所有 Chrome 窗口与标签页的元数据（ID、标题、URL 与激活状态）。
- **`chrome_attach_tab`**：显式挂载特定标签页的底层 Chrome DevTools Protocol 调试器连接。
- **`chrome_detach_tab`**：显式解除特定标签页的调试器挂载。

</details>

<details>
<summary><b>📄 2. 内容感知、检索与数据提取 (7 个工具)</b></summary>

<br/>

- **`chrome_read_dom`**：极简剪枝 DOM 交互树，带 1-based 纯数字索引，Token 消耗压缩 85%+。
- **`chrome_grep`**：毫秒级正则/文本定向检索，返回匹配项与索引，超大页面免除 Dump 全量 DOM。
- **`chrome_get_markdown`**：提取页面排版优美、纯净结构化的 Markdown 文本，阅读长文与资料总结首选。
- **`chrome_inspect_media`**：内存无损提取 `<img>` 与 `<canvas>` 原始图像 Data URL，支持 200%+ 超采样局部特写裁切。
- **`chrome_get_web_content`**：事件驱动型页面加载等待与正文文本提取。
- **`chrome_get_links`**：提取当前页面中的全部超链接地址（URL）与对应锚文本。
- **`chrome_get_dropdown_options`**：直接读取原生或自定义 `<select>` 下拉选择器的全部可用候选项。

</details>

<details>
<summary><b>🖱️ 3. 页面交互、输入与流水线 (15 个工具)</b></summary>

<br/>

- **`chrome_interact_index`**：核心物理级点击/悬停/双击，原生支持 `includeDelta: true` 自动回传局部变动。
- **`chrome_fill_index`**：纯原生物理输入，支持清空重填与 `includeDelta: true` 变动核验。
- **`chrome_batch_actions`**：闭环批处理流水线，单次网络调用按序执行点击、填充、等待，内置 `assert` 断言与 `extract` 提取。
- **`chrome_smart_scroll`**：智能自适应滚屏，具备视口溢出检测与剩余滚动页数（`pages_down`）感知反馈。
- **`chrome_scroll`**：按像素或方向精确滚动整页或特定可滚动容器。
- **`chrome_scroll_to_text`**：自动在页面中检索目标文本并平滑滚动使其居中展现。
- **`chrome_keyboard`**：派发单键（Enter/Tab/Esc）、组合快捷键（Ctrl+C/V）或指定元素文本聚焦输入。
- **`chrome_upload_file`**：动态拦截本地文件选择对话框，或直接向 `<input type="file">` 注入绝对路径。
- **`chrome_handle_dialog`**：响应或预设针对 JavaScript 原生弹窗（Alert / Confirm / Prompt）的自动处理策略。
- **`chrome_handle_download`**：追踪、监听并管理浏览器底层正在进行的原生文件下载。
- **`chrome_burst_interact`**：超低延迟连击序列，适用于即时连击或高并发点击场景。
- **`chrome_computer`**：兼容 Anthropic Computer Use 协议的统一光标与键盘物理控制接口。
- **`chrome_cdp_execute`**：工业级底层 CDP 逃生通道，支持 Target 多态路由与超时防死锁自动脱离。
- **`chrome_request_human_intervention`**：页面毛玻璃暗化并挂起，让渡控制权供人类完成滑块/2FA，完成后一键无缝恢复。
- **`chrome_undo_last_action`**：5 步环形栈撤销引擎，单步回滚最近一次页面跳转或表单输入。

</details>

<details>
<summary><b>👁️ 4. 视觉感知与视口控制 (3 个工具)</b></summary>

<br/>

- **`chrome_screenshot`**：捕获视口或整页截图，可选叠加高对比度半透明像素标尺网格（Visual Fallback 必备）。
- **`chrome_get_mouse_position`**：实时查询虚拟光标在当前视口中的物理坐标位置。
- **`chrome_console`**：捕获、实时监听并过滤页面中的 JavaScript Console 日志与未捕获异常。

</details>

<details>
<summary><b>📡 5. 网络拦截与存储管理 (6 个工具)</b></summary>

<br/>

- **`chrome_intercept_api`**：静默嗅探并解码匹配 URL 模式的后端接口返回，直接提取结构化 JSON 数据。
- **`chrome_network_capture`**：开启或停止全链路网络请求录制（涵盖状态码、响应头与传输载荷）。
- **`chrome_network_request`**：通过当前浏览器会话代理发送原生 HTTP 请求，继承当前站点的 Cookie 与会话头。
- **`chrome_storage`**：读取、写入或清理当前站点的 `localStorage`、`sessionStorage` 与 Cookie 数据。
- **`chrome_javascript`**：在页面隔离环境中执行任意自定义 JavaScript 脚本（支持单行表达式自动 return）。
- **`chrome_tool_docs`**：动态查询工具文档，支持在会话级按需解锁全量工具分类（`activateForSession: true`）。

</details>

<details>
<summary><b>🗂️ 6. 标签分组、书签、历史与诊断 (9 个工具)</b></summary>

<br/>

- **`chrome_tab_group_create`**：创建带专属色彩与任务标题的 Chrome 标签分组（默认名称：“Agent”）。
- **`chrome_tab_group_update`**：动态修改标签组标题、主题颜色或切换折叠状态。
- **`chrome_tab_group_list`**：枚举当前窗口内的所有活跃标签分组及其关联标签。
- **`chrome_tab_group_ungroup`**：将指定标签页从分组中解散移出。
- **`chrome_tab_group_close`**：一键关闭组内所有标签并彻底销毁空分组（零孤儿残留）。
- **`chrome_history`**：按关键词或自定义时间跨度检索浏览器历史访问记录。
- **`chrome_bookmark_search` / `add` / `delete`**：检索、新增或删除 Chrome 收藏夹书签。
- **`performance_start_trace` / `stop_trace` / `analyze_insight`**：录制并深入分析 Chromium 底层性能 Trace 指标。

</details>

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
