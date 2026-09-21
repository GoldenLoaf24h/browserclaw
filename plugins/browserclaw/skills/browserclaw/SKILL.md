---
name: browserclaw
description: Control the user's real Chrome browser (tabs, pages, forms, downloads, screenshots) via the BrowserClaw MCP server. Use for browsing websites, reading web content, filling and submitting forms, automating web workflows, or extracting dynamic page data in the user's existing Chrome session. Not for non-browser tasks or API-only work that needs no page.
---

# BrowserClaw Browser Control Skill

BrowserClaw operates inside the user's active Chrome session: cookies, logins, profile state and extensions are preserved, and every click/keystroke is a native CDP event (`isTrusted: true`), so React/Vue/Angular and Shadow DOM handlers fire normally.

**One-off actions need no skill routing: call the tool directly.** Read this file only for multi-step automation, when a call fails, or when a page resists standard interaction.

---

## 1. Choose the Tool by Intent

| Intent | Tool | Notes |
| :------------------------------- | :------------------------------ | :---------------------------------------------------------- |
| Open / go back / forward | `browserclaw_navigate` | `{ url }`, `{ action: "back"|"forward" }`, `background: true` to avoid focus theft, `dismissOverlays: true` to clear popups on load |
| Read article / documentation | `browserclaw_get_markdown` | Clean text, cheaper than DOM dump; `fit: true` for main body |
| Find a button / text | `browserclaw_grep` | No DOM dump needed; returned indices feed `browserclaw_interact_index` |
| Perceive page structure | `browserclaw_read_dom` | `fast: true` (or `format: "fast"`) for a quick viewport snapshot; `flattenCards: true` for feeds, `virtualizeViewport: true` for long lists |
| Single input (search box) | `browserclaw_fill_index` | `{ index, text, clear: true, pressEnter: true }` fills and submits in 1 turn; preserves `\n` in rich editors |
| Click / hover one element | `browserclaw_interact_index` | `{ index, action: "click" }`; `pierceOverlay: true` under translucent masks; `captureNetwork` to grab the triggered API |
| 2+ predictable steps | `browserclaw_batch_actions` | One RTT: fill + click + wait + assert. Default for login/search flows (see `references/batch-pipeline.md`) |
| Multi-step form / wizard | `browserclaw_form_pipeline` | Local autonomous field matching + advance; stops on captcha or validation errors |
| Vague on-page goal | `browserclaw_act_toward_goal` | Local decision micro-loop (200-400ms/step); see section 2 |
| Marketing popup / cookie banner | `browserclaw_dismiss_overlay` | One-step dismissal; do not dump the DOM first |
| Scroll page or inner container | `browserclaw_smart_scroll` | Detects the scrollable element itself; returns remaining pages |
| Insert image into a composer | `browserclaw_insert_media` | Real File paste/drop for Draft.js/Lexical/X/Reddit; local files up to 50MB |
| Upload to `<input type=file>` | `browserclaw_upload_file` | `{ index, filePath }`; for drop zones use `browserclaw_insert_media` |
| Canvas / WebGL / icon-only UI | `browserclaw_screenshot` + `browserclaw_computer` | Coordinate fallback (see `references/visual-fallback.md`) |
| Run JS / call page APIs | `browserclaw_javascript` / `browserclaw_network_request` | `{ code }` with `mcp.*` helpers; fetch JSON with page cookies |
| CAPTCHA / 2FA / payment | `browserclaw_request_human_intervention` | Banner + cursor park, resumes after the human finishes |
| Tabs / windows hygiene | `browserclaw_get_windows_and_tabs`, `browserclaw_switch_tab`, `browserclaw_close_tabs` | Check existing tabs first; closing requires `confirm: true` or explicit ids |
| Connectivity problems | `browserclaw_doctor` | Verifies port 12306, extension link, token, native host |

Tool parameters are delivered by the MCP server as JSON Schema; query them live with `browserclaw_tool_docs { category }` instead of trusting memory. A fuller per-tool cheat sheet lives in `references/tool-cheatsheet.md`.

---

