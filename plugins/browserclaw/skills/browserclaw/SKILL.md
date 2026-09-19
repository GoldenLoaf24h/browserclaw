---
name: browserclaw
description: High-efficiency, zero-hallucination Chrome browser control and automation via BrowserClaw MCP server. Hierarchical Dual-Brain architecture (Macro Planner System 2 + Fast Semantic Micro-Loop System 1 Jev) with dual-engine perception (DOM-First 1-based indexing + Visual-Fallback PCIE). Dispatches native CDP events (isTrusted=true) with full support for React/Vue/Angular, Shadow DOM, and background tab isolation.
---

# BrowserClaw Browser Control Skill

Control Google Chrome via the **BrowserClaw MCP Server**. BrowserClaw runs directly within the user's active Chrome session, preserving cookies, logins, profile state, and extensions.

---

## 1. Activation Triggers & Tool Selection Matrix

Activate this skill when the user asks to browse, interact with websites, search Google/Amazon, read web pages, submit forms, scrape dynamic content, automate web workflows, or operate on Chrome.

| User Intent / Trigger Scenario            | Primary Tool / Pipeline                        | Strategy & Key Arguments                                                                                    |
| :---------------------------------------- | :--------------------------------------------- | :---------------------------------------------------------------------------------------------------------- |
| **Navigate to URL or open page**          | `chrome_navigate`                              | `{ url: "...", background: true }` opens in background without stealing focus.                              |
| **Read page content / documentation**     | `chrome_get_markdown`                          | Extract clean, structured text stripped of layout blobs (`fit: true` for main body).                        |
| **Quick text / element search**           | `chrome_grep`                                  | Search without full DOM dump: `{ query: "...", searchType: "interactive_only" }`.                           |
| **On-page interactive goals** _(Default)_ | `chrome_act_toward_goal`                       | **System 1 default**: `{ goal: "...", maxSteps: 10 }` (local 200–400ms micro-loop).                         |
| **Single input submission (Zero-RTT)**    | `chrome_fill_index`                            | `{ index: 2, text: "developer@example.com", clear: true, pressEnter: true }` in 1 turn.                     |
| **Deterministic atomic click / hover**    | `chrome_interact_index`                        | `{ index: 1, action: "click" }` dispatches native CDP event (`isTrusted: true`).                            |
| **Multi-step sequence / assertions**      | `chrome_batch_actions`                         | Pipeline fills, clicks, waits, and assertions in 1 turn (_see `references/batch-pipeline.md`_).             |
| **Autonomous multi-step wizard / form**   | `chrome_form_pipeline`                         | Advance surveys, onboarding, or multi-field forms (_see `references/batch-pipeline.md`_).                   |
| **Dynamic script / authenticated API**    | `chrome_javascript` / `chrome_network_request` | Evaluate JS (`{ code: "..." }`) with `mcp.*` helpers; fetch JSON bypassing UI.                              |
| **Canvas / WebGL / visual icons**         | `chrome_screenshot` + `chrome_computer`        | High-DPI 1:1 grid (`{ grid: true, format: "webp" }`) + PCIE clicks (_see `references/visual-fallback.md`_). |
| **CAPTCHA / 2FA / Payment Handoff**       | `chrome_request_human_intervention`            | Mount frosted-glass banner, park cursor, safely yield to human user.                                        |
| **Tab / Window discovery & hygiene**      | `get_windows_and_tabs` / `chrome_close_tabs`   | Inspect active tabs; close background tabs (`confirm: true` protects active tab).                           |

---

## 2. Hierarchical Dual-Brain Mental Model

BrowserClaw divides responsibilities between two complementary reasoning layers:

