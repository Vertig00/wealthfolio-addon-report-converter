// Best-effort aliases from mBank eMakler instrument codes to Wealthfolio/standard tickers.
// mBank's "Papier" column is a broker-specific label, not a market ticker.
const MBANK_SYMBOL_ALIASES: Record<string, string> = {
  PKNORLEN: 'PKN.WA',
  ORANGEPL: 'OPL.WA',
  PGE: 'PGE.WA',
  PHOTON: 'PEN.WA',
  MBANK: 'MBK.WA',
  MODIVO: 'MDV.WA',
  CDPROJEKT: 'CDR.WA',
  CYFRPLSAT: 'CPS.WA',
  ASSECOPOL: 'ACP.WA',
  XTB: 'XTB.WA',
  BIOCELTIX: 'BCT.WA',
  'RBOT LN ETF': 'RBOT.L',
  'SPY5 LN ETF': 'SPY5.L',
};

export function mapMBankSymbol(paper: string, _market?: string, _currency?: string): string {
  const key = String(paper || '').trim().toUpperCase();
  if (!key) return '';
  if (MBANK_SYMBOL_ALIASES[key]) return MBANK_SYMBOL_ALIASES[key];

  // Fall back to the broker code for unknown instruments; the runtime ticker
  // resolver can still try to resolve it against the host market search.
  return key;
}

export function getMBankFallbackSymbol(paper: string, marketCode: string, currency: string): string {
  const mapped = mapMBankSymbol(paper, marketCode, currency);
  if (mapped) return mapped;
  if (marketCode === 'WWA-GPW') return `${paper.trim().toUpperCase()}.WA`;
  return paper.trim().toUpperCase();
}
