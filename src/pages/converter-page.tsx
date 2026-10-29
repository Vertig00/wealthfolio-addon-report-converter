import { useState, useEffect, useRef } from 'react';
import { readXLSXFile, readCSVFile } from '../lib/file-readers';
import { parseXTBReport, buildWealthfolioCsv, toActivityImport } from '../lib/sources/xtb';
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@wealthfolio/ui';

function formatDate(d: any): string {
  if (!d) return '';
  if (d instanceof Date) return isNaN(d.getTime()) ? '' : d.toISOString().split('T')[0];
  return String(d);
}

export function ConverterPage({ t, files, storage, accounts, activities, navigation }: { t: (key: string) => string; files: any; storage: any; accounts: any; activities: any; navigation: any }) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [accountList, setAccountList] = useState<any[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<string>('');
  const [file, setFile] = useState<File | null>(null);
  const [source, setSource] = useState<'XTB' | 'mBank'>('XTB');
  const [mode, setMode] = useState<'initial' | 'update'>('initial');
  const [isDragging, setIsDragging] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [validation, setValidation] = useState<{ valid: number; warning: number; error: number }>({ valid: 0, warning: 0, error: 0 });
  const [rows, setRows] = useState<any[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [wealthfolioCsv, setWealthfolioCsv] = useState<string>('');
  const [convertedTransactions, setConvertedTransactions] = useState<any[]>([]);
  const [importSummary, setImportSummary] = useState<string>('');
  const [statusMessage, setStatusMessage] = useState<string>('');
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);

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

  useEffect(() => {
    if (!accounts) return;
    accounts.getAll().then((result: any[]) => {
      setAccountList(result || []);
      setSelectedAccountId('');
    }).catch(() => setAccountList([]));
  }, [accounts]);

  const resetResults = () => {
    setRows([]);
    setHeaders([]);
    setWealthfolioCsv('');
    setConvertedTransactions([]);
    setImportSummary('');
    setStatusMessage('');
    setValidation({ valid: 0, warning: 0, error: 0 });
  };

  const startOver = () => {
    setFile(null);
    setSelectedAccountId('');
    setSource('XTB');
    setMode('initial');
    resetResults();
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleFile = async (selected: File) => {
    setFile(selected);
    resetResults();
    const name = selected.name.toLowerCase();
    if (name.endsWith('.xlsx')) {
      try {
        const xlsxResult = await readXLSXFile(selected);
        const cashSheet = xlsxResult.sheets.find((sh: any) => sh.name === 'Cash Operations');
        if (cashSheet && cashSheet.rows.length >= 4) {
          const fromSerial = Number(cashSheet.rows[2][1]);
          const toSerial = Number(cashSheet.rows[3][1]);
          if (Number.isFinite(fromSerial) && Number.isFinite(toSerial)) {
            setMode(toSerial - fromSerial >= 180 ? 'initial' : 'update');
          }
        }
      } catch {
        // Keep the currently selected mode if inference fails.
      }
    }
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
            setStatusMessage(t('error.invalidCSV'));
          } else {
          setHeaders(csvResult.headers);
          setRows(csvResult.rows);
        }
      } else if (name.endsWith('.xlsx')) {
        if (source === 'XTB') {
          const xtbResult = await parseXTBReport(file, mode);
          if (xtbResult.error) {
            setValidation({ valid: 0, warning: 0, error: 1 });
            setStatusMessage(xtbResult.error);
          } else {
            const reportTransactions = xtbResult.transactions || [];
            let selectedTransactions = reportTransactions;
            if (mode === 'update' && activities && selectedAccountId) {
              try {
                const existing = await activities.getAll(selectedAccountId);
                const used = new Set<number>();
                const norm = (v: any) => {
                  const n = Number(v);
                  return isNaN(n) ? String(v ?? '') : n.toFixed(6);
                };
                const mapSymbol = (ticker: string) => {
                  if (ticker.endsWith('.PL')) return ticker.slice(0, -3) + '.WA';
                  if (ticker.endsWith('.UK')) return ticker.slice(0, -3) + '.L';
                  return ticker;
                };
                const isCashTx = (tx: any) => tx.operationType === 'INTEREST' || tx.operationType === 'DEPOSIT' || tx.operationType === 'WITHDRAWAL' || String(tx.ticker || '').startsWith('$CASH');
                const txKey = (tx: any) => {
                  const date = tx.date instanceof Date ? tx.date.toISOString().split('T')[0] : String(tx.date).split('T')[0];
                  const amt = norm(tx.amount);
                  const curr = tx.currency;
                  if (isCashTx(tx)) return `CASH|${tx.operationType}|${date}|${amt}|${curr}`;
                  const symbol = mapSymbol(String(tx.ticker || ''));
                  const qty = norm(tx.quantity);
                  return `TRADE|${tx.operationType}|${date}|${symbol}|${qty}|${curr}`;
                };
                const isCashActivity = (a: any) => a.activityType === 'INTEREST' || a.activityType === 'DEPOSIT' || a.activityType === 'WITHDRAWAL' || !a.assetSymbol;
                const activityKey = (a: any) => {
                  const date = a.date instanceof Date ? a.date.toISOString().split('T')[0] : String(a.date).split('T')[0];
                  const amt = norm(a.amount);
                  const curr = a.currency;
                  if (isCashActivity(a)) return `CASH|${a.activityType}|${date}|${amt}|${curr}`;
                  const qty = norm(a.quantity);
                  return `TRADE|${a.activityType}|${date}|${a.assetSymbol}|${qty}|${curr}`;
                };
                const activityKeys = (existing || []).map((a: any) => activityKey(a));
                selectedTransactions = reportTransactions.filter((tx: any) => {
                  // Exact source id match first.
                  for (let i = 0; i < (existing || []).length; i++) {
                    if (used.has(i)) continue;
                    if (existing[i].sourceRecordId && String(existing[i].sourceRecordId) === String(tx.id)) {
                      used.add(i);
                      return false;
                    }
                  }
                  const key = txKey(tx);
                  for (let i = 0; i < activityKeys.length; i++) {
                    if (used.has(i)) continue;
                    if (activityKeys[i] === key) {
                      used.add(i);
                      return false;
                    }
                  }
                  return true;
                });
              } catch {
                selectedTransactions = reportTransactions;
              }
            }
            const csvText = buildWealthfolioCsv(selectedTransactions);
            const lines = csvText.split(/\r?\n/).filter((line: string) => line.trim().length > 0);
            const wfHeaders = lines.length > 0 ? lines[0].split(',') : [];
            const wfRows = lines.slice(1).map((line: string) => {
              const values = line.split(',');
              const row: Record<string, string> = {};
              wfHeaders.forEach((header: string, index: number) => {
                row[header] = index < values.length ? values[index] : '';
              });
              return row;
            });
            setHeaders(wfHeaders);
            setRows(wfRows);
            setWealthfolioCsv(csvText);
            setConvertedTransactions(selectedTransactions);
            if (mode === 'update') {
              if (wfRows.length === 0) setStatusMessage(t('update.noNew'));
              else setStatusMessage('Update mode: ' + (reportTransactions.length - selectedTransactions.length) + ' existing/duplicate, ' + selectedTransactions.length + ' new');
            }
          }
        } else {
          const xlsxResult = await readXLSXFile(file);
          if (xlsxResult.error || xlsxResult.sheets.length === 0) {
            setValidation({ valid: 0, warning: 0, error: 1 });
            setStatusMessage(t('error.invalidXLSX'));
          } else {
            const first = xlsxResult.sheets[0];
            setHeaders(first.rows[0] || []);
            setRows(first.rows.slice(1));
          }
        }
      } else {
        setStatusMessage(t('error.unsupportedFormat'));
      }
    } catch (e) {
      setValidation({ valid: 0, warning: 0, error: 1 });
      setStatusMessage('Error reading file: ' + (e instanceof Error ? e.message : String(e)));
    } finally {
      setIsLoading(false);
    }
  };

  const handleDownload = async () => {
    if (rows.length === 0 && !wealthfolioCsv) {
      setStatusMessage(t('error.emptyFile'));
      return;
    }
    try {
      const csvContent = wealthfolioCsv || rows.map((row: any) => Object.values(row).map(v => String(v ?? '').includes(',') ? `"${String(v ?? '')}"` : String(v ?? '')).join(',')).join('\n');
      await files.openSaveDialog(csvContent, source + '_wealthfolio.csv');
    } catch (e) {
      setStatusMessage(t('export.error') + ': ' + (e instanceof Error ? e.message : String(e)));
    }
  };

  const handleImportClick = () => {
    if (!selectedAccountId || convertedTransactions.length === 0 || !activities) return;
    setIsConfirmOpen(true);
  };

  const performImport = async () => {
    setIsConfirmOpen(false);
    setIsImporting(true);
    setImportSummary('');
    try {
      if (mode === 'initial') {
        const existing = await activities.getAll(selectedAccountId);
        const deleteIds = (existing || []).map((a: any) => a.id);
        if (deleteIds.length > 0) {
          await activities.saveMany({ deleteIds });
        }
      }
      const imports = convertedTransactions.map((tx: any) => toActivityImport(tx, selectedAccountId));
      const checked = await activities.checkImport(imports);
      const invalid = (checked || []).filter((a: any) => a.isValid === false);
      if (invalid.length > 0) {
        const firstError = invalid[0]?.errors ? JSON.stringify(invalid[0].errors) : 'unknown';
        setStatusMessage('Import validation failed for ' + invalid.length + ' records: ' + firstError);
        return;
      }
      const result = await activities.import(checked || imports);
      const summary = result?.summary;
      const firstActivityError = (result?.activities || []).find((a: any) => a.errors && Object.keys(a.errors).length > 0);
      if (firstActivityError) {
        setStatusMessage('Import returned errors: ' + JSON.stringify(firstActivityError.errors));
      }
      setImportSummary(summary ? `Imported: ${summary.imported}, skipped: ${summary.skipped}, duplicates: ${summary.duplicates}` : 'Import completed');
      if (storage) {
        try {
          const raw = await storage.get('xtb.imported.operationIds.v2');
          const storedIds: string[] = raw ? JSON.parse(raw) : [];
          const importedIds = convertedTransactions.map((tx: any) => String(tx.id));
          const merged = mode === 'initial'
            ? importedIds
            : Array.from(new Set([...storedIds, ...importedIds]));
          await storage.set('xtb.imported.operationIds.v2', JSON.stringify(merged));
        } catch {
          // Import succeeded; checkpoint update failure should not hide the result.
        }
      }
      try {
        if (navigation && selectedAccountId) await navigation.navigate('/accounts/' + selectedAccountId);
      } catch {
        // Navigation is best-effort; import already succeeded.
      }
      startOver();
    } catch (e) {
      setStatusMessage('Import error: ' + (e instanceof Error ? e.message : String(e)));
    } finally {
      setIsImporting(false);
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
            <div className="space-y-2">
              <label className="text-sm font-medium">Account</label>
              <Select value={selectedAccountId} onValueChange={setSelectedAccountId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select account" />
                </SelectTrigger>
                <SelectContent>
                  {accountList.map((account: any) => (
                    <SelectItem key={account.id} value={account.id}>{account.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

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
                      <SelectItem value="initial">{t('import.initial')}</SelectItem>
                      <SelectItem value="update">{t('import.update')}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}

            {file && (
              <Button onClick={handleConvert} disabled={isLoading || !selectedAccountId}>
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
                <Button onClick={handleImportClick} disabled={isImporting || !selectedAccountId}>
                  {isImporting ? 'Importing...' : 'Import to account'}
                </Button>
                {validation.valid > 0 && <Badge variant="success">{validation.valid} {t('validation.valid')}</Badge>}
                {validation.warning > 0 && <Badge variant="warning">{validation.warning} {t('validation.warning')}</Badge>}
                {validation.error > 0 && <Badge variant="destructive">{validation.error} {t('validation.error')}</Badge>}
              </div>
            )}

            {statusMessage && (
              <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {statusMessage}
              </div>
            )}

            {importSummary && (
              <div className="rounded-md border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
                {importSummary}
              </div>
            )}

            <AlertDialog open={isConfirmOpen} onOpenChange={setIsConfirmOpen}>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>{mode === 'initial' ? 'Confirm initial import' : 'Confirm update import'}</AlertDialogTitle>
                  <AlertDialogDescription>
                    {mode === 'initial'
                      ? 'This will delete all existing activities in the selected account and import the converted records. Continue?'
                      : 'This will import ' + convertedTransactions.length + ' new records into the selected account. Existing activities will remain unchanged. Continue?'}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={performImport}>Import</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          <div className="flex justify-end">
            <Button variant="outline" onClick={startOver}>Start over</Button>
          </div>
          </CardContent>
        </Card>
      </PageContent>
    </Page>
  );
}
