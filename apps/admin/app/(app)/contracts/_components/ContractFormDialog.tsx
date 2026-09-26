'use client'

import { useState, useCallback, useMemo } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { addMonths, format } from 'date-fns'
import { useTranslations } from 'next-intl'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useToast } from '@gabby/lib/hooks/useToast'
import { createContract, updateContract, getContractPlans } from '@/actions/adminContractAction'
import { getClientsFilter } from '@/actions/adminClientAction'
import { AlertCircle, PlusCircle, Edit, CheckCircle2 } from 'lucide-react'
import { Alert } from '@/components/ui/alert'
import { ContractDetail, ContractPlan } from '@gabby/types/contract'
import { SearchableSelect } from '@/components/common/SearchableSelect'

// --- スキーマ定義 ---
// 契約タイプ（コーチ有無）はプラン選択に完全に従属する構造的な属性のため、契約側の
// 入力項目からは廃止した（サーバー側でplan_idからプランマスタのcontract_typeを取得する）。
type FormT = ReturnType<typeof useTranslations<'contracts.formDialog'>>;

function createContractSchema(t: FormT) {
  return z.object({
    client_id: z.string().min(1, t('errors.clientRequired')),
    plan_id: z.string().min(1, t('errors.planRequired')),
    plan_name: z.string().min(1, t('errors.planNameRequired')),
    plan_name_en: z.string().min(1, t('errors.planNameEnRequired')),
    max_licenses: z.coerce.number().min(1, t('errors.maxLicensesInvalid')),
    start_date: z.string().min(1, t('errors.startDateRequired')),
    end_date: z.string().min(1, t('errors.endDateRequired')),
    status: z.coerce.number(),
    note: z.string().nullable().optional(),
    weekly_frequency: z.coerce.number().nullable().optional(),
    total_sessions: z.coerce.number().nullable().optional(),
    has_dialogue_practice: z.boolean(),
  }).refine((data) => {
    // 開始日と終了日が両方存在する場合のみチェック
    if (data.start_date && data.end_date) {
      return new Date(data.start_date) <= new Date(data.end_date);
    }
    return true;
  }, {
    message: t('errors.endAfterStart'),
    path: ["end_date"], // エラーを end_date フィールドに紐付ける
  }).refine((data) => data.weekly_frequency == null || data.weekly_frequency >= 1, {
    message: t('errors.weeklyFrequencyInvalid'),
    path: ["weekly_frequency"],
  }).refine((data) => data.total_sessions == null || data.total_sessions >= 1, {
    message: t('errors.totalSessionsInvalid'),
    path: ["total_sessions"],
  });
}

type ContractFormInput = z.input<ReturnType<typeof createContractSchema>>
type ContractFormOutput = z.output<ReturnType<typeof createContractSchema>>

const DEFAULT_VALUES: ContractFormInput = {
  client_id: '',
  plan_id: '',
  plan_name: '',
  plan_name_en: '',
  max_licenses: 10,
  start_date: '',
  end_date: '',
  status: 1,
  note: '',
  weekly_frequency: null,
  total_sessions: null,
  has_dialogue_practice: false,
}

interface ContractFormDialogProps {
  mode?: 'create' | 'edit'
  initialData?: ContractDetail
}

/**
 * 契約情報の登録・編集ダイアログ
 * 入力フォームと確認画面の2ステップ構成
 */
