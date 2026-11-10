import { useState, useEffect, useRef } from 'react';
import { readXLSXFile, readCSVFile } from '../lib/file-readers';
import { buildWealthfolioCsv, toActivityImport } from '../lib/sources/xtb';
import { deduplicateUpdateTransactions } from '../lib/sources/xtb/dedup';
import { convertXTBFiles } from '../lib/sources/xtb/report-converter';
import type { TickerResolutionView } from '../lib/sources/xtb/report-converter';
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

export function ConverterPage({ t, files, storage, accounts, activities, market, navigation }: { t: Translate; files: any; storage: any; accounts: any; activities: any; market?: any; navigation: any }) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [language, setLanguage] = useState<'en' | 'pl'>('en');
  const [accountList, setAccountList] = useState<any[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<string>('');
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
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
  const [tickerResolution, setTickerResolution] = useState<TickerResolutionView | null>(null);
  const [step, setStep] = useState(0);
  const [page, setPage] = useState(0);
  const [rawPage, setRawPage] = useState(0);
  const [selectedRows, setSelectedRows] = useState<Set<number>>(new Set());
  const [originalTransactions, setOriginalTransactions] = useState<any[] | null>(null);
  const [rawSearch, setRawSearch] = useState('');
  const [convertedSearch, setConvertedSearch] = useState('');
  const pageSize = 50;
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
    setTickerResolution(null);
    setValidation({ valid: 0, warning: 0, error: 0 });
  };

  const rebuildConverted = (txs: any[]) => {
    const csvText = buildWealthfolioCsv(txs);
    const lines = csvText.split(/\\r?\\n/).filter((line: string) => line.trim().length > 0);
    const wfHeaders = lines.length > 0 ? lines[0].split(',') : [];
    const wfRows = lines.slice(1).map((line: string) => {
      const values = line.split(',');
      const row: Record<string, string> = {};
      wfHeaders.forEach((header: string, index: number) => {
        row[header] = index < values.length ? values[index] : '';
      });
      return row;
    });
    setConvertedTransactions(txs);
    setWealthfolioCsv(csvText);
    setConvertedHeaders(wfHeaders);
    setConvertedRows(wfRows);
    setPage(0);
    setSelectedRows(new Set());
  };

  const removeTransaction = (index: number) => {
    const next = convertedTransactions.filter((_, i) => i !== index);
    rebuildConverted(next);
  };

  const removeFile = (index: number) => {
    const next = selectedFiles.filter((_, i) => i !== index);
    setSelectedFiles(next);
    if (next.length === 0) {
      resetResults();
      if (fileInputRef.current) fileInputRef.current.value = '';
    } else {
      handleFile(next);
    }
  };

  const toggleRowSelection = (index: number) => {
    setSelectedRows((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  const removeSelected = () => {
    const next = convertedTransactions.filter((_, i) => !selectedRows.has(i));
    rebuildConverted(next);
  };

  const resetEdits = () => {
    if (originalTransactions) rebuildConverted(originalTransactions);
  };

  const startOver = () => {
    setSelectedFiles([]);
    setSelectedAccountId('');
    setSource('XTB');
    setMode('initial');
    setStep(0);
    setPage(0);
    setRawPage(0);
    setRawSearch('');
    setConvertedSearch('');
    setSelectedRows(new Set());
    setOriginalTransactions(null);
    resetResults();
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleFile = async (selected: File[]) => {
    if (!selected || selected.length === 0) return;
    setSelectedFiles(selected);
    setRawPage(0);
    setRawSearch('');
    setConvertedSearch('');
    resetResults();
    // Use the first file for raw preview and mode inference.
    const first = selected[0];
    const name = first.name.toLowerCase();
    if (name.endsWith('.csv')) {
      try {
        const csvResult = await readCSVFile(first);
        if (!csvResult.errors || csvResult.errors.length === 0) {
          setRawHeaders(csvResult.headers || []);
          setRawRows(csvResult.rows || []);
        }
      } catch {
        // Keep raw preview empty if reading fails.
      }
    } else if (name.endsWith('.xlsx')) {
      try {
        const xlsxResult = await readXLSXFile(first);
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
    const selected = Array.from(e.dataTransfer.files || []);
    if (selected.length > 0) handleFile(selected);
  };

  const handleConvert = async () => {
    if (selectedFiles.length === 0) return;
    setIsLoading(true);
    setConvertedRows([]);
    setConvertedHeaders([]);
    setWealthfolioCsv('');
    setConvertedTransactions([]);
    setImportSummary('');
    setStatus('', 'info');
    setTickerResolution(null);
    setValidation({ valid: 0, warning: 0, error: 0 });
    const name = selectedFiles[0].name.toLowerCase();
    try {
      if (name.endsWith('.csv')) {
        const csvResult = await readCSVFile(selectedFiles[0]);
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
          // Parse all selected files and merge, deduplicating by XTB operation id.
          const conversion = await convertXTBFiles(selectedFiles, mode, market, tr);
          if (conversion.firstError && conversion.transactions.length === 0) {
            setValidation({ valid: 0, warning: 0, error: 1 });
            setStatus(conversion.firstError, 'error');
          } else {
            const reportTransactions = conversion.transactions;
            setTickerResolution(conversion.tickerResolution);

            let selectedTransactions = reportTransactions;
            if (mode === 'update' && activities && selectedAccountId) {
              try {
                const existing = await activities.getAll(selectedAccountId);
                selectedTransactions = deduplicateUpdateTransactions(reportTransactions, existing || []);
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
            setStep(1);
            setWealthfolioCsv(csvText);
            setConvertedTransactions(selectedTransactions);
            setOriginalTransactions(selectedTransactions);
            if (mode === 'update') {
              if (wfRows.length === 0) setStatus(tr('update.noNew'), 'warning');
              else {
                setStatus(tr('update.summary', { existing: reportTransactions.length - selectedTransactions.length, new: selectedTransactions.length }), 'success');
              }
            }
          }
        } else {
          const xlsxResult = await readXLSXFile(selectedFiles[0]);
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
      setStep(2);
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

  const rawFilteredCount = rawRows.filter((row) => !rawSearch || Object.values(row).some((v) => String(v ?? '').toLowerCase().includes(rawSearch.toLowerCase()))).length;
  const convertedEntries = convertedRows
    .map((row, idx) => ({ row, tx: convertedTransactions[idx], idx }))
    .filter(({ row }) => !convertedSearch || Object.values(row).some((v) => String(v ?? '').toLowerCase().includes(convertedSearch.toLowerCase())));
  const convertedFilteredCount = convertedEntries.length;

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
        <div className="mb-4 flex items-center gap-2">
          {[0, 1, 2].map((s, i) => (
            <div key={s} className="flex items-center gap-2">
              {i > 0 && <span className="text-muted-foreground">→</span>}
              <button
                type="button"
                disabled={s > step}
                onClick={() => s <= step && setStep(s)}
                className={`flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-colors ${
                  s === step
                    ? 'bg-primary text-primary-foreground shadow'
                    : s < step
                      ? 'bg-primary/10 text-primary'
                      : 'bg-muted text-muted-foreground'
                } disabled:cursor-not-allowed disabled:opacity-50`}
              >
                <span className={`flex h-6 w-6 items-center justify-center rounded-full text-xs ${s === step ? 'bg-primary-foreground text-primary' : s < step ? 'bg-primary text-primary-foreground' : 'bg-muted-foreground/20 text-muted-foreground'}`}>
                  {s < step ? '✓' : s + 1}
                </span>
                {s === 0 ? tr('wizard.step.setup') : s === 1 ? tr('wizard.step.review') : tr('wizard.step.export')}
              </button>
            </div>
          ))}
        </div>
        <Card className="overflow-visible">
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
            {step === 0 && (
              <>
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
                multiple
                className="hidden"
                onChange={(e) => {
                  const selected = Array.from(e.target.files || []);
                  if (selected.length > 0) handleFile(selected);
                }}
              />
              {selectedFiles.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {selectedFiles.map((f, idx) => (
                    <div key={idx} className="flex items-center gap-2 rounded-md border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
                      <span className="max-w-[200px] truncate">{f.name}</span>
                      <button type="button" className="text-muted-foreground hover:text-destructive" onClick={() => removeFile(idx)}>
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {selectedFiles.length > 0 && (
              <Button onClick={handleConvert} disabled={isLoading || !selectedAccountId}>
                {isLoading ? tr('export.loading') : tr('action.convert')}
              </Button>
            )}

            {isLoading && <Skeleton className="h-6 w-32" />}
              </>
            )}

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

            {step === 1 && (
              <>
            {advanced && rawRows.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-sm font-medium">{tr('raw.title')}</h3>
                <Input
                  placeholder={tr('search.placeholder')}
                  value={rawSearch}
                  onChange={(e) => { setRawSearch(e.target.value); setRawPage(0); }}
                />
                <div className="rounded-md border border-border" style={{ maxHeight: '420px', overflowY: 'scroll' }}>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="whitespace-nowrap">#</TableHead>
                        {rawHeaders.map((h, i) => (
                          <TableHead key={i} className="whitespace-nowrap">{h}</TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rawRows
                        .map((row, idx) => ({ row, idx }))
                        .filter(({ row }) => !rawSearch || Object.values(row).some((v) => String(v ?? '').toLowerCase().includes(rawSearch.toLowerCase())))
                        .slice(rawPage * pageSize, (rawPage + 1) * pageSize)
                        .map(({ row, idx }) => (
                        <TableRow key={idx}>
                          <TableCell className="whitespace-nowrap">{idx + 1}</TableCell>
                          {rawHeaders.map((h, i) => (
                            <TableCell key={i} className="max-w-xs truncate">{row[h] ?? ''}</TableCell>
                          ))}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  <div className="flex items-center justify-between px-4 py-2 text-sm text-muted-foreground">
                    <span>{tr('preview.rows', { count: rawRows.filter((row) => !rawSearch || Object.values(row).some((v) => String(v ?? '').toLowerCase().includes(rawSearch.toLowerCase()))).length })}</span>
                    <div className="flex items-center gap-2">
                      <Button variant="outline" size="sm" disabled={rawPage === 0} onClick={() => setRawPage((p) => Math.max(0, p - 1))}>
                        {tr('pagination.prev')}
                      </Button>
                      <span>
                        {rawPage + 1} / {Math.max(1, Math.ceil(rawFilteredCount / pageSize))}
                      </span>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={rawPage >= Math.ceil(rawFilteredCount / pageSize) - 1}
                        onClick={() => setRawPage((p) => Math.min(Math.ceil(rawFilteredCount / pageSize) - 1, p + 1))}
                      >
                        {tr('pagination.next')}
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {convertedRows.length > 0 && (
              <div className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-sm font-medium">{tr('converted.title')}</h3>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button variant="outline" size="sm" onClick={() => setSelectedRows(new Set(convertedEntries.map((e) => e.idx)))}>
                      Select all
                    </Button>
                    <Button variant="outline" size="sm" onClick={removeSelected} disabled={selectedRows.size === 0}>
                      Remove selected ({selectedRows.size})
                    </Button>
                    <Button variant="outline" size="sm" onClick={resetEdits} disabled={!originalTransactions}>
                      Reset edits
                    </Button>
                  </div>
                </div>
                <Input
                  placeholder={tr('search.placeholder')}
                  value={convertedSearch}
                  onChange={(e) => { setConvertedSearch(e.target.value); setPage(0); }}
                />
                <div className="rounded-md border border-border" style={{ maxHeight: '480px', overflowY: 'scroll' }}>
                  <Table>
                    <TableHeader className="sticky top-0 z-10 bg-background">
                      <TableRow>
                        <TableHead className="whitespace-nowrap">
                          <input
                            type="checkbox"
                            checked={convertedEntries.slice(page * pageSize, (page + 1) * pageSize).length > 0 && convertedEntries.slice(page * pageSize, (page + 1) * pageSize).every((e) => selectedRows.has(e.idx))}
                            onChange={(e) => {
                              const pageEntries = convertedEntries.slice(page * pageSize, (page + 1) * pageSize);
                              setSelectedRows((prev) => {
                                const next = new Set(prev);
                                if (e.target.checked) pageEntries.forEach((en) => next.add(en.idx));
                                else pageEntries.forEach((en) => next.delete(en.idx));
                                return next;
                              });
                            }}
                          />
                        </TableHead>
                        <TableHead className="whitespace-nowrap">#</TableHead>
                        {convertedHeaders.map((h, i) => (
                          <TableHead key={i} className="whitespace-nowrap">{h}</TableHead>
                        ))}
                        <TableHead className="whitespace-nowrap">Status</TableHead>
                        <TableHead className="whitespace-nowrap">{tr('review.remove')}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {convertedEntries.slice(page * pageSize, (page + 1) * pageSize).map((entry) => {
                        const globalIdx = entry.idx;
                        const row = entry.row;
                        return (
                        <TableRow key={globalIdx}>
                          <TableCell>
                            <input
                              type="checkbox"
                              checked={selectedRows.has(globalIdx)}
                              onChange={() => toggleRowSelection(globalIdx)}
                            />
                          </TableCell>
                          <TableCell className="whitespace-nowrap">{globalIdx + 1}</TableCell>
                          {convertedHeaders.map((h, i) => {
                            const field = h === 'quantity' ? 'quantity' : h === 'unitPrice' ? 'price' : h === 'amount' ? 'amount' : null;
                            if (field) {
                              return (
                                <TableCell key={i}>
                                  <Input
                                    type="number"
                                    className="h-8 w-24"
                                    value={convertedTransactions[globalIdx]?.[field] ?? ''}
                                    onChange={(e) => {
                                      const val = e.target.value;
                                      const next = convertedTransactions.map((tx, i2) =>
                                        i2 === globalIdx ? { ...tx, [field]: val === '' ? undefined : Number(val) } : tx
                                      );
                                      rebuildConverted(next);
                                    }}
                                  />
                                </TableCell>
                              );
                            }
                            return <TableCell key={i} className="max-w-xs truncate">{row[h] ?? ''}</TableCell>;
                          })}
                          <TableCell>
                            {(() => {
                              const tx = convertedTransactions[globalIdx];
                              const op = tx?.operationType;
                              const ok = op === 'BUY' || op === 'SELL' ? (Number(tx?.quantity) > 0 && Number(tx?.price) > 0) : true;
                              const reconciled = !!tx?.metadata?.reconciledFromOpenPositions;
                              return (
                                <span className={ok ? 'text-green-600' : 'text-yellow-600'}>
                                  {ok ? '✓' : '⚠'} {reconciled ? '★' : ''}
                                </span>
                              );
                            })()}
                          </TableCell>
                          <TableCell>
                            <Button variant="ghost" size="sm" onClick={() => removeTransaction(globalIdx)}>
                              {tr('review.remove')}
                            </Button>
                          </TableCell>
                        </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                  <div className="flex items-center justify-between px-4 py-2 text-sm text-muted-foreground">
                    <span>{tr('preview.rows', { count: convertedFilteredCount })}</span>
                    <div className="flex items-center gap-2">
                      <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))}>
                        {tr('pagination.prev')}
                      </Button>
                      <span>
                        {page + 1} / {Math.max(1, Math.ceil(convertedFilteredCount / pageSize))}
                      </span>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={page >= Math.ceil(convertedFilteredCount / pageSize) - 1}
                        onClick={() => setPage((p) => Math.min(Math.ceil(convertedFilteredCount / pageSize) - 1, p + 1))}
                      >
                        {tr('pagination.next')}
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            )}

              </>
            )}

            {step === 1 && convertedRows.length > 0 && (
              <div className="flex flex-wrap items-center gap-3">
                <Button onClick={() => setStep(2)}>{tr('wizard.step.export')}</Button>
              </div>
            )}

            {step === 2 && convertedRows.length > 0 && (
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

            {tickerResolution && (
              <div className={`rounded-md border px-3 py-2 text-sm ${tickerResolution.unresolved.length > 0 || tickerResolution.error ? 'border-yellow-500/40 bg-yellow-500/10 text-yellow-800 dark:text-yellow-300' : 'border-border bg-muted/40 text-muted-foreground'}`}>
                <p className="font-medium">{tr('tickerResolution.title')}</p>
                <p>{tr('tickerResolution.summary', {
                  checked: tickerResolution.checked,
                  changed: tickerResolution.changes.length,
                  unresolved: tickerResolution.unresolved.length,
                })}</p>
                {tickerResolution.changes.length > 0 && (
                  <ul className="mt-1 list-disc pl-5">
                    {tickerResolution.changes.map((change) => (
                      <li key={`${change.from}-${change.to}`}>{tr('tickerResolution.change', change)}</li>
                    ))}
                  </ul>
                )}
                {tickerResolution.unresolved.length > 0 && (
                  <p className="mt-1">{tr('tickerResolution.unresolved', { tickers: tickerResolution.unresolved.join(', ') })}</p>
                )}
                {tickerResolution.error && <p className="mt-1">{tickerResolution.error}</p>}
                <p className="mt-1 text-xs">{tr('tickerResolution.privacy')}</p>
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
