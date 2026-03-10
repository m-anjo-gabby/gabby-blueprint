'use client'

import { useState, useCallback } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/hooks/useToast'
import { createContract, updateContract } from '@/actions/adminContractAction'
import { getClientsFilter } from '@/actions/adminClientAction'
import { useRouter } from 'next/navigation'
import { AlertCircle, PlusCircle, Edit, CheckCircle2 } from 'lucide-react'
import { Alert } from '@/components/ui/alert'
import { ContractInfo } from '@/types/contract'

// --- スキーマ定義 ---
const contractSchema = z.object({
  client_id: z.string().min(1, '顧客を選択してください'),
  plan_name: z.string().min(1, 'プラン名は必須です'),
  max_licenses: z.coerce.number().min(1, '1以上の数値を入力してください'),
  start_date: z.string().min(1, '開始日は必須です'),
  end_date: z.string().min(1, '終了日は必須です'),
  note: z.string().nullable().optional(),
})

type ContractFormInput = z.input<typeof contractSchema>
type ContractFormOutput = z.output<typeof contractSchema>

const DEFAULT_VALUES: ContractFormInput = {
  client_id: '',
  plan_name: 'Standard',
  max_licenses: 10,
  start_date: '',
  end_date: '',
  note: '',
}

interface ContractFormDialogProps {
  mode?: 'create' | 'edit'
  initialData?: ContractInfo
}

/**
 * 契約情報の登録・編集ダイアログ
 * 入力フォームと確認画面の2ステップ構成
 */
