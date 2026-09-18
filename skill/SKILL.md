---
name: browserclaw
description: High-efficiency, zero-hallucination Chrome browser control and automation via BrowserClaw MCP server. Dual-engine architecture (DOM-First 1-based indexing + Visual-Fallback with 1:1 CSS viewport coordinate grid, Set-of-Mark 2.0, and PCIE polymorphic coordinates). Dispatches native CDP events (isTrusted=true) with full support for React/Vue/WebComponents, Shadow DOM, and background tab isolation.
---

# BrowserClaw Browser Control Skill

Use this skill when interacting with the user's real local Chrome browser through the **BrowserClaw** MCP server. The environment operates directly inside an active Chrome session, preserving existing user logins, session cookies, and extensions.

---

## 1. Canonical Tool Contract & Zero-Redundancy Standards

BrowserClaw strictly enforces **Canonical High-Reliability Tools (45 tools total)**. All legacy, brittle selector-based and redundant tools have been permanently purged:
- **Clicking**: Exclusively use `chrome_interact_index` (1-based index, Shadow DOM pierced, humanized micro-jitter curve). Legacy `click_element` and `burst_interact` are removed.
- **Filling**: Exclusively use `chrome_fill_index` (handles text, passwords, checkboxes, and dates automatically, with optional `pressEnter: true` to trigger immediate submission) or `chrome_batch_actions` (pipelined). Legacy `fill_or_select` and `fill_form` are removed.
- **Scrolling**: Exclusively use `chrome_smart_scroll` (overflow-aware, returns remaining pages). Legacy `scroll` and `scroll_to_text` are removed.
- **Reading Content**: Exclusively use `chrome_get_markdown` for articles/summaries, and `chrome_read_dom` for UI interaction. Legacy `get_web_content` and `get_links` are removed.

---

## 2. Dual-Engine Operating Architecture

BrowserClaw operates on a **Dual-Engine** paradigm designed for 100% determinism and minimal token overhead:

```
                  ┌──────────────────────────────────────────────┐
                  │          AI Agent Decision Engine            │
                  └───────┬──────────────────────────────┬───────┘
                          │                              │
         90% Primary Path │              10% Fallback    │
         (DOM Logical)    ▼                              ▼ (Visual Coordinate)
┌──────────────────────────────────────┐  ┌──────────────────────────────────────┐
│       chrome_read_dom (1-based)      │  │    chrome_screenshot (Grid Overlay)  │
│  - 85%+ Token Pruning Filter         │  │  - 1:1 CSS Viewport Normalization    │
│  - Deterministic Numeric Tags [1..N] │  │  - High-Res 400x400 ROI Expansion    │
│  - Traversal across Shadow DOM & IFrames │- Set-of-Mark 2.0 Micro-Capsules    │
└──────────────────┬───────────────────┘  └──────────────────┬───────────────────┘
                   │                                         │
                   │ Index Reference                         │ PCIE Coordinate
                   ▼                                         ▼
┌────────────────────────────────────────────────────────────────────────────────┐
│                   Unified CDP Dispatch Layer (isTrusted: true)                 │
│         Input.dispatchMouseEvent | Input.dispatchKeyEvent | insertText         │
└────────────────────────────────────────────────────────────────────────────────┘
```

1. **DOM-First Engine (90%+ of tasks)**:
   - High-speed, token-efficient, 1-based compact DOM tree.

- Prunes 85%+ invisible or non-interactive nodes while indexing visible interactive elements as `[1]`, `[2]`, `[3]`.
- **Zero coordinate hallucination**: The agent interacts directly with the numeric `index` (e.g. `index: 12`).

2. **Visual-Fallback Engine (10% of tasks)**:
   - For pure Canvas, WebGL games, unlabeled SVG icons, or anti-bot obfuscated layouts.
   - **DPR 1:1 Viewport Normalization**: All screenshots are resampled using `OffscreenCanvas` to exact CSS viewport dimensions ($W_{img} \equiv W_{viewport}, H_{img} \equiv H_{viewport}$), completely eliminating Windows 125%/150%/200% High-DPI coordinate drift.
   - **Calibrated Coordinate Grid**: Overlays semi-transparent 100px grid rulers directly on the viewport.
   - **Set-of-Mark 2.0**: Viewport frustum culling, 25px collision avoidance, and 9px micro-capsule badges.

Mouse and keyboard input dispatched through the CDP path (`chrome_interact_index`, `chrome_fill_index`, `chrome_batch_actions`, `chrome_computer`) produces **CDP-level native events (`isTrusted: true`)**, guaranteeing full reactivity in React 18/19 controlled components, Vue, Web Components, and closed Shadow DOMs.

