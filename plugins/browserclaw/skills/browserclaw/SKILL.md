---
name: browserclaw
description: High-efficiency, zero-hallucination Chrome browser control and automation via BrowserClaw MCP server. Hierarchical Dual-Brain architecture (Macro Planner System 2 + Fast Semantic Micro-Loop System 1 Jev) with dual-engine perception (DOM-First 1-based indexing + Visual-Fallback PCIE). Dispatches native CDP events (isTrusted=true) with full support for React/Vue/Angular, Shadow DOM, and background tab isolation.
---

# BrowserClaw Browser Control Skill

Operates directly inside user's active Chrome session via native CDP (`isTrusted: true`), preserving cookies, logins, and extensions. React/Vue/Angular and deep Shadow DOM supported.

> **Tool Prefix**: Canonical tool names use `browserclaw_*` (46), `performance_*` (3), and `browserclaw_get_windows_and_tabs`. In Stdio mode, call canonical names directly; `browserclaw_*` is an HTTP/SSE convenience alias.

---

## 1. Execution Hierarchy & 6-Tier Routing Ladder

Dual-Brain architecture: Agent acts as **System 2 (Macro Planner)** for multi-page orchestration; local server acts as **System 1 (`browserclaw_act_toward_goal`)** executing on-page perceive-decide-act loops at 200–400ms/step.

|    Tier    | Layer                             | Primary Tools                                                                                                      |  Usage %  | Operational Purpose                                                                                                                                       |
| :--------: | :-------------------------------- | :----------------------------------------------------------------------------------------------------------------- | :-------: | :-------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Tier 1** | **Semantic Micro-Loop (DEFAULT)** | `browserclaw_act_toward_goal`                                                                                      |  **70%**  | **Primary for on-page action goals**: searches, filters, clicks, form navigation. Delegates multi-action chains in 1 turn.                                |
| **Tier 0** | **Deterministic Primitives**      | `browserclaw_get_markdown` / `browserclaw_batch_actions` / `browserclaw_interact_index` / `browserclaw_fill_index` |  **20%**  | Text extraction (`get_markdown`), fixed multi-step pipelines (`batch_actions`), or takeover when `browserclaw_act_toward_goal` escalates with candidates. |
| **Tier 2** | **In-Page Scripting & API**       | `browserclaw_javascript` / `browserclaw_network_request`                                                           |  **5%**   | Complex rich-text composers, Shadow DOM inspection, or authenticated in-page fetches.                                                                     |
| **Tier 3** | **Visual Fallback (PCIE)**        | `browserclaw_screenshot` / `browserclaw_computer`                                                                  |  **3%**   | Canvas games, WebGL, unlabeled icon buttons, or anti-bot DOM-obfuscated layouts.                                                                          |
| **Tier 4** | **Human Handoff**                 | `browserclaw_request_human_intervention`                                                                           |  **1%**   | CAPTCHA, Cloudflare Turnstile, 2FA, or payment confirmation.                                                                                              |
| **Tier 5** | **Raw CDP Escape Hatch**          | `browserclaw_cdp_execute`                                                                                          | **<0.1%** | Direct CDP protocol commands when high-level tools are blocked.                                                                                           |

---

## 2. Tool Selection by Intent

