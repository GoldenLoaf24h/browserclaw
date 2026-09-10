/**
 * Mock Batch Action Execution Pipeline
 * Implements BatchActionItem & BatchActionResult contracts from PROJECT.md
 */

import { MockDOMEngine } from './mock-dom-engine.ts';

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

export class MockBatchPipeline {
  private domEngine: MockDOMEngine;

  constructor(domEngine: MockDOMEngine) {
    this.domEngine = domEngine;
  }

  async executeBatch(
    actions: BatchActionItem[],
    options: {
      initialUrl?: string;
      currentUrlGetter?: () => string;
      simulateNavigationAtStep?: number;
    } = {}
  ): Promise<BatchActionResult> {
    const totalActions = actions.length;
    const results: Array<{ actionIndex: number; success: boolean; error?: string; output?: any }> = [];
    let completedActions = 0;
    let interruptedReason: string | undefined;

    const initialUrl = options.initialUrl || 'https://example.com/app';

    for (let i = 0; i < actions.length; i++) {
      const action = actions[i];

      // Runtime Page-Drift Guard
      if (options.simulateNavigationAtStep !== undefined && i >= options.simulateNavigationAtStep) {
        interruptedReason = 'Runtime navigation/URL drift detected; subsequent actions aborted to prevent stale execution';
        break;
      }

      if (options.currentUrlGetter && options.currentUrlGetter() !== initialUrl) {
        interruptedReason = 'Runtime URL changed during batch execution; aborted';
        break;
      }

      // Check valid action type
      const validTypes = ['click', 'fill', 'hover', 'scroll', 'press_key', 'wait'];
      if (!validTypes.includes(action.type)) {
        interruptedReason = `Unsupported batch action type '${action.type}' at step ${i}`;
        results.push({ actionIndex: i, success: false, error: interruptedReason });
        break;
      }

      // Execute action
      try {
        if (action.type === 'wait') {
          const waitTime = action.durationMs ?? 10;
          if (waitTime > 0) {
            await new Promise((resolve) => setTimeout(resolve, Math.min(waitTime, 20))); // scale for test speed
          }
          results.push({ actionIndex: i, success: true, output: { waitedMs: waitTime } });
          completedActions++;
        } else if (action.type === 'click') {
          if (action.index === undefined) {
            throw new Error('Click action requires index parameter');
          }
          const clickRes = this.domEngine.interactIndex(action.index);
          if (!clickRes.success) {
            interruptedReason = clickRes.error;
            results.push({ actionIndex: i, success: false, error: clickRes.error });
            break;
          }
          results.push({ actionIndex: i, success: true, output: { clickedElement: clickRes.element?.tagName } });
          completedActions++;
        } else if (action.type === 'fill') {
          if (action.index === undefined) {
            throw new Error('Fill action requires index parameter');
          }
          const fillRes = this.domEngine.fillIndex(action.index, action.text || '');
          if (!fillRes.success) {
            interruptedReason = fillRes.error;
            results.push({ actionIndex: i, success: false, error: fillRes.error });
            break;
          }
          results.push({ actionIndex: i, success: true, output: { filledValue: fillRes.filledText } });
          completedActions++;
        } else if (action.type === 'hover' || action.type === 'scroll' || action.type === 'press_key') {
          results.push({ actionIndex: i, success: true, output: { actionType: action.type } });
          completedActions++;
        }
      } catch (err: any) {
        interruptedReason = err.message || 'Execution exception';
        results.push({ actionIndex: i, success: false, error: interruptedReason });
        break;
      }
    }

    return {
      success: completedActions === totalActions,
      completedActions,
      totalActions,
      results,
      interruptedReason,
    };
  }
}
