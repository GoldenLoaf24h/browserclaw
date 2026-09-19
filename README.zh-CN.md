<div align="center">
  <img src="./docs/images/logo.png" width="100" alt="BrowserClaw Logo" />
  <h1>BrowserClaw</h1>
  <p><b>控制你自己的浏览器的一切。</b></p>
  <p>
    <a href="./docs/MAP.md">🗺️ 项目地图</a> ·
    <a href="./docs/TOOLS.md">工具参考 (47)</a> ·
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

- 🧠 **分层双脑协同架构 (`chrome_act_toward_goal`)**：本地语义微循环以 200~400ms/步极速自主完成“感知 → 决策 → 交互”，**零中间 MCP 网络往返**。内置 TypeSafe Jev System One 并支持平滑降级至启发式规则打分与结构化交接。
- 🔑 **日常会话与登录态无缝复用**：直接运行在日常 Chrome 浏览器中，完整继承 Google、GitHub、企业 SSO 登录凭证，杜绝文件锁冲突与登录丢失。
- 🌲 **1-based 剪枝 DOM 与紧凑 AX 树**：剔除装饰性 DOM 噪点与多余闭合标签，输出高结构化紧凑可交互节点树，相较原生 HTML 缩减 85%+ Token 消耗。
- ⚡ **代码驱动流水线与原子批处理**：通过 `chrome_batch_actions` 或页内 `mcp.*` 脚本，在单次往返中串联表单填写、点击、断言与数据提取闭环。
- 🛡️ **工业级 DOM 穿透与物理事件保真**：Composed 树深度穿透 Shadow DOM，提供遮挡弹窗自愈引导、最优可见点加权以及后台标签页 Click Probe 物理/合成双保险。
- 🔄 **自驱增量 Diff 与定向 Grep 检索**：`includeDelta: true` 在操作完成后直接携带页面局部变动；`chrome_grep` 实现大文档下亚毫秒级低 Token 正则检索。
- 🖱️ **真人级防打扰交互共存**：具备 1:1 弹簧动力学虚拟光标悬浮层、专属彩色标签组生命周期管理、可选独立窗口隔离，以及在 2FA/滑块验证时柔和礼让用户的毛玻璃介入横幅。
- 🧭 **本地浏览器全维能力治理**：超越常规网页爬取，通过 47 项规范 MCP 工具全面管理标签页、窗口、Cookie、存储、浏览历史及书签。

---

## 🧠 分层双脑如何协同工作？

```text
┌─ Tier 2 · 宏观规划大脑 (您的推理大模型) ────────────────┐
│  复杂任务分解、长程推理思考、自由文案生成、异常安全接管 │
└───────────────────────────┬────────────────────────────┘
                            │ MCP 协议 (低频下发宏观微目标)
                            ▼
┌─ Tier 1 · 本地语义微循环 (Native Server) ──────────────┐
│  chrome_act_toward_goal 内部闭环：                     │
│  read_dom → Jev / Heuristic 决策 → 执行动作 → 状态核验 │
│  ~200–400ms/步 · 零额外 MCP 往返                       │
└───────────────────────────┬────────────────────────────┘
                            │ Native Messaging 内部管道
                            ▼
┌─ Tier 0 · 确定性原子工具群 (47 个规范 MCP 工具) ───────┐
│  batch_actions / form_pipeline / interact_index / ...  │
│  Chrome MV3 扩展底层驱动 · 硬件级 CDP 物理事件         │
└────────────────────────────────────────────────────────┘
```

**调度最佳实践天梯：**

- 目标元素索引明确、操作步骤固定 → **Tier 0** 零模型直达 (`chrome_batch_actions` / `chrome_form_pipeline`)
- 自然语言微目标、元素位于当前页面但位置动态未知 → **Tier 1** 语义微循环 (`chrome_act_toward_goal`)
- 长程复杂任务、页面陌生探索、内容生成或微循环遇到歧义/破坏性动作反抛 → **Tier 2** 宏规划大模型直接介入

**环境配置：** 配置 `TYPESAFE_API_KEY` 环境变量即可开启 Jev 极速推理。若未配置或遇额度耗尽，`chrome_act_toward_goal` 将**自动无缝降级**至内置的零依赖启发式引擎 —— 工具永远可用，并在返回体的 `engine` 字段明确自述当前采用的决策引擎。