| Intent                             | Tool                                                                                     | Strategy & Key Arguments                                                                                                                                                         |
| :--------------------------------- | :--------------------------------------------------------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **On-page action goals (DEFAULT)** | `browserclaw_act_toward_goal`                                                            | **Primary for interactive on-page chains**: `{ goal: "Search for laptop and filter by brand Lenovo", maxSteps: 10 }`. Local execution in 200–400ms/step.                         |
| Open / back / forward              | `browserclaw_navigate`                                                                   | `{ url }` (`"back"` / `"forward"` for history), `background: true` (default, prevents focus theft), `autoGroup: true` (default).                                                 |
| Read article / docs                | `browserclaw_get_markdown`                                                               | Clean structured text, 80%+ cheaper than full DOM; `fit: true` targets main article body.                                                                                        |
| Find button / text                 | `browserclaw_grep`                                                                       | Element lookup without full DOM dump; `autoScroll: true` probes virtual feeds. Returned index feeds `browserclaw_interact_index`.                                                |
| Scroll until element found         | `browserclaw_scroll_until_found`                                                         | `{ query, maxSteps: 10, stepPx: 800 }`. Client-side RAF scroll, settles virtual DOM, centers element, returns live index.                                                        |
| Perceive page structure            | `browserclaw_read_dom`                                                                   | Auto-isolates active modals; `format: "compact"` (default) slashes tokens; `activeViewportOnly: true` prunes offscreen nodes; `flattenCards: true` exposes card action triggers. |
| Single input / search              | `browserclaw_fill_index`                                                                 | `{ index, text, clear: true, pressEnter: true }` fills and submits in 1 turn. Preserves linebreaks in rich editors.                                                              |
| Click / hover element              | `browserclaw_interact_index`                                                             | `{ index, action: "click" }`. `pierceOverlay: true` (default) clicks beneath translucent masks. Pass `captureNetwork` to capture triggered API response.                         |
| 2+ predictable steps               | `browserclaw_batch_actions`                                                              | Atomic pipeline (fill + click + wait + assert) in 1 RTT. Default for login and search workflows.                                                                                 |
| Multi-step form / wizard           | `browserclaw_form_pipeline`                                                              | Autonomous field matching and progression; halts on CAPTCHA or validation errors.                                                                                                |
| Marketing popup / banner           | `browserclaw_dismiss_overlay`                                                            | 1-step dismissal for coupon popups, consent banners, and overlays. Avoids manual DOM parsing.                                                                                    |
| Scroll page / container            | `browserclaw_smart_scroll`                                                               | Auto-detects scrollable container; reports remaining scroll distance.                                                                                                            |
| Insert image / media               | `browserclaw_insert_media`                                                               | Direct File paste/drop for rich-text editors (Draft.js/Lexical/X/Reddit); local files up to 50MB.                                                                                |
| Upload to `<input type=file>`      | `browserclaw_upload_file`                                                                | `{ index, filePath }`. For dynamic drop zones, use `browserclaw_insert_media` or `clickTargetIndex`.                                                                             |
| Canvas / WebGL / icon UI           | `browserclaw_screenshot` + `browserclaw_computer`                                        | Visual fallback (PCIE). Requires screenshot calibration with `grid: true`.                                                                                                       |
| Run JS / fetch with cookies        | `browserclaw_javascript` / `browserclaw_network_request`                                 | Page context execution with `mcp.*` helpers; authenticated in-page HTTP fetch bypassing CORS.                                                                                    |
| CAPTCHA / 2FA / payment            | `browserclaw_request_human_intervention`                                                 | Banner and cursor park; automatically resumes when human finishes.                                                                                                               |
| Tab & window hygiene               | `browserclaw_get_windows_and_tabs` / `browserclaw_switch_tab` / `browserclaw_close_tabs` | Query existing tabs before opening duplicates. Closing requires `confirm: true` or explicit `tabIds`.                                                                            |
| Diagnostic self-check              | `browserclaw_doctor`                                                                     | Validates port 12306, extension link, token auth, and native host status.                                                                                                        |

---

## 3. On-Page Autonomy: `browserclaw_act_toward_goal`

Execute interactive on-page tasks in a single turn:

```json
{
  "goal": "Type 'wireless keyboard' into the search bar and submit",
  "tabId": 101,
  "maxSteps": 10,
  "pauseBeforeKeywords": ["Post", "Pay", "Submit"]
}
```

### Engine Execution & Fallback

- **With API Key (`TYPESAFE_API_KEY` or `JEV_API_KEY`)**: Uses TypeSafe Jev semantic scoring at 200–400ms/step.
- **Without API Key**: Automatically degrades to local deterministic **Heuristic Rule Engine**. When ambiguous, halts safely and returns indexed candidate elements for direct execution via `browserclaw_interact_index` or `browserclaw_fill_index` without re-reading the DOM.

### Status Handling

