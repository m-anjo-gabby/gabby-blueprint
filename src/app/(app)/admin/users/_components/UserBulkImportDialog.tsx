'use client';

import { useState, useRef, DragEvent, ChangeEvent, useEffect } from 'react';
import Papa from 'papaparse';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/useToast';
import { Upload, FileText, AlertCircle, Loader2, CheckCircle2, UserPlus, RefreshCcw, ShieldCheck } from 'lucide-react';
import { Client, RawCsvRow, BulkUser, BulkImportResponse } from '@/types/user';
import { bulkCreateUsers } from '@/actions/adminUserAction';
import { getActiveContractsByClient, bulkAssignLicenses } from '@/actions/adminContractAction'; // アクションを追加
import { useRouter } from 'next/navigation';
import { ContractDetail } from '@/types/contract';
import { Badge } from '@/components/ui/badge';

interface UserBulkImportDialogProps {
  clients: Client[];
}

const MAX_BULK_COUNT = 30;

export function UserBulkImportDialog({ clients }: UserBulkImportDialogProps) {
  const router = useRouter();
  const { showToast } = useToast();
  const [open, setOpen] = useState(false);
  
  const [selectedClientId, setSelectedClientId] = useState<string>("");
  const [contracts, setContracts] = useState<ContractDetail[]>([]); // 有効な契約一覧
  const [selectedContractId, setSelectedContractId] = useState<string>("none"); // 選択された契約ID
  const [isLoadingContracts, setIsLoadingContracts] = useState(false);

  const [data, setData] = useState<(BulkUser & { isProcessed?: boolean; status?: 'success' | 'error'; licenseStatus?: 'success' | 'error' | 'skipped' })[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [hasCompleted, setHasCompleted] = useState(false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const selectedClient = clients.find(c => c.client_id === selectedClientId);

  // 顧客が選択されたら有効な契約を取得する
  useEffect(() => {
    async function fetchContracts() {
      if (!selectedClientId) {
        setContracts([]);
        return;
      }
      setIsLoadingContracts(true);
      try {
        const activeContracts = await getActiveContractsByClient(selectedClientId);
        setContracts(activeContracts);
      } catch (error) {
        showToast("契約情報の取得に失敗しました", "error");
      } finally {
        setIsLoadingContracts(false);
      }
    }
    fetchContracts();
  }, [selectedClientId]);

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
    
    // ユーザー作成の結果を保持する変数（catchでも参照できるように外で定義）
    let userResult: BulkImportResponse | null = null;
    let assignedUserIds: string[] = [];

    try {
      // 1. ユーザー作成（ここが失敗した場合は catch へ）
      userResult = await bulkCreateUsers(data);
      
      if (!userResult || !userResult.details) {
        throw new Error("ユーザー登録のレスポンスが不正です");
      }

      const successIds = userResult.details
        .map(d => d.id)
        .filter((id): id is string => !!id);

      // 2. ライセンス割当
      if (selectedContractId !== "none" && successIds.length > 0) {
        const targetContract = contracts.find(c => c.contract_id === selectedContractId);
        
        // 日付が確実に渡せるかチェック（ビュー側でフォーマット済みの YYYY-MM-DD を使用）
        if (targetContract?.start_date && targetContract?.end_date) {
          const lResult = await bulkAssignLicenses(
            selectedContractId,
            successIds,
            targetContract.start_date,
            targetContract.end_date
          );
          
          if (lResult.success) {
            assignedUserIds = lResult.assignedUserIds ?? [];
          } else {
            showToast(`一部のユーザーのライセンス割当に失敗しました: ${lResult.message}`, "error");
          }
        }
      }
    } catch (error) {
      showToast("処理中にエラーが発生しました", "error");
      // ユーザー作成自体が全くできなかった場合のみここで終了
      if (!userResult) {
        setIsProcessing(false);
        return;
      }
    }

    // 3. レポート作成（userResultがあれば、ライセンス割当でエラーが起きても必ず実行される）
    if (userResult) {
      const reportData = data.map((item) => {
        const detail = userResult!.details.find(d => d.email === item.email);
        const isUserSuccess = detail?.status === 'success';
        const isLicenseSuccess = isUserSuccess && !!detail?.id && assignedUserIds.includes(detail.id);

        let licenseStatus: "success" | "error" | "skipped" | undefined = undefined;
        if (isUserSuccess) {
          if (selectedContractId === "none") {
            licenseStatus = "skipped";
          } else {
            licenseStatus = isLicenseSuccess ? "success" : "error";
          }
        }

        return {
          ...item,
          isProcessed: true,
          status: detail?.status,
          licenseStatus,
          error: detail?.status === 'error' ? detail.message : (isUserSuccess && selectedContractId !== "none" && !isLicenseSuccess ? "ライセンス割当失敗" : undefined),
          isValid: isUserSuccess
        };
      });

      setData(reportData);
      setHasCompleted(true);
      router.refresh();
    }
    
    setIsProcessing(false);
  };

  const handleClose = () => {
    setOpen(false);
    setData([]);
    setSelectedClientId("");
    setSelectedContractId("none");
    setHasCompleted(false);
  };

  // --- ドラッグ&ドロップ系ハンドラは変更なし ---
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

      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col p-0 gap-0 overflow-hidden border-none shadow-2xl [&>button]:text-white [&>button]:opacity-70 [&>button:hover]:opacity-100 [&>button]:focus:ring-0 [&>button]:outline-none">
        <DialogHeader className="p-6 bg-slate-900 text-white -mx-1 -mt-1 rounded-t-none border-b border-slate-800">
          <DialogTitle className="text-xl font-black flex items-center gap-2">
            {hasCompleted ? <><CheckCircle2 className="text-emerald-400" size={20} /> インポート結果レポート</> : <><UserPlus className="text-indigo-400" size={20} /> 新規ユーザーの一括登録</>}
          </DialogTitle>
          <p className="text-xs text-slate-400 font-medium">
            {hasCompleted ? "ユーザー作成とライセンス割当の結果を確認してください。" : `CSV/TSVファイルをアップロードしてください（最大${MAX_BULK_COUNT}件）`}
          </p>
        </DialogHeader>

        <div className="flex-1 overflow-hidden flex flex-col gap-6 p-8 bg-white">
          <div className="grid grid-cols-2 gap-6">
            {/* STEP 1: 顧客選択 */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-slate-900 text-[10px] font-bold text-white">1</span>
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">所属顧客</label>
              </div>
              <Select 
                value={selectedClientId} 
                onValueChange={(val) => { setSelectedClientId(val); setSelectedContractId("none"); setData([]); }}
                disabled={isProcessing || hasCompleted}
              >
                <SelectTrigger className="bg-white rounded-xl border-slate-200 h-11"><SelectValue placeholder="顧客を選択してください" /></SelectTrigger>
                <SelectContent className="rounded-xl">{clients.map(c => <SelectItem key={c.client_id} value={c.client_id}>{c.client_name}</SelectItem>)}</SelectContent>
              </Select>
            </div>

            {/* STEP 2: ライセンスプラン選択 */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-indigo-600 text-[10px] font-bold text-white">2</span>
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">初期ライセンス割当（任意）</label>
              </div>
              <Select 
                value={selectedContractId} 
                onValueChange={setSelectedContractId}
                disabled={isProcessing || hasCompleted || !selectedClientId || isLoadingContracts}
              >
                <SelectTrigger className="bg-white rounded-xl border-slate-200 h-11">
                  {isLoadingContracts ? <Loader2 size={16} className="animate-spin mx-auto text-slate-400" /> : <SelectValue placeholder="割り当てない" />}
                </SelectTrigger>
                <SelectContent className="rounded-xl">
                  <SelectItem value="none">割り当てない（ユーザー登録のみ）</SelectItem>
                  {contracts.map(c => (
                    <SelectItem key={c.contract_id} value={c.contract_id} className="text-xs">
                      {c.plan_name}（残 {c.remaining_licenses}枠）
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* STEP 3: アップロード/結果表示 */}
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
              </div>
            ) : (
              <div className="flex-1 flex flex-col gap-4 overflow-hidden">
                <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider px-1">{hasCompleted ? "処理結果一覧" : "内容確認"}</h3>
                <div className="flex-1 overflow-auto border border-slate-200 rounded-xl bg-white shadow-sm">
                  <Table>
                    <TableHeader className="bg-slate-50/80 backdrop-blur-sm sticky top-0 z-10">
                      <TableRow className="hover:bg-transparent border-slate-200">
                        <TableHead className="w-32 text-[10px] uppercase font-bold text-center text-slate-500">アカウント / ライセンス</TableHead>
                        <TableHead className="w-48 text-[10px] uppercase font-bold text-slate-500">メールアドレス</TableHead>
                        <TableHead className="text-[10px] uppercase font-bold text-slate-500">名前</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.map((row, i) => (
                        <TableRow key={i} className={`hover:bg-slate-50/50 border-slate-100 ${!row.isValid ? "bg-rose-50/30" : ""}`}>
                          <TableCell className="text-center py-3">
                            <div className="flex flex-col items-center gap-1">
                              {row.isProcessed ? (
                                <>
                                  {/* ユーザー作成ステータス */}
                                        <Badge 
                                          variant="outline" 
                                          className={`text-[9px] h-4 px-1.5 font-bold border-transparent text-white ${
                                            row.status === 'success' ? 'bg-emerald-500' : 'bg-rose-500'
                                          }`}
                                        >
                                          {row.status === 'success' ? '作成成功' : '作成失敗'}
                                        </Badge>

                                        {/* ライセンスステータス（成功/失敗時のみ表示） */}
                                        {row.licenseStatus === 'success' && (
                                          <Badge 
                                            variant="outline" 
                                            className="bg-emerald-600 text-white border-transparent text-[9px] h-4 px-1.5 font-bold"
                                          >
                                            ライセンス割当済
                                          </Badge>
                                        )}
                                        {row.licenseStatus === 'error' && (
                                          <Badge 
                                            variant="outline" 
                                            className="bg-rose-600 text-white border-transparent text-[9px] h-4 px-1.5 font-bold"
                                          >
                                            ライセンス割当失敗
                                          </Badge>
                                        )}
                                </>
                              ) : (
                                row.isValid ? <CheckCircle2 size={18} className="text-emerald-500" /> : <AlertCircle size={18} className="text-rose-500" />
                              )}
                            </div>
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
          <Button variant="ghost" size="sm" className="text-slate-400 hover:text-slate-600 font-bold text-xs rounded-lg" 
            onClick={() => { setData([]); setHasCompleted(false); setSelectedContractId("none"); }} 
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
