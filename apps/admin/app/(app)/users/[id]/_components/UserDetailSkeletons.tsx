import { getTranslations } from 'next-intl/server';
import { Skeleton } from '@/components/ui/skeleton';
import { CoachRatingSummarySkeleton } from '../ratings/_components/CoachRatingSummary';
import { CoachRatingTableSkeleton } from '../ratings/_components/CoachRatingTable';
import { BASIC_TAB_GRID, DetailSectionSkeleton } from './DetailSection';
import { UserDetailHeaderSkeleton } from './UserDetailHeader';
import { UserDetailTabsSkeleton } from './UserDetailTabs';
import { UserTabSkeletonSwitch } from './PathSkeletonSwitch';

/** 各タブの中身の骨組み（本番と同じ枠・並び）。表示中のタブのものを出す */
export async function UserDetailTabSkeletons() {
  const t = await getTranslations('users.ratingsPage');
  return (
    <UserTabSkeletonSwitch
      skeletons={{
        basic: (
          <div className={BASIC_TAB_GRID}>
            <DetailSectionSkeleton rows={5} />
            <div className="space-y-6">
              <DetailSectionSkeleton rows={1} />
              <DetailSectionSkeleton rows={2} />
            </div>
          </div>
        ),
        sprint: (
          <div className="space-y-6">
            <div aria-hidden className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="mt-2 h-3 w-72 max-w-full" />
            </div>
            <div className="grid items-start gap-6 lg:grid-cols-2">
              <DetailSectionSkeleton rows={4} />
              <DetailSectionSkeleton rows={3} />
            </div>
          </div>
        ),
        specialty: <DetailSectionSkeleton rows={4} className="max-w-4xl" />,
        matching: <DetailSectionSkeleton rows={4} className="max-w-4xl" />,
        ratings: (
          <div className="space-y-6">
            <p className="text-xs text-slate-500">{t('subtitle')}</p>
            <CoachRatingSummarySkeleton />
            <CoachRatingTableSkeleton />
          </div>
        ),
        legal: <DetailSectionSkeleton rows={4} className="max-w-2xl" />,
      }}
    />
  );
}

/** 一覧などユーザー詳細の外から開いた時の骨組み（見出し・タブも骨組み） */
export function UserDetailPageSkeleton() {
  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <UserDetailHeaderSkeleton />
        <UserDetailTabsSkeleton />
      </div>
      <UserDetailTabSkeletons />
    </div>
  );
}
