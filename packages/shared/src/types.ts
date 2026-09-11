export enum NativeMessageType {
  START = 'start',
  STARTED = 'started',
  STOP = 'stop',
  STOPPED = 'stopped',
  PING = 'ping',
  PONG = 'pong',
  ERROR = 'error',
  PROCESS_DATA = 'process_data',
  PROCESS_DATA_RESPONSE = 'process_data_response',
  CALL_TOOL = 'call_tool',
  CALL_TOOL_RESPONSE = 'call_tool_response',
  // Additional message types used in Chrome extension
  SERVER_STARTED = 'server_started',
  SERVER_STOPPED = 'server_stopped',
  ERROR_FROM_NATIVE_HOST = 'error_from_native_host',
  CONNECT_NATIVE = 'connectNative',
  ENSURE_NATIVE = 'ensure_native',
  PING_NATIVE = 'ping_native',
  DISCONNECT_NATIVE = 'disconnect_native',
}

export interface NativeMessage<P = any, E = any> {
  type?: NativeMessageType;
  responseToRequestId?: string;
  payload?: P;
  error?: E;
}

// ============================================================
// browser-use DOM Engine & Batch Pipeline Types
// ============================================================

export interface IndexedElement {
  index: number;
  tagName: string;
  role?: string;
  text?: string;
  value?: string;
  attributes: Record<string, string>;
  rect: { x: number; y: number; width: number; height: number };
  isInteractive: boolean;
  backendNodeId?: number;
  isOccluded?: boolean;
  occludedBy?: string;
  safeClickPoint?: { x: number; y: number };
}

export interface ScrollInfo {
  pages_up: number;
  pages_down: number;
  scroll_y?: number;
  total_height?: number;
  viewport_height?: number;
}

export interface PageAsset {
  /** 1-based, stable within one read_dom snapshot */
  index: number;
  kind: "img" | "canvas" | "video" | "bg-image";
  /** CSS-space viewport bbox (x,y relative to current scroll) */
  rect: { x: number; y: number; width: number; height: number };
  /** Resource URL when the asset has one (img src / bg-image url). Empty for canvas/video */
  src?: string;
  alt?: string;
}

export interface PrunedDOMTreeResult {
  treeString: string;
  elementCount: number;
  interactiveCount: number;
  compressionRatio: number;
  indexMap: Record<number, { selector?: string; backendNodeId?: number; frameId?: string; tagName?: string }>;
  indexedElements?: IndexedElement[];
  /** Visual assets on the page (img/canvas/video/CSS background images) with viewport geometry */
  assets?: PageAsset[];
  pages_up?: number;
  pages_down?: number;
  scrollInfo?: ScrollInfo;
}

export interface PageSettleResult {
  settled: boolean;
  durationMs: number;
  mutationsObserved: number;
}

export interface SessionTabAffinityContext {
  sessionId?: string;
  sessionContext?: string;
}

export interface BatchActionItem {
  type: 'click' | 'fill' | 'hover' | 'scroll' | 'press_key' | 'wait' | 'key' | 'fill_form' | 'assert' | 'extract';
  index?: number;
  ref?: string | number;
  selector?: string;
  // Absolute epoch-ms deadline: sleep until this instant before executing this action
  at?: number;
  text?: string;
  value?: string;
  key?: string;
  x?: number;
  y?: number;
  coordinate?: { x: number; y: number };
  fields?: FillFormField[];
  durationMs?: number;
  direction?: 'up' | 'down' | 'left' | 'right';
  amount?: number;
  clear?: boolean;
  waitForSettle?: boolean;
  settleTimeoutMs?: number;
  // For type: 'assert'
  expectedText?: string;
  condition?: 'contains' | 'equals' | 'visible' | 'not_visible';
  abortOnFailure?: boolean;
  // For type: 'extract'
  property?: 'text' | 'value' | 'attribute';
  attributeName?: string;
  variableName?: string;
}

export interface BatchActionResult {
  success: boolean;
  completedActions: number;
  totalActions: number;
  extractedData?: Record<string, string>;
  assertions?: Array<{ actionIndex: number; passed: boolean; condition?: string; error?: string }>;
  delta?: any;
  results: Array<{ actionIndex: number; success: boolean; error?: string; output?: any }>;
  interruptedReason?: string;
  settle?: PageSettleResult;
}

export interface AttachTabParams {
  tabId?: number;
  sessionId?: string;
  sessionContext?: string;
}

export interface DetachTabParams {
  tabId?: number;
  sessionId?: string;
  sessionContext?: string;
}

export interface FillFormField {
  ref?: string | number;
  index?: number;
  selector?: string;
  value?: string | number | boolean;
  text?: string;
  clear?: boolean;
}

export interface FillFormParams {
  fields: FillFormField[];
  tabId?: number;
  windowId?: number;
  waitForSettle?: boolean;
  settleTimeoutMs?: number;
  sessionId?: string;
  sessionContext?: string;
}

export interface UnifiedLocatorOptions {
  ref?: string | number;
  index?: number;
  selector?: string;
  selectorType?: 'css' | 'xpath';
  text?: string;
  targetText?: string;
  role?: string;
  coordinate?: { x: number; y: number };
  coordinates?: { x: number; y: number };
  /** Coordinate space of coordinate/coordinates: "viewport" (default) or "screenshot" (scale via last screenshot context) */
  coordinateSpace?: 'viewport' | 'screenshot';
}

export interface UnifiedLocatorResult {
  success: boolean;
  x: number;
  y: number;
  resolutionPath: 'ref' | 'selector' | 'text' | 'role' | 'coordinate';
  tagName?: string;
  text?: string;
  value?: string;
  frameId?: number;
  error?: string;
  warning?: string;
}
