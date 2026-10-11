import { getTranslations } from 'next-intl/server';
import { Skeleton } from '@/components/ui/skeleton';
import { BackLink } from '@/components/common/PageHeader';
import { CoachRatingSummarySkeleton } from './_components/CoachRatingSummary';
import { CoachRatingTableSkeleton } from './_components/CoachRatingTable';

/** コーチの評価の読み込み中表示（戻るリンク・説明文・表の見出しは本物、コーチ名と数値・行は骨組み） */
export default async function Loading() {
  const t = await getTranslations('users.ratingsPage');
  const common = await getTranslations('common');
  return (
    <div role="status" aria-busy aria-label={common('loading')} className="space-y-6">
      <div>
        {/* 見出しは PageHeader と同じ並び（戻り先・タイトル・説明） */}
        <BackLink href="/users" label={t('backToList')} className="mb-2" />
        <Skeleton className="h-7 w-64" />
        <p className="mt-1 text-xs text-slate-500">{t('subtitle')}</p>
      </div>
      <CoachRatingSummarySkeleton />
      <CoachRatingTableSkeleton />
    </div>
  );
}
