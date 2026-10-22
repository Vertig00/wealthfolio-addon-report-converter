export function readCSV(content: string): { rows: any[]; headers: string[]; errors: string[] } {
  const lines = content.split(/\r?\n/).filter(line => line.trim().length > 0);

  if (lines.length === 0) {
    return { rows: [], headers: [], errors: ['Empty CSV file'] };
  }

  // Try to auto-detect delimiter
  const firstLine = lines[0];
  let delimiter = ',';
  if (firstLine.includes(';') && !firstLine.includes(',')) {
    delimiter = ';';
  } else if (firstLine.includes('\t') && !firstLine.includes(',') && !firstLine.includes(';')) {
    delimiter = '\t';
  }

  const cells = firstLine.split(delimiter);
  const headers = cells.map(h => h.trim());

  const rows: any[] = [];
  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(delimiter);
    const row: any = {};
    for (let j = 0; j < headers.length; j++) {
      row[headers[j]] = j < values.length ? values[j].trim() : '';
    }
    rows.push(row);
  }

  return { rows, headers, errors: [] };
}

export function readCSVFile(file: File): Promise<{ rows: any[]; headers: string[]; errors: string[] }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const result = readCSV(e.target?.result as string || '');
      resolve(result);
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsText(file, 'utf8');
  });
}