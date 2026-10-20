'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useEffectEvent } from 'react';
import { useForm } from 'react-hook-form';
import { useToast } from '@gabby/lib/hooks/useToast';
import type { VideoSectionRow } from '@gabby/types/video';
import { saveVideoSection } from '@/actions/adminVideoAction';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel } from '@/components/ui/form';
import { Input } from '@/components/ui/input';

export type VideoSectionFormTarget = { mode: 'create' } | { mode: 'edit'; section: VideoSectionRow };

interface VideoSectionFormDialogProps {
  contentId: string;
  /** 開く対象（null で閉じる） */
  target: VideoSectionFormTarget | null;
  onClose: () => void;
  onSaved: () => Promise<void>;
}

interface FormValues {
  section_name: string;
}

/** 区切りの追加・見出しの変更（見出しは空でもよい） */
export function VideoSectionFormDialog({ contentId, target, onClose, onSaved }: VideoSectionFormDialogProps) {
  const t = useTranslations('contents.editor.video.sectionForm');
  const tCommon = useTranslations('common');
  const { showToast } = useToast();
  const form = useForm<FormValues>({ defaultValues: { section_name: '' } });
  const { isSubmitting } = form.formState;

  // 開いた時だけ初期値を入れ直す
  const resetToTarget = useEffectEvent((next: VideoSectionFormTarget) =>
    form.reset({ section_name: next.mode === 'edit' ? (next.section.section_name ?? '') : '' }),
  );
  useEffect(() => {
    if (target) resetToTarget(target);
  }, [target]);

  const onSubmit = async (values: FormValues) => {
    if (!target) return;
    const res = await saveVideoSection({
      section_id: target.mode === 'edit' ? target.section.section_id : undefined,
      content_id: contentId,
      section_name: values.section_name,
    });
    if (!res.success) {
      showToast(res.message, 'error');
      return;
    }
    showToast(target.mode === 'create' ? t('toastCreated') : t('toastUpdated'), 'success');
    onClose();
    await onSaved();
  };

  return (
    <Dialog open={target !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{target?.mode === 'edit' ? t('editTitle') : t('createTitle')}</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="section_name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('nameLabel')}</FormLabel>
                  <FormControl>
                    <Input {...field} autoFocus placeholder={t('namePlaceholder')} />
                  </FormControl>
                  <FormDescription>{t('nameDescription')}</FormDescription>
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={onClose}>
                {tCommon('cancel')}
              </Button>
              <Button type="submit" pending={isSubmitting}>
                {tCommon('save')}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
