# Pipelined Automation Reference (`chrome_batch_actions` & `chrome_form_pipeline`)

This reference documents BrowserClaw's pipelined execution engines for multi-step workflows, atomic assertions, and zero-RTT form filling.

---

## 1. `chrome_batch_actions`

Executes sequential browser interactions atomically inside a single MCP turn, eliminating multi-turn network latency.

### Action Types Reference

| Action    | Required Fields                       | Optional Fields                  | Description                                       |
| :-------- | :------------------------------------ | :------------------------------- | :------------------------------------------------ |
| `click`   | `index` or `selector` or `coordinate` | `button`, `modifiers`            | Physical mouse click (`isTrusted: true`)          |
| `fill`    | (`index` or `selector`) + `text`      | `pressEnter: true`               | Clears field, types text, dispatches input/change |
| `type`    | `text`                                | -                                | Raw keyboard text typing                          |
| `key`     | `key`                                 | `modifiers`                      | Key press (e.g. `Enter`, `Tab`, `Escape`)         |
| `wait`    | `duration` (ms)                       | -                                | Explicit pause between actions                    |
| `hover`   | `index` or `selector` or `coordinate` | -                                | Moves pointer over target                         |
| `select`  | (`index` or `selector`) + `value`     | -                                | Selects option from native dropdown               |
| `drag`    | `from` + `to`                         | `dnd: true` (HTML5 DnD)          | Pointer drag or native HTML5 Drag-and-Drop        |
| `assert`  | `selector` or `index` + `condition`   | `expectedText`, `abortOnFailure` | Validates DOM state mid-pipeline                  |
| `extract` | `selector` or `index` + `property`    | `variableName`, `attributeName`  | Extracts data directly to response payload        |

### Complete Example Pipeline

```json
{
  "tabId": 101,
  "actions": [
    { "type": "fill", "index": 2, "text": "flight from JFK to LHR" },
    { "type": "click", "index": 5 },
    {
      "type": "assert",
      "selector": ".results-container",
      "condition": "visible",
      "timeoutMs": 5000,
      "abortOnFailure": true
    },
    {
      "type": "extract",
      "selector": ".flight-price-lowest",
      "property": "text",
      "variableName": "lowestPrice"
    }
  ],
  "includeDelta": true,
  "captureNetwork": true
}
```

### Assert Conditions

- `visible`: Target element must be present in DOM and non-hidden (`offsetParent !== null`).
- `hidden`: Target element must be absent or hidden.
- `text_contains`: `innerText` must contain `expectedText`.
- `value_equals`: Input `value` must match `expectedText`.
- `not_empty`: Text or value must be non-empty.

### Inline Network Capture (`captureNetwork: true`)

When enabled, returns all HTTP requests, responses, status codes, and JSON API payloads initiated during the batch execution directly under `networkEvents`, removing the need for a separate `chrome_network_request` turn.

---

## 2. `chrome_form_pipeline`

Dedicated autonomous form filler for multi-step onboarding, surveys, checkout forms, and user profile updates.

```json
{
  "tabId": 101,
  "fields": [
    { "selector": "#full-name", "value": "Jane Doe", "type": "text" },
    { "selector": "#email", "value": "jane@example.com", "type": "text" },
    { "selector": "#role", "value": "developer", "type": "select" },
    { "selector": "#terms", "value": true, "type": "checkbox" }
  ],
  "submitSelector": "#submit-btn",
  "waitForNavigation": true,
  "timeoutMs": 15000
}
```

- **True Input Commitment**: Verifies native input state triggers framework change events (`React`, `Vue`, `Angular`).
- **Auto-Retry on Occlusion**: If a field is momentarily obscured by sticky headers or toasts, automatically scrolls into view and retries.