```
┌─────────────────────────────────────────────────────────────────────────┐
│  Caller LLM: Macro Planner (System 2 / Slow Brain)                      │
│  Strategic multi-page planning, URL routing, content generation,        │
│  and supervisory escalation recovery.                                   │
└────────────────────────────────────┬────────────────────────────────────┘
                                     │ chrome_act_toward_goal { goal: "..." }
                                     ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  Local Native Server: Semantic Micro-Loop (System 1 / Fast Brain / Jev) │
│  In-process perceive-decide-act loop at 200–400ms/step.                 │
│  TypeSafe Jev + heuristic fallback. Slashes 80%+ remote RTT & tokens.   │
└────────────────────────────────────┬────────────────────────────────────┘
                                     │
                     ┌───────────────┴───────────────┐
                     ▼                               ▼
             status === "done"              status === "escalate"
             Goal achieved in 1 turn!       Safely yields with elements.
             Proceed to next macro step.    System 2 acts via Tier 0.
```

- **You (Caller LLM / System 2)**: Focus on macro goals and multi-page strategy. **Do not micromanage atomic clicks or poll DOM step-by-step.**
- **`chrome_act_toward_goal` (System 1 / Jev)**: Handles fast, deterministic on-page interaction loops locally.

---

## 3. Execution Hierarchy & 6-Tier Routing Ladder

|    Tier    | Layer                               | Primary Tools                                                                                     |  Usage %  | Operational Purpose                                                                                                  |
| :--------: | :---------------------------------- | :------------------------------------------------------------------------------------------------ | :-------: | :------------------------------------------------------------------------------------------------------------------- |
| **Tier 1** | **Semantic Micro-Loop** _(Default)_ | `chrome_act_toward_goal`                                                                          |  **70%**  | **Primary choice for on-page action goals**: "Search for X", "Add to cart", "Filter by 4 stars", "Agree to cookies". |
| **Tier 0** | **Deterministic Primitives**        | `chrome_get_markdown`<br>`chrome_batch_actions`<br>`chrome_interact_index`<br>`chrome_fill_index` |  **20%**  | Clean text reading (`get_markdown`), pipelined actions (`batch_actions`), or when target indices are already known.  |
| **Tier 2** | **In-Page Scripting & API**         | `chrome_javascript`<br>`chrome_network_request`                                                   |  **5%**   | Custom rich-text editors, Shadow DOM piercing, or direct authenticated API data fetching.                            |
| **Tier 3** | **Visual Fallback (PCIE)**          | `chrome_screenshot`<br>`chrome_computer`                                                          |  **3%**   | HTML5 Canvas, WebGL, unlabeled SVG icons, or anti-bot DOM-obfuscated layouts.                                        |
| **Tier 4** | **Human Handoff**                   | `chrome_request_human_intervention`                                                               |  **1%**   | Anti-bot challenges (Cloudflare, Geetest, reCAPTCHA), SMS 2FA, or payment approvals.                                 |
| **Tier 5** | **Raw CDP Escape Hatch**            | `chrome_cdp_execute`                                                                              | **<0.1%** | Low-level browser primitives (cookie manipulation, emulations) after 2 consecutive failures.                         |

---

## 4. Standard Dual-Brain Execution Loop

### Step 1: Navigate & Orient (Macro System 2)

- Open or switch tab: `chrome_navigate { url: "https://example.com" }`.
- For reading tasks: invoke `chrome_get_markdown { fit: true }`.
- For interactive tasks: formulate a concise sub-goal and proceed directly to Step 2.

### Step 2: Delegate Sub-Goal to System 1 (`chrome_act_toward_goal`)

- Dispatch on-page goal to the local micro-loop:
  ```json
  {
    "goal": "Type 'wireless keyboard' into search bar and submit",
    "tabId": 101,
    "maxSteps": 10
  }
  ```
- **Inspect Returned Status**:
  - `status === "done"`: Sub-goal achieved. Continue to next macro step.
  - `status === "escalate"`: Jev detected sensitive keywords (pay, delete, buy, submit), ambiguity, or low confidence. The response carries `currentElements` containing indexed candidates. Proceed to Step 3.
  - `status === "stuck"`: 3 consecutive steps without DOM or URL change. Proceed to Step 3.
  - `status === "blocked"`: Captcha or bot-wall detected. Call Tier 4 `chrome_request_human_intervention`.

