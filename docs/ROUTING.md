# Hosted Cheaper Inference Smart Routing & Persistent Memory (Phase 12.5)

## 1. Overview & Architecture

JARVIS integrates directly with **Hosted Cheaper Inference** (`https://api.cheaperinference.com/v1`) using standard environment-based authentication without any local proxy or OmniRoute installation.

```text
User Input
  ↓
Local Task Classifier (normal | reasoning | coding | vision)
  ↓
Context-Aware Token Estimator (full context window: system prompt + history + query)
  ↓
Live Model Catalog Discovery (GET /v1/models with 5-minute TTL cache)
  ↓
Capability & Endpoint Filtering (chat/completions, reasoning, vision)
  ↓
Cost Estimation & Optimization ((input_price * in_tokens + output_price * out_tokens) / 1M)
  ↓
Primary Lowest-Cost Eligible Model + 3 Fallback Candidates
  ↓
Hosted Cheaper Inference Execution (ranking: "discount")
  ↓
Dual Fallback Layers (JARVIS outer model fallback + Cheaper Inference inner supply fallback)
  ↓
Billing & Token Usage Telemetry Extraction
  ↓
Atomic Persistent Conversation Memory (data/conversation.json)
```

---

## 2. Configuration (`.env`)

Configure the following variables in your `.env` file (never commit this file):

```env
CHEAPERINFERENCE_API_KEY=your_api_key_here
CHEAPERINFERENCE_BASE_URL=https://api.cheaperinference.com/v1
MODEL_CATALOG_TTL_MS=300000
MAX_CONTEXT_MESSAGES=20
```

---

## 3. Running the Chat CLI

To start an interactive multi-turn chat session:

```bash
npm run chat
# or
node chat.mjs
```

### Supported In-Chat Commands:
- `/new` — Resets active memory, clears stored history, reinjects current system prompt, and starts a fresh conversation.
- `/exit` — Persists all conversation history to disk and exits cleanly.

---

## 4. How Routing Works

1. **Local Classification:** Every query is classified locally before sending to save latency and cost.
   - `coding` regex identifies code, languages, error traces, and code fences (coding implies `reasoning: true`).
   - `reasoning` regex identifies analytical, logic, and planning queries.
   - `vision` is activated when images are present.
2. **Adaptive Output Budgets:** Normal (2000), Reasoning (3000), Coding (5000), Vision (2500), Vision+Reasoning (3500).
3. **Context-Aware Estimation:** Input token cost is estimated using the **complete** context window to be sent (system prompt + retained history + user prompt), not merely the latest user prompt.
4. **Dynamic Model Discovery:** Uses live `/v1/models` catalog with in-memory TTL caching (5 minutes). Production model selection has **zero hard-coded models**.

---

## 5. Dual Fallback Architecture

- **JARVIS Model-Level Fallback (Outer Layer):** If the selected primary model fails due to 404, 408, 409, 425, 429, 5xx, or network issues, JARVIS automatically retries the request across candidate fallback models:
  `Primary Model ➔ Alternative 1 ➔ Alternative 2 ➔ Alternative 3`.
- **Cheaper Inference Provider-Level Fallback (Inner Layer):** Within each selected model, Cheaper Inference evaluates the cheapest eligible supply route (`ranking: "discount"`) and manages provider failovers transparently.

---

## 6. Persistent Memory & Anti-Hallucination

- **Atomic File Persistence:** History is stored in `data/conversation.json` using atomic temporary writes and file swaps.
- **Startup Protection:** Startup checks existing history and restores it without overwriting.
- **Current System Prompt Precedence:** The current system prompt in source code always takes precedence; old persisted system prompts are automatically discarded.
- **Memory Question Detector:** Detects questions about past conversations and injects grounding directives instructing the model to rely solely on supplied history and refuse to invent nonexistent facts.

---

## 7. Running Verification Tests

```bash
# 1. Test live API connection, discovery, and inference ping:
npm run test:connection

# 2. Test local task classification and adaptive budgeting:
npm run test:classifier

# 3. Test dynamic model selection and context-aware token growth:
npm run test:router

# 4. Test atomic memory storage, startup protection, and anti-hallucination:
npm run test:memory

# 5. Test full live multi-turn conversation and restart recovery:
npm run test:e2e
```
