'use client';

import { useState, useRef } from 'react';
import Papa from 'papaparse';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@gabby/lib/hooks/useToast';
import { Upload, AlertCircle, Loader2, CheckCircle2, FileUp, RefreshCcw, Download } from 'lucide-react';
import { bulkUpsertCVDictionary } from '@/actions/adminCVDictionaryAction';
import { useCVDictionaryStore } from '@/stores/useCVDictionaryStore';
import { cn } from '@/lib/utils';

// ============================================================
// 定数
// ============================================================

const REQUIRED_HEADERS = [
  'word_en',
  'part_of_speech',
  'word_ja',
];

const OPTIONAL_HEADERS = [
  'syllables',
  'primary_stress_syllable',
  'stress_vowel_spelling',
  'cv_id',
  'phonetic_spelling',
];

// ============================================================
// 型
// ============================================================

interface ParsedRow {
  word_en: string;
  part_of_speech: string;
  word_ja: string;
  syllables?: string;
  primary_stress_syllable?: string;
  stress_vowel_spelling?: string;
  cv_id?: string;
  phonetic_spelling?: string;
  isValid: boolean;
  error?: string;
}

interface CVWordBulkImportDialogProps {
  onSuccess?: () => void;
}

// ============================================================
// Component
// ============================================================

export function CVWordBulkImportDialog({ onSuccess }: CVWordBulkImportDialogProps) {
  const { showToast } = useToast();
  const triggerRefresh = useCVDictionaryStore((s) => s.triggerRefresh);

  const [open, setOpen] = useState(false);
  const [data, setData] = useState<ParsedRow[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [hasCompleted, setHasCompleted] = useState(false);
  const [layoutError, setLayoutError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // ----------------------------------------------------------
  // ファイル解析
  // ----------------------------------------------------------

  const processFile = (file: File) => {
    setLayoutError(null);

    const delimiter = file.name.endsWith('.tsv') ? '\t' : ',';

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      delimiter,
      complete: (results) => {
        const headers = results.meta.fields ?? [];
        const missing = REQUIRED_HEADERS.filter((h) => !headers.includes(h));

        if (missing.length > 0) {
          setLayoutError(`必須列が不足しています: ${missing.join(', ')}`);
          setData([]);
          return;
        }

        const parsedRows: ParsedRow[] = (results.data as Record<string, string>[]).map((row, index) => {
          const error = validateRow(row, index);
          return {
            word_en: row.word_en?.trim() ?? '',
            part_of_speech: row.part_of_speech?.trim() ?? '',
            word_ja: row.word_ja?.trim() ?? '',
            syllables: row.syllables?.trim() || undefined,
            primary_stress_syllable: row.primary_stress_syllable?.trim() || undefined,
            stress_vowel_spelling: row.stress_vowel_spelling?.trim() || undefined,
            cv_id: row.cv_id?.trim() || undefined,
            phonetic_spelling: row.phonetic_spelling?.trim() || undefined,
            isValid: !error,
            error: error ?? undefined,
          };
        });

        setData(parsedRows);
        setHasCompleted(false);
      },
    });
  };

  const validateRow = (row: Record<string, string>, index: number): string | null => {
    const lineNum = index + 2;
    const prefix = `[${lineNum}行目]: `;
    if (!row.word_en?.trim()) return `${prefix}word_en が空です`;
    if (!row.part_of_speech?.trim()) return `${prefix}part_of_speech が空です`;
    if (!row.word_ja?.trim()) return `${prefix}word_ja が空です`;
    const stress = row.primary_stress_syllable?.trim();
    if (stress && isNaN(Number(stress))) return `${prefix}primary_stress_syllable に数値以外が含まれています`;
    return null;
  };

  // ----------------------------------------------------------
  // インポート実行
  // ----------------------------------------------------------

  const handleImport = async () => {
    setIsProcessing(true);
    try {
      const validRows = data.filter((r) => r.isValid);
      const result = await bulkUpsertCVDictionary(
        validRows.map((r) => ({
          word_en: r.word_en,
          part_of_speech: r.part_of_speech,
          word_ja: r.word_ja,
          syllables: r.syllables ?? null,
          primary_stress_syllable: r.primary_stress_syllable ? Number(r.primary_stress_syllable) : null,
          stress_vowel_spelling: r.stress_vowel_spelling ?? null,
          cv_id: r.cv_id ?? null,
          phonetic_spelling: r.phonetic_spelling ?? null,
        }))
      );

      if (result.success) {
        showToast(`${validRows.length}件を処理しました`, 'success');
        setHasCompleted(true);
        triggerRefresh();
        onSuccess?.();
      } else {
        showToast(result.message || '保存中にエラーが発生しました', 'error');
      }
    } catch {
      showToast('システムエラーが発生しました', 'error');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleReset = () => {
    setData([]);
    setLayoutError(null);
    setHasCompleted(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const errorItems = data.filter((d) => !d.isValid);
  const validCount = data.length - errorItems.length;

  // ============================================================
  // Render
  // ============================================================

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleReset(); setOpen(o); }}>
      <DialogTrigger asChild>
        <Button variant="outline" className="gap-1.5 border-dashed border-slate-300 hover:bg-slate-50 font-bold h-8 text-xs">
          <FileUp size={13} /> 一括登録
        </Button>
      </DialogTrigger>

      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col p-0 overflow-hidden border-none shadow-2xl rounded-3xl focus:outline-none [&>button]:text-white [&>button]:opacity-70 [&>button:hover]:opacity-100 [&>button:focus]:ring-0 [&>button:focus]:outline-none">
        <span className="sr-only" tabIndex={0} />

        {/* ヘッダー */}
        <DialogHeader className="p-8 pr-14 bg-slate-900 text-white -mx-1 -mt-1 rounded-t-none border-b border-slate-800">
          <div className="flex justify-between items-start">
            <div className="space-y-1">
              <DialogTitle className="text-2xl font-black flex items-center gap-2">
                <FileUp className="text-indigo-400" size={24} />
                {hasCompleted ? 'インポート完了' : 'CV辞書 一括登録'}
              </DialogTitle>
              <p className="text-xs text-slate-400 font-medium">
                TSV / CSV 形式。必須列: word_en, part_of_speech, word_ja
              </p>
            </div>
            <Button variant="outline" asChild className="border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white h-9 text-[11px] font-bold shrink-0">
              <a href="/templates/cv_dictionary_sample.tsv" download>
                <Download size={14} className="mr-2 text-indigo-400" /> サンプルDL
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
                <p className="text-sm font-black">ファイル構造のエラー</p>
                <p className="text-xs font-medium leading-relaxed opacity-80">{layoutError}</p>
              </div>
            </div>
          )}

          {data.length === 0 ? (
            /* ドロップゾーン */
            <div
              className={cn(
                'flex-1 border-2 border-dashed rounded-[2.5rem] flex flex-col items-center justify-center p-12 gap-5 cursor-pointer transition-all duration-300',
                isDragging
                  ? 'border-indigo-500 bg-indigo-50/50 scale-[0.98]'
                  : 'border-slate-100 bg-slate-50/30 hover:bg-slate-50 hover:border-slate-200'
              )}
              onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={(e) => { e.preventDefault(); setIsDragging(false); const f = e.dataTransfer.files[0]; if (f) processFile(f); }}
              onClick={() => fileInputRef.current?.click()}
            >
              <div className="p-8 bg-white rounded-full shadow-sm border border-slate-100">
                <Upload className={cn('text-slate-300 transition-transform duration-500', isDragging && 'scale-125 text-indigo-500')} size={48} />
              </div>
              <div className="text-center space-y-2">
                <p className="text-base font-black text-slate-700">TSV / CSV ファイルをここにドロップ</p>
                <p className="text-xs text-slate-400 font-medium">またはクリックしてファイルを選択</p>
                <p className="text-[11px] text-slate-300 font-mono mt-2">
                  {[...REQUIRED_HEADERS, ...OPTIONAL_HEADERS].join(' | ')}
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
              <div className="grid grid-cols-3 gap-4">
                {[
                  { label: 'Total Entries', val: data.length, color: 'text-slate-700' },
                  { label: 'Valid', val: validCount, color: 'text-emerald-600', bg: 'bg-emerald-50' },
                  {
                    label: errorItems.length > 0 ? 'Errors' : 'Status',
                    val: errorItems.length > 0 ? `${errorItems.length}件` : 'Clear',
                    color: errorItems.length > 0 ? 'text-rose-600' : 'text-emerald-600',
                    bg: errorItems.length > 0 ? 'bg-rose-50' : 'bg-emerald-50',
                  },
                ].map((s, i) => (
                  <div key={i} className={cn('p-5 rounded-3xl border border-slate-100 flex flex-col bg-slate-50/50', s.bg)}>
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
                    <span className="text-sm font-black">エラーのある行のみ表示</span>
                  </div>
                  <div className="flex-1 overflow-auto border border-rose-100 rounded-2xl bg-white shadow-sm">
                    <Table>
                      <TableHeader className="bg-rose-50/50 sticky top-0 z-10">
                        <TableRow className="border-rose-100 hover:bg-transparent">
                          <TableHead className="text-[10px] font-black text-rose-700 uppercase w-32">word_en</TableHead>
                          <TableHead className="text-[10px] font-black text-rose-700 uppercase w-32">POS</TableHead>
                          <TableHead className="text-[10px] font-black text-rose-700 uppercase">Error</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {errorItems.map((item, i) => (
                          <TableRow key={i} className="hover:bg-rose-50/30 border-rose-50">
                            <TableCell className="font-black text-slate-800">{item.word_en || '(空)'}</TableCell>
                            <TableCell className="text-slate-500 font-medium">{item.part_of_speech || '(空)'}</TableCell>
                            <TableCell className="text-rose-500 text-xs font-bold italic">{item.error}</TableCell>
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
                    <p className="text-xl font-black text-slate-800 tracking-tight">Ready for Import!</p>
                    <p className="text-sm text-slate-500 font-medium leading-relaxed max-w-sm mx-auto">
                      {data.length}件のデータが正常に読み込まれました。<br />
                      既存データはUpsert（上書き）されます。
                    </p>
                  </div>
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
            disabled={isProcessing || data.length === 0}
            className="text-slate-400 hover:text-slate-600 font-bold hover:bg-slate-100 rounded-xl"
          >
            <RefreshCcw size={14} className="mr-2" /> リセット
          </Button>

          <div className="flex gap-3">
            <Button
              variant="outline"
              className="rounded-2xl px-8 font-bold border-slate-200 hover:bg-white h-12 shadow-sm"
              onClick={() => setOpen(false)}
              disabled={isProcessing}
            >
              {hasCompleted ? '閉じる' : 'キャンセル'}
            </Button>

            {!hasCompleted && (
              <Button
                size="lg"
                className="bg-slate-900 text-white px-12 rounded-2xl font-black h-12 shadow-xl shadow-slate-200 hover:bg-slate-800 transition-all active:scale-95 disabled:opacity-30"
                onClick={handleImport}
                disabled={isProcessing || data.length === 0 || errorItems.length > 0}
              >
                {isProcessing ? (
                  <><Loader2 className="animate-spin mr-2" size={18} />Processing...</>
                ) : (
                  'インポートを開始'
                )}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
