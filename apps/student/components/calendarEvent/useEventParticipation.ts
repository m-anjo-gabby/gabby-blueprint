'use client';

import { useState } from 'react';
import { useToast } from '@gabby/lib/hooks/useToast';
import { useConfirm } from '@gabby/lib/hooks/useConfirm';
import { joinCalendarEvent, cancelCalendarEventParticipation } from '@/actions/calendarEventAction';

/**
 * カレンダーイベント（グループセッション等）の参加登録・取消（カレンダーの詳細・ホームのカードで共有する）。
 * 成功したら onChanged で呼び出し側の一覧の参加状態を更新する。
 */
export function useEventParticipation(onChanged: (calendarEventId: string, isJoined: boolean) => void) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { showToast } = useToast();
  const { showConfirm } = useConfirm();

  const join = async (calendarEventId: string) => {
    setIsSubmitting(true);
    try {
      const result = await joinCalendarEvent(calendarEventId);
      if (!result.success) {
        showToast(result.message, 'error');
        return;
      }
      onChanged(calendarEventId, true);
      showToast('参加登録しました', 'success');
    } finally {
      setIsSubmitting(false);
    }
  };

  const cancel = async (calendarEventId: string) => {
    const ok = await showConfirm('参加をキャンセルしますか？', 'このイベントへの参加登録を取り消します。', { variant: 'danger' });
    if (!ok) return;

    setIsSubmitting(true);
    try {
      const result = await cancelCalendarEventParticipation(calendarEventId);
      if (!result.success) {
        showToast(result.message, 'error');
        return;
      }
      onChanged(calendarEventId, false);
      showToast('参加をキャンセルしました', 'success');
    } finally {
      setIsSubmitting(false);
    }
  };

  return { join, cancel, isSubmitting };
}
