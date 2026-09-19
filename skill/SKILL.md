---
name: browserclaw
description: High-efficiency, zero-hallucination Chrome browser control and automation via BrowserClaw MCP server. Dual-engine architecture (DOM-First 1-based indexing + Visual-Fallback with 1:1 CSS viewport coordinate grid, Set-of-Mark 2.0, and PCIE polymorphic coordinates). Dispatches native CDP events (isTrusted=true) with full support for React/Vue/WebComponents, Shadow DOM, and background tab isolation.
---

# BrowserClaw Browser Control Skill

Use this skill to control Google Chrome via the **BrowserClaw MCP Server**. BrowserClaw operates directly inside the user's active Chrome session, preserving cookies, logins, session state, and extensions.

---

## 1. Dual-Brain Mental Model: Macro Planner vs. Semantic Micro-Loop

BrowserClaw is architected as a **Hierarchical Dual-Brain**:

- **You (the Caller LLM) are the Macro Planner (System 2 / Slow Brain)**:
  - Responsible for strategic goal formulation, multi-page planning, navigation, creative content drafting, and handling escalations.
  - **DO NOT manually micromanage atomic button clicks or step-by-step DOM polling for on-page action goals.**
- **`chrome_act_toward_goal` is the Semantic Micro-Loop (System 1 / Fast Brain / Jev)**:
  - **PRIMARY DEFAULT DRIVER FOR INTERACTION**: Delegate on-page interactive goals (searching, clicking buttons, selecting options, agreeing to modals) directly to `chrome_act_toward_goal`.
  - Executes a local perceive-decide-act micro-loop inside the Native Server at **~200–400ms/step** (powered by TypeSafe Jev System One with automatic heuristic fallback).
  - Completes multi-step on-page goals in 1–2 seconds within a **single MCP turn**, eliminating 80%+ of network RTT and token waste.

---

## 2. Core Operating Principles & Iron Rules

1. **Dual-Brain Delegation First**: For natural language interaction goals, always delegate to `chrome_act_toward_goal` first. Only drop down to manual single-step primitives when Jev escalates or when indices are already known.
2. **DOM-First 1-Based Indexing**: When performing manual atomic actions, always prefer numeric element indices (`[1]`, `[2]`, `[3]`) from `chrome_read_dom` or `chrome_grep`. Never guess brittle CSS selectors or complex XPath.
3. **Native Event Fidelity (`isTrusted: true`)**: Actions dispatched via `chrome_interact_index`, `chrome_fill_index`, `chrome_batch_actions`, and `chrome_act_toward_goal` generate native CDP events (`isTrusted: true`), fully compatible with React 18/19, Vue, Angular, and closed Shadow DOMs.
4. **Background Non-Intrusiveness**: Agent-spawned tabs default to `active: false` and windows to `focused: false`. Never disrupt the human user's active screen or typing focus.
5. **Active Tab Protection**: `chrome_close_tabs` requires `confirm: true` or explicit `tabIds`/`sessionId`. Never close the human user's active foreground tab accidentally.
6. **Zero-RTT Commits (`pressEnter: true`)**: When submitting search bars or login forms with `chrome_fill_index`, pass `pressEnter: true` to commit in the same turn without extra roundtrips.

---

## 3. Execution Hierarchy & Routing Ladder

| Tier       | Engine / Category                                              | Primary Tools                                                                                     | When to Use                                                                                                                                                     |
| :--------- | :------------------------------------------------------------- | :------------------------------------------------------------------------------------------------ | :-------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Tier 1** | **System 1: Semantic Micro-Loop** _(Default 70%+ for Actions)_ | `chrome_act_toward_goal`                                                                          | **PRIMARY CHOICE for on-page goals**: "Search for X", "Click add to cart", "Filter by 4 stars", "Agree to cookies". Runs local Jev micro-loop (200-400ms/step). |
| **Tier 0** | **System 2: Deterministic Primitives** _(20%)_                 | `chrome_get_markdown`<br>`chrome_batch_actions`<br>`chrome_interact_index`<br>`chrome_fill_index` | Content extraction (`get_markdown`), scripted multi-action pipelines (`batch_actions`), or when exact indices are already known.                                |
| **Tier 2** | **In-Page Scripting & API Bypass** _(5%)_                      | `chrome_javascript`<br>`chrome_network_request`                                                   | Custom rich-text editors, complex Shadow DOM, or direct authenticated JSON API data retrieval.                                                                  |
| **Tier 3** | **Visual Fallback (PCIE)** _(3%)_                              | `chrome_screenshot`<br>`chrome_computer`                                                          | Pure HTML5 Canvas, WebGL games, unlabeled SVG icons, or anti-bot layout obfuscation without DOM nodes.                                                          |
| **Tier 4** | **Human Handoff** _(1%)_                                       | `chrome_request_human_intervention`                                                               | Anti-bot challenges (Geetest, Cloudflare Turnstile, reCAPTCHA), SMS 2FA, or payment authorizations.                                                             |
| **Tier 5** | **Raw CDP Escape Hatch** _(<0.1%)_                             | `chrome_cdp_execute`                                                                              | Deep low-level browser primitives (e.g. cookie manipulation, PDF printing, emulations). Requires 2 consecutive high-level failures.                             |

