import { describe, it, expect } from 'vitest';
import type { BatchActionItem, BatchActionResult } from 'chrome-mcp-shared';

describe('Batch Actions Assert & Extract Pipeline', () => {
  it('supports declaring assert and extract actions in BatchActionItem', () => {
    const assertAction: BatchActionItem = {
      type: 'assert',
      index: 1,
      expectedText: 'Success',
      condition: 'contains',
      abortOnFailure: true,
    };

    const extractAction: BatchActionItem = {
      type: 'extract',
      index: 2,
      property: 'text',
      variableName: 'orderId',
    };

    expect(assertAction.type).toBe('assert');
    expect(assertAction.expectedText).toBe('Success');
    expect(extractAction.type).toBe('extract');
    expect(extractAction.variableName).toBe('orderId');
  });

  it('verifies BatchActionResult includes extractedData and assertions', () => {
    const res: BatchActionResult = {
      success: true,
      completedActions: 2,
      totalActions: 2,
      extractedData: { orderId: 'ORD-12345' },
      assertions: [{ actionIndex: 0, passed: true, condition: 'contains' }],
      results: [
        { actionIndex: 0, success: true },
        { actionIndex: 1, success: true },
      ],
    };

    expect(res.extractedData?.orderId).toBe('ORD-12345');
    expect(res.assertions?.[0].passed).toBe(true);
  });
});
