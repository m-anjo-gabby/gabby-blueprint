'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@gabby/lib/hooks/useToast';
import { upsertContractPlan } from '@/actions/adminContractAction';
import { AlertCircle, PlusCircle, CheckCircle2, Edit } from 'lucide-react';
import { Alert } from '@/components/ui/alert';
import { ContractPlan } from '@gabby/types/contract';

// コーチ有無はcontract_typeの実値(1/2)をそのまま文字列で扱う（Select用）
const HAS_COACH_VALUE = { NO: '1', YES: '2' } as const;

const planSchema = z.object({
  plan_code: z.string().min(1, 'プランコードは必須です'),
  plan_name: z.string().min(1, 'プラン名（日本語）は必須です'),
  plan_name_en: z.string().min(1, 'プラン名（英語）は必須です'),
  has_coach: z.enum([HAS_COACH_VALUE.NO, HAS_COACH_VALUE.YES]),
  weekly_frequency: z.string().optional(),
  period_months: z.coerce.number().min(1, '1以上の数値を入力してください'),
  total_sessions: z.string().optional(),
  has_dialogue_practice: z.boolean(),
  sort_no: z.coerce.number(),
}).refine((data) => {
  if (data.has_coach !== HAS_COACH_VALUE.YES) return true;
  const weekly = Number(data.weekly_frequency);
  return Number.isInteger(weekly) && weekly >= 1;
}, {
  message: 'コーチ有りの場合、週回数(1以上)を入力してください',
  path: ['weekly_frequency'],
}).refine((data) => {
  if (data.has_coach !== HAS_COACH_VALUE.YES) return true;
  const total = Number(data.total_sessions);
  return Number.isInteger(total) && total >= 1;
}, {
  message: 'コーチ有りの場合、チケット数(1以上)を入力してください',
  path: ['total_sessions'],
});

type PlanFormInput = z.input<typeof planSchema>;
type PlanFormOutput = z.output<typeof planSchema>;

interface ContractPlanFormDialogProps {
  mode?: 'create' | 'edit';
  initialData?: ContractPlan;
}

const DEFAULT_VALUES: PlanFormInput = {
  plan_code: '',
  plan_name: '',
  plan_name_en: '',
  has_coach: HAS_COACH_VALUE.NO,
  weekly_frequency: '',
  period_months: 3,
  total_sessions: '',
  has_dialogue_practice: false,
  sort_no: 1,
};

/**
 * 契約プランマスタの登録・編集ダイアログ
 * コーチ有無(has_coach)がプランの構造を決め、コーチ有りの場合のみ週回数・チケット数・
 * ダイアログプラクティス提供有無を設定できる。
 */
