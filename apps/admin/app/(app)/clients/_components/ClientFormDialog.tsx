// apps\admin\app\(app)\clients\_components\ClientFormDialog.tsx
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
import { createClient, updateClient } from '@/actions/adminClientAction';
import { AlertCircle, PlusCircle, CheckCircle2, Edit } from 'lucide-react';
import { Alert } from '@/components/ui/alert';
import { ClientRecord, ClientPayload } from '@gabby/types/client';

// --- 1. スキーマ定義 ---
type FormT = ReturnType<typeof useTranslations<'clients.form'>>;

function createClientSchema(t: FormT) {
  return z.object({
    client_name: z.string().min(1, t('errors.nameRequired')),
    client_type: z.string().min(1, t('errors.typeRequired')),
    industry_type: z.string().min(1, t('errors.industryRequired')),
  });
}

type ClientFormValues = z.infer<ReturnType<typeof createClientSchema>>;

interface ClientFormDialogProps {
  mode?: 'create' | 'edit';
  initialData?: ClientRecord;
}

const DEFAULT_VALUES: ClientFormValues = {
  client_name: '',
  client_type: '1',
  industry_type: '1',
};

/**
 * 顧客情報の登録・編集ダイアログ
 */
export function ClientFormDialog({ mode = 'create', initialData }: ClientFormDialogProps) {
  const t = useTranslations('clients.form');
  const tTable = useTranslations('clients.table');
  const clientSchema = useMemo(() => createClientSchema(t), [t]);
  // --- States ---
  const [open, setOpen] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const { showToast } = useToast();

  // --- Helpers ---
  const getInitialValues = (data?: ClientRecord): ClientFormValues => {
    if (!data || mode === 'create') return DEFAULT_VALUES;
    return {
      client_name: data.client_name,
      client_type: String(data.client_type),
      industry_type: String(data.industry_type),
    };
  };

  const form = useForm<ClientFormValues>({
    resolver: zodResolver(clientSchema),
    defaultValues: getInitialValues(initialData),
  });

  const { isSubmitting } = form.formState;

  /**
   * 送信処理
   */
  const onSubmit = async (values: ClientFormValues) => {
    setServerError(null);
    try {
      // Payloadオブジェクトの構築
      const payload: ClientPayload = {
        client_name: values.client_name,
        client_type: Number(values.client_type),
        industry_type: Number(values.industry_type),
      };

      let result;
      if (mode === 'edit' && initialData?.client_id) {
        // updateClient(ID, Payload) の形式で呼び出し
        result = await updateClient(initialData.client_id, payload);
      } else {
        // createClient(Payload) の形式で呼び出し
        result = await createClient(payload);
      }

      if (result.success) {
        showToast(mode === 'create' ? t('toastCreated') : t('toastUpdated'), "success");
        setOpen(false);
        setIsConfirming(false);
      } else {
        setServerError(result.message || t('toastGenericFailed'));
      }
    } catch (error) {
      setServerError(t('toastSystemError'));
    }
  };

  /**
   * ダイアログ開閉ハンドラ
   */
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
        className="max-w-md p-0 overflow-hidden border-none shadow-2xl [&>button]:text-white [&>button]:opacity-70 [&>button:hover]:opacity-100 [&>button]:focus:ring-0 [&>button]:focus:ring-offset-0 [&>button]:focus-visible:ring-0 [&>button]:outline-none"
      >
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
            
            {/* 顧客名称 */}
            <FormField control={form.control} name="client_name" render={({ field }) => (
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
              {/* 顧客種別 */}
              <FormField control={form.control} name="client_type" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs font-bold text-slate-500 uppercase tracking-wider">{t('typeLabel')}</FormLabel>
                  {isConfirming ? (
                    <div className="p-3 bg-slate-50 rounded-xl text-sm border-2 border-slate-100 text-slate-700 font-medium">
                      {field.value === '1' ? tTable('typeCorporate') : tTable('typeIndividual')}
                    </div>
                  ) : (
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger className="bg-white rounded-xl border-slate-200">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="1">{tTable('typeCorporate')}</SelectItem>
                        <SelectItem value="2">{tTable('typeIndividual')}</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                </FormItem>
              )} />

              {/* 業界区分 */}
              <FormField control={form.control} name="industry_type" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs font-bold text-slate-500 uppercase tracking-wider">{t('industryLabel')}</FormLabel>
                  {isConfirming ? (
                    <div className="p-3 bg-slate-50 rounded-xl text-sm border-2 border-slate-100 text-slate-700 font-medium">
                      {field.value === '1' ? tTable('industryPharma') : field.value === '2' ? tTable('industrySemiconductor') : tTable('industryOther')}
                    </div>
                  ) : (
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger className="bg-white rounded-xl border-slate-200">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="1">{t('industryPharmaOption')}</SelectItem>
                        <SelectItem value="2">{t('industrySemiconductorOption')}</SelectItem>
                        <SelectItem value="3">{t('industryOtherOption')}</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                </FormItem>
              )} />
            </div>

            {/* アクションエリア */}
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
                    >
                      {t('no')}
                    </Button>
                    <Button
                      type="submit"
                      className="flex-1 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-bold shadow-lg"
                      disabled={isSubmitting}
                    >
                      {isSubmitting ? t('processing') : t('yesConfirm')}
                    </Button>
                  </div>
                </div>
              ) : (
                <Button
                  type="button"
                  className="w-full bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-bold h-11 shadow-md"
                  onClick={() => form.trigger().then(valid => valid && setIsConfirming(true))}
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