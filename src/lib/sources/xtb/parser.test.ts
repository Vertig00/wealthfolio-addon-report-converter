import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import { parseXTBReport } from './parser';

function makeFile(sheets: Record<string, any[][]>): File {
  const wb = XLSX.utils.book_new();
  for (const [name, rows] of Object.entries(sheets)) {
    const ws = XLSX.utils.aoa_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, name);
  }
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  return new File([buf], 'synthetic.xlsx', {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}

const CASH_HEADER = [
  'Type', 'Instrument', 'Ticker', 'Category', 'Time', 'Amount', 'ID', 'Comment',
  'Product', 'Position ID',
];

describe('parseXTBReport', () => {
  it('parses a basic stock purchase', async () => {
    const date = new Date('2024-01-15T10:00:00Z');
    const file = makeFile({
      'Cash Operations': [
        ['Account number', '1'],
        ['Cash Operations', ''],
        ['from', 1],
        ['to', 2],
        CASH_HEADER,
        ['Stock purchase', 'Foo', 'FOO.PL', 'STOCK', date, -100, 'ID1', 'OPEN BUY FOO.PL 2 @ 50.00', 'My Trades', 'P1'],
      ],
      'Open Positions': [
        ['Account number', '1'],
        ['Open Positions', ''],
        ['Data as of', date],
        ['Product', 'Metric', 'Amount', 'Currency'],
        ['My Trades', 'Open position value', 100, 'PLN'],
      ],
    });

    const result = await parseXTBReport(file, 'initial');
    expect(result.error).toBeUndefined();
    expect(result.transactions).toHaveLength(1);
    const tx = result.transactions[0];
    expect(tx.operationType).toBe('BUY');
    expect(tx.ticker).toBe('FOO.PL');
    expect(tx.quantity).toBe(2);
    expect(tx.price).toBe(50);
    expect(tx.currency).toBe('PLN');
  });

  it('skips Total rows', async () => {
    const date = new Date('2024-01-15T10:00:00Z');
    const file = makeFile({
      'Cash Operations': [
        ['Account number', '1'],
        ['Cash Operations', ''],
        ['from', 1],
        ['to', 2],
        CASH_HEADER,
        ['Stock purchase', 'Foo', 'FOO.PL', 'STOCK', date, -100, 'ID1', 'OPEN BUY FOO.PL 2 @ 50.00', 'My Trades', 'P1'],
        ['Total', '', '', '', '', -100, '', '', '', ''],
      ],
      'Open Positions': [
        ['Account number', '1'],
        ['Open Positions', ''],
        ['Data as of', date],
      ],
    });

    const result = await parseXTBReport(file, 'initial');
    expect(result.transactions).toHaveLength(1);
  });

  it('reconciles promotional open-position lots as ADJUSTMENT', async () => {
    const date = new Date('2024-01-15T10:00:00Z');
    const file = makeFile({
      'Cash Operations': [
        ['Account number', '1'],
        ['Cash Operations', ''],
        ['from', 1],
        ['to', 2],
        CASH_HEADER,
        ['Dividend', 'Shell', 'SHELL.NL', 'STOCK', date, 1.44, 'ID2', 'SHELL.NL EUR 0.3381/ SHR', 'My Trades', '999'],
      ],
      'Open Positions': [
        ['Account number', '1'],
        ['Open Positions', ''],
        ['Data as of', date],
        ['Product', 'Instrument/Position', 'Ticker', 'Category', 'Type', 'Volume', 'Value', 'Current price', 'Open price', 'Open time (UTC)'],
        ['My Trades', '999', 'SHELL.NL', '', 'BUY', 1, 182.85, 42.06, 0.0001, date],
      ],
    });

    const result = await parseXTBReport(file, 'initial');
    expect(result.error).toBeUndefined();
    const recon = result.transactions.filter((t) => t.metadata?.reconciledFromOpenPositions);
    expect(recon).toHaveLength(1);
    expect(recon[0].operationType).toBe('BUY');
    expect(recon[0].ticker).toBe('SHELL.NL');
    expect(recon[0].quantity).toBe(1);
    expect(recon[0].id).toBe('RECON-999');
  });

  it('does not reconcile normal-priced open lots', async () => {
    const date = new Date('2024-01-15T10:00:00Z');
    const file = makeFile({
      'Cash Operations': [
        ['Account number', '1'],
        ['Cash Operations', ''],
        ['from', 1],
        ['to', 2],
        CASH_HEADER,
        ['Dividend', 'Shell', 'SHELL.NL', 'STOCK', date, 1.44, 'ID2', 'SHELL.NL EUR 0.3381/ SHR', 'My Trades', '999'],
      ],
      'Open Positions': [
        ['Account number', '1'],
        ['Open Positions', ''],
        ['Data as of', date],
        ['Product', 'Instrument/Position', 'Ticker', 'Category', 'Type', 'Volume', 'Value', 'Current price', 'Open price', 'Open time (UTC)'],
        ['My Trades', 'P2', 'SHELL.NL', '', 'BUY', 1, 182.85, 42.06, 42.06, date],
      ],
    });

    const result = await parseXTBReport(file, 'initial');
    const recon = result.transactions.filter((t) => t.metadata?.reconciledFromOpenPositions);
    expect(recon).toHaveLength(0);
  });

  it('derives dividend quantity from per-share comment', async () => {
    const date = new Date('2024-01-15T10:00:00Z');
    const file = makeFile({
      'Cash Operations': [
        ['Account number', '1'],
        ['Cash Operations', ''],
        ['from', 1],
        ['to', 2],
        CASH_HEADER,
        ['Dividend', 'Foo', 'FOO.PL', 'STOCK', date, 10, 'ID3', 'FOO.PL PLN 5.00/ SHR', 'My Trades', 'P3'],
      ],
      'Open Positions': [
        ['Account number', '1'],
        ['Open Positions', ''],
        ['Data as of', date],
      ],
    });

    const result = await parseXTBReport(file, 'initial');
    expect(result.transactions).toHaveLength(1);
    const tx = result.transactions[0];
    expect(tx.operationType).toBe('DIVIDEND');
    expect(tx.quantity).toBe(2);
    expect(tx.price).toBe(5);
  });
});
