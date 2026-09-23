'use client';

import { useState, useMemo, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@gabby/lib/hooks/useToast';
import { RefreshCcw, ClipboardList, Loader2, AlertCircle, Edit2, Ban } from 'lucide-react';
import { ContractDetail } from '@gabby/types/contract';
import {
  getActiveContractsByClient,
  getLicenseTimeline,
  assignLicenseToUser,
  invalidateUserLicense,
  updateUserLicense
} from '@/actions/adminContractAction';
import { UserRecord } from '@gabby/types/user';

interface Props {
  user: UserRecord;
  children: React.ReactNode;
}

export function LicenseFormDialog({ user, children }: Props) {
  const t = useTranslations('users.license');
  const tCommon = useTranslations('common');
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

  // 新規割当時に選択中の契約（期間の上下限として利用）
  const selectedContract = useMemo(
    () => availableContracts.find(c => c.contract_id === selectedContractId),
    [availableContracts, selectedContractId]
  );

  // バリデーション：全項目必須・期間の前後関係・契約期間内かどうか
  const isDateInvalid = !!(startDate && endDate && new Date(startDate) > new Date(endDate));
  // 💡 「ライセンスの有効期間は契約期間に準じます」という運用と実制御を一致させるためのチェック
  // （編集時は既存ライセンスの契約が availableContracts に含まれないため対象外。サーバー側では常に検証される）
  const isOutOfContractRange = !!(
    !editingLicense && selectedContract && startDate && endDate &&
    (new Date(startDate) < new Date(selectedContract.start_date) || new Date(endDate) > new Date(selectedContract.end_date))
  );
  const isFormInvalid = useMemo(() => {
    return !!(!selectedContractId || !startDate || !endDate || isDateInvalid || isOutOfContractRange);
  }, [selectedContractId, startDate, endDate, isDateInvalid, isOutOfContractRange]);

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
        showToast(t('toastUpdated'), "success");
      } else {
        await assignLicenseToUser(selectedContractId, user.id, startDate, endDate);
        showToast(t('toastAssigned'), "success");
      }
      setActiveTab('list');
      await loadData();
      resetForm();
    } catch {
      showToast(t('toastFailed'), "error");
    } finally {
      setLoading(false);
    }
  };

  const handleInvalidate = async (licenseId: string) => {
    setLoading(true);
    try {
      await invalidateUserLicense(licenseId);
      showToast(t('toastInvalidated'), "success");
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
      <DialogContent className="max-w-md p-0 shadow-2xl border-none [&>button]:text-white [&>button]:opacity-70 max-h-[90vh] flex flex-col rounded-xl overflow-hidden">
        <DialogHeader className="p-6 bg-slate-900 text-white">
          <DialogTitle className="flex items-center gap-2 text-lg font-black">
            <RefreshCcw size={18} className="text-emerald-400" /> {t('title')}
          </DialogTitle>
          <p className="text-slate-400 text-[11px] font-bold mt-1">{user.user_name} / {user.client_name}</p>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="p-6 flex flex-col flex-1 overflow-hidden">
          <TabsList className="grid w-full grid-cols-2 mb-6">
            <TabsTrigger value="list" className="gap-2" onClick={resetForm}><ClipboardList size={14}/>{t('tabHistory')}</TabsTrigger>
            <TabsTrigger value="form" className="gap-2">{editingLicense ? t('tabEdit') : t('tabNew')}</TabsTrigger>
          </TabsList>

          <div className="flex-1 overflow-y-auto min-h-[380px]">
            {loading ? (
              <div className="h-full flex items-center justify-center text-slate-400"><Loader2 size={32} className="animate-spin" /></div>
            ) : (
              <>
                <TabsContent value="list" className="mt-0 space-y-3">
                  {licenses.map(l => {
                    const isPast = new Date(l.end_date) < new Date(new Date().setHours(0,0,0,0));
                    const isInvalidated = l.status === 0;
                    const isInactive = isPast || l.is_removed || isInvalidated;
                    return (
                      <div key={l.license_id} className={`p-4 border border-slate-100 rounded-xl flex justify-between items-center ${isInactive ? 'bg-slate-50 opacity-60' : 'bg-white shadow-sm'}`}>
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="text-xs font-black">{l.plan_name}</p>
                            {l.is_removed ? (
                              <span className="text-[9px] font-bold bg-rose-100 text-rose-600 px-1.5 py-0.5 rounded-full">{t('removed')}</span>
                            ) : isInvalidated ? (
                              <span className="text-[9px] font-bold bg-rose-100 text-rose-600 px-1.5 py-0.5 rounded-full">{t('invalidated')}</span>
                            ) : isPast && (
                              <span className="text-[9px] font-bold bg-slate-200 text-slate-600 px-1.5 py-0.5 rounded-full">{t('ended')}</span>
                            )}
                          </div>
                          <p className={`text-[10px] font-bold mt-0.5 ${isInactive ? 'text-slate-400' : 'text-slate-500'}`}>{l.start_date} ～ {l.end_date}</p>
                        </div>
                        {!isInactive && (
                          <div className="flex gap-1">
                            <Button variant="ghost" size="sm" onClick={() => handleEdit(l)}><Edit2 size={14} /></Button>
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button variant="ghost" size="sm" className="text-rose-500"><Ban size={14} /></Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent className="rounded-3xl p-8">
                                <AlertDialogHeader>
                                  <AlertDialogTitle>{t('confirmInvalidateTitle')}</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    {t('confirmInvalidateBody')}
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>{tCommon('cancel')}</AlertDialogCancel>
                                  <AlertDialogAction onClick={() => handleInvalidate(l.license_id)} className="bg-rose-500">{t('confirmInvalidateAction')}</AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {licenses.length === 0 && <p className="text-center text-xs text-slate-400 py-20">{t('noHistory')}</p>}
                </TabsContent>

                <TabsContent value="form" className="mt-0 space-y-5">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                      {t('planLabel')} {editingLicense && <span className="text-amber-500">{t('notEditable')}</span>}
                    </label>

                    {editingLicense ? (
                      // 編集時はプラン変更不可のため、Selectではなく現在の割当プラン名を表示する
                      // （getActiveContractsByClientは重複期間の契約を除外する仕様上、編集中の
                      // ライセンス自身の契約もavailableContractsから外れるため、Select用の
                      // 分岐をそのまま使うと常に「割当可能な契約プランがありません」になってしまう）
                      <div className="h-12 w-full rounded-xl border border-slate-200 flex items-center px-4 text-xs font-bold text-slate-600 bg-slate-50">
                        {editingLicense.plan_name}
                      </div>
                    ) : availableContracts.length > 0 ? (
                      <Select
                        onValueChange={setSelectedContractId}
                        value={selectedContractId}
                      >
                        <SelectTrigger className="rounded-xl h-12 font-bold">
                          <SelectValue placeholder={t('selectPlanPlaceholder')} />
                        </SelectTrigger>
                        <SelectContent>
                          {availableContracts.map((c) => (
                            <SelectItem key={c.contract_id} value={c.contract_id}>
                              {c.plan_name} {t('remaining', { count: c.remaining_licenses })}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      // 割当可能なプランが0件の場合のメッセージ表示（新規割当時のみ）
                      <div className="h-12 w-full rounded-xl border border-dashed border-slate-200 flex items-center justify-center text-xs text-slate-400 font-medium bg-slate-50">
                        {t('noAssignablePlans')}
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <Input
                      type="date"
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                      min={selectedContract?.start_date}
                      max={selectedContract?.end_date}
                      className="rounded-xl"
                    />
                    <Input
                      type="date"
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                      min={selectedContract?.start_date}
                      max={selectedContract?.end_date}
                      className="rounded-xl"
                    />
                  </div>
                  {selectedContract && !editingLicense && (
                    <p className="text-[10px] text-slate-400 font-medium">
                      {t('contractPeriod', { start: selectedContract.start_date, end: selectedContract.end_date })}
                    </p>
                  )}
                  {editingLicense && (
                    <p className="text-[10px] text-amber-600 font-medium">
                      {t('editPeriodHint')}
                    </p>
                  )}

                  <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder={t('notePlaceholder')} className="rounded-xl" />

                  {isFormInvalid && (
                    <p className="text-[10px] text-rose-500 font-bold flex items-center gap-1 bg-rose-50 p-2 rounded-lg">
                      <AlertCircle size={12} />
                      {isOutOfContractRange
                        ? t('errorOutOfRange')
                        : t('errorRequired')}
                    </p>
                  )}

                  <Button
                    className="w-full h-12 rounded-xl font-black bg-slate-900"
                    onClick={handleSave}
                    // 【重要】新規割当時、割当可能なプランがない場合はボタンを無効化
                    disabled={Boolean(loading || isFormInvalid || (!editingLicense && availableContracts.length === 0))}
                  >
                    {editingLicense
                      ? t('saveUpdate')
                      : (availableContracts.length === 0 ? t('noAssignableButton') : t('assign'))
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