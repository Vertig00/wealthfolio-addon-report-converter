import { parseMBankReport } from './parser';
import { mapMBankSymbol, getMBankFallbackSymbol } from './symbol-map';
import { applyTickerResolutions, resolveTickerCandidates } from '../../market/ticker-resolver';
import type { TickerLookupInput } from '../../market/ticker-resolver';
import type { MBankSubtype } from './parser';

export interface MBankConversionResult {
  transactions: any[];
  firstError: string | null;
  warnings: string[];
  tickerResolution?: any;
}

export async function convertMBankFiles(
  selectedFiles: File[],
  subtype: MBankSubtype = 'emakler',
  market?: any,
  tr?: (key: string, vars?: Record<string, unknown>) => string,
): Promise<MBankConversionResult> {
  const mergedTransactions: any[] = [];
  const seenIds = new Set<string>();
  let firstError: string | null = null;
  const warnings: string[] = [];

  for (const f of selectedFiles) {
    const result = await parseMBankReport(f, subtype);
    if (result.error) {
      firstError = result.error;
      continue;
    }
    warnings.push(...result.warnings);
    for (const tx of result.transactions || []) {
      const id = String(tx.id || '');
      if (id && seenIds.has(id)) continue;
      if (id) seenIds.add(id);
      mergedTransactions.push(tx);
    }
  }

  let reportTransactions = mergedTransactions;
  let tickerResolution: any = null;

  const aliasChanges: Array<{ from: string; to: string }> = [];
  const seenAlias = new Set<string>();
  for (const tx of mergedTransactions) {
    const ticker = String(tx.ticker || '').trim();
    if (!ticker || seenAlias.has(ticker)) continue;
    seenAlias.add(ticker);
    const mapped = mapMBankSymbol(ticker);
    if (mapped && mapped !== ticker) aliasChanges.push({ from: ticker, to: mapped });
  }

  if (aliasChanges.length > 0) {
    tickerResolution = { checked: 0, changes: [], aliases: aliasChanges, unresolved: [], error: undefined };
  }

  if (market?.searchTicker && mergedTransactions.length > 0) {
    const inputsByTicker = new Map<string, TickerLookupInput>();
    for (const tx of mergedTransactions) {
      const ticker = String(tx.ticker || '').trim();
      if (!ticker || inputsByTicker.has(ticker)) continue;
      inputsByTicker.set(ticker, {
        ticker,
        fallbackSymbol: mapMBankSymbol(ticker) !== ticker
          ? mapMBankSymbol(ticker)
          : getMBankFallbackSymbol(ticker, String(tx.metadata?.market || ''), tx.currency),
        instrumentName: typeof tx.metadata?.instrument === 'string' ? tx.metadata.instrument : ticker,
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
          changes: resolution.changes.map((item: any) => ({ from: item.requestedTicker, to: item.symbol })),
          aliases: aliasChanges,
          unresolved: [...resolution.ambiguous, ...resolution.notFound, ...resolution.failed].map((item: any) => item.requestedTicker),
          error: resolution.failed.length > 0 && tr ? tr('tickerResolution.searchFailed', { count: resolution.failed.length }) : undefined,
        };
      } catch (error) {
        tickerResolution = {
          checked: inputsByTicker.size,
          changes: [],
          aliases: aliasChanges,
          unresolved: [],
          error: tr ? tr('tickerResolution.error', { message: error instanceof Error ? error.message : String(error) }) : String(error),
        };
      }
    }
  }

  return { transactions: reportTransactions, firstError, warnings, tickerResolution };
}
