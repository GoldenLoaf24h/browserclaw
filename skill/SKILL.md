---
name: browserclaw
description: High-efficiency, zero-hallucination Chrome browser control and automation via BrowserClaw MCP server. Dual-engine architecture (DOM-First 1-based indexing + Visual-Fallback with 1:1 CSS viewport coordinate grid, Set-of-Mark 2.0, and PCIE polymorphic coordinates). Dispatches native CDP events (isTrusted=true) with full support for React/Vue/WebComponents, Shadow DOM, and background tab isolation.
---

# BrowserClaw Browser Control Skill

Use this skill to control Google Chrome via **BrowserClaw MCP Server**. BrowserClaw runs directly inside the user's active Chrome session, preserving cookies, logins, session state, and extensions.

---

## 1. Core Operating Principles & Iron Rules

1. **DOM-First 1-Based Indexing**: Always prefer numeric element indices (`[1]`, `[2]`, `[3]`) from `chrome_read_dom` or `chrome_grep`. Never guess brittle CSS selectors or complex XPath.
2. **Native Event Fidelity (`isTrusted: true`)**: Actions dispatched via `chrome_interact_index`, `chrome_fill_index`, `chrome_batch_actions`, and `chrome_computer` generate native CDP events (`isTrusted: true`), fully compatible with React 18/19, Vue, Angular, and closed Shadow DOMs.
3. **Background Non-Intrusiveness**: Agent-spawned tabs default to `active: false` and windows to `focused: false`. Never disrupt the human user's active screen or typing focus.
4. **Active Tab Protection**: `chrome_close_tabs` requires `confirm: true` or explicit `tabIds`/`sessionId`. Never close the human user's active foreground tab accidentally.
5. **Zero-RTT Commits (`pressEnter: true`)**: When submitting search bars or login forms with `chrome_fill_index`, pass `pressEnter: true` to trigger form submission in the same turn without extra roundtrips.

---

## 2. Execution Hierarchy & Routing Ladder

Always select the lowest-tier (most deterministic and lowest-latency) tool capable of completing the action:

| Tier       | Engine / Category                            | Primary Tools                                                                                      | When to Use                                                                                                                                   |
| :--------- | :------------------------------------------- | :------------------------------------------------------------------------------------------------- | :-------------------------------------------------------------------------------------------------------------------------------------------- |
| **Tier 0** | **Deterministic Primitives** _(Default 85%)_ | `chrome_interact_index`<br>`chrome_fill_index`<br>`chrome_batch_actions`<br>`chrome_form_pipeline` | Target element indices or workflows are known. Maximum speed, zero model hallucination, trusted events.                                       |
| **Tier 1** | **Semantic Micro-Loop** _(10%)_              | `chrome_act_toward_goal`                                                                           | Bounded natural language goals on the current page where targets require semantic grounding. Runs local Jev/Heuristic loop (~200-400ms/step). |
| **Tier 2** | **In-Page Scripting & API Bypass** _(3%)_    | `chrome_javascript`<br>`chrome_network_request`                                                    | Custom rich-text editors, complex Shadow DOM, or direct authenticated JSON API data retrieval.                                                |
| **Tier 3** | **Visual Fallback (PCIE)** _(1%)_            | `chrome_screenshot`<br>`chrome_computer`                                                           | Pure HTML5 Canvas, WebGL games, unlabeled SVG icons, or anti-bot layout obfuscation without DOM nodes.                                        |
| **Tier 4** | **Human Handoff** _(<1%)_                    | `chrome_request_human_intervention`                                                                | Anti-bot challenges (Geetest, Cloudflare Turnstile, reCAPTCHA), SMS 2FA, or payment authorizations.                                           |
| **Tier 5** | **Raw CDP Escape Hatch** _(<0.1%)_           | `chrome_cdp_execute`                                                                               | Deep low-level browser primitives (e.g. cookie manipulation, PDF printing, emulations). Requires 2 consecutive high-level failures.           |

---

## 3. Standard 4-Phase Interaction Loop

### Phase 1: Perceive

