'use client';

import { useState, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useTranslations } from 'next-intl';
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

type FormT = ReturnType<typeof useTranslations<'contracts.plans.formDialog'>>;

function createPlanSchema(t: FormT) {
  return z.object({
    plan_code: z.string().min(1, t('errors.planCodeRequired')),
    plan_name: z.string().min(1, t('errors.planNameRequired')),
    plan_name_en: z.string().min(1, t('errors.planNameEnRequired')),
    has_coach: z.enum([HAS_COACH_VALUE.NO, HAS_COACH_VALUE.YES]),
    weekly_frequency: z.string().optional(),
    period_months: z.coerce.number().min(1, t('errors.periodInvalid')),
    total_sessions: z.string().optional(),
    has_dialogue_practice: z.boolean(),
    sort_no: z.coerce.number(),
  }).refine((data) => {
    if (data.has_coach !== HAS_COACH_VALUE.YES) return true;
    const weekly = Number(data.weekly_frequency);
    return Number.isInteger(weekly) && weekly >= 1;
  }, {
    message: t('errors.weeklyFrequencyRequired'),
    path: ['weekly_frequency'],
  }).refine((data) => {
    if (data.has_coach !== HAS_COACH_VALUE.YES) return true;
    const total = Number(data.total_sessions);
    return Number.isInteger(total) && total >= 1;
  }, {
    message: t('errors.totalSessionsRequired'),
    path: ['total_sessions'],
  });
}

type PlanFormInput = z.input<ReturnType<typeof createPlanSchema>>;
type PlanFormOutput = z.output<ReturnType<typeof createPlanSchema>>;

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
  const t = useTranslations('contracts.plans.formDialog');
  const planSchema = useMemo(() => createPlanSchema(t), [t]);
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
        showToast(mode === 'create' ? t('toastCreated') : t('toastUpdated'), 'success');
        setOpen(false);
        setIsConfirming(false);
      } else {
        setServerError(result.message || t('toastGenericFailed'));
      }
    } catch (error) {
      setServerError(t('toastSystemError'));
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
              <><PlusCircle size={18} className="text-indigo-400" /> {t('createTitle')}</>
            ) : (
              <><Edit size={18} className="text-indigo-400" /> {t('editTitle')}</>
            )}
          </DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col min-h-0 flex-1">
          <div className="p-6 space-y-4 bg-white overflow-y-auto min-h-0 flex-1">

            <div className="grid grid-cols-2 gap-4">
              <FormField control={form.control} name="plan_name" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs font-bold text-slate-500 uppercase tracking-wider">{t('planNameJaLabel')}</FormLabel>
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
                  <FormLabel className="text-xs font-bold text-slate-500 uppercase tracking-wider">{t('planNameEnLabel')}</FormLabel>
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
                <FormLabel className="text-xs font-bold text-slate-500 uppercase tracking-wider">{t('planCodeLabel')}</FormLabel>
                {isConfirming ? (
                  <div className="p-3 bg-slate-50 rounded-xl text-sm border-2 border-slate-100 font-mono text-slate-700">{field.value}</div>
                ) : (
                  <FormControl><Input {...field} placeholder={t('planCodePlaceholder')} className="bg-white rounded-xl border-slate-200 font-mono" /></FormControl>
                )}
                <FormMessage />
              </FormItem>
            )} />

            <FormField control={form.control} name="has_coach" render={({ field }) => (
              <FormItem>
                <FormLabel className="text-xs font-bold text-slate-500 uppercase tracking-wider">{t('hasCoachLabel')}</FormLabel>
                {isConfirming ? (
                  <div className="p-3 bg-slate-50 rounded-xl text-sm border-2 border-slate-100 font-bold text-slate-700">
                    {field.value === HAS_COACH_VALUE.YES ? t('hasCoachDisplayYes') : t('hasCoachDisplayNo')}
                  </div>
                ) : (
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger className="rounded-xl border-slate-200"><SelectValue /></SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value={HAS_COACH_VALUE.NO}>{t('hasCoachNo')}</SelectItem>
                      <SelectItem value={HAS_COACH_VALUE.YES}>{t('hasCoachYes')}</SelectItem>
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
                      <FormLabel className="text-xs font-bold text-slate-500 uppercase tracking-wider">{t('weeklyFrequencyLabel')}</FormLabel>
                      {isConfirming ? (
                        <div className="p-3 bg-white rounded-xl text-sm border-2 border-slate-100 font-mono font-bold text-slate-700">{t('weeklyFrequencyDisplay', { count: field.value ?? '' })}</div>
                      ) : (
                        <FormControl><Input {...field} type="number" min={1} className="bg-white rounded-xl border-slate-200" /></FormControl>
                      )}
                      <FormMessage />
                    </FormItem>
                  )} />

                  <FormField control={form.control} name="total_sessions" render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs font-bold text-slate-500 uppercase tracking-wider">{t('totalSessionsLabel')}</FormLabel>
                      {isConfirming ? (
                        <div className="p-3 bg-white rounded-xl text-sm border-2 border-slate-100 font-mono font-bold text-slate-700">{t('sessionsUnit', { count: field.value ?? '' })}</div>
                      ) : (
                        <FormControl><Input {...field} type="number" min={1} className="bg-white rounded-xl border-slate-200" /></FormControl>
                      )}
                      <FormMessage />
                    </FormItem>
                  )} />
                </div>

                <FormField control={form.control} name="has_dialogue_practice" render={({ field }) => (
                  <FormItem className="flex items-center justify-between rounded-xl bg-white border border-slate-200 px-3 py-2.5">
                    <FormLabel className="text-xs font-bold text-slate-600">{t('dialoguePracticeLabel')}</FormLabel>
                    {isConfirming ? (
                      <span className={`text-xs font-bold ${field.value ? 'text-indigo-600' : 'text-slate-400'}`}>{field.value ? t('dialoguePracticeYes') : t('dialoguePracticeNo')}</span>
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
                  <FormLabel className="text-xs font-bold text-slate-500 uppercase tracking-wider">{t('periodMonthsLabel')}</FormLabel>
                  {isConfirming ? (
                    <div className="p-3 bg-slate-50 rounded-xl text-sm border-2 border-slate-100 font-mono font-bold text-slate-700">{t('periodUnit', { count: field.value as number })}</div>
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
                  <FormLabel className="text-xs font-bold text-slate-500 uppercase tracking-wider">{t('sortNoLabel')}</FormLabel>
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
          </div>

            <div className="shrink-0 p-6 pt-4 border-t border-slate-100 bg-white">
              {isConfirming ? (
                <div className="space-y-4">
                  <p className="text-sm font-bold text-center text-slate-800">{t('confirmQuestion', { action: mode === 'create' ? t('actionCreate') : t('actionUpdate') })}</p>
                  {serverError && (
                    <Alert variant="destructive" className="py-2 flex items-center gap-2 text-xs border-none bg-rose-50 text-rose-600">
                      <AlertCircle size={14} />{serverError}
                    </Alert>
                  )}
                  <div className="flex gap-3">
                    <Button type="button" variant="ghost" className="flex-1 rounded-xl font-bold text-slate-400" onClick={() => setIsConfirming(false)} disabled={isSubmitting}>
                      {t('no')}
                    </Button>
                    <Button type="submit" className="flex-1 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-bold shadow-lg" disabled={isSubmitting}>
                      {isSubmitting ? t('processing') : t('yesConfirm')}
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
  );
}
