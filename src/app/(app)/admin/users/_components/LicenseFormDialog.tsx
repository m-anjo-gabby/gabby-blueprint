'use client';

import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/useToast';
import { ShieldCheck, RefreshCcw, Calendar, StickyNote, Trash2, Loader2, AlertCircle, Save } from 'lucide-react';
import { UserRecord } from '@/types/user';
import { ContractDetail } from '@/types/contract';
import { getActiveContractsByClient, assignLicenseToUser, removeLicenseFromUser, updateUserLicense } from '@/actions/adminContractAction';

interface Props {
  user: UserRecord;
  children: React.ReactNode;
}

export function LicenseFormDialog({ user, children }: Props) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [availableContracts, setAvailableContracts] = useState<ContractDetail[]>([]);
  
  // フォーム用State
  const [selectedContractId, setSelectedContractId] = useState<string>("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [note, setNote] = useState("");

  const { showToast } = useToast();

  // バリデーション：開始日と終了日の前後関係をチェック
  const isInvalidDateRange = startDate && endDate && new Date(startDate) > new Date(endDate);
  // 保存ボタンを無効化する条件を整理
  const isSaveDisabled = !!(loading || !selectedContractId || !startDate || !endDate || isInvalidDateRange);

  useEffect(() => {
    if (open) loadData();
  }, [open]);

  const loadData = async () => {
    setLoading(true);
    try {
      const contracts = await getActiveContractsByClient(user.client_id || '');
      setAvailableContracts(contracts as ContractDetail[]);
      setSelectedContractId(user.contract_id || "");
      setStartDate(user.license_start_date || ""); 
      setEndDate(user.license_end_date || "");
    } finally {
      setLoading(false);
    }
  };

  /**
   * 保存実行（AlertDialogから呼ばれる）
   */
  const handleSave = async () => {
    setLoading(true);
    try {
      if (user.contract_id && selectedContractId === user.contract_id) {
        await updateUserLicense(user.license_id!, {
          start_date: startDate, // そのまま渡す (YYYY-MM-DD)
          end_date: endDate,     // そのまま渡す (YYYY-MM-DD)
          note: note
        });
        showToast("ライセンス情報を更新しました", "success");
      } else {
        if (user.contract_id) await removeLicenseFromUser(user.contract_id, user.id);
        const contract = availableContracts.find(c => c.contract_id === selectedContractId);
        if (contract) {
          await assignLicenseToUser(selectedContractId, user.id, startDate, endDate);
          showToast("新しいライセンスを割り当てました", "success");
        }
      }
      setOpen(false);
    } catch (error) {
      showToast("処理に失敗しました", "error");
    } finally {
      setLoading(false);
    }
  };

  /**
   * 解除実行（AlertDialogから呼ばれる）
   */
  const handleRemove = async () => {
    if (!user.contract_id) return;
    setLoading(true);
    try {
      const res = await removeLicenseFromUser(user.contract_id, user.id);
      if (res.success) {
        showToast("ライセンスを解除しました", "success");
        setOpen(false);
      }
    } finally {
      setLoading(false);
    }
  };

  // プラン選択時の連動処理を追加
  const handlePlanChange = (contractId: string) => {
    setSelectedContractId(contractId);
    
    // 選択された契約の情報を取得
    const contract = availableContracts.find(c => c.contract_id === contractId);
    if (contract) {
      // 選択したプランが現在のユーザーのプランと異なる場合、
      // 契約マスタに設定されているデフォルトの期間をセットする
      if (contractId !== user.contract_id) {
        setStartDate(contract.start_date);
        setEndDate(contract.end_date);
      } else {
        // 元のプランに戻した場合は、ユーザーの元の値を再セット
        setStartDate(user.license_start_date || "");
        setEndDate(user.license_end_date || "");
      }
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {children}
      </DialogTrigger>

      <DialogContent className="max-w-md p-0 overflow-hidden border-none shadow-2xl">
        <DialogHeader className="p-6 bg-slate-900 text-white -mx-1 -mt-1 rounded-t-none">
          <DialogTitle className="flex items-center gap-2 text-lg font-black">
            <RefreshCcw size={18} className="text-emerald-400" /> ライセンス管理
          </DialogTitle>
          <p className="text-slate-400 text-[11px] mt-1 font-bold">{user.user_name} / {user.client_name}</p>
        </DialogHeader>

        <div className="p-6 space-y-5 bg-white">
          {/* プラン選択 */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">契約プラン</label>
            <Select onValueChange={handlePlanChange} value={selectedContractId}>
              <SelectTrigger className="rounded-xl border-slate-200 h-11 font-bold">
                <SelectValue placeholder="プランを選択" />
              </SelectTrigger>
              <SelectContent>
                {availableContracts.map((c) => (
                  <SelectItem key={c.contract_id} value={c.contract_id} className="font-medium">
                    {c.plan_name} <span className="text-[10px] text-slate-400 ml-1">(残:{c.remaining_licenses})</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* 期間設定 */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">利用開始日</label>
              <div className="relative">
                <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="rounded-xl border-slate-200 pl-9 text-xs font-bold" />
                <Calendar className="absolute left-3 top-2.5 text-slate-400" size={14} />
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">利用終了日</label>
              <div className="relative">
                <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="rounded-xl border-slate-200 pl-9 text-xs font-bold" />
                <Calendar className="absolute left-3 top-2.5 text-slate-400" size={14} />
              </div>
              {/* 日付不整合のエラーメッセージ */}
              {isInvalidDateRange && (
                <p className="text-[10px] text-rose-500 font-bold flex items-center gap-1 mt-1 pl-1">
                  <AlertCircle size={10} /> 終了日は開始日以降の日付を選択してください
                </p>
              )}
            </div>
          </div>
          <p className="text-[9px] text-slate-400 text-center italic">
            ※ 日付は手動で調整可能ですが、初期値は契約期間が設定されています
          </p>

          {/* 個別メモ */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">管理メモ（延長理由など）</label>
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="備考を入力してください" className="rounded-xl border-slate-200 min-h-[80px] text-xs font-medium" />
          </div>

          {/* アクションボタン群 */}
          <div className="pt-4 border-t border-slate-100 space-y-3">
            
            {/* 保存確認 */}
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button className="w-full bg-slate-900 text-white rounded-xl h-12 font-black shadow-lg gap-2 hover:bg-slate-800 transition-all active:scale-95" 
                        disabled={isSaveDisabled}
                >
                  <Save size={18} /> 設定を保存する
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent className="rounded-3xl border-none p-8">
                <AlertDialogHeader className="space-y-4">
                  <div className="w-16 h-16 bg-emerald-50 text-emerald-500 rounded-full flex items-center justify-center mx-auto">
                    <ShieldCheck size={32} />
                  </div>
                  <div className="text-center space-y-2">
                    <AlertDialogTitle className="text-xl font-black text-slate-800">設定を反映しますか？</AlertDialogTitle>
                    <AlertDialogDescription className="text-xs font-medium text-slate-500">
                      ユーザーのライセンス期間またはプランを更新します。<br />
                      よろしければ「実行する」を押してください。
                    </AlertDialogDescription>
                  </div>
                </AlertDialogHeader>
                <AlertDialogFooter className="flex gap-3 mt-6">
                  <AlertDialogCancel className="flex-1 h-12 rounded-2xl border-none bg-slate-100 font-bold text-slate-500">キャンセル</AlertDialogCancel>
                  <AlertDialogAction onClick={handleSave} className="flex-1 h-12 rounded-2xl bg-indigo-600 text-white font-bold hover:bg-indigo-700 shadow-lg shadow-indigo-100">実行する</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
            
            {/* 解除確認 */}
            {user.contract_id && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="ghost" className="w-full text-rose-500 hover:text-rose-600 hover:bg-rose-50 rounded-xl gap-2 text-xs font-bold" disabled={loading}>
                    <Trash2 size={14} /> ライセンスを解除する
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent className="rounded-3xl border-none p-8">
                  <AlertDialogHeader className="space-y-4">
                    <div className="w-16 h-16 bg-rose-50 text-rose-500 rounded-full flex items-center justify-center mx-auto">
                      <AlertCircle size={32} />
                    </div>
                    <div className="text-center space-y-2">
                      <AlertDialogTitle className="text-xl font-black text-slate-800">ライセンス解除の確認</AlertDialogTitle>
                      <AlertDialogDescription className="text-xs font-medium text-slate-500 leading-relaxed">
                        {user.user_name} さんのライセンスを解除します。<br />
                        解除後は即座にシステムが利用不可となります。
                      </AlertDialogDescription>
                    </div>
                  </AlertDialogHeader>
                  <AlertDialogFooter className="flex gap-3 mt-6">
                    <AlertDialogCancel className="flex-1 h-12 rounded-2xl border-none bg-slate-100 font-bold">キャンセル</AlertDialogCancel>
                    <AlertDialogAction onClick={handleRemove} className="flex-1 h-12 rounded-2xl bg-rose-500 text-white font-bold hover:bg-rose-600 shadow-lg">解除する</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}