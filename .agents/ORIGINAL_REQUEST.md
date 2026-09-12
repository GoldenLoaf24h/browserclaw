# Original User Request

## 2026-09-05T12:52:46Z

升级开发 mcp-chrome 项目，打造现代化、高效率的本地 Chrome 浏览器控制 MCP 服务及配套扩展。项目需融合 browser-use 的高效率 DOM 索引与批量操作机制，并彻底修复社区反映的核心稳定性与并发通信缺陷。

Working directory: D:\workspace\mcp-chrome-master\mcp-chrome-master
Integrity mode: development

References:

- Reference repository: D:\workspace\mcp-chrome-master\browser-use-main\browser-use-main
- GitHub issues: https://github.com/hangwin/mcp-chrome/issues
- GitHub pull requests: https://github.com/hangwin/mcp-chrome/pulls

## Requirements

### R1. 通信架构与底层服务稳定性加固

- 彻底解决 MCP HTTP/SSE 协议多客户端与多会话连接冲突问题，确保多个独立 Agent 会话（如 Claude Code、Hermes）可同时稳定连接并调用工具，避免单例模式导致的连接互杀。
- 根除 HTTP 传输层响应竞争导致的 ERR_HTTP_HEADERS_SENT 异常，保证初始化和工具调用的健壮性。
- 解决 stdio 传输模式下的孤儿与僵尸进程残留问题，父进程（客户端）终止时子进程必须及时自动清理退出。
- 修复 Chrome 扩展端连接握手状态异常（常态化黄灯与服务未启动假死），提供健全的超时重试与自愈检测。
- 依据 MCP 最新规范，为全部可用工具补全安全提示注解（readOnlyHint, destructiveHint, idempotentHint 等）。
- 修复本地文件上传支持（针对 input[type="file"] 元素）以及对 file:// 协议导航的处理。

### R2. 融合 browser-use 的高能效 Agent 浏览器交互引擎

- 提供基于数字索引（Index-Based）的极简元素操作方式：解析页面并为可见交互元素分配紧凑索引标签，使 Agent 可直接通过索引序号进行点击与输入，消除长选择器与脆弱 XPath 的定位误差。
- 实现高效 DOM 剪枝、视口可见性检测与层级遮挡过滤机制，去除冗余和隐藏节点，将发送给大模型的交互结构 Token 开销压缩至原始页面的 10% 以内。
- 引入批量动作（Batch Action）执行流水线，允许 Agent 在单次工具交互中按序编排复合操作（如定位、聚焦、输入、按键等），成倍减少往返网络与决策延迟。
- 增强页面快照与视觉标记能力，支持提取干净结构化 Markdown 及可选的可视化元素边界标注。

### R3. 项目构建、规范与向后兼容

- 保证整个 Monorepo（Chrome 扩展端、Native Bridge、共享类型库）在 Windows 及标准 Node.js LTS 环境下顺利完成编译、打包与类型检查。
- 保持对既有基础工具（如截图、标签管理、常规脚本注入）的向后兼容，确保平滑升级。

## Acceptance Criteria

### 通信与稳定性准则

- [ ] 启动 HTTP MCP 服务后，模拟并发客户端执行 initialize 与 tools/list 请求，所有请求均返回 200/成功响应，无单例连接异常或 ERR_HTTP_HEADERS_SENT 崩溃。
- [ ] 在 stdio 模式下，模拟客户端关闭 stdin，对应的 Node.js 进程在 1 秒内正常退出，无后台残留进程。
- [ ] Chrome 扩展与 Native Messaging 通信在启动及重连测试中能在 3 秒内恢复并正确显示绿色已就绪状态。
- [ ] 导出的所有 MCP 工具均具备符合规范的注解元数据（annotations）。

### 交互效率与功能准则

- [ ] 提供基于索引直接点击与填充的专属 MCP 工具，在包含动态元素与表单的页面测试中能够依据指定序号准确触发 DOM 事件。
- [ ] 针对包含超过 1000 个 DOM 节点的复杂网页进行快照提取测试，输出的交互元素树相比原始 HTML 缩减超过 85% 以上，且不丢失任何可见交互按钮或输入框。
- [ ] 批量动作工具支持接收动作数组并按序执行，任一子动作失败时能返回明确的中断原因与执行进度。
- [ ] 文件上传工具能成功向页面的 input[type="file"] 注入本地文件路径并触发 change 事件。

### 工程自动化准则

- [ ] 运行 `pnpm build` 与 `pnpm typecheck` 均无报错退出（Exit Code 0）。
- [ ] 新增或修改的稳定性与交互逻辑拥有自动化单元/集成测试脚本，并能通过 `pnpm test` 全部通过。
