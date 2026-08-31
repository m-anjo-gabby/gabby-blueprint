import { createServerClient } from '../../supabase/server';
import { createLogger } from '../../logger';
import { getLogContext } from '../../logger/context';
import { generateVideoSdkSignature } from '../../zoom/signature';
import {
  GetLiveSessionRoomAccessResult,
  LIVE_SESSION_ROOM_ROLE,
} from '@gabby/types/liveSessionRoom';

const logger = createLogger('common');

/** コーチ⇔生徒のペアから、両者が同じセッションに入室するための決定的なセッション名を作る */
function buildSessionName(coachId: string, studentId: string): string {
  return `live-${[coachId, studentId].sort().join('-')}`;
}

/**
 * ログイン中コーチが、指定生徒とのライブセッションルームに入室するためのアクセス情報を取得する。
 * 現役の担当関係（com_m_lesson_schedule.status=1）を持つ場合のみ許可する
 * （生徒メモ閲覧等で使うhasCoachStudentRelationshipより厳しく、過去の担当関係は対象外）。
 */
export async function getCoachLiveSessionRoomAccessCore(studentId: string): Promise<GetLiveSessionRoomAccessResult> {
  const ctx = await getLogContext();

  try {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, errorCode: 'unauthorized' };

    const { data: schedule, error: scheduleError } = await supabase
      .from('com_m_lesson_schedule')
      .select('schedule_id')
      .eq('coach_id', user.id)
      .eq('student_id', studentId)
      .eq('status', 1)
      .limit(1)
      .maybeSingle();

    if (scheduleError) {
      logger.error('liveSessionRoom:coach_access_schedule_failed', scheduleError.message, { ...ctx, userId: user.id, payload: { studentId } });
      return { success: false, errorCode: 'unexpected_error' };
    }
    if (!schedule) {
      return { success: false, errorCode: 'not_eligible' };
    }

    const [{ data: coach, error: coachError }, { data: student, error: studentError }] = await Promise.all([
      supabase.from('com_m_user').select('user_name').eq('id', user.id).maybeSingle(),
      supabase.from('com_m_user').select('user_name, icon_path').eq('id', studentId).maybeSingle(),
    ]);

    if (coachError || studentError || !coach || !student) {
      logger.error('liveSessionRoom:coach_access_user_lookup_failed', coachError?.message ?? studentError?.message ?? 'user not found', { ...ctx, userId: user.id, payload: { studentId } });
      return { success: false, errorCode: 'unexpected_error' };
    }

    const sessionName = buildSessionName(user.id, studentId);
    const signature = generateVideoSdkSignature({
      sessionName,
      role: LIVE_SESSION_ROOM_ROLE.HOST,
      userIdentity: coach.user_name ?? 'Coach',
    });

    return {
      success: true,
      access: {
        sdkKey: process.env.ZOOM_VIDEO_SDK_KEY!,
        signature,
        sessionName,
        userIdentity: coach.user_name ?? 'Coach',
        role: LIVE_SESSION_ROOM_ROLE.HOST,
        peerName: student.user_name ?? '(Unknown)',
        peerIconPath: student.icon_path ?? null,
      },
    };
  } catch (err) {
    logger.error('liveSessionRoom:coach_access_unexpected', err instanceof Error ? err.message : 'Unknown error', ctx);
    return { success: false, errorCode: 'unexpected_error' };
  }
}

/**
 * ログイン中生徒が、自身のライブセッションルームに入室するためのアクセス情報を取得する。
 * 有効なライブセッションチケットを保持し、かつ専属コーチが割り当て済み（com_m_lesson_schedule.status=1）の場合のみ許可する。
 * 複数の専属コーチが割り当てられている場合はslot_noが最も若いものを採用する（POCの既知の制約）。
 */
export async function getStudentLiveSessionRoomAccessCore(): Promise<GetLiveSessionRoomAccessResult> {
  const ctx = await getLogContext();

  try {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, errorCode: 'unauthorized' };

    const { data: tickets, error: ticketError } = await supabase
      .from('com_t_user_session_ticket')
      .select('license_id')
      .eq('user_id', user.id);

    if (ticketError) {
      logger.error('liveSessionRoom:student_access_ticket_failed', ticketError.message, { ...ctx, userId: user.id });
      return { success: false, errorCode: 'unexpected_error' };
    }
    if (!tickets || tickets.length === 0) {
      return { success: false, errorCode: 'not_eligible' };
    }

    const { data: licenses, error: licenseError } = await supabase
      .from('com_t_user_license')
      .select('license_id, status, end_date')
      .in('license_id', tickets.map((t) => t.license_id));

    if (licenseError) {
      logger.error('liveSessionRoom:student_access_license_failed', licenseError.message, { ...ctx, userId: user.id });
      return { success: false, errorCode: 'unexpected_error' };
    }

    const now = new Date();
    const hasActiveTicket = (licenses ?? []).some((l) => l.status === 1 && new Date(l.end_date) >= now);
    if (!hasActiveTicket) {
      return { success: false, errorCode: 'not_eligible' };
    }

    const { data: schedule, error: scheduleError } = await supabase
      .from('com_m_lesson_schedule')
      .select('coach_id')
      .eq('student_id', user.id)
      .eq('status', 1)
      .order('slot_no', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (scheduleError) {
      logger.error('liveSessionRoom:student_access_schedule_failed', scheduleError.message, { ...ctx, userId: user.id });
      return { success: false, errorCode: 'unexpected_error' };
    }
    if (!schedule) {
      return { success: false, errorCode: 'not_eligible' };
    }

    const [{ data: student, error: studentError }, { data: coach, error: coachError }] = await Promise.all([
      supabase.from('com_m_user').select('user_name').eq('id', user.id).maybeSingle(),
      supabase.from('com_m_user').select('user_name, icon_path').eq('id', schedule.coach_id).maybeSingle(),
    ]);

    if (studentError || coachError || !student || !coach) {
      logger.error('liveSessionRoom:student_access_user_lookup_failed', studentError?.message ?? coachError?.message ?? 'user not found', { ...ctx, userId: user.id });
      return { success: false, errorCode: 'unexpected_error' };
    }

    const sessionName = buildSessionName(schedule.coach_id, user.id);
    const signature = generateVideoSdkSignature({
      sessionName,
      role: LIVE_SESSION_ROOM_ROLE.PARTICIPANT,
      userIdentity: student.user_name ?? 'Student',
    });

    return {
      success: true,
      access: {
        sdkKey: process.env.ZOOM_VIDEO_SDK_KEY!,
        signature,
        sessionName,
        userIdentity: student.user_name ?? 'Student',
        role: LIVE_SESSION_ROOM_ROLE.PARTICIPANT,
        peerName: coach.user_name ?? '(Unknown)',
        peerIconPath: coach.icon_path ?? null,
      },
    };
  } catch (err) {
    logger.error('liveSessionRoom:student_access_unexpected', err instanceof Error ? err.message : 'Unknown error', ctx);
    return { success: false, errorCode: 'unexpected_error' };
  }
}
