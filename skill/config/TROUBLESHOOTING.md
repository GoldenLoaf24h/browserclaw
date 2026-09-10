# BrowserClaw (mcp-chrome) 故障排查与自愈手册 (Troubleshooting Guide)

本文档汇总了 BrowserClaw (mcp-chrome) 在实际接入各大 AI Agent 平台（Claude Desktop, Cursor, Windsurf, Cline, Roo Code, Antigravity）过程中可能遇到的典型问题、深层根因及标准修复方案。

---

## ⚡ 快速自愈：一键诊断与修复

遇到任何连接或操作异常，请优先在项目根目录运行自动化诊断脚本：

```bash
# 仅执行健康检查
node skill/config/doctor.mjs

# 执行诊断并自动修复（创建丢失的 Token、修复注册表、同步构建产物）
node skill/config/doctor.mjs --fix
```

Windows 用户亦可直接双击运行 [`skill/config/repair.bat`](./repair.bat)。

---

## 常见问题与解决方案 (FAQ)

### 1. 客户端报 `Connection Refused: 127.0.0.1:12306`
* **故障现象**：
  Agent 客户端在调用工具或初始化连接时报错：`fetch failed: ECONNREFUSED 127.0.0.1:12306`。
* **根本原因**：
  本地 Fastify Native Bridge 服务尚未启动。BrowserClaw 的架构是**按需自启**的：当 Chrome 浏览器启动且扩展激活时，扩展通过 Native Messaging Host 自动拉起 Native Bridge。
* **解决步骤**：
  1. 打开本地 Chrome 浏览器；
  2. 确认已在 `chrome://extensions/` 中启用 BrowserClaw（或加载了 `D:\workspace\browserclaw`）；
  3. 点击浏览器右上角扩展图标，弹出 200px×80px 极简面板，观察状态指示点是否变为**绿色**；
  4. 若需独立后台运行，可在终端手动启动：
     ```bash
     node app/native-server/dist/index.js
     ```

---

### 2. 扩展图标弹窗显示灰色/黄色（“服务未启动”）
* **故障现象**：
  点击 Chrome 扩展图标，状态点为灰色或黄色，提示无法连接本地服务。
* **排查与修复**：
  1. **检查 Native Messaging Host 注册状态**：
     运行 `node skill/config/doctor.mjs`。如果提示注册表缺失，运行：
     ```bash
     node app/native-server/dist/scripts/register.js
     ```
  2. **检查端口占用**：
     在终端运行：
     ```powershell
     netstat -ano | findstr :12306
     ```
     如果存在孤儿进程占用了 12306 端口，使用任务管理器或 `taskkill /F /PID <pid>` 结束该进程，随后重新打开 Chrome。

---

### 3. MCP 响应报 `401 Unauthorized` 或 Token 验证失败
* **故障现象**：
  MCP 客户端发送请求，收到 HTTP 401 报错：`Unauthorized: Missing or invalid token`。
* **根本原因**：
  为防范本地恶意网页或未经授权的本地进程越权控制浏览器，Native Bridge 默认强制校验 Token。客户端配置中的 Token 与本地 `~/.chrome-mcp/bridge-token` 不一致。
* **解决步骤**：
  1. 查看本地当前正确 Token：
     ```powershell
     # Windows PowerShell
     Get-Content "$HOME\.chrome-mcp\bridge-token"
     ```
  2. 打开客户端配置文件（如 Cursor 的 `mcp.json` 或 Claude Desktop 的 `claude_desktop_config.json`），将请求头中的 `x-mcp-token` 更新为上述实际值：
     ```json
     "headers": {
       "x-mcp-token": "粘贴上方读取到的Token"
     }
     ```

---

### 4. 交互报错 `ACTION REQUIRED: Please call 'chrome_read_dom' to refresh`
* **故障现象**：
  执行 `chrome_interact_index` 或 `chrome_fill_index` 时返回：
  `ACTION REQUIRED: Element reference is stale. Please call 'chrome_read_dom' to refresh the index tree.`
* **根本原因**：
  目标页面发生了 SPA 单页路由跳转、动态加载或局部 DOM 树重渲染，导致上一轮提取的数字索引（`ref`）在当前 DOM 树中已失效。
* **规范解决行为**：
  **严禁盲目重试！**
  Agent 必须立即调用一次 `chrome_read_dom`，获取最新 1-based 索引树，基于新索引继续下发动作。

---

### 5. Windows 高分屏 (125%/150%/200%) 截图点击坐标偏移
* **故障现象**：
  在大模型视觉点击模式下，点击位置偏离目标。
* **底层保障**：
  BrowserClaw 已在 `screenshot.ts` 中实现全链路 **DPR 1:1 几何归一化**（通过 `OffscreenCanvas` 强制重采样为标准 CSS 视口尺寸 $W_{viewport} \times H_{viewport}$）。
* **注意事项**：
  Agent 在计算或下发坐标时，**切勿手动乘以设备像素比（DPR）**！直接使用截图上的物理像素位置下发即可（引擎与视口 CSS 像素 1:1 严格对齐）。

---

### 6. 原生系统弹窗（Alert / Confirm / Prompt）阻塞
* **故障现象**：
  页面弹出原生 `alert()` 或 `confirm()`，导致后续 CDP 指令挂起。
* **自愈机制**：
  BrowserClaw 内置了瞬态 Dialog 中断捕获。当弹窗出现时，动作会立刻返回带有 `requiresDialogAction: true` 的提示：
  ```json
  {
    "requiresDialogAction": true,
    "dialog": {
      "type": "alert",
      "message": "Are you sure?"
    }
  }
  ```
  Agent 只需调用 `chrome_handle_dialog({ accept: true })` 即可平滑解除挂起。

---

## 技术支持与目录对照

| 组件 | 源码路径 | 独立免编译目录 |
| :--- | :--- | :--- |
| **Chrome MV3 扩展** | `app/chrome-extension/` | [`D:\workspace\browserclaw`](file:///D:/workspace/browserclaw) |
| **Native Bridge 服务** | `app/native-server/` | `127.0.0.1:12306` (Token: `~/.chrome-mcp/bridge-token`) |
| **MCP 工具与契约声明** | `packages/shared/src/tools.ts` | 导出供客户端自动内省 |
| **诊断与配置** | `skill/config/` | `doctor.mjs`, `mcp-config.json`, `repair.bat` |
