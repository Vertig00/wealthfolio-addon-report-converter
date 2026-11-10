import type { OperationType } from '../../domain/types';

export function parseNumber(raw: any): number {
  if (raw == null || raw === '') return 0;
  const n = Number(raw);
  return isNaN(n) ? 0 : n;
}

export function parseDate(raw: any): Date {
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

const XTB_CURRENCY_BY_SUFFIX: Record<string, string> = {
  PL: 'PLN',
  WA: 'PLN',
  US: 'USD',
  UK: 'USD',
  L: 'USD',
  DE: 'EUR',
  NL: 'EUR',
  FR: 'EUR',
  AS: 'EUR',
  PA: 'EUR',
};

export function determineCurrency(ticker: string, operationType: OperationType): string {
  if (operationType === 'DEPOSIT' || operationType === 'WITHDRAWAL' || operationType === 'TRANSFER' || operationType === 'INTEREST' || operationType === 'FEE' || operationType === 'TAX_WITHHOLDING') {
    if (!ticker) return 'PLN';
  }
  const dot = ticker.lastIndexOf('.');
  const suffix = dot > 0 ? ticker.slice(dot + 1).toUpperCase() : '';
  return XTB_CURRENCY_BY_SUFFIX[suffix] || 'PLN';
}
