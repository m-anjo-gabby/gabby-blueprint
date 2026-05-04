'use client';

import { useState, useMemo, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@gabby/lib/hooks/useToast';
import { RefreshCcw, ClipboardList, Loader2, AlertCircle, Edit2, Trash2 } from 'lucide-react';
import { ContractDetail } from '@gabby/types/contract';
import { 
  getActiveContractsByClient, 
  getLicenseTimeline, 
  assignLicenseToUser, 
  removeLicenseFromUser, 
  updateUserLicense 
} from '@/actions/adminContractAction';
import { UserRecord } from '@gabby/types/user';

interface Props {
  user: UserRecord;
  children: React.ReactNode;
}

export function LicenseFormDialog({ user, children }: Props) {
  const [open, setOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('list');
  const [loading, setLoading] = useState(false);
  
  // 保持データ
  const [availableContracts, setAvailableContracts] = useState<ContractDetail[]>([]);
  const [licenses, setLicenses] = useState<any[]>([]);
  
  // フォームState
  const [editingLicense, setEditingLicense] = useState<any | null>(null);
  const [selectedContractId, setSelectedContractId] = useState<string>("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [note, setNote] = useState("");

  const { showToast } = useToast();

  // 契約プランが選択されたら日付を自動セット（新規作成時のみ）
  useEffect(() => {
    if (!selectedContractId || editingLicense) return;
    const contract = availableContracts.find(c => c.contract_id === selectedContractId);
    if (contract) {
      setStartDate(contract.start_date);
      setEndDate(contract.end_date);
    }
  }, [selectedContractId, availableContracts, editingLicense]);

  // バリデーション：全項目必須かつ期間の妥当性
  const isFormInvalid = useMemo(() => {
    const isDateInvalid = startDate && endDate && new Date(startDate) > new Date(endDate);
    return !!(!selectedContractId || !startDate || !endDate || isDateInvalid);
  }, [selectedContractId, startDate, endDate]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [contracts, timeline] = await Promise.all([
        getActiveContractsByClient(user.client_id || '', user.id),
        getLicenseTimeline(user.id)
      ]);
      setAvailableContracts(contracts);
      setLicenses(timeline);
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setEditingLicense(null);
    setSelectedContractId("");
    setStartDate("");
    setEndDate("");
    setNote("");
  };

  const handleEdit = (license: any) => {
    setEditingLicense(license);
    setSelectedContractId(license.contract_id);
    setStartDate(license.start_date);
    setEndDate(license.end_date);
    setNote(license.note || "");
    setActiveTab('form');
  };

  const handleSave = async () => {
    setLoading(true);
    try {
      if (editingLicense) {
        await updateUserLicense(editingLicense.license_id, { start_date: startDate, end_date: endDate, note });
        showToast("ライセンス情報を更新しました", "success");
      } else {
        await assignLicenseToUser(selectedContractId, user.id, startDate, endDate);
        showToast("ライセンスを割当しました", "success");
      }
      setActiveTab('list');
      await loadData();
      resetForm();
    } catch {
      showToast("処理に失敗しました", "error");
    } finally {
      setLoading(false);
    }
  };

  const handleRemove = async (contractId: string) => {
    setLoading(true);
    try {
      await removeLicenseFromUser(contractId, user.id);
      showToast("ライセンスを解除しました", "success");
      await loadData();
    } finally {
      setLoading(false);
    }
  };

  const handleOpenChange = async (nextOpen: boolean) => {
    if (nextOpen) {
      setOpen(true);
      await loadData();
      setActiveTab(user.license_state === 'none' ? 'form' : 'list');
    } else {
      setOpen(false);
      resetForm();
      setActiveTab('list');
      setLicenses([]);
      setAvailableContracts([]);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="max-w-lg p-0 overflow-hidden shadow-2xl border-none [&>button]:text-white [&>button]:opacity-70">
        <DialogHeader className="p-6 bg-slate-900 text-white">
          <DialogTitle className="flex items-center gap-2 text-lg font-black">
            <RefreshCcw size={18} className="text-emerald-400" /> ライセンス管理
          </DialogTitle>
          <p className="text-slate-400 text-[11px] font-bold mt-1">{user.user_name} / {user.client_name}</p>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="p-6">
          <TabsList className="grid w-full grid-cols-2 mb-6">
            <TabsTrigger value="list" className="gap-2" onClick={resetForm}><ClipboardList size={14}/>一覧・履歴</TabsTrigger>
            <TabsTrigger value="form" className="gap-2">{editingLicense ? '編集モード' : '新規割当'}</TabsTrigger>
          </TabsList>

          <div className="h-[400px] overflow-y-auto">
            {loading ? (
              <div className="h-full flex items-center justify-center text-slate-400"><Loader2 size={32} className="animate-spin" /></div>
            ) : (
              <>
                <TabsContent value="list" className="mt-0 space-y-3">
                  {licenses.map(l => {
                    const isPast = new Date(l.end_date) < new Date(new Date().setHours(0,0,0,0));
                    return (
                      <div key={l.license_id} className={`p-4 border border-slate-100 rounded-xl flex justify-between items-center ${isPast ? 'bg-slate-50 opacity-60' : 'bg-white shadow-sm'}`}>
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="text-xs font-black">{l.com_m_contract?.plan_name}</p>
                            {isPast && <span className="text-[9px] font-bold bg-slate-200 text-slate-600 px-1.5 py-0.5 rounded-full">終了</span>}
                          </div>
                          <p className={`text-[10px] font-bold mt-0.5 ${isPast ? 'text-slate-400' : 'text-slate-500'}`}>{l.start_date} ～ {l.end_date}</p>
                        </div>
                        {!isPast && (
                          <div className="flex gap-1">
                            <Button variant="ghost" size="sm" onClick={() => handleEdit(l)}><Edit2 size={14} /></Button>
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button variant="ghost" size="sm" className="text-rose-500"><Trash2 size={14} /></Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent className="rounded-3xl p-8">
                                <AlertDialogHeader>
                                  <AlertDialogTitle>ライセンスを解除しますか？</AlertDialogTitle>
                                  <AlertDialogDescription>解除すると即座にシステム利用が不可となります。本当によろしいですか？</AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>キャンセル</AlertDialogCancel>
                                  <AlertDialogAction onClick={() => handleRemove(l.contract_id)} className="bg-rose-500">解除する</AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {licenses.length === 0 && <p className="text-center text-xs text-slate-400 py-20">ライセンスの履歴はありません</p>}
                </TabsContent>

                <TabsContent value="form" className="mt-0 space-y-5">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                      契約プラン {editingLicense && <span className="text-amber-500">(変更不可)</span>}
                    </label>
                    
                    {availableContracts.length > 0 ? (
                      <Select 
                        onValueChange={setSelectedContractId} 
                        value={selectedContractId}
                        disabled={!!editingLicense}
                      >
                        <SelectTrigger className={`rounded-xl h-12 font-bold ${editingLicense ? 'bg-slate-50 opacity-80 cursor-not-allowed' : ''}`}>
                          <SelectValue placeholder="契約プランを選択" />
                        </SelectTrigger>
                        <SelectContent>
                          {availableContracts.map((c) => (
                            <SelectItem key={c.contract_id} value={c.contract_id}>
                              {c.plan_name} (残:{c.remaining_licenses})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      // 割当可能なプランが0件の場合のメッセージ表示
                      <div className="h-12 w-full rounded-xl border border-dashed border-slate-200 flex items-center justify-center text-xs text-slate-400 font-medium bg-slate-50">
                        割当可能な契約プランがありません
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="rounded-xl" />
                    <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="rounded-xl" />
                  </div>

                  <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="備考（変更理由など）" className="rounded-xl" />

                  {isFormInvalid && (
                    <p className="text-[10px] text-rose-500 font-bold flex items-center gap-1 bg-rose-50 p-2 rounded-lg">
                      <AlertCircle size={12} /> 契約プラン・日付は必須です（終了日は開始日以降）
                    </p>
                  )}

                  <Button 
                    className="w-full h-12 rounded-xl font-black bg-slate-900" 
                    onClick={handleSave} 
                    // 【重要】割当可能なプランがない場合はボタンを無効化
                    disabled={Boolean(loading || isFormInvalid || (!editingLicense && availableContracts.length === 0))}
                  >
                    {availableContracts.length === 0 
                      ? '割当可能なプランなし' 
                      : (editingLicense ? '更新を保存' : 'ライセンスを割当')
                    }
                  </Button>
                </TabsContent>
              </>
            )}
          </div>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}