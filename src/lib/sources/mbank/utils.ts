export function parseEuropeanNumber(raw: any): number {
  if (raw == null || raw === '') return 0;
  const cleaned = String(raw).replace(/\s/g, '').replace(',', '.');
  const n = Number(cleaned);
  return isNaN(n) ? 0 : n;
}

export function parseMBankDate(raw: any): Date {
  if (!raw) return new Date();
  if (raw instanceof Date) return raw;
  const s = String(raw).trim();
  const m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if (m) {
    const [, dd, mm, yyyy, hh = '0', min = '0', ss = '0'] = m;
    return new Date(Number(yyyy), Number(mm) - 1, Number(dd), Number(hh), Number(min), Number(ss));
  }
  const parsed = new Date(s);
  return isNaN(parsed.getTime()) ? new Date() : parsed;
}

export function cleanLines(text: string): string[] {
  return text.split(/\r?\n/).map((l) => l.replace(/\s+$/, '')).filter((l) => l.trim() !== '');
}

export function findHeaderIndex(lines: string[], predicate: (line: string) => boolean): number {
  for (let i = 0; i < lines.length; i++) {
    if (predicate(lines[i])) return i;
  }
  return -1;
}

export function splitCsvLine(line: string, delimiter = ';'): string[] {
  return line.split(delimiter).map((c) => c.trim());
}
