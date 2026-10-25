import { read } from 'xlsx';

export interface XLSXSheet {
  name: string;
  rows: any[][];
}

export function readXLSXSheets(workbook: any): XLSXSheet[] {
  const sheets: XLSXSheet[] = [];

  for (const name of workbook.SheetNames) {
    const ws = workbook.Sheets[name];
    const rows: any[] = [];

    // Find all used rows
    let maxRow = 0;
    for (const key in ws) {
      if (key.startsWith('!')) continue;
      const match = key.match(/^([A-Z]+)(\d+)$/);
      if (match) {
        const rowNum = parseInt(match[2], 10);
        if (rowNum > maxRow) maxRow = rowNum;
      }
    }

    for (let row = 1; row <= maxRow; row++) {
      const rowData: any[] = [];
      for (let col = 1; col <= 20; col++) {
        const cellKey = String.fromCharCode(64 + col) + row;
        if (ws[cellKey]) {
          rowData.push(ws[cellKey].v);
        } else {
          rowData.push('');
        }
      }
      // Only add row if it has some content
      if (rowData.some(cell => cell !== '' && cell !== undefined)) {
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