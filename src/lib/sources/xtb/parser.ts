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
  if (ticker.endsWith('.PL') || operationType === 'DEPOSIT' || operationType === 'WITHDRAWAL') return 'PLN';
  if (ticker.endsWith('.UK') || ticker.endsWith('.DE') || ticker.endsWith('.FR')) return 'USD';
  return 'PLN';
}

function buildWealthfolioRow(
  tx: TransactionRecord,
  fee: number,
  fxRate: number | undefined
): string {
  const dateStr = tx.date.toISOString().split('T')[0];
  const symbol = tx.ticker || '';
  const instrumentType = symbol.endsWith('.PL') || symbol.endsWith('.UK') || symbol.endsWith('.DE') || symbol.endsWith('.FR') ? 'EQUITY' : 'ETF';
  const qty = tx.quantity !== undefined ? String(tx.quantity) : '';
  const act = tx.operationType;
  const uPrice = tx.price !== undefined ? String(tx.price) : '';
  const curr = tx.currency;
  const feeVal = String(fee);
  const amt = tx.amount !== undefined ? String(tx.amount) : '';
  const fx = fxRate !== undefined ? String(fxRate) : '';
  const sub = '';
  const comm = tx.description || '';

  return dateStr + ',' + symbol + ',' + instrumentType + ',' + qty + ',' + act + ',' + uPrice + ',' + curr + ',' + feeVal + ',' + amt + ',' + fx + ',' + sub + ',' + comm;
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
        const instrument = String(row[1] || '').trim();
        const ticker = String(row[2] || '').trim();
        const category = String(row[3] || '').trim();
        const time = row[4];
        const amount = parseNumber(row[5]);
        const id = String(row[6] || '').trim();
        const comment = String(row[7] || '').trim();
        const product = String(row[8] || '').trim();
        const positionId = String(row[9] || '').trim();

        const operationType = OPERATION_MAP[type] || 'UNKNOWN';

        let quantity: number | undefined;
        let price: number | undefined;
        let unitPrice: number | undefined;
        let activityType: string = '';

        switch (operationType) {
          case 'BUY': {
            quantity = Math.abs(amount) > 0 ? Math.round(Math.abs(amount)) : 0;
            const commentMatch = comment.match(/@\s*([\d.]+)/);
            unitPrice = commentMatch ? parseNumber(commentMatch[1]) : 0;
            activityType = 'BUY';
            break;
          }
          case 'SELL': {
            quantity = Math.abs(amount) > 0 ? Math.round(Math.abs(amount)) : 0;
            const commentMatch = comment.match(/@\s*([\d.]+)/);
            unitPrice = commentMatch ? parseNumber(commentMatch[1]) : 0;
            activityType = 'SELL';
            break;
          }
          case 'DEPOSIT': {
            quantity = undefined;
            unitPrice = 0;
            activityType = 'DEPOSIT';
            break;
          }
          case 'INTEREST': {
            quantity = undefined;
            unitPrice = 0;
            activityType = 'INTEREST';
            break;
          }
          case 'DIVIDEND': {
            quantity = 1;
            unitPrice = parseNumber(amount);
            activityType = 'DIVIDEND';
            break;
          }
          default: {
            quantity = undefined;
            unitPrice = 0;
            activityType = 'UNKNOWN';
          }
        }

        const currency = determineCurrency(ticker, operationType);
        const fee = 0;

        const tx: any = {
          id: id || `${operationType}-${i}`,
          sourceRow: i,
          operationType,
          date: parseDate(time),
          currency,
          quantity,
          price: unitPrice,
          amount,
          description: comment,
          ticker,
          isin: undefined,
          rawData: {} as Record<string, any>,
          metadata: {},
        };

        transactions.push(tx);
      }

      const csvRows: string[] = ['date,symbol,instrumentType,quantity,activityType,unitPrice,currency,fee,amount,fxRate,subtype,comment'];

      for (const tx of transactions) {
        csvRows.push(buildWealthfolioRow(tx, 0, undefined));
      }

      resolve({ transactions, wealthfolioCsv: csvRows.join('\n') });
    }).catch((err) => {
      resolve({ transactions: [], wealthfolioCsv: '', error: 'Parser error: ' + (err instanceof Error ? err.message : String(err)) });
    });
  });
}