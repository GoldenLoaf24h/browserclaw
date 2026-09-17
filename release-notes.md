# BrowserClaw v2.6.0 - In-Page Agent Engine, Scoped DOM Pruning & Sub-Pixel Visual Grounding

### Highlights (核心摘要)
BrowserClaw v2.6.0 是一次**全面突破浏览器自动化性能瓶颈与视觉坐标对齐精度的重大里程碑版本**。本版本针对多步业务交互的通信往返时延（Multi-turn RTT）、大规模现代 Web 的 DOM 爆炸、以及高分屏（High-DPI）视觉定位漂移三大核心痛点，落地了三套工业级引擎：
1. **页内闭环执行器 (`mcp.run` / In-Page Agent Helpers)**：支持在单次 Tool Call 中通过页内链式脚本完成连续多步业务交互，消除 80% 的模型轮询时延；
2. **定向作用域裁剪与抗爆炸 Delta 机制**：支持 `selector` 局部范围感知与 `exclude` 噪音节点动态剪枝，彻底解决全页 DOM 爆炸导致的上下文超限；
3. **亚像素视觉定位与坐标零漂移引擎**：自适应物理像素与 CSS 视口映射，引入智能磁吸对齐（`autoSnap`）与高分屏防锯齿坐标网格，根治视觉坐标错位。

---

### 1. 🚀 页内闭环执行器与丰富定位原语 (`mcp.run` / `MCP_INPAGE_HELPERS`)
- **单步业务闭环**：在 `chrome_javascript` 中注入 `mcp.run(async (ctx) => ...)`，复杂连贯业务（如加购、表单批量填充、多级确认）可一次性在页内完成，无需往返调用大模型；
- **原生增强选择器支持**：
  - 扩展 `:has-text("...")` 原生伪类（兼容正则表达式与复合选择器，如 `tr:has-text("Order #101") button.del-btn`）；
  - 提供 `mcp.query` / `mcp.queryAll`、`mcp.findByText`、`mcp.click`、`mcp.fill`（穿透 React/Vue 原生 Setter 触发双向绑定）、`mcp.check`、`mcp.press`、`mcp.waitFor` 等高语义页内 API。

---

### 2. ⚡ DOM 定向检索与智能抗爆炸增量 (`includeDelta` & Scoped Indexing)
- **局部范围索引 (`selector`) 与噪音修剪 (`exclude`)**：
  - `chrome_read_dom` 新增可选参数 `selector`（仅索引目标容器及其子树）与 `exclude`（剔除页眉、页脚、广告与推荐位），单次 Token 开销直降 70%~90%；
- **抗爆炸增量更新**：
  - 自动识别并过滤实时时钟、动态倒计时与轮播推荐等高频微噪节点；
  - 增量结果超过 25 项时自动熔断并生成汇总摘要，杜绝大型电商/信息流页面的上下文膨胀。

---

### 3. 🎯 亚像素视觉对齐与零漂移标尺 (Visual Grounding & Auto-Snap)
- **物理与 CSS 视口严格对齐**：
  - 彻底解决 Windows / macOS 高分屏（DPR > 1）截屏尺寸与视口坐标换算偏差，根治高分屏模糊与物理点击偏移；
- **智能磁吸对齐 (`autoSnap`)**：
  - 在 `chrome_computer` 视觉坐标点击中，若点击落在元素边缘或 24px 范围内的空白区，自动磁吸至最近的可交互元素中心；
- **多模态坐标输入兼容**：
  - `region` / `crop` 统一支持 `{ x0, y0, x1, y1 }`、`[ymin, xmin, ymax, xmax]` 与 `{ x, y, width, height }` 多种模型常见格式。

---

### 📦 包含资产 (Assets)
- **`browserclaw-extension-v2.6.0.zip`**：v2.6.0 纯净版 Chrome 扩展安装包，解压后可直接在 Chrome 开发者模式一键加载；
- **`browserclaw-skill-v2.6.0.zip`**：包含 45 规范工具契约、页内闭环执行心智与 `recipes/` 框架的最新 Agent Skill 配置包。