## 2. On-Page Autonomy: `browserclaw_act_toward_goal`

The native server runs a local perceive-decide-act micro-loop (System 1: Jev semantic engine with a deterministic heuristic fallback). The calling agent (System 2) keeps macro strategy: multi-page planning, content generation, escalation recovery.

```json
{ "goal": "Type 'wireless keyboard' into the search bar and submit", "tabId": 101, "maxSteps": 10, "pauseBeforeKeywords": ["Post", "Submit"] }
```

Act on the returned `status`:

- `done` — goal achieved, continue the macro plan.
- `paused` — safety breakpoint matched `pauseBeforeKeywords`; `pausedBeforeAction` + `currentElements` are returned for explicit review and commit.
- `escalate` — low confidence, ambiguity, or sensitive action (pay/delete/submit). `currentElements` carries indexed candidates: act directly with `browserclaw_interact_index` / `browserclaw_fill_index` without another DOM read.
- `stuck` — 3 steps without DOM/URL change; take over with atomic tools.
- `blocked` — captcha or bot wall; call `browserclaw_request_human_intervention`.

Delegate single-page interaction chains (search, filter, add-to-cart, accept cookies). Keep cross-page routing, tab management, payments/deletes, and long-form writing at the macro level. Details: `references/dual-brain-jev.md`.

---

## 3. Hard Rules

1. **1-based indices only.** Target elements by the `[n]` index from `browserclaw_read_dom`, `browserclaw_grep`, or `currentElements` — never guessed CSS selectors.
2. **Indices expire.** After scroll, navigation, or DOM mutation, re-perceive before acting. On `STALE_ELEMENT_INDEX`, re-read and retry once.
3. **Batch predictable sequences.** Two or more known steps go into `browserclaw_batch_actions`, not separate turns.
4. **Dialogs block everything.** A native alert/confirm/prompt freezes the tab; calls time out until you call `browserclaw_handle_dialog { action: "accept"|"dismiss", promptText? }`. Never auto-accept blindly — confirm dialogs can be destructive.
5. **Background by default.** Open tabs with `background: true`; never steal foreground focus unless the user asked.
6. **Don't close the user's tab.** `browserclaw_close_tabs` requires `confirm: true` or explicit `tabIds`/`sessionId`.
7. **Submit in one turn.** `pressEnter: true` on `browserclaw_fill_index` for search boxes and single-field forms.
8. **Verify via piggybacked deltas.** Pass `includeDelta: true` on interact/fill/batch to get DOM mutations in the same response instead of a follow-up `browserclaw_read_dom`.
9. **Dynamic unlock.** If a tool is outside the active profile, call `browserclaw_tool_docs { category, activateForSession: true }`; calling an unlocked tool also auto-unlocks its category.
10. **Parameter invariants.** `index` is numeric; screenshots use `grid: true` for coordinate calibration; `browserclaw_javascript` takes `code`; uploads take `index` or `clickTargetIndex`.

---

## 4. Recovery Patterns

- **Interaction fails under an overlay** → `browserclaw_dismiss_overlay`, or `pierceOverlay: true` on the click.
- **Repeated RTT-heavy steps** → consolidate into `browserclaw_batch_actions` with `waitForSettle: true`.
- **Form fields keep mismatching** → switch to `browserclaw_form_pipeline` (semantic matching + auto-advance built in).
- **Anti-bot challenge / 2FA / payment approval** → `browserclaw_request_human_intervention { reason }` and wait.
- **Everything else fails twice** → `browserclaw_cdp_execute` as the low-level escape hatch; then `browserclaw_doctor` if connectivity is suspect.

---

## 5. References (Read on Demand)

- `references/tool-cheatsheet.md` — per-tool parameters and gotchas for all 49 tools.
- `references/dual-brain-jev.md` — micro-loop internals, escalation thresholds, heuristic fallback.
- `references/batch-pipeline.md` — batch action types, assertions, inline network capture, form pipelines.
- `references/visual-fallback.md` — screenshot grid calibration and `browserclaw_computer` coordinates.
- `config/TROUBLESHOOTING.md` — port conflicts, token auth, native host repair.

