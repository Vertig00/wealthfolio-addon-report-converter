import { useState, useEffect } from 'react';
import { readXLSXFile, readCSVFile } from '../lib/file-readers';
import { parseXTBReport } from '../lib/sources/xtb';
import { Card, CardContent } from '@wealthfolio/ui';
import { Skeleton, Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@wealthfolio/ui';
import { t } from '../lib/i18n';

function formatDate(d: any): string {
  if (!d) return '';
  if (d instanceof Date) return isNaN(d.getTime()) ? '' : d.toISOString().split('T')[0];
  return String(d);
}

export function ConverterPage({ t, files }: { t: (key: string) => string; files: any }) {
  const [file, setFile] = useState<File | null>(null);
  const [source, setSource] = useState<'XTB' | 'mBank'>('XTB');
  const [isLoading, setIsLoading] = useState(false);
  const [validation, setValidation] = useState<{ valid: number; warning: number; error: number }>({ valid: 0, warning: 0, error: 0 });
  const [rows, setRows] = useState<any[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [selectedSheet, setSelectedSheet] = useState<string>('');

  useEffect(() => {
    let valid = 0;
    let errorCount = 0;
    for (const row of rows) {
      const hasData = Object.values(row).some(v => v != null && v !== '');
      if (hasData) {
        valid++;
      } else {
        errorCount++;
      }
    }
    setValidation({ valid, warning: 0, error: errorCount });
  }, [rows]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setFile(file);
      setIsLoading(true);
      setValidation({ valid: 0, warning: 0, error: 0 });
      setRows([]);
      setHeaders([]);

      const name = file.name.toLowerCase();
      try {
        if (name.endsWith('.csv')) {
          const csvResult = await readCSVFile(file);
          if (csvResult.errors.length > 0) {
            setValidation({ valid: 0, warning: 0, error: csvResult.errors.length });
            alert(t('error.invalidCSV'));
          } else {
            setHeaders(csvResult.headers);
            setRows(csvResult.rows);
          }
        } else if (name.endsWith('.xlsx')) {
          if (source === 'XTB') {
            const xtbResult = await parseXTBReport(file);
            if (xtbResult.error) {
              setValidation({ valid: 0, warning: 0, error: 1 });
              alert(xtbResult.error);
            } else {
              const transactionRows = xtbResult.transactions?.length
                ? xtbResult.transactions.map((tx: any) => ({
                    type: tx.operationType,
                    instrument: tx.ticker || '',
                    ticker: tx.ticker || '',
                    category: tx.ticker?.endsWith('.PL') ? 'STOCK' : 'ETF',
                    time: formatDate(tx.date),
                    amount: tx.amount,
                    id: tx.id,
                    comment: tx.description || '',
                    product: '',
                    positionId: '',
                  }))
                : [];
              setHeaders(['type', 'instrument', 'ticker', 'category', 'time', 'amount', 'id', 'comment', 'product', 'positionId']);
              setRows(transactionRows);
            }
          } else {
            const xlsxResult = await readXLSXFile(file);
            if (xlsxResult.error) {
              setValidation({ valid: 0, warning: 0, error: 1 });
              alert(t('error.invalidXLSX'));
            } else if (xlsxResult.sheets.length === 0) {
              alert(t('error.invalidXLSX'));
            } else {
              const hasMultipleSheets = xlsxResult.sheets.length > 1;
              let initialSheet = xlsxResult.sheets[0].name;

              if (hasMultipleSheets) {
                initialSheet = '';
              }

              setSelectedSheet(initialSheet);

              const result: any = {
                headers: [],
                rows: [],
              };

              if (selectedSheet && selectedSheet !== '') {
                const selected = xlsxResult.sheets.find((s: any) => s.name === selectedSheet);
                if (selected) {
                  result.headers = selected.rows[0] || [];
                  result.rows = selected.rows.slice(1);
                }
              } else {
                const first = xlsxResult.sheets[0];
                if (first.rows.length > 0) {
                  result.headers = first.rows[0] || [];
                  result.rows = first.rows.slice(1);
                }
              }

              setHeaders(result.headers);
              setRows(result.rows);
            }
          }
        }
      } catch (e) {
        setValidation({ valid: 0, warning: 0, error: 1 });
        alert('Error reading file: ' + (e instanceof Error ? e.message : String(e)));
      } finally {
        setIsLoading(false);
      }
    }
  };

  const handleDownload = async () => {
    if (rows.length === 0) {
      alert(t('error.emptyFile'));
      return;
    }
    try {
      const csvContent = rows.map((row: any) => Object.values(row).map(v => String(v ?? '').includes(',') ? `"${String(v ?? '')}"` : String(v ?? '')).join(',')).join('\n');
      await files.openSaveDialog(csvContent, source + '_wealthfolio.csv');
    } catch (e) {
      alert(t('export.error') + ': ' + (e instanceof Error ? e.message : String(e)));
    }
  };

  return (
    <Card>
      <CardContent>
        <h2 className="text-xl font-medium mb-4">{t('preview.title')}</h2>

        <div className="grid grid-cols-2 gap-3 mb-4">
          <div>
            <label className="block text-sm font-medium mb-2">{t('source.select')}</label>
            <select onChange={(e) => setSource(e.target.value as 'XTB' | 'mBank')} className="select select-primary">
              <option value="XTB">{t('source.XTB')}</option>
              <option value="mBank">{t('source.mBank')}</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">{t('upload.selectFile')}</label>
            <input type="file" accept=".csv,.xlsx" onChange={handleFileChange} className="input input-bordered w-full" />
          </div>
        </div>

        {file && (
          <div className="mt-4 p-3 bg-muted-foreground/10 rounded">
            <p className="text-sm text-muted-foreground">
              {file.name}
            </p>
          </div>
        )}

        {rows.length === 0 && !isLoading && (
          <div className="mt-4 p-3 text-center text-muted-foreground">
            <p>{t('preview.noData')}</p>
          </div>
        )}

        {rows.length > 0 && (
          <div className="overflow-x-auto mt-2">
            <Table className="min-w-full border border-border">
              <TableHeader className="text-left text-xs text-muted-foreground">
                {headers.map((h: string, i: number) => (
                  <TableHead key={i} className="px-4 py-3 font-medium whitespace-nowrap bg-muted border-b border-border">
                    {h}
                  </TableHead>
                ))}
              </TableHeader>
              <TableBody className="divide-y divide-border">
                {rows.slice(0, 50).map((row: any, idx: number) => (
                  <TableRow key={idx} className="text-sm hover:bg-muted/50">
                    {headers.map((h: string, i: number) => (
                      <TableCell key={i} className="px-4 py-3 whitespace-normal max-w-xs overflow-hidden text-ellipsis">
                        {row[h] || ''}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
                {rows.length > 50 && (
                  <TableRow>
                    <TableCell colSpan={headers.length} className="text-muted-foreground text-sm px-4 py-3">
                      {rows.length - 50} more rows
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        )}

        <div className="mt-6">
          <button
            onClick={handleDownload}
            disabled={rows.length === 0 || isLoading}
            className="inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-primary text-primary-foreground hover:bg-primary/90 h-10 px-4 py-2"
          >
            {isLoading ? t('export.loading') : t('export.download')}
          </button>
          {isLoading && <Skeleton className="spinner spinner-small" aria-hidden={true} />}
        </div>

        <div className="mt-4">
          <p className="text-xs text-muted-foreground">
            {validation.valid} valid records
          </p>
          {validation.warning > 0 && (
            <p className="text-xs text-warning">
              {validation.warning} records with warnings
            </p>
          )}
          {validation.error > 0 && (
            <p className="text-xs text-destructive">
              {validation.error} records with errors
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}