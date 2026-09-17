'use client';

import {
  SessionActionDialog as SharedSessionActionDialog,
  type SessionActionTarget,
} from '@gabby/lib/components/common/SessionActionDialog';
import { formatDateTimeByZone } from '@gabby/lib/date/date';
import { cancelSession, checkSessionConflict } from '@/actions/sessionAction';
import { STUDENT_SESSION_ACTION_LABELS } from '@/constants/sessionActionDialog';
import type { SessionListItem } from '@gabby/types/session';

export type { SessionActionTarget };

interface SessionActionDialogProps {
  target: SessionActionTarget | null;
  onClose: () => void;
  onResolved: (sessionId: string, patch: Partial<SessionListItem>) => void;
}

/**
 * セッションキャンセルダイアログ（生徒アプリ向け薄いアダプタ）。
 * 実際のUI・ロジックは packages/lib/components/common/SessionActionDialog に集約し、
 * ここでは日本語文言（constants/sessionActionDialog）とサーバーアクションを注入するだけに留める。
 * 生徒側は期限超過セッションの手動解決(resolve)は行わないため、cancelモードのみ対応する。
 */
export function SessionActionDialog({ target, onClose, onResolved }: SessionActionDialogProps) {
  return (
    <SharedSessionActionDialog
      target={target}
      onClose={onClose}
      onResolved={onResolved}
      actions={{ cancelSession, checkSessionConflict }}
      labels={STUDENT_SESSION_ACTION_LABELS}
      formatCounterpartTime={(datetime, timezone) => formatDateTimeByZone(datetime, timezone, false)}
    />
  );
}
