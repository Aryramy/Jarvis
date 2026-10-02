import { BrowserController } from '../browser/index.js';
import type { SearchOptions, SearchResult, SearchResultItem } from './types.js';

export class SearchEngine {
  private browser: BrowserController;
  private isOwnedBrowser: boolean = false;

  constructor(browser?: BrowserController) {
    if (browser) {
      this.browser = browser;
      this.isOwnedBrowser = false;
    } else {
      this.browser = new BrowserController();
      this.isOwnedBrowser = true;
    }
  }

  /**
   * Cleans up resources if this engine owns the browser instance.
   */
  async close(): Promise<void> {
    if (this.isOwnedBrowser) {
      await this.browser.close();
    }
  }

  /**
   * Formulates an optimized query string, appending site: operator when domain is specified.
   */
  formulateQuery(query: string, site?: string): string {
    const trimmed = query.trim();
    if (!site) {
      return trimmed;
    }
    const cleanSite = site.replace(/^https?:\/\//, '').replace(/\/.*$/, '').trim();
    if (trimmed.toLowerCase().includes(`site:${cleanSite.toLowerCase()}`)) {
      return trimmed;
    }
    return `${trimmed} site:${cleanSite}`;
  }

  /**
   * Executes web search with query formulation, ranking, and URL decoding.
   */
  async search(rawQuery: string, options: SearchOptions = {}): Promise<SearchResult> {
    const startTime = Date.now();
    const limit = options.limit ?? 5;
    const finalQuery = this.formulateQuery(rawQuery, options.site);

    let results: SearchResultItem[] = [];
    let engineUsed = 'bing-browser';

    try {
      results = await this.searchViaBing(finalQuery, limit);
    } catch {
      // Fallback to Wikipedia API if browser/Bing fails
      engineUsed = 'wikipedia-api';
      results = await this.searchViaWikipedia(finalQuery, limit);
    }

    const durationMs = Date.now() - startTime;

    return {
      query: finalQuery,
      results: results.slice(0, limit),
      totalFound: results.length,
      evidence: {
        engineUsed,
        durationMs,
        resolvedUrlsCount: results.length,
      },
    };
  }

  /**
   * Performs search via Bing on Playwright Chromium, extracting organic results and decoding URLs.
   */
  private async searchViaBing(query: string, limit: number): Promise<SearchResultItem[]> {
    if (!this.browser.getState().isInitialized) {
      await this.browser.initialize({ headless: true });
    }

    const searchUrl = `https://www.bing.com/search?q=${encodeURIComponent(query)}`;
    await this.browser.openUrl(searchUrl, { waitUntil: 'domcontentloaded' });

    const page = this.browser.getActivePage();
    // Allow brief render of search result cards
    await page.waitForSelector('#b_results .b_algo', { timeout: 6000 }).catch(() => null);

    const rawItems = await page.evaluate((maxItems) => {
      const items: Array<{ title: string; href: string; snippet: string }> = [];
      const blocks = document.querySelectorAll('#b_results .b_algo');

      for (let i = 0; i < blocks.length && items.length < maxItems; i++) {
        const block = blocks[i];
        const a = block.querySelector('h2 a') as HTMLAnchorElement | null;
        const p = block.querySelector('.b_caption p, p');

        const title = a?.textContent?.trim() || '';
        const href = a?.href || '';
        const snippet = p?.textContent?.trim() || '';

        if (title && href) {
          items.push({ title, href, snippet });
        }
      }
      return items;
    }, limit);

    if (rawItems.length === 0) {
      throw new Error('[SearchEngine] Bing search yielded 0 items.');
    }

    return rawItems.map((item, index) => {
      const resolvedUrl = this.decodeRedirectUrl(item.href);
      return {
        title: item.title,
        url: resolvedUrl,
        snippet: item.snippet,
        source: this.extractDomain(resolvedUrl),
        rank: index + 1,
      };
    });
  }

  /**
   * Fast fallback for general encyclopedic queries via Wikipedia OpenSearch API.
   */
  private async searchViaWikipedia(query: string, limit: number): Promise<SearchResultItem[]> {
    const cleanQuery = query.replace(/site:[^\s]+/gi, '').trim();
    if (!cleanQuery) return [];

    const fetchWiki = async (q: string): Promise<SearchResultItem[]> => {
      try {
        const wikiUrl = `https://en.wikipedia.org/w/api.php?action=opensearch&search=${encodeURIComponent(q)}&limit=${limit}&format=json`;
        const response = await fetch(wikiUrl);
        if (!response.ok) return [];

        const data = (await response.json()) as [string, string[], string[], string[]];
        const titles = data[1] || [];
        const snippets = data[2] || [];
        const urls = data[3] || [];

        const results: SearchResultItem[] = [];
        for (let i = 0; i < titles.length && i < limit; i++) {
          results.push({
            title: titles[i],
            url: urls[i],
            snippet: snippets[i] || `Wikipedia entry for ${titles[i]}`,
            source: 'en.wikipedia.org',
            rank: i + 1,
          });
        }
        return results;
      } catch {
        return [];
      }
    };

    let items = await fetchWiki(cleanQuery);
    if (items.length === 0 && cleanQuery.includes(' ')) {
      // Fall back to primary subject term
      const primaryTerm = cleanQuery.split(/\s+/)[0];
      if (primaryTerm && primaryTerm.length > 2) {
        items = await fetchWiki(primaryTerm);
      }
    }

    return items;
  }

  /**
   * Decodes Bing tracking links (extracts destination from base64 u parameter)
   * or DuckDuckGo uddg parameter.
   */
  decodeRedirectUrl(rawHref: string): string {
    if (!rawHref) return '';
    try {
      const parsed = new URL(rawHref);

      // Bing tracking URL: u=a1<base64>
      const uParam = parsed.searchParams.get('u');
      if (uParam && uParam.startsWith('a1')) {
        const base64Str = uParam.slice(2);
        const decoded = Buffer.from(base64Str, 'base64').toString('utf-8');
        if (decoded.startsWith('http')) {
          return decoded;
        }
      }

      // DuckDuckGo tracking URL: uddg=<url-encoded>
      const uddgParam = parsed.searchParams.get('uddg');
      if (uddgParam) {
        return decodeURIComponent(uddgParam);
      }

      return rawHref;
    } catch {
      return rawHref;
    }
  }

  /**
   * Extracts hostname domain from a URL.
   */
  private extractDomain(url: string): string {
    try {
      return new URL(url).hostname;
    } catch {
      return '';
    }
  }
}