- **Inspect Interactive Elements**: Call `chrome_read_dom` to extract visible interactive elements tagged with numeric indices `[1]`, `[2]`:
  - `scope` (or `selector`): Focus on a specific container (e.g. `scope: "#cart-items"`).
  - `exclude`: Strip noise subtrees (e.g. `exclude: "#footer, .ad-banner, #recommendations"`).
  - `isolateModal: true`: Restricts indexing to active modal dialogs while preserving top-layer dropdowns and toasts.
  - `viewportOnly: true`: Restricts extraction strictly to elements in or near the current viewport.
  - `includeDetails: true`: Pass only when exact bounding rects or occlusion checks are required.
- **Fast Keyword Search**: Use `chrome_grep { query: "Checkout", searchType: "interactive_only" }` for large pages (>5,000 tokens) to find element indices directly without full DOM dumping.
- **Reading Articles & Content**: Use `chrome_get_markdown` for reading clean structured page text stripped of layout noise.

### Phase 2: Act

- **Click / Tap**: `chrome_interact_index { index: 5, action: "click" }` (supports `double_click`, `right_click`, `hover`, `focus`).
- **Form Input**: `chrome_fill_index { index: 3, text: "my-query", pressEnter: true }`.
- **Intelligent Scrolling**: `chrome_smart_scroll { direction: "down" }` (returns `canScrollDown`, `canScrollUp`, and `scrollProgress`).
- **Atomic Multi-Step Pipeline**: Use `chrome_batch_actions` to chain fills, clicks, assertions, and data extractions in a single roundtrip _(see [`references/batch-pipeline.md`](./references/batch-pipeline.md))_.
- **Autonomous Micro-Goal**: Use `chrome_act_toward_goal { goal: "Search for laptops and filter by 4+ stars" }` _(see [`references/dual-brain-jev.md`](./references/dual-brain-jev.md))_.

### Phase 3: Verify & Observe

- **Self-Driven Delta Piggybacking**: Pass `includeDelta: true` in `chrome_interact_index`, `chrome_fill_index`, or `chrome_batch_actions`.
- The response returns `urlChanged`, `mutated`, and a compact `delta` (`added`, `modified`, `removed`). If `delta.unchanged === true`, the action completed without altering the DOM tree, saving a full inspection turn.

### Phase 4: Stale Index Recovery

- If an interaction returns `STALE_ELEMENT_INDEX` or target element not found due to dynamic SPA re-rendering:
  1. Re-read the page via `chrome_read_dom` (or `chrome_grep`).
  2. Map the target to its updated index.
  3. Re-dispatch the action.

---

## 4. Specialized Capabilities & Safety Guards

- **Local File Upload**: `chrome_upload_file { selector: "input[type=file]", filePath: "C:/path/to/doc.pdf" }`.
- **Native Browser Dialogs**: `chrome_handle_dialog { action: "accept", promptText?: "optional" }`.
- **In-Page JavaScript Evaluation**: `chrome_javascript { script: "document.title" }` supports top-level `await` and automatic single-expression `return (...)` wrapping. Rich `mcp.*` helpers (`mcp.run`, `mcp.waitFor`, `mcp.click`, `mcp.fill`, `mcp.sleep`) are injected into the page execution context.
- **Captchas & 2FA Handoff**: `chrome_request_human_intervention { reason: "Please solve slider verification" }` displays a frosted-glass overlay, pauses execution, and safely resumes upon user completion.
- **Dynamic Tool Activation**: If a tool is hidden under the current profile, invoke `chrome_tool_docs { category: "network", activateForSession: true }` to dynamically expose all tools in that category for the active session without restarting.
- **Diagnostics**: Run `chrome_doctor {}` to verify port `12306`, extension connection, bridge token, and native host status.

---

## 5. Detailed Reference Guides

For advanced workflows, consult the specialized reference guides:

- **Visual Fallback, SoM 2.0 & Coordinate Normalization**: [`references/visual-fallback.md`](./references/visual-fallback.md)
- **Batch Actions, Assertions & Form Pipelines**: [`references/batch-pipeline.md`](./references/batch-pipeline.md)
- **Dual-Brain Semantic Micro-Loop (Jev System One)**: [`references/dual-brain-jev.md`](./references/dual-brain-jev.md)
- **Troubleshooting & Connection Repair**: [`config/TROUBLESHOOTING.md`](./config/TROUBLESHOOTING.md)
