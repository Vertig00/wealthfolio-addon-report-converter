import { read, utils } from 'xlsx';

export interface XLSXSheet {
  name: string;
  rows: any[][];
}

export function readXLSXSheets(workbook: any): XLSXSheet[] {
  const sheets: XLSXSheet[] = [];

  for (const name of workbook.SheetNames) {
    const ws = workbook.Sheets[name];
    const rows: any[] = [];

    const range = ws['!ref'] ? utils.decode_range(ws['!ref']) : null;
    const maxRow = range ? range.e.r + 1 : 0;
    const maxCol = range ? Math.min(range.e.c + 1, 50) : 20;

    for (let row = 1; row <= maxRow; row++) {
      const rowData: any[] = [];
      let hasContent = false;
      for (let col = 0; col < maxCol; col++) {
        const cellKey = utils.encode_cell({ r: row - 1, c: col });
        if (ws[cellKey]) {
          const value = ws[cellKey].v;
          rowData.push(value);
          if (value !== '' && value !== undefined && value !== null) hasContent = true;
        } else {
          rowData.push('');
        }
      }
      // Only add row if it has some content, preserving prior behaviour.
      if (hasContent) {
        rows.push(rowData);
      }
    }

    sheets.push({ name, rows });
  }

  return sheets;
}

export async function readXLSXFile(file: File): Promise<{
  sheets: XLSXSheet[];
  error?: string;
}> {
  try {
    const data = await file.arrayBuffer();
    const originalError = console.error;
    console.error = () => {};
    let workbook: any;
    try {
      workbook = read(data);
    } finally {
      console.error = originalError;
    }
    const sheets = readXLSXSheets(workbook);
    return { sheets, error: undefined };
  } catch (err) {
    return { sheets: [], error: `XLSX read error: ${err instanceof Error ? err.message : String(err)}` };
  }
}