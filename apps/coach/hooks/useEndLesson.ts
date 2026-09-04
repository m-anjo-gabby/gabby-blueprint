'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useConfirm } from '@gabby/lib/hooks/useConfirm';
import { useToast } from '@gabby/lib/hooks/useToast';
import { finalizeSession } from '@/actions/sessionAction';

interface ReasonDialogTarget {
  sessionId: string;
  studentId: string;
}

/**
 * 「レッスン終了」ボタンの共通ロジック（TodaysSessionsPanel/TodaysLessonPanelで共有）。
 * 確認ダイアログ → finalize_session RPC呼び出し → 20分未満で理由が必要な場合は
 * 理由入力ダイアログを出して再実行 → 成功したらレッスン結果画面へ遷移、という流れをまとめる。
 */
export function useEndLesson() {
  const router = useRouter();
  const { showConfirm } = useConfirm();
  const { showToast } = useToast();
  const [reasonDialogTarget, setReasonDialogTarget] = useState<ReasonDialogTarget | null>(null);
  const [endingSessionId, setEndingSessionId] = useState<string | null>(null);

  const runFinalize = async (sessionId: string, studentId: string, reason?: string) => {
    setEndingSessionId(sessionId);
    try {
      const result = await finalizeSession(sessionId, reason);
      if (!result.success) {
        if (result.errorCode === 'reason_required') {
          setReasonDialogTarget({ sessionId, studentId });
          return;
        }
        showToast(result.message, 'error');
        return;
      }
      router.push(`/students/${studentId}/sessions/${sessionId}/result`);
    } finally {
      setEndingSessionId(null);
    }
  };

  const endLesson = async (sessionId: string, studentId: string) => {
    const confirmed = await showConfirm(
      'End lesson?',
      'This will record the outcome of this lesson based on who joined the call and for how long. This cannot be undone.',
      { variant: 'danger', isModal: false, confirmText: 'End Lesson', cancelText: 'Cancel' }
    );
    if (!confirmed) return;
    await runFinalize(sessionId, studentId);
  };

  const submitReason = async (reason: string) => {
    if (!reasonDialogTarget) return;
    const { sessionId, studentId } = reasonDialogTarget;
    setReasonDialogTarget(null);
    await runFinalize(sessionId, studentId, reason);
  };

  return {
    endLesson,
    endingSessionId,
    reasonDialogOpen: reasonDialogTarget !== null,
    closeReasonDialog: () => setReasonDialogTarget(null),
    submitReason,
  };
}
