/**
 * Oracle Evaluators & Specification Derivations
 * Authoritative sources: PROJECT.md & ORIGINAL_REQUEST.md
 */

import { type MockDOMNode, countTotalNodes } from './dom-samples.ts';

export interface ExpectedIndexRule {
  minInteractiveCount: number;
  expectedSequentialStart: 1;
}

/**
 * Validates DOM Pruning Compression Ratio according to Acceptance Criteria:
 * "针对包含超过 1000 个 DOM 节点的复杂网页进行快照提取测试，输出的交互元素树相比原始 HTML 缩减超过 85% 以上，且不丢失任何可见交互按钮或输入框。"
 */
export function validateDOMCompression(originalNodes: number, prunedElements: number): {
  compressionRatio: number;
  passesCriterion: boolean;
} {
  const compressionRatio = (originalNodes - prunedElements) / originalNodes;
  return {
    compressionRatio,
    passesCriterion: compressionRatio >= 0.85,
  };
}

/**
 * Validates MCP Tool Annotations according to Feature 5 specification:
 * - readOnlyHint: boolean
 * - destructiveHint: boolean
 * - idempotentHint: boolean
 * - openWorldHint: boolean
 */
export function validateToolAnnotations(tool: {
  name: string;
  annotations?: {
    readOnlyHint?: boolean;
    destructiveHint?: boolean;
    idempotentHint?: boolean;
    openWorldHint?: boolean;
  };
}): { valid: boolean; missingFields: string[] } {
  if (!tool.annotations) {
    return { valid: false, missingFields: ['annotations object is missing'] };
  }

  const missing: string[] = [];
  if (typeof tool.annotations.readOnlyHint !== 'boolean') missing.push('readOnlyHint');
  if (typeof tool.annotations.destructiveHint !== 'boolean') missing.push('destructiveHint');
  if (typeof tool.annotations.idempotentHint !== 'boolean') missing.push('idempotentHint');
  if (typeof tool.annotations.openWorldHint !== 'boolean') missing.push('openWorldHint');

  return {
    valid: missing.length === 0,
    missingFields: missing,
  };
}

/**
 * Derives expected execution result for batch actions pipeline.
 */
export function deriveBatchActionOutcome(actions: Array<{ type: string; [key: string]: any }>, availableIndices: Set<number>, pageDriftOccurredAt?: number) {
  let completed = 0;
  const results: Array<{ actionIndex: number; success: boolean; error?: string }> = [];
  let interruptedReason: string | undefined;

  for (let i = 0; i < actions.length; i++) {
    const action = actions[i];

    if (pageDriftOccurredAt !== undefined && i >= pageDriftOccurredAt) {
      interruptedReason = 'Runtime navigation/page drift detected; remaining actions aborted';
      break;
    }

    if (!['click', 'fill', 'hover', 'scroll', 'press_key', 'wait'].includes(action.type)) {
      interruptedReason = `Unsupported action type '${action.type}'`;
      results.push({ actionIndex: i, success: false, error: interruptedReason });
      break;
    }

    if (action.index !== undefined && !availableIndices.has(action.index)) {
      interruptedReason = `Target index ${action.index} not found or out of bounds`;
      results.push({ actionIndex: i, success: false, error: interruptedReason });
      break;
    }

    results.push({ actionIndex: i, success: true });
    completed++;
  }

  return {
    success: completed === actions.length,
    completedActions: completed,
    totalActions: actions.length,
    results,
    interruptedReason,
  };
}
