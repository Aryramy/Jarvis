import { config, validateConfig } from './config.mjs';

let cachedCatalog = null;
let cacheExpiresAt = 0;

export async function fetchLiveCatalog(force = false) {
  validateConfig();
  const now = Date.now();

  if (!force && cachedCatalog && now < cacheExpiresAt) {
    return cachedCatalog;
  }

  try {
    const url = new URL(`${config.baseUrl}/models`);
    url.searchParams.set('type', 'text');
    url.searchParams.set('streaming', 'true');

    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      // If server returned 404 or unsupported params, retry without query params
      const fallbackUrl = `${config.baseUrl}/models`;
      const fallbackRes = await fetch(fallbackUrl, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
          Accept: 'application/json',
        },
      });

      if (!fallbackRes.ok) {
        throw new Error(`[ModelCatalog] /v1/models returned HTTP ${fallbackRes.status}: ${fallbackRes.statusText}`);
      }

      const fallbackData = await fallbackRes.json();
      return processAndCacheCatalog(fallbackData);
    }

    const data = await response.json();
    return processAndCacheCatalog(data);
  } catch (err) {
    // If refresh fails temporarily but a recent valid cached catalog exists, use it
    if (cachedCatalog && cachedCatalog.length > 0) {
      console.warn(`[ModelCatalog] Failed to refresh live catalog (${err.message}). Using recent cached catalog.`);
      return cachedCatalog;
    }
    throw new Error(`[ModelCatalog] Failed to discover models: ${err.message}`);
  }
}

function processAndCacheCatalog(rawResponse) {
  const rawList = Array.isArray(rawResponse?.data) ? rawResponse.data : [];

  const models = rawList.map((item) => {
    const capabilities = item.capabilities || {};
    const pricing = item.pricing || {};

    const inputPrice = pricing.input_per_million != null ? parseFloat(pricing.input_per_million) : null;
    const outputPrice = pricing.output_per_million != null ? parseFloat(pricing.output_per_million) : null;

    return {
      id: item.id,
      provider: item.provider || item.owned_by || 'Unknown',
      owned_by: item.owned_by || item.provider || 'Unknown',
      type: item.type || 'text',
      endpoint: item.endpoint || '/v1/chat/completions',
      supported_endpoints: Array.isArray(item.supported_endpoints)
        ? item.supported_endpoints
        : [item.endpoint || '/v1/chat/completions'],
      context_length: item.context_length || 128000,
      max_output_tokens: item.max_output_tokens || 4096,
      capabilities: {
        reasoning: Boolean(capabilities.reasoning),
        vision: Boolean(capabilities.vision),
        streaming: capabilities.streaming !== false,
      },
      pricing: {
        input_per_million: inputPrice,
        output_per_million: outputPrice,
        discount_percent: pricing.discount_percent ? parseFloat(pricing.discount_percent) : 0,
      },
    };
  });

  cachedCatalog = models;
  cacheExpiresAt = Date.now() + config.catalogTtlMs;
  return models;
}

export function getCachedCatalog() {
  return cachedCatalog;
}

export function clearCatalogCache() {
  cachedCatalog = null;
  cacheExpiresAt = 0;
}
