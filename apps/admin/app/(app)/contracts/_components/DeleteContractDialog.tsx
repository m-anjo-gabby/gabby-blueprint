'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
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
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Trash2, AlertCircle, ShieldAlert } from 'lucide-react'
import { useToast } from '@gabby/lib/hooks/useToast'
import { deleteContract, purgeContractWithHistory } from '@/actions/adminContractAction'
import { ContractDetail } from '@gabby/types/contract'

interface Props {
  contract: ContractDetail
}

type Stage = 'confirm' | 'blocked_by_history' | 'confirm_purge'

/**
 * 契約削除の確認ダイアログ
 * ライセンス割当実績のある契約は誤操作防止のため削除ボタン自体を無効化する
 * （実績のない契約に限り、テスト登録・誤入力の取り消し用途で物理削除を許可する）
 *
 * 通常削除がDB制約（割当履歴の残存）で拒否された場合のみ、検証用契約の後片付け目的で
 * 「履歴含めて完全に削除する」エスカレーションを提示する。誤操作防止のため、
 * 対象のプラン名を入力させてから実行させる。
 */
export function DeleteContractDialog({ contract }: Props) {
  const [open, setOpen] = useState(false)
  const [stage, setStage] = useState<Stage>('confirm')
  const [isProcessing, setIsProcessing] = useState(false)
  const [confirmText, setConfirmText] = useState('')
  const { showToast } = useToast()
  const router = useRouter()

  const hasAssignments = contract.current_assigned_count > 0
  const isConfirmTextValid = confirmText === contract.plan_name

  const resetAndClose = () => {
    setOpen(false)
    setStage('confirm')
    setConfirmText('')
  }

  const handleDelete = async () => {
    setIsProcessing(true)
    try {
      const result = await deleteContract(contract.contract_id)
      if (result.success) {
        showToast('契約を削除しました', 'success')
        resetAndClose()
        router.refresh()
      } else if (result.reason === 'has_history') {
        setStage('blocked_by_history')
      } else {
        showToast(result.message || '削除に失敗しました', 'error')
      }
    } catch {
      showToast('通信エラーが発生しました', 'error')
    } finally {
      setIsProcessing(false)
    }
  }

  const handlePurge = async () => {
    if (!isConfirmTextValid) return
    setIsProcessing(true)
    try {
      const result = await purgeContractWithHistory(contract.contract_id)
      if (result.success) {
        showToast('契約と関連する割当履歴を完全に削除しました', 'success')
        resetAndClose()
        router.refresh()
      } else {
        showToast(result.message || '削除に失敗しました', 'error')
      }
    } catch {
      showToast('通信エラーが発生しました', 'error')
    } finally {
      setIsProcessing(false)
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={(next) => !isProcessing && (next ? setOpen(true) : resetAndClose())}>
      <AlertDialogTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          disabled={hasAssignments}
          title={hasAssignments ? 'ライセンスが割り当てられているため削除できません' : '契約を削除'}
          className="h-8 w-8 p-0 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-full transition-colors disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-slate-300"
        >
          <Trash2 size={14} />
        </Button>
      </AlertDialogTrigger>

      {stage === 'confirm' && (
        <AlertDialogContent className="max-w-md rounded-3xl border-none shadow-2xl p-8">
          <AlertDialogHeader className="space-y-4">
            <div className="w-16 h-16 bg-rose-50 text-rose-500 rounded-full flex items-center justify-center mx-auto">
              <AlertCircle size={32} />
            </div>
            <div className="text-center space-y-2">
              <AlertDialogTitle className="text-xl font-black text-slate-800">契約削除の確認</AlertDialogTitle>
              <AlertDialogDescription className="text-xs font-medium text-slate-500 leading-relaxed">
                「{contract.client_name} / {contract.plan_name}」を削除します。<br />
                この操作は取り消せません。テスト登録や誤入力の契約であることを確認の上、実行してください。
              </AlertDialogDescription>
            </div>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex gap-3 sm:justify-center mt-6">
            <AlertDialogCancel disabled={isProcessing} className="flex-1 h-12 rounded-2xl border-none bg-slate-100 text-slate-500 font-bold hover:bg-slate-200">
              キャンセル
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault()
                handleDelete()
              }}
              disabled={isProcessing}
              className="flex-1 h-12 rounded-2xl bg-rose-500 text-white font-bold hover:bg-rose-600 shadow-lg shadow-rose-100 border-none"
            >
              {isProcessing ? '削除中...' : '削除する'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      )}

      {stage === 'blocked_by_history' && (
        <AlertDialogContent className="max-w-md rounded-3xl border-none shadow-2xl p-8">
          <AlertDialogHeader className="space-y-4">
            <div className="w-16 h-16 bg-amber-50 text-amber-500 rounded-full flex items-center justify-center mx-auto">
              <AlertCircle size={32} />
            </div>
            <div className="text-center space-y-2">
              <AlertDialogTitle className="text-xl font-black text-slate-800">削除できません</AlertDialogTitle>
              <AlertDialogDescription className="text-xs font-medium text-slate-500 leading-relaxed">
                この契約は過去にライセンス発行の実績があるため、通常の削除はできません。<br />
                検証用に作成したテスト契約である場合に限り、割当履歴ごと完全に削除することもできます。
              </AlertDialogDescription>
            </div>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex gap-3 sm:justify-center mt-6">
            <AlertDialogCancel disabled={isProcessing} className="flex-1 h-12 rounded-2xl border-none bg-slate-100 text-slate-500 font-bold hover:bg-slate-200">
              閉じる
            </AlertDialogCancel>
            <Button
              type="button"
              variant="outline"
              onClick={() => setStage('confirm_purge')}
              className="flex-1 h-12 rounded-2xl border-amber-200 text-amber-600 font-bold hover:bg-amber-50"
            >
              履歴ごと完全に削除する
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      )}

      {stage === 'confirm_purge' && (
        <AlertDialogContent className="max-w-md rounded-3xl border-none shadow-2xl p-8">
          <AlertDialogHeader className="space-y-4">
            <div className="w-16 h-16 bg-rose-50 text-rose-500 rounded-full flex items-center justify-center mx-auto">
              <ShieldAlert size={32} />
            </div>
            <div className="text-center space-y-2">
              <AlertDialogTitle className="text-xl font-black text-slate-800">完全削除の最終確認</AlertDialogTitle>
              <AlertDialogDescription className="text-xs font-medium text-slate-500 leading-relaxed text-left">
                「{contract.client_name} / {contract.plan_name}」に紐づく以下を<span className="font-bold text-rose-600">全て復元不能に削除</span>します。
                <ul className="list-disc list-inside mt-2 space-y-0.5">
                  <li>契約情報本体</li>
                  <li>割り当て済みライセンス</li>
                  <li>ライセンス割当・解除の履歴</li>
                  <li>ライブセッションチケットの発行・消化履歴</li>
                </ul>
                <p className="mt-2">実運用契約には絶対に使用しないでください。続行するにはプラン名を入力してください。</p>
              </AlertDialogDescription>
            </div>
          </AlertDialogHeader>

          <div className="space-y-1.5 mt-2">
            <p className="text-[10px] font-bold text-slate-400">
              確認のため「<span className="text-slate-700">{contract.plan_name}</span>」と入力してください
            </p>
            <Input
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              className="rounded-xl border-slate-200"
              autoComplete="off"
            />
          </div>

          <AlertDialogFooter className="flex gap-3 sm:justify-center mt-6">
            <Button
              type="button"
              variant="ghost"
              disabled={isProcessing}
              onClick={() => { setConfirmText(''); setStage('blocked_by_history') }}
              className="flex-1 h-12 rounded-2xl bg-slate-100 text-slate-500 font-bold hover:bg-slate-200"
            >
              戻る
            </Button>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault()
                handlePurge()
              }}
              disabled={isProcessing || !isConfirmTextValid}
              className="flex-1 h-12 rounded-2xl bg-rose-500 text-white font-bold hover:bg-rose-600 shadow-lg shadow-rose-100 border-none disabled:opacity-40"
            >
              {isProcessing ? '削除中...' : '完全に削除する'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      )}
    </AlertDialog>
  )
}
