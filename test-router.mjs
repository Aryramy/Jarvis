import { selectModel } from './model-router.mjs';
import { routeRequest } from './route-request.mjs';

async function runRouterTests() {
  console.log('=== Model Router Tests (Section 41 & 42) ===\n');

  // Test 1: Normal route
  const normalRoute = await selectModel({ vision: false, reasoning: false });
  console.log('Normal Selected Model:      ', normalRoute.model, `($${normalRoute.estimatedCost})`);
  console.log('Normal Alternatives:        ', normalRoute.alternatives.map((a) => a.model).join(', '));
  if (!normalRoute.model || normalRoute.alternatives.length < 1) {
    throw new Error('Test 1 failed: Normal routing did not return model or alternatives.');
  }

  // Test 2: Reasoning route
  const reasoningRoute = await selectModel({ vision: false, reasoning: true });
  console.log('Reasoning Selected Model:   ', reasoningRoute.model, `($${reasoningRoute.estimatedCost})`);
  if (!reasoningRoute.capabilities.reasoning) {
    throw new Error('Test 2 failed: Selected reasoning model lacks reasoning capability.');
  }

  // Test 3: Vision route
  const visionRoute = await selectModel({ vision: true, reasoning: false });
  console.log('Vision Selected Model:      ', visionRoute.model, `($${visionRoute.estimatedCost})`);
  if (!visionRoute.capabilities.vision) {
    throw new Error('Test 3 failed: Selected vision model lacks vision capability.');
  }

  // Test 4: Vision + Reasoning route
  const dualRoute = await selectModel({ vision: true, reasoning: true });
  console.log('Dual Vision+Reasoning Model:', dualRoute.model, `($${dualRoute.estimatedCost})`);
  if (!dualRoute.capabilities.vision || !dualRoute.capabilities.reasoning) {
    throw new Error('Test 4 failed: Dual model lacks required vision or reasoning capabilities.');
  }

  console.log('\n=== Context-Aware Estimation Test (Section 42) ===');
  // Turn 1
  const turn1 = await routeRequest({
    text: 'What is Power BI?',
    contextMessages: [],
  });
  console.log('Turn 1 ("What is Power BI?"):');
  console.log('  Estimated Context Tokens: ', turn1.estimates.contextInputTokens);
  console.log('  Estimated Max Cost:       ', `$${turn1.estimates.estimatedMaxCostUSD}`);

  // Turn 2
  const turn2Messages = [
    { role: 'user', content: 'What is Power BI?' },
    { role: 'assistant', content: 'Power BI is an interactive data visualization software product developed by Microsoft with a primary focus on business intelligence.' },
  ];
  const turn2 = await routeRequest({
    text: 'Explain it more simply.',
    contextMessages: turn2Messages,
  });
  console.log('Turn 2 ("Explain it more simply"):');
  console.log('  Estimated Context Tokens: ', turn2.estimates.contextInputTokens);
  console.log('  Estimated Max Cost:       ', `$${turn2.estimates.estimatedMaxCostUSD}`);

  if (turn2.estimates.contextInputTokens <= turn1.estimates.contextInputTokens) {
    throw new Error('Context-aware estimation test failed: Turn 2 tokens did not increase over Turn 1.');
  }

  // Turn 3
  const turn3Messages = [
    ...turn2Messages,
    { role: 'user', content: 'Explain it more simply.' },
    { role: 'assistant', content: 'In simple words, it turns your raw spreadsheets and tables into colorful visual dashboards and charts.' },
  ];
  const turn3 = await routeRequest({
    text: 'Give me an example for an HR department.',
    contextMessages: turn3Messages,
  });
  console.log('Turn 3 ("Give me an HR example"):');
  console.log('  Estimated Context Tokens: ', turn3.estimates.contextInputTokens);
  console.log('  Estimated Max Cost:       ', `$${turn3.estimates.estimatedMaxCostUSD}`);

  if (turn3.estimates.contextInputTokens <= turn2.estimates.contextInputTokens) {
    throw new Error('Context-aware estimation test failed: Turn 3 tokens did not increase over Turn 2.');
  }

  console.log('\nALL ROUTER TESTS PASSED.');
}

runRouterTests().catch((e) => {
  console.error('Router Test Failed:', e.message);
  process.exit(1);
});
