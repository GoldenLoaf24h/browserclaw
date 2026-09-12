---
name: browserclaw
description: High-efficiency, zero-hallucination Chrome browser control and automation via BrowserClaw MCP server. Dual-engine architecture (DOM-First 1-based indexing + Visual-Fallback with 1:1 CSS viewport coordinate grid, Set-of-Mark 2.0, and PCIE polymorphic coordinates). Dispatches native CDP events (isTrusted=true) with full support for React/Vue/WebComponents, Shadow DOM, and background tab isolation.
---

# BrowserClaw Browser Control Skill

Use this skill when interacting with the user's real local Chrome browser through the **BrowserClaw** MCP server. The environment operates directly inside an active Chrome session, preserving existing user logins, session cookies, and extensions.

---

## 1. Dual-Engine Operating Architecture

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

## 2. Standard Agent Interaction Workflow

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
    "clear": true
  }
  ```

#### B. Batch Actions (Strongly Recommended for Forms & Multi-Step Flows)

When filling multiple fields or executing consecutive actions, **always prefer `chrome_batch_actions`** to eliminate multi-turn network roundtrips:

```json
// Call chrome_batch_actions
{
  "actions": [
    { "type": "fill", "index": 2, "text": "developer@example.com", "clear": true },
    { "type": "fill", "index": 3, "text": "SuperSecretPass!", "clear": true },
    { "type": "click", "index": 4 },
    { "type": "wait", "durationMs": 300 }
  ],
  "waitForSettle": true
}
```

#### C. Code-Driven Chained Execution (`chrome_javascript` with in-page `mcp.*`)

For complex multi-step logic (conditional branches, loops, or form filling + data extraction), **write a single script with the injected `mcp` helper**. This compresses N roundtrips into 1, slashing latency and tokens:

```json
// Call chrome_javascript
{
  "code": "await mcp.fill(2, 'developer@example.com');\nawait mcp.fill(3, 'SuperSecretPass!');\nawait mcp.click(4);\nawait mcp.sleep(400);\nreturn await mcp.extract(5, 'text');"
}
```

Injected `mcp` API:
- `await mcp.click(indexOrSelector)`: Dispatch clean mouse sequence to numeric index or CSS selector.
- `await mcp.fill(indexOrSelector, text, clearFirst?)`: Focus, clear, fill, and dispatch input/change events.
- `await mcp.extract(indexOrSelector, 'text' | 'value' | attrName)`: Extract element data.
- `await mcp.waitFor(indexOrSelector, timeoutMs?)`: Poll until target appears in DOM.
- `await mcp.sleep(ms)`: Delay execution.
- `await mcp.fetch(url, options)`: In-page fetch using the tab's logged-in session, cookies, and CORS context.

#### D. High-Frequency Micro-Interactions (`chrome_burst_interact`)

For dynamic UI targets, fast animations, or canvas items:

```json
// Call chrome_burst_interact
{
  "burstClicks": {
    "center": { "x": 420, "y": 280 },
    "count": 3,
    "intervalMs": 30
  }
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

#### F. Intelligent Scrolling (`chrome_smart_scroll` & `chrome_scroll`)

- Auto-detects the most prominent scrollable container and scrolls it by direction + amount. `amount` accepts a pixel number, `"page"` (viewport height, default) or `"half_page"`:
  ```json
  // Call chrome_smart_scroll
  {
    "direction": "down",
    "amount": "page"
  }
  ```
- Precise wheel scroll with local scrollable container auto-resolution. Use `amount` (pixels) or `pages` (fractional viewport heights); there is no `percent` parameter:
  ```json
  // Call chrome_scroll
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

## 3. Visual Fallback Mode & Multimodal Coordination (PCIE)

When an element cannot be targeted via DOM index (e.g. Canvas games, WebGL charts, image CAPTCHAs, unlabeled SVGs):

### 1. Capture Grid Screenshot

```json
// Call chrome_screenshot
{
  "grid": true,
  "format": "webp"
}
```

- Returns 1:1 CSS viewport WebP image with red/blue 100px grid ruler lines.
- **Anti-Blindness Defense**: Even if an oversized page exceeds 450KB and is saved locally, BrowserClaw **always returns an in-memory WebP thumbnail (<150KB) in the `{ type: "image" }` block**, ensuring remote agents never go blind.

### 2. Dispatch Multimodal Coordinate Actions

The **Polymorphic Coordinate Inference Engine (PCIE)** automatically adapts to any spatial coordinate format:

- **Cartesian Pixels**: `{ "x": 420, "y": 280 }` or `[420, 280]`
- **Row-First Bounding Box**: `[ymin, xmin, ymax, xmax]` (auto-calculates safe geometric center)
- **Normalized / Per-Mille**: `0.0 ~ 1.0` or `0 ~ 1000` (auto-rescales by viewport width/height)
- **CSS Style**: `{ "left": 420, "top": 280 }`

```json
// Call chrome_interact_index with coordinate
{
  "coordinate": { "x": 420, "y": 280 },
  "action": "click"
}
```

### 3. High-Resolution ROI Zoom (Micro-Elements)

To inspect or interact with tiny icons or text:

```json
// Call chrome_computer with zoom action
{
  "action": "zoom",
  "region": [200, 300, 350, 450] // [ymin, xmin, ymax, xmax]
}
```

BrowserClaw centers and magnifies the region into a crisp 400×400 high-res image and automatically adjusts subsequent coordinate offsets via `screenshotContextManager`.

---

## 4. Specialized Capabilities

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
3. **Background Navigation**: `chrome_navigate` opens new tabs in the background (`active: false`) by default. Never pass `background: false` unless the user explicitly asked to bring the tab into the foreground.
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

### F. Link Graph Extraction (`chrome_get_links`) & On-Demand Tool Docs (`chrome_tool_docs`)

- `chrome_get_links { sameOriginOnly?: true, selector?: "main" }` returns every unique absolute URL with anchor text, internal/external flag, and `rel=nofollow` — the input for any multi-page crawl. Pair with `chrome_navigate` + `chrome_get_markdown { fit: true }` per page.
- `chrome_tool_docs { category: "navigate" | "perceive" | "act" | "observe" | "manage" | "crawl" | "diagnose" | "network", activateForSession?: true }` prints compact parameter docs for one category (~1-3KB). Pass `activateForSession: true` to dynamically expose all tools in that category for the current MCP session without restarting the server (supported across both Fastify HTTP/SSE and Stdio transports).
- Visual assets: `chrome_read_dom` lists `[asset N]` entries (img/canvas/video/background-image with bounding boxes); `chrome_screenshot { assetIndex: N }` returns the real image resource (falls back to a viewport crop only when bytes are unobtainable).

---

## 5. Configuration & Self-Healing Diagnostics

For complete client configuration files and self-repair diagnostics:

- **Client Configs**: See [`config/mcp-config.json`](./config/mcp-config.json) for Claude Desktop, Cursor, Windsurf, Cline, Roo Code, and Antigravity.
- **Diagnostic Tool**: Run `node skill/config/doctor.mjs` to run a comprehensive health check on port `12306`, bridge token, Chrome extension connection, and Native Messaging Host registration.
- **Troubleshooting Guide**: See [`config/TROUBLESHOOTING.md`](./config/TROUBLESHOOTING.md) for quick solutions to common connection or state issues.

---

## 3. The Escalation Ladder (Anti-Confusion & Decision Protocol)

To eliminate agent decision confusion between high-level semantic tools and low-level CDP commands, adhere strictly to the **3-Tier Escalation Protocol**:

1. **Tier 1 (High-Level Semantic Engine - Default 95%)**:
   - chrome_interact_index / chrome_fill_index / chrome_batch_actions
   - chrome_read_dom / chrome_get_markdown / chrome_smart_scroll / chrome_navigate
   - Always default to Tier 1. It is 10x more token-efficient, prunes 85% DOM noise, and automatically drives the 1:1 agent cursor.

2. **Tier 2 (Visual Fallback Engine - 4%)**:
   - chrome_screenshot (1:1 viewport coordinate grid) -> chrome_computer
   - Used for headless Canvas games, WebGL visualizations, or unlabeled SVG elements without DOM nodes.

3. **Tier 3 (Raw CDP Escape Hatch - 1%)**:
   - chrome_cdp_execute (Target polymorphic, auto-detach timeout guard)
   - Never call for standard clicks, text inputs, or basic reading.
   - Use ONLY when high-level tools repeatedly fail twice, or when low-level browser primitives are required (e.g. Network.getCookies, Emulation.setDeviceMetricsOverride, Page.printToPDF, or out-of-process iframe arget: { targetId }).

---

## 6. High-Efficiency Agent Patterns & Best Practices

### 6.1 Targeted Search Over Full DOM Dump (`chrome_grep`)

When hunting for a specific button, link, or keyword in huge pages (> 5,000 tokens):

- **DO NOT** call `chrome_read_dom` blindly.
- **DO** call `chrome_grep { query: "Submit", searchType: "interactive_only" }`.
- It returns matching 1-based indices and selectors immediately for < 100 tokens, ready for direct `chrome_interact_index`.
- Supports multi-frame traversal across nested iframes with hierarchical index remapping, and matches against element text, roles, `placeholder`, `aria-label`, and `value` attributes.

### 6.2 Self-Driven Diff Piggybacking (`includeDelta: true`)

To avoid double-roundtrip latency ("click -> wait -> read_dom -> wait"):

- Pass `includeDelta: true` when calling `chrome_interact_index`, `chrome_fill_index`, or `chrome_batch_actions`.
- The response includes a `delta` object detailing newly added, modified, or removed DOM elements and the new revision.
- If `delta.unchanged === true`, the page experienced zero DOM mutations, saving a full inspection turn.

### 6.3 Closed-Loop Pipeline with Assert & Extract (`chrome_batch_actions`)

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

Executes with zero intermediate roundtrip lag and returns extracted values under `extractedData`. Automatically handles cross-origin iframe coordinate translation.

### 6.4 Handling Captchas & 2FA (`chrome_request_human_intervention`)

When encountering slider captchas, SMS codes, or payment prompts:

- Call `chrome_request_human_intervention { reason: "Please complete slider verification" }`.
- Automatically dims page, displays an Apple/OpenAI styled frosted glass top banner constructed with safe DOM APIs (immune to DOM XSS), parks the virtual mouse, and yields control to the user.
- Resumes seamlessly once the user clicks "Continue" or presses `Enter`.

### 6.5 Inspecting Hard-to-Read Captchas & Charts (`chrome_inspect_media`)

- Call `chrome_inspect_media { index: 12 }` to extract the lossless native bitmap of an `<img>` or `<canvas>`.
- Complex noisy captchas automatically trigger a 200%+ super-sampling close-up crop.

### 6.6 Silent Debugger Setup Support

- When helping a user install or configure BrowserClaw, always offer to configure Chrome with `--silent-debugger-extension-api`.
- This suppresses the native top warning bar ("BrowserClaw is debugging this browser") and prevents page-height jitter.

### 6.7 Safe Tab Closure (`chrome_close_tabs`)

- When closing specific tabs, pass `tabIds` or `url`.
- When closing without `tabIds` or `url`, pass `confirm: true` (or provide `sessionId` for session affinity). This prevents accidental destruction of the human user's active foreground tab.

### 6.8 In-Page JavaScript Evaluation (`chrome_javascript`)

- Supports top-level `await` and automatic single-expression `return (...)` wrapping. You can pass raw expressions such as `document.title` or `window.location.href` directly without manually prepending `return`.