export function ContractPlanFormDialog({ mode = 'create', initialData }: ContractPlanFormDialogProps) {
  const [open, setOpen] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const { showToast } = useToast();

  const getInitialValues = (data?: ContractPlan): PlanFormInput => {
    if (!data || mode === 'create') return DEFAULT_VALUES;
    return {
      plan_code: data.plan_code,
      plan_name: data.plan_name,
      plan_name_en: data.plan_name_en,
      has_coach: data.contract_type === 2 ? HAS_COACH_VALUE.YES : HAS_COACH_VALUE.NO,
      weekly_frequency: data.weekly_frequency != null ? String(data.weekly_frequency) : '',
      period_months: data.period_months,
      total_sessions: data.total_sessions != null ? String(data.total_sessions) : '',
      has_dialogue_practice: data.has_dialogue_practice,
      sort_no: data.sort_no,
    };
  };

  const form = useForm<PlanFormInput>({
    resolver: zodResolver(planSchema),
    defaultValues: getInitialValues(initialData),
  });

  const hasCoach = form.watch('has_coach') === HAS_COACH_VALUE.YES;
  const { isSubmitting } = form.formState;

  const onSubmit = async (data: PlanFormInput) => {
    setServerError(null);
    try {
      const values = planSchema.parse(data) as PlanFormOutput;
      const result = await upsertContractPlan({
        plan_id: mode === 'edit' ? initialData?.plan_id : undefined,
        plan_code: values.plan_code,
        plan_name: values.plan_name,
        plan_name_en: values.plan_name_en,
        contract_type: values.has_coach === HAS_COACH_VALUE.YES ? 2 : 1,
        weekly_frequency: hasCoach ? Number(values.weekly_frequency) : null,
        period_months: values.period_months,
        total_sessions: hasCoach ? Number(values.total_sessions) : null,
        has_dialogue_practice: hasCoach ? values.has_dialogue_practice : false,
        sort_no: values.sort_no,
      });

      if (result.success) {
        showToast(mode === 'create' ? 'プランを登録しました' : 'プランを更新しました', 'success');
        setOpen(false);
        setIsConfirming(false);
      } else {
        setServerError(result.message || '処理に失敗しました');
      }
    } catch (error) {
      setServerError('システムエラーが発生しました');
    }
  };

  const handleOpenChange = (isOpen: boolean) => {
    setOpen(isOpen);
    form.reset(getInitialValues(initialData));
    setIsConfirming(false);
    setServerError(null);
  };

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

      <DialogContent className="max-w-md p-0 overflow-hidden border-none shadow-2xl flex flex-col max-h-[90vh] [&>button]:text-white [&>button]:opacity-70 [&>button:hover]:opacity-100">
        <DialogHeader className="p-6 bg-slate-900 text-white -mx-1 -mt-1 rounded-t-none border-b border-slate-800 shrink-0">
          <DialogTitle className="flex items-center gap-2 text-lg font-black">
            {isConfirming ? (
              <><CheckCircle2 size={18} className="text-emerald-400" /> 内容の確認</>
            ) : mode === 'create' ? (
              <><PlusCircle size={18} className="text-indigo-400" /> 新規プランの登録</>
            ) : (
              <><Edit size={18} className="text-indigo-400" /> プラン情報の編集</>
            )}
          </DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="p-6 space-y-4 bg-white overflow-y-auto min-h-0">

            <div className="grid grid-cols-2 gap-4">
              <FormField control={form.control} name="plan_name" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs font-bold text-slate-500 uppercase tracking-wider">プラン名（日本語）</FormLabel>
                  {isConfirming ? (
                    <div className="p-3 bg-slate-50 rounded-xl text-sm border-2 border-slate-100 font-bold text-slate-700">{field.value}</div>
                  ) : (
                    <FormControl><Input {...field} className="bg-white rounded-xl border-slate-200" /></FormControl>
                  )}
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={form.control} name="plan_name_en" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs font-bold text-slate-500 uppercase tracking-wider">プラン名（英語）</FormLabel>
                  {isConfirming ? (
                    <div className="p-3 bg-slate-50 rounded-xl text-sm border-2 border-slate-100 font-bold text-slate-700">{field.value}</div>
                  ) : (
                    <FormControl><Input {...field} className="bg-white rounded-xl border-slate-200" /></FormControl>
                  )}
                  <FormMessage />
                </FormItem>
              )} />
            </div>

            <FormField control={form.control} name="plan_code" render={({ field }) => (
              <FormItem>
                <FormLabel className="text-xs font-bold text-slate-500 uppercase tracking-wider">プランコード（システム内部識別用）</FormLabel>
                {isConfirming ? (
                  <div className="p-3 bg-slate-50 rounded-xl text-sm border-2 border-slate-100 font-mono text-slate-700">{field.value}</div>
                ) : (
                  <FormControl><Input {...field} placeholder="例: STANDARD_WEEKLY1_3M" className="bg-white rounded-xl border-slate-200 font-mono" /></FormControl>
                )}
                <FormMessage />
              </FormItem>
            )} />

            <FormField control={form.control} name="has_coach" render={({ field }) => (
              <FormItem>
                <FormLabel className="text-xs font-bold text-slate-500 uppercase tracking-wider">コーチとのライブセッション</FormLabel>
                {isConfirming ? (
                  <div className="p-3 bg-slate-50 rounded-xl text-sm border-2 border-slate-100 font-bold text-slate-700">
                    {field.value === HAS_COACH_VALUE.YES ? '有り' : '無し'}
                  </div>
                ) : (
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger className="rounded-xl border-slate-200"><SelectValue /></SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value={HAS_COACH_VALUE.NO}>無し（Blueprintのみ）</SelectItem>
                      <SelectItem value={HAS_COACH_VALUE.YES}>有り</SelectItem>
                    </SelectContent>
                  </Select>
                )}
                <FormMessage />
              </FormItem>
            )} />

            {hasCoach && (
              <div className="space-y-4 p-4 bg-indigo-50/50 rounded-xl border border-indigo-100">
                <div className="grid grid-cols-2 gap-4">
                  <FormField control={form.control} name="weekly_frequency" render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs font-bold text-slate-500 uppercase tracking-wider">週回数</FormLabel>
                      {isConfirming ? (
                        <div className="p-3 bg-white rounded-xl text-sm border-2 border-slate-100 font-mono font-bold text-slate-700">週{field.value}回</div>
                      ) : (
                        <FormControl><Input {...field} type="number" min={1} className="bg-white rounded-xl border-slate-200" /></FormControl>
                      )}
                      <FormMessage />
                    </FormItem>
                  )} />

                  <FormField control={form.control} name="total_sessions" render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs font-bold text-slate-500 uppercase tracking-wider">チケット数（回）</FormLabel>
                      {isConfirming ? (
                        <div className="p-3 bg-white rounded-xl text-sm border-2 border-slate-100 font-mono font-bold text-slate-700">{field.value}回</div>
                      ) : (
                        <FormControl><Input {...field} type="number" min={1} className="bg-white rounded-xl border-slate-200" /></FormControl>
                      )}
                      <FormMessage />
                    </FormItem>
                  )} />
                </div>

                <FormField control={form.control} name="has_dialogue_practice" render={({ field }) => (
                  <FormItem className="flex items-center justify-between rounded-xl bg-white border border-slate-200 px-3 py-2.5">
                    <FormLabel className="text-xs font-bold text-slate-600">ダイアログプラクティス（自主トレ）を提供する</FormLabel>
                    {isConfirming ? (
                      <span className={`text-xs font-bold ${field.value ? 'text-indigo-600' : 'text-slate-400'}`}>{field.value ? '有り' : '無し'}</span>
                    ) : (
                      <FormControl>
                        <input
                          type="checkbox"
                          checked={field.value}
                          onChange={(e) => field.onChange(e.target.checked)}
                          className="h-4 w-4 rounded border-slate-300 accent-indigo-600"
                        />
                      </FormControl>
                    )}
                  </FormItem>
                )} />
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <FormField control={form.control} name="period_months" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs font-bold text-slate-500 uppercase tracking-wider">標準契約期間（月数）</FormLabel>
                  {isConfirming ? (
                    <div className="p-3 bg-slate-50 rounded-xl text-sm border-2 border-slate-100 font-mono font-bold text-slate-700">{field.value as number}か月</div>
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

              <FormField control={form.control} name="sort_no" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs font-bold text-slate-500 uppercase tracking-wider">表示順</FormLabel>
                  {isConfirming ? (
                    <div className="p-3 bg-slate-50 rounded-xl text-sm border-2 border-slate-100 font-mono font-bold text-slate-700">{field.value as number}</div>
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

            <div className="pt-4 mt-6 border-t border-slate-100">
              {isConfirming ? (
                <div className="space-y-4">
                  <p className="text-sm font-bold text-center text-slate-800">この内容で{mode === 'create' ? '登録' : '更新'}してもよろしいですか？</p>
                  {serverError && (
                    <Alert variant="destructive" className="py-2 flex items-center gap-2 text-xs border-none bg-rose-50 text-rose-600">
                      <AlertCircle size={14} />{serverError}
                    </Alert>
                  )}
                  <div className="flex gap-3">
                    <Button type="button" variant="ghost" className="flex-1 rounded-xl font-bold text-slate-400" onClick={() => setIsConfirming(false)} disabled={isSubmitting}>
                      いいえ
                    </Button>
                    <Button type="submit" className="flex-1 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-bold shadow-lg" disabled={isSubmitting}>
                      {isSubmitting ? '処理中...' : 'はい、確定します'}
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
  );
}
