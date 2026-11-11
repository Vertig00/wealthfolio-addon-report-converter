import type { TransactionRecord, OperationType } from '../../domain/types';
import { buildWealthfolioCsv } from '../xtb/parser';
import { parseEuropeanNumber, parseMBankDate, cleanLines, findHeaderIndex, splitCsvLine } from './utils';
import { mapMBankSymbol } from './symbol-map';

export type MBankSubtype = 'emakler';

export interface MBankParseResult {
  subtype: MBankSubtype;
  kind: 'transactions' | 'financial' | 'unknown';
  transactions: TransactionRecord[];
  wealthfolioCsv: string;
  metadata: Record<string, any>;
  warnings: string[];
  error?: string;
}

function decodeFileText(buffer: ArrayBuffer): string {
  try {
    return new TextDecoder('windows-1250').decode(buffer);
  } catch {
    return new TextDecoder('utf-8').decode(buffer);
  }
}

function parseMetadata(lines: string[]): Record<string, any> {
  const metadata: Record<string, any> = {};
  let currentKey = '';
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('#')) {
      currentKey = trimmed;
      continue;
    }
    if (currentKey === '#Imię i nazwisko') {
      metadata.name = trimmed;
      currentKey = '';
      continue;
    }
    if (currentKey === '#Nr rachunku mBM') {
      metadata.accountId = trimmed;
      currentKey = '';
      continue;
    }
    if (currentKey === '#Data') {
      metadata.reportDate = trimmed;
      currentKey = '';
      continue;
    }
    if (currentKey === '#Data od') {
      metadata.dateFrom = trimmed;
      currentKey = '';
      continue;
    }
    if (currentKey === '#Data do') {
      metadata.dateTo = trimmed;
      currentKey = '';
      continue;
    }
    if (trimmed === 'Kryteria wyszukiwania') {
      currentKey = '';
    }
  }
  const titleLine = lines.find((l) => l.trim().startsWith('eMAKLER -'));
  metadata.title = titleLine ? titleLine.trim() : '';
  return metadata;
}

function makeId(prefix: string, parts: any[]): string {
  return `${prefix}-${parts.map((p) => String(p ?? '').replace(/\s+/g, '')).join('-')}`;
}

function parseTransactionReport(lines: string[], headerIndex: number, metadata: Record<string, any>): {
  transactions: TransactionRecord[];
  warnings: string[];
} {
  const transactions: TransactionRecord[] = [];
  const warnings: string[] = [];
  const headers = splitCsvLine(lines[headerIndex]);
  const expected = ['Czas transakcji', 'Papier', 'Giełda', 'K/S', 'Liczba', 'Kurs', 'Waluta', 'Prowizja', 'Waluta', 'Wartość', 'Waluta'];
  if (headers.length < 11) {
    warnings.push('Unexpected transaction header column count');
  }

  for (let i = headerIndex + 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const cols = splitCsvLine(line);
    if (cols.length < 11) {
      warnings.push(`Skipped malformed transaction row ${i + 1}`);
      continue;
    }
    const time = cols[0];
    const paper = cols[1];
    const market = cols[2];
    const side = cols[3].toUpperCase();
    const quantity = parseEuropeanNumber(cols[4]);
    const price = parseEuropeanNumber(cols[5]);
    const currency = cols[6] || 'PLN';
    const fee = parseEuropeanNumber(cols[7]);
    const value = parseEuropeanNumber(cols[9]);
    const valueCurrency = cols[10] || 'PLN';

    let operationType: OperationType | null = null;
    if (side === 'K') operationType = 'BUY';
    else if (side === 'S') operationType = 'SELL';
    else {
      warnings.push(`Unknown transaction side "${side}" on row ${i + 1}`);
      continue;
    }

    const fxRate = currency !== 'PLN' && quantity > 0 && price > 0 && value > 0 ? value / (quantity * price) : undefined;
    // For PLN trades, Wealthfolio derives the cash impact from quantity * unitPrice.
    // Prefer the report's PLN value when it disagrees with quantity * price due to
    // rounding in the source report, so the imported cash balance matches.
    const resolvedPrice = currency === 'PLN' && value > 0 && quantity > 0 ? value / quantity : price;
    const tx: TransactionRecord = {
      id: makeId('MBANK-TRX', [i, time, paper, side, quantity, price, value]),
      sourceRow: i + 1,
      operationType,
      date: parseMBankDate(time),
      currency,
      quantity,
      price: resolvedPrice,
      amount: operationType === 'BUY' || operationType === 'SELL' ? quantity * resolvedPrice : value,
      fxRate,
      fxRateSource: fxRate !== undefined ? 'cash-operations' : 'none',
      fxRateStatus: fxRate !== undefined ? 'estimated' : (currency === 'PLN' ? 'verified' : 'missing'),
      description: `${operationType} ${paper}`.trim(),
      ticker: paper,
      isin: undefined,
      metadata: {
        market,
        valueCurrency,
        fee,
        resolvedSymbol: mapMBankSymbol(paper, market, currency),
      },
      rawData: {},
    } as any;

    transactions.push(tx);
  }

  if (transactions.length === 0) {
    warnings.push('No transaction rows parsed');
  }
  return { transactions, warnings };
}