### 真实环境基准实测 (基于真实 Jev API, T1~T5)

| 测试场景                        | 端到端耗时 | Jev 调用次数 | 累计 Token (输入/输出) | 引擎类型 |
| ------------------------------- | ---------- | ------------ | ---------------------- | -------- |
| T1 导航检索 (Google 搜索并打开) | 2,062ms    | 2            | 1,737 / 52             | jev      |
| T2 表单提交 (输入并登录)        | 586ms      | 2            | 1,666 / 48             | jev      |
| T3 下拉选择 (选择目标项)        | 249ms      | 1            | 781 / 24               | jev      |
| T4 弹窗阻断 (关闭协议并继续)    | 518ms      | 2            | 1,654 / 50             | jev      |
| T5 多步微任务 (搜索并查看详情)  | 574ms      | 2            | 1,654 / 51             | jev      |

单步中位数耗时仅 **~260–350ms**；相比传统大模型全链路循环，端到端耗时降低 **>75%**，Token 消耗节省 **>80%**。

---

## 🚀 极速上手

### 方案一：交给 AI Agent 自动安装 (推荐)

直接复制以下一句话发送给你的 AI 编程助手（Claude Code、Cursor、Windsurf、Codex）：

> _“帮我配置 BrowserClaw：https://github.com/GoldenLoaf24h/browserclaw ，阅读仓库中的 `INSTALL.md` 并按步骤自动安装。”_

