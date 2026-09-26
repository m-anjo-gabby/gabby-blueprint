'use client';

import { useState, useEffect, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useTranslations } from 'next-intl';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage, FormDescription } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@gabby/lib/hooks/useToast';
import { PlusCircle, Edit, CheckCircle2 } from 'lucide-react';
import { Content, CONTENT_SCOPES, CONTENT_TYPES, ContentScope, ContentType, CEFR_CONFIG } from '@gabby/types/content';
import { QUESTION_TYPES, SPRINT_TYPES } from '@gabby/types/sprint';
import { DIALOGUE_CATEGORIES, DialogueCategory } from '@gabby/types/dialogue';
import { upsertContent } from '@/actions/adminContentAction';
import { useRouter } from 'next/navigation';

/**
 * --- 1. スキーマ定義 ---
 */
type FormT = ReturnType<typeof useTranslations<'contents.formDialog'>>;

function createContentSchema(t: FormT) {
  const contentSchema = z.object({
    content_name: z.string().min(1, t('errors.nameRequired')),
    content_name_en: z.string().optional(),
    content_type: z.string().min(1, t('errors.typeRequired')),
    content_scope: z.string().min(1, t('errors.scopeRequired')),
    content_label: z.string().min(1, t('errors.labelRequired')),
    seq_no: z.string().min(1, t('errors.seqRequired')),
    difficulty_level: z.string().min(1, t('errors.difficultyRequired')),
    description: z.string().optional(),
    cefr_id: z.string().optional(),
    sprint_type: z.string().optional(),

    // コーパススプリント用の拡張メタデータ用フィールド
    sprint_theme: z.string().optional(),
    sprint_has_level: z.boolean(),
    sprint_support_speed: z.boolean(),
    sprint_support_builders: z.boolean(),
    sprint_support_structure: z.boolean(),
    sprint_support_mastery: z.boolean(),

    // ダイアログプラクティス用のセット分類（content_type=3のみで使用）
    dialogue_category: z.string().optional(),
  });

  return contentSchema.superRefine((data, ctx) => {
    // 教材種別が「ダイアログプラクティス (3)」の場合のバリデーション
    if (data.content_type === '3') {
      if (!data.dialogue_category || data.dialogue_category === 'none') {
        ctx.addIssue({
          code: 'custom',
          message: t('errors.dialogueCategoryRequired'),
          path: ['dialogue_category'],
        });
      }
    }

    // 教材種別が「スプリント (2)」の場合のバリデーション
    if (data.content_type === '2') {
      if (!data.sprint_type || data.sprint_type === 'none') {
        ctx.addIssue({
          code: 'custom',
          message: t('errors.sprintTypeRequired'),
          path: ['sprint_type'],
        });
        return;
      }

      // コーパススプリント ('1') の場合のみテーマを必須にする等のバリデーション
      if (data.sprint_type === '1') {
        if (!data.sprint_theme || data.sprint_theme.trim() === '') {
          ctx.addIssue({
            code: 'custom',
            message: t('errors.sprintThemeRequired'),
            path: ['sprint_theme'],
          });
        }

        // 少なくとも一つの問題種別が選択されているかチェック
        if (!data.sprint_support_speed && !data.sprint_support_builders && !data.sprint_support_structure && !data.sprint_support_mastery) {
          ctx.addIssue({
            code: 'custom',
            message: t('errors.sprintSupportRequired'),
            path: ['sprint_support_speed'], // 代表してspeedの箇所にエラーを出す
          });
        }
      }
    }
  });
}

type ContentFormValues = z.infer<ReturnType<typeof createContentSchema>>;

interface ContentFormDialogProps {
  mode?: 'create' | 'edit';
  initialData?: Content;
}

const DEFAULT_VALUES: ContentFormValues = {
  content_name: '',
  content_name_en: '',
  content_type: '0',
  content_scope: '9',
  content_label: '',
  seq_no: '1',
  difficulty_level: '1',
  description: '',
  cefr_id: 'none',
  sprint_type: 'none',
  sprint_theme: '',
  sprint_has_level: false, // コーパスは基本レベル1固定なのでデフォルトfalse
  sprint_support_speed: true,
  sprint_support_builders: false,
  sprint_support_structure: false,
  sprint_support_mastery: false,
  dialogue_category: 'none',
};

