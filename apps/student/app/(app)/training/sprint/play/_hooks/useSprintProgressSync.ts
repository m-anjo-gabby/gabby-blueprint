'use client';

import { useCallback, useEffect, useRef } from 'react';
import { SprintQuestionType } from '@gabby/types/sprint';
import { usePeriodicSync } from '@gabby/lib/hooks/usePeriodicSync';
import { reportSprintProgress } from '@/actions/sprintAction';
import { useSprintStore } from '@/stores/useSprintStore';

/**
 * ドリルモード専用：進捗（問題消化数・発話評価数）を5分ごとに自動でサーバーへ同期する。
 * contentId/questionType は ref 経由で常に最新値を参照し、setInterval のクロージャが
 * 古い値を掴んだままにならないようにしている。
 */
export function useSprintProgressSync(contentId: string | null, questionType: string | null) {
  const contentIdRef = useRef(contentId);
  useEffect(() => {
    contentIdRef.current = contentId;
  }, [contentId]);

  const questionTypeRef = useRef(questionType);
  useEffect(() => {
    questionTypeRef.current = questionType;
  }, [questionType]);

  const syncProgressNow = useCallback(async () => {
    if (!contentIdRef.current) return;
    const { questionCount, assessmentCount } = useSprintStore.getState().clearPendingCounts();
    if (questionCount > 0 || assessmentCount > 0) {
      await reportSprintProgress(
        contentIdRef.current,
        questionCount,
        assessmentCount,
        (questionTypeRef.current || '0') as SprintQuestionType
      );
    }
  }, []);

  usePeriodicSync(syncProgressNow, 5 * 60 * 1000);

  return { syncProgressNow };
}
