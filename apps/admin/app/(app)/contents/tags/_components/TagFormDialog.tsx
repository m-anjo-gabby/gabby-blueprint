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
import { upsertTag } from '@/actions/adminTagAction';
import { AlertCircle, PlusCircle, CheckCircle2, Edit } from 'lucide-react';
import { Alert } from '@/components/ui/alert';
import { ContentTag, TAG_TYPES, TagType } from '@gabby/types/content';

/**
 * --- 1. スキーマ定義 ---
 * tag_id は UUID として DB 側で自動生成されるため、フロントのバリデーションからは除外。
 * 表示順(seq_no)は Input type="number" から文字列として受け取り、送信時に数値変換する。
 */
type FormT = ReturnType<typeof useTranslations<'contents.tags.formDialog'>>;

function createTagSchema(t: FormT) {
  return z.object({
    tag_name: z.string().min(1, t('errors.nameRequired')),
    tag_type: z.string().min(1, t('errors.typeRequired')),
    seq_no: z.string().min(1, t('errors.seqRequired')),
  });
}

type TagFormValues = z.infer<ReturnType<typeof createTagSchema>>;

interface TagFormDialogProps {
  mode?: 'create' | 'edit';
  initialData?: ContentTag;
}

const DEFAULT_VALUES: TagFormValues = {
  tag_name: '',
  tag_type: 'industry',
  seq_no: '1',
};

/**
 * コンテンツタグ登録・編集用ダイアログコンポーネント
 */
export function TagFormDialog({ mode = 'create', initialData }: TagFormDialogProps) {
  const t = useTranslations('contents.tags.formDialog');
  const tagSchema = useMemo(() => createTagSchema(t), [t]);
  // --- States ---
  const [open, setOpen] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const { showToast } = useToast();

  // --- Helpers ---
  const getInitialValues = (data?: ContentTag): TagFormValues => {
    if (!data || mode === 'create') return DEFAULT_VALUES;
    return {
      tag_name: data.tag_name,
      tag_type: data.tag_type,
      seq_no: String(data.seq_no),
    };
  };

  const form = useForm<TagFormValues>({
    resolver: zodResolver(tagSchema),
    defaultValues: getInitialValues(initialData),
  });

  const { isSubmitting } = form.formState;

  /**
   * 送信処理 (Server Action 呼び出し)
   */
  const onSubmit = async (values: TagFormValues) => {
    setServerError(null);
    try {
      const payload: Partial<ContentTag> = {
        tag_name: values.tag_name,
        tag_type: values.tag_type as TagType,
        seq_no: Number(values.seq_no),
        delete_flg: '0',
      };

      // 編集モードの場合は既存の UUID を payload に含める
      if (mode === 'edit' && initialData?.tag_id) {
        payload.tag_id = initialData.tag_id;
      }

      const result = await upsertTag(payload);

      if (result.success) {
        showToast(mode === 'create' ? t('toastCreated') : t('toastUpdated'), "success");
        setOpen(false);
        setIsConfirming(false);
      } else {
        setServerError(result.message || t('serverErrorDefault'));
      }
    } catch (error) {
      setServerError(t('systemError'));
    }
  };

  /**
   * ダイアログ開閉時の初期化処理
   */
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
          <Button className="gap-2 font-bold shadow-sm bg-brand hover:bg-brand-strong text-white border-none">
            <PlusCircle size={16} /> {t('createButton')}
          </Button>
        ) : (
          <Button variant="outline" size="sm" className="h-8 px-3 gap-1.5 border-slate-200 text-slate-600 hover:bg-slate-50">
            <Edit size={14} /> {t('editButton')}
          </Button>
        )}
      </DialogTrigger>

      <DialogContent
        className="max-w-md p-0 overflow-hidden border-none shadow-2xl [&>button]:text-white [&>button]:opacity-70 [&>button:hover]:opacity-100"
      >
        {/* ダークヘッダー: 他の管理画面ダイアログと統一したネガティブマージン設定 */}
        <DialogHeader className="p-6 bg-slate-900 text-white -mx-1 -mt-1 rounded-t-none border-b border-slate-800">
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
          <form onSubmit={form.handleSubmit(onSubmit)} className="p-6 space-y-4 bg-white">
            
            {/* 編集モード時のみ UUID を参考情報として表示 */}
            {mode === 'edit' && !isConfirming && (
              <div className="mb-2">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">System ID</p>
                <p className="text-[10px] font-mono text-slate-400/70 truncate">{initialData?.tag_id}</p>
              </div>
            )}

            {/* --- タグ名称 --- */}
            <FormField control={form.control} name="tag_name" render={({ field }) => (
              <FormItem>
                <FormLabel className="text-xs font-bold text-slate-500 uppercase tracking-wider">{t('nameLabel')}</FormLabel>
                {isConfirming ? (
                  <div className="p-3 bg-slate-50 rounded-xl text-sm border-2 border-slate-100 font-bold text-slate-700">
                    {field.value}
                  </div>
                ) : (
                  <FormControl>
                    <Input {...field} placeholder={t('namePlaceholder')} className="bg-white rounded-xl border-slate-200" />
                  </FormControl>
                )}
                <FormMessage />
              </FormItem>
            )} />

            <div className="grid grid-cols-2 gap-4">
              {/* --- タイプ --- */}
              <FormField control={form.control} name="tag_type" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs font-bold text-slate-500 uppercase tracking-wider">{t('typeLabel')}</FormLabel>
                  {isConfirming ? (
                    <div className="p-3 bg-slate-50 rounded-xl text-sm border-2 border-slate-100 text-slate-700 font-medium">
                      {TAG_TYPES[field.value as TagType]?.label || field.value}
                    </div>
                  ) : (
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger className="bg-white rounded-xl border-slate-200">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {Object.entries(TAG_TYPES).map(([value, info]) => (
                          <SelectItem key={value} value={value}>
                            {info.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </FormItem>
              )} />

              {/* --- 表示順 --- */}
              <FormField control={form.control} name="seq_no" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs font-bold text-slate-500 uppercase tracking-wider">{t('seqLabel')}</FormLabel>
                  {isConfirming ? (
                    <div className="p-3 bg-slate-50 rounded-xl text-sm border-2 border-slate-100 text-slate-700 font-medium">
                      {field.value}
                    </div>
                  ) : (
                    <FormControl>
                      <Input {...field} type="number" className="bg-white rounded-xl border-slate-200" />
                    </FormControl>
                  )}
                </FormItem>
              )} />
            </div>

            {/* --- アクションエリア --- */}
            <div className="pt-4 mt-6 border-t border-slate-100">
              {isConfirming ? (
                <div className="space-y-4">
                  <p className="text-sm font-bold text-center text-slate-800">
                    {t('confirmQuestion', { action: mode === 'create' ? t('actionCreate') : t('actionUpdate') })}
                  </p>
                  {serverError && (
                    <Alert variant="destructive" className="py-2 flex items-center gap-2 text-xs border-none bg-rose-50 text-rose-600">
                      <AlertCircle size={14} />{serverError}
                    </Alert>
                  )}
                  <div className="flex gap-3">
                    <Button
                      type="button"
                      variant="ghost"
                      className="flex-1 rounded-xl font-bold text-slate-400"
                      onClick={() => setIsConfirming(false)}
                      disabled={isSubmitting}
                    >
                      {t('noButton')}
                    </Button>
                    <Button
                      type="submit"
                      className="flex-1 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-bold shadow-lg"
                      disabled={isSubmitting}
                    >
                      {isSubmitting ? t('processing') : t('confirmButton')}
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