**Exception — `chrome_keyboard`**: named keys and chords go through the content-script simulator, which uses `dispatchEvent(new KeyboardEvent(...))` and is therefore **`isTrusted: false`**. Use it for convenience, not when a page checks trust. Multi-character literal text (e.g. `"AGENT-OK"`) is typed via CDP `Input.insertText` instead and _is_ trusted; `Ctrl+C`/`Ctrl+V` route through the real system clipboard.

---

## 3. Standard Agent Interaction Workflow

### Phase 1: Perceive (`chrome_read_dom`)

- **Always call `chrome_read_dom` first** upon navigating to a new URL or when page contents change.
- Inspect the 1-based numeric tags in the response:
  ```markdown
  [1] <button "Sign In">
  [2] <input type="email" placeholder="Email address">
  [3] <input type="password" placeholder="Password">
  [4] <button "Submit" disabled="false">
  ```
- **Default response is the pruned tree + counters** (compact JSON). The bulky `indexedElements`/`indexMap` detail blocks are omitted to keep the payload small; pass `includeDetails: true` only when you need per-element `rect`, `isOccluded`, or `safeClickPoint`.
- **Targeted Container Scoping (`selector` / `scope`) & Exclusion (`exclude`)**: Eliminate dumping whole-page DOM by specifying a container selector (e.g. `scope: "#main-cart"` or `selector: ".dialog-box"`) or pruning noise subtrees (e.g. `exclude: "#footer, #recommendations, .ad-banner"`). `scope` is a convenient direct alias for `selector`.
- **Safe Modal Isolation (`isolateModal: true`)**: When an active modal dialog is detected, restricts indexing strictly to the active modal while protecting Top-Layer containers, real backdrop nodes, Portal dropdown containers (`.ant-select-dropdown`, `[data-radix-popper-content-wrapper]`, `[popover]`, `.MuiMenu-root`, etc.), and Toast/Alert containers (`#toast-root`, `.ant-message`, etc.). Form dropdowns and error messages inside the modal are never pruned.
- **Hardened Delta Diffing (`deltaOnly: true`)**: Repeated reads return minimal changed element diffs. Automatic noise gating suppresses countdown timers, clocks, and dynamic ad feeds, while capping changes at 25 items to prevent context explosion on complex modern web pages.
- **Pagination**: `cursor` + `limit` slice the tree lines, so large pages can be read incrementally without re-shipping the whole tree.
- **Never guess long CSS selectors or brittle XPath**. Always use the numeric `index` from `chrome_read_dom`.

#### Form validation state (read before filling, not after submitting)

`chrome_read_dom` reports validation state on every input / textarea / select, so you can tell whether a field is acceptable without submitting:

- `required="true"` — the field must be filled.
- `valid="true"` / `invalid="true"` — native constraint result.
- `invalidReason` — one of `valueMissing`, `typeMismatch`, `patternMismatch`, `tooShort`, `tooLong`, `rangeUnderflow`, `rangeOverflow`, `stepMismatch`, `badInput`, `customError`.
- `validationMessage` — the browser's own message, when present.
- `pattern`, `min`, `max`, `minlength`, `maxlength`, `step` — the constraints to satisfy.

Framework validators (React Hook Form, Angular, VeeValidate) often only set `aria-invalid` / `aria-required` and never touch the native `validity` object; both paths are reported, so a field marked `aria-invalid="true"` also shows `invalid="true"`.

#### Input Disambiguation: Rich Composer vs Search Box
In modern SPAs (Twitter/X, Notion, Slack, GitHub), compose areas and search boxes can both present as text inputs. BrowserClaw automatically flags:
- `[composer]` — Rich tweet/post compose boxes (`contenteditable="true"`, Draft.js, Lexical, multiline textbox). ALWAYS target this element when posting or replying!
- `[editor]` — Code or rich Markdown editors (ProseMirror, Quill, Monaco, CodeMirror).
- `searchbox` — Top navigation or search queries. If you accidentally attempt to fill a searchbox with multi-line or long post content, `chrome_fill_index` will return an `[Input Disambiguation Notice]` to prompt targeting the composer.

#### Modal Confirmation Trap Warning (`[CONFIRMATION_TRAP]`)
When leaving an unsaved post or composer, SPAs often open a secondary confirmation dialog (e.g. `"Discard draft?"`, `"放弃帖子？"`). BrowserClaw detects this trap, flags `isConfirmationTrap: true`, and injects a high-priority warning banner:
`[Modal Guidance: CRITICAL CONFIRMATION TRAP DETECTED ... You MUST dismiss or confirm this dialog before attempting any other actions]`

### Phase 2: Act (Single vs. Batch Operations)

#### A. Single Action

