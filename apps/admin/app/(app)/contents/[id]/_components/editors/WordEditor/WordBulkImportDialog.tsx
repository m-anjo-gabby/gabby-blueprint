'use client';

import { useState, useRef } from 'react';
import Papa from 'papaparse';
import { 
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger 
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { 
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow 
} from '@/components/ui/table';
import { useToast } from '@/hooks/useToast';
import { 
  Upload, AlertCircle, Loader2, CheckCircle2, FileUp, 
  RefreshCcw, Download, Info
} from 'lucide-react';
import { bulkUpsertWordsAndPhrases } from '@/actions/adminWordAction';
import { cn } from '@/lib/utils';
import { useWordStore } from '@/stores/useWordStore';

interface WordBulkImportDialogProps {
  contentId: string;
  onSuccess?: () => void;
}

const REQUIRED_HEADERS = ['word_en', 'word_ja', 'rank', 'phrase_en', 'phrase_ja', 'phrase_type'];

export function WordBulkImportDialog({ contentId, onSuccess }: WordBulkImportDialogProps) {
  const { showToast } = useToast();
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<any[]>([]); 
  const [isProcessing, setIsProcessing] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [hasCompleted, setHasCompleted] = useState(false);
  const [layoutError, setLayoutError] = useState<string | null>(null);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const triggerRefresh = useWordStore((state) => state.triggerRefresh);

  const processFile = (file: File) => {
    setLayoutError(null);
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const headers = results.meta.fields || [];
        const missing = REQUIRED_HEADERS.filter(h => !headers.includes(h));
        if (missing.length > 0) {
          setLayoutError(`不足項目: ${missing.join(', ')}`);
          setData([]);
          return;
        }

        const groupedMap = new Map();

        results.data.forEach((row: any, index: number) => {
          const wordEn = row.word_en?.trim();
          if (!wordEn && !row.word_ja) return;

          const error = validateRow(row, index);

          if (!groupedMap.has(wordEn)) {
            groupedMap.set(wordEn, {
              word_en: wordEn,
              word_ja: row.word_ja?.trim(),
              frequency_rank: Number(row.rank) || 999,
              phrases: [],
              isValid: !error,
              error: error || undefined
            });
          } else if (error) {
            const existing = groupedMap.get(wordEn);
            existing.isValid = false;
            existing.error = existing.error ? `${existing.error} / ${error}` : error;
          }

          if (row.phrase_en?.trim()) {
            groupedMap.get(wordEn).phrases.push({
              phrase_en: row.phrase_en.trim(),
              phrase_ja: row.phrase_ja?.trim(),
              phrase_type: Number(row.phrase_type) || 1,
            });
          }
        });

        const parsedResult = Array.from(groupedMap.values());
        setData(parsedResult);
        setHasCompleted(false);
      },
    });
  };

  const validateRow = (row: any, index: number): string | null => {
    const lineNum = index + 2;
    const prefix = `[${lineNum}行目]: `;
    if (row.word_en === undefined || row.phrase_type === undefined) {
      return `${prefix}列の数が足りません。カンマの数を確認してください。`;
    }
    const wordEn = row.word_en?.trim();
    const wordJa = row.word_ja?.trim();
    const rankRaw = row.rank?.trim();
    if (!wordEn) return `${prefix}単語(word_en)が空です。`;
    if (!wordJa) return `${prefix}和訳(word_ja)が空です。`;
    if (rankRaw && isNaN(Number(rankRaw))) {
      return `${prefix}ランクに数値以外が入力されています: "${rankRaw}"`;
    }
    return null;
  };

  const handleImport = async () => {
    setIsProcessing(true);
    try {
      const result = await bulkUpsertWordsAndPhrases(contentId, data);
      if (result.success) {
        showToast(`${data.length}件の単語を処理しました`, "success");
        setHasCompleted(true);
        triggerRefresh();
        onSuccess?.();
      } else {
        showToast(result.message || "保存中にエラーが発生しました", "error");
      }
    } catch (error) {
      showToast("システムエラーが発生しました", "error");
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

  const errorItems = data.filter(d => !d.isValid);
  const totalPhrases = data.reduce((sum, item) => sum + item.phrases.length, 0);

  return (
    <Dialog open={open} onOpenChange={(o) => { if(!o) handleReset(); setOpen(o); }}>
      <DialogTrigger asChild>
        <Button variant="outline" className="gap-2 border-dashed border-slate-300 hover:bg-slate-50 transition-all font-bold h-8 text-xs">
          <FileUp size={14} /> 一括登録
        </Button>
      </DialogTrigger>

      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col p-0 overflow-hidden border-none shadow-2xl rounded-3xl focus:outline-none [&>button]:text-white [&>button]:opacity-70 [&>button:hover]:opacity-100 [&>button:focus]:ring-0 [&>button:focus]:outline-none">
        
        <span className="sr-only" tabIndex={0} />

        {/* ヘッダーエリア: pr-12 で右側の×ボタンとの被りを防止 */}
        <DialogHeader className="p-8 pr-14 bg-slate-900 text-white -mx-1 -mt-1 rounded-t-none border-b border-slate-800">
          <div className="flex justify-between items-start">
            <div className="space-y-1">
              <DialogTitle className="text-2xl font-black flex items-center gap-2">
                 <FileUp className="text-indigo-400" size={24} /> 
                 {hasCompleted ? "インポート完了" : "単語・フレーズ一括登録"}
              </DialogTitle>
              <p className="text-xs text-slate-400 font-medium">
                教材データの一括Upsert。500件程度のデータも一括で処理可能です。
              </p>
            </div>
            <Button variant="outline" asChild className="border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white h-9 text-[11px] font-bold shrink-0">
              <a href="/templates/bulk_word_sample.csv" download>
                <Download size={14} className="mr-2 text-indigo-400" /> サンプルCSVをDL
              </a>
            </Button>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-hidden flex flex-col p-8 bg-white">
          {layoutError && (
            <div className="mb-6 p-4 bg-rose-50 border border-rose-100 rounded-2xl flex items-start gap-3 text-rose-600 animate-in fade-in slide-in-from-top-2">
              <AlertCircle className="shrink-0 mt-0.5" size={20} />
              <div className="space-y-1">
                <p className="text-sm font-black">CSVファイル構造のエラー</p>
                <p className="text-xs font-medium leading-relaxed opacity-80">{layoutError}</p>
              </div>
            </div>
          )}

          {data.length === 0 ? (
            <div
              className={cn(
                "flex-1 border-3 border-dashed rounded-[2.5rem] flex flex-col items-center justify-center p-12 gap-5 cursor-pointer transition-all duration-300",
                isDragging ? "border-indigo-500 bg-indigo-50/50 scale-[0.98]" : "border-slate-100 bg-slate-50/30 hover:bg-slate-50 hover:border-slate-200"
              )}
              onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={(e) => { e.preventDefault(); setIsDragging(false); const f = e.dataTransfer.files[0]; if(f) processFile(f); }}
              onClick={() => fileInputRef.current?.click()}
            >
              <div className="p-8 bg-white rounded-full shadow-sm border border-slate-100">
                <Upload className={cn("text-slate-300 transition-transform duration-500", isDragging && "scale-125 text-indigo-500")} size={48} />
              </div>
              <div className="text-center space-y-2">
                <p className="text-base font-black text-slate-700">CSVファイルをここにドロップ</p>
                <p className="text-xs text-slate-400 font-medium">またはクリックしてファイルを選択（最大500行程度を推奨）</p>
              </div>
              <input type="file" ref={fileInputRef} className="hidden" accept=".csv" onChange={(e) => { const f = e.target.files?.[0]; if(f) processFile(f); }} />
            </div>
          ) : (
            <div className="flex-1 flex flex-col gap-8 overflow-hidden animate-in fade-in zoom-in-95 duration-300">
              <div className="grid grid-cols-3 gap-6">
                {[
                  { label: "Total Words", val: data.length, color: "text-slate-600" },
                  { label: "Total Phrases", val: totalPhrases, color: "text-indigo-600" },
                  { 
                    label: errorItems.length > 0 ? "Errors Found" : "Status", 
                    val: errorItems.length > 0 ? `${errorItems.length}件` : "Clear", 
                    color: errorItems.length > 0 ? "text-rose-600" : "text-emerald-600",
                    bg: errorItems.length > 0 ? "bg-rose-50" : "bg-emerald-50" 
                  }
                ].map((s, i) => (
                  <div key={i} className={cn("p-5 rounded-3xl border border-slate-100 flex flex-col bg-slate-50/50", s.bg)}>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">{s.label}</p>
                    <p className={cn("text-3xl font-black tracking-tight", s.color)}>{s.val}</p>
                  </div>
                ))}
              </div>

              {errorItems.length > 0 ? (
                <div className="flex-1 flex flex-col gap-4 overflow-hidden">
                  <div className="flex items-center gap-2 text-rose-600 px-2">
                    <AlertCircle size={18} />
                    <span className="text-sm font-black">データ不備のある単語のみ表示しています</span>
                  </div>
                  <div className="flex-1 overflow-auto border border-rose-100 rounded-2xl bg-white shadow-sm">
                    <Table>
                      <TableHeader className="bg-rose-50/50 sticky top-0 z-10 backdrop-blur-md">
                        <TableRow className="border-rose-100 hover:bg-transparent">
                          <TableHead className="w-48 text-[10px] font-black text-rose-700 uppercase">Word (EN)</TableHead>
                          <TableHead className="text-[10px] font-black text-rose-700 uppercase">Error Message</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {errorItems.map((item, i) => (
                          <TableRow key={i} className="hover:bg-rose-50/30 border-rose-50">
                            <TableCell className="font-black text-slate-800">{item.word_en || "(空文字)"}</TableCell>
                            <TableCell className="text-rose-500 text-xs font-bold italic">{item.error}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center border-2 border-dashed border-emerald-100 rounded-[2.5rem] bg-emerald-50/20 gap-5 p-10 text-center">
                  <div className="w-20 h-20 bg-white rounded-full flex items-center justify-center shadow-lg shadow-emerald-100 text-emerald-500">
                    <CheckCircle2 size={40} />
                  </div>
                  <div className="space-y-2">
                    <p className="text-xl font-black text-slate-800 tracking-tight">Ready for Update!</p>
                    <p className="text-sm text-slate-500 font-medium leading-relaxed max-w-sm mx-auto">
                      すべてのデータが正常に読み込まれました。<br />
                      インポート時に既存のデータは上書きされます。
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="bg-slate-50 p-8 flex justify-between items-center border-t border-slate-200">
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={handleReset} 
            disabled={isProcessing || data.length === 0} 
            className="text-slate-400 hover:text-slate-600 font-bold hover:bg-slate-100 rounded-xl"
          >
            <RefreshCcw size={14} className="mr-2" /> リセット
          </Button>
          
          <div className="flex gap-4">
            <Button 
              variant="outline" 
              className="rounded-2xl px-8 font-bold border-slate-200 hover:bg-white transition-all h-12 shadow-sm" 
              onClick={() => setOpen(false)} 
              disabled={isProcessing}
            >
              {hasCompleted ? "閉じる" : "キャンセル"}
            </Button>
            
            {!hasCompleted && (
              <Button 
                size="lg" 
                className="bg-slate-900 text-white px-12 rounded-2xl font-black h-12 shadow-xl shadow-slate-200 hover:bg-slate-800 transition-all active:scale-95 disabled:opacity-30" 
                onClick={handleImport} 
                disabled={isProcessing || data.length === 0 || errorItems.length > 0}
              >
                {isProcessing ? (
                  <><Loader2 className="animate-spin mr-2" size={18} /> Processing...</>
                ) : (
                  "インポートを開始"
                )}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}