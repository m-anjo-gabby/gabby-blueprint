import { createServerClient } from '../../supabase/server';
import { createLogger } from '../../logger';
import { getLogContext } from '../../logger/context';
import { generateVideoSdkSignature } from '../../zoom/signature';
import {
  GetLiveSessionRoomAccessResult,
  LIVE_SESSION_ROOM_ROLE,
  RecordCallJoinResult,
} from '@gabby/types/liveSessionRoom';
import { GetSessionCallLogPresenceResult } from '@gabby/types/session';

const logger = createLogger('common');

type SupabaseClient = Awaited<ReturnType<typeof createServerClient>>;

/**
 * 個別レッスンセッション(session_id)単位で、両者が同じZoom Video SDKセッションに
 * 入室するための決定的なセッション名を作る。以前はコーチ⇔生徒ペア単位で固定していたが、
 * 同一ペアで1日に複数コマ実施するケースに対応するため、session_id単位に変更した。
 */
function buildSessionName(sessionId: string): string {
  return `live-${sessionId}`;
}

/** ログイン中生徒が、現在有効なライブセッションチケットを保持しているか判定する */
async function hasActiveLiveSessionTicket(supabase: SupabaseClient, userId: string): Promise<boolean> {
  const { data: tickets } = await supabase
    .from('com_t_user_session_ticket')
    .select('license_id')
    .eq('user_id', userId);

  if (!tickets || tickets.length === 0) return false;

  const { data: licenses } = await supabase
    .from('com_t_user_license')
    .select('license_id, status, end_date')
    .in('license_id', tickets.map((t) => t.license_id));

  const now = new Date();
  return (licenses ?? []).some((l) => l.status === 1 && new Date(l.end_date) >= now);
}

/**
 * ログイン中コーチが、指定の個別レッスンセッションのライブセッションルームに入室するための
 * アクセス情報を取得する。対象session_idのcoach_idがログイン中コーチ本人であることのみを
 * 検証する（POCにつき、開始/終了予定時刻による活性化チェックは行わない）。
 */
