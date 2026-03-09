'use client'

import { useState, useCallback } from 'react' // useEffect を削除
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
import { AlertCircle, PlusCircle } from 'lucide-react'
import { Alert } from '@/components/ui/alert'
import { ContractInfo } from '@/types/contract'

// --- スキーマと初期値の設定は変更なし ---
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

export function ContractFormDialog({ mode = 'create', initialData }: ContractFormDialogProps) {
  const [open, setOpen] = useState(false)
  const [isConfirming, setIsConfirming] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)
  const [clients, setClients] = useState<{ client_id: string; client_name: string }[]>([])

  const { showToast } = useToast()
  const router = useRouter()

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
   * ダイアログを開く・閉じる際のアクションを関数化
   */
  const handleOpenChange = async (nextOpen: boolean) => {
    setOpen(nextOpen)
    
    if (nextOpen) {
      // 開くとき：フォームをリセットし、必要なデータを取得
      form.reset(getInitialValues(initialData))
      setIsConfirming(false)
      setServerError(null)
      const clientData = await getClientsFilter()
      setClients(clientData)
    } else {
      // 閉じるとき：確認画面を解除
      setIsConfirming(false)
    }
  }

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
          <Button className="gap-2 font-bold shadow-sm">
            <PlusCircle size={16} /> 新規登録
          </Button>
        ) : (
          <Button variant="outline" size="sm" className="h-8 px-2">編集</Button>
        )}
      </DialogTrigger>

      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {isConfirming ? '登録内容の確認' : mode === 'create' ? '新規契約の登録' : '契約内容の編集'}
          </DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            {/* フォーム内部（顧客選択、プラン名、ライセンス数、日付、備考）は以前のコードと同じ */}
            {/* ... 省略 ... */}
            
            <FormField control={form.control} name="client_id" render={({ field }) => (
              <FormItem>
                <FormLabel className="font-medium">対象顧客</FormLabel>
                {isConfirming ? (
                  <div className="p-2 bg-slate-50 rounded text-sm border font-medium">
                    {clients.find((c) => c.client_id === (field.value as string))?.client_name || '未選択'}
                  </div>
                ) : (
                  <Select value={field.value as string} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger disabled={mode === 'edit'} className="bg-white">
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

            <div className="grid grid-cols-2 gap-4">
              <FormField control={form.control} name="plan_name" render={({ field }) => (
                <FormItem>
                  <FormLabel className="font-medium">プラン名</FormLabel>
                  {isConfirming ? (
                    <div className="p-2 bg-slate-50 rounded text-sm border">{field.value as string}</div>
                  ) : (
                    <FormControl><Input {...field} value={(field.value as string) ?? ''} className="bg-white" /></FormControl>
                  )}
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={form.control} name="max_licenses" render={({ field }) => (
                <FormItem>
                  <FormLabel className="font-medium">上限ライセンス数</FormLabel>
                  {isConfirming ? (
                    <div className="p-2 bg-slate-50 rounded text-sm border font-mono">{String(field.value ?? '')}</div>
                  ) : (
                    <FormControl>
                      <Input
                        type="number"
                        {...field}
                        value={(field.value as number | string) ?? ''}
                        onChange={(e) => field.onChange(e.target.value)}
                        className="bg-white"
                      />
                    </FormControl>
                  )}
                  <FormMessage />
                </FormItem>
              )} />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <FormField control={form.control} name="start_date" render={({ field }) => (
                <FormItem>
                  <FormLabel className="font-medium">開始日</FormLabel>
                  {isConfirming ? (
                    <div className="p-2 bg-slate-50 rounded text-sm border">{field.value as string}</div>
                  ) : (
                    <FormControl><Input type="date" {...field} value={(field.value as string) ?? ''} className="bg-white" /></FormControl>
                  )}
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="end_date" render={({ field }) => (
                <FormItem>
                  <FormLabel className="font-medium">終了日</FormLabel>
                  {isConfirming ? (
                    <div className="p-2 bg-slate-50 rounded text-sm border">{field.value as string}</div>
                  ) : (
                    <FormControl><Input type="date" {...field} value={(field.value as string) ?? ''} className="bg-white" /></FormControl>
                  )}
                  <FormMessage />
                </FormItem>
              )} />
            </div>

            <FormField control={form.control} name="note" render={({ field }) => (
              <FormItem>
                <FormLabel className="font-medium">備考 (管理メモ)</FormLabel>
                {isConfirming ? (
                  <div className="p-2 bg-slate-50 rounded text-xs border min-h-15 whitespace-pre-wrap text-slate-600">{field.value || '-'}</div>
                ) : (
                  <FormControl><Textarea {...field} value={(field.value as string) ?? ''} className="resize-none bg-white" /></FormControl>
                )}
                <FormMessage />
              </FormItem>
            )} />

            <div className="pt-4 mt-6 border-t">
              {isConfirming ? (
                <div className="space-y-4">
                  <p className="text-sm font-bold text-center">この内容で{mode === 'create' ? '登録' : '更新'}してもよろしいですか？</p>
                  {serverError && <Alert variant="destructive" className="py-2 flex items-center gap-2 text-xs"><AlertCircle className="h-4 w-4" /> {serverError}</Alert>}
                  <div className="flex gap-2">
                    <Button type="button" variant="outline" className="flex-1" onClick={() => setIsConfirming(false)} disabled={form.formState.isSubmitting}>いいえ</Button>
                    <Button type="submit" className="flex-1" disabled={form.formState.isSubmitting}>
                      {form.formState.isSubmitting ? '実行中...' : 'はい'}
                    </Button>
                  </div>
                </div>
              ) : (
                <Button 
                  type="button" 
                  className="w-full"
                  onClick={async () => {
                    const isValid = await form.trigger();
                    if (isValid) setIsConfirming(true);
                  }}
                >
                  {mode === 'create' ? '登録内容を確認' : '編集内容を確認'}
                </Button>
              )}
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}