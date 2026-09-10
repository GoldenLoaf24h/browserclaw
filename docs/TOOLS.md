# BrowserClaw 工具参考 / Tool Reference

> 本文档由 `scripts/gen-tools-doc.mjs` 从 `packages/shared/src/tools.ts` 的 schema 生成，与代码保持一致。重新生成：`node scripts/gen-tools-doc.mjs`。

| Profile | 工具数 | Schema 开销 |
| --- | --- | --- |
| full（默认） | 46 | ~17.2k tokens |
| core | 28 | ~13.2k tokens |
| crawl | 12 | ~4.8k tokens |

被 profile 隐藏的工具可用 `chrome_tool_docs` 按类别查询参数（该工具在任何 profile 均可用）。


## 导航与标签页 / Navigation & Tabs

### `chrome_navigate`

Navigate to a URL, refresh the current tab, or navigate browser history (back/forward)

- `url` — URL to navigate to. Special values: "back" or "forward" to navigate browser history in the target tab.
- `newWindow` — Create a new window to navigate to the URL or not. Defaults to false
- `tabId` — Target an existing tab by ID (if provided, navigate/refresh/back/forward that tab instead of the active tab).
- `windowId` — Target an existing window by ID (when creating a new tab in existing window, or picking active tab if tabId is not provided).
- `background` — Perform the operation without stealing focus (do not activate the tab or focus the window). Default: true (set false only if user explicitly asks to b
- `width` — Window width in pixels (default: 1280). When width or height is provided, a new window will be created.
- `height` — Window height in pixels (default: 720). When width or height is provided, a new window will be created.
- `refresh` — Refresh the current active tab instead of navigating to a URL. When true, the url parameter is ignored. Defaults to false

### `chrome_switch_tab`

Switch to a specific browser tab

- `tabId`（必填） — The ID of the tab to switch to.
- `windowId` — The ID of the window where the tab is located.
- `background` — If true, binds session affinity only without activating the tab in the Chrome UI or stealing user focus. Default: false

### `chrome_close_tabs`

Close one or more browser tabs

- `tabIds` — Array of tab IDs to close. If not provided, will close the active tab.
- `url` — Close tabs matching this URL. Can be used instead of tabIds.

### `chrome_move_tab`

Move one or more tabs to a new position index or to another window.

- `tabId` — Single tab ID to move (optional if tabIds provided)
- `tabIds` — Multiple tab IDs to move
- `index`（必填） — Target position index in the window (0-based, or -1 for end of window)
- `windowId` — Target window ID (optional, defaults to current window)

### `chrome_attach_tab`

Explicitly attach CDP debugger and session affinity to a specific tab (by tabId) or the user's currently active tab. WARNING / SIDE EFFECT: Attaching to the user's active tab displays Chrome's debugger warning banner ('browserclaw is debugging this browser') and directly shares execution state with the user. Avoid calling unless interaction with the user's active tab is explicitly requested.

- `tabId` — The target tab ID to attach. If omitted, attaches to the user's currently active foreground tab.
- `sessionId` — Session identifier to bind affinity to this tab.

### `chrome_detach_tab`

Detach CDP debugger from the tab and release session affinity, dismissing the Chrome debugger banner.

- `tabId` — The target tab ID to detach (defaults to session bound tab or active tab).
- `sessionId` — Session identifier to release affinity from.

### `get_windows_and_tabs`

Get all currently open browser windows and tabs




## 页面感知 / Perception

### `chrome_read_dom`

Extract and prune interactive DOM tree with compact 1-based index assignment, viewport boundary filtering, and occlusion pruning.

- `viewportThreshold` — Vertical threshold in pixels for viewport boundary checking (default 1000)
- `tabId` — Target tab ID (optional)
- `windowId` — Target window ID (optional)
- `highlight` — Whether to visually highlight indexed elements
- `sessionId` — Optional session identifier to bind affinity to a specific tab context
- `cursor` — Pagination cursor offset for traversing very large DOM pages incrementally (default: 0)
- `limit` — Maximum number of indexed elements to return for current page cursor slice (default: unlimited)
- `maxTextLength` — Maximum text length before truncation for element text content (default: 120)
- `includeDetails` — Also return the bulky indexedElements/indexMap detail blocks (geometry, occlusion flags, safe click points). Off by default because the tree already c

### `chrome_get_markdown`

Extract clean, structured hierarchical markdown from the active tab DOM stripped of SPA state blobs, hidden text, and scripts.

- `includeLinks` — Whether to preserve hyperlinks in markdown (default: true)
- `fit` — Content-only extraction: restrict to the main content region and strip nav/header/footer/aside/form noise before conversion (default: false)
- `tabId` — Target tab ID (optional)
- `windowId` — Target window ID (optional)
- `sessionId` — Optional session identifier to bind affinity to a specific tab context

### `chrome_get_web_content`

Fetch content from a web page

- `url` — URL to fetch content from. If not provided, uses the current active tab
- `tabId` — Target an existing tab by ID (default: active tab).
- `background` — Do not activate tab/focus window while fetching (default: true)
- `htmlContent` — Get the visible HTML content of the page. If true, textContent will be ignored (default: false)
- `textContent` — Get the visible text content of the page with metadata. Ignored if htmlContent is true (default: true)
- `selector` — CSS selector to get content from a specific element. If provided, only content from this element will be returned

### `chrome_get_links`

Extract all links on the page for crawling: absolute URL, anchor text, internal/external classification, rel=nofollow flag. Supports an optional CSS selector to scope extraction, and a sameOriginOnly filter.

- `tabId` — Target tab ID (default: active tab)
- `selector` — Optional CSS selector to scope the link search (default: whole document)
- `sameOriginOnly` — Only return same-origin links (default: false)
- `includeEmptyHref` — Include anchors without href (default: false)
- `sessionId` — Session ID for tab affinity (optional)

### `chrome_get_dropdown_options`

Get all options from a native <select> dropdown, ARIA combobox, or custom menu list.

- `index` — Element numeric index from chrome_read_dom
- `selector` — CSS selector of the dropdown or combobox
- `tabId` — Target tab ID (optional)
- `windowId` — Target window ID (optional)
- `sessionId` — Optional session identifier to bind affinity to a specific tab context


## 交互操作 / Interaction

### `chrome_interact_index`

Click, hover, or interact with an element using its compact 1-based numeric index from chrome_read_dom.

- `index` — Compact 1-based numeric index of the target element
- `coordinate` — Visual fallback coordinates in viewport/CSS pixels: { x, y } object, [x, y] point, or [ymin, xmin, ymax, xmax] bounding box (supports 0~1.0 normalized
- `coordinateSpace:viewport|screenshot` — Coordinate reference space. "viewport" (default) assumes standard CSS viewport pixels. "screenshot" scales coordinates based on the latest screenshot 
- `points` — Click sequence: dispatch a full CDP click at each viewport point with intervalMs pacing (rapid burst for moving canvas targets)
- `intervalMs` — Delay between points in the click sequence, 5-500ms (default 35)
- `action:click|hover|double_click|right_click|drag` — Interaction action to perform (default: click). "drag" requires `end` and moves from the indexed element to that target.
- `end` — Drag destination: { index } for an indexed element, or { coordinate: { x, y } } for a raw point. Required when action is "drag".
- `steps` — Number of intermediate mouse-move steps for drag (default 48; lower is faster, higher is smoother)
- `holdMs` — How long to hold the mouse button before dragging, in ms (default 80, max 1000)
- `dnd` — Use HTML5 drag-and-drop events (dragstart/dragover/drop) instead of raw mouse moves. Needed for React/HTML5 DnD lists.
- `modifiers` — Keyboard modifiers to hold during interaction
- `tabId` — Target tab ID (optional)
- `windowId` — Target window ID (optional)
- `waitForSettle` — Wait for DOM mutations to settle (quiet for 150ms or timeout) after interaction before returning (default: false)
- `settleTimeoutMs` — Maximum settle timeout in milliseconds (default: 1500, range: 200-10000)
- `humanize` — Simulate realistic human-like cursor trajectory with micro-jitter before clicking (default: false)
- `sessionId` — Optional session identifier to bind affinity to a specific tab context

### `chrome_fill_index`

Fill text into an input or textarea element using its compact 1-based numeric index.

- `index`（必填） — Compact 1-based numeric index of the target element
- `text` — Text content to fill into the element
- `value` — Alias for text parameter
- `clear` — Whether to clear existing field content before typing (default: true)
- `tabId` — Target tab ID (optional)
- `windowId` — Target window ID (optional)
- `waitForSettle` — Wait for DOM mutations to settle after filling text before returning (default: false)
- `settleTimeoutMs` — Maximum settle timeout in milliseconds (default: 1500, range: 200-10000)
- `sessionId` — Optional session identifier to bind affinity to a specific tab context

### `chrome_click_element`

Click on an element in a web page. Follows a unified 4-tier degradation chain: ref/index (default) -> CSS/XPath selector -> text/role -> coordinate (fallback). Reports actual resolutionPath in response. Note: Visual coordinate mode is intended strictly as a fallback for elements that DOM/accessibility snapshots cannot express (e.g. Canvas, WebGL, SVG charts, or pages lacking accessibility info).

- `index` — Compact 1-based index of the target element from chrome_read_dom (alias for ref).
- `selector` — CSS selector or XPath for the element to click.
- `selectorType:css|xpath` — Type of selector (default: "css").
- `ref` — Element ref from chrome_read_dom (takes precedence over selector).
- `text` — Target element by visible text content (evaluated after ref and selector in degradation chain).
- `role` — Target element by ARIA role attribute (e.g. "button", "tab", "link").
- `coordinate` — Coordinates to click at: { x, y } object, [x, y] point, or [ymin, xmin, ymax, xmax] bounding box (preferred unified parameter). Interpreted in the spa
- `coordinates` — Deprecated alias for coordinate. Prefer coordinate.
- `double` — Perform double click when true (default: false).
- `coordinateSpace:viewport|screenshot` — Space of coordinate/coordinates (default: viewport).
- `button:left|right|middle` — Mouse button to click (default: "left").
- `modifiers` — Modifier keys to hold during click.
- `waitForNavigation` — Wait for navigation to complete after click (default: false).
- `timeout` — Timeout in milliseconds for waiting (default: 5000).
- `tabId` — Target tab ID. If omitted, uses the current active tab.
- `windowId` — Window ID to select active tab from (when tabId is omitted).
- `frameId` — Target frame ID for iframe support.
- `sessionId` — Optional session identifier to bind affinity to a specific tab context

### `chrome_fill_or_select`

Fill or select a form element on a web page. Follows unified locator degradation: ref/index (default) -> CSS/XPath selector -> targetText/role -> coordinate (CDP click & type fallback). Reports actual resolutionPath in response.

- `index` — Compact 1-based index of the target element from chrome_read_dom (alias for ref).
- `selector` — CSS selector or XPath for the form element.
- `selectorType:css|xpath` — Type of selector (default: "css").
- `ref` — Element ref from chrome_read_dom (takes precedence over selector).
- `targetText` — Target element by label or visible text content (used for locating target element).
- `role` — Target element by ARIA role attribute (e.g. "textbox", "combobox").
- `coordinate` — Viewport coordinates to click and focus before typing (fallback when ref/selector unavailable).
- `coordinates` — Deprecated alias for coordinate. Prefer coordinate.
- `text` — Text content to fill into the form element (preferred unified naming, alias for value).
- `value` — Value to fill. For text inputs: string. For checkboxes/radios: boolean. For selects: option value or text.
- `tabId` — Target tab ID. If omitted, uses the current active tab.
- `windowId` — Window ID to select active tab from (when tabId is omitted).
- `frameId` — Target frame ID for iframe support.
- `sessionId` — Optional session identifier to bind affinity to a specific tab context

### `chrome_fill_form`

Fill multiple form fields in a single MCP call to reduce roundtrips. Supports filling by ref (1-based index), selector, or field name.

- `fields`（必填） — Array of field descriptors to fill sequentially
- `tabId` — Target tab ID (optional)
- `windowId` — Target window ID (optional)
- `waitForSettle` — Wait for DOM mutations to settle after form is filled (default: false)
- `settleTimeoutMs` — Maximum settle timeout in ms (default: 1500)
- `sessionId` — Session identifier for tab affinity

### `chrome_keyboard`

Simulate keyboard input on a web page. Supports single keys (Enter, Tab, Escape), key combinations (Ctrl+C, Ctrl+V), and text input. Can target a specific element or send to the focused element.

- `keys`（必填） — Keys or key combinations to simulate. Examples: "Enter", "Tab", "Ctrl+C", "Shift+Tab", "Hello World".
- `index` — Target element index (1-based integer from chrome_read_dom) to focus before sending keyboard events.
- `selector` — CSS selector or XPath for target element to receive keyboard events.
- `selectorType:css|xpath` — Type of selector (default: "css").
- `delay` — Delay between keystrokes in milliseconds (default: 50).
- `tabId` — Target tab ID. If omitted, uses the current active tab.
- `windowId` — Window ID to select active tab from (when tabId is omitted).
- `frameId` — Target frame ID for iframe support.
- `sessionId` — Optional session identifier to bind affinity to a specific tab context

### `chrome_upload_file`

Upload files to web forms with file input elements using Chrome DevTools Protocol

- `tabId` — Target tab ID (default: active tab)
- `windowId` — Target window ID to pick active tab when tabId is omitted
- `selector` — CSS selector for the file input element (optional if index is provided)
- `index` — Compact 1-based numeric index of the file input element from chrome_read_dom
- `clickTargetIndex` — Compact 1-based numeric index of a button/element from chrome_read_dom to click that triggers a dynamic file chooser dialog (e.g. Ant Design, Element 
- `filePath` — Local file path to upload
- `fileUrl` — URL to download file from before uploading
- `base64Data` — Base64 encoded file data to upload
- `fileName` — Optional filename when using base64 or URL (default: "uploaded-file")
- `multiple` — Whether the input accepts multiple files (default: false)
- `sessionId` — Optional session identifier to bind affinity to a specific tab context

### `chrome_handle_dialog`

Handle JavaScript dialogs (alert/confirm/prompt) via CDP

- `action:accept|dismiss`（必填） — accept: click OK and submit promptText if provided. dismiss: click Cancel.
- `promptText` — Optional prompt text when accepting a prompt
- `tabId` — Target tab ID (optional)
- `windowId` — Target window ID (optional)
- `sessionId` — Optional session identifier to bind affinity to a specific tab context

### `chrome_handle_download`

Wait for a browser download and return details (id, filename, url, state, size)

- `filenameContains` — Filter by substring in filename or URL
- `timeoutMs` — Timeout in ms (default 60000, max 300000)
- `waitForComplete` — Wait until completed (default true)

### `chrome_batch_actions`

Execute a sequential pipeline of browser actions with static and runtime page-drift guards and partial failure reporting.

- `actions`（必填） — List of actions to execute sequentially
- `tabId` — Target tab ID (optional)
- `windowId` — Target window ID (optional)
- `waitForSettle` — Wait for DOM mutations to settle after all actions before returning (default: false)
- `settleTimeoutMs` — Maximum settle timeout in milliseconds (default: 1500, range: 200-10000)
- `sessionId` — Optional session identifier to bind affinity to a specific tab context

### `chrome_burst_interact`

Execute ultra-low latency rapid interaction sequences: high-frequency clicks (burst), mouse trajectories, or rapid keyboard inputs directly over CDP without per-action roundtrip lag.

- `tabId` — Target tab ID (optional)
- `sessionId` — Session ID for tab affinity (optional)
- `coordinateSpace:viewport|screenshot` — Coordinate space for coordinates (default: "viewport")
- `burstClicks` — High-frequency burst clicking around a center point
- `trajectory` — Smooth or micro-paused mouse movement trajectory sequence
- `keySequence` — Rapid keyboard keypress sequence
- `waitForSettle` — Wait for DOM settle after sequence completes
- `settleTimeoutMs` — Settle timeout in ms

### `chrome_computer`

Use a mouse and keyboard to interact with a web browser, and take screenshots.

- `tabId` — Target tab ID (default: active tab)
- `background` — Avoid focusing/activating tab/window for operations (best-effort). Default: true (runs quietly in background without stealing user focus)
- `dwellMs` — For click actions: milliseconds to hold the button down before release (0-2000). Use 50-150 for targets that reject instant clicks
- `action:left_click|right_click|double_click|triple_click|left_click_drag|scroll|scroll_to|type|key|fill|fill_form|hover|wait|resize_page|zoom|screenshot`（必填） — Action to perform. There is no plain "click" — use left_click.
- `ref` — Element ref/index from chrome_read_dom. For click/scroll/scroll_to/key/type and drag end when provided; takes precedence over coordinates.
- `coordinates` — Coordinates for actions: { x, y } object, [x, y] point, or [ymin, xmin, ymax, xmax] bounding box (supports 0~1.0 normalized, 0~1000 per-mille, or abso
- `coordinateSpace:viewport|screenshot` — Space of coordinates: viewport (default, absolute CSS pixels) or screenshot (mapped through the most recent screenshot context for this tab).
- `startCoordinates` — Starting coordinates for drag action: { x, y } object, [x, y] point, or [ymin, xmin, ymax, xmax] bounding box.
- `startRef` — Drag start ref/index from chrome_read_dom (alternative to startCoordinates).
- `scrollDirection` — Scroll direction: up | down | left | right
- `scrollAmount` — Scroll ticks (1-10), default 3
- `text` — Text to type (for action=type) or keys/chords separated by space (for action=key, e.g. "Backspace Enter" or "cmd+a")
- `repeat` — For action=key: number of times to repeat the key sequence (integer 1-100, default 1).
- `modifiers` — Modifier keys for click actions (left_click/right_click/double_click/triple_click).
- `region` — For action=zoom: rectangular region to capture (x0,y0)-(x1,y1) in viewport pixels (or screenshot-space if a recent screenshot context exists).
- `selector` — CSS selector for fill (alternative to ref).
- `value` — Value to set for action=fill (string | boolean | number)
- `elements` — For action=fill_form: list of elements to fill (ref + value)
- `width` — For action=resize_page: viewport width
- `height` — For action=resize_page: viewport height
- `appear` — For action=wait with text: whether to wait for the text to appear (true, default) or disappear (false)
- `timeout` — For action=wait with text: timeout in milliseconds (default 10000, max 120000)
- `duration` — Seconds to wait for action=wait (max 30s)
- `windowId` — Target window ID (optional)
- `sessionId` — Optional session identifier to bind affinity to a specific tab context


## 观察与滚动 / Observation & Scrolling

### `chrome_screenshot`

[Prefer chrome_read_dom over taking a screenshot] Take a screenshot of the current page or a specific element. Returns base64 image directly in MCP image content block without writing to disk. By default, output is compressed JPEG with maxWidth <= 1280px. Debug disk save is available via savePng/saveToDisk into system temporary directory.

- `name` — Name for the screenshot, if saving to disk
- `selector` — CSS selector for element to screenshot
- `assetIndex` — View one visual asset listed by chrome_read_dom ([asset N] lines): returns the real image resource; falls back to a viewport crop when bytes are unava
- `tabId` — Target tab ID to capture from (default: active tab).
- `windowId` — Target window ID to pick active tab from when tabId is not provided.
- `background` — Attempt capture without bringing tab/window to foreground. CDP-based capture is used for viewport captures. Default: true
- `width` — Width in pixels (default: 800)
- `height` — Height in pixels (default: 600)
- `maxWidth` — Maximum width in pixels for compression (default: 1280)
- `storeBase64` — Return screenshot in base64 format in text content (image content is always returned directly)
- `fullPage` — Store screenshot of the entire page (default: false)
- `savePng` — Save screenshot to system temporary directory for debugging (default: false, zero disk write by default)
- `saveToDisk` — Deprecated alias for savePng; still accepted but hidden from the schema to keep it small. Prefer savePng.
- `som` — Overlay Set-of-Mark numbered badges on interactive elements before capturing the screenshot
- `highlight` — Deprecated alias for som; still accepted but hidden from the schema to keep it small. Prefer som.
- `targetIndex` — Compact 1-based numeric index of target element from chrome_read_dom to crop and capture only this specific region of interest
- `padding` — Padding in pixels to expand around targetIndex crop area (default: 0)
- `grid` — Overlay semi-transparent coordinate reference grid with dashed lines and (x, y) markers to eliminate visual estimation hallucination (default: false)
- `expandSearchArea` — For small elements (< 100x100), adaptively expand the crop bounding box to preserve surrounding headers and text context (default: true)
- `format:png|jpeg|webp` — Image output format: webp (default, high compression for LLM), jpeg, or png
- `quality` — Image compression quality from 0 to 100 for webp/jpeg formats (default: 80)
- `sessionId` — Optional session identifier to bind affinity to a specific tab context

### `chrome_scroll`

Physically scroll the page using CDP mouse wheel dispatch. Supports directional scrolling (up, down, left, right) by pixel distance or full/fractional pages.

- `direction:up|down|left|right` — Direction to scroll (default: "down")
- `amount` — Number of pixels to scroll (e.g. 500). Takes precedence over pages if both are provided.
- `pages` — Number of viewport pages to scroll (e.g. 1 for full page, 0.5 for half page). Default is 1 if amount is omitted.
- `index` — Target element index (from chrome_read_dom) to scroll. When provided, moves cursor to element and scrolls its container.
- `coordinate` — Target coordinates to dispatch wheel event at: { x, y } object, [x, y] point, or [ymin, xmin, ymax, xmax] bounding box (defaults to center of viewport
- `tabId` — Target tab ID (optional, defaults to active tab)
- `windowId` — Target window ID (optional)
- `sessionId` — Session identifier for tab affinity

### `chrome_smart_scroll`

Intelligently detects and scrolls the most prominent scrollable container on the page, or targets a specific container by selector, ref, or coordinate with automatic progress calculation.

- `tabId` — Target tab ID (optional)
- `sessionId` — Session ID for tab affinity (optional)
- `direction:down|up|left|right` — Scroll direction (default: "down")
- `amount` — Scroll amount: number in pixels, "page" (viewport height), or "half_page" (default: "page")
- `selector` — Optional CSS selector of the scroll container to target
- `ref` — Optional 1-based numeric index of the scroll container to target
- `coordinate` — Optional coordinate to locate the scrollable container under pointer: { x, y } object, [x, y] point, or [ymin, xmin, ymax, xmax] bounding box
- `smooth` — Whether to use smooth scrolling behavior (default: true)
- `waitForSettle` — Wait for DOM and network activity to settle after scroll completes (default: true)
- `settleTimeoutMs` — Maximum settle wait timeout in ms (default: 1500)

### `chrome_scroll_to_text`

Scroll the page using CDP and TreeWalker semantic search to bring specific text into the center of the viewport.

- `text`（必填） — Target text string to search and scroll into view
- `tabId` — Target tab ID (optional)
- `windowId` — Target window ID (optional)
- `sessionId` — Optional session identifier to bind affinity to a specific tab context

### `chrome_console`

Capture console output from a browser tab. Supports snapshot mode (default; one-time capture with ~2s wait) and buffer mode (persistent per-tab buffer you can read/clear instantly without waiting).

- `url` — URL to navigate to and capture console from. If not provided, uses the current active tab
- `tabId` — Target an existing tab by ID (default: active tab).
- `windowId` — Target window ID to pick active tab when tabId is omitted.
- `background` — Do not activate tab/focus window when capturing via CDP. Default: true
- `includeExceptions` — Include uncaught exceptions in the output (default: true)
- `maxMessages` — Maximum number of console messages to capture in snapshot mode (default: 100). If limit is provided, it takes precedence.
- `mode:snapshot|buffer` — Console capture mode: snapshot (default; waits ~2s for messages) or buffer (persistent per-tab buffer; reads from memory instantly).
- `buffer` — Deprecated alias for mode="buffer". Prefer mode.
- `clear` — Buffer mode only: clear the buffered logs for this tab before reading (default: false). Use clearAfterRead instead to clear after reading (mcp-tools.j
- `clearAfterRead` — Buffer mode only: clear the buffered logs for this tab AFTER reading, to avoid duplicate messages on subsequent calls (default: false). This matches m
- `pattern` — Optional regex filter applied to message/exception text. Supports /pattern/flags syntax.
- `onlyErrors` — Only return error-level console messages (and exceptions when includeExceptions=true). Default: false.
- `limit` — Deprecated alias for maxMessages. Prefer maxMessages.


## 数据管理 / Data Management

### `chrome_history`

Retrieve and search browsing history from Chrome

- `text` — Text to search for in history URLs and titles. Leave empty to retrieve all history entries within the time range.
- `startTime` — Start time as a date string. Supports ISO format (e.g., "2023-10-01", "2023-10-01T14:30:00"), relative times (e.g., "1 day ago", "2 weeks ago", "3 mon
- `endTime` — End time as a date string. Supports ISO format (e.g., "2023-10-31", "2023-10-31T14:30:00"), relative times (e.g., "1 day ago", "2 weeks ago", "3 month
- `maxResults` — Maximum number of history entries to return. Use this to limit results for performance or to focus on the most relevant entries. (default: 100)
- `excludeCurrentTabs` — When set to true, filters out URLs that are currently open in any browser tab. Useful for finding pages you've visited but don't have open anymore. (d

### `chrome_bookmark_search`

Search Chrome bookmarks by title and URL

- `query` — Search query to match against bookmark titles and URLs. Leave empty to retrieve all bookmarks.
- `maxResults` — Maximum number of bookmarks to return (default: 50)
- `folderPath` — Optional folder path or ID to limit search to a specific bookmark folder. Can be a path string (e.g., "Work/Projects") or a folder ID.

### `chrome_bookmark_add`

Add a new bookmark to Chrome

- `url` — URL to bookmark. If not provided, uses the current active tab URL.
- `title` — Title for the bookmark. If not provided, uses the page title from the URL.
- `parentId` — Parent folder path or ID to add the bookmark to. Can be a path string (e.g., "Work/Projects") or a folder ID. If not provided, adds to the "Bookmarks 
- `createFolder` — Whether to create the parent folder if it does not exist (default: false)

### `chrome_bookmark_delete`

Delete a bookmark from Chrome

- `bookmarkId` — ID of the bookmark to delete. Either bookmarkId or url must be provided.
- `url` — URL of the bookmark to delete. Used if bookmarkId is not provided.
- `title` — Title of the bookmark to help with matching when deleting by URL.

### `chrome_tab_group_create`

Create a new tab group with specified tabs or add tabs to an existing group.

- `tabIds`（必填） — Array of tab IDs to add to the group
- `groupId` — Optional existing group ID to add tabs into
- `title` — Optional title label for the tab group
- `color:grey|blue|red|yellow|green|pink|purple|cyan|orange` — Optional color for the tab group
- `collapsed` — Whether the tab group should be collapsed (default: false)
- `windowId` — Target window ID (optional)

### `chrome_tab_group_update`

Update properties (title, color, collapsed state) of an existing tab group.

- `groupId`（必填） — The ID of the tab group to update
- `title` — New title for the tab group
- `color:grey|blue|red|yellow|green|pink|purple|cyan|orange` — New color for the tab group
- `collapsed` — Whether the group should be collapsed

### `chrome_tab_group_list`

List all open tab groups in the browser or within a specific window.

- `windowId` — Optional window ID to filter groups by
- `title` — Optional group title to filter by

### `chrome_tab_group_ungroup`

Remove one or more tabs from their current tab group.

- `tabIds`（必填） — Array of tab IDs to ungroup

### `chrome_tab_group_close`

Close all tabs in a tab group and delete the group.

- `groupId`（必填） — The ID of the tab group to close


## 其他工具 / Remaining tools

### `performance_start_trace`

Starts a performance trace recording on the selected page. Optionally reloads the page and/or auto-stops after a short duration.

- `reload` — Determines if, once tracing has started, the page should be automatically reloaded (ignore cache).
- `autoStop` — Determines if the trace should be automatically stopped (default false).
- `durationMs` — Auto-stop duration in milliseconds when autoStop is true (default 5000).

### `performance_stop_trace`

Stops the active performance trace recording on the selected page.

- `saveToDownloads` — Whether to save the trace as a JSON file in Downloads (default true).
- `filenamePrefix` — Optional filename prefix for the downloaded trace JSON.

### `performance_analyze_insight`

Provides a lightweight summary of the last recorded trace. For deep insights (CWV, breakdowns), integrate native-side DevTools trace engine.

- `insightName` — Optional insight name for future deep analysis (e.g., "DocumentLatency"). Currently informational only.
- `timeoutMs` — Timeout for deep analysis via native host (milliseconds). Default 60000. Increase for large traces.

### `chrome_network_request`

Send a network request from the browser with cookies and other browser context

- `url`（必填） — URL to send the request to
- `method` — HTTP method to use (default: GET)
- `headers` — Headers to include in the request
- `body` — Body of the request (for POST, PUT, etc.)
- `timeout` — Timeout in milliseconds (default: 30000)
- `formData` — Multipart/form-data descriptor. If provided, overrides body and builds FormData with optional file attachments. Shape: { fields?: Record<string,string
- `tabId` — Optional ID of the tab to execute the request within (defaults to active tab)
- `tabUrl` — Optional URL of the tab to execute the request within

### `chrome_network_capture`

Unified network capture tool. Use action="start" to begin capturing, action="stop" to end and retrieve results. Set needResponseBody=true to capture response bodies (uses Debugger API, may conflict with DevTools). Default mode uses webRequest API (lightweight, no debugger conflict, but no response body).

- `action:start|stop`（必填） — Action to perform: "start" begins capture, "stop" ends and returns results
- `needResponseBody` — When true, captures response body using Debugger API (default: false). Only use when you need to inspect response content.
- `url` — URL to capture network requests from. For action="start". If not provided, uses the current active tab.
- `maxCaptureTime` — Maximum capture time in milliseconds (default: 180000)
- `inactivityTimeout` — Stop after inactivity in milliseconds (default: 60000). Set 0 to disable.
- `includeStatic` — Include static resources like images/scripts/styles (default: false)

### `chrome_javascript`

Execute JavaScript code in a browser tab and return the result. Uses CDP Runtime.evaluate with awaitPromise and returnByValue; automatically falls back to chrome.scripting.executeScript if the debugger is busy. Output is sanitized (sensitive data redacted) and truncated by default.

- `code`（必填） — JavaScript code to execute. Runs inside an async function body, so top-level await and "return ..." are supported.
- `tabId` — Target tab ID. If omitted, uses the current active tab.
- `timeoutMs` — Execution timeout in milliseconds (default: 15000).
- `maxOutputBytes` — Maximum output size in bytes after sanitization (default: 51200). Output exceeding this limit will be truncated.

### `chrome_storage`

Read localStorage, sessionStorage, and cookies for the current tab. Cookies include HttpOnly entries that document.cookie cannot see.

- `types` — Which stores to read (default: all three)
- `filter` — Only return entries whose key or value contains this substring (case-insensitive)
- `limit` — Maximum entries returned per store (default 200)
- `includeHttpOnly` — Include HttpOnly cookies (default true). Their values are redacted (valueIncluded: false) regardless; set includeHttpOnly:false to drop the entries en
- `tabId` — Target tab ID (optional)
- `windowId` — Target window ID (optional)
- `sessionId` — Session ID for tab affinity (optional)

### `chrome_tool_docs`

Return compact parameter documentation for a category of BrowserClaw tools (navigate | perceive | act | observe | manage | crawl). Use when a workflow needs a tool that is not in the current profile view.

- `category:navigate|perceive|act|observe|manage|crawl`（必填） — Tool category to document

