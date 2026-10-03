import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import OpenAI from 'openai';
import { config, validateConfig } from './config.mjs';
import { routeRequest, isMemoryQuestion, getMemoryGroundingDirective } from './route-request.mjs';
import { loadConversation, saveConversation, clearConversation } from './conversation-store.mjs';

export const CURRENT_SYSTEM_PROMPT = `You are Jarvis3/Jaivi, a helpful, intelligent AI assistant.

Use the conversation history supplied to you when answering.

The supplied conversation history may include messages restored by the application from persistent storage after a previous process, terminal session, application restart, Antigravity restart, or computer restart.

Treat all supplied historical user and assistant messages as genuine accessible conversation memory.

When the user asks what was previously discussed, inspect the supplied history and answer from it.

Do not claim that you cannot remember previous sessions when relevant restored messages are present.

The underlying language model does not independently retain previous API calls; the Jarvis3 application provides memory by restoring and supplying prior messages.

Never invent previous memories that are not present in the supplied conversation history.

If relevant prior information does not exist in the supplied history, say that you cannot find it in the available conversation history.

Be accurate, helpful, appropriately concise, and do not fabricate facts.`;

const RETRYABLE_STATUS_CODES = new Set([404, 408, 409, 425, 429, 500, 502, 503, 504]);

export async function executeWithFallback(client, targetModel, alternatives, requestPayload) {
  const candidateModels = [targetModel, ...alternatives.map((a) => a.model)];

  let lastError = null;
  for (const model of candidateModels) {
    try {
      console.log(`[Router] Trying model: ${model}`);
      const payload = {
        ...requestPayload,
        model,
        ranking: 'discount',
      };

      const response = await client.chat.completions.create(payload);
      return { response, activeModel: model };
    } catch (err) {
      lastError = err;
      const statusCode = err.status || (err.response ? err.response.status : null);
      const isRetryable =
        !statusCode || RETRYABLE_STATUS_CODES.has(statusCode) || err.code === 'ECONNRESET' || err.code === 'ETIMEDOUT';

      console.warn(`[Router] Model failed: ${model} (${err.message})`);

      if (!isRetryable) {
        throw err; // Non-retryable error (e.g. 401 Unauthorized or bad parameters)
      }

      console.log('[Router] Trying fallback model...');
    }
  }

  throw new Error(`[Router] All model candidates failed. Last error: ${lastError?.message || 'Unknown error'}`);
}