### Step 3: Precision Macro Intervention (Escalation Recovery)

- Read candidates directly from `currentElements` in the escalation payload (no extra DOM read required!).
- If additional context is needed, run `chrome_read_dom { isolateModal: true }` or `chrome_grep`.
- Execute targeted atomic action:
  - Click: `chrome_interact_index { index: 1, action: "click" }`.
  - Input: `chrome_fill_index { index: 2, text: "developer@example.com", clear: true, pressEnter: true }`.
  - Multi-action: `chrome_batch_actions { actions: [{ type: "fill", index: 2, text: "a@b.com", clear: true, pressEnter: true }, { type: "click", index: 4 }, { type: "wait", durationMs: 300 }], waitForSettle: true }` _(see `references/batch-pipeline.md`)_.

### Step 4: Verify & Recover

- Observe state changes via `mutated`, `urlChanged`, or piggybacked `delta`.
- **Stale Index Recovery**: If an action returns `STALE_ELEMENT_INDEX` due to SPA re-rendering, call `chrome_read_dom` or `chrome_grep` to obtain fresh indices and retry once.

---

## 5. Primary Tool Contracts & Delta Piggybacking

### `chrome_act_toward_goal`

- **Input**: `{ goal: string, tabId?: number, maxSteps?: number, timeoutMs?: number, confidenceThreshold?: number, textHint?: string }`
- **Output**: `{ status: "done"|"escalate"|"stuck"|"blocked", engine: "jev"|"heuristic", steps: [...], finalPage: { url, title }, currentElements: string[], jevUsage: { calls, inputTokens, estCostUsd } }`

### `chrome_read_dom`

- **Input**: `{ selector?: string, isolateModal?: boolean, viewportOnly?: boolean, limit?: number }`
- **Output**: `{ treeString: string, totalIndexed: number, tabUrl: string, tabTitle: string }`
- Prunes off-screen and occluded elements into a compact 1-based index hierarchy (`[1]`, `[2]`, `[3]`).

### `chrome_interact_index`

- **Input**: `{ index: number, action?: "click"|"hover"|"double_click"|"right_click"|"drag", includeDelta?: boolean, waitForSettle?: boolean, waitForNetworkQuiescence?: boolean }`
- **Output**: `{ success: boolean, mutated: boolean, urlChanged: boolean, delta?: { added: string[], removed: string[] } }`

### `chrome_fill_index`

- **Input**: `{ index: number, text: string, clear?: boolean, pressEnter?: boolean, includeDelta?: boolean }`
- **Output**: `{ success: boolean, valueCommitted: string, mutated: boolean, delta?: object }`

### `chrome_batch_actions`

- **Input**: `{ actions: Array<{ type: "click"|"double_click"|"right_click"|"fill"|"hover"|"scroll"|"press_key"|"key"|"wait"|"fill_form"|"assert"|"extract", ... }>, includeDelta?: boolean, captureNetwork?: { urlPattern: string, method?: string, timeoutMs?: number }, waitForSettle?: boolean }`
- Eliminates multi-turn network round-trips by executing atomic sequences and assertions locally (_see `references/batch-pipeline.md`_).

### `chrome_grep`

- **Input**: `{ query: string, isRegex?: boolean, searchType?: "interactive_only"|"all_dom"|"page_text", limit?: number }`
- High-speed locator returning indices without dumping full DOM tree.

### Delta Piggybacking (`includeDelta: true`)

- Pass `includeDelta: true` on `chrome_interact_index`, `chrome_fill_index`, and `chrome_batch_actions`.
- Returns DOM mutations (`added`, `removed`, `modified`) directly inside the action response.
- **Rule**: Eliminates the need for a separate `chrome_read_dom` call after every action.

