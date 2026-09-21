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
| Open / go back / forward | `chrome_navigate` | `{ url }`, `{ action: "back"|"forward" }`, `background: true` to avoid focus theft, `dismissOverlays: true` to clear popups on load |
| Read article / documentation | `chrome_get_markdown` | Clean text, cheaper than DOM dump; `fit: true` for main body |
| Find a button / text | `chrome_grep` | No DOM dump needed; returned indices feed `chrome_interact_index` |
| Perceive page structure | `chrome_read_dom` | `fast: true` (or `format: "fast"`) for a quick viewport snapshot; `flattenCards: true` for feeds, `virtualizeViewport: true` for long lists |
| Single input (search box) | `chrome_fill_index` | `{ index, text, clear: true, pressEnter: true }` fills and submits in 1 turn; preserves `\n` in rich editors |
| Click / hover one element | `chrome_interact_index` | `{ index, action: "click" }`; `pierceOverlay: true` under translucent masks; `captureNetwork` to grab the triggered API |
| 2+ predictable steps | `chrome_batch_actions` | One RTT: fill + click + wait + assert. Default for login/search flows (see `references/batch-pipeline.md`) |
| Multi-step form / wizard | `chrome_form_pipeline` | Local autonomous field matching + advance; stops on captcha or validation errors |
| Vague on-page goal | `chrome_act_toward_goal` | Local decision micro-loop (200-400ms/step); see section 2 |
| Marketing popup / cookie banner | `chrome_dismiss_overlay` | One-step dismissal; do not dump the DOM first |
| Scroll page or inner container | `chrome_smart_scroll` | Detects the scrollable element itself; returns remaining pages |
| Insert image into a composer | `chrome_insert_media` | Real File paste/drop for Draft.js/Lexical/X/Reddit; local files up to 50MB |
| Upload to `<input type=file>` | `chrome_upload_file` | `{ index, filePath }`; for drop zones use `chrome_insert_media` |
| Canvas / WebGL / icon-only UI | `chrome_screenshot` + `chrome_computer` | Coordinate fallback (see `references/visual-fallback.md`) |
| Run JS / call page APIs | `chrome_javascript` / `chrome_network_request` | `{ code }` with `mcp.*` helpers; fetch JSON with page cookies |
| CAPTCHA / 2FA / payment | `chrome_request_human_intervention` | Banner + cursor park, resumes after the human finishes |
| Tabs / windows hygiene | `get_windows_and_tabs`, `chrome_switch_tab`, `chrome_close_tabs` | Check existing tabs first; closing requires `confirm: true` or explicit ids |
| Connectivity problems | `chrome_doctor` | Verifies port 12306, extension link, token, native host |

Tool parameters are delivered by the MCP server as JSON Schema; query them live with `chrome_tool_docs { category }` instead of trusting memory. A fuller per-tool cheat sheet lives in `references/tool-cheatsheet.md`.

---

## 2. On-Page Autonomy: `chrome_act_toward_goal`

The native server runs a local perceive-decide-act micro-loop (System 1: Jev semantic engine with a deterministic heuristic fallback). The calling agent (System 2) keeps macro strategy: multi-page planning, content generation, escalation recovery.

```json
{ "goal": "Type 'wireless keyboard' into the search bar and submit", "tabId": 101, "maxSteps": 10, "pauseBeforeKeywords": ["Post", "Submit"] }
```

Act on the returned `status`:

- `done` — goal achieved, continue the macro plan.
- `paused` — safety breakpoint matched `pauseBeforeKeywords`; `pausedBeforeAction` + `currentElements` are returned for explicit review and commit.
- `escalate` — low confidence, ambiguity, or sensitive action (pay/delete/submit). `currentElements` carries indexed candidates: act directly with `chrome_interact_index` / `chrome_fill_index` without another DOM read.
- `stuck` — 3 steps without DOM/URL change; take over with atomic tools.
- `blocked` — captcha or bot wall; call `chrome_request_human_intervention`.

Delegate single-page interaction chains (search, filter, add-to-cart, accept cookies). Keep cross-page routing, tab management, payments/deletes, and long-form writing at the macro level. Details: `references/dual-brain-jev.md`.

---

## 3. Hard Rules

1. **1-based indices only.** Target elements by the `[n]` index from `chrome_read_dom`, `chrome_grep`, or `currentElements` — never guessed CSS selectors.
2. **Indices expire.** After scroll, navigation, or DOM mutation, re-perceive before acting. On `STALE_ELEMENT_INDEX`, re-read and retry once.
3. **Batch predictable sequences.** Two or more known steps go into `chrome_batch_actions`, not separate turns.
4. **Dialogs block everything.** A native alert/confirm/prompt freezes the tab; calls time out until you call `chrome_handle_dialog { action: "accept"|"dismiss", promptText? }`. Never auto-accept blindly — confirm dialogs can be destructive.
5. **Background by default.** Open tabs with `background: true`; never steal foreground focus unless the user asked.
6. **Don't close the user's tab.** `chrome_close_tabs` requires `confirm: true` or explicit `tabIds`/`sessionId`.
7. **Submit in one turn.** `pressEnter: true` on `chrome_fill_index` for search boxes and single-field forms.
8. **Verify via piggybacked deltas.** Pass `includeDelta: true` on interact/fill/batch to get DOM mutations in the same response instead of a follow-up `chrome_read_dom`.
9. **Dynamic unlock.** If a tool is outside the active profile, call `chrome_tool_docs { category, activateForSession: true }`; calling an unlocked tool also auto-unlocks its category.
10. **Parameter invariants.** `index` is numeric; screenshots use `grid: true` for coordinate calibration; `chrome_javascript` takes `code`; uploads take `index` or `clickTargetIndex`.

---

## 4. Recovery Patterns

- **Interaction fails under an overlay** → `chrome_dismiss_overlay`, or `pierceOverlay: true` on the click.
- **Repeated RTT-heavy steps** → consolidate into `chrome_batch_actions` with `waitForSettle: true`.
- **Form fields keep mismatching** → switch to `chrome_form_pipeline` (semantic matching + auto-advance built in).
- **Anti-bot challenge / 2FA / payment approval** → `chrome_request_human_intervention { reason }` and wait.
- **Everything else fails twice** → `chrome_cdp_execute` as the low-level escape hatch; then `chrome_doctor` if connectivity is suspect.

---

## 5. References (Read on Demand)

- `references/tool-cheatsheet.md` — per-tool parameters and gotchas for all 49 tools.
- `references/dual-brain-jev.md` — micro-loop internals, escalation thresholds, heuristic fallback.
- `references/batch-pipeline.md` — batch action types, assertions, inline network capture, form pipelines.
- `references/visual-fallback.md` — screenshot grid calibration and `chrome_computer` coordinates.
- `config/TROUBLESHOOTING.md` — port conflicts, token auth, native host repair.

