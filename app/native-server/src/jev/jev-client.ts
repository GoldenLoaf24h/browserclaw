import {
  TypeSafeClient,
  choice,
  noul,
  score,
  AuthenticationError,
  RateLimitError,
  APITimeoutError,
  APIConnectionError,
  APIError,
  type SystemOneResult,
} from '@typesafe-ai/sdk';
import { JevState, JevPageState, JevHistoryItem, JevUsage, FallbackReason } from './types';

// 14 Built-in destructive keywords (Iron Rule §2.3)
export const DESTRUCTIVE_KEYWORDS: readonly string[] = [
  'pay',
  '支付',
  '付款',
  '删除',
  'delete',
  'purchase',
  'buy',
  'submit',
  '提交',
  '发送',
  'post',
  '发布',
  'confirm',
  '确认',
];

// Session-level latch for 401 Unauthorized (§4.2)
let isKeyInvalidLatched = false;

export function isSessionKeyInvalid(): boolean {
  return isKeyInvalidLatched;
}

export function latchInvalidKey(): void {
  isKeyInvalidLatched = true;
}

export function resetInvalidKeyLatch(): void {
  isKeyInvalidLatched = false;
}

/**
 * Filter out sensitive elements (password, file upload) from AX tree
 */
export function isSensitiveElement(line: string): boolean {
  const lower = line.toLowerCase();
  return (
    lower.includes('password') ||
    lower.includes('type="password"') ||
    lower.includes('type="file"') ||
    lower.includes('role="file"') ||
    /^\[\d+\]\s*(password|file)\b/.test(lower)
  );
}

/**
 * Build compact AX tree state conforming to §5.1 budget constraints:
 * <=250 lines, <=120 chars/line, <=24,000 total characters, sensitive stripped, recent 5 history.
 */
export function buildState(
  goal: string,
  tabUrl: string,
  tabTitle: string,
  treeLines: string[],
  history: JevHistoryItem[],
  pendingModal?: string,
): JevState {
  const cleanLines: string[] = [];
  for (const rawLine of treeLines) {
    if (cleanLines.length >= 250) break;
    const trimmed = rawLine.trim();
    if (!trimmed) continue;
    if (isSensitiveElement(trimmed)) continue;
    cleanLines.push(trimmed.slice(0, 120));
  }

  const state: JevState = {
    task: goal,
    page: {
      url: (tabUrl || '').slice(0, 200),
      title: (tabTitle || '').slice(0, 120),
    },
    elements: cleanLines,
    history: history.slice(-5),
    ...(pendingModal ? { pending_modal: pendingModal.slice(0, 120) } : {}),
  };

  // Enforce overall state character budget <= 24,000 chars
  while (JSON.stringify(state).length > 24000 && state.elements.length > 0) {
    state.elements.pop();
  }

  return state;
}

/**
 * Extract element numeric indices from AX tree element lines
 */
export function extractElementIndices(elements: string[]): string[] {
  const indices: string[] = [];
  for (const line of elements) {
    const match = line.match(/^\[(\d+)\]/);
    if (match && match[1] && !indices.includes(match[1])) {
      indices.push(match[1]);
    }
  }
  return indices;
}

/**
 * Build the 7 parallel System One questions conforming to §5.2
 */
export function buildQuestions(elements: string[], goal: string): Record<string, any> {
  const indices = extractElementIndices(elements);

  const elementSummaryMap = new Map<string, string>();
  for (const line of elements) {
    const match = line.match(/^\[(\d+)\]\s*(.+)$/);
    if (match) {
      const idx = match[1];
      const summary = match[2].slice(0, 60).trim();
      elementSummaryMap.set(idx, summary);
    }
  }

  const targetCriteria: Record<string, string | null> = {};
  for (const idx of indices) {
    targetCriteria[idx] = elementSummaryMap.get(idx) || null;
  }
  targetCriteria['none'] = 'No suitable matching element found on current viewport';

  return {
    action: choice('What is the next single browser action to advance toward the task goal?', {
      click: 'Click a button, link, checkbox, radio, tab, or interactive element',
      type: 'Enter or fill text into an input field or textarea',
      select: 'Select an option from a dropdown or select menu',
      scroll_down: 'Scroll down the page to reveal more content below',
      scroll_up: 'Scroll up the page to reveal content above',
      back: 'Navigate back to the previous page',
      wait: 'Wait for page content to load or changes to settle',
      done: 'The goal has been fully accomplished on the current page',
      escalate:
        'Cannot proceed, ambiguous options, destructive action needed, or requires user intervention',
    }),
    click_target: choice(
      'Which element index [N] should be clicked to advance toward the task goal?',
      targetCriteria,
    ),
    type_target: choice(
      'Which input or textarea element index [N] should receive text entry?',
      targetCriteria,
    ),
    select_target: choice(
      'Which dropdown or select element index [N] should be selected?',
      targetCriteria,
    ),
    goal_done: noul(
      'Has the overall task goal been completely and successfully achieved based on the current page state and history?',
    ),
    stuck: noul('Is the execution stuck in a loop with no progress or change across recent steps?'),
    destructive: noul(
      'Is the proposed action destructive or irreversible (e.g. payment, purchase, deletion, sending, posting, or placing an order)?',
    ),
  };
}

