import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { NotificationType } from '@gabby/types/notification';
import { SESSION_STATUS } from '@gabby/types/session';
import { getFirstLiveSessionOccurrence } from '../../../date/date';
import type { NotificationMailFacts, ScheduleTime } from '../../templates/notificationDetails';
import { readText } from './payload';

/** 振替候補・予約申請（com_t_session_slot_proposal.status）の未回答 */
const PROPOSAL_PENDING = 1;

function minutesOf(time: string): number {
  const [hour, minute] = time.slice(0, 5).split(':').map(Number);
  return hour * 60 + minute;
}

async function readSession(admin: SupabaseClient, sessionId: string | null): Promise<ScheduleTime | null> {
  if (!sessionId) return null;
  const { data, error } = await admin.from('com_t_session').select('start_datetime, end_datetime').eq('session_id', sessionId).maybeSingle();
  if (error) throw new Error(`session_fetch_failed: ${error.message}`);
  return data ? { startIso: data.start_datetime, endIso: data.end_datetime } : null;
}

async function readProposal(admin: SupabaseClient, proposalId: string | null) {
  if (!proposalId) return null;
  const { data, error } = await admin
    .from('com_t_session_slot_proposal')
    .select('proposed_start_datetime, proposed_end_datetime, reason, reject_reason')
    .eq('proposal_id', proposalId)
    .maybeSingle();
  if (error) throw new Error(`proposal_fetch_failed: ${error.message}`);
  return data;
}

/** payload の日時だけがある場合（古い通知・行が読めない場合）は開始時刻だけを出す */
function fromPayload(payload: Record<string, unknown>, key: string): ScheduleTime | null {
  const startIso = readText(payload, key);
  return startIso ? { startIso, endIso: null } : null;
}

/**
 * 通知メールに載せる対象の情報（日時・振替候補・理由）を、送る直前に業務データから集める。
 * payload の ID から行を読み直す（終了時刻・振替候補等は payload に無いため）。読めない場合は payload の日時だけにし、
 * それも無ければ空にする（メールは日時なしの文面で送る）。
 * timeZone は受信者のタイムゾーン（マッチングの否認で、申請した枠の次の回の日時を求めるのに使う）。
 */
export async function loadNotificationFacts({
  admin,
  type,
  payload,
  timeZone,
  nowMs,
}: {
  admin: SupabaseClient;
  type: NotificationType;
  payload: Record<string, unknown>;
  timeZone: string;
  nowMs: number;
}): Promise<NotificationMailFacts> {
  switch (type) {
    case 'SESSION_CANCELLED_BY_COACH':
    case 'SESSION_CANCELLED_BY_STUDENT':
    case 'SESSION_BOOKED_BY_STUDENT':
    case 'SESSION_BOOKING_APPROVED':
      return { session: (await readSession(admin, readText(payload, 'session_id'))) ?? fromPayload(payload, 'session_start_datetime') };

    case 'SESSION_RESCHEDULE_PROPOSED':
    case 'SESSION_RESCHEDULE_PROPOSED_BY_STUDENT': {
      const sessionId = readText(payload, 'session_id');
      const session = (await readSession(admin, sessionId)) ?? fromPayload(payload, 'session_start_datetime');
      if (!sessionId) return { session };
      const { data, error } = await admin
        .from('com_t_session_slot_proposal')
        .select('proposed_start_datetime, proposed_end_datetime, expires_at')
        .eq('source_session_id', sessionId)
        .eq('status', PROPOSAL_PENDING)
        .order('proposed_start_datetime', { ascending: true });
      if (error) throw new Error(`proposal_fetch_failed: ${error.message}`);
      const proposals = data ?? [];
      const expires = proposals.map((p) => p.expires_at).filter((v): v is string => !!v).sort()[0] ?? null;
      return {
        session,
        proposals: proposals.map((p) => ({ startIso: p.proposed_start_datetime, endIso: p.proposed_end_datetime })),
        proposalExpiresIso: expires,
      };
    }

    case 'SESSION_BOOKING_REQUESTED': {
      const proposal = await readProposal(admin, readText(payload, 'request_id'));
      return proposal
        ? { session: { startIso: proposal.proposed_start_datetime, endIso: proposal.proposed_end_datetime }, message: proposal.reason }
        : { session: fromPayload(payload, 'requested_start_datetime') };
    }

    case 'SESSION_BOOKING_REJECTED': {
      const proposal = await readProposal(admin, readText(payload, 'proposal_id'));
      return proposal
        ? { session: { startIso: proposal.proposed_start_datetime, endIso: proposal.proposed_end_datetime }, reason: proposal.reject_reason }
        : { session: fromPayload(payload, 'requested_start_datetime'), reason: readText(payload, 'reject_reason') };
    }

    case 'MATCHING_APPROVED': {
      // 毎週の枠はコーチの現地時刻で持つため、実際に作られた初回のセッション（UTC）から曜日・時刻を求める
      const scheduleId = readText(payload, 'schedule_id');
      if (!scheduleId) return {};
      const { data, error } = await admin
        .from('com_t_session')
        .select('start_datetime, end_datetime')
        .eq('schedule_id', scheduleId)
        .eq('status', SESSION_STATUS.SCHEDULED)
        .order('start_datetime', { ascending: true })
        .limit(1)
        .maybeSingle();
      if (error) throw new Error(`session_fetch_failed: ${error.message}`);
      return { weekly: data ? { startIso: data.start_datetime, endIso: data.end_datetime } : null };
    }

    case 'MATCHING_REJECTED': {
      // 否認された申請にはセッションが無いため、申請した枠（コーチの現地時刻）の次の回の日時から曜日・時刻を求める
      // （生徒の申請画面の表示と同じ求め方）
      const requestId = readText(payload, 'request_id');
      if (!requestId) return {};
      const { data: request, error } = await admin
        .from('com_t_matching_request')
        .select('coach_id, requested_day_of_week, requested_start_time, requested_end_time, reject_reason')
        .eq('request_id', requestId)
        .maybeSingle();
      if (error) throw new Error(`matching_request_fetch_failed: ${error.message}`);
      if (!request) return {};
      const { data: coach } = await admin.from('com_m_user').select('timezone').eq('id', request.coach_id).maybeSingle();
      const coachTimeZone = coach?.timezone ?? 'Asia/Tokyo';
      const { instant } = getFirstLiveSessionOccurrence(
        request.requested_day_of_week,
        request.requested_start_time,
        coachTimeZone,
        timeZone,
        new Date(nowMs)
      );
      const durationMinutes = minutesOf(request.requested_end_time) - minutesOf(request.requested_start_time);
      return {
        weekly: { startIso: instant.toISOString(), endIso: new Date(instant.getTime() + durationMinutes * 60000).toISOString() },
        reason: request.reject_reason,
      };
    }

    default:
      return {};
  }
}
