# Project: mcp-chrome Modernization & browser-use Engine Integration

## Architecture
The `mcp-chrome` system is a pnpm monorepo consisting of:
1. `packages/shared` (`chrome-mcp-shared`): Shared TypeScript types, message protocols, tool definitions (`TOOL_SCHEMAS`), and security annotations.
2. `app/native-server` (`mcp-chrome-bridge`): Node.js native bridge application supporting:
   - MCP transports: Multi-session HTTP/SSE (`/sse`, `/messages`, `/mcp`) and stdio (`mcp-server-stdio`).
   - Chrome Native Messaging host / WebSocket bridge communicating with the Chrome extension.
   - Session Manager (`McpSessionManager`) providing isolated MCP protocol Server instances per client session.
3. `app/chrome-extension` (`chrome-mcp-server`): WXT-based Chrome extension providing:
   - Background service worker: CDP session manager, tool dispatcher, native messaging host connection, heartbeat/health check.
   - Content scripts: browser-use DOM indexing engine (`dom-indexer.ts`) performing 6-stage pruning, viewport visibility, hierarchical occlusion checking, and compact 1-based index assignment.
   - Popup UI: Connection status and controls.
4. `test/`: Automated E2E and integration test suites verifying communication stability, DOM pruning, index interactions, and batch pipelines.

## Feature Inventory
Every feature from the user request and survey is enumerated below with its assigned milestone:

| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | Multi-client HTTP/SSE Concurrency | `McpSessionManager` creates isolated `Server` instances per session/client; no singleton collisions between Claude Code, Hermes, etc. | M1 | ORIGINAL_REQUEST §R1 |
| 2 | ERR_HTTP_HEADERS_SENT Elimination | Proper Fastify `reply.hijack()` and defensive headers-sent checks before streaming raw SSE responses. | M1 | ORIGINAL_REQUEST §R1 |
| 3 | stdio Clean Termination (<1s) | stdio EOF/close listeners, parent PID watchdog, and force-exit timers ensuring zero zombie processes. | M1 | ORIGINAL_REQUEST §R1 |
| 4 | Chrome Extension Handshake Self-Healing | 2-way handshake, active 2s ping/pong, port conflict recovery, and HTTP `/ping` verification recovering in <3s. | M1 | ORIGINAL_REQUEST §R1 |
| 5 | MCP Tool Security Annotations | Comprehensive `annotations` (`readOnlyHint`, `destructiveHint`, `idempotentHint`, `openWorldHint`) across all MCP tools. | M1 | ORIGINAL_REQUEST §R1 |
| 6 | File Upload & file:// Protocol Support | CDP `DOM.setFileInputFiles` for file inputs (including hidden/dialog) and Windows file path normalization for `file://`. | M1 | ORIGINAL_REQUEST §R1 |
| 7 | Index-Based Element Interaction | Assign compact 1-based indices to interactive DOM elements; tools `chrome_interact_index` and `chrome_fill_index`. | M2 | ORIGINAL_REQUEST §R2 |
| 8 | DOM Pruning & Visibility Filtering | 6-stage pruning, viewport boundary check (1000px), containment culling, and occlusion filtering (>85% token reduction on 1000+ nodes). | M2 | ORIGINAL_REQUEST §R2 |
| 9 | Batch Action Execution Pipeline | `chrome_batch_actions` executing compound action lists with static/runtime page-change guards and partial failure reporting. | M2 | ORIGINAL_REQUEST §R2 |
| 10 | Structured Markdown & Visual Bounding Boxes | `chrome_get_markdown` clean content extraction and optional element bounding box visual overlay. | M2 | ORIGINAL_REQUEST §R2 |
| 11 | Monorepo Build & Typecheck Cleanliness | Filter out `@chrome-mcp/wasm-simd` from root `typecheck`; ensure `pnpm build` and `pnpm typecheck` exit with code 0. | M3 | ORIGINAL_REQUEST §R3 |
| 12 | Automated Unit & Integration Tests | Comprehensive automated tests for session manager, stdio shutdown, DOM pruning, batch actions, and tools (`pnpm test`). | M3 | ORIGINAL_REQUEST §R3 |
| 13 | Final E2E Acceptance & Adversarial Hardening | 100% pass of E2E opaque-box test suite (Tiers 1-4) plus Tier 5 adversarial edge-case hardening. | M4 | ORIGINAL_REQUEST Acceptance |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | Underlying Service Stability & Concurrency | Multi-session McpSessionManager, HTTP hijack fix, stdio <1s exit, extension self-healing handshake, tool annotations, file upload CDP handler | none | IN_PROGRESS |
| M2 | browser-use High-Efficiency Interaction Engine | Content script DOM pruner & indexer, `chrome_read_dom`, `chrome_interact_index`, `chrome_fill_index`, `chrome_batch_actions`, `chrome_get_markdown` | M1 | PLANNED |
| M3 | Monorepo Build, Typecheck & Automated Test Suites | Fix `pnpm typecheck` filter, configure root `pnpm test`, add unit and integration test suites for M1 & M2 | M1, M2 | PLANNED |
| M4 | Final E2E Verification & Adversarial Coverage Hardening | Run and pass 100% of E2E test suite (Tiers 1-4) published by E2E Testing Track + Tier 5 adversarial coverage hardening | M3, TEST_READY.md | PLANNED |