---

## 4. Standard Dual-Brain Interaction Workflow

```
┌─────────────────────────────────────────────────────────────┐
│  Caller LLM (System 2 / Macro Planner / You)                │
│  Navigate -> Formulate on-page sub-goal -> Evaluate result  │
└──────────────────────────────┬──────────────────────────────┘
                               │ Delegate goal: chrome_act_toward_goal
                               ▼
┌─────────────────────────────────────────────────────────────┐
│  Local Native Server (System 1 / Micro-Loop / Jev)          │
│  Perceive compact DOM -> Decide via Jev -> CDP action       │
│  Fast 200~400ms/step in-process closed loop                 │
└──────────────────────────────┬──────────────────────────────┘
                               │
               ┌───────────────┴───────────────┐
               ▼                               ▼
       status === "done"              status === "escalate"
       Goal achieved! Move to         Jev safely yields with DOM.
       next macro step.               System 2 intervenes via Tier 0.
```

### Step 1: Navigate & Orient

- Navigate to the destination: `chrome_navigate { url: "https://example.com" }`.
- For text/reading tasks: Call `chrome_get_markdown` for clean, layout-free structured text.
- For interactive tasks: Proceed directly to Step 2.

### Step 2: Delegate Action to System 1 Micro-Loop (`chrome_act_toward_goal`)

- Issue a clear natural-language sub-goal on the active page:
  ```json
  {
    "goal": "Type 'wireless mouse' into the search input and press enter",
    "tabId": 101,
    "maxSteps": 10
  }
  ```
- **Handling Outcomes**:
  - `status === "done"`: Goal completed successfully. Continue to your next strategic objective.
  - `status === "escalate"` or `"stuck"`: Jev detected a sensitive action (e.g. checkout, delete), encountered ambiguity, or got stuck. The response includes `currentElements` detailing interactive elements. Proceed to Step 3.

### Step 3: Precision Macro Intervention (Escalation Recovery)

- When Jev escalates or when manual precision is required:
  - Inspect the provided `currentElements` (or call `chrome_read_dom { isolateModal: true }` / `chrome_grep`).
  - Execute the precise single-step action:
    - Click: `chrome_interact_index { index: 4 }`.
    - Input: `chrome_fill_index { index: 2, text: "my-input", pressEnter: true }`.
    - Multi-step pipeline: `chrome_batch_actions { actions: [...] }` _(see [`references/batch-pipeline.md`](./references/batch-pipeline.md))_.

### Step 4: Verify & Recover

- Observe state changes via `urlChanged`, `mutated`, or `includeDelta: true`.
- If an element index is invalidated by a dynamic SPA update (`STALE_ELEMENT_INDEX`), re-read via `chrome_read_dom` and retry once.

---

## 5. Specialized Capabilities & Safety Guards

- **Local File Upload**: `chrome_upload_file { selector: "input[type=file]", filePath: "C:/path/to/doc.pdf" }`.
- **Native Browser Dialogs**: `chrome_handle_dialog { action: "accept", promptText?: "optional" }`.
- **In-Page JavaScript Evaluation**: `chrome_javascript { script: "document.title" }` supports top-level `await`, automatic `return (...)` wrapping, and built-in `mcp.*` helpers (`mcp.run`, `mcp.waitFor`, `mcp.click`, `mcp.fill`).
- **Captchas & 2FA Handoff**: `chrome_request_human_intervention { reason: "Please solve slider verification" }` displays a frosted-glass banner, parks the cursor, and safely resumes upon user completion.
- **Dynamic Tool Activation**: If a tool is hidden under the current profile, invoke `chrome_tool_docs { category: "network", activateForSession: true }` to expose all category tools for the session without restarting.
- **Diagnostics**: Run `chrome_doctor {}` to verify port `12306`, extension connectivity, bridge token, and native host status.

---

## 6. Detailed Reference Guides

For advanced workflows, consult the specialized reference guides:

- **Dual-Brain Semantic Micro-Loop (Jev System One)**: [`references/dual-brain-jev.md`](./references/dual-brain-jev.md)
- **Batch Actions, Assertions & Form Pipelines**: [`references/batch-pipeline.md`](./references/batch-pipeline.md)
- **Visual Fallback, SoM 2.0 & Coordinate Normalization**: [`references/visual-fallback.md`](./references/visual-fallback.md)
- **Troubleshooting & Connection Repair**: [`config/TROUBLESHOOTING.md`](./config/TROUBLESHOOTING.md)
