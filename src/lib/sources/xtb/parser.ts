import { readXLSXFile } from '../../file-readers';
import type { TransactionRecord, OperationType } from '../../domain/types';
import type { ActivityImport } from '@wealthfolio/addon-sdk';

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

function parseDate(raw: any): Date {
  if (!raw) return new Date();
  if (raw instanceof Date) return raw;
  if (typeof raw === 'number') {
    if (raw > 0 && raw < 100000) {
      return new Date((raw - 25569) * 86400 * 1000);
    }
    const date = new Date(raw * 1000);
    if (!isNaN(date.getTime())) return date;
  }
  const dateStr = String(raw).trim();
  if (dateStr === '') return new Date();
  const parsed = new Date(dateStr);
  return isNaN(parsed.getTime()) ? new Date() : parsed;
}

function parseNumber(raw: any): number {
  if (raw == null || raw === '') return 0;
  const n = Number(raw);
  return isNaN(n) ? 0 : n;
}

function determineCurrency(ticker: string, operationType: OperationType): string {
  if (operationType === 'DEPOSIT' || operationType === 'WITHDRAWAL' || operationType === 'TRANSFER' || operationType === 'INTEREST' || operationType === 'FEE' || operationType === 'TAX_WITHHOLDING') {
    if (!ticker) return 'PLN';
  }
  if (ticker.endsWith('.PL') || ticker.endsWith('.WA')) return 'PLN';
  if (ticker.endsWith('.US') || ticker.endsWith('.UK') || ticker.endsWith('.L')) return 'USD';
  if (ticker.endsWith('.DE') || ticker.endsWith('.NL') || ticker.endsWith('.FR') || ticker.endsWith('.AS') || ticker.endsWith('.PA')) return 'EUR';
  return 'PLN';
}

const WSE_SYMBOL_ALIASES: Record<string, string> = {
  CCC: 'MDV',
  K2H: 'FAB',
};

function mapWseBase(base: string): string {
  return WSE_SYMBOL_ALIASES[base.toUpperCase()] || base;
}

export function mapXTBSymbol(ticker: string): string {
  if (ticker.endsWith('.PL')) return mapWseBase(ticker.slice(0, -3)) + '.WA';
  if (ticker.endsWith('.WA')) return mapWseBase(ticker.slice(0, -3)) + '.WA';
  if (ticker.endsWith('.UK')) return ticker.slice(0, -3) + '.L';
  if (ticker.endsWith('.NL')) return ticker.slice(0, -3) + '.AS';
  if (ticker.endsWith('.FR')) return ticker.slice(0, -3) + '.PA';
  if (ticker.endsWith('.US')) return ticker.slice(0, -3);
  return ticker;
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

const SPLIT_COMMENT_RE = /split\s+([\d.,]+)\s+for\s+([\d.,]+)/i;

interface SplitAdjustment {
  before: number;
  after: number;
  sold: number;
  ratio: number;
}

function parseSplitRatio(comment: string): number | undefined {
  const match = comment.match(SPLIT_COMMENT_RE);
  if (!match) return undefined;
  const newShares = parseNumber(match[1].replace(/[,\s]/g, ''));
  const oldShares = parseNumber(match[2].replace(/[,\s]/g, ''));
  if (newShares <= 0 || oldShares <= 0) return undefined;
  return newShares / oldShares;
}

function splitSubtype(ratio: number): string | undefined {
  return ratio < 1 ? 'REVERSE_SPLIT' : undefined;
}

function computeSplitAdjustments(rows: any[]): Map<number, SplitAdjustment> {
  const events: { index: number; time: number; key: string; quantity: number; ratio?: number }[] = [];

  for (let i = 5; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length < 5) continue;
    const type = String(row[0] || '').trim();
    const positionId = String(row[9] || '').trim();
    const ticker = String(row[2] || '').trim();
    const key = positionId || 'ticker:' + ticker;
    const time = parseDate(row[4]).getTime();

    if (type === 'Stock purchase' || type === 'Stock sell') {
      const parsed = parseQuantityAndPrice(String(row[7] || '').trim());
      if (parsed.quantity <= 0) continue;
      events.push({
        index: i,
        time,
        key,
        quantity: type === 'Stock purchase' ? parsed.quantity : -parsed.quantity,
      });
    } else if (type === 'Fractional shares') {
      const ratio = parseSplitRatio(String(row[7] || '').trim());
      if (ratio === undefined) continue;
      events.push({ index: i, time, key, quantity: 0, ratio });
    }
  }

  events.sort((a, b) => a.time - b.time || b.index - a.index);

  const unitsByPosition = new Map<string, number>();
  const adjustments = new Map<number, SplitAdjustment>();

  for (const event of events) {
    const current = unitsByPosition.get(event.key) || 0;
    if (event.ratio === undefined) {
      unitsByPosition.set(event.key, current + event.quantity);
      continue;
    }

    const before = current;
    const after = before * event.ratio;
    const rounded = Math.round(after);
    const whole = Math.abs(after - rounded) < 1e-9 ? rounded : Math.floor(after);
    const sold = before > 0 && after > 0 ? Math.max(0, after - whole) : 0;
    unitsByPosition.set(event.key, after - sold);
    adjustments.set(event.index, { before, after, sold, ratio: event.ratio });
  }

  return adjustments;
}

