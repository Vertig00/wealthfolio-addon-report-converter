import { readXLSXFile } from '../../file-readers';
import type { TransactionRecord, OperationType } from '../../domain/types';
import type { ActivityImport } from '@wealthfolio/addon-sdk';
import { buildPositionMap, type PositionMap } from './position-map';
import { resolveFx, type DateFxEntry } from './fx';
import { computeSplitAdjustments, parseSplitRatio, splitSubtype, type SplitAdjustment } from './splits';
import { parseNumber, parseDate, determineCurrency } from './utils';

const OPERATION_MAP: Record<string, OperationType> = {
  'Stock purchase': 'BUY',
  'Stock sell': 'SELL',
  'IKE deposit': 'DEPOSIT',
  'Deposit': 'DEPOSIT',
  'Free funds interest': 'INTEREST',
  'Free funds interest tax': 'TAX_WITHHOLDING',
  'Dividend': 'DIVIDEND',
  'Withholding tax': 'TAX_WITHHOLDING',
  'Transfer': 'TRANSFER',
  'Subaccount transfer': 'TRANSFER',
  'Swap': 'FEE',
  'Commission': 'FEE',
  'Close trade': 'ADJUSTMENT',
  'Fractional shares': 'ADJUSTMENT',
  'Correction': 'ADJUSTMENT',
};

const WSE_SYMBOL_ALIASES: Record<string, string> = {
  CCC: 'MDV',
  K2H: 'FAB',
};

function mapWseBase(base: string): string {
  return WSE_SYMBOL_ALIASES[base.toUpperCase()] || base;
}

const XTB_SYMBOL_SUFFIX_MAP: Record<string, string> = {
  PL: 'WA',
  WA: 'WA',
  UK: 'L',
  NL: 'AS',
  FR: 'PA',
  US: '',
};

export function mapXTBSymbol(ticker: string): string {
  const dot = ticker.lastIndexOf('.');
  if (dot <= 0) return ticker;
  const suffix = ticker.slice(dot + 1).toUpperCase();
  const mappedSuffix = XTB_SYMBOL_SUFFIX_MAP[suffix];
  if (mappedSuffix === undefined) return ticker;
  const base = ticker.slice(0, dot);
  const mappedBase = suffix === 'PL' || suffix === 'WA' ? mapWseBase(base) : base;
  return mappedSuffix ? `${mappedBase}.${mappedSuffix}` : mappedBase;
}

export function getWealthfolioSymbol(tx: Pick<TransactionRecord, 'ticker' | 'metadata'>): string {
  const resolved = (tx.metadata as Record<string, any> | undefined)?.resolvedSymbol;
  if (typeof resolved === 'string' && resolved.trim() !== '') return resolved.trim();
  return mapXTBSymbol(tx.ticker || '');
}

function toWealthfolioActivityType(operationType: OperationType, amount?: number): string {
  if (operationType === 'TAX_WITHHOLDING') return 'TAX';
  if (operationType === 'TRANSFER') return (amount ?? 0) >= 0 ? 'TRANSFER_IN' : 'TRANSFER_OUT';
  return operationType;
}

function determineFXRate(currency: string, operationType: OperationType): number | undefined {
  if (currency !== 'USD') return undefined;
  if (operationType === 'BUY' || operationType === 'SELL') return 3.87;
  return undefined;
}

function parseQuantityAndPrice(comment: string): { quantity: number; price: number } {
  const priceMatch = comment.match(/@\s*([\d.]+)/);
  const price = priceMatch ? parseNumber(priceMatch[1]) : 0;
  const qtyMatch = comment.match(/([\d.]+)(?:\/[\d.]+)?\s*@/i);
  const quantity = qtyMatch ? parseNumber(qtyMatch[1]) : 0;
  return { quantity: quantity > 0 ? quantity : 1, price };
}

function isCashTransaction(tx: TransactionRecord): boolean {
  return tx.operationType === 'INTEREST' || tx.operationType === 'DEPOSIT' || tx.operationType === 'WITHDRAWAL' || String(tx.ticker || '').startsWith('$CASH');
}

function instrumentTypeFor(tx: TransactionRecord, category: string): string {
  return isCashTransaction(tx) ? '' : (category === 'ETF' ? 'ETF' : 'EQUITY');
}

