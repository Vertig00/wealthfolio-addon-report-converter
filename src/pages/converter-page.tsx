import { useState, useEffect, useRef } from 'react';
import { readXLSXFile, readCSVFile } from '../lib/file-readers';
import { parseXTBReport } from '../lib/sources/xtb';
import {
  Page,
  PageHeader,
  PageContent,
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  Button,
  Input,
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  Badge,
  EmptyPlaceholder,
  Skeleton,
} from '@wealthfolio/ui';

function formatDate(d: any): string {
  if (!d) return '';
  if (d instanceof Date) return isNaN(d.getTime()) ? '' : d.toISOString().split('T')[0];
  return String(d);
}

export function ConverterPage({ t, files }: { t: (key: string) => string; files: any }) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [source, setSource] = useState<'XTB' | 'mBank'>('XTB');
  const [mode, setMode] = useState<'initial' | 'update'>('update');
  const [isDragging, setIsDragging] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [validation, setValidation] = useState<{ valid: number; warning: number; error: number }>({ valid: 0, warning: 0, error: 0 });
  const [rows, setRows] = useState<any[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [wealthfolioCsv, setWealthfolioCsv] = useState<string>('');

  useEffect(() => {
    let valid = 0;
    let errorCount = 0;
    for (const row of rows) {
      const hasData = Object.values(row).some(v => v != null && v !== '');
      if (hasData) valid++;
      else errorCount++;
    }
    setValidation({ valid, warning: 0, error: errorCount });
  }, [rows]);

  const resetResults = () => {
    setRows([]);
    setHeaders([]);
    setWealthfolioCsv('');
    setValidation({ valid: 0, warning: 0, error: 0 });
  };

  const handleFile = (selected: File) => {
    setFile(selected);
    resetResults();
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const selected = e.dataTransfer.files?.[0];
    if (selected) handleFile(selected);
  };

  const handleConvert = async () => {
    if (!file) return;
    setIsLoading(true);
    resetResults();
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
            setWealthfolioCsv(xtbResult.wealthfolioCsv || '');
          }
        } else {
          const xlsxResult = await readXLSXFile(file);
          if (xlsxResult.error || xlsxResult.sheets.length === 0) {
            setValidation({ valid: 0, warning: 0, error: 1 });
            alert(t('error.invalidXLSX'));
          } else {
            const first = xlsxResult.sheets[0];
            setHeaders(first.rows[0] || []);
            setRows(first.rows.slice(1));
          }
        }
      } else {
        alert(t('error.unsupportedFormat'));
      }
    } catch (e) {
      setValidation({ valid: 0, warning: 0, error: 1 });
      alert('Error reading file: ' + (e instanceof Error ? e.message : String(e)));
    } finally {
      setIsLoading(false);
    }
  };

  const handleDownload = async () => {
    if (rows.length === 0 && !wealthfolioCsv) {
      alert(t('error.emptyFile'));
      return;
    }
    try {
      const csvContent = wealthfolioCsv || rows.map((row: any) => Object.values(row).map(v => String(v ?? '').includes(',') ? `"${String(v ?? '')}"` : String(v ?? '')).join(',')).join('\n');
      await files.openSaveDialog(csvContent, source + '_wealthfolio.csv');
    } catch (e) {
      alert(t('export.error') + ': ' + (e instanceof Error ? e.message : String(e)));
    }
  };

  return (
    <Page>
      <PageHeader heading={t('app.title')} text={t('upload.description')} />
      <PageContent withPadding>
        <Card>
          <CardHeader>
            <CardTitle>{t('preview.title')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div
              onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
              className={`flex flex-col items-center justify-center gap-3 rounded-md border-2 border-dashed p-6 text-center transition-colors ${isDragging ? 'border-primary bg-primary/5' : 'border-border'}`}
            >
              <p className="text-sm text-muted-foreground">{t('upload.dropZone')}</p>
              <Button type="button" onClick={() => fileInputRef.current?.click()}>
                {t('upload.selectFile')}
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.xlsx"
                className="hidden"
                onChange={(e) => {
                  const selected = e.target.files?.[0];
                  if (selected) handleFile(selected);
                }}
              />
              {file && (
                <div className="rounded-md border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
                  {file.name}
                </div>
              )}
            </div>

            {file && (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-sm font-medium">{t('source.select')}</label>
                  <Select value={source} onValueChange={(v) => setSource(v as 'XTB' | 'mBank')}>
                    <SelectTrigger>
                      <SelectValue placeholder={t('source.select')} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="XTB">{t('source.XTB')}</SelectItem>
                      <SelectItem value="mBank" disabled>{t('source.mBank')}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">{t('import.mode')}</label>
                  <Select value={mode} onValueChange={(v) => setMode(v as 'initial' | 'update')}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="initial" disabled>{t('import.initial')}</SelectItem>
                      <SelectItem value="update">{t('import.update')}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}

            {file && (
              <Button onClick={handleConvert} disabled={isLoading}>
                {isLoading ? t('export.loading') : t('action.convert')}
              </Button>
            )}

            {isLoading && <Skeleton className="h-6 w-32" />}

            {!isLoading && rows.length === 0 && (
              <EmptyPlaceholder
                title={t('emptyState.title')}
                description={t('emptyState.description')}
              />
            )}

            {rows.length > 0 && (
              <div className="overflow-x-auto rounded-md border border-border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      {headers.map((h, i) => (
                        <TableHead key={i} className="whitespace-nowrap">{h}</TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.slice(0, 50).map((row, idx) => (
                      <TableRow key={idx}>
                        {headers.map((h, i) => (
                          <TableCell key={i} className="max-w-xs truncate">{row[h] ?? ''}</TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                {rows.length > 50 && (
                  <div className="px-4 py-2 text-sm text-muted-foreground">
                    {t('preview.moreRows').replace('{count}', String(rows.length - 50))}
                  </div>
                )}
              </div>
            )}

            {rows.length > 0 && (
              <div className="flex items-center gap-3">
                <Button onClick={handleDownload}>
                  {t('export.download')}
                </Button>
                {validation.valid > 0 && <Badge variant="success">{validation.valid} {t('validation.valid')}</Badge>}
                {validation.warning > 0 && <Badge variant="warning">{validation.warning} {t('validation.warning')}</Badge>}
                {validation.error > 0 && <Badge variant="destructive">{validation.error} {t('validation.error')}</Badge>}
              </div>
            )}
          </CardContent>
        </Card>
      </PageContent>
    </Page>
  );
}
