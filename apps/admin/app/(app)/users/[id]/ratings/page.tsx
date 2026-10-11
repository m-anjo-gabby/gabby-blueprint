import { getTranslations } from 'next-intl/server';
import { getCoachRatings } from '@/actions/adminCoachRatingAction';
import { BackLink, PageHeader } from '@/components/common/PageHeader';
import { CoachRatingSummary } from './_components/CoachRatingSummary';
import { CoachRatingTable } from './_components/CoachRatingTable';

/**
 * コーチの評価（ユーザー管理 → コーチの「評価」から開く）。
 * 集計（コーチ・生徒に見えている値）と、評価の行・運営へのコメントを新しい順に表示する。?feedback=1 でコメントありに絞る。
 */
export default async function CoachRatingsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ feedback?: string }>;
}) {
  const t = await getTranslations('users.ratingsPage');
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const feedbackOnly = sp.feedback === '1';
  const result = await getCoachRatings(id);

  const back = { href: '/users', label: t('backToList') };

  if (!result) {
    return (
      <div className="space-y-4">
        <BackLink {...back} />
        <p className="text-sm text-slate-500 font-bold">{t('notFound')}</p>
      </div>
    );
  }

  const withFeedback = result.ratings.filter((r) => r.feedback);
  const rows = feedbackOnly ? withFeedback : result.ratings;

  return (
    <div className="space-y-6">
      <PageHeader back={back} title={t('title', { name: result.coach.name ?? result.coach.email ?? '' })} description={t('subtitle')} />

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