- **Click / Hover**:
  ```json
  // Call chrome_interact_index
  {
    "index": 1,
    "action": "click" // Options: "click", "double_click", "right_click", "hover"
  }
  ```
- **Input & Fill**:
  ```json
  // Call chrome_fill_index
  {
    "index": 2,
    "text": "developer@example.com",
    "clear": true,
    "pressEnter": false // Set to true to immediately dispatch Enter key after filling (e.g. search boxes)
  }
  ```

#### B. Batch Actions (Strongly Recommended for Forms & Multi-Step Flows)

When filling multiple fields or executing consecutive actions, **always prefer `chrome_batch_actions`** to eliminate multi-turn network roundtrips:

```json
// Call chrome_batch_actions
{
  "actions": [
    { "type": "fill", "index": 2, "text": "developer@example.com", "clear": true },
    { "type": "fill", "index": 3, "text": "SuperSecretPass!", "clear": true, "pressEnter": true },
    { "type": "click", "index": 4 },
    { "type": "wait", "durationMs": 300 }
  ],
  "waitForSettle": true
}
```

#### Assertions & Reactive Settling
`chrome_batch_actions` supports state assertions with async debounce settling (`timeoutMs`, default 300ms) to eliminate race conditions with React/Vue reactive form validation:
- Conditions: `enabled`, `disabled`, `valid`, `invalid`, `checked`, `unchecked`, `matches` (regex), `contains`, `not_contains`, `equals`, `visible`, `not_visible`.
- Elements with `aria-invalid="true"` are automatically evaluated as `invalid="true"`.
- Occlusion Halt: If an element is blocked by a modal backdrop or dialog and cannot be pierced, execution immediately halts with the blocker description.

#### Inline Network Capture (`captureNetwork`)
Both `chrome_interact_index` and `chrome_batch_actions` support capturing HTTP response payloads triggered by interactions in a single roundtrip:
```json
{
  "index": 4,
  "action": "click",
  "captureNetwork": {
    "urlPattern": "*/api/order*",
    "method": "POST",
    "statusCodes": [200, 201],
    "timeoutMs": 5000
  }
}
```
- Decodes and parses JSON/text response bodies safely using `Network.loadingFinished`.
- Memory safety: 2MB total buffer cap, 50KB response body slice limit.
- Telemetry/analytics filtering (`google-analytics`, `sentry`, `doubleclick`) and auto-masking of sensitive credentials (`password`, `token`, `apiKey`).

#### C. Code-Driven Chained Execution (`chrome_javascript` with in-page `mcp.*`)

For complex multi-step logic (conditional branches, loops, or form filling + data extraction), **write a single script with the injected `mcp` helper**. This compresses N roundtrips into 1, slashing latency and tokens:

```json
// Call chrome_javascript
{
  "code": "await mcp.fill(2, 'developer@example.com');\nawait mcp.fill(3, 'SuperSecretPass!');\nawait mcp.click(4);\nawait mcp.sleep(400);\nreturn await mcp.extract(5, 'text');"
}
```

Injected `mcp` API:

- `await mcp.run(async (mcp) => { ... })`: Single-turn in-page agent closure orchestrating multi-step actions and returning structured results.
- `await mcp.click(indexOrSelector, { waitFor?, double? })`: Dispatch clean mouse sequence to numeric index or CSS selector (supports `:has-text("...")`).
- `await mcp.fill(indexOrSelector, text, clearFirst?)`: Focus, clear, fill, and dispatch input/change events.
- `await mcp.check(indexOrSelector, checked?)`: Toggle checkbox/radio state with input and change events.
- `await mcp.press(key, indexOrSelector?)`: Dispatch keyboard events to focused or targeted element.
- `await mcp.extract(indexOrSelector, 'text' | 'value' | attrName)`: Extract element data.
- `await mcp.waitFor(indexOrSelectorOrPredicate, timeoutMs?, intervalMs?)`: Poll until target appears in DOM or predicate resolves truthy.
- `await mcp.waitForText(textOrRegex, selector?, timeoutMs?)`: Poll until text appears in matching elements.
- `mcp.query(selector, textPattern?)` / `mcp.queryAll(selector, textPattern?)`: Query elements with optional text pattern matching.
- `mcp.findByText(textOrRegex, selector?)` / `mcp.findAllByText(textOrRegex, selector?)`: Locate elements by text content or regex.
- `:has-text("...")` Pseudo-Selector: Natively supported in `document.querySelector('button:has-text("Submit")')` and all `mcp.*` helpers.
- `await mcp.sleep(ms)`: Delay execution.
- `await mcp.fetch(url, options)`: In-page fetch using the tab's logged-in session, cookies, and CORS context.

#### D. High-Frequency Micro-Interactions (`chrome_interact_index`)

