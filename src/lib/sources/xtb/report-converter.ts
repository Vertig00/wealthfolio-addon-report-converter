import { parseXTBReport } from './parser';
import { mapXTBSymbol } from './parser';
import { applyTickerResolutions, resolveTickerCandidates } from '../../market/ticker-resolver';
import type { TickerLookupInput } from '../../market/ticker-resolver';

export interface TickerResolutionView {
  checked: number;
  changes: Array<{ from: string; to: string }>;
  aliases: Array<{ from: string; to: string }>;
  unresolved: string[];
  error?: string;
}

export interface XtbConversionResult {
  transactions: any[];
  tickerResolution: TickerResolutionView | null;
  firstError: string | null;
}

export async function convertXTBFiles(
  selectedFiles: File[],
  mode: 'initial' | 'update',
  market: any,
  tr: (key: string, vars?: Record<string, unknown>) => string,
): Promise<XtbConversionResult> {
  const mergedTransactions: any[] = [];
  const seenIds = new Set<string>();
  let firstError: string | null = null;

  for (const f of selectedFiles) {
    const xtbResult = await parseXTBReport(f, mode);
    if (xtbResult.error) {
      firstError = xtbResult.error;
      continue;
    }
    for (const tx of xtbResult.transactions || []) {
      const id = String(tx.id || '');
      if (id && seenIds.has(id)) continue;
      if (id) seenIds.add(id);
      mergedTransactions.push(tx);
    }
  }

  let reportTransactions = mergedTransactions;

  const aliasChanges: Array<{ from: string; to: string }> = [];
  const seenAlias = new Set<string>();
  for (const tx of mergedTransactions) {
    const ticker = String(tx.ticker || '').trim();
    if (!ticker || seenAlias.has(ticker)) continue;
    seenAlias.add(ticker);
    const mapped = mapXTBSymbol(ticker);
    if (mapped !== ticker) aliasChanges.push({ from: ticker, to: mapped });
  }

  let tickerResolution: TickerResolutionView | null =
    aliasChanges.length > 0
      ? { checked: 0, changes: [], aliases: aliasChanges, unresolved: [], error: undefined }
      : null;

  if (market?.searchTicker && mergedTransactions.length > 0) {
    const inputsByTicker = new Map<string, TickerLookupInput>();
    for (const tx of mergedTransactions) {
      const ticker = String(tx.ticker || '').trim();
      if (!ticker || ticker.startsWith('$CASH') || inputsByTicker.has(ticker)) continue;
      inputsByTicker.set(ticker, {
        ticker,
        fallbackSymbol: mapXTBSymbol(ticker),
        instrumentName: typeof tx.metadata?.instrument === 'string' ? tx.metadata.instrument : undefined,
        isin: tx.isin,
        expectedCurrency: tx.currency,
      });
    }

    if (inputsByTicker.size > 0) {
      try {
        const resolution = await resolveTickerCandidates(
          Array.from(inputsByTicker.values()),
          (query: string) => market.searchTicker(query),
        );
        reportTransactions = applyTickerResolutions(mergedTransactions, resolution.byTicker);
        tickerResolution = {
          checked: resolution.checked,
          changes: resolution.changes.map((item) => ({ from: item.requestedTicker, to: item.symbol })),
          aliases: aliasChanges,
          unresolved: [...resolution.ambiguous, ...resolution.notFound, ...resolution.failed].map((item) => item.requestedTicker),
          error: resolution.failed.length > 0 ? tr('tickerResolution.searchFailed', { count: resolution.failed.length }) : undefined,
        };
      } catch (error) {
        tickerResolution = {
          checked: inputsByTicker.size,
          changes: [],
          aliases: aliasChanges,
          unresolved: [],
          error: tr('tickerResolution.error', { message: error instanceof Error ? error.message : String(error) }),
        };
      }
    }
  }

  return { transactions: reportTransactions, tickerResolution, firstError };
}
