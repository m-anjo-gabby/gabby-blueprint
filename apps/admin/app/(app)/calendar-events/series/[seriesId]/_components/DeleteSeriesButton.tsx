'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Trash2 } from 'lucide-react';
import { useToast } from '@gabby/lib/hooks/useToast';
import { Button } from '@/components/ui/button';
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
} from '@/components/ui/alert-dialog';
import { deleteCalendarEventSeries } from '@/actions/adminCalendarEventSeriesAction';

/** シリーズの削除（各回は単発のイベントとして残る）。削除後はシリーズの一覧へ戻る */
export function DeleteSeriesButton({ seriesId, title }: { seriesId: string; title: string }) {
  const t = useTranslations('calendarEvents.series');
  const router = useRouter();
  const { showToast } = useToast();
  const [isPending, startTransition] = useTransition();

  const handleDelete = () => {
    startTransition(async () => {
      const result = await deleteCalendarEventSeries(seriesId);
      if (!result.success) {
        showToast(t('toastDeleteFailed'), 'error');
        return;
      }
      showToast(t('toastDeleted'), 'success');
      router.push('/calendar-events/series');
    });
  };

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="h-8 px-3 border-slate-200 text-slate-500 hover:text-rose-600 hover:bg-rose-50"
          pending={isPending}
          icon={<Trash2 size={14} />}
        >
          {t('deleteButton')}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t('deleteDialogTitle')}</AlertDialogTitle>
          <AlertDialogDescription>{t('deleteDialogBody', { title })}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t('cancel')}</AlertDialogCancel>
          <AlertDialogAction onClick={handleDelete} className="bg-rose-600 hover:bg-rose-700">
            {t('deleteConfirm')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
