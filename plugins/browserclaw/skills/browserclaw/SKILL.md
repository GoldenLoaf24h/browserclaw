---
name: browserclaw
description: High-efficiency, zero-hallucination Chrome browser control and automation via BrowserClaw MCP server. Hierarchical Dual-Brain architecture (Macro Planner System 2 + Fast Semantic Micro-Loop System 1 Jev) with dual-engine perception (DOM-First 1-based indexing + Visual-Fallback PCIE). Dispatches native CDP events (isTrusted=true) with full support for React/Vue/Angular, Shadow DOM, and background tab isolation.
---

# BrowserClaw Browser Control Skill

BrowserClaw operates inside the user's active Chrome session: cookies, logins, profile state and extensions are preserved, and every click/keystroke is a native CDP event (`isTrusted: true`), so React/Vue/Angular and Shadow DOM handlers fire normally.

> **Tool name prefix (read first).** The MCP server exposes tools as `browserclaw_*` (46 tools) plus `performance_*` (3) and `browserclaw_get_windows_and_tabs`. `browserclaw_*` is a convenience alias accepted in HTTP/SSE mode only; in Stdio mode call the `browserclaw_*` names directly. This file uses canonical `browserclaw_*` names throughout.

---

## 1. Execution Hierarchy & 6-Tier Routing Ladder

BrowserClaw uses a **Dual-Brain architecture**: You (the calling Agent) are **System 2 (Macro Planner)** responsible for multi-page strategy, reasoning, and content generation. The local Native Server runs **System 1 (`browserclaw_act_toward_goal`)** executing local on-page perceive-decide-act loops at 200–400ms/step.

|    Tier    | Layer                             | Primary Tools                                                                                                         |  Usage %  | Operational Purpose                                                                                                                                                                                      |
| :--------: | :-------------------------------- | :-------------------------------------------------------------------------------------------------------------------- | :-------: | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Tier 1** | **Semantic Micro-Loop (DEFAULT)** | `browserclaw_act_toward_goal`                                                                                         |  **70%**  | **Primary choice for on-page action goals**: "Search for X", "Add to cart", "Filter by 4 stars", "Agree to cookies", "Fill out shipping form". Delegates continuous on-page clicks and inputs in 1 turn! |
| **Tier 0** | **Deterministic Primitives**      | `browserclaw_get_markdown`<br>`browserclaw_batch_actions`<br>`browserclaw_interact_index`<br>`browserclaw_fill_index` |  **20%**  | Clean text reading (`get_markdown`), known multi-step pipelines (`batch_actions`), or supervisor takeover when `browserclaw_act_toward_goal` escalates with candidates.                                  |
| **Tier 2** | **In-Page Scripting & API**       | `browserclaw_javascript`<br>`browserclaw_network_request`                                                             |  **5%**   | Complex rich-text editors, Shadow DOM inspection, or calling authenticated internal APIs.                                                                                                                |
| **Tier 3** | **Visual Fallback (PCIE)**        | `browserclaw_screenshot`<br>`browserclaw_computer`                                                                    |  **3%**   | Canvas games, WebGL, unlabeled SVG icons, or anti-bot DOM-obfuscated layouts.                                                                                                                            |
| **Tier 4** | **Human Handoff**                 | `browserclaw_request_human_intervention`                                                                              |  **1%**   | CAPTCHA / Cloudflare Turnstile / 2FA / payment approval.                                                                                                                                                 |
| **Tier 5** | **Raw CDP Escape Hatch**          | `browserclaw_cdp_execute`                                                                                             | **<0.1%** | Raw CDP domain commands when high-level tools are blocked.                                                                                                                                               |

---

## 2. Choose the Tool by Intent