## Interface Contracts

### Session Management (`app/native-server/src/mcp/session-manager.ts`)
```typescript
export interface SessionTransport {
  sessionId: string;
  transport: Transport;
  server: Server;
  createdAt: number;
  lastActiveAt: number;
}

export class McpSessionManager {
  createSession(transport: Transport): Promise<{ sessionId: string; server: Server }>;
  getSession(sessionId: string): SessionTransport | undefined;
  closeSession(sessionId: string): Promise<void>;
  cleanupStaleSessions(maxIdleMs: number): void;
}
```

### browser-use DOM Indexer (`app/chrome-extension/entrypoints/content/dom-indexer.ts`)
```typescript
export interface IndexedElement {
  index: number;
  tagName: string;
  role?: string;
  text?: string;
  attributes: Record<string, string>;
  rect: { x: number; y: number; width: number; height: number };
  isVisible: boolean;
  isInteractive: boolean;
  backendNodeId?: number;
}

export interface PrunedDOMTreeResult {
  treeString: string;
  elementCount: number;
  interactiveCount: number;
  compressionRatio: number; // e.g. 0.88 = 88% reduction
  indexMap: Record<number, { selector?: string; backendNodeId?: number; frameId?: string }>;
}
```

### Batch Action Schema (`packages/shared/src/tools.ts`)
```typescript
export interface BatchActionItem {
  type: 'click' | 'fill' | 'hover' | 'scroll' | 'press_key' | 'wait';
  index?: number;
  text?: string;
  key?: string;
  x?: number;
  y?: number;
  durationMs?: number;
}

export interface BatchActionResult {
  success: boolean;
  completedActions: number;
  totalActions: number;
  results: Array<{ actionIndex: number; success: boolean; error?: string; output?: any }>;
  interruptedReason?: string;
}
```

## Code Layout
- `packages/shared/src/`:
  - `tools.ts`: Tool schemas with MCP annotations, including index & batch action tools.
  - `types.ts`: Shared data structures.
- `app/native-server/src/`:
  - `mcp/session-manager.ts`: Multi-session MCP server manager.
  - `mcp/mcp-server-stdio.ts`: stdio transport with clean exit hooks.
  - `server/index.ts`: Fastify HTTP/SSE routes with `reply.hijack()` and safe error streaming.
- `app/chrome-extension/`:
  - `entrypoints/content/dom-indexer.ts`: 6-stage DOM pruning, occlusion filtering, index assignment.
  - `entrypoints/background/tools/browser/`: browser-use tools (`read-dom.ts`, `interact-index.ts`, `batch-actions.ts`, `upload-file.ts`).
  - `entrypoints/background/native-host.ts`: 2-way handshake and self-healing.
- `test/`:
  - `e2e/`: Opaque-box E2E test suites (Tiers 1-4).
  - `integration/`: Multi-session concurrency, stdio exit, and DOM pruning benchmark tests.
