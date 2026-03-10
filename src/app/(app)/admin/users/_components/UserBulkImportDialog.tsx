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
  
  const [selectedClientId, setSelectedClientId] = useState<string>("");
  const [data, setData] = useState<(BulkUser & { isProcessed?: boolean; status?: 'success' | 'error' })[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [hasCompleted, setHasCompleted] = useState(false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const selectedClient = clients.find(c => c.client_id === selectedClientId);

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

  const handleImport = async () => {
    if (data.some(d => !d.isValid) || data.length === 0) return;

    setIsProcessing(true);
    try {
      const result = await bulkCreateUsers(data);
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
      router.refresh();

      if (result.errorCount === 0) {
        showToast(`${result.successCount}名の登録が完了しました`, "success");
      } else {
        showToast(`${result.successCount}名成功、${result.errorCount}名失敗しました`, "error");
      }
    } catch (error) {
      showToast("実行中にエラーが発生しました", "error");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleClose = () => {
    setOpen(false);
    setData([]);
    setSelectedClientId("");
    setHasCompleted(false);
  };

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
        <Button variant="outline" className="gap-2 border-dashed border-slate-300 hover:bg-slate-50 transition-colors font-bold">
          <UserPlus size={16} /> 一括登録
        </Button>
      </DialogTrigger>

      <DialogContent 
        className="max-w-4xl max-h-[90vh] flex flex-col p-0 gap-0 overflow-hidden border-none shadow-2xl [&>button]:text-white [&>button]:opacity-70 [&>button:hover]:opacity-100 [&>button]:focus:ring-0 [&>button]:outline-none"
      >
        {/* ダークヘッダー */}
        <DialogHeader className="p-6 bg-slate-900 text-white -mx-1 -mt-1 rounded-t-none border-b border-slate-800">
          <DialogTitle className="text-xl font-black flex items-center gap-2">
            {hasCompleted ? <><CheckCircle2 className="text-emerald-400" size={20} /> インポート結果レポート</> : <><UserPlus className="text-indigo-400" size={20} /> 新規ユーザーの一括登録</>}
          </DialogTitle>
          <p className="text-xs text-slate-400 font-medium">
            {hasCompleted ? "処理が完了しました。エラーがある場合は内容を確認してください。" : `CSV/TSVファイルをアップロードしてください（最大${MAX_BULK_COUNT}件）`}
          </p>
        </DialogHeader>

        <div className="flex-1 overflow-hidden flex flex-col gap-6 p-8 bg-white">
          {/* STEP 1: 顧客選択 */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-slate-900 text-[10px] font-bold text-white">1</span>
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">所属顧客</label>
            </div>
            <Select 
              value={selectedClientId} 
              onValueChange={(val) => { setSelectedClientId(val); setData([]); }}
              disabled={isProcessing || hasCompleted}
            >
              <SelectTrigger className="bg-white rounded-xl border-slate-200 h-11"><SelectValue placeholder="顧客を選択してください" /></SelectTrigger>
              <SelectContent className="rounded-xl">{clients.map(c => <SelectItem key={c.client_id} value={c.client_id}>{c.client_name}</SelectItem>)}</SelectContent>
            </Select>
          </div>

          {/* STEP 2: アップロード/結果表示 */}
          <div className="flex-1 flex flex-col overflow-hidden min-h-75">
            {!selectedClientId ? (
              <div className="flex-1 flex flex-col items-center justify-center text-slate-400 p-2 border-2 border-dashed rounded-2xl bg-slate-50/50">
                <AlertCircle className="mb-2 opacity-10" size={48} />
                <p className="text-sm font-bold text-slate-400">先に顧客を選択してください</p>
              </div>
            ) : data.length === 0 ? (
              <div className="flex-1 flex flex-col gap-4">
                <div 
                  className={`flex-1 border-2 border-dashed rounded-2xl flex flex-col items-center justify-center p-2 gap-4 cursor-pointer transition-all duration-200 ${isDragging ? "border-indigo-500 bg-indigo-50/50 scale-[0.99]" : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/50"}`}
                  onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <div className="p-4 bg-slate-50 rounded-full text-slate-400 shadow-sm border border-slate-100">
                    <Upload className={isDragging ? "animate-bounce text-indigo-500" : ""} size={32} />
                  </div>
                  <div className="text-center">
                    <p className="text-sm font-bold text-slate-700">CSVファイルをドロップするかクリックして選択</p>
                    <p className="text-[11px] text-slate-400 mt-1 font-medium">.csv または .tsv 形式のみ対応</p>
                  </div>
                  <input type="file" ref={fileInputRef} className="hidden" accept=".csv,.tsv" onChange={handleFileChange} />
                </div>
                <div className="flex justify-center">
                  <Button variant="ghost" size="sm" className="text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50 text-[11px] font-bold h-8 rounded-lg" asChild>
                    <a href="/templates/balk_user_sample.csv" download><FileText size={14} className="mr-1.5" /> サンプルCSVをダウンロード</a>
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex-1 flex flex-col gap-4 overflow-hidden">
                <div className="flex items-center justify-between px-1">
                  <div className="flex items-center gap-2">
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-slate-900 text-[10px] font-bold text-white">2</span>
                    <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">{hasCompleted ? "処理結果一覧" : "内容確認"}</h3>
                  </div>
                </div>

                <div className="flex-1 overflow-auto border border-slate-200 rounded-xl bg-white shadow-sm">
                  <Table>
                    <TableHeader className="bg-slate-50/80 backdrop-blur-sm sticky top-0 z-10">
                      <TableRow className="hover:bg-transparent border-slate-200">
                        <TableHead className="w-24 text-[10px] uppercase font-bold text-center text-slate-500">状態</TableHead>
                        <TableHead className="w-52 text-[10px] uppercase font-bold text-slate-500">メールアドレス</TableHead>
                        <TableHead className="text-[10px] uppercase font-bold text-slate-500">{hasCompleted ? "名前 / エラー理由" : "名前"}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.map((row, i) => (
                        <TableRow key={i} className={`hover:bg-slate-50/50 border-slate-100 ${!row.isValid ? "bg-rose-50/30" : ""}`}>
                          <TableCell className="text-center py-3">
                            {row.isProcessed ? (
                              row.status === 'success' ? 
                                <span className="text-[10px] font-bold text-emerald-600 bg-emerald-100 px-2.5 py-1 rounded-full">成功</span> :
                                <span className="text-[10px] font-bold text-rose-600 bg-rose-100 px-2.5 py-1 rounded-full">失敗</span>
                            ) : (
                              row.isValid ? <CheckCircle2 size={18} className="text-emerald-500 mx-auto" /> : <AlertCircle size={18} className="text-rose-500 mx-auto" />
                            )}
                          </TableCell>
                          <TableCell className="text-xs font-bold text-slate-700">{row.email}</TableCell>
                          <TableCell className="text-xs">
                            <div className="font-bold text-slate-700">{row.user_name}</div>
                            {row.error && <div className="text-[10px] text-rose-500 mt-1 font-bold flex items-center gap-1"><AlertCircle size={10} />{row.error}</div>}
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
            variant="ghost" size="sm" className="text-slate-400 hover:text-slate-600 font-bold text-xs rounded-lg" 
            onClick={() => { setData([]); setHasCompleted(false); }} 
            disabled={isProcessing}
          >
            {hasCompleted ? <><RefreshCcw size={14} className="mr-1.5" /> 別のファイルを読み込む</> : "リセット"}
          </Button>

          <div className="flex gap-3">
            <Button variant="outline" size="sm" className="rounded-xl px-5 font-bold border-slate-200" onClick={handleClose} disabled={isProcessing}>
              {hasCompleted ? "閉じる" : "キャンセル"}
            </Button>
            {!hasCompleted && (
              <Button 
                size="sm" className="px-8 font-black text-xs rounded-xl bg-slate-900 hover:bg-slate-800 text-white shadow-lg shadow-slate-200 transition-all active:scale-95"
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