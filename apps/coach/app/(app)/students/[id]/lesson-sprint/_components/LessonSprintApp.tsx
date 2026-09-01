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

  if (view === 'playing') {
    return (
      <LessonSprintPlayer
        studentId={studentId}
        onExit={handleExit}
        onComplete={handleComplete}
      />
    );
  }

  return (
    <LessonSprintSetup
      studentId={studentId}
      profile={profile}
      lessonSprints={lessonSprints}
      contents={contents}
      onStart={handleStart}
    />
  );
}
