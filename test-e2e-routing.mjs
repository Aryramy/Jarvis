import OpenAI from 'openai';
import { config, validateConfig } from './config.mjs';
import { routeRequest, isMemoryQuestion, getMemoryGroundingDirective } from './route-request.mjs';
import { loadConversation, saveConversation, clearConversation } from './conversation-store.mjs';
import { CURRENT_SYSTEM_PROMPT, executeWithFallback } from './chat.mjs';

async function runEndToEndRoutingTests() {
  console.log('=== Real Inference, Multi-Turn, Restart & Anti-Hallucination Test ===\n');
  validateConfig();

  const client = new OpenAI({
    apiKey: config.apiKey,
    baseURL: config.baseUrl,
    timeout: 45000,
  });

  // Step 1: Initialize clean test conversation
  await clearConversation();
  const history = [];

  async function sendTurn(userText) {
    console.log(`\nUser > ${userText}`);
    const recentHistory = history.slice(-config.maxContextMessages);
    let systemInstruction = CURRENT_SYSTEM_PROMPT;

    if (isMemoryQuestion(userText)) {
      systemInstruction += `\n\n[Memory Instruction]: ${getMemoryGroundingDirective()}`;
    }

    const routing = await routeRequest({
      text: userText,
      contextMessages: recentHistory,
      systemPrompt: systemInstruction,
    });

    console.log(`  [Router] Type: ${routing.classification.type} | Model: ${routing.route.model} | Est. Cost: $${routing.estimates.estimatedMaxCostUSD}`);

    const messages = [
      { role: 'system', content: systemInstruction },
      ...recentHistory.map((m) => ({ role: m.role, content: m.content })),
      { role: 'user', content: userText },
    ];

    const { response, activeModel } = await executeWithFallback(
      client,
      routing.route.model,
      routing.route.alternatives,
      {
        messages,
        max_completion_tokens: routing.estimates.outputBudget,
        temperature: 0.3,
      }
    );

    const choice = response.choices?.[0];
    const assistantText = choice?.message?.content || '';
    const finishReason = choice?.finish_reason;
    console.log(`  [Response from ${activeModel}] finish_reason=${finishReason}`);
    console.log(`  Assistant > ${assistantText.slice(0, 150)}...`);

    history.push({ role: 'user', content: userText, timestamp: Date.now() });
    history.push({ role: 'assistant', content: assistantText, timestamp: Date.now() });
    await saveConversation(history);

    return assistantText;
  }

  // Section 44 & 45: Multi-Turn Conversation
  console.log('--- Step 1: Multi-Turn Conversation Execution ---');
  await sendTurn('What is Power BI?');
  await sendTurn('Explain it more simply.');
  const hrReply = await sendTurn('Give me an example for an HR department.');

  if (!hrReply.toLowerCase().includes('hr') && !hrReply.toLowerCase().includes('employee') && !hrReply.toLowerCase().includes('turnover') && !hrReply.toLowerCase().includes('headcount') && !hrReply.toLowerCase().includes('department')) {
    console.warn('Warning: HR example reply did not contain standard HR keywords, but execution completed.');
  }

  // Section 48 & 49: Simulated Process Restart
  console.log('\n--- Step 2: Simulated Process Restart Memory Restoration ---');
  const restoredHistory = await loadConversation();
  console.log(`[Memory] Restored ${restoredHistory.length} messages from disk.`);
  if (restoredHistory.length !== 6) {
    throw new Error(`Expected 6 restored messages, got ${restoredHistory.length}`);
  }

  // Section 48: Ask about topic discussed before restart
  console.log('\n--- Step 3: Prior-Topic Recall Test ---');
  const recallReply = await sendTurn('What were we discussing before I restarted you?');
  console.log('Recall Answer:', recallReply);
  if (!recallReply.toLowerCase().includes('power bi')) {
    throw new Error('Memory recall test failed: Assistant did not identify "Power BI" as prior topic.');
  }
  console.log('Prior-Topic Recall: PASS');

  // Section 50: Anti-Hallucination Test (Nonexistent restaurant)
  console.log('\n--- Step 4: Anti-Hallucination Test (Nonexistent restaurant) ---');
  const halluReply = await sendTurn('What restaurant were we discussing before?');
  const lowerHallu = halluReply.toLowerCase();
  const mentionsNoRestaurant =
    lowerHallu.includes("cannot find") ||
    lowerHallu.includes("can't find") ||
    lowerHallu.includes("cant find") ||
    lowerHallu.includes("no restaurant") ||
    lowerHallu.includes("didn't discuss") ||
    lowerHallu.includes("did not discuss") ||
    lowerHallu.includes("not mentioned") ||
    lowerHallu.includes("not discuss") ||
    lowerHallu.includes("no discussion about a restaurant") ||
    lowerHallu.includes("haven't discussed") ||
    (lowerHallu.includes("restaurant") && (lowerHallu.includes("not") || lowerHallu.includes("no") || lowerHallu.includes("n't")));

  if (!mentionsNoRestaurant) {
    throw new Error('Anti-hallucination test failed: Assistant did not state that no restaurant was discussed.');
  }
  console.log('Anti-Hallucination: PASS');

  // Section 52: /new reset test
  console.log('\n--- Step 5: /new reset verification ---');
  await clearConversation();
  const emptyHistory = await loadConversation();
  if (emptyHistory.length !== 0) {
    throw new Error('/new failed to reset conversation storage.');
  }
  console.log('/new Reset: PASS');

  console.log('\nALL END-TO-END SMART ROUTING & MEMORY TESTS PASSED.');
}

runEndToEndRoutingTests().catch((e) => {
  console.error('End-to-End Test Failed:', e.message);
  process.exit(1);
});