- `done`: Goal achieved; continue macro workflow.
- `paused`: Triggered by `pauseBeforeKeywords`; inspect `pausedBeforeAction` and commit explicitly.
- `escalate`: Ambiguous target or sensitive boundary. **Target candidates already indexed in `currentElements`; pick target `[n]` and call `browserclaw_interact_index` or `browserclaw_fill_index` directly. Do NOT re-invoke `browserclaw_read_dom`**.
- `stuck`: 3 steps without DOM/URL mutation; switch to atomic primitives.
- `blocked`: Bot challenge detected; invoke `browserclaw_request_human_intervention`.
- `max_steps` / `timeout`: Step quota reached; inspect `currentElements` and proceed.

---

## 4. Operational Invariants

1. **Semantic Micro-Loop First**: For interactive workflows, call `browserclaw_act_toward_goal` first. Avoid manual `browserclaw_read_dom` → `browserclaw_interact_index` turn loops.
2. **Numeric 1-Based Indices**: Target elements strictly by `[n]` index from `browserclaw_read_dom`, `browserclaw_grep`, or `currentElements`. Do not guess CSS selectors. For rich-text editors (Reddit, X), target `[composer]` directly with `browserclaw_fill_index`.
3. **Zero-RTT Escalation Takeover**: When `browserclaw_act_toward_goal` escalates or pauses, consume attached `currentElements` immediately. Do not waste a turn on `browserclaw_read_dom`.
4. **Dialog Isolation**: Native `alert`/`confirm`/`prompt` freezes page execution; resolve via `browserclaw_handle_dialog { action: "accept"|"dismiss" }` in an isolated call. Never auto-accept blindly.
5. **Background Tab Discipline**: Open tabs with `background: true` to avoid stealing user OS focus.
6. **Destructive Close Guard**: `browserclaw_close_tabs` requires `confirm: true` or explicit `tabIds` / `sessionId` to protect user tabs.
7. **Single-Turn Submission**: Use `pressEnter: true` on `browserclaw_fill_index` for search boxes and single-field forms.
8. **Piggybacked Deltas**: Pass `includeDelta: true` on interact/fill/batch calls to receive DOM mutations in the same response, eliminating follow-up `browserclaw_read_dom` calls.
9. **Dynamic Profile Unlock**: If a required tool is hidden under active profile, unlock on-demand via `browserclaw_tool_docs { category, activateForSession: true }`.
10. **Parameter Constraints**: `index` must be numeric; screenshots use `grid: true` for coordinate alignment; `browserclaw_javascript` requires `code`; file uploads require `index` or `clickTargetIndex`.

---

## 5. Failure Recovery Protocols

- **Virtualized Feeds / Infinite Scroll**: Invoke `browserclaw_scroll_until_found { query, maxSteps: 10 }` or `browserclaw_grep { query, autoScroll: true }` instead of manual multi-turn scrolling.
- **Modal Occlusion**: `browserclaw_read_dom` auto-isolates modals. If collapsed unexpectedly, pass `isolateModal: false` or specify `selector`.
- **Overlay Interference**: Dispatch `browserclaw_dismiss_overlay`, or pass `pierceOverlay: true` on `browserclaw_interact_index`.
- **High-RTT Form Chains**: Consolidate into `browserclaw_batch_actions` with `waitForSettle: true`.
- **Complex Multi-Step Forms**: Switch to `browserclaw_form_pipeline` with semantic matching.
- **Anti-Bot / 2FA / CAPTCHA**: Dispatch `browserclaw_request_human_intervention { reason }` and wait.
- **Persistent Failures**: Dispatch `browserclaw_cdp_execute` as low-level escape hatch; run `browserclaw_doctor` if bridge connectivity is broken.

---

## 6. References (Consult On Demand)

- `references/dual-brain-jev.md` — Micro-loop architecture, heuristic fallback, destructive guard, and takeover protocols.
- `references/tool-cheatsheet.md` — Complete contracts and parameter tables for all 50 registered tools.
- `references/batch-pipeline.md` — Multi-action batch grammar, assertions, network capture, and form pipelines.
- `references/visual-fallback.md` — Screenshot grid calibration, DPR scaling, and `browserclaw_computer` coordinates.
- `config/TROUBLESHOOTING.md` — Port conflicts, token auth, and native host repair.
