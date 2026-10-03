import { fetchLiveCatalog } from './model-catalog.mjs';

export async function selectModel({
  vision = false,
  reasoning = false,
  estimatedInputTokens = 1000,
  estimatedOutputTokens = 2000,
} = {}) {
  const catalog = await fetchLiveCatalog();

  if (!catalog || catalog.length === 0) {
    throw new Error('[ModelRouter] Model catalog is empty or unavailable.');
  }

  // Filter 1: Endpoint compatibility with chat completions
  let eligible = catalog.filter((m) => {
    return (
      m.endpoint === '/v1/chat/completions' ||
      (Array.isArray(m.supported_endpoints) && m.supported_endpoints.includes('/v1/chat/completions'))
    );
  });

  // Filter 2: Capability requirements
  if (vision) {
    eligible = eligible.filter((m) => m.capabilities.vision === true);
  }
  if (reasoning) {
    eligible = eligible.filter((m) => m.capabilities.reasoning === true);
  }

  // Filter 3: Reject models lacking valid numerical pricing
  eligible = eligible.filter((m) => {
    return (
      m.pricing &&
      typeof m.pricing.input_per_million === 'number' &&
      !isNaN(m.pricing.input_per_million) &&
      typeof m.pricing.output_per_million === 'number' &&
      !isNaN(m.pricing.output_per_million)
    );
  });

  // Fallback relaxation if no models matched strict filters
  if (eligible.length === 0) {
    console.warn('[ModelRouter] No models matched strict filters. Relaxing reasoning requirement for fallback.');
    eligible = catalog.filter((m) => {
      const isChat =
        m.endpoint === '/v1/chat/completions' ||
        (Array.isArray(m.supported_endpoints) && m.supported_endpoints.includes('/v1/chat/completions'));
      const matchesVision = vision ? m.capabilities.vision === true : true;
      const hasPricing = m.pricing && typeof m.pricing.input_per_million === 'number';
      return isChat && matchesVision && hasPricing;
    });
  }

  if (eligible.length === 0) {
    throw new Error(`[ModelRouter] No eligible chat models available for requirements: vision=${vision}, reasoning=${reasoning}`);
  }

  // Calculate cost estimation for each model:
  // (inputPrice * estimatedInputTokens + outputPrice * estimatedOutputTokens) / 1,000,000
  const pricedModels = eligible.map((m) => {
    const inputPrice = m.pricing.input_per_million;
    const outputPrice = m.pricing.output_per_million;
    const estimatedCost = (inputPrice * estimatedInputTokens + outputPrice * estimatedOutputTokens) / 1_000_000;

    return {
      model: m.id,
      provider: m.provider,
      owned_by: m.owned_by,
      pricing: m.pricing,
      capabilities: m.capabilities,
      context_length: m.context_length,
      estimatedCost: Number(estimatedCost.toFixed(6)),
    };
  });

  // Sort ascending by estimated cost
  pricedModels.sort((a, b) => a.estimatedCost - b.estimatedCost);

  const selected = pricedModels[0];
  const alternatives = pricedModels.slice(1, 4).map((alt) => ({
    model: alt.model,
    provider: alt.provider,
    estimatedCost: alt.estimatedCost,
  }));

  return {
    model: selected.model,
    provider: selected.provider,
    estimatedCost: selected.estimatedCost,
    capabilities: selected.capabilities,
    alternatives,
    allCandidates: pricedModels,
  };
}
