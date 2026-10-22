import { readXLSXFile } from '../../file-readers';
import type { TransactionRecord, OperationType } from '../../domain/types';

const OPERATION_MAP: Record<string, OperationType> = {
  'Stock purchase': 'BUY',
  'Stock sell': 'SELL',
  'IKE deposit': 'DEPOSIT',
  'Deposit': 'DEPOSIT',
  'Free funds interest': 'INTEREST',
  'Dividend': 'DIVIDEND',
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
  if (operationType === 'DEPOSIT' || operationType === 'WITHDRAWAL') return 'PLN';
  if (ticker.endsWith('.PL')) return 'PLN';
  if (ticker.endsWith('.UK') || ticker.endsWith('.DE') || ticker.endsWith('.FR')) return 'USD';
  return 'PLN';
}

function mapSymbol(ticker: string): string {
  if (ticker.endsWith('.PL')) return ticker.slice(0, -3) + '.WA';
  if (ticker.endsWith('.UK')) return ticker.slice(0, -3) + '.L';
  return ticker;
}

function determineFXRate(currency: string, operationType: OperationType): number | undefined {
  if (currency !== 'USD') return undefined;
  if (operationType === 'BUY' || operationType === 'SELL') return 3.87;
  return undefined;
}

function parseQuantityAndPrice(comment: string): { quantity: number; price: number } {
  const match = comment.match(/@\s*([\d.]+)/);
  const price = match ? parseNumber(match[1]) : 0;
  const qtyMatch = comment.match(/(?:BUY|SELL)\s+[\w.]+\s+([\d.]+)(?:\/[\d.]+)?\s*@/i);
  const quantity = qtyMatch ? parseNumber(qtyMatch[1]) : 0;
  return { quantity, price };
}

function buildWealthfolioRow(tx: TransactionRecord, fee: number, fxRate: number | undefined): string {
  const dateStr = tx.date.toISOString().replace('Z', '').replace(/\.\d+$/, '');
  const symbol = mapSymbol(tx.ticker || '');
  const category = String((tx.metadata as any)?.category || '').trim().toUpperCase();
  const instrumentType = category === 'ETF' ? 'ETF' : 'EQUITY';
  let qty = '';
  let act = tx.operationType;
  let uPrice = '';
  const curr = tx.currency;
  const feeVal = String(fee);
  let amt = '';
  const fx = fxRate !== undefined ? String(fxRate) : '';
  const sub = '';
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

export function parseXTBReport(file: File): Promise<{
  transactions: TransactionRecord[];
  wealthfolioCsv: string;
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

      const rows = cashSheet.rows;
      if (!rows || rows.length < 5) {
        resolve({ transactions: [], wealthfolioCsv: '', error: 'No data rows in Cash Operations sheet' });
        return;
      }

      const transactions: TransactionRecord[] = [];

      for (let i = 5; i < rows.length; i++) {
        const row = rows[i];
        if (!row || row.length < 5) continue;

        const type = String(row[0] || '').trim();
        if (type === '' || type === 'Total') continue;

        const operationType = OPERATION_MAP[type];
        if (!operationType) continue;

        const instrument = String(row[1] || '').trim();
        const ticker = String(row[2] || '').trim();
        const category = String(row[3] || '').trim();
        const time = row[4];
        const amount = parseNumber(row[5]);
        const id = String(row[6] || '').trim();
        const comment = String(row[7] || '').trim();
        const product = String(row[8] || '').trim();
        const positionId = String(row[9] || '').trim();

        let quantity: number | undefined;
        let price: number | undefined;

        if (operationType === 'BUY' || operationType === 'SELL') {
          const parsed = parseQuantityAndPrice(comment);
          quantity = parsed.quantity;
          price = parsed.price;
        } else if (operationType === 'DIVIDEND') {
          quantity = 1;
          price = Math.abs(amount);
        } else {
          quantity = 1;
          price = 1;
        }

        const currency = determineCurrency(ticker, operationType);

        const tx: any = {
          id: id || `${operationType}-${i}`,
          sourceRow: i + 1,
          operationType,
          date: parseDate(time),
          currency,
          quantity,
          price,
          amount: operationType === 'BUY' || operationType === 'SELL' ? Math.abs(amount) : amount,
          description: comment,
          ticker,
          isin: undefined,
          metadata: { category, product, positionId },
          rawData: {},
        };

        transactions.push(tx);
      }

      const csvRows: string[] = ['date,symbol,instrumentType,quantity,activityType,unitPrice,currency,fee,tax,amount,fxRate,subtype,comment'];

      for (const tx of transactions) {
        const fxRate = determineFXRate(tx.currency, tx.operationType);
        csvRows.push(buildWealthfolioRow(tx, 0, fxRate));
      }

      resolve({ transactions, wealthfolioCsv: csvRows.join('\n') });
    }).catch((err) => {
      resolve({ transactions: [], wealthfolioCsv: '', error: 'Parser error: ' + (err instanceof Error ? err.message : String(err)) });
    });
  });
}