For dynamic UI targets, fast animations, canvas items, or rapid sequential clicks:

```json
// Call chrome_interact_index with points sequence
{
  "points": [
    { "x": 420, "y": 280 },
    { "x": 425, "y": 285 },
    { "x": 430, "y": 290 }
  ],
  "intervalMs": 35
}
```

#### E. `chrome_computer` Action Reference

`chrome_computer` is the coordinate/gesture workhorse. There is **no `click` action** — the exact enum is:

| Action                         | Notes                                                                                                                                                                                                                                                                                                                                                   |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `left_click`, `right_click`    | Accept `coordinates` (CSS px), `ref`, or `selector`. `modifiers: { shiftKey / ctrlKey / altKey / metaKey }` are honoured on the CDP path. `dwellMs` (0-2000) holds the button down before release — use 50-150 on targets that reject instant clicks. `coordinateSpace: "viewport" (default) or "screenshot"` disambiguates the space of `coordinates`. |
| `double_click`, `triple_click` | `clickCount` 2 / 3.                                                                                                                                                                                                                                                                                                                                     |
| `hover`                        | Moves pointer without pressing.                                                                                                                                                                                                                                                                                                                         |
| `left_click_drag`              | `coordinates` = end point; combine with `ref`/`selector` for the start.                                                                                                                                                                                                                                                                                 |
| `scroll`                       | `direction` + `amount` (pages) at `coordinates` (default viewport centre).                                                                                                                                                                                                                                                                              |
| `type`                         | CDP `Input.insertText` — trusted text into the focused element.                                                                                                                                                                                                                                                                                         |
| `key`                          | Space-separated tokens: `"ArrowDown ArrowDown Enter"`, chords `"ctrl+k"`, `"shift+alt+g"`.                                                                                                                                                                                                                                                              |
| `fill`, `fill_form`            | Delegate to the fill tooling (selector/ref based).                                                                                                                                                                                                                                                                                                      |
| `wait`                         | Optional `text` condition.                                                                                                                                                                                                                                                                                                                              |
| `resize_page`                  | `width` + `height`.                                                                                                                                                                                                                                                                                                                                     |
| `zoom`                         | `region` as `{x0,y0,x1,y1}` or `[ymin,xmin,ymax,xmax]`; returns a magnified crop.                                                                                                                                                                                                                                                                       |
| `screenshot`                   | See `chrome_screenshot` for most cases.                                                                                                                                                                                                                                                                                                                 |

#### F. Intelligent Scrolling (`chrome_smart_scroll`)

- Auto-detects the most prominent scrollable container and scrolls it by direction + amount. `amount` accepts a pixel number (e.g. `400`), `"page"` (viewport height, default) or `"half_page"`:
  ```json
  // Call chrome_smart_scroll
  {
    "direction": "down",
    "amount": "page"
  }
  ```
- Precise pixel wheel scroll with local scrollable container auto-resolution or explicit selector/index targeting:
  ```json
  // Call chrome_smart_scroll with pixel distance
  {
    "direction": "down",
    "amount": 400
  }
  ```

### Phase 3: Verify & Auto-Settle

- Settling is **opt-in per call**: pass `waitForSettle: true` (on `chrome_interact_index`, `chrome_fill_index`, `chrome_batch_actions`, ...) to wait for the page to stabilise. The only tool that waits by default is `chrome_smart_scroll`.
- When enabled, the watchdog monitors `MutationObserver` events (150ms quiet period) and in-flight network requests (CDP Network domain), returning immediately once the page has stabilised. Note the initial quiet window is only ~30ms, so a slow React re-render may still be in flight when it returns `settled: true` with `mutationsObserved: 0` — verify with a fresh `chrome_read_dom` before assuming the action missed.
- Read the structured response. If `success: true`, proceed to the next step.

### Phase 4: Stale Index Recovery

- If an action returns:
  `ACTION REQUIRED: Please call 'chrome_read_dom' to refresh the index tree before re-attempting interaction`
- **Do not retry blindly.** Call `chrome_read_dom` once to refresh the DOM index mapping, re-locate the target element in the new tree, and resume execution.

---

## 4. Visual Fallback Mode & Multimodal Coordination (PCIE)

When an element cannot be targeted via DOM index (e.g. Canvas games, WebGL charts, image CAPTCHAs, unlabeled SVGs):

### 1. Capture Precision Grid / Perimeter Ruler Screenshot

```json
// Call chrome_screenshot
{
  "grid": true,
  "format": "webp"
}
```

