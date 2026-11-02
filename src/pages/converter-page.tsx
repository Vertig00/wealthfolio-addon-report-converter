import { useState, useEffect, useRef } from 'react';
import { readXLSXFile, readCSVFile } from '../lib/file-readers';
import { parseXTBReport, buildWealthfolioCsv, toActivityImport } from '../lib/sources/xtb';
import { SearchableIconSelect } from '../components/searchable-icon-select';
import { TrendingUp, Wallet, CreditCard, Bitcoin, Building2 } from 'lucide-react';
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
  Switch,
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@wealthfolio/ui';

type Translate = (key: string, langOrVars?: string | Record<string, unknown> | null, vars?: Record<string, unknown>) => string;

function formatDate(d: any): string {
  if (!d) return '';
  if (d instanceof Date) return isNaN(d.getTime()) ? '' : d.toISOString().split('T')[0];
  return String(d);
}

export function ConverterPage({ t, files, storage, accounts, activities, navigation }: { t: Translate; files: any; storage: any; accounts: any; activities: any; navigation: any }) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [language, setLanguage] = useState<'en' | 'pl'>('en');
  const [accountList, setAccountList] = useState<any[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<string>('');
  const [file, setFile] = useState<File | null>(null);
  const [source, setSource] = useState<'XTB' | 'mBank'>('XTB');
  const [mode, setMode] = useState<'initial' | 'update'>('initial');
  const [isDragging, setIsDragging] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [validation, setValidation] = useState<{ valid: number; warning: number; error: number }>({ valid: 0, warning: 0, error: 0 });
  const [rawRows, setRawRows] = useState<any[]>([]);
  const [rawHeaders, setRawHeaders] = useState<string[]>([]);
  const [convertedRows, setConvertedRows] = useState<any[]>([]);
  const [convertedHeaders, setConvertedHeaders] = useState<string[]>([]);
  const [advanced, setAdvanced] = useState<boolean>(false);
  const [wealthfolioCsv, setWealthfolioCsv] = useState<string>('');
  const [convertedTransactions, setConvertedTransactions] = useState<any[]>([]);
  const [importSummary, setImportSummary] = useState<string>('');
  const [statusMessage, setStatusMessage] = useState<string>('');
  const [statusType, setStatusType] = useState<'info' | 'success' | 'warning' | 'error'>('info');
  const setStatus = (message: string, type: 'info' | 'success' | 'warning' | 'error' = 'info') => {
    setStatusMessage(message);
    setStatusType(type);
  };
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);

  const tr = (key: string, vars?: Record<string, unknown>) => t(key, language, vars);

  useEffect(() => {
    if (!storage) return;
    storage.get('ui.language').then((value: string | null) => {
      if (value === 'pl' || value === 'en') setLanguage(value);
    }).catch(() => undefined);
  }, [storage]);

  useEffect(() => {
    if (!storage) return;
    storage.get('ui.advanced').then((value: string | null) => {
      if (value === 'true') setAdvanced(true);
    }).catch(() => undefined);
  }, [storage]);

  const handleAdvancedChange = (value: boolean) => {
    setAdvanced(value);
    storage?.set('ui.advanced', String(value)).catch(() => undefined);
  };

  const handleLanguageChange = (value: string) => {
    const next = value === 'pl' ? 'pl' : 'en';
    setLanguage(next);
    storage?.set('ui.language', next).catch(() => undefined);
  };

  useEffect(() => {
    let valid = 0;
    let errorCount = 0;
    for (const row of convertedRows) {
      const hasData = Object.values(row).some(v => v != null && v !== '');
      if (hasData) valid++;
      else errorCount++;
    }
    setValidation({ valid, warning: 0, error: errorCount });
  }, [convertedRows]);

  useEffect(() => {
    if (!accounts) return;
    accounts.getAll().then((result: any[]) => {
      setAccountList(result || []);
      setSelectedAccountId('');
    }).catch(() => setAccountList([]));
  }, [accounts]);

  const resetResults = () => {
    setRawRows([]);
    setRawHeaders([]);
    setConvertedRows([]);
    setConvertedHeaders([]);
    setWealthfolioCsv('');
    setConvertedTransactions([]);
    setImportSummary('');
    setStatus('');
    setStatusType('info');
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
    if (name.endsWith('.csv')) {
      try {
        const csvResult = await readCSVFile(selected);
        if (!csvResult.errors || csvResult.errors.length === 0) {
          setRawHeaders(csvResult.headers || []);
          setRawRows(csvResult.rows || []);
        }
      } catch {
        // Keep raw preview empty if reading fails.
      }
    } else if (name.endsWith('.xlsx')) {
      try {
        const xlsxResult = await readXLSXFile(selected);
        if (!xlsxResult.error && xlsxResult.sheets && xlsxResult.sheets.length > 0) {
          const cashSheet = xlsxResult.sheets.find((sh: any) => sh.name === 'Cash Operations');
          const sheet = cashSheet || xlsxResult.sheets[0];
          if (sheet && Array.isArray(sheet.rows) && sheet.rows.length > 0) {
            const isCash = sheet.name === 'Cash Operations';
            const headerIndex = isCash && sheet.rows.length >= 5 ? 4 : 0;
            const rawHeadersRow = sheet.rows[headerIndex] || [];
            let lastHeader = rawHeadersRow.length - 1;
            while (lastHeader >= 0 && (rawHeadersRow[lastHeader] === '' || rawHeadersRow[lastHeader] == null)) lastHeader -= 1;
            const headers = rawHeadersRow.slice(0, lastHeader + 1);
            const dataRows = sheet.rows.slice(headerIndex + 1).map((row: any[]) => {
              const obj: Record<string, any> = {};
              headers.forEach((header: any, index: number) => {
                obj[String(header ?? index)] = index < row.length ? row[index] : '';
              });
              return obj;
            });
            setRawHeaders(headers);
            setRawRows(dataRows);
          }
        }
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
    setConvertedRows([]);
    setConvertedHeaders([]);
    setWealthfolioCsv('');
    setConvertedTransactions([]);
    setImportSummary('');
    setStatus('', 'info');
    setValidation({ valid: 0, warning: 0, error: 0 });
    const name = file.name.toLowerCase();
    try {
      if (name.endsWith('.csv')) {
        const csvResult = await readCSVFile(file);
        if (csvResult.errors.length > 0) {
          setValidation({ valid: 0, warning: 0, error: csvResult.errors.length });
          setStatus(tr('error.invalidCSV'), 'error');
        } else {
          setConvertedHeaders(csvResult.headers);
          setConvertedRows(csvResult.rows);
          setStatus(tr('status.converted', { count: csvResult.rows.length }), 'success');
        }
      } else if (name.endsWith('.xlsx')) {
        if (source === 'XTB') {
          const xtbResult = await parseXTBReport(file, mode);
          if (xtbResult.error) {
            setValidation({ valid: 0, warning: 0, error: 1 });
            setStatus(xtbResult.error, 'error');
          } else {
            const reportTransactions = xtbResult.transactions || [];
            let selectedTransactions = reportTransactions;
            let existingActivities: any[] = [];
            if (mode === 'update' && activities && selectedAccountId) {
              try {
                const existing = await activities.getAll(selectedAccountId);
                existingActivities = existing || [];
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
                  const baseSymbol = symbol.replace(/\.(WA|L|DE|FR)$/i, '');
                  const qty = norm(tx.quantity);
                  return `TRADE|${tx.operationType}|${date}|${baseSymbol}|${qty}|${curr}`;
                };
                const isCashActivity = (a: any) => a.activityType === 'INTEREST' || a.activityType === 'DEPOSIT' || a.activityType === 'WITHDRAWAL' || !a.assetSymbol;
                const activityKey = (a: any) => {
                  const date = a.date instanceof Date ? a.date.toISOString().split('T')[0] : String(a.date).split('T')[0];
                  const amt = norm(a.amount);
                  const curr = a.currency;
                  if (isCashActivity(a)) return `CASH|${a.activityType}|${date}|${amt}|${curr}`;
                  const qty = norm(a.quantity);
                  const baseAssetSymbol = String(a.assetSymbol || '').replace(/\.(WA|L|DE|FR)$/i, '');
                  return `TRADE|${a.activityType}|${date}|${baseAssetSymbol}|${qty}|${curr}`;
                };
                const activityKeys = (existingActivities).map((a: any) => activityKey(a));
                selectedTransactions = reportTransactions.filter((tx: any) => {
                  for (let i = 0; i < existingActivities.length; i++) {
                    if (used.has(i)) continue;
                    if (existingActivities[i].sourceRecordId && String(existingActivities[i].sourceRecordId) === String(tx.id)) {
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
            setConvertedHeaders(wfHeaders);
            setConvertedRows(wfRows);
            setStatus(tr('status.converted', { count: wfRows.length }), 'success');
            setWealthfolioCsv(csvText);
            setConvertedTransactions(selectedTransactions);
            if (mode === 'update') {
              if (wfRows.length === 0) setStatus(tr('update.noNew'), 'warning');
              else {
                setStatus(tr('update.summary', { existing: reportTransactions.length - selectedTransactions.length, new: selectedTransactions.length }), 'success');
              }
            }
          }
        } else {
          const xlsxResult = await readXLSXFile(file);
          if (xlsxResult.error || xlsxResult.sheets.length === 0) {
            setValidation({ valid: 0, warning: 0, error: 1 });
            setStatus(tr('error.invalidXLSX'), 'error');
          } else {
            const first = xlsxResult.sheets[0];
            setConvertedHeaders(first.rows[0] || []);
            setConvertedRows(first.rows.slice(1));
            setStatus(tr('status.converted', { count: Math.max(0, (first.rows || []).length - 1) }), 'success');
          }
        }
      } else {
        setStatus(tr('error.unsupportedFormat'), 'error');
      }
    } catch (e) {
      setValidation({ valid: 0, warning: 0, error: 1 });
      setStatus(tr('error.readingFile', { message: e instanceof Error ? e.message : String(e) }), 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDownload = async () => {
    if (convertedRows.length === 0 && !wealthfolioCsv) {
      setStatus(tr('error.emptyFile'), 'error');
      return;
    }
    try {
      const csvContent = wealthfolioCsv || convertedRows.map((row: any) => Object.values(row).map(v => String(v ?? '').includes(',') ? `"${String(v ?? '')}"` : String(v ?? '')).join(',')).join('\n');
      await files.openSaveDialog(csvContent, source + '_wealthfolio.csv');
    } catch (e) {
      setStatus(tr('export.error') + ': ' + (e instanceof Error ? e.message : String(e)), 'error');
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
        setStatus(tr('import.validationFailed', { count: invalid.length, error: firstError }), 'error');
        return;
      }
      const result = await activities.import(checked || imports);
      const summary = result?.summary;
      const firstActivityError = (result?.activities || []).find((a: any) => a.errors && Object.keys(a.errors).length > 0);
      if (firstActivityError) {
        setStatus(tr('import.returnedErrors', { error: JSON.stringify(firstActivityError.errors) }), 'error');
      }
      setImportSummary(summary ? tr('import.summary', { imported: summary.imported, skipped: summary.skipped, duplicates: summary.duplicates }) : tr('import.completed'));
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
      setStatus(tr('import.error', { message: e instanceof Error ? e.message : String(e) }), 'error');
    } finally {
      setIsImporting(false);
    }
  };

  const statusClass =
    statusType === 'success'
      ? 'border-green-500/40 bg-green-500/10 text-green-700 dark:text-green-400'
      : statusType === 'warning'
        ? 'border-yellow-500/40 bg-yellow-500/10 text-yellow-700 dark:text-yellow-400'
        : statusType === 'error'
          ? 'border-destructive/40 bg-destructive/10 text-destructive'
          : 'border-border bg-muted/40 text-muted-foreground';

  return (
    <Page>
      <PageHeader heading={tr('app.title')} text={tr('upload.description')} />
      <PageContent withPadding>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle>{tr('preview.title')}</CardTitle>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">{tr('language.select')}</span>
              <Select value={language} onValueChange={handleLanguageChange}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="en">{tr('language.english')}</SelectItem>
                  <SelectItem value="pl">{tr('language.polish')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <label className="text-sm font-medium">{tr('account.label')}</label>
                <SearchableIconSelect
                  options={accountList.map((account: any) => ({
                    value: account.id,
                    label: account.name,
                    icon: account.accountType === 'SECURITIES' ? <TrendingUp className="h-4 w-4" /> : account.accountType === 'CREDIT_CARD' ? <CreditCard className="h-4 w-4" /> : account.accountType === 'CRYPTOCURRENCY' ? <Bitcoin className="h-4 w-4" /> : <Wallet className="h-4 w-4" />,
                  }))}
                  value={selectedAccountId}
                  onValueChange={setSelectedAccountId}
                  placeholder={tr('account.placeholder')}
                  searchPlaceholder={tr('search.placeholder')}
                  emptyMessage={tr('account.none')}
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">{tr('source.select')}</label>
                <SearchableIconSelect
                  options={[
                    { value: 'XTB', label: tr('source.XTB'), icon: <TrendingUp className="h-4 w-4" /> },
                    { value: 'mBank', label: tr('source.mBank'), icon: <Building2 className="h-4 w-4" />, disabled: true },
                  ]}
                  value={source}
                  onValueChange={(v) => setSource(v as 'XTB' | 'mBank')}
                  placeholder={tr('source.select')}
                  searchPlaceholder={tr('search.placeholder')}
                  emptyMessage={tr('source.empty')}
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">{tr('import.mode')}</label>
                <Select value={mode} onValueChange={(v) => setMode(v as 'initial' | 'update')}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="initial">{tr('import.initial')}</SelectItem>
                    <SelectItem value="update">{tr('import.update')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div
              onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
              className={`flex flex-col items-center justify-center gap-3 rounded-md border-2 border-dashed p-6 text-center transition-colors ${isDragging ? 'border-primary bg-primary/5' : 'border-border'}`}
            >
              <p className="text-sm text-muted-foreground">{tr('upload.dropZone')}</p>
              <Button type="button" onClick={() => fileInputRef.current?.click()}>
                {tr('upload.selectFile')}
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
              <Button onClick={handleConvert} disabled={isLoading || !selectedAccountId}>
                {isLoading ? tr('export.loading') : tr('action.convert')}
              </Button>
            )}

            {isLoading && <Skeleton className="h-6 w-32" />}

            <div className="flex items-center justify-between rounded-md border border-border bg-muted/30 px-3 py-2">
              <div className="space-y-0.5">
                <label className="text-sm font-medium">{tr('advanced.label')}</label>
                <p className="text-xs text-muted-foreground">{tr('advanced.description')}</p>
              </div>
              <Switch checked={advanced} onCheckedChange={handleAdvancedChange} />
            </div>

            {!isLoading && convertedRows.length === 0 && rawRows.length === 0 && (
              <EmptyPlaceholder
                title={tr('emptyState.title')}
                description={tr('emptyState.description')}
              />
            )}

            {advanced && rawRows.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-sm font-medium">{tr('raw.title')}</h3>
                <div className="overflow-auto rounded-md border border-border max-h-[420px]">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        {rawHeaders.map((h, i) => (
                          <TableHead key={i} className="whitespace-nowrap">{h}</TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rawRows.slice(0, 100).map((row, idx) => (
                        <TableRow key={idx}>
                          {rawHeaders.map((h, i) => (
                            <TableCell key={i} className="max-w-xs truncate">{row[h] ?? ''}</TableCell>
                          ))}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  {rawRows.length > 100 && (
                    <div className="px-4 py-2 text-sm text-muted-foreground">
                      {tr('preview.moreRows', { count: rawRows.length - 100 })}
                    </div>
                  )}
                </div>
              </div>
            )}

            {convertedRows.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-sm font-medium">{tr('converted.title')}</h3>
                <div className="overflow-auto rounded-md border border-border max-h-[420px]">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        {convertedHeaders.map((h, i) => (
                          <TableHead key={i} className="whitespace-nowrap">{h}</TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {convertedRows.slice(0, 100).map((row, idx) => (
                        <TableRow key={idx}>
                          {convertedHeaders.map((h, i) => (
                            <TableCell key={i} className="max-w-xs truncate">{row[h] ?? ''}</TableCell>
                          ))}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  {convertedRows.length > 100 && (
                    <div className="px-4 py-2 text-sm text-muted-foreground">
                      {tr('preview.moreRows', { count: convertedRows.length - 100 })}
                    </div>
                  )}
                </div>
              </div>
            )}

            {convertedRows.length > 0 && (
              <div className="flex flex-wrap items-center gap-3">
                <Button onClick={handleDownload}>
                  {tr('export.download')}
                </Button>
                <Button onClick={handleImportClick} disabled={isImporting || !selectedAccountId}>
                  {isImporting ? tr('import.importing') : tr('import.button')}
                </Button>
                {validation.valid > 0 && <Badge variant="success">{validation.valid} {tr('validation.valid')}</Badge>}
                {validation.warning > 0 && <Badge variant="warning">{validation.warning} {tr('validation.warning')}</Badge>}
                {validation.error > 0 && <Badge variant="destructive">{validation.error} {tr('validation.error')}</Badge>}
              </div>
            )}

            {statusMessage && (
              <div className={`rounded-md border px-3 py-2 text-sm ${statusClass}`}>
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
                  <AlertDialogTitle>{mode === 'initial' ? tr('import.confirm.initial.title') : tr('import.confirm.update.title')}</AlertDialogTitle>
                  <AlertDialogDescription>
                    {mode === 'initial'
                      ? tr('import.confirm.initial.description', { count: convertedTransactions.length })
                      : tr('import.confirm.update.description', { count: convertedTransactions.length })}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>{tr('import.confirm.cancel')}</AlertDialogCancel>
                  <AlertDialogAction onClick={performImport}>{tr('import.confirm.action')}</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>

            <div className="flex justify-end">
              <Button variant="outline" onClick={startOver}>{tr('startOver')}</Button>
            </div>
          </CardContent>
        </Card>
      </PageContent>
    </Page>
  );
}