/**
 * Choice validation conforming to §5.5 (validate_choice)
 * Checks: choice in options, probabilities keys equal options, sum = 1 +/- 0.02, all in [0,1], winning choice has max prob.
 */
export function validateChoice(answer: any, expectedKeys: string[]): boolean {
  if (!answer || answer.type !== 'choice') return false;
  if (!expectedKeys.includes(answer.choice)) return false;
  if (!answer.probabilities || typeof answer.probabilities !== 'object') return false;

  const probKeys = Object.keys(answer.probabilities);
  if (probKeys.length !== expectedKeys.length) return false;
  for (const key of expectedKeys) {
    if (!(key in answer.probabilities)) return false;
  }

  let sum = 0;
  const winningProb = answer.probabilities[answer.choice];
  if (typeof winningProb !== 'number' || winningProb < 0 || winningProb > 1) return false;

  for (const key of probKeys) {
    const val = answer.probabilities[key];
    if (typeof val !== 'number' || isNaN(val) || val < 0 || val > 1) {
      return false;
    }
    if (val > winningProb + 0.0001) {
      return false; // winning choice must have maximum probability
    }
    sum += val;
  }

  if (Math.abs(sum - 1.0) > 0.02) {
    return false;
  }

  return true;
}

/**
 * Text payload extraction conforming to §5.4
 * Deterministic extraction without mini-LLM:
 * 1) Quotes in goal (English "" / '' or Chinese “”)
 * 2) textHint parameter
 * 3) Trailing phrase after 输入/搜索/type/enter/for
 * 4) Fails -> returns null
 */
export function extractTextPayload(goal: string, textHint?: string): string | null {
  if (!goal) return textHint?.trim() || null;

  // 1. Quoted segments
  const quoteMatch = goal.match(/["“'「‘]([^"”'」’]+)["”'」’]/);
  if (quoteMatch && quoteMatch[1].trim()) {
    return quoteMatch[1].trim();
  }

  // 2. textHint parameter
  if (textHint && textHint.trim()) {
    return textHint.trim();
  }

  // 3. Trailing phrase after keyword
  const trailingMatch = goal.match(/(?:输入|搜索|type|enter|for)\s*[:：]?\s*([^\s,，。;；\n]+)/i);
  if (trailingMatch && trailingMatch[1].trim()) {
    return trailingMatch[1].trim();
  }

  return null;
}

/**
 * Check if element text or label hits destructive keywords
 */
export function isDestructiveTarget(text: string): boolean {
  if (!text) return false;
  const lower = text.toLowerCase();
  return DESTRUCTIVE_KEYWORDS.some((kw) => lower.includes(kw.toLowerCase()));
}

/**
 * Top-3 probability distribution extraction conforming to §5.6
 */
export function getTop3Probabilities(
  probabilities: Record<string, number>,
): Record<string, number> {
  if (!probabilities) return {};
  const entries = Object.entries(probabilities);
  entries.sort((a, b) => b[1] - a[1]);
  const top3 = entries.slice(0, 3);
  const result: Record<string, number> = {};
  for (const [k, v] of top3) {
    result[k] = Math.round(v * 1000) / 1000;
  }
  return result;
}

export class JevClientWrapper {
  private client: TypeSafeClient | null = null;

  constructor(apiKey?: string) {
    const key = apiKey || process.env.TYPESAFE_API_KEY;
    if (key && key.trim()) {
      try {
        this.client = new TypeSafeClient({ apiKey: key.trim() });
      } catch (e) {
        this.client = null;
      }
    }
  }

  public isAvailable(): boolean {
    return Boolean(this.client && !isSessionKeyInvalid());
  }

