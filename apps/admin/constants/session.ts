import type { useTranslations } from 'next-intl';
import { SessionStatus, CompletionResult, CancelCategory } from '@gabby/types/session';
import { buildSessionStatusBadge, SessionStatusBadgeLabels } from '@gabby/lib/session/sessionStatusBadge';

const SLATE_BADGE = { className: 'bg-slate-100 text-slate-500 border-slate-200' };

type StatusT = ReturnType<typeof useTranslations<'liveSessions.status'>>;
type ScheduleStatusT = ReturnType<typeof useTranslations<'liveSessions.scheduleStatus'>>;

/**
 * ライブセッション管理画面用のステータスラベル（アドミン向け）。
 * コーチ・生徒向けの表示とは異なり、運用判断のためにキャンセルの起因も含めた
 * 内訳をそのまま見せる（非表示にする加工はしない）。
 */
export function getAdminSessionStatusBadge(
  session: {
    status: SessionStatus;
    completion_result?: CompletionResult | null;
    cancel_category?: CancelCategory | null;
  },
  t: StatusT
): { label: string; className: string } {
  const labels: SessionStatusBadgeLabels = {
    scheduled: { label: t('scheduled'), className: 'bg-indigo-50 text-indigo-700 border-indigo-100' },
    completedNormal: { label: t('completedNormal'), className: 'bg-emerald-50 text-emerald-700 border-emerald-100' },
    completedEarlyEnded: { label: t('completedEarlyEnded'), className: 'bg-orange-50 text-orange-700 border-orange-100' },
    completedNoShow: { label: t('completedNoShow'), className: 'bg-amber-50 text-amber-700 border-amber-100' },
    cancelledByStudent: { label: t('cancelledByStudent'), className: 'bg-rose-50 text-rose-700 border-rose-100' },
    cancelledByCoach: { label: t('cancelledByCoach'), className: 'bg-rose-50 text-rose-700 border-rose-100' },
    cancelledLicenseEnded: { label: t('cancelledLicenseEnded'), ...SLATE_BADGE },
    cancelledCoachReassigned: { label: t('cancelledCoachReassigned'), ...SLATE_BADGE },
    cancelledOther: { label: t('cancelledOther'), ...SLATE_BADGE },
  };
  return buildSessionStatusBadge(session, labels);
}

/** com_m_lesson_schedule.status のラベル（アドミン向け） */
export function getAdminScheduleStatusLabel(status: number, t: ScheduleStatusT): { label: string; className: string } {
  const map: Record<number, { label: string; className: string }> = {
    1: { label: t('active'), className: 'bg-emerald-50 text-emerald-700 border-emerald-100' },
    0: { label: t('paused'), className: 'bg-amber-50 text-amber-700 border-amber-100' },
    9: { label: t('ended'), className: 'bg-slate-100 text-slate-500 border-slate-200' },
  };
  return map[status] ?? { label: t('unknown'), className: 'bg-slate-100 text-slate-500 border-slate-200' };
}
