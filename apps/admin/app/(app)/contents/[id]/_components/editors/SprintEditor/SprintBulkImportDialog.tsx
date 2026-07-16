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
import { useToast } from '@gabby/lib/hooks/useToast';
import { 
  Upload, AlertCircle, Loader2, CheckCircle2, FileUp, 
  RefreshCcw, Download
} from 'lucide-react';
import { bulkImportSprintQuestions } from '@/actions/adminSprintAction';
import { cn } from '@/lib/utils';
import { SprintQuestionType, SprintQuestion } from '@gabby/types/sprint';

interface SprintBulkImportDialogProps {
  contentId: string;
  type: SprintQuestionType;
  level: number;
  onSuccess?: () => void;
}

// 💡 TSVヘッダーの定義
const REQUIRED_HEADERS = [
  'seq_no',
  'tsv_group_id', // グループを識別するための仮の番号（Speed以外で必須）
  'statement_en',
  'statement_ja',
  'question_en',
  'question_ja',
  'answer_sentence_yes_en',
  'answer_sentence_yes_ja',
  'answer_sentence_no_en',  // Speedでのみ必須、他は任意
  'answer_sentence_no_ja'
];

export function SprintBulkImportDialog({ contentId, type, level, onSuccess }: SprintBulkImportDialogProps) {
  const { showToast } = useToast();
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<any[]>([]); 

  const handleOpenChange = (nextOpen: boolean) => {
    if (nextOpen) {
      handleReset();
    }
    setOpen(nextOpen);
  }; 
  const [isProcessing, setIsProcessing] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [hasCompleted, setHasCompleted] = useState(false);
  const [layoutError, setLayoutError] = useState<string | null>(null);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isSpeed = type === '0';
  const isMastery = type === '6';

  const processFile = (file: File) => {
    setLayoutError(null);
    Papa.parse(file, {
      header: true,
      delimiter: "\t", // 💡 タブ区切り (TSV) を明示
      quoteChar: "",   // 💡 ダブルクォーテーションをフィールド囲み文字として処理しない
      escapeChar: "",  // 💡 エスケープ文字の処理を無効化
      skipEmptyLines: true,
      error: (error) => {
        setLayoutError(`TSVパースエラー: ${error.message}`);
        setData([]);
      },
      complete: (results) => {
        const headers = results.meta.fields || [];
        const missing = REQUIRED_HEADERS.filter(h => !headers.includes(h));
        
        if (missing.length > 0) {
          setLayoutError(`不足項目: ${missing.join(', ')}`);
          setData([]);
          return;
        }

        // TSVグループIDと新しく生成したUUIDをマッピングする一時Map
        const groupUuidMap = new Map<string, string>();
        // Mastery用のグループごとの1件目のStatement保持Map
        const masteryStatementMap = new Map<string, { en: string; ja: string }>();

        // 1周目のループ: バリデーション & Mastery用の共通Statement収集
        const validatedRows = results.data.map((row: any, index: number) => {
          const error = validateRow(row, index);
          
          const tsvGroupId = row.tsv_group_id?.trim();
          const statementEn = row.statement_en?.trim() || '';
          const statementJa = row.statement_ja?.trim() || '';

          // Masteryかつ有効なグループIDがあり、まだそのグループのStatementが登録されていない場合は1件目を採用
          if (isMastery && tsvGroupId && statementEn && !masteryStatementMap.has(tsvGroupId)) {
            masteryStatementMap.set(tsvGroupId, { en: statementEn, ja: statementJa });
          }

          return {
            ...row,
            index,
            isValid: !error,
            error: error || undefined
          };
        });

        // 2周目のループ: データの最終整形（UUIDの割り当て、MasteryのStatement伝播）
        const finalPayload: any[] = validatedRows.map((row: any) => {
          if (!row.isValid) return row;

          const tsvGroupId = row.tsv_group_id?.trim();
          let finalGroupId: string | null = null;

          if (!isSpeed && tsvGroupId) {
            // 仮のグループIDごとに固定 of UUIDを払い出す
            if (!groupUuidMap.has(tsvGroupId)) {
              groupUuidMap.set(tsvGroupId, crypto.randomUUID());
            }
            finalGroupId = groupUuidMap.get(tsvGroupId)!;
          }

          // Masteryの場合は、所属グループの1件目のStatementを強制コピー
          let finalStatementEn = row.statement_en?.trim() || '';
          let finalStatementJa = row.statement_ja?.trim() || '';
          if (isMastery && tsvGroupId && masteryStatementMap.has(tsvGroupId)) {
            const shared = masteryStatementMap.get(tsvGroupId)!;
            finalStatementEn = shared.en;
            finalStatementJa = shared.ja;
          }

          return {
            seq_no: Number(row.seq_no),
            group_id: finalGroupId,
            statement_en: finalStatementEn,
            statement_ja: finalStatementJa || null,
            question_en: row.question_en?.trim(),
            question_ja: row.question_ja?.trim() || null,
            answer_sentence_yes_en: row.answer_sentence_yes_en?.trim(),
            answer_sentence_yes_ja: row.answer_sentence_yes_ja?.trim() || null,
            answer_sentence_no_en: isSpeed ? row.answer_sentence_no_en?.trim() : null,
            answer_sentence_no_ja: isSpeed ? row.answer_sentence_no_ja?.trim() : null,
            isValid: true
          };
        });

        setData(finalPayload);
        setHasCompleted(false);
      },
    });
  };

  const validateRow = (row: any, index: number): string | null => {
    const lineNum = index + 2;
    const prefix = `[${lineNum}行目]: `;

    if (!row.seq_no || isNaN(Number(row.seq_no))) {
      return `${prefix}連番(seq_no)は有効な数値を入力してください。`;
    }

    if (!isSpeed && !row.tsv_group_id?.trim()) {
      return `${prefix}Speed以外の種別では、問題グループを識別するための「tsv_group_id」が必須です。`;
    }

    if (!row.question_en?.trim()) {
      return `${prefix}英文問題/指示(question_en)が空欄です。`;
    }

    if (!row.answer_sentence_yes_en?.trim()) {
      return `${prefix}英文解答Positive(answer_sentence_yes_en)が空欄です。`;
    }

    if (isSpeed && !row.answer_sentence_no_en?.trim()) {
      return `${prefix}Speedタイプでは、英文解答Negative(answer_sentence_no_en)が必須です。`;
    }

    return null;
  };

  const handleImport = async () => {
    setIsProcessing(true);
    try {
      // サーバーアクション側で content_id, question_type, difficulty_level を付与し既存のデータを全削除 (洗い替え)
      const payload: Partial<SprintQuestion>[] = data.map(({ isValid, error, ...cleanData }) => cleanData);
      
      const result = await bulkImportSprintQuestions(contentId, type, level, payload);
      if (result.success) {
        showToast(`${data.length}件のスプリント問題を処理しました`, "success");
        setHasCompleted(true);
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

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" className="gap-2 border-dashed border-slate-300 hover:bg-slate-50 transition-all font-bold h-8 text-xs">
          <FileUp size={14} /> 一括登録
        </Button>
      </DialogTrigger>

      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col p-0 overflow-hidden border-none shadow-2xl rounded-3xl focus:outline-none [&>button]:text-white [&>button]:opacity-70 [&>button:hover]:opacity-100 [&>button:focus]:ring-0 [&>button:focus]:outline-none">
        <span className="sr-only" tabIndex={0} />

        <DialogHeader className="p-8 pr-14 bg-slate-900 text-white -mx-1 -mt-1 rounded-t-none border-b border-slate-800">
          <div className="flex justify-between items-start">
            <div className="space-y-1">
              <DialogTitle className="text-2xl font-black flex items-center gap-2">
                 <FileUp className="text-indigo-400" size={24} /> 
                 {hasCompleted ? "インポート完了" : "スプリント問題 一括登録 (TSV)"}
              </DialogTitle>
              <p className="text-xs text-slate-400 font-medium">
                選択中の問題タイプ・レベルに対してTSV（タブ区切り）データから一括登録（洗い替え）を行います。
              </p>
            </div>
            <Button variant="outline" asChild className="border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white h-9 text-[11px] font-bold shrink-0">
              <a href="/templates/bulk_sprint_sample.tsv" download>
                <Download size={14} className="mr-2 text-indigo-400" /> サンプルTSVをDL
              </a>
            </Button>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-hidden flex flex-col p-8 bg-white">
          {layoutError && (
            <div className="mb-6 p-4 bg-rose-50 border border-rose-100 rounded-2xl flex items-start gap-3 text-rose-600 animate-in fade-in slide-in-from-top-2">
              <AlertCircle className="shrink-0 mt-0.5" size={20} />
              <div className="space-y-1">
                <p className="text-sm font-black">TSVファイル構造のエラー</p>
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
                <p className="text-base font-black text-slate-700">TSVファイルをここにドロップ</p>
                <p className="text-xs text-slate-400 font-medium">またはクリックしてファイルを選択（UTF-8推奨）</p>
              </div>
              <input type="file" ref={fileInputRef} className="hidden" accept=".tsv" onChange={(e) => { const f = e.target.files?.[0]; if(f) processFile(f); }} />
            </div>
          ) : (
            <div className="flex-1 flex flex-col gap-8 overflow-hidden animate-in fade-in zoom-in-95 duration-300">
              <div className="grid grid-cols-2 gap-6">
                {[
                  { label: "Total Questions", val: data.length, color: "text-slate-600" },
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
                    <span className="text-sm font-black">データ不備のある行のみ表示しています</span>
                  </div>
                  <div className="flex-1 overflow-auto border border-rose-100 rounded-2xl bg-white shadow-sm">
                    <Table>
                      <TableHeader className="bg-rose-50/50 sticky top-0 z-10 backdrop-blur-md">
                        <TableRow className="border-rose-100 hover:bg-transparent">
                          <TableHead className="w-24 text-[10px] font-black text-rose-700 uppercase">Row No</TableHead>
                          <TableHead className="text-[10px] font-black text-rose-700 uppercase">Error Message</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {errorItems.map((item, i) => (
                          <TableRow key={i} className="hover:bg-rose-50/30 border-rose-50">
                            <TableCell className="font-black text-slate-800">行 {item.index + 2}</TableCell>
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
                      すべてのデータ検証をクリアしました。<br />
                      Speed以外のデータ群は、仮のIDに基づき自動でUUIDへ安全にマッピングされます。
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