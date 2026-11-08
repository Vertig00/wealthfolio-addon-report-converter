import type { SymbolSearchResult } from '@wealthfolio/addon-sdk';
import type { TransactionRecord } from '../domain/types';

export type SearchTicker = (query: string) => Promise<SymbolSearchResult[]>;

export interface TickerLookupInput {
  ticker: string;
  fallbackSymbol: string;
  instrumentName?: string;
  isin?: string;
  expectedCurrency?: string;
}

export type TickerResolutionStatus = 'unchanged' | 'resolved' | 'ambiguous' | 'not-found' | 'error';
export type TickerResolutionConfidence = 'exact' | 'name' | 'ticker' | 'fallback';

export interface TickerResolution {
  requestedTicker: string;
  fallbackSymbol: string;
  symbol: string;
  status: TickerResolutionStatus;
  confidence: TickerResolutionConfidence;
  query?: string;
  result?: SymbolSearchResult;
  candidateSymbols?: string[];
  error?: string;
}

export interface TickerResolutionSummary {
  checked: number;
  byTicker: Map<string, TickerResolution>;
  changes: TickerResolution[];
  ambiguous: TickerResolution[];
  notFound: TickerResolution[];
  failed: TickerResolution[];
}

export interface TickerResolutionOptions {
  concurrency?: number;
  timeoutMs?: number;
}

interface MarketExpectation {
  suffixes?: string[];
  currencies: string[];
  mics?: string[];
  requireNoSuffix?: boolean;
}

interface RankedCandidate {
  result: SymbolSearchResult;
  rank: number;
  confidence: TickerResolutionConfidence;
  query: string;
}

const searchCache = new Map<string, Promise<SymbolSearchResult[]>>();

