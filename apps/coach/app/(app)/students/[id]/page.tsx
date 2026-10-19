import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { pickTimezoneName } from '@gabby/lib/date/timezone';
import { getTimezoneNameMap } from '@gabby/lib/timezone/timezoneNames';
import { getStudentOverview, getStudentUpcomingSession } from '@/actions/studentAction';
import {
  CoachNotesSection,
  DialoguePracticeSection,
  LessonSprintSection,
  LiveSessionHistorySection,
  preloadOverviewSections,
  TrainingReportSection,
} from './_components/OverviewSections';
import { OVERVIEW_GRID_CLASS, OverviewCardSkeleton } from './_components/OverviewSkeletons';
import { StudentOverviewHeader } from './_components/StudentOverviewHeader';

export default async function StudentOverviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // 各カードの取得をヘッダー用の取得と同時に開始する（カードの描画時は開始済みの取得の結果を使う）
  preloadOverviewSections(id);
  // ヘッダー（生徒名・次回セッション）だけを先に確定させ、各カードは Suspense で個別に後から表示する
  const [overview, upcomingSession, timezoneNames] = await Promise.all([
    getStudentOverview(id),
    getStudentUpcomingSession(id),
    getTimezoneNameMap(),
  ]);

  if (!overview.success) {
    notFound();
  }

  return (
    <div className="space-y-6">
      <StudentOverviewHeader
        profile={overview.profile}
        timezoneName={pickTimezoneName(
          overview.profile.timezone,
          timezoneNames.get(overview.profile.timezone),
          'display',
          'en',
        )}
        upcomingSession={upcomingSession}
      />

      <div className={OVERVIEW_GRID_CLASS}>
        <Suspense fallback={<OverviewCardSkeleton card="liveSessions" />}>
          <LiveSessionHistorySection studentId={id} profile={overview.profile} />
        </Suspense>
        <Suspense fallback={<OverviewCardSkeleton card="lessonSprint" />}>
          <LessonSprintSection studentId={id} />
        </Suspense>
        <Suspense fallback={<OverviewCardSkeleton card="dialoguePractice" />}>
          <DialoguePracticeSection studentId={id} />
        </Suspense>
        <Suspense fallback={<OverviewCardSkeleton card="coachNotes" />}>
          <CoachNotesSection studentId={id} />
        </Suspense>
        <Suspense fallback={<OverviewCardSkeleton card="trainingReports" />}>
          <TrainingReportSection studentId={id} />
        </Suspense>
      </div>
    </div>
  );
}
