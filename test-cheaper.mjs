import OpenAI from 'openai';
import { config, validateConfig, getSafeStatus } from './config.mjs';
import { fetchLiveCatalog } from './model-catalog.mjs';

async function runConnectionTests() {
  console.log('=== TEST 1: Environment Validation ===');
  validateConfig();
  const status = getSafeStatus();
  console.log('API Key Configured:', status.apiKeyConfigured);
  console.log('Base URL:', status.baseUrl);
  console.log('Status: PASS\n');

  console.log('=== TEST 2: Live /v1/models Discovery ===');
  const models = await fetchLiveCatalog(true);
  console.log(`Live models discovered: ${models.length}`);
  if (models.length === 0) {
    throw new Error('No models discovered in catalog.');
  }
  console.log('Status: PASS\n');

  console.log('=== TEST 3: Catalog Metadata Inspection ===');
  const sampleWithPricing = models.find((m) => m.pricing && m.pricing.input_per_million != null);
  if (!sampleWithPricing) {
    throw new Error('No models expose valid pricing metadata.');
  }
  console.log('Sample Model ID:         ', sampleWithPricing.id);
  console.log('Sample Provider:         ', sampleWithPricing.provider);
  console.log('Input Price / M:         ', `$${sampleWithPricing.pricing.input_per_million}`);
  console.log('Output Price / M:        ', `$${sampleWithPricing.pricing.output_per_million}`);
  console.log('Capabilities:            ', JSON.stringify(sampleWithPricing.capabilities));
  console.log('Status: PASS\n');

  console.log('=== TEST 4: Live Hosted Inference with Model Fallback ===');
  const client = new OpenAI({
    apiKey: config.apiKey,
    baseURL: config.baseUrl,
    timeout: 30000,
  });

  const { selectModel } = await import('./model-router.mjs');
  const { executeWithFallback } = await import('./chat.mjs');

  const selection = await selectModel({ estimatedInputTokens: 50, estimatedOutputTokens: 20 });
  console.log(`Primary candidate: ${selection.model}`);
  console.log(`Fallback alternatives: ${selection.alternatives.map((a) => a.model).join(', ')}`);

  const { response, activeModel } = await executeWithFallback(
    client,
    selection.model,
    selection.alternatives,
    {
      messages: [{ role: 'user', content: 'Respond with exactly: PONG' }],
      max_tokens: 100,
    }
  );

  const choice = response.choices?.[0];
  const content = choice?.message?.content?.trim();
  const finishReason = choice?.finish_reason;
  console.log('Active Resolved Model:   ', activeModel);
  console.log('Assistant Response:      ', content);
  console.log('Finish Reason:           ', finishReason);
  console.log('Usage Tokens:            ', JSON.stringify(response.usage));

  if (!content) {
    throw new Error('Inference returned empty response content.');
  }
  console.log('Status: PASS\n');
  console.log('ALL CONNECTION TESTS PASSED.');
}

runConnectionTests().catch((e) => {
  console.error('Connection Test Failed:', e.message);
  process.exit(1);
});