  /**
   * Execute System One multi-question query with typed error handling
   */
  public async query(
    state: JevState,
    questions: Record<string, any>,
  ): Promise<{
    result: SystemOneResult<any> | null;
    errorReason: FallbackReason;
    rawError?: any;
  }> {
    if (!this.client || isSessionKeyInvalid()) {
      return {
        result: null,
        errorReason: isSessionKeyInvalid() ? 'invalid_key' : 'no_api_key',
      };
    }

    try {
      const response = await this.client.systemOne({
        state: state as any,
        questions,
      });
      return { result: response, errorReason: null };
    } catch (err: any) {
      if (err instanceof AuthenticationError || err?.status === 401) {
        latchInvalidKey();
        return { result: null, errorReason: 'invalid_key', rawError: err };
      }
      if (err instanceof RateLimitError || err?.status === 429) {
        return { result: null, errorReason: 'quota_exhausted', rawError: err };
      }
      if (
        err instanceof APITimeoutError ||
        err instanceof APIConnectionError ||
        err?.code === 'ECONNREFUSED' ||
        err?.code === 'ETIMEDOUT'
      ) {
        return { result: null, errorReason: 'network_error', rawError: err };
      }
      if (err instanceof APIError) {
        if (err.status === 401 || err.status === 403) {
          latchInvalidKey();
          return { result: null, errorReason: 'invalid_key', rawError: err };
        }
        if (err.status === 429) {
          return { result: null, errorReason: 'rate_limited', rawError: err };
        }
      }
      return { result: null, errorReason: 'network_error', rawError: err };
    }
  }

  /**
   * Score candidate dropdown options conforming to §2.3, §5.2, §5.3
   */
  public async scoreOptions(
    goal: string,
    options: Array<{ text: string; value: string }>,
  ): Promise<{
    bestIndex: number;
    bestOption: { text: string; value: string };
    confidence: number;
    score: number;
    usage?: { inputTokens: number };
  } | null> {
    if (!this.client || options.length === 0) return null;
    if (options.length === 1) {
      return {
        bestIndex: 0,
        bestOption: options[0],
        confidence: 1.0,
        score: 0,
        usage: { inputTokens: 0 },
      };
    }

    // When options exceed 10 (Score primitive capacity), shortlist candidates based on relevance to goal
    let candidateOptions = options;
    if (options.length > 10) {
      const goalLower = goal.toLowerCase();
      const scored = options.map((opt, idx) => {
        const text = `${opt.text} ${opt.value}`.toLowerCase();
        let scoreVal = 0;
        if (goalLower.includes(text) || text.includes(goalLower)) scoreVal += 5;
        for (const word of goalLower.split(/\s+/)) {
          if (word.length >= 2 && text.includes(word)) scoreVal += 2;
        }
        return { opt, idx, scoreVal };
      });
      scored.sort((a, b) => b.scoreVal - a.scoreVal);
      candidateOptions = scored.slice(0, 10).map((s) => s.opt);
    }

    const criteria = candidateOptions.map(
      (opt) => `${opt.text || opt.value || ''}`.trim() || 'Option',
    ) as [string, string, ...string[]];

    const scoreQuestion = score(
      `Rate how closely each option satisfies the selection goal: "${goal}"`,
      criteria,
    );

    const response = await this.query(
      {
        task: goal,
        page: { url: '', title: '' },
        elements: candidateOptions.map((o, i) => `[${i}] ${o.text} (${o.value})`),
        history: [],
      },
      { select_option: scoreQuestion },
    );

    if (!response.result?.answers?.select_option) {
      return null;
    }

    const answer = (response.result.answers as Record<string, any>).select_option;
    let maxProb = -1;
    let bestCandidateIndex = 0;
    const probs = answer.probabilities || {};

    for (let i = 0; i < candidateOptions.length; i++) {
      const p = probs[String(i)] ?? probs[i] ?? 0;
      if (p > maxProb) {
        maxProb = p;
        bestCandidateIndex = i;
      }
    }

    const bestOption = candidateOptions[bestCandidateIndex];
    const originalIndex = options.indexOf(bestOption);

    return {
      bestIndex: originalIndex >= 0 ? originalIndex : bestCandidateIndex,
      bestOption,
      confidence: answer.confidence ?? maxProb,
      score: answer.score ?? bestCandidateIndex,
      usage: {
        inputTokens: response.result.usage?.input_tokens || 0,
      },
    };
  }
}
