import { classifyTask, getAdaptiveOutputBudget } from './task-classifier.mjs';
import { selectModel } from './model-router.mjs';

const MEMORY_QUESTION_PATTERNS = [
  /what (were|was) (we|our) discussing/i,
  /what did we talk about/i,
  /what was (our|the) previous topic/i,
  /what did i ask (before|previously)/i,
  /before i (restarted|closed|left)/i,
  /do you remember/i,
  /what did we discuss/i,
  /recall our previous conversation/i,
  /what (topic|department|restaurant) (were|was) we/i,
];

/**
 * Detects whether a prompt asks about past conversation history.
 */
export function isMemoryQuestion(text = '') {
  return MEMORY_QUESTION_PATTERNS.some((p) => p.test(text));
}

/**
 * Returns a grounding directive for memory queries.
 * Never hardcodes topics, restaurants, or answers.
 */
export function getMemoryGroundingDirective() {
  return 'Answer this question by inspecting the prior conversation messages supplied in this request. These messages may have been restored from persistent application memory. Do not claim lack of memory if relevant history is present. If the requested information is absent from the supplied conversation history, clearly state that you cannot find it in the available conversation history. Never invent or hallucinate facts that are not present.';
}

/**
 * Estimates token count from the EXACT messages being sent in the model context window.
 * Formula: total character count / 4 with reasonable minimums.
 */
export function estimateMessagesTokens(messages = []) {
  if (!Array.isArray(messages) || messages.length === 0) {
    return 10;
  }

  let totalChars = 0;
  for (const msg of messages) {
    if (typeof msg.content === 'string') {
      totalChars += msg.content.length;
    } else if (Array.isArray(msg.content)) {
      for (const part of msg.content) {
        if (part && typeof part.text === 'string') {
          totalChars += part.text.length;
        }
      }
    }
  }

  // Safe heuristic: ~4 characters per token + 4 tokens overhead per message
  return Math.max(10, Math.ceil(totalChars / 4) + messages.length * 4);
}

/**
 * Full Request Router that integrates task classification, context estimation,
 * adaptive budgeting, and dynamic model selection.
 */
export async function routeRequest({
  text = '',
  hasImage = false,
  contextMessages = [],
  systemPrompt = '',
} = {}) {
  // 1. Classify task
  const classification = classifyTask(text, hasImage);

  // 2. Output budget
  const outputBudget = classification.outputBudget;

  // 3. Assemble target context window to estimate REAL context size
  const candidateContext = [];
  if (systemPrompt) {
    candidateContext.push({ role: 'system', content: systemPrompt });
  }
  if (Array.isArray(contextMessages) && contextMessages.length > 0) {
    candidateContext.push(...contextMessages);
  }
  candidateContext.push({ role: 'user', content: text });

  // 4. Estimate complete context tokens
  const contextInputTokens = estimateMessagesTokens(candidateContext);

  // 5. Select model based on capabilities and full context cost
  const route = await selectModel({
    vision: classification.vision,
    reasoning: classification.reasoning,
    estimatedInputTokens: contextInputTokens,
    estimatedOutputTokens: outputBudget,
  });

  return {
    classification,
    estimates: {
      contextInputTokens,
      outputBudget,
      estimatedMaxCostUSD: route.estimatedCost,
    },
    route: {
      model: route.model,
      provider: route.provider,
      estimatedCost: route.estimatedCost,
      alternatives: route.alternatives,
    },
    capabilities: route.capabilities,
    isMemoryQuery: isMemoryQuestion(text),
  };
}
