export interface SearchResultItem {
  title: string;
  url: string;
  snippet: string;
  source: string;
  rank: number;
}

export interface SearchOptions {
  limit?: number;
  site?: string;
  timeoutMs?: number;
}

export interface SearchResult {
  query: string;
  results: SearchResultItem[];
  totalFound: number;
  evidence: {
    engineUsed: string;
    durationMs: number;
    resolvedUrlsCount: number;
  };
}