export function ContractFormDialog({ mode = 'create', initialData }: ContractFormDialogProps) {
  // --- States ---
  const [open, setOpen] = useState(false)
  const [isConfirming, setIsConfirming] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)
  const [clients, setClients] = useState<{ client_id: string; client_name: string }[]>([])

  const { showToast } = useToast()
  const router = useRouter()

  // --- Helpers ---
  const getInitialValues = useCallback((data?: ContractInfo): ContractFormInput => {
    if (!data || mode === 'create') return DEFAULT_VALUES
    return {
      client_id: data.client_id ?? '',
      plan_name: data.plan_name ?? '',
      max_licenses: data.max_licenses ?? 0,
      start_date: data.start_date ?? '',
      end_date: data.end_date ?? '',
      note: data.note ?? '',
    }
  }, [mode])

  const form = useForm<ContractFormInput>({
    resolver: zodResolver(contractSchema),
    defaultValues: getInitialValues(initialData),
  })

  /**
   * ダイアログ状態管理
   * 開く際にマスターデータ(顧客)を取得し、フォームを初期化する
   */
  const handleOpenChange = async (nextOpen: boolean) => {
    setOpen(nextOpen)
    if (nextOpen) {
      form.reset(getInitialValues(initialData))
      setIsConfirming(false)
      setServerError(null)
      const clientData = await getClientsFilter()
      setClients(clientData)
    } else {
      setIsConfirming(false)
    }
  }

  /**
   * 送信処理
   */
  const onSubmit = async (data: ContractFormInput) => {
    setServerError(null)
    const values = contractSchema.parse(data) as ContractFormOutput
    try {
      let result
      if (mode === 'edit' && initialData?.contract_id) {
        result = await updateContract(initialData.contract_id, values)
      } else {
        result = await createContract(values)
      }

      if (result.success) {
        showToast(mode === 'create' ? '契約を登録しました' : '契約を更新しました', 'success')
        setOpen(false)
        router.refresh()
      } else {
        setServerError(result.message || '予期せぬエラーが発生しました')
      }
    } catch (error) {
      setServerError('システムエラーが発生しました。')
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        {mode === 'create' ? (
          <Button className="gap-2 font-bold shadow-sm bg-indigo-600 hover:bg-indigo-700 text-white border-none">
            <PlusCircle size={16} /> 新規登録
          </Button>
        ) : (
          <Button variant="outline" size="sm" className="h-8 px-3 gap-1.5 border-slate-200 text-slate-600 hover:bg-slate-50">
            <Edit size={14} /> 編集
          </Button>
        )}
      </DialogTrigger>

      <DialogContent className="max-w-md p-0 overflow-hidden border-none shadow-2xl [&>button]:text-white [&>button]:opacity-70 [&>button:hover]:opacity-100">
        <DialogHeader className="p-6 bg-slate-900 text-white -mx-1 -mt-1 rounded-t-none border-b border-slate-800">
          <DialogTitle className="flex items-center gap-2 text-lg font-black">
            {isConfirming ? (
              <><CheckCircle2 size={18} className="text-emerald-400" /> 登録内容の確認</>
            ) : mode === 'create' ? (
              <><PlusCircle size={18} className="text-indigo-400" /> 新規契約の登録</>
            ) : (
              <><Edit size={18} className="text-indigo-400" /> 契約内容の編集</>
            )}
          </DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="p-6 space-y-4 bg-white">
            
            {/* --- 対象顧客 --- */}
            <FormField control={form.control} name="client_id" render={({ field }) => (
              <FormItem>
                <FormLabel className="text-xs font-bold text-slate-500 uppercase tracking-wider">対象顧客</FormLabel>
                {isConfirming ? (
                  <div className="p-3 bg-slate-50 rounded-xl text-sm border-2 border-slate-100 font-bold text-slate-700">
                    {clients.find((c) => c.client_id === (field.value as string))?.client_name || '未選択'}
                  </div>
                ) : (
                  <Select value={field.value as string} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger disabled={mode === 'edit'} className="bg-white rounded-xl border-slate-200">
                        <SelectValue placeholder="顧客を選択" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {clients.map((c) => (
                        <SelectItem key={c.client_id} value={c.client_id}>{c.client_name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                <FormMessage />
              </FormItem>
            )} />

            {/* --- プラン & ライセンス --- */}
            <div className="grid grid-cols-2 gap-4">
              <FormField control={form.control} name="plan_name" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs font-bold text-slate-500 uppercase tracking-wider">プラン名</FormLabel>
                  {isConfirming ? (
                    <div className="p-3 bg-slate-50 rounded-xl text-sm border-2 border-slate-100 text-slate-700">{field.value as string}</div>
                  ) : (
                    <FormControl><Input {...field} value={(field.value as string) ?? ''} className="bg-white rounded-xl border-slate-200" /></FormControl>
                  )}
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={form.control} name="max_licenses" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs font-bold text-slate-500 uppercase tracking-wider">上限ライセンス数</FormLabel>
                  {isConfirming ? (
                    <div className="p-3 bg-slate-50 rounded-xl text-sm border-2 border-slate-100 font-mono font-bold text-slate-700">{String(field.value ?? '')}</div>
                  ) : (
                    <FormControl>
                      <Input
                        type="number"
                        {...field}
                        value={(field.value as number | string) ?? ''}
                        onChange={(e) => field.onChange(e.target.value)}
                        className="bg-white rounded-xl border-slate-200"
                      />
                    </FormControl>
                  )}
                  <FormMessage />
                </FormItem>
              )} />
            </div>

            {/* --- 契約期間 --- */}
            <div className="grid grid-cols-2 gap-4">
              <FormField control={form.control} name="start_date" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs font-bold text-slate-500 uppercase tracking-wider">開始日</FormLabel>
                  {isConfirming ? (
                    <div className="p-3 bg-slate-50 rounded-xl text-sm border-2 border-slate-100 text-slate-700">{field.value as string}</div>
                  ) : (
                    <FormControl><Input type="date" {...field} value={(field.value as string) ?? ''} className="bg-white rounded-xl border-slate-200" /></FormControl>
                  )}
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="end_date" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs font-bold text-slate-500 uppercase tracking-wider">終了日</FormLabel>
                  {isConfirming ? (
                    <div className="p-3 bg-slate-50 rounded-xl text-sm border-2 border-slate-100 text-slate-700">{field.value as string}</div>
                  ) : (
                    <FormControl><Input type="date" {...field} value={(field.value as string) ?? ''} className="bg-white rounded-xl border-slate-200" /></FormControl>
                  )}
                  <FormMessage />
                </FormItem>
              )} />
            </div>

            {/* --- 備考 --- */}
            <FormField control={form.control} name="note" render={({ field }) => (
              <FormItem>
                <FormLabel className="text-xs font-bold text-slate-500 uppercase tracking-wider">備考 (管理メモ)</FormLabel>
                {isConfirming ? (
                  <div className="p-3 bg-slate-50 rounded-xl text-xs border-2 border-slate-100 min-h-[60px] whitespace-pre-wrap text-slate-600 leading-relaxed">{field.value || '-'}</div>
                ) : (
                  <FormControl><Textarea {...field} value={(field.value as string) ?? ''} className="resize-none bg-white rounded-xl border-slate-200 min-h-[80px]" /></FormControl>
                )}
                <FormMessage />
              </FormItem>
            )} />

            {/* --- アクションエリア --- */}
            <div className="pt-4 mt-6 border-t border-slate-100">
              {isConfirming ? (
                <div className="space-y-4">
                  <p className="text-sm font-bold text-center text-slate-800">この内容で{mode === 'create' ? '登録' : '更新'}してもよろしいですか？</p>
                  {serverError && (
                    <Alert variant="destructive" className="py-2 flex items-center gap-2 text-xs border-none bg-rose-50 text-rose-600">
                      <AlertCircle className="h-4 w-4" /> {serverError}
                    </Alert>
                  )}
                  <div className="flex gap-3">
                    <Button type="button" variant="ghost" className="flex-1 rounded-xl font-bold text-slate-400" onClick={() => setIsConfirming(false)} disabled={form.formState.isSubmitting}>いいえ</Button>
                    <Button type="submit" className="flex-1 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-bold shadow-lg" disabled={form.formState.isSubmitting}>
                      {form.formState.isSubmitting ? '処理中...' : 'はい、確定します'}
                    </Button>
                  </div>
                </div>
              ) : (
                <Button 
                  type="button" 
                  className="w-full bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-bold h-11 shadow-md"
                  onClick={async () => {
                    const isValid = await form.trigger();
                    if (isValid) setIsConfirming(true);
                  }}
                >
                  {mode === 'create' ? '登録内容を確認する' : '編集内容を確認する'}
                </Button>
              )}
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}