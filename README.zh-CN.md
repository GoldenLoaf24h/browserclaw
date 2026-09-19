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

BrowserClaw 是一套**分层双脑浏览器智能体平台**。它将常驻于真实 Chrome 内部的高性能 MCP 执行面（47 个工具）与 Native Server 本地语义微闭环完美融合 —— 快速决策引擎负责高频“感知 → 决策 → 动作”，推理大模型负责宏观任务规划。

最终带来：Agent 操控浏览器**提速 3~5 倍，Token 消耗直降 70%~80%+**，同时完整保留原生 CDP 物理保真、Shadow DOM 深度穿透与反爬风控抗性。

- 🧠 **分层双脑宏工具 (`chrome_act_toward_goal`)**：本地微循环以 ~~200~~400ms/步 极速运行感知与动作，**零额外 MCP 网络往返**。大模型出规划，小引擎做执行。
- 🪜 **三引擎降级天梯**：TypeSafe Jev (System One) → 零依赖 Heuristic 启发式引擎 → 结构化反抛交还大模型（附预取 DOM）。**永不硬崩溃，故障无感平滑降级**。
- 🍪 **100% 继承日常会话**：无感复用 Google、GitHub、企业内网 SSO 登录态，免除重复登录与 2FA 阻断。
- 🎯 **双引擎高精定位**：极简剪枝 DOM 树（Token 消耗立省 85%+），配合 1:1 CSS 视口坐标网格视觉兜底。
- 🌲 **AX 紧凑语义树**：对齐 Chromium 原生无闭合标签语义格式，单次阅读 DOM 的 Token 消耗再降 60%~75%。
- 🔗 **Code-Driven 在页链式脚本 (`mcp.*`)**：通过单次 `chrome_javascript` 链式调用 (`mcp.click`, `mcp.fill`, `mcp.waitFor`, `mcp.extract`)，将 4~6 次网络往返压缩为 1 次。
- 🛡️ **Shadow DOM 穿透与遮挡自愈**：深度遍历 composed 树穿透 Web Component 内部节点，被弹窗遮挡时返回高语义弹窗名助 Agent 自主决策关闭。
- 🎯 **最优可见点与 Click Probe 探针兜底**：视口加权有效可见面积定位，若遇 Chromium 后台标签页节流自动补发合成 DOM 鼠标事件，保障 100% 触发。
- 📡 **四级分层抓取协议**：建立从登录态直通 JSON API (`chrome_network_request`) 到静默响应拦截、紧凑 DOM 及视觉快照的梯度最佳实践。
- ⚡ **操作自驱局部 Diff (`includeDelta`)**：单步点击与填表同时回传局部 DOM 变动，减少 50% 交互网络往返。
- 🔍 **毫秒级定向检索 (`chrome_grep`)**：超大长页面无需 dump 全量 DOM，单次检索消耗 <100 Tokens。
- 🖱️ **真人体感视觉动效**：1:1 复刻弹簧动力学虚拟鼠标轨迹悬浮层，以及专属色彩的 Chrome 标签分组生命周期管理。
- 🛡️ **会话级零抖动保活**：10 分钟长闲置常驻机制，彻底消除黄条频繁下坠与页面拉风琴式抽搐。
- 🌐 **掌控本地浏览器里的一切**：不同于只能在隔离无头沙盒中打转的传统自动化方案，BrowserClaw 让 AI 能够直接安全地管理你日常主力浏览器里的一切 —— 实时标签页、窗口、Cookie、历史记录与书签，真正做到与你的日常工作流无缝融合。

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