function parseFinancialReport(lines: string[], headerIndex: number, metadata: Record<string, any>): {
  transactions: TransactionRecord[];
  warnings: string[];
} {
  const transactions: TransactionRecord[] = [];
  const warnings: string[] = [];

  for (let i = headerIndex + 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const cols = splitCsvLine(line);
    if (cols.length < 3) {
      warnings.push(`Skipped malformed financial row ${i + 1}`);
      continue;
    }
    const dateStr = cols[0];
    const description = cols[1];
    const amount = parseEuropeanNumber(cols[cols.length - 1]);
    const lower = description.toLowerCase();

    let operationType: OperationType | null = null;
    let ticker = '';
    let isin = '';

    if (lower.startsWith('dywidenda')) {
      operationType = 'DIVIDEND';
      const m = description.match(/([A-Z0-9]{10,12})\s*\(([^)]+)\)/);
      if (m) {
        isin = m[1];
        ticker = m[2].trim();
      }
    } else if (lower.startsWith('ikze')) {
      operationType = 'DEPOSIT';
    } else if (lower.includes('na cel inwestycyjny')) {
      operationType = 'DEPOSIT';
    } else if (lower.startsWith('wyc:')) {
      // Settlement of an executed sell; skip as duplicate cash effect.
      continue;
    } else if (lower.startsWith('blokada') || lower.startsWith('odblokowanie')) {
      // Internal cash reservation/release; skip.
      continue;
    } else if (lower.startsWith('odsetki') || lower.startsWith('odsetek') || lower.includes('odsetek')) {
      operationType = 'INTEREST';
    } else if (lower.startsWith('podatek') || lower.includes('podatek')) {
      operationType = 'TAX_WITHHOLDING';
    } else if (lower.startsWith('prowizja') || lower.startsWith('oplata') || lower.includes('prowizj') || lower.includes('opłat')) {
      operationType = 'FEE';
    } else if (lower.startsWith('wykup') || lower.includes('wykup')) {
      // Cash proceeds from a redemption; treat as a deposit-like cash inflow.
      operationType = 'DEPOSIT';
    } else if (lower.startsWith('wypłata') || lower.startsWith('wyplata') || lower.includes('wypłat')) {
      operationType = 'WITHDRAWAL';
    } else {
      // Most remaining descriptions are transfer titles / deposits into the
      // investment account. Default to DEPOSIT instead of UNKNOWN.
      operationType = 'DEPOSIT';
    }

    const tx: TransactionRecord = {
      id: makeId('MBANK-FIN', [dateStr, description, amount]),
      sourceRow: i + 1,
      operationType,
      date: parseMBankDate(dateStr),
      currency: 'PLN',
      amount: Math.abs(amount),
      description,
      ticker,
      isin,
      metadata: {
        rawDescription: description,
        fee: 0,
        resolvedSymbol: ticker ? mapMBankSymbol(ticker) : undefined,
      },
      rawData: {},
    } as any;

    if (operationType === 'DIVIDEND') {
      (tx as any).grossAmount = Math.abs(amount);
      (tx as any).taxAmount = 0;
      (tx as any).netAmount = Math.abs(amount);
    }
    if (operationType === 'DEPOSIT') {
      (tx as any).amount = amount >= 0 ? Math.abs(amount) : -Math.abs(amount);
    }

    transactions.push(tx);
  }

  return { transactions, warnings };
}

export async function parseMBankReport(
  file: File,
  subtype: MBankSubtype = 'emakler',
): Promise<MBankParseResult> {
  if (subtype !== 'emakler') {
    return {
      subtype,
      kind: 'unknown',
      transactions: [],
      wealthfolioCsv: '',
      metadata: {},
      warnings: [],
      error: `Unsupported mBank subtype: ${subtype}`,
    };
  }

  const buffer = await file.arrayBuffer();
  const text = decodeFileText(buffer);
  const lines = cleanLines(text);
  const metadata = parseMetadata(lines);

  const txHeaderIndex = findHeaderIndex(lines, (l) => l.includes('Czas transakcji') && l.includes('Papier'));
  const finHeaderIndex = findHeaderIndex(lines, (l) => l.trim() === 'Data;Opis;Kwota' || (l.includes('Data;Opis') && l.includes('Kwota')));

  let kind: MBankParseResult['kind'] = 'unknown';
  let transactions: TransactionRecord[] = [];
  const warnings: string[] = [];

  if (txHeaderIndex >= 0 && (finHeaderIndex < 0 || txHeaderIndex < finHeaderIndex)) {
    kind = 'transactions';
    const parsed = parseTransactionReport(lines, txHeaderIndex, metadata);
    transactions = parsed.transactions;
    warnings.push(...parsed.warnings);
  } else if (finHeaderIndex >= 0) {
    kind = 'financial';
    const parsed = parseFinancialReport(lines, finHeaderIndex, metadata);
    transactions = parsed.transactions;
    warnings.push(...parsed.warnings);
  } else {
    return {
      subtype,
      kind: 'unknown',
      transactions: [],
      wealthfolioCsv: '',
      metadata,
      warnings,
      error: 'Could not detect an mBank eMakler report table header',
    };
  }

  const wealthfolioCsv = buildWealthfolioCsv(transactions, ',');

  return {
    subtype,
    kind,
    transactions,
    wealthfolioCsv,
    metadata,
    warnings,
  };
}