function buildWealthfolioRow(tx: TransactionRecord, fee: number, fxRate: number | undefined, separator: string = ','): string {
  const dateStr = tx.date.toISOString().replace('Z', '').replace(/\.\d+$/, '');
  const symbol = getWealthfolioSymbol(tx);
  const category = String((tx.metadata as any)?.category || '').trim().toUpperCase();
  const instrumentType = instrumentTypeFor(tx, category);
  let qty = '';
  const act = toWealthfolioActivityType(tx.operationType, tx.amount);
  let uPrice = '';
  const curr = tx.currency;
  const feeVal = String(fee);
  let amt = '';
  const fx = fxRate !== undefined ? String(fxRate) : '';
  const sub = String((tx.metadata as any)?.subtype || '');
  const comm = tx.description || '';

  if (tx.operationType === 'BUY' || tx.operationType === 'SELL') {
    qty = tx.quantity !== undefined ? String(tx.quantity) : '';
    uPrice = tx.price !== undefined ? String(tx.price) : '';
  } else if (tx.operationType === 'INTEREST' || tx.operationType === 'DEPOSIT' || tx.operationType === 'WITHDRAWAL') {
    qty = '1';
    uPrice = '1';
    amt = tx.amount !== undefined ? String(tx.amount) : '';
  } else if (tx.operationType === 'DIVIDEND') {
    qty = '1';
    uPrice = tx.amount !== undefined ? String(tx.amount) : '';
    amt = tx.amount !== undefined ? String(tx.amount) : '';
  } else {
    amt = tx.amount !== undefined ? String(tx.amount) : '';
  }

  return [dateStr, symbol, instrumentType, qty, act, uPrice, curr, feeVal, '0', amt, fx, sub, comm].join(separator);
}

export function buildWealthfolioCsv(transactions: TransactionRecord[], separator: string = ','): string {
  const header = ['date', 'symbol', 'instrumentType', 'quantity', 'activityType', 'unitPrice', 'currency', 'fee', 'tax', 'amount', 'fxRate', 'subtype', 'comment'].join(separator);
  const rows: string[] = [header];
  for (const tx of transactions) {
    rows.push(buildWealthfolioRow(tx, 0, tx.fxRate, separator));
  }
  return rows.join('\n');
}

export function toActivityImport(tx: TransactionRecord, accountId: string): ActivityImport {
  const category = String((tx.metadata as any)?.category || '').trim().toUpperCase();
  const isCash = isCashTransaction(tx);
  return {
    accountId,
    activityType: toWealthfolioActivityType(tx.operationType, tx.amount) as any,
    date: tx.date,
    symbol: getWealthfolioSymbol(tx),
    instrumentType: isCash ? undefined : (category === 'ETF' ? 'ETF' : 'EQUITY'),
    quantity: tx.quantity,
    unitPrice: tx.price,
    subtype: (tx.metadata as any)?.subtype,
    currency: tx.currency,
    fee: 0,
    tax: 0,
    amount: tx.operationType === 'BUY' || tx.operationType === 'SELL' ? (tx.quantity || 0) * (tx.price || 0) : tx.amount,
    fxRate: tx.fxRate,
    quoteMode: 'MARKET',
    comment: tx.description,
    sourceSystem: 'XTB',
    sourceRecordId: tx.id,
    forceImport: true,
    isValid: true,
    isDraft: false,
  } as unknown as ActivityImport;
}

