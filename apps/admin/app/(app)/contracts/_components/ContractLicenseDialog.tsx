'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from '@/components/ui/dialog'
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
} from "@/components/ui/alert-dialog"
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Users, UserPlus, Ban, Loader2, ArrowLeft, CheckCircle2, AlertCircle } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { getLicenseAssignmentUsers, assignLicenseToUser, invalidateUserLicense } from '@/actions/adminContractAction'
import { useToast } from '@gabby/lib/hooks/useToast'
import { LicenseUserItem, ContractDetail } from '@gabby/types/contract'
import { startOfDay } from 'date-fns'

interface Props {
  contract: ContractDetail;
  children: React.ReactNode;
}

/**
 * ライセンス割当管理ダイアログ
 * 特定の契約に対して、ユーザーの割当（追加）および解除（削除）を行う
 */
export function ContractLicenseDialog({ contract, children }: Props) {
  const t = useTranslations('contracts.licenseDialog')
  const tCommon = useTranslations('common')
  // --- 状態管理 ---
  const [open, setOpen] = useState(false)
  const [isAddMode, setIsAddMode] = useState(false)
  const [loading, setLoading] = useState(false)
  const [assignedUsers, setAssignedUsers] = useState<LicenseUserItem[]>([])
  const [unassignedUsers, setUnassignedUsers] = useState<LicenseUserItem[]>([])
  
  const { showToast } = useToast()

  // 契約終了判定
  // "YYYY-MM-DD"（JSTの日付文字列）をそのままnew Date()に渡すとUTC 00:00として解釈され、
  // 日本時間との9時間のズレで日付判定がズレるため startOfDay で正規化してから比較する
  const isExpired = useMemo(() => {
    return startOfDay(new Date(contract.end_date)) < startOfDay(new Date());
  }, [contract.end_date]);

  // --- 算出プロパティ ---
  const isLicenseFull = useMemo(() => 
    assignedUsers.length >= contract.max_licenses, 
    [assignedUsers.length, contract.max_licenses]
  )

  /**
   * 割当状況・未割当ユーザーの一覧を取得
   */
  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const data = await getLicenseAssignmentUsers(contract.contract_id, contract.client_id)
      setAssignedUsers(data.assignedUsers)
      setUnassignedUsers(data.unassignedUsers)
    } catch (error) {
      showToast(t('toastFetchFailed'), 'error')
    } finally {
      setLoading(false)
    }
  }, [contract.contract_id, contract.client_id, showToast, t])

  // --- ハンドラー ---

  /**
   * ライセンス無効化
   */
  const handleInvalidate = async (licenseId: string) => {
    setLoading(true)
    try {
      const res = await invalidateUserLicense(licenseId)
      if (res.success) {
        showToast(t('toastInvalidated'), 'success')
        await loadData()
      } else {
        showToast(res.message || t('toastInvalidateFailed'), 'error')
        setLoading(false)
      }
    } catch {
      showToast(t('toastNetworkError'), 'error')
      setLoading(false)
    }
  }

  /**
   * ライセンス割当
   */
  const handleAdd = async (userId: string) => {
    if (isLicenseFull) {
      showToast(t('toastLimitReached'), 'error')
      return
    }

    setLoading(true)
    try {
      const res = await assignLicenseToUser(
        contract.contract_id, 
        userId, 
        contract.start_date, 
        contract.end_date
      )
      if (res.success) {
        showToast(t('toastAdded'), 'success')
        await loadData()
        setIsAddMode(false)
      } else {
        showToast(res.message || t('toastAddFailed'), 'error')
        setLoading(false)
      }
    } catch {
      showToast(t('toastNetworkError'), 'error')
      setLoading(false)
    }
  }

  /**
   * ダイアログ開閉時の処理
   */
  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen)
    
    if (nextOpen) {
      // 開くときは必ず一覧モードから開始し、最新データをロード
      setIsAddMode(false)
      loadData()
    } else {
      // 閉じるときは状態をクリア（前回のリストを一瞬見せないため）
      setAssignedUsers([])
      setUnassignedUsers([])
      setIsAddMode(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        {children}
      </DialogTrigger>

      <DialogContent className="max-w-md p-0 overflow-hidden border-none shadow-2xl [&>button]:text-white [&>button]:opacity-70 [&>button:hover]:opacity-100 [&>button]:focus:ring-0 [&>button]:focus:ring-offset-0 [&>button]:focus-visible:ring-0 [&>button]:outline-none">
        {/* ヘッダーエリア */}
        <DialogHeader className="p-6 bg-slate-900 text-white">
          <DialogTitle className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-lg">
              {isAddMode ? t('titleAdd') : t('titleList')}
              <Badge className="bg-indigo-500 hover:bg-indigo-500 text-white font-mono border-none px-2 py-0.5">
                {assignedUsers.length} / {contract.max_licenses}
              </Badge>
            </div>
          </DialogTitle>
        </DialogHeader>

        <div className="p-6 bg-white">
          {/* ローディング表示 (初回一覧読み込み時のみ) */}
          {loading && !isAddMode && assignedUsers.length === 0 ? (
            <div className="flex justify-center p-12"><Loader2 className="animate-spin text-indigo-500" /></div>
          ) : isAddMode ? (
            /* --- 追加モード UI --- */
            <div className="space-y-4">
              {/* 戻るボタンエリア */}
              <div className="flex items-center justify-between">
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={() => setIsAddMode(false)} 
                  className="h-8 text-slate-500 hover:text-indigo-600 p-0 font-bold transition-colors"
                >
                  <ArrowLeft size={16} className="mr-1" /> {t('back')}
                </Button>

                {isLicenseFull && (
                  <Badge variant="destructive" className="bg-rose-50 text-rose-600 border-rose-100 text-[10px] font-bold shadow-none">
                    {t('limitReachedBadge')}
                  </Badge>
                )}
              </div>

              <ScrollArea className="h-[350px] pr-4">
                {unassignedUsers.length === 0 ? (
                  /* --- エンプティステート：追加対象ユーザーなし --- */
                  <div className="text-center py-20 bg-slate-50/50 rounded-3xl border border-dashed border-slate-200 px-6">
                    <div className="w-12 h-12 bg-white rounded-2xl shadow-sm flex items-center justify-center mx-auto mb-4">
                      <Users className="text-slate-300" size={24} />
                    </div>
                    <p className="text-sm text-slate-600 font-bold">{t('emptyAddTitle')}</p>
                    <p className="text-[10px] text-slate-400 mt-2 leading-relaxed max-w-[200px] mx-auto whitespace-pre-line">
                      {t('emptyAddHint')}
                    </p>
                  </div>
                ) : (
                  /* --- ユーザーリスト --- */
                  <div className="space-y-2.5">
                    {unassignedUsers.map((user) => (
                      <div 
                        key={user.id} 
                        className="flex items-center justify-between p-3 border border-slate-100 rounded-2xl hover:border-indigo-200 hover:bg-indigo-50/30 transition-all bg-slate-50/50 group"
                      >
                        <div className="overflow-hidden pr-2">
                          <p className="text-sm font-bold text-slate-800 truncate group-hover:text-indigo-900 transition-colors">
                            {user.user_name}
                          </p>
                          <p className="text-[11px] text-slate-400 truncate font-medium">
                            {user.email}
                          </p>
                        </div>
                        
                        <Button 
                          size="sm" 
                          onClick={() => handleAdd(user.id)} 
                          disabled={loading || isLicenseFull}
                          className={`
                            h-8 px-4 rounded-xl font-bold transition-all active:scale-95
                            ${isLicenseFull 
                              ? 'bg-slate-100 text-slate-400 cursor-not-allowed' 
                              : 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-md shadow-indigo-100'
                            }
                          `}
                        >
                          {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : t('addButton')}
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </div>
          ) : (
            /* --- 一覧モード UI --- */
            <div className="space-y-4">
              {!isExpired && (
                /* 有効契約のみ追加可能 */
                <div className="flex justify-end">
                  <Button 
                    size="sm" 
                    disabled={isLicenseFull || loading}
                    onClick={() => setIsAddMode(true)}
                    className="bg-slate-900 hover:bg-slate-800 text-white gap-1.5 rounded-lg shadow-md transition-all active:scale-95"
                  >
                    <UserPlus size={14} /> {t('titleAdd')}
                  </Button>
                </div>
              )}
              <ScrollArea className="h-[350px] pr-4">
                {assignedUsers.length === 0 ? (
                  <div className="text-center py-20 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                    <Users className="mx-auto text-slate-300 mb-2" size={32} />
                    <p className="text-sm text-slate-400">{t('emptyAssignedTitle')}</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {assignedUsers.map(user => {
                      const isInvalidated = user.license_status === 0;
                      return (
                      <div key={user.id} className={`flex items-center justify-between p-3 border rounded-xl group ${isInvalidated ? 'bg-slate-50 opacity-60' : 'bg-white shadow-sm'}`}>
                        <div className="flex items-center gap-3 overflow-hidden">
                          {isInvalidated ? (
                            <Ban size={16} className="text-slate-400 shrink-0" />
                          ) : (
                            <CheckCircle2 size={16} className="text-emerald-500 shrink-0" />
                          )}
                          <div className="overflow-hidden">
                            <div className="flex items-center gap-1.5">
                              <p className="text-sm font-bold text-slate-800 truncate">{user.user_name}</p>
                              {isInvalidated && (
                                <span className="shrink-0 text-[9px] font-bold bg-rose-100 text-rose-600 px-1.5 py-0.5 rounded-full">{t('invalidatedBadge')}</span>
                              )}
                            </div>
                            <p className="text-[11px] text-slate-400 truncate">{user.email}</p>
                          </div>
                          {contract.contract_type === 2 && user.ticket && (
                            <Badge className="shrink-0 bg-indigo-50 text-indigo-600 border-indigo-100 hover:bg-indigo-50 text-[10px] font-mono font-bold">
                              {t('ticketUsage', { used: user.ticket.used_sessions, total: user.ticket.total_sessions })}
                            </Badge>
                          )}
                        </div>

                        {/* 無効化確認ダイアログ（有効契約かつ未無効化の場合のみ） */}
                        {!isExpired && user.license_id && !isInvalidated && (
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="ghost" size="sm" disabled={loading} className="h-8 w-8 p-0 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-full transition-colors">
                                <Ban size={16} />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent className="rounded-3xl border-none shadow-2xl p-8">
                              <AlertDialogHeader className="space-y-4">
                                <div className="w-16 h-16 bg-rose-50 text-rose-500 rounded-full flex items-center justify-center mx-auto">
                                  <AlertCircle size={32} />
                                </div>
                                <div className="text-center space-y-2">
                                  <AlertDialogTitle className="text-xl font-black text-slate-800">{t('invalidateConfirmTitle')}</AlertDialogTitle>
                                  <AlertDialogDescription className="text-xs font-medium text-slate-500 leading-relaxed">
                                    {t('invalidateConfirmBody', { name: user.user_name })}
                                  </AlertDialogDescription>
                                </div>
                              </AlertDialogHeader>
                              <AlertDialogFooter className="flex gap-3 sm:justify-center mt-6">
                                <AlertDialogCancel className="flex-1 h-12 rounded-2xl border-none bg-slate-100 text-slate-500 font-bold hover:bg-slate-200">{tCommon('cancel')}</AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={() => handleInvalidate(user.license_id!)}
                                  className="flex-1 h-12 rounded-2xl bg-rose-500 text-white font-bold hover:bg-rose-600 shadow-lg shadow-rose-100 border-none"
                                >
                                  {t('invalidateConfirmAction')}
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        )}
                      </div>
                      );
                    })}
                  </div>
                )}
              </ScrollArea>
            </div>
          )}
        </div>

        {/* フッターエリア */}
        <DialogFooter className="p-4 bg-slate-50 border-t flex justify-center">
           <p className="text-[10px] text-slate-400 font-medium">{t('footerHint')}</p>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}