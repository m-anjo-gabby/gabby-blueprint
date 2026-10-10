import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { Skeleton } from '@/components/ui/skeleton';
import { CoachRatingSummarySkeleton } from './_components/CoachRatingSummary';
import { CoachRatingTableSkeleton } from './_components/CoachRatingTable';

/** コーチの評価の読み込み中表示（戻るリンク・説明文・表の見出しは本物、コーチ名と数値・行は骨組み） */
export default async function Loading() {
  const t = await getTranslations('users.ratingsPage');
  const common = await getTranslations('common');
  return (
    <div role="status" aria-busy aria-label={common('loading')} className="space-y-6">
      <div>
        <Link href="/users" className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-brand transition-colors mb-2">
          <ArrowLeft size={14} /> {t('backToList')}
        </Link>
        <Skeleton className="h-7 w-64" />
        <p className="text-[13px] text-slate-500 mt-1">{t('subtitle')}</p>
      </div>
      <CoachRatingSummarySkeleton />
      <CoachRatingTableSkeleton />
    </div>
  );
}
