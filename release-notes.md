# BrowserClaw v2.6.2 - 3-Phase Execution Hardening, Assertions & Action-Triggered Network Capture

### Highlights (核心摘要)
BrowserClaw v2.6.2 是一次**全面强化批处理流水线断言能力、模态窗隔离感知以及动作触发级网络数据静默捕获的工业级系统加固发布**。落地了三大核心能力：
1. **多断言增强流水线 (`batch-actions` 丰富 Assert)**：新增 `matches_regex`、`starts_with`、`ends_with` 与 `attribute_equals` 等高阶断言，支持 `continue_on_failure` 宽容容错与自愈提示；
2. **模态窗/弹窗严格隔离感知 (`read_dom` Modal Isolation)**：在检测到全屏模态窗口时，自动隔离背景非模态干扰节点，输出 `[Modal Active: ...]` 焦点锁定标识，防止 Agent 在弹窗开启时盲目操作背景元素；
3. **动作触发级网络抓包 (`Action-Triggered Network Capture`)**：在 `batch-actions` 与 `interact-index` 中支持单次交互同步嗅探因点击触发的异步 JSON API 响应，直接回传结构化数据。

---

### 1. 🛡️ 批处理流水线多维断言与数据提取增强
- **扩展断言条件**：在 `chrome_batch_actions` 中新增 `matches_regex`、`starts_with`、`ends_with`、`attribute_equals` 条件；
- **智能失败容错**：支持 `continue_on_failure: true`，断言失败记录详细上下文而不中断后续表单清理流程；
- **自愈诊断提示**：断言未通过时输出精确的 `actual`、`expected` 及上下文 Diff，为推理模型提供直接自愈依据。

---

### 2. 🎯 模态窗视口隔离与焦点锁定感知
- **自动范围修剪**：当页面存在活跃的 `<dialog open>`、`aria-modal="true"` 或 `z-index` 顶层遮罩时，`chrome_read_dom` 优先隔离输出模态树，屏蔽被遮蔽的非交互背景；
- **语义标记提示**：在 AX 树头部直观标注模态焦点归属，引导 Agent 优先闭环确认或关闭当前弹窗。

---

### 3. ⚡ 交互动作自驱网络拦截 (Action-Triggered Network Capture)
- **零额外轮询捕获**：在点击、表单提交时支持附带 `captureNetwork` 规则（如过滤 `*/api/*`），单次 Tool Call 同时返回交互结果与后台异步返回的纯 JSON 数据；
- **敏感字段脱敏**：配合 `output-sanitizer` 自动脱敏响应体中的 Token、密钥与密码字段。

---

### 📦 包含资产 (Assets)
- **`browserclaw-extension-v2.6.2.zip`**：v2.6.2 纯净版 Chrome 扩展安装包，解压后可直接在 Chrome 开发者模式一键加载；
- **`browserclaw-skill-v2.6.2.zip`**：包含 45 规范工具契约与最新高阶断言范式的 Agent Skill 配置包。