AI 将自动完成本地服务的编译与注册。随后你只需从 **[Releases](https://github.com/GoldenLoaf24h/browserclaw/releases/latest)** 下载最新的 **`browserclaw-extension-v*.zip`** 资产（例如 `browserclaw-extension-v2.8.0.zip`），解压到本地固定目录，打开 `chrome://extensions` 开启“开发者模式”，将该解压文件夹拖入即可。

### 方案二：通过 ChatGPT / Codex 插件市场添加

在 ChatGPT 或 Codex 的插件中心，点击右上角的 **`+`**（添加市场），填入本仓库地址：

```text
https://github.com/GoldenLoaf24h/browserclaw
```

添加成功后，点击安装 **BrowserClaw** 插件即可一键启用。

### 方案三：通过 Hermes Agent 安装

在终端直接安装到你的 Hermes 环境：

```bash
hermes plugins install GoldenLoaf24h/browserclaw#plugins/browserclaw
hermes plugins enable browserclaw
```

### 方案四：本地手动安装

```bash
git clone https://github.com/GoldenLoaf24h/browserclaw.git
cd browserclaw && pnpm install && pnpm build
cd app/native-server && node dist/scripts/register-dev.js
```

随后在 `chrome://extensions` 中点击“加载已解压的扩展程序”，选择 `app/chrome-extension/.output/chrome-mv3` 目录即可。

---

## 🛠️ 全量工具分类全览 (47 个核心规范 MCP 工具)

全量 47 个核心规范 Schema 校验的工具按功能归纳为以下 7 个大类别。**点击对应分类即可展开查看工具清单。**
完整 JSON Schema 与入参定义请参阅 **[docs/TOOLS.md](./docs/TOOLS.md)**。

<details>
<summary><b>🧠 0. 目标自驱微闭环 (1 个工具) — v2.8 重磅新增</b></summary>

<br/>

- **`chrome_act_toward_goal`**：自主语义微闭环执行器，在 Native Server 本地以 200~400ms/步 极速闭环感知、决策与执行。由 TypeSafe Jev System One 驱动，无 Key 或遇额度网络降级时无缝切换内置启发式引擎；遭遇歧义、破坏性动作（14 个敏感词拦截）或卡滞时结构化反抛交回宏规划大模型。

</details>

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
<summary><b>📄 2. 内容感知、检索与数据提取 (5 个工具)</b></summary>

<br/>

- **`chrome_read_dom`**：极简剪枝 DOM 交互树，带 1-based 纯数字索引，Token 消耗压缩 85%+。
- **`chrome_grep`**：毫秒级正则/文本定向检索，返回匹配项与索引，超大页面免除 Dump 全量 DOM。
- **`chrome_get_markdown`**：提取页面排版优美、纯净结构化的 Markdown 文本（支持 `includeLinks: true` 提取链接图谱），阅读长文与资料总结首选。
- **`chrome_inspect_media`**：内存无损提取 `<img>` 与 `<canvas>` 原始图像 Data URL，支持 200%+ 超采样局部特写裁切。
- **`chrome_get_dropdown_options`**：直接读取原生或自定义 `<select>` 下拉选择器的全部可用候选项。

</details>

<details>
<summary><b>🖱️ 3. 页面交互、输入与流水线 (12 个工具)</b></summary>

<br/>

- **`chrome_interact_index`**：核心物理级点击/悬停/双击/连击序列（`points` 数组），原生支持 `includeDelta: true` 自动回传局部变动。
- **`chrome_fill_index`**：纯原生物理输入，支持清空重填、Enter 提交与 `includeDelta: true` 变动核验。
- **`chrome_batch_actions`**：闭环批处理流水线，单次网络调用按序执行点击、填充、等待，内置 `assert` 断言与 `extract` 提取。
- **`chrome_form_pipeline`**：确定性复杂表单/向导流水线，零模型调用，标准复杂表单填表最稳最快。
- **`chrome_smart_scroll`**：智能自适应滚屏，具备视口溢出检测、像素精确滚动与剩余滚动页数（`pages_down`）感知反馈。
- **`chrome_keyboard`**：派发单键（Enter/Tab/Esc）、组合快捷键（Ctrl+C/V）或指定元素文本聚焦输入。
- **`chrome_upload_file`**：动态拦截本地文件选择对话框，或直接向 `<input type="file">` 注入绝对路径。
- **`chrome_handle_dialog`**：响应或预设针对 JavaScript 原生弹窗（Alert / Confirm / Prompt）的自动处理策略。
- **`chrome_handle_download`**：追踪、监听并管理浏览器底层正在进行的原生文件下载。
- **`chrome_computer`**：兼容 Anthropic Computer Use 协议的统一光标与键盘物理控制接口。（_遗留兼容通道，新自主闭环优先推荐 `chrome_act_toward_goal`_）。
- **`chrome_request_human_intervention`**：页面毛玻璃暗化并挂起，让渡控制权供人类完成滑块/2FA，完成后一键无缝恢复。
- **`chrome_undo_last_action`**：5 步环形栈撤销引擎，单步回滚最近一次页面跳转或表单输入。

</details>

<details>
<summary><b>👁️ 4. 视觉感知、控制台与底层执行 (3 个工具)</b></summary>

<br/>

- **`chrome_screenshot`**：捕获视口或整页截图，可选叠加高对比度半透明像素标尺网格（Visual Fallback 必备）。
- **`chrome_console`**：捕获、实时监听并过滤页面中的 JavaScript Console 日志与未捕获异常。
- **`chrome_cdp_execute`**：工业级底层 CDP 逃生通道，支持 Target 多态路由与超时防死锁自动脱离。

</details>

<details>
<summary><b>📡 5. 网络拦截与存储管理 (5 个工具)</b></summary>

<br/>

- **`chrome_intercept_api`**：静默嗅探并解码匹配 URL 模式的后端接口返回，直接提取结构化 JSON 数据。
- **`chrome_network_capture`**：开启或停止全链路网络请求录制（涵盖状态码、响应头与传输载荷）。
- **`chrome_network_request`**：通过当前浏览器会话代理发送原生 HTTP 请求，继承当前站点的 Cookie 与会话头。
- **`chrome_storage`**：读取、写入或清理当前站点的 `localStorage`、`sessionStorage` 与 Cookie 数据。
- **`chrome_javascript`**：在页面隔离环境中执行任意自定义 JavaScript 脚本（支持单行表达式自动 return）。

</details>

<details>
<summary><b>🗂️ 6. 标签分组、书签、历史与系统诊断 (14 个工具)</b></summary>

<br/>

- **`chrome_tab_group_create`**：创建带专属色彩与任务标题的 Chrome 标签分组（默认名称：“Agent”）。
- **`chrome_tab_group_update`**：动态修改标签组标题、主题颜色或切换折叠状态。
- **`chrome_tab_group_list`**：枚举当前窗口内的所有活跃标签分组及其关联标签。
- **`chrome_tab_group_ungroup`**：将指定标签页从分组中解散移出。
- **`chrome_tab_group_close`**：一键关闭组内所有标签并彻底销毁空分组（零孤儿残留）。
- **`chrome_history`**：按关键词或自定义时间跨度检索浏览器历史访问记录。
- **`chrome_bookmark_search` / `add` / `delete`**：检索、新增或删除 Chrome 收藏夹书签。
- **`performance_start_trace` / `stop_trace` / `analyze_insight`**：录制并深入分析 Chromium 底层性能 Trace 指标。
- **`chrome_tool_docs`**：动态查询工具文档，支持在会话级按需解锁全量工具分类（`activateForSession: true`）。
- **`chrome_doctor`**：诊断运行环境健康状况、检查端口 12306、Native Messaging Host 与插件通信链路。

</details>

---

## 🏗️ 架构拓扑

```text
AI 智能体 (Cursor / Claude / Codex)
         │  MCP 协议 (HTTP / SSE / Stdio) @ 127.0.0.1:12306
         ▼
本地原生网桥 (Fastify + Stdio 宿主)
         ├── 极速决策引擎 (Jev 客户端 + 零依赖启发式降级 + 语义微循环)
         ├── 46 个确定性原子工具 + 1 个自主微循环（共 47 项工具穿透直通）
         │  Chrome Native Messaging 本地双向管道 (1MB 物理截断保护)
         ▼
Chrome MV3 扩展 (Service Worker + WXT + Vue 3)
         ├── 页内 DOM 引擎 (隔离世界注入，1-based 动态索引)
         ├── CDP 会话管理器 (10分钟长闲置常驻，Domain 引用计数)
         └── Agent 虚拟光标 (Closed Shadow DOM 弹簧物理悬浮层)
```

系统详细设计与交互时序见 **[docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md)**（含 ADR-023 双脑分层架构决策记录）。

---

## 📚 项目全景文档库

- **[项目地图导览](./docs/MAP.md)**：🗺️ 快速按角色导航、全工程 Monorepo 代码拓扑树与文档矩阵。
- **[全量工具字典](./docs/TOOLS.md)**：自动化生成的 47 个工具完整参数输入输出参考手册。
- **[Agent 交互实操心法](./AGENT_CONFIG_GUIDE.md)**：面向大模型的六大高能交互准则与主流客户端配置样例。
- **[深度系统架构](./docs/ARCHITECTURE.md)**：多进程拓扑、IPC 安全边界与设计决策记录 (ADR)。
- **[故障排查指南](./docs/TROUBLESHOOTING.zh-CN.md)**：常见报错代码与连接异常秒级诊断排查。

---

## 💡 站在巨人的肩膀上（参考开源项目）

BrowserClaw 在设计与实现中汲取了开源社区的卓越智慧：

- **[hangwin/mcp-chrome](https://github.com/hangwin/mcp-chrome)**：奠定坚实的 MV3 扩展 + Native Messaging 双向 IPC 底座。
- **[browser-use/browser-use](https://github.com/browser-use/browser-use)**：启发极致省 Token 的 1-based DOM 索引理念。
- **[browseros-ai/BrowserOS](https://github.com/browseros-ai/BrowserOS)**：引入操作自驱 Diff 回传（`includeDelta`）与定向快速检索（`chrome_grep`）。
- **[ChatGPT 官方 Chrome 扩展](https://chromewebstore.google.com/detail/chatgpt/hehggadaopoacecdllhhajmbjkdcmajg)**：1:1 复刻弹簧动力学虚拟鼠标悬浮层与专属标签组生命周期管理。
- **[TypeSafe Jev](https://docs.typesafe.ai)** 以及开源参考项目 [jev-browser](https://github.com/jkudish/jev-browser)、[jev-voice-browser](https://github.com/moritzkremb/jev-voice-browser) 与 [jev-ultrafast](https://github.com/browser-use/jev-ultrafast)：启发 System One 极速判定模式、投机式问题扇出 (Speculative Fan-out) 以及语义化准则设计。

---

## 📄 开源许可协议

采用 [GNU Affero General Public License v3.0 (AGPL-3.0)](./LICENSE) 协议。任何修改、衍生打包或提供网络 SaaS API 服务均须强制同等开源。

---

_说明与消歧义：BrowserClaw MCP 是一个面向 AI Agent 自动化操控日常真实浏览器的独立 Chrome 扩展与 Model Context Protocol 生态，与 npm 上的同名 Playwright 库互不关联。_