- **Perimeter Tape Measure Rulers**: Renders 20px minor, 50px medium, and 100px major ticks along top and left borders with unambiguous coordinate labels and non-occluding reticle crosshairs (`+`) at intersections.
- **Grid Styles**: `"ruler"` (default perimeter ruler), `"crosshair"` (pure reticle crosshairs without screen-crossing lines, completely eliminating element border confusion like mistaking lines for dice edges), `"classic"` (dashed red lines), or `"1000"` (normalized 0-1000 per-mille).
- **Zero-Blur Smart Compression**: Automatically steps WebP/JPEG quality factors while strictly preserving 1:1 CSS pixel resolution (`scale: 1.0`), preventing Vision API downscale blur for standard viewports.
- **High-Clarity Mode**: Pass `"highClarity": true` to disable dimension scaling and preserve 100% full-resolution sharpness for micro-details.

### 2. Lossless ROI Sub-Region Crops & Zoom

To inspect or interact with fine details (small dice dots, tiny badges, CAPTCHAs):

```json
// Call chrome_screenshot with ROI region
{
  "region": { "x0": 1100, "y0": 380, "x1": 1250, "y1": 460 },
  "grid": "crosshair",
  "highClarity": true
}
```

Or via `chrome_computer`:
```json
{
  "action": "zoom",
  "region": [380, 1100, 460, 1250] // [ymin, xmin, ymax, xmax]
}
```

BrowserClaw captures the sub-region at native resolution, preserves global viewport origin offsets in `screenshotContextManager`, and ensures subsequent clicks accurately map back to global page coordinates.

### 3. Dispatch Multimodal Coordinate Actions & Magnetic Auto-Snapping

The **Polymorphic Coordinate Inference Engine (PCIE)** automatically adapts to any spatial coordinate format:

- **Cartesian Pixels**: `{ "x": 420, "y": 280 }` or `[420, 280]`
- **Row-First Bounding Box**: `[ymin, xmin, ymax, xmax]` (auto-calculates safe geometric center)
- **Normalized / Per-Mille**: `0.0 ~ 1.0` or `0 ~ 1000` (auto-rescales by viewport width/height or crop bounds)
- **CSS Style**: `{ "left": 420, "top": 280 }`

- **Magnetic Auto-Snapping (`autoSnap: true`, default)**: When clicking blank whitespace within 24px of an interactive element (e.g. dice, button, SVG icon), BrowserClaw automatically snaps the click to the element's safe area, preventing wasted rounds from minor model measurement drift.

```json
// Call chrome_interact_index with coordinate
{
  "coordinate": { "x": 420, "y": 280 },
  "action": "click",
  "autoSnap": true
}
```

---

## 5. Specialized Capabilities

### A. Local File Upload (`chrome_upload_file`)

Directly injects local files without size limitations or base64 serialization:

```json
// Call chrome_upload_file
{
  "index": 5,
  "filePath": "D:/data/document.pdf"
}
```

- If clicking an element triggers a native system file picker, use `clickTargetIndex`:
  ```json
  {
    "clickTargetIndex": 5,
    "filePath": "D:/data/document.pdf"
  }
  ```
  BrowserClaw intercepts the dialog via CDP `Page.setInterceptFileChooserDialog`.

### B. Native Dialog Handling (`chrome_handle_dialog`)

When `alert`, `confirm`, or `prompt` dialogs appear:

```json
// Call chrome_handle_dialog
{
  "action": "accept",
  "promptText": "confirmation_code"
}
```

### C. Clean Markdown Extraction (`chrome_get_markdown`)

Extracts clean, readable Markdown from documentation, news, or articles without clutter:

```json
// Call chrome_get_markdown
{
  "tabId": 12345
}
```

Add `"fit": true` for content-only extraction: scopes to the main content region (`article` / `main` / `[role=main]`) and strips nav/header/footer/aside/form noise before conversion — the crawl4ai "fit markdown" equivalent, in-page.

### D. Four-Tier Layered Scraping Protocol (Token-Optimal Data Extraction)

When asked to extract data from websites, **do not blindly dump the whole DOM**. Follow the 4-tier scraping escalation ladder:

1. **Level 1 (Direct API Fetch via `chrome_network_request`)**:
   - Websites (e.g. GitHub, Twitter, Bilibili, e-commerce) render data from structured JSON APIs.
   - If you know or can deduce the endpoint, call `chrome_network_request` directly within the tab context. It inherits all session cookies, origin headers, and credentials, returning clean JSON in < 100 tokens.
2. **Level 2 (Silent API Interception via `chrome_intercept_api`)**:
   - Intercept background XHR/Fetch payloads triggered by clicks or page loads.
3. **Level 3 (Semantic Text & Pruned DOM via `chrome_get_markdown` / `chrome_read_dom`)**:
   - For articles/docs: `chrome_get_markdown { fit: true }`.
   - For structured interaction: `chrome_read_dom { format: "compact" }` (default).