export async function getCoachLiveSessionRoomAccessCore(sessionId: string): Promise<GetLiveSessionRoomAccessResult> {
  const ctx = await getLogContext();

  try {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, errorCode: 'unauthorized' };

    const { data: session, error: sessionError } = await supabase
      .from('com_t_session')
      .select('session_id, coach_id, student_id')
      .eq('session_id', sessionId)
      .maybeSingle();

    if (sessionError) {
      logger.error('liveSessionRoom:coach_access_session_lookup_failed', sessionError.message, { ...ctx, userId: user.id, payload: { sessionId } });
      return { success: false, errorCode: 'unexpected_error' };
    }
    if (!session || session.coach_id !== user.id) {
      return { success: false, errorCode: 'forbidden' };
    }

    const [{ data: coach, error: coachError }, { data: student, error: studentError }] = await Promise.all([
      supabase.from('com_m_user').select('user_name').eq('id', user.id).maybeSingle(),
      supabase.from('com_m_user').select('user_name, icon_path').eq('id', session.student_id).maybeSingle(),
    ]);

    if (coachError || studentError || !coach || !student) {
      logger.error('liveSessionRoom:coach_access_user_lookup_failed', coachError?.message ?? studentError?.message ?? 'user not found', { ...ctx, userId: user.id, payload: { sessionId } });
      return { success: false, errorCode: 'unexpected_error' };
    }

    const sessionName = buildSessionName(sessionId);
    const signature = generateVideoSdkSignature({
      sessionName,
      role: LIVE_SESSION_ROOM_ROLE.HOST,
      userIdentity: coach.user_name ?? 'Coach',
    });

    return {
      success: true,
      access: {
        sessionId,
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
 * ログイン中生徒が、指定の個別レッスンセッションのライブセッションルームに入室するための
 * アクセス情報を取得する。有効なライブセッションチケットを保持し、かつ対象session_idの
 * student_idがログイン中生徒本人であることを検証する（POCにつき、開始/終了予定時刻による
 * 活性化チェックは行わない）。
 */
export async function getStudentLiveSessionRoomAccessCore(sessionId: string): Promise<GetLiveSessionRoomAccessResult> {
  const ctx = await getLogContext();

  try {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, errorCode: 'unauthorized' };

    if (!(await hasActiveLiveSessionTicket(supabase, user.id))) {
      return { success: false, errorCode: 'not_eligible' };
    }

    const { data: session, error: sessionError } = await supabase
      .from('com_t_session')
      .select('session_id, coach_id, student_id')
      .eq('session_id', sessionId)
      .maybeSingle();

    if (sessionError) {
      logger.error('liveSessionRoom:student_access_session_lookup_failed', sessionError.message, { ...ctx, userId: user.id, payload: { sessionId } });
      return { success: false, errorCode: 'unexpected_error' };
    }
    if (!session || session.student_id !== user.id) {
      return { success: false, errorCode: 'forbidden' };
    }

    const [{ data: student, error: studentError }, { data: coach, error: coachError }] = await Promise.all([
      supabase.from('com_m_user').select('user_name').eq('id', user.id).maybeSingle(),
      supabase.from('com_m_user').select('user_name, icon_path').eq('id', session.coach_id).maybeSingle(),
    ]);

    if (studentError || coachError || !student || !coach) {
      logger.error('liveSessionRoom:student_access_user_lookup_failed', studentError?.message ?? coachError?.message ?? 'user not found', { ...ctx, userId: user.id, payload: { sessionId } });
      return { success: false, errorCode: 'unexpected_error' };
    }

    const sessionName = buildSessionName(sessionId);
    const signature = generateVideoSdkSignature({
      sessionName,
      role: LIVE_SESSION_ROOM_ROLE.PARTICIPANT,
      userIdentity: student.user_name ?? 'Student',
    });

    return {
      success: true,
      access: {
        sessionId,
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

/**
 * 指定したsession_id群それぞれについて、コーチ自身の入室ログ(com_t_session_call_log, role='coach')が
 * 1件でも存在するかを一括取得する。ダッシュボード/生徒詳細画面の「レッスン終了」ボタンの活性判定に使用する
 * （1件ずつ問い合わせるN+1を避けるため、対象session_id配列をまとめて1クエリで取得する）。
 */
export async function getSessionCallLogPresenceCore(sessionIds: string[]): Promise<GetSessionCallLogPresenceResult> {
  const ctx = await getLogContext();

  try {
    if (sessionIds.length === 0) {
      return { success: true, joinedBySessionId: {} };
    }

    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, errorCode: 'unauthorized' };

    const { data: rows, error } = await supabase
      .from('com_t_session_call_log')
      .select('session_id')
      .in('session_id', sessionIds)
      .eq('role', 'coach');

    if (error) {
      logger.error('liveSessionRoom:call_log_presence_failed', error.message, { ...ctx, userId: user.id, payload: { sessionIds } });
      return { success: false, errorCode: 'unexpected_error' };
    }

    const joinedBySessionId: Record<string, boolean> = {};
    for (const id of sessionIds) joinedBySessionId[id] = false;
    for (const row of rows ?? []) joinedBySessionId[row.session_id] = true;

    return { success: true, joinedBySessionId };
  } catch (err) {
    logger.error('liveSessionRoom:call_log_presence_unexpected', err instanceof Error ? err.message : 'Unknown error', ctx);
    return { success: false, errorCode: 'unexpected_error' };
  }
}

/**
 * ライブセッション通話への入室を記録する(record_session_call_join RPC呼び出し)。
 * 入室日時はRPC側でNOW()により確定するため、ここではsession_id/zoomSessionIdのみ渡す。
 */
export async function recordSessionCallJoinCore(sessionId: string, zoomSessionId: string | null): Promise<RecordCallJoinResult> {
  const ctx = await getLogContext();

  try {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, errorCode: 'unauthorized' };

    const { data, error } = await supabase.rpc('record_session_call_join', {
      p_session_id: sessionId,
      p_zoom_session_id: zoomSessionId,
    });

    if (error || !data) {
      logger.error('liveSessionRoom:record_call_join_failed', error?.message ?? 'No call_log_id returned', { ...ctx, userId: user.id, payload: { sessionId } });
      return { success: false, errorCode: 'forbidden' };
    }

    return { success: true, callLogId: data as string };
  } catch (err) {
    logger.error('liveSessionRoom:record_call_join_unexpected', err instanceof Error ? err.message : 'Unknown error', ctx);
    return { success: false, errorCode: 'unexpected_error' };
  }
}

/**
 * ライブセッション通話からの退室を記録する(record_session_call_leave RPC呼び出し)。
 * 明示的な退室ボタン・30分自動終了・ホスト強制終了検知・コンポーネントのアンマウント処理など、
 * 複数の経路から多重に呼ばれても安全な冪等操作（RPC側でleft_at IS NULLの行にのみ適用される）。
 */
export async function recordSessionCallLeaveCore(callLogId: string): Promise<{ success: boolean }> {
  const ctx = await getLogContext();

  try {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false };

    const { error } = await supabase.rpc('record_session_call_leave', { p_call_log_id: callLogId });
    if (error) {
      logger.error('liveSessionRoom:record_call_leave_failed', error.message, { ...ctx, userId: user.id, payload: { callLogId } });
      return { success: false };
    }

    return { success: true };
  } catch (err) {
    logger.error('liveSessionRoom:record_call_leave_unexpected', err instanceof Error ? err.message : 'Unknown error', ctx);
    return { success: false };
  }
}
