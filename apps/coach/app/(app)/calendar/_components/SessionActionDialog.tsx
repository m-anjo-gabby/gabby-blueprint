'use client';

import {
  SessionActionDialog as SharedSessionActionDialog,
  type SessionActionTarget,
} from '@gabby/lib/components/common/SessionActionDialog';
import { formatDateTimeEn } from '@gabby/lib/date/dateEn';
import { cancelSession, checkSessionConflict } from '@/actions/sessionAction';
import { COACH_SESSION_ACTION_LABELS } from '@/constants/sessionActionDialog';
import type { SessionListItem } from '@gabby/types/session';

export type { SessionActionTarget };

interface SessionActionDialogProps {
  target: SessionActionTarget | null;
  onClose: () => void;
  onResolved: (sessionId: string, patch: Partial<SessionListItem>) => void;
}

/**
 * セッションのキャンセルのダイアログ（コーチのポータル用の薄い包み）。
 * 画面と処理は packages/lib/components/common/SessionActionDialog にあり、このファイルは
 * 英語の文言（constants/sessionActionDialog）とコーチのサーバーアクションを渡すだけ。
 */
export function SessionActionDialog({ target, onClose, onResolved }: SessionActionDialogProps) {
  return (
    <SharedSessionActionDialog
      target={target}
      onClose={onClose}
      onResolved={onResolved}
      actions={{ cancelSession, checkSessionConflict }}
      labels={COACH_SESSION_ACTION_LABELS}
      formatCounterpartTime={(datetime, timezone) => formatDateTimeEn(datetime, timezone)}
    />
  );
}