4. **Level 4 (Visual Fallback via `chrome_screenshot`)**:
   - Only for canvas, charts, or visual verification.

### E. Focus Isolation & Non-Disruptive Multi-Tab Operation (Zero User Interruption)

BrowserClaw is specifically engineered to let agents work completely in the background without interrupting the user's foreground browsing:

1. **Never switch the user's active tab**: In multi-tab workflows, **DO NOT call `chrome_switch_tab`** unless the user explicitly requested to switch their active tab view. Calling `chrome_switch_tab` forces Chrome to switch active tabs and steal focus from the user!
2. **Direct `tabId` Targeting**: All core tools (`chrome_read_dom`, `chrome_interact_index`, `chrome_fill_index`, `chrome_screenshot`, `chrome_smart_scroll`, `chrome_batch_actions`, `chrome_computer`, `chrome_get_markdown`, etc.) accept an explicit `tabId`. Always pass the target `tabId` directly. BrowserClaw uses out-of-band CDP sessions to interact with background tabs without bringing them to the front or moving the user's cursor.
3. **Background Navigation & Task-Aligned Tab Grouping**:
   - `chrome_navigate` opens new tabs in the background (`background: true` by default). Never pass `background: false` unless the user explicitly asked to bring the tab into the foreground.
   - **Custom Tab Group**: Always generate a short, task-aligned `groupTitle` in the user's language (e.g. `"知乎调研"`, `"GitHub 搜索"`, `"Flight Tracker"`) and pick an appropriate `groupColor` (e.g. `"purple"`, `"cyan"`, `"orange"`). If omitted, it falls back to `"Agent"` and `"blue"`. This gives the user clear visual context of what the agent is currently working on.
4. **Session Tab Affinity**: When working across multiple turns, pass `sessionId` to bind your agent session to its target tab, preventing accidental fallback to the user's active tab.

### F. Session State Inspection (`chrome_storage`)

Reads localStorage, sessionStorage, and cookies for the current tab in one call:

```json
// Call chrome_storage
{
  "types": ["localStorage", "cookies"],
  "filter": "token",
  "limit": 50
}
```

- `cookies` includes **HttpOnly** entries, which `document.cookie` and page-side JS cannot see — the only way to inspect a logged-in session cookie.
- `includeHttpOnly: false` hides them; `filter` matches key or value case-insensitively; values are capped at 2000 chars with a `truncated` flag.
- WebSocket frames are captured by `chrome_network_capture` (text payloads up to 4000 chars, binary recorded by size, max 200 frames per connection).

### G. Link Graph Extraction & On-Demand Tool Docs (`chrome_tool_docs`)

- `chrome_get_markdown { includeLinks: true }` returns a complete Markdown document along with every unique absolute URL, anchor text, and link graph metadata — the canonical replacement for multi-page crawls. Pair with `chrome_navigate` + `chrome_get_markdown { fit: true }` per page.
- **Streamlined Core Profile (14 tools default)**: BrowserClaw defaults to 14 high-frequency tools (`chrome_read_dom`, `chrome_get_markdown`, `chrome_inspect_media`, `chrome_grep`, `chrome_interact_index`, `chrome_fill_index`, `chrome_batch_actions`, `chrome_screenshot`, `chrome_smart_scroll`, `chrome_navigate`, `chrome_switch_tab`, `chrome_close_tabs`, `get_windows_and_tabs`, `chrome_tool_docs`), reducing token overhead by >65%.
- **Auto-Unlock on Call**: Calling any non-core tool (e.g. `chrome_javascript`, `chrome_history`, `chrome_network_request`) automatically unlocks its entire category and executes without error, while notifying the client via `notifications/tools/list_changed`.
- `chrome_tool_docs { category: "navigate" | "perceive" | "act" | "observe" | "manage" | "crawl" | "diagnose" | "network", activateForSession?: true }` prints compact parameter docs for one category (~1-3KB).
- Visual assets: `chrome_read_dom` lists `[asset N]` entries (img/canvas/video/background-image with bounding boxes); `chrome_screenshot { assetIndex: N }` returns the real image resource (falls back to a viewport crop only when bytes are unobtainable).

---

## 6. Configuration & Self-Healing Diagnostics

For complete client configuration files, self-repair diagnostics, and version upgrades:

- **Client Configs**: See [`config/mcp-config.json`](./config/mcp-config.json) for Claude Desktop, Cursor, Windsurf, Cline, Roo Code, and Antigravity.
- **Diagnostic Tool**: Run `chrome_doctor` or `browserclaw doctor` to run a comprehensive health check on port `12306`, bridge token, Chrome extension connection, and Native Messaging Host registration.
- **Troubleshooting Guide**: See [`config/TROUBLESHOOTING.md`](./config/TROUBLESHOOTING.md) for quick solutions to common connection or state issues.