export function ContractFormDialog({ mode = 'create', initialData }: ContractFormDialogProps) {
  const t = useTranslations('contracts.formDialog')
  const contractSchema = useMemo(() => createContractSchema(t), [t])
  const CONTRACT_STATUS_OPTIONS = useMemo(() => [
    { value: 1, label: t('statusActiveOption'), className: 'text-emerald-600' },
    { value: 0, label: t('statusInactiveOption'), className: 'text-slate-500' },
    { value: 9, label: t('statusCancelledOption'), className: 'text-rose-600' },
  ] as const, [t])
  const getContractStatusLabel = useCallback((status: number): string => {
    return CONTRACT_STATUS_OPTIONS.find((s) => s.value === status)?.label ?? t('statusUnknownOption');
  }, [CONTRACT_STATUS_OPTIONS, t])
  // --- States ---
  const [open, setOpen] = useState(false)
  const [isConfirming, setIsConfirming] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)
  const [clients, setClients] = useState<{ client_id: string; client_name: string }[]>([])
  const [plans, setPlans] = useState<ContractPlan[]>([])

  const { showToast } = useToast()

  // --- Helpers ---
  const getInitialValues = useCallback((data?: ContractDetail): ContractFormInput => {
    if (!data || mode === 'create') return DEFAULT_VALUES
    return {
      client_id: data.client_id ?? '',
      plan_id: data.plan_id,
      plan_name: data.plan_name ?? '',
      plan_name_en: data.plan_name_en ?? '',
      max_licenses: data.max_licenses ?? 0,
      start_date: data.start_date ?? '',
      end_date: data.end_date ?? '',
      status: data.status ?? 1,
      note: data.note ?? '',
      weekly_frequency: data.weekly_frequency ?? null,
      total_sessions: data.total_sessions ?? null,
      has_dialogue_practice: data.has_dialogue_practice ?? false,
    }
  }, [mode])

  const form = useForm<ContractFormInput>({
    resolver: zodResolver(contractSchema),
    defaultValues: getInitialValues(initialData),
  })

  const selectedPlanId = form.watch('plan_id')
  const selectedPlan = useMemo(() => plans.find((p) => p.plan_id === selectedPlanId) ?? null, [plans, selectedPlanId])
  const isLivePlan = selectedPlan?.contract_type === 2

  /**
   * プラン選択時に、プラン名・週回数・チケット数・ダイアログプラクティス提供有無を
   * マスタ値で初期セットする（この後、契約ごとに個別調整可能）。
   * あわせて、開始日=本日・終了日=本日からプランの標準契約期間(period_months)分先、
   * を初期値として提案する（これも後から自由に変更できる）。
   */
  const handlePlanChange = useCallback((planId: string) => {
    form.setValue('plan_id', planId)
    const plan = plans.find((p) => p.plan_id === planId)
    if (!plan) return
    form.setValue('plan_name', plan.plan_name)
    form.setValue('plan_name_en', plan.plan_name_en)
    form.setValue('weekly_frequency', plan.weekly_frequency)
    form.setValue('total_sessions', plan.total_sessions)
    form.setValue('has_dialogue_practice', plan.has_dialogue_practice)

    const today = new Date()
    form.setValue('start_date', format(today, 'yyyy-MM-dd'))
    form.setValue('end_date', format(addMonths(today, plan.period_months), 'yyyy-MM-dd'))
  }, [form, plans])

  /**
   * ダイアログ状態管理
   * 開く際にマスターデータ(顧客・契約プラン)を取得し、フォームを初期化する
   */
  const handleOpenChange = async (nextOpen: boolean) => {
    setOpen(nextOpen)

    // 確認モードとエラーを常にリセット
    setIsConfirming(false)
    setServerError(null)

    if (nextOpen) {
      // 開くときは最新のデータでフォームを初期化し、マスターを取得
      const initialValues = getInitialValues(initialData)
      form.reset(initialValues)
      const [clientData, planData] = await Promise.all([getClientsFilter(), getContractPlans()])
      setClients(clientData)
      setPlans(planData)
    } else {
      // 閉じるときもフォームをリセット（メモリリークや意図しない保持を防ぐ）
      form.reset(getInitialValues(initialData))
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
        showToast(mode === 'create' ? t('toastCreated') : t('toastUpdated'), 'success')
        setOpen(false)
      } else {
        setServerError(result.message || t('toastUnexpectedError'))
      }
    } catch (error) {
      setServerError(t('toastSystemError'))
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        {mode === 'create' ? (
          <Button className="gap-2 font-bold shadow-sm bg-brand hover:bg-brand-strong text-white border-none">
            <PlusCircle size={16} /> {t('createButton')}
          </Button>
        ) : (
          <Button variant="outline" size="sm" className="h-8 px-3 gap-1.5 border-slate-200 text-slate-600 hover:bg-slate-50">
            <Edit size={14} /> {t('editButton')}
          </Button>
        )}
      </DialogTrigger>

      <DialogContent className="max-w-lg p-0 overflow-hidden border-none shadow-2xl flex flex-col max-h-[90vh] [&>button]:text-white [&>button]:opacity-70 [&>button:hover]:opacity-100">
        <DialogHeader className="p-6 bg-slate-900 text-white -mx-1 -mt-1 rounded-t-none border-b border-slate-800 shrink-0">
          <DialogTitle className="flex items-center gap-2 text-lg font-black">
            {isConfirming ? (
              <><CheckCircle2 size={18} className="text-emerald-400" /> {t('confirmTitle')}</>
            ) : mode === 'create' ? (
              <><PlusCircle size={18} className="text-brand-400" /> {t('createTitle')}</>
            ) : (
              <><Edit size={18} className="text-brand-400" /> {t('editTitle')}</>
            )}
          </DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col min-h-0 flex-1">
          <div className="p-6 space-y-4 bg-white overflow-y-auto min-h-0 flex-1">

            {/* --- 対象顧客 --- */}
            <FormField
              control={form.control}
              name="client_id"
              render={({ field }) => (
                <FormItem className="flex flex-col">
                  <FormLabel className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                    {t('clientLabel')}
                  </FormLabel>

                  {isConfirming ? (
                    /* 確認モード：読み取り専用のスタイル */
                    <div className="p-3 bg-slate-50 rounded-xl text-sm border-2 border-slate-100 font-bold text-slate-700">
                      {clients.find((c) => c.client_id === (field.value as string))?.client_name || t('clientUnselected')}
                    </div>
                  ) : (
                    /* 入力モード：汎用検索セレクター */
                    <FormControl>
                      <SearchableSelect
                        options={clients.map(c => ({ value: c.client_id, label: c.client_name }))}
                        value={field.value as string}
                        onChange={field.onChange}
                        placeholder={t('clientPlaceholder')}
                        searchPlaceholder={t('clientSearchPlaceholder')}
                        // 編集モード時は顧客変更不可
                        disabled={mode === 'edit'} 
                        className="bg-white"
                      />
                    </FormControl>
                  )}
                  
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* --- プラン選択 --- */}
            {/* プランを選ぶだけで契約タイプ（コーチ有無）・週回数・チケット数・ダイアログ
                プラクティス提供有無が一意に決まる。以降の各フィールドはこの初期値を
                契約ごとに個別調整するためのものであり、値自体はプランマスタとは独立に保存される。 */}
            <FormField control={form.control} name="plan_id" render={({ field }) => (
              <FormItem>
                <FormLabel className="text-xs font-bold text-slate-500 uppercase tracking-wider">{t('planLabel')}</FormLabel>
                {isConfirming ? (
                  <div className="p-3 bg-slate-50 rounded-xl text-sm border-2 border-slate-100 font-bold text-slate-700">
                    {selectedPlan?.plan_name ?? t('planUnknown')}
                  </div>
                ) : (
                  <Select onValueChange={handlePlanChange} value={field.value as string}>
                    <FormControl>
                      <SelectTrigger className="rounded-xl border-slate-200"><SelectValue placeholder={t('planSelectPlaceholder')} /></SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {plans.map((plan) => (
                        <SelectItem key={plan.plan_id} value={plan.plan_id}>
                          {plan.plan_name}{plan.contract_type === 1 ? t('planNoCoachSuffix') : t('planCoachSuffix', { weekly: plan.weekly_frequency ?? 0 })}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                <FormMessage />
              </FormItem>
            )} />

            {/* --- ライブセッション設定（コーチ有りプランの場合のみ表示） --- */}
            {isLivePlan && (
              <div className="space-y-4 p-4 bg-brand-50/50 rounded-xl border border-brand-100">
                <div className="grid grid-cols-2 gap-4">
                  <FormField control={form.control} name="weekly_frequency" render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs font-bold text-slate-500 uppercase tracking-wider">{t('weeklyFrequencyLabel')}</FormLabel>
                      {isConfirming ? (
                        <div className="p-3 bg-white rounded-xl text-sm border-2 border-slate-100 font-mono font-bold text-slate-700">{t('weeklyFrequencyDisplay', { count: (field.value as number | null) ?? '-' })}</div>
                      ) : (
                        <FormControl>
                          <Input
                            type="number"
                            min={1}
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

                  <FormField control={form.control} name="total_sessions" render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs font-bold text-slate-500 uppercase tracking-wider">{t('totalSessionsLabel')}</FormLabel>
                      {isConfirming ? (
                        <div className="p-3 bg-white rounded-xl text-sm border-2 border-slate-100 font-mono font-bold text-slate-700">{t('sessionsUnit', { count: (field.value as number | null) ?? '-' })}</div>
                      ) : (
                        <FormControl>
                          <Input
                            type="number"
                            min={1}
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

                <FormField control={form.control} name="has_dialogue_practice" render={({ field }) => (
                  <FormItem className="flex items-center justify-between rounded-xl bg-white border border-slate-200 px-3 py-2.5">
                    <FormLabel className="text-xs font-bold text-slate-600">{t('dialoguePracticeLabel')}</FormLabel>
                    {isConfirming ? (
                      <span className={`text-xs font-bold ${field.value ? 'text-brand' : 'text-slate-400'}`}>{field.value ? t('dialoguePracticeYes') : t('dialoguePracticeNo')}</span>
                    ) : (
                      <FormControl>
                        <input
                          type="checkbox"
                          checked={field.value as boolean}
                          onChange={(e) => field.onChange(e.target.checked)}
                          className="h-4 w-4 rounded border-slate-300 accent-brand"
                        />
                      </FormControl>
                    )}
                  </FormItem>
                )} />

                <p className="text-[10px] text-slate-400 leading-relaxed">
                  {t('ticketHint')}
                </p>
              </div>
            )}

            {/* --- プラン名 & ライセンス --- */}
            <div className="grid grid-cols-2 gap-4">
              <FormField control={form.control} name="plan_name" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs font-bold text-slate-500 uppercase tracking-wider">{t('planNameJaLabel')}</FormLabel>
                  {isConfirming ? (
                    <div className="p-3 bg-slate-50 rounded-xl text-sm border-2 border-slate-100 text-slate-700">{field.value as string}</div>
                  ) : (
                    <FormControl>
                      <Input
                        {...field}
                        value={(field.value as string) ?? ''}
                        className="bg-white rounded-xl border-slate-200"
                      />
                    </FormControl>
                  )}
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={form.control} name="plan_name_en" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs font-bold text-slate-500 uppercase tracking-wider">{t('planNameEnLabel')}</FormLabel>
                  {isConfirming ? (
                    <div className="p-3 bg-slate-50 rounded-xl text-sm border-2 border-slate-100 text-slate-700">{field.value as string}</div>
                  ) : (
                    <FormControl>
                      <Input
                        {...field}
                        value={(field.value as string) ?? ''}
                        className="bg-white rounded-xl border-slate-200"
                      />
                    </FormControl>
                  )}
                  <FormMessage />
                </FormItem>
              )} />
            </div>

            <FormField control={form.control} name="max_licenses" render={({ field }) => (
              <FormItem>
                <FormLabel className="text-xs font-bold text-slate-500 uppercase tracking-wider">{t('maxLicensesLabel')}</FormLabel>
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

            {/* --- 契約期間 --- */}
            <div className="grid grid-cols-2 gap-4">
              <FormField control={form.control} name="start_date" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs font-bold text-slate-500 uppercase tracking-wider">{t('startDateLabel')}</FormLabel>
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
                  <FormLabel className="text-xs font-bold text-slate-500 uppercase tracking-wider">{t('endDateLabel')}</FormLabel>
                  {isConfirming ? (
                    <div className="p-3 bg-slate-50 rounded-xl text-sm border-2 border-slate-100 text-slate-700">{field.value as string}</div>
                  ) : (
                    <FormControl><Input type="date" {...field} value={(field.value as string) ?? ''} className="bg-white rounded-xl border-slate-200" /></FormControl>
                  )}
                  <FormMessage />
                </FormItem>
              )} />
            </div>

            {/* --- ステータス（編集時のみ変更可。新規登録は常に「有効」で作成） --- */}
            {mode === 'edit' && (
              <FormField control={form.control} name="status" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs font-bold text-slate-500 uppercase tracking-wider">{t('statusLabel')}</FormLabel>
                  {isConfirming ? (
                    <div className="p-3 bg-slate-50 rounded-xl text-sm border-2 border-slate-100 font-bold text-slate-700">
                      {getContractStatusLabel(field.value as number)}
                    </div>
                  ) : (
                    <Select
                      onValueChange={(val) => field.onChange(Number(val))}
                      value={String(field.value ?? 1)}
                    >
                      <FormControl>
                        <SelectTrigger className="rounded-xl border-slate-200"><SelectValue /></SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {CONTRACT_STATUS_OPTIONS.map((opt) => (
                          <SelectItem key={opt.value} value={String(opt.value)}>
                            <span className={opt.className}>{opt.label}</span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                  <FormMessage />
                </FormItem>
              )} />
            )}

            {/* --- 備考 --- */}
            <FormField control={form.control} name="note" render={({ field }) => (
              <FormItem>
                <FormLabel className="text-xs font-bold text-slate-500 uppercase tracking-wider">{t('noteLabel')}</FormLabel>
                {isConfirming ? (
                  <div className="p-3 bg-slate-50 rounded-xl text-xs border-2 border-slate-100 min-h-[60px] whitespace-pre-wrap text-slate-600 leading-relaxed">{field.value || t('noteEmpty')}</div>
                ) : (
                  <FormControl><Textarea {...field} value={(field.value as string) ?? ''} className="resize-none bg-white rounded-xl border-slate-200 min-h-[80px]" /></FormControl>
                )}
                <FormMessage />
              </FormItem>
            )} />
          </div>

            {/* --- アクションエリア（スクロール領域の外。画面が小さくても常に見える） --- */}
            <div className="shrink-0 p-6 pt-4 border-t border-slate-100 bg-white">
              {isConfirming ? (
                <div className="space-y-4">
                  <p className="text-sm font-bold text-center text-slate-800">{t('confirmQuestion', { action: mode === 'create' ? t('actionCreate') : t('actionUpdate') })}</p>
                  {serverError && (
                    <Alert variant="destructive" className="py-2 flex items-center gap-2 text-xs border-none bg-rose-50 text-rose-600">
                      <AlertCircle className="h-4 w-4" /> {serverError}
                    </Alert>
                  )}
                  <div className="flex gap-3">
                    <Button type="button" variant="ghost" className="flex-1 rounded-xl font-bold text-slate-400" onClick={() => setIsConfirming(false)} disabled={form.formState.isSubmitting}>{t('no')}</Button>
                    <Button type="submit" className="flex-1 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-bold shadow-lg" disabled={form.formState.isSubmitting}>
                      {form.formState.isSubmitting ? t('processing') : t('yesConfirm')}
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
                  {mode === 'create' ? t('confirmCreateButton') : t('confirmEditButton')}
                </Button>
              )}
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}