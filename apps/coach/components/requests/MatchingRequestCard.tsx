'use client';

import { CalendarClock, Check, TriangleAlert, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import {
  convertWeeklyTimeZone,
  getFirstLiveSessionOccurrence,
  getLessonEndTime,
  getWeeklyTimeChanges,
  toIsoDateInZone,
} from '@gabby/lib/date/date';
import { formatDateEn, formatDateTimeEn } from '@gabby/lib/date/dateEn';
import { useConfirm } from '@gabby/lib/hooks/useConfirm';
import { useTimezone } from '@gabby/lib/hooks/useTimezone';
import { useToast } from '@gabby/lib/hooks/useToast';
import { type DayOfWeek } from '@gabby/types/coachAvailability';
import {
  getMatchingUnbookedBreakdown,
  MATCHING_REQUEST_STATUS,
  type IncomingMatchingRequestItem,
} from '@gabby/types/matching';
import { approveMatchingRequest, rejectMatchingRequest } from '@/actions/matchingRequestAction';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { DAY_OF_WEEK_LABEL_EN } from '@/constants/availability';
import { RequestKindTag, WebTrialTag } from './RequestKindTag';

const STATUS_BADGE: Record<number, { label: string; className: string }> = {
  [MATCHING_REQUEST_STATUS.PENDING]: { label: 'Pending', className: 'bg-amber-50 text-amber-700 border-amber-200' },
  [MATCHING_REQUEST_STATUS.APPROVED]: {
    label: 'Approved',
    className: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  },
  [MATCHING_REQUEST_STATUS.REJECTED]: { label: 'Rejected', className: 'bg-rose-50 text-rose-700 border-rose-200' },
  [MATCHING_REQUEST_STATUS.CANCELLED]: {
    label: 'Withdrawn',
    className: 'bg-slate-100 text-slate-600 border-slate-200',
  },
  [MATCHING_REQUEST_STATUS.EXPIRED]: { label: 'Expired', className: 'bg-slate-100 text-slate-600 border-slate-200' },
};

function formatTimeRange(startTime: string, endTime: string): string {
  return `${startTime.slice(0, 5)} - ${endTime.slice(0, 5)}`;
}

interface MatchingRequestCardProps {
  request: IncomingMatchingRequestItem;
  onResolved: (requestId: string, patch: Partial<IncomingMatchingRequestItem>) => void;
  /** カレンダーと並べて表示する場合、対応する日付をホバー時にハイライトするためのコールバック */
  onDateHover?: (date: string | null) => void;
}

export function MatchingRequestCard({ request, onResolved, onDateHover }: MatchingRequestCardProps) {
  const timezone = useTimezone();
  const [isApproving, setIsApproving] = useState(false);
  const [isRejecting, setIsRejecting] = useState(false);
  const [showRejectDialog, setShowRejectDialog] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const { showToast } = useToast();
  const { showConfirm } = useConfirm();

  // 依頼は送ってから24時間で期限が切れる。期限を過ぎた保留中の依頼は、毎分の期限切れの処理が
  // 状態を更新する前でも、期限切れとして扱う。
  const isExpired =
    request.status === MATCHING_REQUEST_STATUS.EXPIRED ||
    (request.status === MATCHING_REQUEST_STATUS.PENDING &&
      !!request.expires_at &&
      new Date(request.expires_at).getTime() <= Date.now());
  const badge = STATUS_BADGE[isExpired ? MATCHING_REQUEST_STATUS.EXPIRED : request.status];
  const isPending = request.status === MATCHING_REQUEST_STATUS.PENDING && !isExpired;

  // 今承認すると何回のレッスンが予約されるか。コーチのほかの予約・休みと重なるレッスンは
  // 飛ばし、生徒とコーチが個別に調整する。必要な回数に届かなければ、承認できない。
  const availability = isPending ? request.availability : null;
  const breakdown = availability ? getMatchingUnbookedBreakdown(availability) : null;
  const canApprove = !availability || availability.is_acceptable;
  const droppedSinceRequest =
    availability &&
    request.requested_bookable_sessions !== null &&
    availability.bookable_sessions < request.requested_bookable_sessions;

  // 依頼の曜日・時刻は生徒の手元の時刻（requested_timezone）で、契約の間ずっと変わらない。
  // ここでは次の回の UTC からのずれを使って、コーチのタイムゾーンで出す。
  const coachSlot = useMemo(
    () =>
      convertWeeklyTimeZone(
        {
          day_of_week: request.requested_day_of_week,
          start_time: request.requested_start_time,
          end_time: request.requested_end_time,
        },
        request.requested_timezone,
        timezone,
      ),
    [
      request.requested_day_of_week,
      request.requested_start_time,
      request.requested_end_time,
      request.requested_timezone,
      timezone,
    ],
  );
  const studentSlotLabel = `${DAY_OF_WEEK_LABEL_EN[request.requested_day_of_week as DayOfWeek]} ${formatTimeRange(request.requested_start_time, request.requested_end_time)}`;
  const coachSlotLabel = `${DAY_OF_WEEK_LABEL_EN[coachSlot.day_of_week as DayOfWeek]} ${formatTimeRange(coachSlot.start_time, coachSlot.end_time)}`;

  // 最初のライブセッションの日: 依頼の曜日・時刻のうち、今から実時間で24時間以上先で
  // （暦の「明日」ではなく。タイムゾーンをまたいでも正しくするため）、
  // 生徒の契約の期間内（更新の契約は先に始まることがある）の、一番近い回。
  // 意味があるのは保留中の間だけ。承認した後は、実際の日が com_t_session に決まる。
  const firstSession = useMemo(() => {
    if (!isPending) return null;
    const notBefore = request.license_start_date ? new Date(request.license_start_date) : undefined;
    const first = getFirstLiveSessionOccurrence(
      request.requested_day_of_week,
      request.requested_start_time,
      request.requested_timezone,
      timezone,
      undefined,
      notBefore,
    );
    if (request.license_end_date && first.instant > new Date(request.license_end_date)) return null;
    return first;
  }, [
    isPending,
    request.requested_day_of_week,
    request.requested_start_time,
    request.requested_timezone,
    request.license_start_date,
    request.license_end_date,
    timezone,
  ]);

  // 夏時間（コーチ・生徒のどちらか）で、契約の間にコーチの手元の時刻でのレッスンの時刻が
  // 動くことがある。最初のセッションの後の変更を並べ、コーチが続けて都合がつくかを確かめられるようにする。
  const laterTimeChanges = useMemo(() => {
    if (!firstSession || !request.license_end_date) return [];
    return getWeeklyTimeChanges(
      request.requested_day_of_week,
      request.requested_start_time,
      request.requested_timezone,
      timezone,
      firstSession.instant,
      new Date(request.license_end_date),
    ).slice(1);
  }, [
    firstSession,
    request.requested_day_of_week,
    request.requested_start_time,
    request.requested_timezone,
    request.license_end_date,
    timezone,
  ]);

  const handleApprove = async () => {
    const bookingText =
      availability && breakdown && breakdown.unbooked > 0
        ? `This will book ${availability.bookable_sessions} of ${availability.target_sessions} lessons for ${request.student_name} on ${coachSlotLabel} (your time). ` +
          `The other ${breakdown.unbooked} lesson(s) stay unbooked, so please arrange those dates with the student individually.`
        : `This will book every lesson for ${request.student_name} on ${coachSlotLabel} (your time) for the remaining license period.`;
    const ok = await showConfirm(
      'Approve this request?',
      bookingText +
        (laterTimeChanges.length > 0
          ? ' The time in your timezone changes during the contract because of daylight saving time.'
          : ''),
      { variant: 'info', confirmText: 'Approve', cancelText: 'Cancel' },
    );
    if (!ok) return;

    setIsApproving(true);
    try {
      const result = await approveMatchingRequest(request.request_id);
      if (!result.success) {
        showToast(result.message, 'error');
        return;
      }
      onResolved(request.request_id, { status: MATCHING_REQUEST_STATUS.APPROVED });
      showToast('Request approved. Sessions have been booked.', 'success');
    } finally {
      setIsApproving(false);
    }
  };

  const handleReject = async () => {
    if (!rejectReason.trim()) {
      showToast('Please enter a reason for rejecting this request.', 'error');
      return;
    }
    setIsRejecting(true);
    try {
      const result = await rejectMatchingRequest(request.request_id, rejectReason);
      if (!result.success) {
        showToast(result.message, 'error');
        return;
      }
      onResolved(request.request_id, { status: MATCHING_REQUEST_STATUS.REJECTED, reject_reason: rejectReason.trim() });
      setShowRejectDialog(false);
      setRejectReason('');
      showToast('Request rejected.', 'success');
    } finally {
      setIsRejecting(false);
    }
  };

  return (
    <article
      className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 space-y-3"
      onMouseEnter={() => firstSession && onDateHover?.(toIsoDateInZone(firstSession.instant, timezone))}
      onMouseLeave={() => onDateHover?.(null)}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-1.5">
            <RequestKindTag kind="matching" />
            {request.is_web_trial && <WebTrialTag />}
          </div>
          <p className="text-sm font-black text-slate-800 mt-1.5">{request.student_name}</p>
          <p className="text-xs text-slate-500 mt-0.5">
            Slot {request.slot_no} &middot; {coachSlotLabel}
          </p>
          {request.requested_timezone !== timezone && (
            <p className="text-[10px] text-slate-400 mt-0.5">
              Student&apos;s time: {studentSlotLabel} ({request.requested_timezone_name})
            </p>
          )}
          <p className="text-[10px] text-slate-400 mt-1">Requested {formatDateEn(request.insert_date, timezone)}</p>
          {isPending && request.expires_at && (
            <p className="text-[11px] font-bold text-amber-700 mt-0.5">
              Respond by {formatDateTimeEn(request.expires_at, timezone)} (expires after 24 hours)
            </p>
          )}
          {firstSession && (
            <p className="flex items-center gap-1 text-[11px] font-bold text-emerald-700 mt-1">
              <CalendarClock size={12} />
              First session: {formatDateEn(firstSession.instant, timezone)} (
              {DAY_OF_WEEK_LABEL_EN[firstSession.day_of_week as DayOfWeek]}) {firstSession.start_time}
            </p>
          )}
          {laterTimeChanges.map((change) => (
            <p
              key={change.from.toISOString()}
              className="flex items-center gap-1 text-[11px] font-bold text-amber-700 mt-1"
            >
              <CalendarClock size={12} />
              From {formatDateEn(change.from, timezone)}: {DAY_OF_WEEK_LABEL_EN[change.day_of_week as DayOfWeek]}{' '}
              {formatTimeRange(change.start_time, getLessonEndTime(change.start_time))} (your time, daylight saving
              time)
            </p>
          ))}
        </div>
        <span
          className={`text-[10px] font-black uppercase tracking-wider px-2 py-1 rounded-md border shrink-0 ${badge.className}`}
        >
          {badge.label}
        </span>
      </div>

      {availability && breakdown && (
        <div
          className={`rounded-lg border px-3 py-2 text-xs space-y-1 ${
            !availability.is_acceptable
              ? 'border-rose-100 bg-rose-50 text-rose-700'
              : breakdown.unbooked > 0
                ? 'border-amber-200 bg-amber-50 text-amber-800'
                : 'border-emerald-100 bg-emerald-50 text-emerald-700'
          }`}
        >
          <p className="font-bold">
            Bookable now: {availability.bookable_sessions} of {availability.target_sessions} lessons
            {request.requested_bookable_sessions !== null && ` (${request.requested_bookable_sessions} when requested)`}
          </p>
          {breakdown.conflicts > 0 && (
            <p>{breakdown.conflicts} lesson(s) clash with your other bookings or days off.</p>
          )}
          {breakdown.periodShort > 0 && (
            <p>{breakdown.periodShort} lesson(s) don&apos;t fit in the remaining license period.</p>
          )}
          {droppedSinceRequest && availability.is_acceptable && (
            <p className="flex items-center gap-1 font-bold">
              <TriangleAlert size={12} />
              Fewer lessons than when the student requested. The student will see the booked count when you approve.
            </p>
          )}
          {!availability.is_acceptable ? (
            <p className="font-bold">
              At least {availability.required_sessions} lessons are needed to approve. Please reject this request with a
              reason so the student can choose another time.
            </p>
          ) : (
            breakdown.unbooked > 0 && (
              <p>After approval, please arrange the unbooked lesson(s) with the student individually.</p>
            )
          )}
        </div>
      )}

      {request.status === MATCHING_REQUEST_STATUS.REJECTED && request.reject_reason && (
        <p className="text-xs text-rose-600 bg-rose-50 border border-rose-100 rounded-lg px-3 py-2">
          {request.reject_reason}
        </p>
      )}

      {isPending && (
        <div className="flex items-center gap-2 pt-1">
          <Button
            pending={isApproving}
            icon={<Check size={14} />}
            type="button"
            size="sm"
            onClick={handleApprove}
            disabled={isApproving || isRejecting || !canApprove}
          >
            Approve
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setShowRejectDialog(true)}
            disabled={isApproving || isRejecting}
          >
            <X size={14} />
            Reject
          </Button>
        </div>
      )}

      <Dialog open={showRejectDialog} onOpenChange={setShowRejectDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject Request</DialogTitle>
            <DialogDescription>
              Let {request.student_name} know why this slot doesn&apos;t work. This reason will be shown to them.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            rows={4}
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            placeholder="e.g. This time slot is no longer available. Please choose another time."
          />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setShowRejectDialog(false)} disabled={isRejecting}>
              Cancel
            </Button>
            <Button pending={isRejecting} type="button" onClick={handleReject} disabled={isRejecting}>
              Reject Request
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </article>
  );
}
