import { getTranslations } from 'next-intl/server';
import { getCoachRatings } from '@/actions/adminCoachRatingAction';
import { requireUserForTab } from '../_lib/userDetail';
import { CoachRatingSummary } from './_components/CoachRatingSummary';
import { CoachRatingTable } from './_components/CoachRatingTable';

/**
 * コーチの評価タブ（ユーザー詳細）。
 * 集計（コーチ・生徒に見えている値）と、評価の行・運営へのコメントを新しい順に表示する。?feedback=1 でコメントありに絞る。
 */
export default async function CoachRatingsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ feedback?: string }>;
}) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const feedbackOnly = sp.feedback === '1';
  const [t, , result] = await Promise.all([
    getTranslations('users.ratingsPage'),
    requireUserForTab(id, 'ratings'),
    getCoachRatings(id),
  ]);

  if (!result) {
    return <p className="text-sm text-slate-500 font-bold">{t('notFound')}</p>;
  }

  const withFeedback = result.ratings.filter((r) => r.feedback);
  const rows = feedbackOnly ? withFeedback : result.ratings;

  return (
    <div className="space-y-6">
      <p className="text-xs text-slate-500">{t('subtitle')}</p>

      <CoachRatingSummary stats={result.stats} />

      <CoachRatingTable
        coachId={result.coach.id}
        rows={rows}
        feedbackOnly={feedbackOnly}
        totalCount={result.ratings.length}
        feedbackCount={withFeedback.length}
      />
    </div>
  );
}