### 6.1 Extension & Native Host Upgrade Procedure

When a user asks how to upgrade BrowserClaw, or when diagnosing outdated version mismatches:

1. **GitHub Release Download (Direct)**:
   - Download the latest `browserclaw-extension-vX.Y.Z.zip` from [Releases](https://github.com/GoldenLoaf24h/browserclaw/releases/latest).
   - Unzip and overwrite the existing unpacked extension folder.
   - Open `chrome://extensions/` and click the **"Reload" (重新载入)** icon on the BrowserClaw card.

2. **Source Code / Git Pull Upgrade**:
   ```bash
   git pull origin main
   pnpm install
   pnpm build
   ```
   - Then click the "Reload" icon in `chrome://extensions/` to reload the newly compiled extension output.

3. **Verify Upgrade Success**:
   - Run `browserclaw doctor` in the terminal or call `chrome_doctor {}` via MCP.
   - Verify that all core components show `pass` and report the updated version.

### 6.2 Site Automation Recipes & DIY Playbook Caching (`recipes/`)

BrowserClaw supports persisting and reusing proven interaction patterns for specific websites under `recipes/`:
- **Checking Existing Recipes**: Before exploring complex or repetitive sites from scratch, check if a matching playbook exists in `recipes/<site-name>.md`.
- **Authoring Reusable Recipes**: When an agent successfully solves a complex multi-step workflow (e.g. specialized ERPs, dev portals, or custom web forms), it can distill the key selectors, fast-path pipelines (`chrome_batch_actions`), and timing gotchas into `recipes/<service>.md` following `recipes/template.md`.
- **Benefits**: Subsequent runs can bypass redundant full-DOM exploration, saving 80%+ tokens and accelerating execution by 3x~5x.

---

## 7. The Escalation Protocol Reference (Anti-Confusion & Self-Healing Protocol)

To eliminate agent decision confusion and guarantee self-healing across complex web apps, adhere strictly to the **5-Tier Escalation Protocol**:

1. **Tier 1 (High-Level Semantic Engine - Default 90%)**:
   - chrome_interact_index / chrome_fill_index / chrome_batch_actions
   - chrome_read_dom / chrome_get_markdown / chrome_smart_scroll / chrome_navigate
   - Always default to Tier 1. It is 10x more token-efficient, prunes 85% DOM noise, supports `[shadow]` pierced elements, and automatically drives the 1:1 agent cursor.
   - Check `urlChanged` in interaction responses to immediately confirm form/post submissions without extra rounds.

2. **Tier 2 (In-Page Script & Network Bypass - 5%)**:
   - `chrome_javascript` (dynamic unlock): Use `mcp.click()`, `mcp.fill()`, or native `composedPath()` when closed ShadowRoots or custom rich-text editors block standard DOM interaction.
   - `chrome_network_request`: Directly fetch backend JSON APIs using the active session's cookies/credentials to bypass anti-scraping DOM defenses.

3. **Tier 3 (Visual Fallback Engine - 3%)**:
   - chrome_screenshot (1:1 viewport coordinate grid) -> chrome_computer
   - Used for headless Canvas games, WebGL visualizations, or unlabeled SVG elements without DOM nodes.

4. **Tier 4 (Human-in-the-Loop Handoff - 1%)**:
   - `chrome_request_human_intervention`: When encountering anti-bot verification (slider puzzles, Geetest, reCAPTCHA, SMS 2FA, payment approval) where CDP events are blocked or ack times out, call this tool to pop an overlay asking the user to solve it, then resume cleanly.

5. **Tier 5 (Raw CDP Escape Hatch - <1%)**:
   - chrome_cdp_execute (Target polymorphic, auto-detach timeout guard)
   - Never call for standard clicks, text inputs, or basic reading.
   - Use ONLY when high-level tools repeatedly fail twice, or when low-level browser primitives are required (e.g. Network.getCookies, Emulation.setDeviceMetricsOverride, Page.printToPDF, or out-of-process iframe target: { targetId }).

---

## 8. High-Efficiency Agent Patterns & Best Practices

### 8.1 Targeted Search Over Full DOM Dump (`chrome_grep`)

When hunting for a specific button, link, or keyword in huge pages (> 5,000 tokens):

- **DO NOT** call `chrome_read_dom` blindly.
- **DO** call `chrome_grep { query: "Submit", searchType: "interactive_only" }`.
- It returns matching 1-based indices and selectors immediately for < 100 tokens, ready for direct `chrome_interact_index`.
- Supports multi-frame traversal across nested iframes with hierarchical index remapping, and matches against element text, roles, `placeholder`, `aria-label`, and `value` attributes.

### 8.2 Self-Driven Diff Piggybacking (`includeDelta: true`)

To avoid double-roundtrip latency ("click -> wait -> read_dom -> wait"):

- Pass `includeDelta: true` when calling `chrome_interact_index`, `chrome_fill_index`, or `chrome_batch_actions`.
- The response includes a `delta` object detailing newly added, modified, or removed DOM elements and the new revision.
- If `delta.unchanged === true`, the page experienced zero DOM mutations, saving a full inspection turn.

### 8.3 Closed-Loop Pipeline with Assert & Extract (`chrome_batch_actions`)

For multi-step flows (e.g. filling search forms and collecting results):

```json
{
  "tabId": 123,
  "actions": [
    { "type": "fill", "index": 4, "text": "AI Automation" },
    { "type": "click", "index": 5 },
    {
      "type": "assert",
      "selector": ".results-container",
      "condition": "visible",
      "abortOnFailure": true
    },
    {
      "type": "extract",
      "selector": ".result-count",
      "property": "text",
      "variableName": "totalResults"
    }
  ],
  "includeDelta": true
}
```

Executes with zero intermediate roundtrip lag and returns extracted values under `extractedData`. Automatically handles cross-origin iframe coordinate translation and subframe probe routing across nested browsing contexts.

### 8.4 Handling Captchas & 2FA (`chrome_request_human_intervention`)

When encountering slider captchas, SMS codes, or payment prompts:

- Call `chrome_request_human_intervention { reason: "Please complete slider verification" }`.
- Automatically dims page, displays an Apple/OpenAI styled frosted glass top banner constructed with safe DOM APIs (immune to DOM XSS), parks the virtual mouse, and yields control to the user.
- Resumes seamlessly once the user clicks "Continue" or presses `Enter`.

### 8.5 Inspecting Hard-to-Read Captchas & Charts (`chrome_inspect_media`)

- Call `chrome_inspect_media { index: 12 }` to extract the lossless native bitmap of an `<img>` or `<canvas>`.
- Complex noisy captchas automatically trigger a 200%+ super-sampling close-up crop.

### 8.6 Silent Debugger Setup Support

- When helping a user install or configure BrowserClaw, always offer to configure Chrome with `--silent-debugger-extension-api`.
- This suppresses the native top warning bar ("BrowserClaw is debugging this browser") and prevents page-height jitter.

### 8.7 Safe Tab Closure (`chrome_close_tabs`)

- When closing specific tabs, pass `tabIds` or `url`.
- When closing without `tabIds` or `url`, pass `confirm: true` (or provide `sessionId` for session affinity). This prevents accidental destruction of the human user's active foreground tab.

### 8.8 In-Page JavaScript Evaluation (`chrome_javascript`)

- Supports top-level `await` and automatic single-expression `return (...)` wrapping. You can pass raw expressions such as `document.title` or `window.location.href` directly without manually prepending `return`.

### 8.9 Viewport-Only Token Pruning (`chrome_read_dom` with `viewportOnly: true`)

When inspecting long-scroll pages (e.g. social feeds, search results, large data tables):

- Call `chrome_read_dom { viewportOnly: true }` to constrain extraction to elements within or immediately adjacent (150px) to the current viewport.
- Eliminates distant off-screen DOM nodes and reduces token consumption by an additional 50%~70%.

### 8.10 VOM Geometric Coverage & Modal Focus Guidance

- BrowserClaw calculates exact geometric viewport overlap: `overlap / (vp.width * vp.height)`.
- When an overlay covers $\ge 60\%$ of the screen or a modal covers $\ge 12\%$, the compact AX tree prefixes:
  `[Modal Guidance: Active modal focus trap (<element>). Prioritize interacting with modal elements or dismissing it.]`
- When you see this header, focus on resolving or closing the active dialog before targeting background elements.

### 8.11 Environment Self-Diagnostics (`chrome_doctor`)

- If tool calls fail due to connection or authorization issues, call `chrome_doctor {}` (or run `browserclaw doctor` in terminal).
- Returns health status for Native Host port 12306, the Agent master switch, Virtual Cursor mode, and Window Isolation settings.

### 8.12 Window Isolation vs. Tab Groups (Window Mode)

- **Tab Mode (Default)**: Automatically groups temporary task tabs under dedicated, colored Chrome Tab Groups (e.g., `12306查询`) within the current window and emulates background focus.
- **Window Mode**: If the user toggles Window Mode in the popup, Agent tasks open in a separate OS window where CDP debugger infobars are strictly confined, leaving the user's primary workspace 100% untouched.
