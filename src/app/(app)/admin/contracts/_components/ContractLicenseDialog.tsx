'use client'

import { useState, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Users, UserPlus, Trash2, Loader2, ArrowLeft, CheckCircle2 } from 'lucide-react'
import { getLicenseAssignmentUsers, updateLicenseAssignments } from '@/actions/adminContractAction'
import { useToast } from '@/hooks/useToast'
import { LicenseUserItem, ContractInfo } from '@/types/contract'

interface Props {
  contract: ContractInfo
}

export function ContractLicenseDialog({ contract }: Props) {
  const [open, setOpen] = useState(false)
  const [isAddMode, setIsAddMode] = useState(false) // モード切替
  const [loading, setLoading] = useState(false)
  const [assignedUsers, setAssignedUsers] = useState<LicenseUserItem[]>([])
  const [unassignedUsers, setUnassignedUsers] = useState<LicenseUserItem[]>([])
  const { showToast } = useToast()

  // データのロード（割当済みと未割当の両方を取得）
  const loadData = async () => {
    setLoading(true)
    try {
      const data = await getLicenseAssignmentUsers(contract.contract_id, contract.client_id)
      setAssignedUsers(data.assignedUsers)
      setUnassignedUsers(data.unassignedUsers)
    } catch (error) {
      showToast('データ取得に失敗しました', 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (open) {
      loadData()
      setIsAddMode(false)
    }
  }, [open])

  // 共通の更新処理
  const syncAssignments = async (newUserIds: string[], successMsg: string) => {
    const res = await updateLicenseAssignments(
      contract.contract_id,
      newUserIds,
      contract.start_date,
      contract.end_date
    )
    if (res.success) {
      showToast(successMsg, 'success')
      await loadData()
    } else {
      showToast('更新に失敗しました', 'error')
    }
  }

  // 解除処理
  const handleRemove = (userId: string) => {
    if (!confirm('このユーザーのライセンスを解除しますか？')) return
    const nextIds = assignedUsers.filter(u => u.id !== userId).map(u => u.id)
    syncAssignments(nextIds, 'ライセンスを解除しました')
  }

  // 追加処理
  const handleAdd = (userId: string) => {
    if (assignedUsers.length >= contract.max_licenses) {
      showToast('上限数に達しているため追加できません', 'error')
      return
    }
    const nextIds = [...assignedUsers.map(u => u.id), userId]
    syncAssignments(nextIds, 'ユーザーを追加しました')
    setIsAddMode(false) // 追加したら一覧に戻る（または続けて追加ならここを消す）
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2 border-indigo-200 hover:bg-indigo-50 text-indigo-700">
          <Users size={14} /> ライセンス
        </Button>
      </DialogTrigger>

      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {isAddMode ? 'ユーザーを追加' : 'ライセンス割当状況'}
              <Badge variant="secondary" className="font-mono">
                {assignedUsers.length} / {contract.max_licenses}
              </Badge>
            </div>
          </DialogTitle>
        </DialogHeader>

        <div className="py-2">
          {loading ? (
            <div className="flex justify-center p-12"><Loader2 className="animate-spin text-indigo-500" /></div>
          ) : isAddMode ? (
            /* --- 追加モード: 未割当ユーザーリスト --- */
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <Button variant="ghost" size="sm" onClick={() => setIsAddMode(false)} className="h-7 px-2">
                  <ArrowLeft size={14} className="mr-1" /> 戻る
                </Button>
                <span>追加可能なユーザー ({unassignedUsers.length})</span>
              </div>
              <ScrollArea className="h-[350px] border rounded-lg bg-slate-50 p-2">
                {unassignedUsers.length === 0 ? (
                  <p className="text-center text-sm text-slate-400 py-10">追加できるユーザーはいません</p>
                ) : (
                  <div className="space-y-2">
                    {unassignedUsers.map(user => (
                      <div key={user.id} className="flex items-center justify-between p-3 bg-white border rounded-md shadow-sm">
                        <div className="overflow-hidden">
                          <p className="text-sm font-bold truncate">{user.user_name}</p>
                          <p className="text-[11px] text-slate-500 truncate">{user.email}</p>
                        </div>
                        <Button size="sm" variant="outline" className="h-8 border-indigo-200 text-indigo-600 hover:bg-indigo-50" onClick={() => handleAdd(user.id)}>
                          追加
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </div>
          ) : (
            /* --- 一覧モード: 割当済みユーザーリスト --- */
            <div className="space-y-4">
              <div className="flex justify-end">
                <Button 
                  size="sm" 
                  disabled={assignedUsers.length >= contract.max_licenses}
                  onClick={() => setIsAddMode(true)}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white gap-1"
                >
                  <UserPlus size={14} /> ユーザーを追加
                </Button>
              </div>
              <ScrollArea className="h-[350px] border rounded-lg bg-slate-50 p-2">
                {assignedUsers.length === 0 ? (
                  <div className="text-center py-10 space-y-2">
                    <Users className="mx-auto text-slate-200" size={40} />
                    <p className="text-sm text-slate-400">割り当てられているユーザーはいません</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {assignedUsers.map(user => (
                      <div key={user.id} className="flex items-center justify-between p-3 bg-white border rounded-md shadow-sm group">
                        <div className="flex items-center gap-3 overflow-hidden">
                          <CheckCircle2 size={16} className="text-emerald-500 shrink-0" />
                          <div className="overflow-hidden">
                            <p className="text-sm font-bold truncate">{user.user_name}</p>
                            <p className="text-[11px] text-slate-500 truncate">{user.email}</p>
                          </div>
                        </div>
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          className="h-8 w-8 p-0 text-slate-300 hover:text-rose-500 hover:bg-rose-50"
                          onClick={() => handleRemove(user.id)}
                        >
                          <Trash2 size={16} />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </div>
          )}
        </div>

        <DialogFooter className="sm:justify-start">
          <div className="text-[10px] text-slate-400">
            ※ ライセンス解除は即座に反映され、ユーザーはログインできなくなります。
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}