import { parseNumber } from './utils';

export interface PositionInfo {
  ticker: string;
  category: string;
  openFx?: number;
  closeFx?: number;
}

export type PositionMap = Record<string, PositionInfo>;

/**
 * Build the XTB position lookup map from the `Open Positions` and `Closed Positions`
 * sheets. Position IDs are preferred; summary rows are also indexed by ticker for
 * category lookups. Behaviour is intentionally identical to the previous inline
 * implementation in parser.ts.
 */
export function buildPositionMap(openSheet: any, closedSheet: any): PositionMap {
  const positionMap: PositionMap = {};

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

  return positionMap;
}