AI 将自动完成本地服务的编译与注册。随后你只需下载 **[最新纯净扩展包](https://github.com/GoldenLoaf24h/browserclaw/releases/latest)**，打开 `chrome://extensions` 开启“开发者模式”，将解压文件夹拖入即可。

### 方案二：通过 ChatGPT / Codex 插件市场添加

在 ChatGPT 或 Codex 的插件中心，点击右上角的 **`+`**（添加市场），填入本仓库地址：

```text
https://github.com/GoldenLoaf24h/browserclaw
```

添加成功后，点击安装 **BrowserClaw** 插件即可一键启用。

### 方案三：本地手动安装

```bash
git clone https://github.com/GoldenLoaf24h/browserclaw.git
cd browserclaw && pnpm install && pnpm build
cd app/native-server && node dist/scripts/register-dev.js
```

随后在 `chrome://extensions` 中点击“加载已解压的扩展程序”，选择 `app/chrome-extension/.output/chrome-mv3` 目录即可。

---

## ⚖️ 开源方案全景横向对比

开源社区中的优秀项目各有其独特的架构选型与最佳应用场景。我们从真实开发者和日常用户最关心的**核心场景、Token 经济性、操作系统可靠性与协同体感**出发，客观呈现各方案的优势与定位：

| 核心能力与架构维度                    | **BrowserClaw (本项目)**                                                                    | **browser-use (Python/CDP)**                                                  | **Playwright MCP (微软官方)**                                                        | **Stagehand (Browserbase)**                                                  |
| :------------------------------------ | :------------------------------------------------------------------------------------------ | :---------------------------------------------------------------------------- | :----------------------------------------------------------------------------------- | :--------------------------------------------------------------------------- |
| **真实浏览器登录态继承**              | ✅ **100% 原生扩展常驻**<br>直接复用日常 Chrome 已有的 Google、GitHub 与企业 SSO            | ⚠️ **需单独配置 Profile**<br>独立外部进程；直接复制目录易触发反爬风控         | ❌ **临时空白沙盒**<br>每次启动均为全新测试环境，无日常工作上下文                    | ❌ **云端远程沙盒**<br>运行于远程容器，需手动导入 Cookie 与凭证              |
| **本地极速决策微循环**                | ✅ **分层双脑架构**<br>本地 ~200–400ms/步 感知决策执行闭环，零额外 MCP 往返                 | ⚠️ **大模型单步往返**<br>每单步操作均需向云端大模型往返一次 (10s+ 累计延迟)   | ❌ **纯工具集**<br>完全依赖外部 Orchestrator 进行繁琐单步决策                        | ⚠️ **单步云端推理**<br>依赖云端推理完成单步定位，计费高昂                    |
| **决策容错与降级天梯**                | ✅ **三引擎降级天梯**<br>Jev → 启发式引擎 → 结构化反抛接管，永不硬崩溃                      | ❌ **单大脑硬阻塞**<br>大模型超时或报错直接打断整个自动化循环                 | ❌ **无决策层**<br>无任何本地决策容错层                                              | ⚠️ **简单重试**<br>依赖云端模型接口健康度重试                                |
| **开箱即用 Agent 闭环**               | ⚠️ **MCP 协议面 + 本地微循环**<br>即插即用接入你已有的 Agent（Cursor/Claude/Codex）         | ✅ **自带完整 Agent 循环**<br>开箱即用，终端直接运行自包含的大模型决策循环    | ❌ **仅提供 MCP 工具集**<br>纯协议工具，需依赖外部 Agent 进行思考调度                | ✅ **自然语言直接驱动**<br>支持 `page.act("点击登录")` 一句话执行语义动作    |
| **跨浏览器内核支持 (Firefox/WebKit)** | ❌ **仅限 Chromium 内核**<br>专为 Chrome、Edge、Brave 等 Chromium 深度定制                  | ⚠️ **Chromium 为主**<br>底层基于 CDP，主要针对 Chromium 引擎                  | ✅ **全内核原生支持**<br>微软官方跨平台矩阵，原生支持 Chromium、Firefox、WebKit      | ⚠️ **Chromium 为主**<br>云端容器环境主要运行 Chromium                        |
| **云端弹性海量并发集群**              | ❌ **立足本地桌面端**<br>专为个人日常工作流打造，非云端千台容器农场                         | ⚠️ **需自建集群**<br>需自行搭建 Docker 容器网络实现多开横向扩展               | ⚠️ **需自建 CI 矩阵**<br>需结合 GitHub Actions 或无头集群编排运行                    | ✅ **一键云端海量并发**<br>原生接入 Browserbase，可秒级并发上千台云端实例    |
| **单步交互 Token 成本**               | ✅ **极度经济 (<800 Tokens)**<br>DOM 剪枝索引 + 自驱局部 Diff（变动局部回传，省 50% 往返）  | ⚠️ **中等开销 (~5,000 Tokens)**<br>每步依赖全量快照重算或视觉大模型多模态调用 | ❌ **高开销 (>10,000 Tokens)**<br>每次交互均需向 Prompt 倾倒全量 ARIA 可访问性文本树 | ❌ **高开销 (多模态推断)**<br>每个语义动作均依赖云端大模型对页面重新推断定位 |
| **超大长页面定向秒搜**                | ✅ **`chrome_grep` (<100 Tokens)**<br>毫秒级正则/文本定向秒搜，免除全量 Dump DOM 消耗       | ❌ **全量 DOM 提取**<br>需将整页数万字 HTML/DOM 放入上下文搜索                | ❌ **全量 ARIA 扫描**<br>Agent 需逐行遍历解析长达数万行的无结构文本树                | ⚠️ **语义查找**<br>通过大模型在云端重新匹配推测目标位置                      |
| **多步复合流水线**                    | ✅ **闭环 `batch_actions`**<br>连续操作 + `assert` 校验 + `extract` 提取单次 RTT 完成       | ⚠️ **单步循环决策**<br>每一步点击/打字均需大模型往返一次（10s+ 累计延迟）     | ❌ **单步调用**<br>无内置批量流水线，无步骤级断言与数据提取                          | ⚠️ **单步语义执行**<br>`page.act()` 每次动作独立进行网络往返与计费           |
| **真人体感与人机共存**                | ✅ **1:1 弹簧物理虚拟光标**<br>平滑飞行、微光 Favicon、专属色彩标签组隔离，零打扰           | ❌ **无视觉悬浮层**<br>无头直接跳转，多标签页杂乱堆叠在用户窗口中             | ❌ **无视觉层**<br>纯为自动化测试设计，无用户视觉反馈或防打扰设计                    | ⚠️ **远程控制台串流**<br>在网页控制台通过 Canvas 串流投屏，非本地平滑层      |
| **2FA / 滑块人机无缝接管**            | ✅ **毛玻璃顶栏接管**<br>页面柔和暗化挂起，人类在当前页面完成后一键无缝恢复                 | ❌ **超时崩溃**<br>遇到滑块验证码通常超时重试或任务直接卡死                   | ❌ **测试断言失败**<br>无原生交互接管通道，流程直接抛出超时异常                      | ⚠️ **云端控制台介入**<br>需切换至云端提供商后台网页手动点击解决              |
| **Windows 本地文件锁免疫**            | ✅ **Native Messaging**<br>零独占锁争用，不占端口，静默后台运行防抢焦                       | ❌ **WinError 32 锁冲突**<br>热复制 User Data 必遭 Windows 排他共享文件锁崩溃 | ⚠️ **易残留僵尸进程**<br>异常退出易残留无头 `chrome.exe` 进程霸占内存                | ✅ **云端运行无锁**<br>完全脱离本地 OS，不存在本地文件锁问题                 |
| **本地浏览器全域掌控**                | ✅ **标签、窗口、历史与书签全管理**<br>直接操控日常标签与窗口，查阅历史流偏好并自动归整书签 | ❌ **无此能力**<br>隔离于独立无头沙盒，完全无法访问或管理宿主真实浏览器       | ❌ **无此能力**<br>仅限一次性测试容器，会话结束后全部销毁                            | ❌ **无此能力**<br>云端临时实例，与本地日常浏览器彻底割裂                    |

### 🧭 如何为你的场景选择最佳工具？

- **如果需要开箱即用的终端 Python 自动化 Agent**：推荐 **[browser-use](https://github.com/browser-use/browser-use)**，自带完整自包含的大模型思考循环。
- **如果在搭建严格跨 Firefox / WebKit 的 CI/CD 自动化测试套件**：推荐 **[Playwright MCP](https://github.com/microsoft/playwright-mcp)**，微软官方出品，跨多浏览器内核支持最权威。
- **如果需要在企业级云端弹性并发上千台无头浏览器**：推荐 **[Stagehand](https://github.com/browserbase/stagehand)**，依托 Browserbase 免除所有本地硬件运维负担。
- **如果想让 AI 编程助手（Claude Code、Cursor、Windsurf、Codex）操控你每天日常使用的真实 Chrome**：**选择 BrowserClaw** —— 100% 继承已有全部登录态与 Cookie、享受分层双脑极速本地决策、单步 Token 消耗直降 85%+、拥有真人体感虚拟光标与专属标签组隔离，遭遇滑块验证码能一键毛玻璃接管恢复！

---

## 🛠️ 全量工具分类全览 (47 个核心规范 MCP 工具)

全量 47 个核心规范 Schema 校验的工具按功能归纳为以下大类别。**点击对应分类即可展开查看工具清单。**
完整 JSON Schema 与入参定义请参阅 **[docs/TOOLS.md](./docs/TOOLS.md)**。

<details>
<summary><b>🧠 0. 目标自驱微闭环 (1 个工具) — v2.8 重磅新增</b></summary>

<br/>

- **`chrome_act_toward_goal`**：自主语义微闭环执行器，在 Native Server 本地以 ~~200~~400ms/步 极速闭环感知、决策与执行。由 TypeSafe Jev System One 驱动，无 Key 或遇额度网络降级时无缝切换内置启发式引擎；遭遇歧义、破坏性动作（14个敏感词拦截）或卡滞时结构化反抛交回宏规划大模型。

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
<summary><b>🖱️ 3. 页面交互、输入与流水线 (11 个工具)</b></summary>

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
- **[故障排查指南](./docs/TROUBLESHOOTING.md)**：常见报错代码与连接异常秒级诊断排查。

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