export function clearTickerSearchCache(): void {
  searchCache.clear();
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function withTimeout<T>(promise: Promise<T>, timeoutMs?: number): Promise<T> {
  if (!timeoutMs || timeoutMs <= 0) return promise;
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Ticker search timed out after ${timeoutMs}ms`)), timeoutMs);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

function searchWithCache(searchTicker: SearchTicker, query: string, timeoutMs?: number): Promise<SymbolSearchResult[]> {
  const key = query.trim().toLowerCase();
  const cached = searchCache.get(key);
  if (cached) return cached;

  const result = withTimeout(searchTicker(query), timeoutMs).catch((error) => {
    searchCache.delete(key);
    throw error;
  });
  searchCache.set(key, result);
  return result;
}

function uniqueQueries(queries: Array<string | undefined>): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of queries) {
    const query = String(value || '').trim();
    const key = query.toLowerCase();
    if (!query || seen.has(key)) continue;
    seen.add(key);
    result.push(query);
  }
  return result;
}

function tickerBase(ticker: string): string {
  const value = ticker.trim().toUpperCase();
  const dot = value.lastIndexOf('.');
  if (dot > 0 && value.length - dot <= 4) return value.slice(0, dot);
  return value;
}

function normalizeSymbol(symbol: string): string {
  return String(symbol || '').trim().toUpperCase();
}

function normalizeName(value: string | undefined): string {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\b(sa|spolka|akcyjna|holding|group|inc|corp|corporation|company|co|ltd|limited|plc|ag|se|nv|etf|fund)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function namesMatch(left: string, right: string): boolean {
  if (!left || !right) return false;
  if (left === right) return left.length >= 2;
  if (Math.min(left.length, right.length) < 3) return false;
  return (
    left.startsWith(right + ' ') ||
    right.startsWith(left + ' ') ||
    left.includes(' ' + right + ' ') ||
    right.includes(' ' + left + ' ')
  );
}

function expectedMarket(fallbackSymbol: string, expectedCurrency?: string): MarketExpectation {
  const symbol = normalizeSymbol(fallbackSymbol);
  const currency = String(expectedCurrency || '').trim().toUpperCase();

  if (symbol.endsWith('.WA')) {
    return { suffixes: ['.WA'], currencies: ['PLN'], mics: ['XWAR', 'WSE', 'GPW'] };
  }
  if (symbol.endsWith('.PA')) {
    return { suffixes: ['.PA'], currencies: ['EUR'], mics: ['XPAR'] };
  }
  if (symbol.endsWith('.AS')) {
    return { suffixes: ['.AS'], currencies: ['EUR'], mics: ['XAMS'] };
  }
  if (symbol.endsWith('.L')) {
    return { suffixes: ['.L', '.IL'], currencies: ['GBP', 'GBX', 'USD', 'EUR'], mics: ['XLON'] };
  }
  if (symbol.endsWith('.DE')) {
    return { suffixes: ['.DE'], currencies: ['EUR'] };
  }
  if (symbol.includes('.')) {
    return { suffixes: [symbol.slice(symbol.lastIndexOf('.'))], currencies: currency ? [currency] : [] };
  }
  return { requireNoSuffix: true, currencies: ['USD'] };
}

function symbolMatchesMarket(result: SymbolSearchResult, expected: MarketExpectation): boolean {
  const symbol = normalizeSymbol(result.symbol);
  if (!symbol) return false;

  if (expected.requireNoSuffix) {
    if (symbol.includes('.')) return false;
  } else if (expected.suffixes?.length) {
    if (!expected.suffixes.some((suffix) => symbol.endsWith(suffix))) return false;
  }

  if (expected.currencies.length) {
    const resultCurrency = String(result.currency || '').trim().toUpperCase();
    if (resultCurrency && !expected.currencies.includes(resultCurrency)) return false;
  }

  if (expected.mics?.length && result.exchangeMic) {
    const mic = String(result.exchangeMic).trim().toUpperCase();
    if (!expected.mics.includes(mic)) return false;
  }

  return true;
}

function rankCandidate(
  result: SymbolSearchResult,
  input: TickerLookupInput,
  fallbackSymbol: string,
): { rank: number; confidence: TickerResolutionConfidence } {
  const rawBase = tickerBase(input.ticker);
  const fallbackBase = tickerBase(fallbackSymbol);
  const resultBase = tickerBase(result.symbol);

  // Never replace an explicit alias with the old report ticker.
  if (rawBase !== fallbackBase && resultBase === rawBase) {
    return { rank: 0, confidence: 'fallback' };
  }

  const instrumentName = normalizeName(input.instrumentName);
  const resultNames = [normalizeName(result.longName), normalizeName(result.shortName)].filter(Boolean);
  if (instrumentName && resultNames.some((name) => namesMatch(instrumentName, name))) {
    return { rank: 4, confidence: 'name' };
  }

  if (rawBase && resultBase && rawBase === resultBase) {
    return { rank: 2, confidence: 'ticker' };
  }

  return { rank: 0, confidence: 'fallback' };
}

function chooseCandidate(candidates: RankedCandidate[]): RankedCandidate | RankedCandidate[] | undefined {
  if (candidates.length === 0) return undefined;

  const bySymbol = new Map<string, RankedCandidate>();
  for (const candidate of candidates) {
    const symbol = normalizeSymbol(candidate.result.symbol);
    const previous = bySymbol.get(symbol);
    if (!previous || candidate.rank > previous.rank) bySymbol.set(symbol, candidate);
  }

  const ranked = Array.from(bySymbol.values()).sort((left, right) => {
    if (right.rank !== left.rank) return right.rank - left.rank;
    return (right.result.score || 0) - (left.result.score || 0);
  });

  const topRank = ranked[0].rank;
  const top = ranked.filter((candidate) => candidate.rank === topRank);
  return top.length > 1 ? top : ranked[0];
}

async function resolveOne(
  input: TickerLookupInput,
  searchTicker: SearchTicker,
  options: TickerResolutionOptions,
): Promise<TickerResolution> {
  const fallbackSymbol = normalizeSymbol(input.fallbackSymbol);
  const expected = expectedMarket(fallbackSymbol, input.expectedCurrency);
  const queries = uniqueQueries([
    input.isin,
    fallbackSymbol,
    tickerBase(input.ticker),
    input.instrumentName,
  ]);

  const candidates: RankedCandidate[] = [];
  let lastError: string | undefined;

  for (const query of queries) {
    let results: SymbolSearchResult[];
    try {
      results = await searchWithCache(searchTicker, query, options.timeoutMs);
    } catch (error) {
      lastError = errorMessage(error);
      continue;
    }

    const exact = results.find((result) => normalizeSymbol(result.symbol) === fallbackSymbol);
    if (exact) {
      return {
        requestedTicker: input.ticker,
        fallbackSymbol,
        symbol: fallbackSymbol,
        status: 'unchanged',
        confidence: 'exact',
        query,
        result: exact,
      };
    }

    for (const result of results) {
      if (!symbolMatchesMarket(result, expected)) continue;
      const ranked = rankCandidate(result, input, fallbackSymbol);
      if (ranked.rank > 0) {
        candidates.push({ result, rank: ranked.rank, confidence: ranked.confidence, query });
      }
    }
  }

  const chosen = chooseCandidate(candidates);
  if (Array.isArray(chosen)) {
    return {
      requestedTicker: input.ticker,
      fallbackSymbol,
      symbol: fallbackSymbol,
      status: 'ambiguous',
      confidence: 'fallback',
      query: chosen[0]?.query,
      candidateSymbols: chosen.map((candidate) => normalizeSymbol(candidate.result.symbol)),
    };
  }

  if (chosen) {
    const symbol = normalizeSymbol(chosen.result.symbol);
    return {
      requestedTicker: input.ticker,
      fallbackSymbol,
      symbol,
      status: symbol === fallbackSymbol ? 'unchanged' : 'resolved',
      confidence: chosen.confidence,
      query: chosen.query,
      result: chosen.result,
    };
  }

  if (lastError) {
    return {
      requestedTicker: input.ticker,
      fallbackSymbol,
      symbol: fallbackSymbol,
      status: 'error',
      confidence: 'fallback',
      error: lastError,
    };
  }

  return {
    requestedTicker: input.ticker,
    fallbackSymbol,
    symbol: fallbackSymbol,
    status: 'not-found',
    confidence: 'fallback',
  };
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let nextIndex = 0;
  const workerCount = Math.max(1, Math.min(concurrency, items.length));
  const workers = Array.from({ length: workerCount }, async () => {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await mapper(items[index]);
    }
  });
  await Promise.all(workers);
  return results;
}

export async function resolveTickerCandidates(
  inputs: TickerLookupInput[],
  searchTicker: SearchTicker,
  options: TickerResolutionOptions = {},
): Promise<TickerResolutionSummary> {
  const uniqueInputs = new Map<string, TickerLookupInput>();
  for (const input of inputs) {
    const ticker = String(input.ticker || '').trim();
    if (!ticker || uniqueInputs.has(ticker)) continue;
    uniqueInputs.set(ticker, { ...input, ticker });
  }

  const resolved = await mapWithConcurrency(
    Array.from(uniqueInputs.values()),
    options.concurrency ?? 4,
    (input) => resolveOne(input, searchTicker, options),
  );

  const byTicker = new Map<string, TickerResolution>();
  const changes: TickerResolution[] = [];
  const ambiguous: TickerResolution[] = [];
  const notFound: TickerResolution[] = [];
  const failed: TickerResolution[] = [];

  for (const resolution of resolved) {
    byTicker.set(resolution.requestedTicker, resolution);
    if (resolution.status === 'resolved') changes.push(resolution);
    else if (resolution.status === 'ambiguous') ambiguous.push(resolution);
    else if (resolution.status === 'not-found') notFound.push(resolution);
    else if (resolution.status === 'error') failed.push(resolution);
  }

  return {
    checked: resolved.length,
    byTicker,
    changes,
    ambiguous,
    notFound,
    failed,
  };
}

export function applyTickerResolutions(
  transactions: TransactionRecord[],
  resolutions: Map<string, TickerResolution>,
): TransactionRecord[] {
  let changed = false;
  const next = transactions.map((transaction) => {
    const ticker = String(transaction.ticker || '').trim();
    const resolution = resolutions.get(ticker);
    if (!resolution || resolution.status !== 'resolved' || resolution.symbol === resolution.fallbackSymbol) {
      return transaction;
    }

    changed = true;
    return {
      ...transaction,
      metadata: {
        ...(transaction.metadata || {}),
        resolvedSymbol: resolution.symbol,
        tickerResolution: {
          from: resolution.fallbackSymbol,
          to: resolution.symbol,
          confidence: resolution.confidence,
          query: resolution.query,
        },
      },
    };
  });

  return changed ? next : transactions;
}