| Intent                             | Tool                                                                                   | Strategy & Key Arguments                                                                                                                                                                          |
| :--------------------------------- | :------------------------------------------------------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **On-page action goals (DEFAULT)** | `browserclaw_act_toward_goal`                                                          | **Always try first for on-page interaction chains**: `{ goal: "Search for laptop and filter by brand Lenovo", maxSteps: 10 }`. Runs locally in 200-400ms/step!                                    |
| Open / go back / forward           | `browserclaw_navigate`                                                                 | `{ url }` (pass `"back"` or `"forward"` for history), `background: true` (default, avoids focus theft), `autoGroup: true` (default)                                                               |
| Read article / documentation       | `browserclaw_get_markdown`                                                             | Clean text, 80%+ cheaper than DOM dump; `fit: true` for main body                                                                                                                                 |
| Find a button / text               | `browserclaw_grep`                                                                     | No DOM dump needed; set `autoScroll: true` for virtual lists; returned indices feed `browserclaw_interact_index`                                                                                  |
| Scroll until target found          | `browserclaw_scroll_until_found`                                                       | `{ query, maxSteps: 10, stepPx: 800 }`; client-side RAF scroll, settles virtual DOM, centers element, returns live index                                                                          |
| Perceive page structure            | `browserclaw_read_dom`                                                                 | Auto-isolates active modals; `format: "compact"` (default) slashes 60%+ tokens; `activeViewportOnly: true` eliminates offscreen ghost nodes; `flattenCards: true` preserves inner action triggers |
| Single input (search box)          | `browserclaw_fill_index`                                                               | `{ index, text, clear: true, pressEnter: true }` fills and submits in 1 turn; preserves `\n` in rich editors                                                                                      |
| Click / hover one element          | `browserclaw_interact_index`                                                           | `{ index, action: "click" }`; `pierceOverlay: true` (default) under translucent masks; `captureNetwork` to grab triggered API                                                                     |
| 2+ predictable steps               | `browserclaw_batch_actions`                                                            | One RTT: fill + click + wait + assert. Default for login/search flows (see `references/batch-pipeline.md`)                                                                                        |
| Multi-step form / wizard           | `browserclaw_form_pipeline`                                                            | Local autonomous field matching + advance; stops on captcha or validation errors                                                                                                                  |
| Marketing popup / cookie banner    | `browserclaw_dismiss_overlay`                                                          | One-step dismissal; do not dump the DOM first                                                                                                                                                     |
| Scroll page or inner container     | `browserclaw_smart_scroll`                                                             | Detects the scrollable element itself; returns remaining pages                                                                                                                                    |
| Insert image into a composer       | `browserclaw_insert_media`                                                             | Real File paste/drop for Draft.js/Lexical/X/Reddit; local files up to 50MB                                                                                                                        |
| Upload to `<input type=file>`      | `browserclaw_upload_file`                                                              | `{ index, filePath }`; for drop zones use `browserclaw_insert_media`                                                                                                                              |
| Canvas / WebGL / icon-only UI      | `browserclaw_screenshot` + `browserclaw_computer`                                      | Coordinate fallback (see `references/visual-fallback.md`)                                                                                                                                         |
| Run JS / call page APIs            | `browserclaw_javascript` / `browserclaw_network_request`                               | `{ code }` with `mcp.*` helpers; fetch JSON with page cookies                                                                                                                                     |
| CAPTCHA / 2FA / payment            | `browserclaw_request_human_intervention`                                               | Banner + cursor park, resumes after the human finishes                                                                                                                                            |
| Tabs / windows hygiene             | `browserclaw_get_windows_and_tabs`, `browserclaw_switch_tab`, `browserclaw_close_tabs` | Check existing tabs first; closing requires `confirm: true` or explicit ids                                                                                                                       |
| Connectivity problems              | `browserclaw_doctor`                                                                   | Verifies port 12306, extension link, token, native host                                                                                                                                           |

---

## 3. On-Page Autonomy: `browserclaw_act_toward_goal`

When given any on-page interactive goal (e.g. search, add to cart, toggle options, click button), call `browserclaw_act_toward_goal` as your primary action:

```json
{
  "goal": "Type 'wireless keyboard' into the search bar and submit",
  "tabId": 101,
  "maxSteps": 10,
  "pauseBeforeKeywords": ["Post", "Pay", "Submit"]
}
```

### Engine & Graceful Fallback

- **With API Key (`TYPESAFE_API_KEY` or `JEV_API_KEY`)**: Powered by TypeSafe Jev model with semantic probability scoring at 200–400ms/step.
- **Without API Key**: Automatically and gracefully runs in local **Heuristic Rule Engine** mode. If ambiguous, it halts safely and returns indexed candidate elements so you can directly execute with `browserclaw_interact_index` or `browserclaw_fill_index` without re-reading DOM!

### Act on the returned `status`:

- `done` — goal achieved, proceed to next macro step.
- `paused` — safety breakpoint matched `pauseBeforeKeywords`; review `pausedBeforeAction` and commit explicitly.
- `escalate` — ambiguous target or sensitive action. **`currentElements` already contains the indexed elements! Pick the target `[n]` and immediately call `browserclaw_interact_index` or `browserclaw_fill_index` — do NOT call `browserclaw_read_dom` again!**
- `stuck` — 3 steps without DOM/URL change; take over with atomic tools.
- `blocked` — captcha or bot wall; call `browserclaw_request_human_intervention`.
- `max_steps` / `timeout` — budget exhausted; inspect current elements and proceed.

---

## 4. Hard Rules

1. **Micro-loop first for interactions.** For on-page action chains, call `browserclaw_act_toward_goal` first. Do NOT micromanage with slow turn-by-turn `browserclaw_read_dom` → `browserclaw_interact_index` loops.
2. **1-based indices only.** Target elements by the `[n]` index from `browserclaw_read_dom`, `browserclaw_grep`, or `currentElements` — never guessed CSS selectors. For rich-text/contenteditable/Lexical/Draft.js composers (Reddit, X), target the `[composer]` index directly with `browserclaw_fill_index`; native CDP commits text and triggers framework state automatically.
3. **Takeover without re-perceiving.** When `browserclaw_act_toward_goal` escalates or pauses, use the attached `currentElements` directly to invoke `browserclaw_interact_index` or `browserclaw_fill_index`. Do not waste an RTT on `browserclaw_read_dom`.
4. **Dialogs block everything.** A native alert/confirm/prompt freezes the tab; calls time out until you call `browserclaw_handle_dialog { action: "accept"|"dismiss", promptText? }`. Never auto-accept blindly — confirm dialogs can be destructive.
5. **Background by default.** Open tabs with `background: true`; never steal foreground focus unless the user asked.
6. **Don't close the user's tab.** `browserclaw_close_tabs` requires `confirm: true` or explicit `tabIds`/`sessionId`.
7. **Submit in one turn.** `pressEnter: true` on `browserclaw_fill_index` for search boxes and single-field forms.
8. **Verify via piggybacked deltas.** Pass `includeDelta: true` on interact/fill/batch to get DOM mutations in the same response instead of a follow-up `browserclaw_read_dom`.
9. **Dynamic unlock.** If a tool is outside the active profile, call `browserclaw_tool_docs { category, activateForSession: true }`; calling an unlocked tool also auto-unlocks its category.
10. **Parameter invariants.** `index` is numeric; screenshots use `grid: true` for coordinate calibration; `browserclaw_javascript` takes `code`; uploads take `index` or `clickTargetIndex`.

---

## 5. Recovery Patterns

- **Long virtualized list / dynamic feed item missing** → `browserclaw_scroll_until_found { query, maxSteps: 10 }` or `browserclaw_grep { query, autoScroll: true }` instead of manual multi-turn scrolling loops.
- **Modal dialog open with background occlusion** → `browserclaw_read_dom` automatically isolates active modal (Modal Focus Mode) and strips background elements. _False-positive trap_: if `read_dom` collapses to 1-2 elements when a modal is visibly open, pass `isolateModal: false` or specify `selector` to force full visibility.
- **Interaction fails under an overlay** → `browserclaw_dismiss_overlay`, or `pierceOverlay: true` on the click.
- **Repeated RTT-heavy steps** → consolidate into `browserclaw_batch_actions` with `waitForSettle: true`.
- **Form fields keep mismatching** → switch to `browserclaw_form_pipeline` (semantic matching + auto-advance built in).
- **Anti-bot challenge / 2FA / payment approval** → `browserclaw_request_human_intervention { reason }` and wait.
- **Everything else fails twice** → `browserclaw_cdp_execute` as the low-level escape hatch; then `browserclaw_doctor` if connectivity is suspect.

---

## 6. References (Read on Demand)

- `references/dual-brain-jev.md` — micro-loop architecture, heuristic fallback, destructive-keyword guard, and takeover protocols.
- `references/tool-cheatsheet.md` — per-tool parameters and gotchas for all 50 registered tools.
- `references/batch-pipeline.md` — batch action types, assertions, inline network capture, form pipelines.
- `references/visual-fallback.md` — screenshot grid calibration and `browserclaw_computer` coordinates.
- `config/TROUBLESHOOTING.md` — port conflicts, token auth, native host repair.
