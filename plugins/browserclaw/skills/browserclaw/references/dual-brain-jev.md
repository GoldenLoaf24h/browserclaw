# Dual-Brain Semantic Micro-Loop Reference (`chrome_act_toward_goal`)

This reference documents BrowserClaw's Fast/System 1 local autonomous loop powered by TypeSafe Jev with built-in heuristic fallback.

---

## 1. System Architecture

```
┌─ System 2: Macro Planner (Remote LLM) ──────────────────┐
│  High-level goal decomposition, multi-page strategy,    │
│  reasoning, creative text generation, macro supervision │
└────────────────────────────┬────────────────────────────┘
                             │  chrome_act_toward_goal { goal: "..." }
                             ▼
┌─ System 1: Semantic Micro-Loop (Local Native Server) ──┐
│  Perceive compact DOM → Decide via Jev / Heuristic     │
│  → Dispatch CDP action → Verify outcome (200-400ms/step)│
└────────────────────────────┬────────────────────────────┘
                             │  Returns: status ("done" | "escalate" | ...)
                             ▼
```

- **Speed**: Local IPC execution cuts per-step latency from 3–6s down to 200–400ms.
- **Cost**: Eliminates repetitive multi-turn remote LLM calls for deterministic micro-steps.
- **Privacy**: Only a compact DOM budget ($\le$250 lines, sensitive password/file fields scrubbed) is evaluated.

---

## 2. Parameter Contract

```json
{
  "goal": "Click on 'Electronics', then select 'Smartphones'",
  "tabId": 101,
  "maxSteps": 10,
  "timeoutMs": 90000,
  "confidenceThreshold": 0.55,
  "textHint": "Optional text to type if not clearly quoted in goal"
}
```

- `maxSteps`: Default 10. Maximum 60 in Jev mode; forced $\le 5$ in Heuristic mode.
- `timeoutMs`: Default 90,000ms (90s); hard cap 300,000ms (5 minutes).
- `confidenceThreshold`: Default 0.55. Actions below this threshold trigger instant escalation.

---

## 3. Three-Tier Degradation Ladder

1. **Tier 1 (TypeSafe Jev System One)**:
   - Evaluates 7 parallel structured questions against the compact DOM.
   - Requires `JEV_API_KEY` (or `TYPESAFE_API_KEY`).
2. **Tier 2 (Heuristic Rule Fallback)**:
   - Zero-dependency string tokenization, role weighting, and bigram matching.
   - Activates automatically when no API key is provided, or on 401 unauthenticated (session latched), 429 quota exhaustion, or network disconnect.
3. **Tier 3 (Macro Escalation to Caller LLM)**:
   - Immediately returns control to the primary LLM with structured diagnostic context.

---

## 4. Response Contract

```json
{
  "status": "done",
  "engine": "jev",
  "engineSwitched": false,
  "fallbackReason": null,
  "steps": [
    {
      "action": "click",
      "target": { "index": 4, "text": "Electronics", "role": "button" },
      "confidence": 0.92,
      "outcome": { "mutated": true, "urlChanged": false, "visualDiff": 0.12 }
    }
  ],
  "finalPage": { "url": "https://example.com/shop", "title": "Shop" },
  "currentElements": [...],
  "jevUsage": { "calls": 2, "inputTokens": 840, "estCostUsd": 0.000035 }
}
```

### Possible Statuses

- `"done"`: Goal successfully achieved (`goal_done >= 0.85` or heuristic coverage $\ge 0.80$).
- `"escalate"`: Low confidence, destructive action detected, or ambiguous decision. Caller LLM should resume with standard Tier 0 tools.
- `"stuck"`: 3 consecutive steps without DOM mutation, URL change, or visual change.
- `"blocked"`: Anti-bot challenge or captcha detected.
- `"max_steps"`: Reached `maxSteps` limit before completing goal.
- `"timeout"`: Execution time exceeded `timeoutMs`.

---

## 5. Escalation Guard Rules

The micro-loop immediately aborts and escalates back to System 2 when:

1. **Low Confidence**: `action confidence < 0.55` or `target confidence < 0.45`.
2. **Destructive Guard**: Detects actions matching protected keywords (`pay`, `delete`, `purchase`, `buy`, `submit`, `confirm`) or Jev `destructive >= 0.50`.
3. **Stuck Circuit-Breaker**: 3 consecutive unchanged steps ($mutated=false$, $urlChanged=false$, $visualDiff \le 0.01$).
4. **Ambiguous Input**: Typing required but text payload cannot be determined.
