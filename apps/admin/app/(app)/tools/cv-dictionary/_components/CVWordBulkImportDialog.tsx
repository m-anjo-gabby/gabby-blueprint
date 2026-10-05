'use client';

import { useState, useRef } from 'react';
import Papa from 'papaparse';
import { useTranslations } from 'next-intl';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@gabby/lib/hooks/useToast';
import { Upload, AlertCircle, Loader2, CheckCircle2, FileUp, RefreshCcw, Download } from 'lucide-react';
import { bulkUpsertCVDictionary, getCVDictionaryKeys } from '@/actions/adminCVDictionaryAction';
import { useCVDictionaryStore } from '@/stores/useCVDictionaryStore';
import {
  CV_IMPORT_REQUIRED_HEADERS,
  CV_IMPORT_OPTIONAL_HEADERS,
  type CVImportEntry,
  type CVImportMode,
  type CVImportRowErrorCode,
  normalizeCVImportRow,
  validateCVImportEntry,
  isSameCVImportEntry,
  toCVEntryKey,
} from '@/lib/cvDictionaryImport';
import { cn } from '@/lib/utils';

// ============================================================
// 型
// ============================================================

type RowErrorCode = CVImportRowErrorCode | 'duplicateConflict';

/** new: 新規 / existing: 登録済み / duplicate: ファイル内で同一内容の重複（スキップ） / error: 取込不可 */
type RowStatus = 'new' | 'existing' | 'duplicate' | 'error';

interface ParsedRow {
  line: number;
  entry: CVImportEntry;
  status: RowStatus;
  errorCode?: RowErrorCode;
  /** duplicateConflict / duplicate の場合の先行行番号 */
  firstLine?: number;
}

interface CVWordBulkImportDialogProps {
  onSuccess?: () => void;
}

const MODES: CVImportMode[] = ['insertOnly', 'overwrite'];

// ============================================================
// Component
// ============================================================