function buildWealthfolioRow(tx: TransactionRecord, fee: number, fxRate: number | undefined): string {
  const dateStr = tx.date.toISOString().replace('Z', '').replace(/\.\d+$/, '');
  const symbol = getWealthfolioSymbol(tx);
  const category = String((tx.metadata as any)?.category || '').trim().toUpperCase();
  const isCashOperation = tx.operationType === 'INTEREST' || tx.operationType === 'DEPOSIT' || tx.operationType === 'WITHDRAWAL' || String(tx.ticker || '').startsWith('$CASH');
  const instrumentType = isCashOperation ? '' : (category === 'ETF' ? 'ETF' : 'EQUITY');
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

  return [dateStr, symbol, instrumentType, qty, act, uPrice, curr, feeVal, '0', amt, fx, sub, comm].join(',');
}

export function buildWealthfolioCsv(transactions: TransactionRecord[]): string {
  const rows: string[] = ['date,symbol,instrumentType,quantity,activityType,unitPrice,currency,fee,tax,amount,fxRate,subtype,comment'];
  for (const tx of transactions) {
    rows.push(buildWealthfolioRow(tx, 0, tx.fxRate));
  }
  return rows.join('\n');
}

export function toActivityImport(tx: TransactionRecord, accountId: string): ActivityImport {
  const category = String((tx.metadata as any)?.category || '').trim().toUpperCase();
  const isCash = tx.operationType === 'INTEREST' || tx.operationType === 'DEPOSIT' || tx.operationType === 'WITHDRAWAL' || String(tx.ticker || '').startsWith('$CASH');
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

      const positionMap: Record<string, { ticker: string; category: string; openFx?: number; closeFx?: number }> = {};
      if (openSheet?.rows) {
        for (const r of openSheet.rows) {
          if (!r || r.length < 3) continue;
          const posId = String(r[1] || '').trim();
          const ticker = String(r[2] || '').trim();
          const category = String(r[3] || '').trim();
          if (/^\d+$/.test(posId) && ticker) {
            positionMap[posId] = { ticker, category: category || positionMap[posId]?.category || '' };
          }
          // summary rows: instrument name, ticker, category
          const instrument = String(r[1] || '').trim();
          const t = String(r[2] || '').trim();
          const cat = String(r[3] || '').trim();
          if (t && cat && !/^\d+$/.test(instrument)) {
            // store by ticker for category lookup
            positionMap['ticker:' + t] = { ticker: t, category: cat };
          }
        }
      }
      if (closedSheet?.rows) {
        for (const r of closedSheet.rows) {
          if (!r || r.length < 4) continue;
          const ticker = String(r[1] || '').trim();
          const category = String(r[2] || '').trim();
          const posId = String(r[23] || '').trim();
          const openFx = parseNumber(r[20]);
          const closeFx = parseNumber(r[21]);
          if (posId && ticker) {
            positionMap[posId] = {
              ticker,
              category: category || positionMap[posId]?.category || '',
              openFx: openFx > 0 ? openFx : positionMap[posId]?.openFx,
              closeFx: closeFx > 0 ? closeFx : positionMap[posId]?.closeFx,
            };
          }
        }
      }

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

        const operationType = OPERATION_MAP[type];
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

        if (operationType === 'BUY' || operationType === 'SELL') {
          const parsed = parseQuantityAndPrice(comment);
          quantity = parsed.quantity;
          price = parsed.price;
        } else if (operationType === 'DIVIDEND') {
          const perShareMatch = comment.match(/([\d.]+)\s*\/\s*SHR/i);
          const perShare = perShareMatch ? parseNumber(perShareMatch[1]) : Math.abs(amount);
          quantity = perShare > 0 ? Math.abs(amount) / perShare : 1;
          price = perShare > 0 ? perShare : Math.abs(amount);
        } else {
          quantity = 1;
          price = 1;
        }

        const currency = determineCurrency(ticker, operationType);

        let fxRate: number | undefined;
        let fxRateSource: 'closed-positions' | 'cash-operations' | 'none' = 'none';
        let fxRateStatus: 'verified' | 'estimated' | 'missing' = 'missing';
        if (operationType === 'BUY' || operationType === 'SELL') {
          if (operationType === 'BUY' && positionFx?.openFx) {
            fxRate = positionFx.openFx;
            fxRateSource = 'closed-positions';
            fxRateStatus = 'verified';
          } else if (operationType === 'SELL' && positionFx?.closeFx) {
            fxRate = positionFx.closeFx;
            fxRateSource = 'closed-positions';
            fxRateStatus = 'verified';
          } else if (operationType === 'SELL' && positionFx?.openFx) {
            fxRate = positionFx.openFx;
            fxRateSource = 'closed-positions';
            fxRateStatus = 'verified';
          } else if (derivedFxByPosition.has(positionId)) {
            fxRate = derivedFxByPosition.get(positionId);
            fxRateSource = 'cash-operations';
            fxRateStatus = 'estimated';
          } else {
            const qtyPrice = (quantity || 0) * (price || 0);
            const amt = Math.abs(amount);
            if (qtyPrice > 0 && amt > 0) {
              fxRate = amt / qtyPrice;
              fxRateSource = 'cash-operations';
              fxRateStatus = 'estimated';
            }
          }
          if (fxRate == null && currency === 'PLN') {
            fxRateStatus = 'verified';
            fxRateSource = 'none';
          }
        } else if (currency === 'PLN') {
          fxRateStatus = 'verified';
          fxRateSource = 'none';
        }

        const tx: any = {
          id: id || `${operationType}-${i}`,
          sourceRow: i + 1,
          operationType,
          date: parseDate(time),
          currency,
          quantity,
          price,
          amount: operationType === 'BUY' || operationType === 'SELL' ? Math.abs(amount) : amount,
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

      const dateFrom = transactions.length ? new Date(Math.min(...transactions.map((tx: any) => tx.date.getTime()))) : new Date();
      const dateTo = transactions.length ? new Date(Math.max(...transactions.map((tx: any) => tx.date.getTime()))) : new Date();

      resolve({ transactions, wealthfolioCsv: buildWealthfolioCsv(transactions), dateFrom, dateTo });
    }).catch((err) => {
      resolve({ transactions: [], wealthfolioCsv: '', error: 'Parser error: ' + (err instanceof Error ? err.message : String(err)) });
    });
  });
}