export function ContentFormDialog({ mode = 'create', initialData }: ContentFormDialogProps) {
  const t = useTranslations('contents.formDialog');
  const contentSchema = useMemo(() => createContentSchema(t), [t]);
  const [open, setOpen] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const { showToast } = useToast();
  const router = useRouter();

  const getInitialValues = (data?: Content): ContentFormValues => {
    if (!data || mode === 'create') return DEFAULT_VALUES;
    
    const sprintMeta = data.metadata?.sprint;
    return {
      content_name: data.content_name,
      content_name_en: data.content_name_en || '',
      content_type: String(data.content_type),
      content_scope: String(data.content_scope),
      content_label: data.content_label,
      seq_no: String(data.seq_no),
      difficulty_level: String(data.difficulty_level || 1),
      description: data.description || '',
      cefr_id: data.metadata?.cefr?.id || 'none',
      sprint_type: sprintMeta?.sprint_type || 'none',
      // メタデータから値を復元
      sprint_theme: sprintMeta?.theme || '',
      sprint_has_level: sprintMeta?.has_level ?? false,
      sprint_support_speed: sprintMeta?.supported_types?.speed ?? true,
      sprint_support_builders: sprintMeta?.supported_types?.builders ?? false,
      sprint_support_structure: sprintMeta?.supported_types?.structure ?? false,
      sprint_support_mastery: sprintMeta?.supported_types?.mastery ?? false,
      dialogue_category: data.category_id ? String(data.category_id) : 'none',
    };
  };

  const form = useForm<ContentFormValues>({
    resolver: zodResolver(contentSchema),
    defaultValues: getInitialValues(initialData),
  });

  const { isSubmitting } = form.formState;
  const currentContentType = form.watch('content_type');
  const currentSprintType = form.watch('sprint_type');

  // 種別が変わったときにスプリント用の値をリセット・制御するためのEffect
  useEffect(() => {
    if (currentContentType !== '2') {
      form.setValue('sprint_type', 'none');
    }
    if (currentContentType !== '3') {
      form.setValue('dialogue_category', 'none');
    }
  }, [currentContentType, form]);

  const onSubmit = async (values: ContentFormValues) => {
    setServerError(null);
    try {
      const isNone = !values.cefr_id || values.cefr_id === 'none';
      const cefrKey = isNone ? null : (values.cefr_id!.toUpperCase() as keyof typeof CEFR_CONFIG);
      const selectedCefr = cefrKey ? CEFR_CONFIG[cefrKey] : undefined;

      const isSprint = values.content_type === '2';
      
      // スプリントメタデータの構築
      let sprintMetadata = undefined;
      if (isSprint && values.sprint_type !== 'none') {
        if (values.sprint_type === '1') {
          // コーパススプリントの場合は、画面からの入力値を反映
          sprintMetadata = {
            sprint_type: '1' as const,
            theme: values.sprint_theme || '',
            has_level: values.sprint_has_level,
            supported_types: {
              speed: values.sprint_support_speed,
              builders: values.sprint_support_builders,
              structure: values.sprint_support_structure,
              mastery: values.sprint_support_mastery,
            }
          };
        } else {
          // 汎用スプリント ('0') の場合は固定値をセット
          sprintMetadata = {
            sprint_type: '0' as const,
            theme: '汎用スプリント固定定義',
            has_level: true, // 汎用は既存マスタ通りレベル概念を持つ
            supported_types: {
              speed: true,
              builders: true,
              structure: true,
              mastery: true,
            }
          };
        }
      }

      const isDialogue = values.content_type === '3';

      const payload: Partial<Content> = {
        content_name: values.content_name,
        content_name_en: values.content_name_en?.trim() || null,
        content_type: Number(values.content_type) as ContentType,
        content_scope: Number(values.content_scope) as ContentScope,
        category_id: isDialogue && values.dialogue_category && values.dialogue_category !== 'none'
          ? Number(values.dialogue_category)
          : null,
        content_label: values.content_label,
        seq_no: Number(values.seq_no),
        difficulty_level: Number(values.difficulty_level || 1),
        description: values.description,
        metadata: {
          ...(initialData?.metadata || {}),
          cefr: selectedCefr ? { id: selectedCefr.id, label: selectedCefr.label } : undefined,
          sprint: sprintMetadata,
        },
      };

      if (mode === 'edit' && initialData?.content_id) {
        payload.content_id = initialData.content_id;
      }

      const result = await upsertContent(payload);

      if (result.success && result.data) {
        showToast(mode === 'create' ? t('toastCreated') : t('toastUpdated'), "success");
        setOpen(false);
        if (mode === 'create') {
          router.push(`/contents/${result.data.content_id}`);
        }
      } else {
        setServerError(result.message || t('serverErrorDefault'));
      }
    } catch (error) {
      setServerError(t('systemError'));
    }
  };

  const handleOpenChange = (isOpen: boolean) => {
    setOpen(isOpen);
    if (!isOpen) {
      setIsConfirming(false);
      setServerError(null);
      form.reset(getInitialValues(initialData));
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild onClick={() => { setIsConfirming(false); setServerError(null); form.reset(getInitialValues(initialData)); }}>
        {mode === 'create' ? (
          <Button className="gap-2 font-bold shadow-sm bg-brand hover:bg-brand-strong text-white border-none">
            <PlusCircle size={16} /> {t('createButton')}
          </Button>
        ) : (
          <Button
            variant="outline"
            size="sm"
            className="h-8 w-8 p-0 border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-slate-900"
            title={t('editButton')}
            aria-label={t('editButton')}
          >
            <Edit size={14} />
          </Button>
        )}
      </DialogTrigger>

      <DialogContent className="max-w-2xl p-0 overflow-hidden border-none shadow-2xl flex flex-col max-h-[90vh]">
        <DialogHeader className="p-6 bg-slate-900 text-white border-b border-slate-800">
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
          <form onSubmit={form.handleSubmit(onSubmit)} className="bg-white flex-1 flex flex-col overflow-hidden">
            <div className="p-6 space-y-4 flex-1 overflow-y-auto">
              {serverError && (
                <div className="p-3 bg-destructive/10 text-destructive text-sm rounded-xl font-medium">{serverError}</div>
              )}

              <div className="grid grid-cols-2 gap-4">
                {/* 教材名称 */}
                <FormField control={form.control} name="content_name" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs font-bold text-slate-500 uppercase tracking-wider">{t('nameLabel')}</FormLabel>
                    {isConfirming ? (
                      <div className="p-3 bg-slate-50 rounded-xl text-sm border-2 border-slate-100 font-bold text-slate-700">{field.value}</div>
                    ) : (
                      <FormControl><Input {...field} placeholder={t('namePlaceholder')} className="bg-white rounded-xl border-slate-200" /></FormControl>
                    )}
                    <FormMessage />
                  </FormItem>
                )} />

                {/* 教材名称（英語） */}
                <FormField control={form.control} name="content_name_en" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs font-bold text-slate-500 uppercase tracking-wider">{t('nameEnLabel')}</FormLabel>
                    {isConfirming ? (
                      <div className="p-3 bg-slate-50 rounded-xl text-sm border-2 border-slate-100 font-bold text-slate-700">{field.value || '-'}</div>
                    ) : (
                      <FormControl><Input {...field} placeholder={t('namePlaceholder')} className="bg-white rounded-xl border-slate-200" /></FormControl>
                    )}
                    <FormDescription className="text-[11px] text-slate-400">
                      {t('nameEnDescription')}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>

              <div className="grid grid-cols-2 gap-4">
                {/* 種別 */}
                <FormField control={form.control} name="content_type" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs font-bold text-slate-500 uppercase tracking-wider">{t('typeLabel')}</FormLabel>
                    {isConfirming ? (
                      <div className="p-3 bg-slate-50 rounded-xl text-sm border-2 border-slate-100 text-slate-700 font-medium">
                        {CONTENT_TYPES[Number(field.value) as ContentType]?.label}
                      </div>
                    ) : (
                      <Select onValueChange={field.onChange} defaultValue={field.value} disabled={mode === 'edit'}>
                        <FormControl><SelectTrigger className="bg-white rounded-xl border-slate-200"><SelectValue /></SelectTrigger></FormControl>
                        <SelectContent>
                          {Object.entries(CONTENT_TYPES).map(([val, info]) => (
                            <SelectItem key={val} value={val}>{info.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </FormItem>
                )} />

                {/* 公開範囲 */}
                <FormField control={form.control} name="content_scope" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs font-bold text-slate-500 uppercase tracking-wider">{t('scopeLabel')}</FormLabel>
                    {isConfirming ? (
                      <div className="p-3 bg-slate-50 rounded-xl text-sm border-2 border-slate-100 text-slate-700 font-medium">
                        {CONTENT_SCOPES[Number(field.value) as ContentScope]?.label}
                      </div>
                    ) : (
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl><SelectTrigger className="bg-white rounded-xl border-slate-200"><SelectValue /></SelectTrigger></FormControl>
                        <SelectContent>
                          {Object.entries(CONTENT_SCOPES).map(([val, info]) => (
                            <SelectItem key={val} value={val}>{info.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </FormItem>
                )} />
              </div>

              {/* --- ダイアログプラクティス選択時のみ表示する特化セクション --- */}
              {currentContentType === '3' && (
                <div className="p-4 bg-brand-50/50 rounded-2xl border border-brand-100/80 space-y-4">
                  <FormField control={form.control} name="dialogue_category" render={({ field }) => (
                    <FormItem className="w-full">
                      <FormLabel className="text-xs font-bold text-brand uppercase tracking-wider">{t('dialogueCategoryLabel')}</FormLabel>
                      {isConfirming ? (
                        <div className="p-3 bg-white rounded-xl text-sm border-2 border-brand-100 text-slate-700 font-medium">
                          {field.value && field.value !== 'none'
                            ? DIALOGUE_CATEGORIES[Number(field.value) as DialogueCategory]?.label
                            : t('dialogueCategoryUnselected')}
                        </div>
                      ) : (
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger className="bg-white rounded-xl border-slate-200 focus:border-brand-500 focus:ring-brand-500">
                              <SelectValue placeholder={t('dialogueCategoryPlaceholder')} />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="none">{t('dialogueCategoryNoneOption')}</SelectItem>
                            {Object.values(DIALOGUE_CATEGORIES).map((category) => (
                              <SelectItem key={category.value} value={String(category.value)}>{category.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                      <FormDescription className="text-[11px] text-slate-400">
                        {t('dialogueCategoryDescription')}
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )} />
                </div>
              )}

              {/* --- スプリント選択時のみ表示する特化セクション --- */}
              {currentContentType === '2' && (
                <div className="p-4 bg-brand-50/50 rounded-2xl border border-brand-100/80 space-y-4">
                  {/* スプリント種別 */}
                  <FormField control={form.control} name="sprint_type" render={({ field }) => (
                    <FormItem className="w-full">
                      <FormLabel className="text-xs font-bold text-brand uppercase tracking-wider">{t('sprintTypeLabel')}</FormLabel>
                      {isConfirming ? (
                        <div className="p-3 bg-white rounded-xl text-sm border-2 border-brand-100 text-slate-700 font-medium">
                          {field.value && field.value !== 'none' ? SPRINT_TYPES[field.value as keyof typeof SPRINT_TYPES]?.label : t('sprintTypeUnselected')}
                        </div>
                      ) : (
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger className="bg-white rounded-xl border-slate-200 focus:border-brand-500 focus:ring-brand-500">
                              <SelectValue placeholder={t('sprintTypePlaceholder')} />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="none">{t('sprintTypeNoneOption')}</SelectItem>
                            {Object.values(SPRINT_TYPES).map((sprint) => (
                              <SelectItem key={sprint.value} value={sprint.value}>{sprint.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                      <FormMessage />
                    </FormItem>
                  )} />

                  {/* コーパススプリント ('1') 選択時のみ、追加の管理項目群を動的に展開 */}
                  {currentSprintType === '1' && (
                    <div className="pt-2 border-t border-brand-100/50 space-y-4 animate-in fade-in duration-200">
                      
                      {/* テーマ入力 */}
                      <FormField control={form.control} name="sprint_theme" render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs font-bold text-brand uppercase tracking-wider">{t('sprintThemeLabel')}</FormLabel>
                          {isConfirming ? (
                            <div className="p-3 bg-white rounded-xl text-sm border-2 border-brand-100 text-slate-700 font-bold whitespace-pre-wrap">{field.value || '-'}</div>
                          ) : (
                            <FormControl>
                              <Textarea {...field} placeholder={t('sprintThemePlaceholder')} className="resize-none bg-white rounded-xl border-slate-200 min-h-[80px]" />
                            </FormControl>
                          )}
                          <FormMessage />
                        </FormItem>
                      )} />

                      {/* レベル有無の制御 (Switch) */}
                      <FormField control={form.control} name="sprint_has_level" render={({ field }) => (
                        <FormItem className="flex flex-row items-center justify-between rounded-xl border border-brand-100 bg-white p-3 shadow-sm">
                          <div className="space-y-0.5">
                            <FormLabel className="text-xs font-bold text-brand uppercase tracking-wider">{t('sprintHasLevelLabel')}</FormLabel>
                            <FormDescription className="text-[11px] text-slate-400">
                              {t('sprintHasLevelDescription')}
                            </FormDescription>
                          </div>
                          <FormControl>
                            {isConfirming ? (
                              <div className="text-sm font-bold text-slate-700">{field.value ? t('sprintHasLevelYes') : t('sprintHasLevelNo')}</div>
                            ) : (
                              <Switch checked={field.value} onCheckedChange={field.onChange} />
                            )}
                          </FormControl>
                        </FormItem>
                      )} />

                      {/* 対応問題種別 (Checkboxグループ) */}
                      <div className="space-y-2">
                        <label className="text-xs font-bold text-brand uppercase tracking-wider block">{t('sprintSupportLabel')}</label>
                        <div className="grid grid-cols-2 gap-2 bg-white p-3 rounded-xl border border-brand-100 shadow-sm">
                          
                          {/* Speed */}
                          <FormField control={form.control} name="sprint_support_speed" render={({ field }) => (
                            <FormItem className="flex flex-row items-start space-x-2 space-y-0 p-1">
                              <FormControl>
                                <Checkbox checked={field.value} onCheckedChange={field.onChange} disabled={isConfirming} />
                              </FormControl>
                              <FormLabel className="text-sm font-medium text-slate-700 cursor-pointer">UG Speed</FormLabel>
                            </FormItem>
                          )} />

                          {/* Builders */}
                          <FormField control={form.control} name="sprint_support_builders" render={({ field }) => (
                            <FormItem className="flex flex-row items-start space-x-2 space-y-0 p-1">
                              <FormControl>
                                <Checkbox checked={field.value} onCheckedChange={field.onChange} disabled={isConfirming} />
                              </FormControl>
                              <FormLabel className="text-sm font-medium text-slate-700 cursor-pointer">UG Builders</FormLabel>
                            </FormItem>
                          )} />

                          {/* Structure */}
                          <FormField control={form.control} name="sprint_support_structure" render={({ field }) => (
                            <FormItem className="flex flex-row items-start space-x-2 space-y-0 p-1">
                              <FormControl>
                                <Checkbox checked={field.value} onCheckedChange={field.onChange} disabled={isConfirming} />
                              </FormControl>
                              <FormLabel className="text-sm font-medium text-slate-700 cursor-pointer">UG Structure</FormLabel>
                            </FormItem>
                          )} />

                          {/* Mastery */}
                          <FormField control={form.control} name="sprint_support_mastery" render={({ field }) => (
                            <FormItem className="flex flex-row items-start space-x-2 space-y-0 p-1">
                              <FormControl>
                                <Checkbox checked={field.value} onCheckedChange={field.onChange} disabled={isConfirming} />
                              </FormControl>
                              <FormLabel className="text-sm font-medium text-slate-700 cursor-pointer">UG Mastery</FormLabel>
                            </FormItem>
                          )} />
                        </div>
                      </div>

                    </div>
                  )}
                </div>
              )}

              {/* CEFR レベル & 表示順 の2カラム横並び配置 */}
              <div className="grid grid-cols-2 gap-4">
                {/* CEFR レベル */}
                <FormField control={form.control} name="cefr_id" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs font-bold text-slate-500 uppercase tracking-wider">{t('cefrLabel')}</FormLabel>
                    {isConfirming ? (
                      <div className="p-3 bg-slate-50 rounded-xl text-sm border-2 border-slate-100 text-slate-700 font-medium">
                        {field.value && field.value !== 'none' ? field.value.toUpperCase() : t('cefrUnset')}
                      </div>
                    ) : (
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl><SelectTrigger className="bg-white rounded-xl border-slate-200"><SelectValue placeholder={t('cefrNoneOption')} /></SelectTrigger></FormControl>
                        <SelectContent>
                          <SelectItem value="none">{t('cefrNoneOption')}</SelectItem>
                          {Object.values(CEFR_CONFIG).map((cefr) => (
                            <SelectItem key={cefr.id} value={cefr.id.toLowerCase()}>{cefr.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </FormItem>
                )} />

                {/* 表示順 */}
                <FormField control={form.control} name="seq_no" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs font-bold text-slate-500 uppercase tracking-wider">{t('seqLabel')}</FormLabel>
                    {isConfirming ? (
                      <div className="p-3 bg-slate-50 rounded-xl text-sm border-2 border-slate-100 text-slate-700">{field.value}</div>
                    ) : (
                      <FormControl><Input {...field} type="number" className="bg-white rounded-xl border-slate-200" /></FormControl>
                    )}
                  </FormItem>
                )} />
              </div>

              {/* 管理ラベル */}
              <FormField control={form.control} name="content_label" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs font-bold text-slate-500 uppercase tracking-wider">{t('labelLabel')}</FormLabel>
                  {isConfirming ? (
                    <div className="p-3 bg-slate-50 rounded-xl text-sm border-2 border-slate-100 font-bold text-slate-700">{field.value}</div>
                  ) : (
                    <FormControl><Input {...field} placeholder={t('labelPlaceholder')} className="bg-white rounded-xl border-slate-200" /></FormControl>
                  )}
                  <FormMessage />
                </FormItem>
              )} />

              {/* 説明・解析根拠 */}
              <FormField control={form.control} name="description" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs font-bold text-slate-500 uppercase tracking-wider">{t('descriptionLabel')}</FormLabel>
                  {isConfirming ? (
                    <div className="p-3 bg-slate-50 rounded-xl text-xs border-2 border-slate-100 min-h-[60px] whitespace-pre-wrap text-slate-600">{field.value || '-'}</div>
                  ) : (
                    <FormControl><Textarea {...field} className="resize-none bg-white rounded-xl border-slate-200 min-h-[80px]" /></FormControl>
                  )}
                </FormItem>
              )} />
            </div>

            {/* フッターアクション */}
            <div className="p-6 pt-4 border-t border-slate-100">
              {isConfirming ? (
                <div className="flex gap-3">
                  <Button type="button" variant="ghost" className="flex-1 rounded-xl font-bold text-slate-400" onClick={() => setIsConfirming(false)} disabled={isSubmitting}>{t('noButton')}</Button>
                  <Button type="submit" className="flex-1 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-bold" disabled={isSubmitting}>
                    {isSubmitting ? t('processing') : t('confirmButton')}
                  </Button>
                </div>
              ) : (
                <Button type="button" className="w-full bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-bold h-11 shadow-md" onClick={() => form.trigger().then(valid => valid && setIsConfirming(true))}>
                  {t('confirmDetailsButton')}
                </Button>
              )}
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}