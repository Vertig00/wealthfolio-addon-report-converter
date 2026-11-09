import { useState, useEffect, useRef } from 'react';
import { readXLSXFile, readCSVFile } from '../lib/file-readers';
import { parseXTBReport, buildWealthfolioCsv, toActivityImport, mapXTBSymbol, getWealthfolioSymbol } from '../lib/sources/xtb';
import { applyTickerResolutions, resolveTickerCandidates } from '../lib/market/ticker-resolver';
import type { TickerLookupInput } from '../lib/market/ticker-resolver';
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

interface TickerResolutionView {
  checked: number;
  changes: Array<{ from: string; to: string }>;
  unresolved: string[];
  error?: string;
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

  const startOver = () => {
    setSelectedFiles([]);
    setSelectedAccountId('');
    setSource('XTB');
    setMode('initial');
    resetResults();
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleFile = async (selected: File[]) => {
    if (!selected || selected.length === 0) return;
    setSelectedFiles(selected);
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
          const mergedTransactions: any[] = [];
          const seenIds = new Set<string>();
          let firstError: string | null = null;
          for (const f of selectedFiles) {
            const xtbResult = await parseXTBReport(f, mode);
            if (xtbResult.error) { firstError = xtbResult.error; continue; }
            for (const tx of (xtbResult.transactions || [])) {
              const id = String(tx.id || '');
              if (id && seenIds.has(id)) continue;
              if (id) seenIds.add(id);
              mergedTransactions.push(tx);
            }
          }
          if (firstError && mergedTransactions.length === 0) {
            setValidation({ valid: 0, warning: 0, error: 1 });
            setStatus(firstError, 'error');
          } else {
            const parsedTransactions = mergedTransactions;
            let reportTransactions = parsedTransactions;

            if (market?.searchTicker && parsedTransactions.length > 0) {
              const inputsByTicker = new Map<string, TickerLookupInput>();
              for (const tx of parsedTransactions) {
                const ticker = String(tx.ticker || '').trim();
                if (!ticker || ticker.startsWith('$CASH') || inputsByTicker.has(ticker)) continue;
                inputsByTicker.set(ticker, {
                  ticker,
                  fallbackSymbol: mapXTBSymbol(ticker),
                  instrumentName: typeof tx.metadata?.instrument === 'string' ? tx.metadata.instrument : undefined,
                  isin: tx.isin,
                  expectedCurrency: tx.currency,
                });
              }

              if (inputsByTicker.size > 0) {
                try {
                  const resolution = await resolveTickerCandidates(
                    Array.from(inputsByTicker.values()),
                    (query: string) => market.searchTicker(query),
                  );
                  reportTransactions = applyTickerResolutions(parsedTransactions, resolution.byTicker);
                  setTickerResolution({
                    checked: resolution.checked,
                    changes: resolution.changes.map((item) => ({ from: item.requestedTicker, to: item.symbol })),
                    unresolved: [...resolution.ambiguous, ...resolution.notFound, ...resolution.failed].map((item) => item.requestedTicker),
                    error: resolution.failed.length > 0
                      ? tr('tickerResolution.searchFailed', { count: resolution.failed.length })
                      : undefined,
                  });
                } catch (error) {
                  setTickerResolution({
                    checked: inputsByTicker.size,
                    changes: [],
                    unresolved: [],
                    error: tr('tickerResolution.error', { message: error instanceof Error ? error.message : String(error) }),
                  });
                }
              }
            }

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
                const mapSymbol = getWealthfolioSymbol;
                const isCashTx = (tx: any) => tx.operationType === 'INTEREST' || tx.operationType === 'DEPOSIT' || tx.operationType === 'WITHDRAWAL' || tx.operationType === 'TRANSFER' || tx.operationType === 'TAX_WITHHOLDING' || tx.operationType === 'FEE' || tx.operationType === 'DIVIDEND' || String(tx.ticker || '').startsWith('$CASH');
                const txKey = (tx: any) => {
                  const date = tx.date instanceof Date ? tx.date.toISOString().split('T')[0] : String(tx.date).split('T')[0];
                  const curr = tx.currency;
                  if (isCashTx(tx)) {
                    const type = tx.operationType === 'TRANSFER' ? ((Number(tx.amount) || 0) >= 0 ? 'TRANSFER_IN' : 'TRANSFER_OUT') : tx.operationType === 'TAX_WITHHOLDING' ? 'TAX' : tx.operationType === 'DIVIDEND' ? 'DIVIDEND' : tx.operationType;
                    // Use notes (not amount) as the distinguishing field: the converted
                    // native amount depends on the per-file FX resolution and may differ
                    // between imports, causing false negatives for dividends/tax.
                    const notes = String(tx.description || tx.comment || '').trim().toLowerCase();
                    return `CASH|${type}|${date}|${notes}|${curr}`;
                  }
                  const symbol = mapSymbol(tx);
                  const baseSymbol = symbol.replace(/\.(WA|L|DE|FR|AS|PA)$/i, '');
                  const qty = norm(tx.quantity);
                  return `TRADE|${tx.operationType}|${date}|${baseSymbol}|${qty}|${curr}`;
                };
                const isCashActivity = (a: any) => a.activityType === 'INTEREST' || a.activityType === 'DEPOSIT' || a.activityType === 'WITHDRAWAL' || a.activityType === 'TRANSFER_IN' || a.activityType === 'TRANSFER_OUT' || a.activityType === 'TAX' || a.activityType === 'FEE' || a.activityType === 'DIVIDEND' || !a.assetSymbol;
                const activityKey = (a: any) => {
                  const date = a.date instanceof Date ? a.date.toISOString().split('T')[0] : String(a.date).split('T')[0];
                  const curr = a.currency;
                  if (isCashActivity(a)) {
                    const notes = String(a.notes || a.comment || '').trim().toLowerCase();
                    return `CASH|${a.activityType}|${date}|${notes}|${curr}`;
                  }
                  const qty = norm(a.quantity);
                  const baseAssetSymbol = String(a.assetSymbol || '').replace(/\.(WA|L|DE|FR|AS|PA)$/i, '');
                  return `TRADE|${a.activityType}|${date}|${baseAssetSymbol}|${qty}|${curr}`;
                };
                const activityKeys = (existingActivities).map((a: any) => activityKey(a));
                selectedTransactions = reportTransactions.filter((tx: any) => {
                  // Exact source-record match (most reliable).
                  for (let i = 0; i < existingActivities.length; i++) {
                    if (used.has(i)) continue;
                    if (existingActivities[i].sourceRecordId && String(existingActivities[i].sourceRecordId) === String(tx.id)) {
                      used.add(i);
                      return false;
                    }
                  }
                  // Fuzzy key match.
                  const key = txKey(tx);
                  for (let i = 0; i < activityKeys.length; i++) {
                    if (used.has(i)) continue;
                    if (activityKeys[i] === key) {
                      used.add(i);
                      return false;
                    }
                  }
                  // Fallback: for cash activities, match by (type, date, currency)
                  // and a loose notes containment check, so that small formatting
                  // differences or FX-derived amount drift don't cause misses.
                  if (isCashTx(tx)) {
                    const txType = tx.operationType === 'TRANSFER' ? ((Number(tx.amount) || 0) >= 0 ? 'TRANSFER_IN' : 'TRANSFER_OUT') : tx.operationType === 'TAX_WITHHOLDING' ? 'TAX' : tx.operationType === 'DIVIDEND' ? 'DIVIDEND' : tx.operationType;
                    const txDate = tx.date instanceof Date ? tx.date.toISOString().split('T')[0] : String(tx.date).split('T')[0];
                    const txNotes = String(tx.description || tx.comment || '').trim().toLowerCase();
                    for (let i = 0; i < existingActivities.length; i++) {
                      if (used.has(i)) continue;
                      const a = existingActivities[i];
                      const aType = a.activityType;
                      if (aType !== txType) continue;
                      const aDate = a.date instanceof Date ? a.date.toISOString().split('T')[0] : String(a.date).split('T')[0];
                      if (aDate !== txDate) continue;
                      if (a.currency !== tx.currency) continue;
                      const aNotes = String(a.notes || a.comment || '').trim().toLowerCase();
                      // Match if one notes contains the other (handles minor formatting diffs).
                      if (txNotes && aNotes && (aNotes.includes(txNotes) || txNotes.includes(aNotes))) {
                        used.add(i);
                        return false;
                      }
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
                multiple
                className="hidden"
                onChange={(e) => {
                  const selected = Array.from(e.target.files || []);
                  if (selected.length > 0) handleFile(selected);
                }}
              />
              {selectedFiles.length > 0 && (
                <div className="rounded-md border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
                  {selectedFiles.length === 1 ? selectedFiles[0].name : `${selectedFiles.length} files: ${selectedFiles.map(f => f.name).join(', ')}`}
                </div>
              )}
            </div>

            {selectedFiles.length > 0 && (
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
