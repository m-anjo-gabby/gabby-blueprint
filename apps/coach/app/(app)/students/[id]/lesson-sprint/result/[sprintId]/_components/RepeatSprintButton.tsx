'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, RotateCcw } from 'lucide-react';
import { resolveCoachContentName } from '@gabby/lib';
import { getLessonSprintQuestions } from '@/actions/lessonSprintAction';
import { useLessonSprintStore } from '@/stores/useLessonSprintStore';
import { useToast } from '@gabby/lib/hooks/useToast';
import type { LessonSprintRecord, LessonSprintContentSummary } from '@gabby/types/lessonSprint';
import type { SprintQuestionType, SprintAnswerType } from '@gabby/types/sprint';

interface Props {
  studentId: string;
  record: LessonSprintRecord;
  content: LessonSprintContentSummary | undefined;
}

export function RepeatSprintButton({ studentId, record, content }: Props) {
  const router = useRouter();
  const { showToast } = useToast();
  const { setConfig, setContentName, setContentMetadata, startSession } = useLessonSprintStore();
  const [isLoading, setIsLoading] = useState(false);

  const handleRepeat = async () => {
    setIsLoading(true);
    const questionType = record.question_type as SprintQuestionType;
    const result = await getLessonSprintQuestions(record.content_id, questionType, record.difficulty_level);
    setIsLoading(false);

    if (!result.success || result.questions.length === 0) {
      showToast(!result.success ? result.message : 'No questions found for this selection.', 'error');
      return;
    }

    setConfig({
      contentId: record.content_id,
      questionType,
      level: String(record.difficulty_level),
      timeLimitSec: record.time_limit_sec,
      answerType: record.answer_type as SprintAnswerType,
      sprintType: record.sprint_type,
    });
    setContentName(content ? resolveCoachContentName(content) : null);
    setContentMetadata(content?.metadata?.sprint ?? null);
    startSession(result.questions);

    // 元の実施がライブセッションに紐づいていた場合は、Repeat後もそのセッションへの
    // 紐づけを引き継ぐ（セッション終了後にRepeatした場合はsession_idが無くても問題ない）。
    const query = record.session_id ? `?session_id=${record.session_id}` : '';
    router.push(`/students/${studentId}/lesson-sprint${query}`);
  };

  return (
    <button
      type="button"
      onClick={handleRepeat}
      disabled={isLoading}
      className="w-full h-12 rounded-2xl font-black text-xs uppercase tracking-wider bg-slate-900 hover:bg-slate-800 text-white flex items-center justify-center gap-2 disabled:opacity-60 shrink-0"
    >
      {isLoading ? (
        <Loader2 size={16} className="animate-spin" />
      ) : (
        <>
          <RotateCcw size={14} />
          Repeat Same Settings
        </>
      )}
    </button>
  );
}
