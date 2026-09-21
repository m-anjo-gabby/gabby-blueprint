'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, RotateCcw } from 'lucide-react';
import { resolveCoachContentName } from '@gabby/lib';
import { getLessonSprintQuestions } from '@/actions/lessonSprintAction';
import { withLiveSessionParam } from '@/lib/liveSession/context';
import { useLessonSprintStore } from '@/stores/useLessonSprintStore';
import { useToast } from '@gabby/lib/hooks/useToast';
import type { LessonSprintRecord, LessonSprintContentSummary } from '@gabby/types/lessonSprint';
import type { SprintQuestionType, SprintAnswerType } from '@gabby/types/sprint';

interface Props {
  studentId: string;
  record: LessonSprintRecord;
  content: LessonSprintContentSummary | undefined;
  /** 現在ハブのセッション文脈内にいるかどうか（URLの?session_id=。record.session_idとは別物）。 */
  sessionId: string | null;
}

export function RepeatSprintButton({ studentId, record, content, sessionId }: Props) {
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

    // 「今まさにハブのセッション文脈内にいるか」で判断する（record.session_idという、この
    // 記録がたまたま過去のどのセッションに属していたかとは別物）。受講生概要のスプリント履歴
    // から開いた過去記録をRepeatした場合は、その場ではハブの文脈にいないため単独実施として扱う。
    router.push(withLiveSessionParam(`/students/${studentId}/lesson-sprint`, sessionId));
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
