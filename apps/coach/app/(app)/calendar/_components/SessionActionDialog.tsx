'use client';

import {
  SessionActionDialog as SharedSessionActionDialog,
  type SessionActionTarget,
} from '@gabby/lib/components/common/SessionActionDialog';
import { formatDateTimeEn } from '@gabby/lib/date/dateEn';
import { cancelSession, checkSessionConflict, resolveStaleSession } from '@/actions/sessionAction';
import { COACH_SESSION_ACTION_LABELS } from '@/constants/sessionActionDialog';
import type { SessionListItem } from '@gabby/types/session';

export type { SessionActionTarget };

interface SessionActionDialogProps {
  target: SessionActionTarget | null;
  onClose: () => void;
  onResolved: (sessionId: string, patch: Partial<SessionListItem>) => void;
}

/**
 * Session cancel/resolve dialog (thin Coach-portal adapter).
 * The actual UI/logic lives in packages/lib/components/common/SessionActionDialog; this file
 * only injects the English copy (constants/sessionActionDialog) and the coach's server actions.
 */
export function SessionActionDialog({ target, onClose, onResolved }: SessionActionDialogProps) {
  return (
    <SharedSessionActionDialog
      target={target}
      onClose={onClose}
      onResolved={onResolved}
      actions={{ cancelSession, checkSessionConflict, resolveStaleSession }}
      labels={COACH_SESSION_ACTION_LABELS}
      formatCounterpartTime={(datetime, timezone) => formatDateTimeEn(datetime, timezone)}
    />
  );
}