export function parseXTBReport(file: File, mode: 'initial' | 'update' = 'initial'): Promise<{
  transactions: TransactionRecord[];
  wealthfolioCsv: string;
  dateFrom?: Date;
  dateTo?: Date;
  error?: string;
}> {
  return new Promise((resolve, reject) => {
    readXLSXFile(file).then(({ sheets, error }) => {
      if (error) {
        resolve({ transactions: [], wealthfolioCsv: '', error: 'Error reading XLSX file: ' + error });
        return;
      }

      const cashSheet = sheets.find((s: any) => s.name === 'Cash Operations');
      if (!cashSheet) {
        resolve({ transactions: [], wealthfolioCsv: '', error: 'Cash Operations sheet not found in XTB report' });
        return;
      }

      const openSheet = sheets.find((sh: any) => sh.name === 'Open Positions');
      const closedSheet = sheets.find((sh: any) => sh.name === 'Closed Positions');

      const positionMap: PositionMap = buildPositionMap(openSheet, closedSheet);

      const rows = cashSheet.rows;
      const derivedFxAccum = new Map<string, { amount: number; qtyPrice: number }>();
      for (let i = 5; i < rows.length; i++) {
        const row = rows[i];
        if (!row || row.length < 5) continue;
        const type = String(row[0] || '').trim();
        if (type !== 'Stock purchase' && type !== 'Stock sell') continue;
        const posId = String(row[9] || '').trim();
        if (!posId) continue;
        const comment = String(row[7] || '').trim();
        const parsed = parseQuantityAndPrice(comment);
        const qtyPrice = (parsed.quantity || 0) * (parsed.price || 0);
        const amount = Math.abs(parseNumber(row[5]));
        if (qtyPrice <= 0 || amount <= 0) continue;
        const acc = derivedFxAccum.get(posId) || { amount: 0, qtyPrice: 0 };
        acc.amount += amount;
        acc.qtyPrice += qtyPrice;
        derivedFxAccum.set(posId, acc);
      }
      const derivedFxByPosition = new Map<string, number>();
      derivedFxAccum.forEach((acc, posId) => {
        if (acc.qtyPrice > 0) derivedFxByPosition.set(posId, acc.amount / acc.qtyPrice);
      });

      // Per-date/per-currency FX observations from BUY/SELL rows, used as a fallback
      // for DIVIDEND/TAX_WITHHOLDING rows that have no position-specific FX.
      const dateFxList: DateFxEntry[] = [];
      const fxSumByCurrency = new Map<string, { sum: number; count: number }>();
      for (let i = 5; i < rows.length; i++) {
        const row = rows[i];
        if (!row || row.length < 5) continue;
        const type = String(row[0] || '').trim();
        if (type !== 'Stock purchase' && type !== 'Stock sell') continue;
        const ticker = String(row[2] || '').trim();
        const currency = determineCurrency(ticker, type === 'Stock purchase' ? 'BUY' : 'SELL');
        if (currency === 'PLN') continue;
        const comment = String(row[7] || '').trim();
        const parsed = parseQuantityAndPrice(comment);
        const native = (parsed.quantity || 0) * (parsed.price || 0);
        const pln = Math.abs(parseNumber(row[5]));
        if (native <= 0 || pln <= 0) continue;
        const fx = pln / native;
        dateFxList.push({ date: parseDate(row[4]).getTime(), currency, fx });
        const acc = fxSumByCurrency.get(currency) || { sum: 0, count: 0 };
        acc.sum += fx;
        acc.count += 1;
        fxSumByCurrency.set(currency, acc);
      }
      dateFxList.sort((a, b) => a.date - b.date);
      const avgFxByCurrency = new Map<string, number>();
      fxSumByCurrency.forEach((acc, cur) => {
        if (acc.count > 0) avgFxByCurrency.set(cur, acc.sum / acc.count);
      });

      const splitAdjustments = computeSplitAdjustments(rows);

      if (!rows || rows.length < 5) {
        resolve({ transactions: [], wealthfolioCsv: '', error: 'No data rows in Cash Operations sheet' });
        return;
      }

      const transactions: TransactionRecord[] = [];
      void mode;

      for (let i = 5; i < rows.length; i++) {
        const row = rows[i];
        if (!row || row.length < 5) continue;

        const type = String(row[0] || '').trim();
        if (type === '' || type === 'Total') continue;

        let operationType = OPERATION_MAP[type];
        if (!operationType) continue;
        if ((operationType === 'FEE' || operationType === 'ADJUSTMENT') && type !== 'Fractional shares' && Math.abs(parseNumber(row[5])) === 0) continue;

        const instrument = String(row[1] || '').trim();
        let ticker = String(row[2] || '').trim();
        let category = String(row[3] || '').trim();
        const positionId = String(row[9] || '').trim();
        if (!ticker && positionId && positionMap[positionId]) {
          ticker = positionMap[positionId].ticker;
        }
        if (!category) {
          if (positionId && positionMap[positionId]?.category) category = positionMap[positionId].category;
          else if (ticker && positionMap['ticker:' + ticker]?.category) category = positionMap['ticker:' + ticker].category;
        }
        const time = row[4];
        const amount = parseNumber(row[5]);
        const id = String(row[6] || '').trim();
        const comment = String(row[7] || '').trim();
        // Skip internal transfers between the main account and investment plans:
        // they are net-zero within a single Wealthfolio account and otherwise
        // trigger "incomplete transfer" warnings (same-account links are not
        // allowed). External transfers (if any) are still imported.
        if (operationType === 'TRANSFER' && /Transfer from \d+ to \d+/.test(comment)) continue;
        const product = String(row[8] || '').trim();
        const positionFx = positionId && positionMap[positionId] ? positionMap[positionId] : undefined;

        const splitRatio = type === 'Fractional shares' ? parseSplitRatio(comment) : undefined;
        if (splitRatio !== undefined) {
          const splitInfo = splitAdjustments.get(i);
          const splitCurrency = determineCurrency(ticker, 'SPLIT');
          const splitFx = splitCurrency === 'PLN'
            ? undefined
            : (derivedFxByPosition.get(positionId) ?? positionFx?.closeFx ?? positionFx?.openFx);
          const splitDate = parseDate(time);
          const splitId = id || `SPLIT-${i}`;

          transactions.push({
            id: splitId,
            sourceRow: i + 1,
            operationType: 'SPLIT',
            date: splitDate,
            currency: splitCurrency,
            quantity: splitInfo?.after,
            amount: splitRatio,
            ratio: splitRatio,
            fxRate: splitFx,
            description: comment,
            ticker,
            isin: undefined,
            metadata: {
              category,
              product,
              positionId,
              instrument,
              subtype: splitSubtype(splitRatio),
              splitRatio: comment,
            },
            rawData: {},
          } as any);

          if (splitInfo && splitInfo.sold > 0 && Math.abs(amount) > 0) {
            const fxForPrice = splitCurrency === 'PLN' ? 1 : (splitFx ?? 1);
            const soldPrice = Math.abs(amount) / fxForPrice / splitInfo.sold;
            transactions.push({
              id: `${splitId}-fractional-sell`,
              sourceRow: i + 1,
              operationType: 'SELL',
              date: splitDate,
              currency: splitCurrency,
              quantity: splitInfo.sold,
              price: soldPrice,
              amount: Math.abs(amount),
              fxRate: splitFx,
              fxRateSource: splitFx !== undefined
                ? (derivedFxByPosition.has(positionId) ? 'cash-operations' : 'closed-positions')
                : 'none',
              fxRateStatus: splitFx !== undefined
                ? (derivedFxByPosition.has(positionId) ? 'estimated' : 'verified')
                : (splitCurrency === 'PLN' ? 'verified' : 'missing'),
              description: `${comment} (fractional shares sold)`,
              ticker,
              isin: undefined,
              metadata: { category, product, positionId, instrument, generatedFromSplit: true },
              rawData: {},
            } as any);
          }

          continue;
        }

        let quantity: number | undefined;
        let price: number | undefined;
        let divPerShare = 0;
        let isDividendCorrection = false;

        if (operationType === 'BUY' || operationType === 'SELL') {
          const parsed = parseQuantityAndPrice(comment);
          quantity = parsed.quantity;
          price = parsed.price;
        } else if (operationType === 'DIVIDEND') {
          const perShareMatch = comment.match(/([\d.]+)\s*\/\s*SHR/i);
          divPerShare = perShareMatch ? parseNumber(perShareMatch[1]) : 0;
          // Negative-amount dividends are corrections/reversals; Wealthfolio imports
          // dividends as positive cash, so handle them as signed ADJUSTMENTs instead.
          if (amount < 0) isDividendCorrection = true;
          // quantity and price are finalised after FX resolution below
        } else {
          quantity = 1;
          price = 1;
        }

        const currency = determineCurrency(ticker, operationType);

        const fxResolved = resolveFx({
          currency,
          operationType,
          positionId,
          positionFx,
          derivedFxByPosition,
          dateFxList,
          avgFxByCurrency,
          time,
          parseDate,
          quantity,
          price,
          amount,
        });
        let fxRate = fxResolved.fxRate;
        let fxRateSource = fxResolved.fxRateSource;
        let fxRateStatus = fxResolved.fxRateStatus;

        if (operationType === 'DIVIDEND' && !isDividendCorrection) {
          const fx = fxRate ?? 1;
          if (divPerShare > 0) {
            quantity = Math.abs(amount) / (fx * divPerShare);
            price = divPerShare;
          } else {
            quantity = 1;
            price = Math.abs(amount) / fx;
          }
        }

        // Skip zero-amount dividends (no financial effect).
        if (operationType === 'DIVIDEND' && amount === 0) continue;

        // Compute the converted amount while operationType is still the original
        // (DIVIDEND) so negative corrections are divided by FX correctly.
        const txAmount = operationType === 'BUY' || operationType === 'SELL'
          ? Math.abs(amount)
          : (operationType === 'DIVIDEND' || operationType === 'TAX_WITHHOLDING')
            ? amount / (fxRate ?? 1)
            : amount;

        // Convert negative-amount dividend corrections to FEE (signed) so the cash
        // impact keeps its sign: Wealthfolio imports dividends and adjustments as
        // positive amounts, but preserves the sign of fees.
        if (isDividendCorrection) {
          operationType = 'FEE';
          ticker = '';
          quantity = undefined;
          price = undefined;
        }

        const tx: any = {
          id: id || `${operationType}-${i}`,
          sourceRow: i + 1,
          operationType,
          date: parseDate(time),
          currency,
          quantity,
          price,
          amount: txAmount,
          fxRate,
          fxRateSource,
          fxRateStatus,
          description: comment,
          ticker,
          isin: undefined,
          metadata: { category, product, positionId, instrument },
          rawData: {},
        };

        transactions.push(tx);
      }

      // Reconciliation: open-position lots that have no corresponding "Stock purchase"
      // in Cash Operations (e.g. promotional shares) are emitted as ADJUSTMENT rows so
      // the resulting holdings match the report's Open Positions sheet.
      const buyPositionIds = new Set<string>();
      for (let k = 5; k < rows.length; k++) {
        const r = rows[k];
        if (!r) continue;
        if (String(r[0] || '').trim() !== 'Stock purchase') continue;
        const pid = String(r[9] || '').trim();
        if (pid) buyPositionIds.add(pid);
      }

      if (openSheet?.rows) {
        for (const r of openSheet.rows) {
          if (!r || r.length < 10) continue;
          const posId = String(r[1] || '').trim();
          if (!/^\d+$/.test(posId)) continue;
          const volume = parseNumber(r[5]);
          if (volume <= 0) continue;
          if (buyPositionIds.has(posId)) continue;
          const ticker = String(r[2] || '').trim();
          if (!ticker) continue;

          const openPrice = parseNumber(r[8]);
          const currentPrice = parseNumber(r[7]);
          // Only reconcile promotional/near-zero-cost lots (e.g. SHELL promotion).
          // Normal open lots without a cash buy are usually covered by another
          // report file (date-range mismatch) and must not be duplicated.
          if (openPrice <= 0 || openPrice > 0.01) continue;

          const category = String(r[3] || '').trim()
            || (positionMap[posId]?.category || '')
            || (positionMap['ticker:' + ticker]?.category || '');
          const price = openPrice > 0 ? openPrice : (currentPrice > 0 ? currentPrice : 0);
          const currency = determineCurrency(ticker, 'BUY');
          // Promotional shares are imported as a BUY at the promotional price so
          // Wealthfolio creates the holding (ADJUSTMENT alone does not).
          const amount = price > 0 ? volume * price : 0;
          const openTime = r[9];
          const date = parseDate(openTime);
          const positionFx = positionMap[posId];
          const fxResolved = resolveFx({
            currency,
            operationType: 'DIVIDEND',
            positionId: posId,
            positionFx,
            derivedFxByPosition,
            dateFxList,
            avgFxByCurrency,
            time: openTime,
            parseDate,
            quantity: volume,
            price,
            amount,
          });

          transactions.push({
            id: `RECON-${posId}`,
            sourceRow: 0,
            operationType: 'BUY',
            date,
            currency,
            quantity: volume,
            price: price > 0 ? price : undefined,
            amount,
            fxRate: fxResolved.fxRate,
            fxRateSource: fxResolved.fxRateSource,
            fxRateStatus: fxResolved.fxRateStatus,
            description: `Open position reconciliation (${ticker})`,
            ticker,
            isin: undefined,
            metadata: {
              category,
              product: String(r[0] || '').trim(),
              positionId: posId,
              instrument: ticker,
              reconciledFromOpenPositions: true,
            },
            rawData: {},
          } as any);
        }
      }

      const dateFrom = transactions.length ? new Date(Math.min(...transactions.map((tx: any) => tx.date.getTime()))) : new Date();
      const dateTo = transactions.length ? new Date(Math.max(...transactions.map((tx: any) => tx.date.getTime()))) : new Date();

      resolve({ transactions, wealthfolioCsv: buildWealthfolioCsv(transactions), dateFrom, dateTo });
    }).catch((err) => {
      resolve({ transactions: [], wealthfolioCsv: '', error: 'Parser error: ' + (err instanceof Error ? err.message : String(err)) });
    });
  });
}
