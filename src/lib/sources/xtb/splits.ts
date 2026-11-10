import { parseNumber, parseDate } from './utils';

export interface SplitAdjustment {
  before: number;
  after: number;
  sold: number;
  ratio: number;
}

const SPLIT_COMMENT_RE = /split\s+([\d.,]+)\s+for\s+([\d.,]+)/i;

export function parseSplitRatio(comment: string): number | undefined {
  const match = comment.match(SPLIT_COMMENT_RE);
  if (!match) return undefined;
  const newShares = parseNumber(match[1].replace(/[,\s]/g, ''));
  const oldShares = parseNumber(match[2].replace(/[,\s]/g, ''));
  if (newShares <= 0 || oldShares <= 0) return undefined;
  return newShares / oldShares;
}

export function splitSubtype(ratio: number): string | undefined {
  return ratio < 1 ? 'REVERSE_SPLIT' : undefined;
}

export function computeSplitAdjustments(rows: any[]): Map<number, SplitAdjustment> {
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
      const comment = String(row[7] || '').trim();
      const priceMatch = comment.match(/@\s*([\d.]+)/);
      const price = priceMatch ? parseNumber(priceMatch[1]) : 0;
      const qtyMatch = comment.match(/([\d.]+)(?:\/[\d.]+)?\s*@/i);
      const quantity = qtyMatch ? parseNumber(qtyMatch[1]) : 0;
      const parsed = { quantity: quantity > 0 ? quantity : 1, price };
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