---

## 6. Hard Operational Constraints & Guardrails

1. **1-Based Numeric Index Integrity**: Always target elements using 1-based integer indices (`[1]`, `[2]`, `[3]`) from `chrome_read_dom`, `chrome_grep`, or `currentElements`. Never guess brittle CSS selectors or 0-based indices.
2. **Strict Parameter Invariants**:
   - Always use numeric `index` for target elements.
   - Always use `grid: true` for visual calibration overlays.
   - Always use `action: "accept"` for browser dialogs.
   - In `chrome_upload_file`, use `index` or `clickTargetIndex`.
   - In `chrome_javascript`, use `code` (not `script`).
3. **Background Tab Non-Intrusiveness**: Agent-spawned tabs run in the background by default (`background: true`, opening tabs with `active: false` and windows with `focused: false`). Never pass `background: false` unless the user explicitly requests foreground display.
4. **Native Event Fidelity (`isTrusted: true`)**: All clicks, keystrokes, and form inputs dispatch native CDP events (`isTrusted: true`), natively triggering React 18/19 synthetic events, Vue reactivity, Angular change detection, and Shadow DOM handlers.
5. **Active Tab Closure Protection**: `chrome_close_tabs` requires explicit `confirm: true` or specific `tabIds`/`sessionId`. Never close the human user's active foreground working tab blindly.
6. **Zero-RTT Commits (`pressEnter: true`)**: Always pass `pressEnter: true` on `chrome_fill_index` when submitting search boxes or single-input forms to execute and submit in a single turn.

---

## 7. Specialized Capabilities & Diagnostics

- **Local File Upload**: `chrome_upload_file { index: 5, filePath: "D:/data/document.pdf" }` (or `{ clickTargetIndex: 5, filePath: "D:/data/document.pdf" }` for custom upload triggers).
- **Native Browser Dialogs**: `chrome_handle_dialog { action: "accept", promptText: "confirmation_code" }`.
- **In-Page JavaScript Evaluation**: `chrome_javascript { code: "document.title" }` supports top-level `await`, automatic `return (...)` wrapping, and injected `mcp.*` utilities (`mcp.run`, `mcp.waitFor`, `mcp.click`, `mcp.fill`).
- **CAPTCHA & 2FA Takeover**: `chrome_request_human_intervention { reason: "Please solve slider verification" }` displays a frosted-glass banner, parks the cursor, and safely resumes upon user completion.
- **Dynamic Tool Activation**: If a tool is hidden under the active profile (`core` or `crawl`), call `chrome_tool_docs { category: "network", activateForSession: true }` to unlock all category tools for the session without restarting.
- **System Diagnostics**: Run `chrome_doctor {}` to verify port `12306`, extension connectivity, bridge token, and native host status.

---

## 8. Progressive Disclosure References

For deep implementation specifications and advanced workflows, consult:

- **Dual-Brain Semantic Micro-Loop (Jev System 1)**: [`references/dual-brain-jev.md`](./references/dual-brain-jev.md) — Scoring contracts, heuristic fallback, escalation guards, and macro supervisor recovery.
- **Batch Actions, Assertions & Form Pipelines**: [`references/batch-pipeline.md`](./references/batch-pipeline.md) — Atomic interaction pipelines, mid-flight assertions, inline network capture, and autonomous wizard filling.
- **Visual Fallback, SoM 2.0 & Multimodal Coordinates**: [`references/visual-fallback.md`](./references/visual-fallback.md) — DPR 1:1 viewport normalization, Set-of-Mark 2.0, GoFullPage captures, and PCIE polymorphic coordinates.
- **Troubleshooting & Connection Repair**: [`config/TROUBLESHOOTING.md`](./config/TROUBLESHOOTING.md) — Port conflicts, token authorization, and native host recovery.