export async function startChat() {
  validateConfig();

  const client = new OpenAI({
    apiKey: config.apiKey,
    baseURL: config.baseUrl,
    timeout: 45000,
  });

  console.log('=======================================================');
  console.log('                     JARVIS3 CHAT                      ');
  console.log('=======================================================');
  console.log('Commands:');
  console.log('  /new   - Reset and clear conversation history');
  console.log('  /exit  - Save conversation and exit cleanly');
  console.log('=======================================================\n');

  // Startup Memory Lifecycle (Section 25)
  const history = await loadConversation();
  if (history.length > 0) {
    console.log(`[Memory] Restored ${history.length} previous messages.\n`);
  } else {
    console.log(`[Memory] Initialized fresh conversation session.\n`);
  }

  const rl = readline.createInterface({ input, output });

  try {
    while (true) {
      const userInput = await rl.question('User > ');
      const trimmed = userInput.trim();

      if (!trimmed) continue;

      if (trimmed === '/exit') {
        await saveConversation(history);
        console.log('\n[Jarvis3] Conversation saved. Goodbye!\n');
        break;
      }

      if (trimmed === '/new') {
        await clearConversation();
        history.length = 0; // Clear active array
        console.log('\n[Memory] Conversation cleared.\n');
        continue;
      }

      // Build context window for routing (up to maxContextMessages)
      const recentHistory = history.slice(-config.maxContextMessages);
      let systemInstruction = CURRENT_SYSTEM_PROMPT;

      if (isMemoryQuestion(trimmed)) {
        systemInstruction += `\n\n[Memory Instruction]: ${getMemoryGroundingDirective()}`;
      }

      // Route request based on FULL context
      const routing = await routeRequest({
        text: trimmed,
        contextMessages: recentHistory,
        systemPrompt: systemInstruction,
      });

      // Display routing decision telemetry (Section 17)
      console.log('\n----------------- ROUTING DECISION -----------------');
      console.log(`Task Type:                       ${routing.classification.type.toUpperCase()}`);
      console.log(`Coding Required:                 ${routing.classification.coding}`);
      console.log(`Reasoning Required:              ${routing.classification.reasoning}`);
      console.log(`Vision Required:                 ${routing.classification.vision}`);
      console.log(`Selected Model:                  ${routing.route.model}`);
      console.log(`Catalog Provider:                ${routing.route.provider}`);
      console.log(`Estimated Context Input Tokens:  ${routing.estimates.contextInputTokens}`);
      console.log(`Estimated Output Budget:         ${routing.estimates.outputBudget}`);
      console.log(`Estimated Max Cost:              $${routing.estimates.estimatedMaxCostUSD}`);
      console.log(`Fallback Models:                 ${routing.route.alternatives.map((a) => a.model).join(', ') || 'None'}`);
      console.log('----------------------------------------------------\n');

      // Assemble API payload
      const messages = [
        { role: 'system', content: systemInstruction },
        ...recentHistory.map((m) => ({ role: m.role, content: m.content })),
        { role: 'user', content: trimmed },
      ];

      const requestPayload = {
        messages,
        max_completion_tokens: routing.estimates.outputBudget,
        temperature: 0.3,
        stream: false,
      };

      try {
        const { response, activeModel } = await executeWithFallback(
          client,
          routing.route.model,
          routing.route.alternatives,
          requestPayload
        );

        const choice = response.choices?.[0];
        const assistantText = choice?.message?.content || '';
        const finishReason = choice?.finish_reason || 'unknown';

        console.log(`\nAssistant > ${assistantText}\n`);

        if (finishReason === 'length') {
          console.warn('WARNING: Response reached the configured output limit.');
        }

        // Display usage & billing telemetry (Section 21)
        const usage = response.usage || {};
        const cheaperBilling = response.cheaper_inference?.billing;
        const actualCost = cheaperBilling?.billed_cost_usd ?? response.usage?.cost;
        const discount = cheaperBilling?.effective_discount;

        console.log('----------------- USAGE TELEMETRY ------------------');
        console.log(`Actual Model:                    ${activeModel}`);
        console.log(`Input Tokens:                    ${usage.prompt_tokens ?? 'N/A'}`);
        console.log(`Output Tokens:                   ${usage.completion_tokens ?? 'N/A'}`);
        console.log(`Total Tokens:                    ${usage.total_tokens ?? 'N/A'}`);
        console.log(`Finish Reason:                   ${finishReason}`);
        console.log(`Estimated Max Cost:              $${routing.estimates.estimatedMaxCostUSD}`);
        console.log(`Actual Billed Cost:              ${actualCost != null ? `$${actualCost}` : 'Not reported by provider'}`);
        if (discount) {
          console.log(`Effective Discount:              ${discount}%`);
        }
        console.log('----------------------------------------------------\n');

        // Persist completed turn
        history.push({ role: 'user', content: trimmed, timestamp: Date.now() });
        history.push({ role: 'assistant', content: assistantText, timestamp: Date.now() });
        await saveConversation(history);
      } catch (execErr) {
        console.error(`\n[Execution Error] ${execErr.message}\n`);
      }
    }
  } finally {
    rl.close();
  }
}

// Auto-run if executed directly as main script
if (process.argv[1] && process.argv[1].endsWith('chat.mjs')) {
  startChat().catch((e) => {
    console.error('Fatal Chat Error:', e.message);
    process.exit(1);
  });
}