export function CVWordBulkImportDialog({ onSuccess }: CVWordBulkImportDialogProps) {
  const t = useTranslations('tools.cvDictionary.bulkImportDialog');
  const { showToast } = useToast();
  const triggerRefresh = useCVDictionaryStore((s) => s.triggerRefresh);

  const [open, setOpen] = useState(false);
  const [data, setData] = useState<ParsedRow[]>([]);
  const [mode, setMode] = useState<CVImportMode>('insertOnly');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [hasCompleted, setHasCompleted] = useState(false);
  const [layoutError, setLayoutError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // ----------------------------------------------------------
  // ファイル解析
  // ----------------------------------------------------------

  const analyzeRows = async (rawRows: Record<string, string>[]) => {
    setIsAnalyzing(true);
    try {
      const existingKeys = new Set((await getCVDictionaryKeys()).map((k) => toCVEntryKey(k.word_en, k.part_of_speech)));
      const firstByKey = new Map<string, ParsedRow>();

      const rows = rawRows.map((raw, index): ParsedRow => {
        const line = index + 2;
        const entry = normalizeCVImportRow(raw);
        const errorCode = validateCVImportEntry(entry);
        if (errorCode) return { line, entry, status: 'error', errorCode };

        const key = toCVEntryKey(entry.word_en, entry.part_of_speech);
        const first = firstByKey.get(key);
        if (first) {
          return isSameCVImportEntry(first.entry, entry)
            ? { line, entry, status: 'duplicate', firstLine: first.line }
            : { line, entry, status: 'error', errorCode: 'duplicateConflict', firstLine: first.line };
        }

        const row: ParsedRow = { line, entry, status: existingKeys.has(key) ? 'existing' : 'new' };
        firstByKey.set(key, row);
        return row;
      });

      setData(rows);
      setHasCompleted(false);
    } catch {
      showToast(t('toastFetchKeysFailed'), 'error');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const processFile = (file: File) => {
    setLayoutError(null);

    const delimiter = file.name.endsWith('.tsv') ? '\t' : ',';

    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      delimiter,
      complete: (results) => {
        const headers = results.meta.fields ?? [];
        const missing = CV_IMPORT_REQUIRED_HEADERS.filter((h) => !headers.includes(h));

        if (missing.length > 0) {
          setLayoutError(t('missingHeaders', { headers: missing.join(', ') }));
          setData([]);
          return;
        }

        void analyzeRows(results.data);
      },
    });
  };

  const errorMessage = (row: ParsedRow): string => {
    const prefix = t('rowErrorPrefix', { line: row.line });
    if (row.errorCode === 'duplicateConflict') {
      return `${prefix}${t('errors.duplicateConflict', { line: row.firstLine ?? 0 })}`;
    }
    return `${prefix}${t(`errors.${row.errorCode ?? 'wordEnEmpty'}`)}`;
  };

  // ----------------------------------------------------------
  // 集計
  // ----------------------------------------------------------

  const errorItems = data.filter((d) => d.status === 'error');
  const newCount = data.filter((d) => d.status === 'new').length;
  const existingCount = data.filter((d) => d.status === 'existing').length;
  const duplicateCount = data.filter((d) => d.status === 'duplicate').length;
  const targetCount = mode === 'overwrite' ? newCount + existingCount : newCount;

  // ----------------------------------------------------------
  // インポート実行
  // ----------------------------------------------------------

  const handleImport = async () => {
    setIsProcessing(true);
    try {
      const entries = data.filter((r) => r.status === 'new' || r.status === 'existing').map((r) => r.entry);
      const result = await bulkUpsertCVDictionary(entries, mode);

      if (result.success) {
        showToast(
          t('toastImported', { inserted: result.inserted ?? 0, updated: result.updated ?? 0, skipped: result.skipped ?? 0 }),
          'success'
        );
        setHasCompleted(true);
        triggerRefresh();
        onSuccess?.();
      } else {
        showToast(result.message || t('toastSaveFailed'), 'error');
      }
    } catch {
      showToast(t('toastSystemError'), 'error');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleReset = () => {
    setData([]);
    setMode('insertOnly');
    setLayoutError(null);
    setHasCompleted(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // ============================================================
  // Render
  // ============================================================

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleReset(); setOpen(o); }}>
      <DialogTrigger asChild>
        <Button variant="outline" className="gap-1.5 border-dashed border-slate-300 hover:bg-slate-50 font-bold h-8 text-xs">
          <FileUp size={13} /> {t('button')}
        </Button>
      </DialogTrigger>

      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col p-0 overflow-hidden border-none shadow-2xl rounded-3xl focus:outline-none [&>button]:text-white [&>button]:opacity-70 [&>button:hover]:opacity-100 [&>button:focus]:ring-0 [&>button:focus]:outline-none">
        <span className="sr-only" tabIndex={0} />

        {/* ヘッダー */}
        <DialogHeader className="p-8 pr-14 bg-slate-900 text-white -mx-1 -mt-1 rounded-t-none border-b border-slate-800">
          <div className="flex justify-between items-start">
            <div className="space-y-1">
              <DialogTitle className="text-2xl font-black flex items-center gap-2">
                <FileUp className="text-brand-400" size={24} />
                {hasCompleted ? t('titleComplete') : t('titleNormal')}
              </DialogTitle>
              <p className="text-xs text-slate-400 font-medium">
                {t('subtitle')}
              </p>
            </div>
            <Button variant="outline" asChild className="border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white h-9 text-[11px] font-bold shrink-0">
              <a href="/templates/cv_dictionary_sample.tsv" download>
                <Download size={14} className="mr-2 text-brand-400" /> {t('downloadSample')}
              </a>
            </Button>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-hidden flex flex-col p-8 bg-white">
          {/* レイアウトエラー */}
          {layoutError && (
            <div className="mb-6 p-4 bg-rose-50 border border-rose-100 rounded-2xl flex items-start gap-3 text-rose-600 animate-in fade-in slide-in-from-top-2">
              <AlertCircle className="shrink-0 mt-0.5" size={20} />
              <div className="space-y-1">
                <p className="text-sm font-black">{t('layoutErrorTitle')}</p>
                <p className="text-xs font-medium leading-relaxed opacity-80">{layoutError}</p>
              </div>
            </div>
          )}

          {isAnalyzing ? (
            /* 解析中 */
            <div className="flex-1 flex flex-col items-center justify-center gap-3 text-slate-400">
              <Loader2 className="animate-spin" size={32} />
              <p className="text-sm font-bold">{t('analyzing')}</p>
            </div>
          ) : data.length === 0 ? (
            /* ドロップゾーン */
            <div
              className={cn(
                'flex-1 border-2 border-dashed rounded-[2.5rem] flex flex-col items-center justify-center p-12 gap-5 cursor-pointer transition-all duration-300',
                isDragging
                  ? 'border-brand-500 bg-brand-50/50 scale-[0.98]'
                  : 'border-slate-100 bg-slate-50/30 hover:bg-slate-50 hover:border-slate-200'
              )}
              onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={(e) => { e.preventDefault(); setIsDragging(false); const f = e.dataTransfer.files[0]; if (f) processFile(f); }}
              onClick={() => fileInputRef.current?.click()}
            >
              <div className="p-8 bg-white rounded-full shadow-sm border border-slate-100">
                <Upload className={cn('text-slate-300 transition-transform duration-500', isDragging && 'scale-125 text-brand-500')} size={48} />
              </div>
              <div className="text-center space-y-2">
                <p className="text-base font-black text-slate-700">{t('dropzoneTitle')}</p>
                <p className="text-xs text-slate-400 font-medium">{t('dropzoneHint')}</p>
                <p className="text-[11px] text-slate-300 font-mono mt-2">
                  {[...CV_IMPORT_REQUIRED_HEADERS, ...CV_IMPORT_OPTIONAL_HEADERS].join(' | ')}
                </p>
              </div>
              <input
                type="file"
                ref={fileInputRef}
                className="hidden"
                accept=".csv,.tsv,.txt"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) processFile(f); }}
              />
            </div>
          ) : (
            /* プレビューエリア */
            <div className="flex-1 flex flex-col gap-6 overflow-hidden animate-in fade-in zoom-in-95 duration-300">
              {/* サマリーカード */}
              <div className="grid grid-cols-4 gap-4">
                {[
                  { label: 'Total', val: data.length, color: 'text-slate-700' },
                  { label: 'New', val: newCount, color: 'text-emerald-600', bg: 'bg-emerald-50' },
                  { label: 'Existing', val: existingCount, color: 'text-brand', bg: 'bg-brand-50' },
                  errorItems.length > 0
                    ? { label: 'Errors', val: errorItems.length, color: 'text-rose-600', bg: 'bg-rose-50' }
                    : { label: 'Duplicates', val: duplicateCount, color: 'text-slate-500' },
                ].map((s) => (
                  <div key={s.label} className={cn('p-5 rounded-3xl border border-slate-100 flex flex-col bg-slate-50/50', s.bg)}>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">{s.label}</p>
                    <p className={cn('text-3xl font-black tracking-tight', s.color)}>{s.val}</p>
                  </div>
                ))}
              </div>

              {errorItems.length > 0 ? (
                /* エラーテーブル */
                <div className="flex-1 flex flex-col gap-3 overflow-hidden">
                  <div className="flex items-center gap-2 text-rose-600 px-1">
                    <AlertCircle size={16} />
                    <span className="text-sm font-black">{t('errorsOnlyLabel')}</span>
                  </div>
                  <div className="flex-1 overflow-auto border border-rose-100 rounded-2xl bg-white shadow-sm">
                    <Table>
                      <TableHeader className="bg-rose-50/50 sticky top-0 z-10">
                        <TableRow className="border-rose-100 hover:bg-transparent">
                          <TableHead className="text-[10px] font-black text-rose-700 uppercase w-32">word_en</TableHead>
                          <TableHead className="text-[10px] font-black text-rose-700 uppercase w-24">POS</TableHead>
                          <TableHead className="text-[10px] font-black text-rose-700 uppercase">Error</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {errorItems.map((item) => (
                          <TableRow key={item.line} className="hover:bg-rose-50/30 border-rose-50">
                            <TableCell className="font-black text-slate-800">{item.entry.word_en || t('emptyCell')}</TableCell>
                            <TableCell className="text-slate-500 font-medium">{item.entry.part_of_speech || t('emptyCell')}</TableCell>
                            <TableCell className="text-rose-500 text-xs font-bold italic">{errorMessage(item)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              ) : (
                /* OK状態 */
                <div className="flex-1 flex flex-col items-center justify-center border-2 border-dashed border-emerald-100 rounded-[2.5rem] bg-emerald-50/20 gap-5 p-10 text-center">
                  <div className="w-20 h-20 bg-white rounded-full flex items-center justify-center shadow-lg shadow-emerald-100 text-emerald-500">
                    <CheckCircle2 size={40} />
                  </div>
                  <div className="space-y-2">
                    <p className="text-xl font-black text-slate-800 tracking-tight">{t('readyTitle')}</p>
                    <p className="text-sm text-slate-500 font-medium leading-relaxed max-w-md mx-auto">
                      {t('readyBody', { count: data.length })}
                      {duplicateCount > 0 && <><br />{t('duplicateHint', { count: duplicateCount })}</>}
                    </p>
                  </div>

                  {/* 取込モード */}
                  {!hasCompleted && (
                    <div className="w-full max-w-md space-y-2">
                      <div className="grid grid-cols-2 gap-2 p-1 bg-slate-100 rounded-2xl">
                        {MODES.map((m) => (
                          <button
                            key={m}
                            type="button"
                            onClick={() => setMode(m)}
                            className={cn(
                              'h-10 rounded-xl text-xs font-black transition-all',
                              mode === m ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-400 hover:text-slate-600'
                            )}
                          >
                            {t(`mode.${m}`)}
                          </button>
                        ))}
                      </div>
                      <p className="text-xs text-slate-500 font-medium leading-relaxed">
                        {t(`modeHint.${mode}`, { newCount, existingCount })}
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* フッター */}
        <div className="bg-slate-50 p-6 flex justify-between items-center border-t border-slate-200">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleReset}
            disabled={isProcessing || isAnalyzing || data.length === 0}
            className="text-slate-400 hover:text-slate-600 font-bold hover:bg-slate-100 rounded-xl"
          >
            <RefreshCcw size={14} className="mr-2" /> {t('reset')}
          </Button>

          <div className="flex gap-3">
            <Button
              variant="outline"
              className="rounded-2xl px-8 font-bold border-slate-200 hover:bg-white h-12 shadow-sm"
              onClick={() => setOpen(false)}
              disabled={isProcessing}
            >
              {hasCompleted ? t('close') : t('cancel')}
            </Button>

            {!hasCompleted && (
              <Button
                size="lg"
                className="bg-slate-900 text-white px-12 rounded-2xl font-black h-12 shadow-xl shadow-slate-200 hover:bg-slate-800 transition-all active:scale-95 disabled:opacity-30"
                onClick={handleImport}
                disabled={isProcessing || isAnalyzing || targetCount === 0 || errorItems.length > 0}
              >
                {isProcessing ? (
                  <><Loader2 className="animate-spin mr-2" size={18} />Processing...</>
                ) : (
                  t('startImport', { count: targetCount })
                )}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
