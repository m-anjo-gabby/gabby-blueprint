// src/app/(app)/admin/users/_components/UserBulkImportDialog.tsx
'use client';

import { useState, useRef, DragEvent, ChangeEvent } from 'react';
import Papa from 'papaparse';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/useToast';
import { Upload, FileText, AlertCircle, Loader2, CheckCircle2, UserPlus, RefreshCcw } from 'lucide-react';
import { Client, RawCsvRow, BulkUser } from '@/types/user';
import { bulkCreateUsers } from '@/actions/adminUserAction';
import { useRouter } from 'next/navigation';

interface UserBulkImportDialogProps {
  clients: Client[];
}

const MAX_BULK_COUNT = 30;

export function UserBulkImportDialog({ clients }: UserBulkImportDialogProps) {
  const router = useRouter();
  const { showToast } = useToast();
  const [open, setOpen] = useState(false);
  
  // フォーム状態
  const [selectedClientId, setSelectedClientId] = useState<string>("");
  const [data, setData] = useState<(BulkUser & { isProcessed?: boolean; status?: 'success' | 'error' })[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [hasCompleted, setHasCompleted] = useState(false); // 実行完了フラグ
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const selectedClient = clients.find(c => c.client_id === selectedClientId);

  /**
   * ファイルパース処理
   * CSV/TSVを読み込み、バリデーション済みのオブジェクト配列に変換する
   */
  const processFile = (file: File) => {
    if (!selectedClientId) {
      showToast("先に所属顧客を選択してください", "error");
      return;
    }

    Papa.parse<RawCsvRow>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        if (results.data.length > MAX_BULK_COUNT) {
          showToast(`一度に登録できるのは${MAX_BULK_COUNT}件までです`, "error");
          return;
        }

        const parsedData = results.data.map((row) => {
          const email = (row['メールアドレス'] || row['email'] || '').trim();
          const userName = (row['名前'] || row['user_name'] || '').trim();
          
          let error = '';
          if (!email || !email.includes('@')) error = '無効なメール形式';
          else if (!userName) error = '名前未入力';

          return {
            email,
            user_name: userName,
            user_type: '1',
            client_id: selectedClientId,
            client_name: selectedClient?.client_name || '',
            isValid: !error,
            error: error || undefined,
            isProcessed: false
          };
        });
        setData(parsedData);
        setHasCompleted(false);
      },
    });
  };

  /**
   * 一括登録実行
   * サーバーアクションを呼び出し、結果をテーブルにマッピングする
   */
  const handleImport = async () => {
    if (data.some(d => !d.isValid) || data.length === 0) return;

    setIsProcessing(true);
    try {
      const result = await bulkCreateUsers(data);

      // サーバーからの詳細結果を元のデータにマッピング
      const reportData = data.map(item => {
        const detail = result.details.find(d => d.email === item.email);
        return {
          ...item,
          isProcessed: true,
          status: detail?.status as "success" | "error" | undefined,
          error: detail?.status === 'error' ? detail.message : undefined,
          isValid: detail?.status === 'success'
        };
      });

      setData(reportData);
      setHasCompleted(true);
      router.refresh(); // 背景の一覧を更新

      if (result.errorCount === 0) {
        showToast(`${result.successCount}名の登録が完了しました`, "success");
      } else {
        showToast(`${result.successCount}名成功、${result.errorCount}名失敗しました`, "error");
      }
    } catch (error) {
      console.error("一括登録時のエラー", error)
      showToast("実行中にエラーが発生しました", "error");
    } finally {
      setIsProcessing(false);
    }
  };

  /**
   * ダイアログを閉じる際のクリーンアップ
   */
  const handleClose = () => {
    setOpen(false);
    setData([]);
    setSelectedClientId("");
    setHasCompleted(false);
  };

  // ハンドラー類
  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleDragOver = (e: DragEvent) => { e.preventDefault(); if (selectedClientId) setIsDragging(true); };
  const handleDragLeave = () => setIsDragging(false);
  const handleDrop = (e: DragEvent) => {
    e.preventDefault(); setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) processFile(file);
  };

  return (
    <Dialog open={open} onOpenChange={(val) => !val ? handleClose() : setOpen(true)}>
      <DialogTrigger asChild>
        <Button variant="outline" className="gap-2 border-dashed border-slate-300">
          <UserPlus size={16} /> 一括登録
        </Button>
      </DialogTrigger>

      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col p-0 gap-0 overflow-hidden">
        <DialogHeader className="p-6 pb-2">
          <DialogTitle className="text-xl font-bold flex items-center gap-2">
            {hasCompleted ? "インポート結果レポート" : "新規ユーザーの一括登録"}
          </DialogTitle>
          <p className="text-xs text-slate-500">
            {hasCompleted ? "処理が完了しました。エラーがある場合は内容を確認してください。" : `CSV/TSVファイルをアップロードしてください（最大${MAX_BULK_COUNT}件）`}
          </p>
        </DialogHeader>

        <div className="flex-1 overflow-hidden flex flex-col gap-6 p-6">
          {/* STEP 1: 顧客選択 (完了後は変更不可) */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-slate-900 text-[10px] font-bold text-white">1</span>
              <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">所属顧客</label>
            </div>
            <Select 
              value={selectedClientId} 
              onValueChange={(val) => { setSelectedClientId(val); setData([]); }}
              disabled={isProcessing || hasCompleted}
            >
              <SelectTrigger className="bg-white"><SelectValue placeholder="顧客を選択してください" /></SelectTrigger>
              <SelectContent>{clients.map(c => <SelectItem key={c.client_id} value={c.client_id}>{c.client_name}</SelectItem>)}</SelectContent>
            </Select>
          </div>

          {/* STEP 2: アップロード/結果表示 */}
          <div className="flex-1 flex flex-col overflow-hidden">
            {!selectedClientId ? (
              <div className="flex-1 flex flex-col items-center justify-center text-slate-400 p-2 border-2 border-dashed rounded-xl bg-slate-50/50">
                <AlertCircle className="mb-2 opacity-20" size={32} />
                <p className="text-sm font-medium">先に顧客を選択してください</p>
              </div>
            ) : data.length === 0 ? (
              <div className="flex-1 flex flex-col gap-4">
                <div 
                  className={`flex-1 border-2 border-dashed rounded-xl flex flex-col items-center justify-center p-2 gap-4 cursor-pointer transition-all ${isDragging ? "border-primary bg-primary/5" : "bg-white hover:bg-slate-50"}`}
                  onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload className={isDragging ? "animate-bounce text-primary" : "text-slate-300"} size={32} />
                  <p className="text-sm font-semibold text-slate-700">CSVをドロップまたはクリック</p>
                  <input type="file" ref={fileInputRef} className="hidden" accept=".csv,.tsv" onChange={handleFileChange} />
                </div>
                <div className="flex justify-center">
                  <Button variant="link" size="sm" className="text-slate-400 text-[11px] h-auto p-0" asChild>
                    <a href="/templates/balk_user_sample.csv" download><FileText size={14} className="mr-1" /> サンプルCSVをダウンロード</a>
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex-1 flex flex-col gap-4 overflow-hidden">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-slate-900 text-[10px] font-bold text-white">2</span>
                    <h3 className="text-xs font-bold text-slate-700 uppercase">{hasCompleted ? "処理結果一覧" : "内容確認"}</h3>
                  </div>
                </div>

                <div className="flex-1 overflow-auto border rounded-xl bg-white border-slate-200">
                  <Table>
                    <TableHeader className="bg-slate-50 sticky top-0 z-10">
                      <TableRow>
                        <TableHead className="w-24 text-[10px] uppercase font-bold text-center">状態</TableHead>
                        <TableHead className="w-52 text-[10px] uppercase font-bold">メールアドレス</TableHead>
                        <TableHead className="text-[10px] uppercase font-bold">{hasCompleted ? "名前 / エラー理由" : "名前"}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.map((row, i) => (
                        <TableRow key={i} className={!row.isValid ? "bg-red-50/30" : ""}>
                          <TableCell className="text-center">
                            {row.isProcessed ? (
                              row.status === 'success' ? 
                                <span className="text-[10px] font-bold text-emerald-600 bg-emerald-100 px-2 py-0.5 rounded">成功</span> :
                                <span className="text-[10px] font-bold text-red-600 bg-red-100 px-2 py-0.5 rounded">失敗</span>
                            ) : (
                              row.isValid ? <CheckCircle2 size={16} className="text-emerald-500 mx-auto" /> : <AlertCircle size={16} className="text-red-500 mx-auto" />
                            )}
                          </TableCell>
                          <TableCell className="text-xs font-medium">{row.email}</TableCell>
                          <TableCell className="text-xs">
                            <div className="font-medium text-slate-700">{row.user_name}</div>
                            {row.error && <div className="text-[10px] text-red-500 mt-0.5 font-bold flex items-center gap-1"><AlertCircle size={10} />{row.error}</div>}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* FOOTER */}
        <div className="bg-slate-50 p-6 flex justify-between items-center border-t border-slate-200">
          <Button 
            variant="ghost" size="sm" className="text-slate-500 text-xs" 
            onClick={() => { setData([]); setHasCompleted(false); }} 
            disabled={isProcessing}
          >
            {hasCompleted ? <><RefreshCcw size={14} className="mr-1" /> 別のファイルを読み込む</> : "リセット"}
          </Button>

          <div className="flex gap-3">
            <Button variant="outline" size="sm" onClick={handleClose} disabled={isProcessing}>
              {hasCompleted ? "閉じる" : "キャンセル"}
            </Button>
            {!hasCompleted && (
              <Button 
                size="sm" className="px-8 font-bold text-xs"
                onClick={handleImport} 
                disabled={isProcessing || data.some(d => !d.isValid) || data.length === 0}
              >
                {isProcessing ? <><Loader2 className="mr-2 h-3 w-3 animate-spin" /> 実行中...</> : "一括登録を開始"}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}