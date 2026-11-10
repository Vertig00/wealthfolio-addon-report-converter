import type { OperationType } from '../../domain/types';
import type { PositionInfo } from './position-map';
export type { PositionInfo };
export interface DateFxEntry {
  date: number;
  currency: string;
  fx: number;
}

export interface FxResolutionResult {
  fxRate: number | undefined;
  fxRateSource: 'closed-positions' | 'cash-operations' | 'none';
  fxRateStatus: 'verified' | 'estimated' | 'missing';
}

export interface ResolveFxInput {
  currency: string;
  operationType: OperationType;
  positionId: string;
  positionFx?: PositionInfo;
  derivedFxByPosition: Map<string, number>;
  dateFxList: DateFxEntry[];
  avgFxByCurrency: Map<string, number>;
  time: any;
  parseDate: (raw: any) => Date;
  quantity?: number;
  price?: number;
  amount?: number;
}

/**
 * Resolve the FX rate for a single XTB cash operation. Extracted verbatim from
 * the previous inline logic in parser.ts so behaviour (and status/source labels)
 * stays identical.
 */
export function resolveFx(input: ResolveFxInput): FxResolutionResult {
  const {
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
  } = input;

  let fxRate: number | undefined;
  let fxRateSource: 'closed-positions' | 'cash-operations' | 'none' = 'none';
  let fxRateStatus: 'verified' | 'estimated' | 'missing' = 'missing';

  if (operationType === 'BUY' || operationType === 'SELL') {
    const qtyPrice = (quantity || 0) * (price || 0);
    const amt = Math.abs(amount ?? 0);
    if (qtyPrice > 0 && amt > 0) {
      fxRate = amt / qtyPrice;
      fxRateSource = 'cash-operations';
      fxRateStatus = 'estimated';
    } else if (derivedFxByPosition.has(positionId)) {
      fxRate = derivedFxByPosition.get(positionId);
      fxRateSource = 'cash-operations';
      fxRateStatus = 'estimated';
    } else if (operationType === 'BUY' && positionFx?.openFx) {
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
    }
    if (fxRate == null && currency === 'PLN') {
      fxRateStatus = 'verified';
      fxRateSource = 'none';
    }
  } else if (operationType === 'DIVIDEND' || operationType === 'TAX_WITHHOLDING') {
    if (currency === 'PLN') {
      fxRateStatus = 'verified';
      fxRateSource = 'none';
    } else {
      if (positionId && derivedFxByPosition.has(positionId)) {
        fxRate = derivedFxByPosition.get(positionId);
        fxRateSource = 'cash-operations';
        fxRateStatus = 'estimated';
      } else if (positionId && positionFx) {
        if (positionFx.closeFx) {
          fxRate = positionFx.closeFx;
          fxRateSource = 'closed-positions';
          fxRateStatus = 'verified';
        } else if (positionFx.openFx) {
          fxRate = positionFx.openFx;
          fxRateSource = 'closed-positions';
          fxRateStatus = 'verified';
        }
      }
      if (fxRate == null) {
        const targetDate = parseDate(time).getTime();
        let best: { fx: number; diff: number } | null = null;
        for (const entry of dateFxList) {
          if (entry.currency !== currency) continue;
          const diff = Math.abs(entry.date - targetDate);
          if (!best || diff < best.diff) best = { fx: entry.fx, diff };
        }
        if (best && best.diff <= 365 * 24 * 3600 * 1000) {
          fxRate = best.fx;
          fxRateSource = 'cash-operations';
          fxRateStatus = 'estimated';
        } else if (avgFxByCurrency.has(currency)) {
          fxRate = avgFxByCurrency.get(currency);
          fxRateSource = 'cash-operations';
          fxRateStatus = 'estimated';
        } else {
          fxRate = currency === 'USD' ? 3.8 : currency === 'EUR' ? 4.3 : undefined;
          fxRateSource = fxRate !== undefined ? 'cash-operations' : 'none';
          fxRateStatus = fxRate !== undefined ? 'estimated' : 'missing';
        }
      }
    }
  } else if (currency === 'PLN') {
    fxRateStatus = 'verified';
    fxRateSource = 'none';
  }

  return { fxRate, fxRateSource, fxRateStatus };
}
