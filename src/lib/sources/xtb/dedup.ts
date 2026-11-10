import { getWealthfolioSymbol } from './parser';

/**
 * Filter report transactions against already imported Wealthfolio activities in
 * update mode. Matching priority:
 *   1. Exact `sourceRecordId` (most reliable).
 *   2. Fuzzy key match (type/date/symbol/quantity/currency, with cash fallback).
 * Returns only the transactions that still need to be imported.
 */
export function deduplicateUpdateTransactions(reportTransactions: any[], existingActivities: any[]): any[] {
  const used = new Set<number>();
  const norm = (v: any) => {
    const n = Number(v);
    return isNaN(n) ? String(v ?? '') : n.toFixed(6);
  };
  const mapSymbol = getWealthfolioSymbol;
  const isCashTx = (tx: any) =>
    tx.operationType === 'INTEREST' ||
    tx.operationType === 'DEPOSIT' ||
    tx.operationType === 'WITHDRAWAL' ||
    tx.operationType === 'TRANSFER' ||
    tx.operationType === 'TAX_WITHHOLDING' ||
    tx.operationType === 'FEE' ||
    tx.operationType === 'DIVIDEND' ||
    String(tx.ticker || '').startsWith('$CASH');

  const txKey = (tx: any) => {
    const date = tx.date instanceof Date ? tx.date.toISOString().split('T')[0] : String(tx.date).split('T')[0];
    const curr = tx.currency;
    if (isCashTx(tx)) {
      const type =
        tx.operationType === 'TRANSFER'
          ? (Number(tx.amount) || 0) >= 0
            ? 'TRANSFER_IN'
            : 'TRANSFER_OUT'
          : tx.operationType === 'TAX_WITHHOLDING'
            ? 'TAX'
            : tx.operationType === 'DIVIDEND'
              ? 'DIVIDEND'
              : tx.operationType;
      const notes = String(tx.description || tx.comment || '').trim().toLowerCase();
      return `CASH|${type}|${date}|${notes}|${curr}`;
    }
    const symbol = mapSymbol(tx);
    const baseSymbol = symbol.replace(/\.(WA|L|DE|FR|AS|PA)$/i, '');
    const qty = norm(tx.quantity);
    return `TRADE|${tx.operationType}|${date}|${baseSymbol}|${qty}|${curr}`;
  };

  const isCashActivity = (a: any) =>
    a.activityType === 'INTEREST' ||
    a.activityType === 'DEPOSIT' ||
    a.activityType === 'WITHDRAWAL' ||
    a.activityType === 'TRANSFER_IN' ||
    a.activityType === 'TRANSFER_OUT' ||
    a.activityType === 'TAX' ||
    a.activityType === 'FEE' ||
    a.activityType === 'DIVIDEND' ||
    !a.assetSymbol;

  const activityKey = (a: any) => {
    const date = a.date instanceof Date ? a.date.toISOString().split('T')[0] : String(a.date).split('T')[0];
    const curr = a.currency;
    if (isCashActivity(a)) {
      const notes = String(a.notes || a.comment || '').trim().toLowerCase();
      return `CASH|${a.activityType}|${date}|${notes}|${curr}`;
    }
    const qty = norm(a.quantity);
    const baseAssetSymbol = String(a.assetSymbol || '').replace(/\.(WA|L|DE|FR|AS|PA)$/i, '');
    return `TRADE|${a.activityType}|${date}|${baseAssetSymbol}|${qty}|${curr}`;
  };

  const activityKeys = (existingActivities || []).map((a: any) => activityKey(a));

  return (reportTransactions || []).filter((tx: any) => {
    // 1. Exact source-record match (most reliable).
    for (let i = 0; i < (existingActivities || []).length; i++) {
      if (used.has(i)) continue;
      if (existingActivities[i].sourceRecordId && String(existingActivities[i].sourceRecordId) === String(tx.id)) {
        used.add(i);
        return false;
      }
    }

    // 2. Fuzzy key match.
    const key = txKey(tx);
    for (let i = 0; i < activityKeys.length; i++) {
      if (used.has(i)) continue;
      if (activityKeys[i] === key) {
        used.add(i);
        return false;
      }
    }

    // 3. Fallback for cash activities: loose notes containment.
    if (isCashTx(tx)) {
      const txType =
        tx.operationType === 'TRANSFER'
          ? (Number(tx.amount) || 0) >= 0
            ? 'TRANSFER_IN'
            : 'TRANSFER_OUT'
          : tx.operationType === 'TAX_WITHHOLDING'
            ? 'TAX'
            : tx.operationType === 'DIVIDEND'
              ? 'DIVIDEND'
              : tx.operationType;
      const txDate = tx.date instanceof Date ? tx.date.toISOString().split('T')[0] : String(tx.date).split('T')[0];
      const txNotes = String(tx.description || tx.comment || '').trim().toLowerCase();
      for (let i = 0; i < (existingActivities || []).length; i++) {
        if (used.has(i)) continue;
        const a = existingActivities[i];
        const aType = a.activityType;
        if (aType !== txType) continue;
        const aDate = a.date instanceof Date ? a.date.toISOString().split('T')[0] : String(a.date).split('T')[0];
        if (aDate !== txDate) continue;
        if (a.currency !== tx.currency) continue;
        const aNotes = String(a.notes || a.comment || '').trim().toLowerCase();
        if (txNotes && aNotes && (aNotes.includes(txNotes) || txNotes.includes(aNotes))) {
          used.add(i);
          return false;
        }
      }
    }

    return true;
  });
}
