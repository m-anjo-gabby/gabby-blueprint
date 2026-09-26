import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import { getStudentOverview, getStudentUpcomingSession } from '@/actions/studentAction';
import { CardSkeleton } from '@gabby/lib/components/common/PageSkeleton';
import { StudentOverviewHeader } from './_components/StudentOverviewHeader';
import {
  LiveSessionHistorySection,
  LessonSprintSection,
  DialoguePracticeSection,
  CoachNotesSection,
  TrainingReportSection,
} from './_components/OverviewSections';

export default async function StudentOverviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  // ヘッダー（生徒名・次回セッション）だけを先に確定させ、各カードは Suspense で個別に後から表示する
  const [overview, upcomingSession] = await Promise.all([
    getStudentOverview(id),
    getStudentUpcomingSession(id),
  ]);

  if (!overview.success) {
    notFound();
  }

  return (
    <div className="space-y-6">
      <StudentOverviewHeader profile={overview.profile} upcomingSession={upcomingSession} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Suspense fallback={<CardSkeleton rows={5} />}>
          <LiveSessionHistorySection studentId={id} profile={overview.profile} />
        </Suspense>
        <Suspense fallback={<CardSkeleton />}>
          <LessonSprintSection studentId={id} />
        </Suspense>
        <Suspense fallback={<CardSkeleton />}>
          <DialoguePracticeSection studentId={id} />
        </Suspense>
        <Suspense fallback={<CardSkeleton />}>
          <CoachNotesSection studentId={id} />
        </Suspense>
        <Suspense fallback={<CardSkeleton />}>
          <TrainingReportSection studentId={id} />
        </Suspense>
      </div>
    </div>
  );
}
