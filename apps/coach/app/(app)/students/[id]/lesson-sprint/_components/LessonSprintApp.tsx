'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { LessonSprintSetup } from './LessonSprintSetup';
import { LessonSprintPlayer } from './LessonSprintPlayer';
import { useLessonSprintStore } from '@/stores/useLessonSprintStore';
import type { LessonSprintContentSummary, LessonSprintHistoryListItem } from '@gabby/types/lessonSprint';
import type { SprintQuestion } from '@gabby/types/sprint';
import type { StudentOverviewProfile } from '@gabby/types/coachStudent';

interface Props {
  studentId: string;
  profile: StudentOverviewProfile;
  lessonSprints: LessonSprintHistoryListItem[];
  contents: LessonSprintContentSummary[];
}

export function LessonSprintApp({ studentId, profile, lessonSprints, contents }: Props) {
  const router = useRouter();
  // 「Repeat Same Settings」（結果画面）から遷移してきた場合、既にセッションが開始済みのことがあるため、
  // マウント時点のストア状態を見て初期ビューを決める（常に'selecting'から始めない）。
  const [view, setView] = useState<'selecting' | 'playing'>(
    () => (useLessonSprintStore.getState().session.isActive ? 'playing' : 'selecting')
  );
  const { startSession, resetStore } = useLessonSprintStore();

  const handleStart = (questions: SprintQuestion[]) => {
    startSession(questions);
    setView('playing');
  };

  const handleExit = () => {
    resetStore();
    setView('selecting');
  };

  const handleComplete = (lessonSprintId: string) => {
    resetStore();
    router.push(`/students/${studentId}/lesson-sprint/result/${lessonSprintId}`);
  };

  // Setup〜Playは一続きの没入型セッションとして扱うため、Header/Sidebarを覆う共通シェルをここで統一する。
  // 結果画面（別ルート）は基本のアプリ構成（Header/Sidebarあり）のまま据え置き。
  return (
    <div className="fixed inset-0 z-40 w-full h-full bg-slate-50 flex items-center justify-center gap-4 p-2 overflow-hidden text-slate-900">
      {view === 'playing' ? (
        <LessonSprintPlayer
          studentId={studentId}
          onExit={handleExit}
          onComplete={handleComplete}
        />
      ) : (
        <LessonSprintSetup
          studentId={studentId}
          profile={profile}
          lessonSprints={lessonSprints}
          contents={contents}
          onStart={handleStart}
        />
      )}
    </div>
  );
}
