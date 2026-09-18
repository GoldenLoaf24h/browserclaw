# BrowserClaw v2.7.0 - True Input Commitment, Frustum Anti-Ghosting, Perceptive Delta & Form Pipeline

### Highlights (核心摘要)
BrowserClaw v2.7.0 是一次**攻克单页应用深度交互死锁（如 Draft.js/Lexical 富文本、Typeform 15 步动态问卷）的系统级重大里程碑发布**。全面解决了富文本状态假成功、水平跨屏幽灵节点干扰、无效全页 DOM 轮询以及多步表单通信往返时延四大真实痛点，新增第 46 个高可靠规范工具 `chrome_form_pipeline`：

1. **真·输入交付与跨平台深度清空 (True Input Commitment & Deep Reset)**：
   - 彻底解决富文本编辑器“工具返回 success: true 但页面实际未提交”与清空失败导致的文本拼接；
   - 验证 React / Draft.js / Lexical 等框架的响应式状态，对无效输入自动回退为逐字 CDP 原生按键流（`cdp_key_by_key`）并核实有效交付；
2. **多屏活动视口视锥裁剪 (Frustum Clipping & Anti-Ghosting)**：
   - 引入 `activeViewportOnly: true` 水平边界过滤，彻底剔除屏幕外未滑入视图的幽灵问卷项；
   - 文本定位算法注入 `+1000` 活动视口绝对加权，根除匹配到前一屏同名按钮（如 "OK"、"Next"）导致的死循环；
3. **感知差量引擎 (Perceptive Delta Engine)**：
   - 交互操作前后自动比对标题、题目变更、步骤进度（如 `3 of 15`）与当前激活项，直接随响应回传 `perceptiveDelta`，消除 80% 的模型无效全页 DOM 探测；
4. **多步表单流水线 (`chrome_form_pipeline` - 第 46 个规范工具)**：
   - 允许一次性下发整套问卷/表单答案，由扩展后台本地微循环驱动原生 CDP 事件快速流转，自带卡顿熔断与验证保护，将 20 步交互压缩至单次往返。

---

### 📦 包含资产 (Assets)
- **`browserclaw-extension-v2.7.0.zip`**：v2.7.0 纯净版 Chrome 扩展安装包，解压后直接在 Chrome 开发者模式一键加载；
- **`browserclaw-skill-v2.7.0.zip`**：包含 46 规范工具契约、最新 `chrome_form_pipeline` 规范与实操配方的 Agent Skill 资产包。
