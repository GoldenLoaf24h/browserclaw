# BrowserClaw v2.6.1 - Modern SPA Edge-Case Hardening, Input Disambiguation & Mask Piercing

### Highlights (核心摘要)
BrowserClaw v2.6.1 是一次**深度攻坚现代单页应用 (SPA，如 Twitter/X、Complex Dashboards、Rich Social Web) 极端交互场景的系统级稳固发布**。彻底解决了现代 SPA 中多输入框歧义（富文本发帖框 vs 顶部搜索框）、透明遮罩阻断物理点击、动态滚动边界丢失以及会话标签页上下文串流等 4 大高频阻断痛点。

---

### 1. 🎯 输入框语义消歧与富文本状态同步 (Input Disambiguation)
- **多输入框智能识别与标识**：
  - 自动通过 `detectEditorSemantics` 精确区分富文本发帖框（Draft.js、Lexical、ProseMirror、Quill、`role="textbox"`）与普通搜索框（`type="search"`、`role="searchbox"`）；
  - 在紧凑 DOM 树中为富文本编辑器追加 `[composer]` 与 `[editor]` 语义标记，引导 Agent 建立清晰上下文认知；
- **状态无损同步与回填**：
  - 在 `inPageFillIndex` 中为 `contenteditable` 输入域注入 `document.execCommand('insertText')` 与原生 `InputEvent` 派发双通道，确保 React / Virtual DOM 内部状态实时响应，彻底根治发帖按钮假灰死锁；
  - 交互工具支持 `preferComposer: true` 偏好，并在候选模糊时主动输出 `disambiguationWarning`。

---

### 2. 🛡️ 透明遮罩穿透与自愈点击 (Mask Piercing)
- **全屏透明层穿透解算**：
  - 升级 `inPageCheckInterception` 与 `elementsFromPoint`：自动识别纯透明（`opacity: 0` / `rgba(0,0,0,0)`）或仅作过渡动画呈现的假遮罩层并递归穿透，准确定位底层真实交互目标；
  - 若物理 CDP 事件被未脱离的透明层阻断，自动降级为页内原生合成事件精准触发。

---

### 3. ⚡ 深度动态容器滚动与精准流静默 (Smart Scroll & Quiescence)
- **局部多层溢出滚动优先**：
  - `chrome_smart_scroll` 深度重构滚动容器探查，沿 DOM 树向上自动探测带 `overflow-y: auto/scroll` 的实际可滚子容器，优先进行局部容器滚动，杜绝全页无效盲滚；
- **自适应网络静默窗口**：
  - 在 `action-watchdog.ts` 中优化 SPA 动态拉取请求监听，结合 100ms 滑动窗口与 React 水合状态判定，确保数据流拉取完毕后再交付下一轮操作。

---

### 4. 🔄 会话亲和度与严格标签页隔离 (Session Tab Affinity)
- 强化 `SessionTabAffinityManager`，严格保证并行会话下的标签页操作上下文不发生串流，多任务多窗口操作安全隔离。

---

### 📦 包含资产 (Assets)
- **`browserclaw-extension-v2.6.1.zip`**：v2.6.1 纯净版 Chrome 扩展安装包，解压后可直接在 Chrome 开发者模式一键加载；
- **`browserclaw-skill-v2.6.1.zip`**：包含 45 规范工具契约与现代化 SPA 操控范式的最新 Agent Skill 配置包。
