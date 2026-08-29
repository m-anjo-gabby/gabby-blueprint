'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { LessonSprintSetup } from './LessonSprintSetup';
import { LessonSprintPlayer } from './LessonSprintPlayer';
import { useLessonSprintStore } from '@/stores/useLessonSprintStore';
import type { LessonSprintContentSummary } from '@gabby/types/lessonSprint';
import type { SprintQuestion } from '@gabby/types/sprint';

interface Props {
  studentId: string;
  studentName: string;
  contents: LessonSprintContentSummary[];
}

export function LessonSprintApp({ studentId, studentName, contents }: Props) {
  const router = useRouter();
  const [view, setView] = useState<'selecting' | 'playing'>('selecting');
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
      studentName={studentName}
      contents={contents}
      onStart={handleStart}
    />
  );
}
