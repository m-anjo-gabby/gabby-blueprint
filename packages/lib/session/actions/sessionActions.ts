'use server';

import { createServerClient } from '../../supabase/server';
import { createLogger } from '../../logger';
import { getLogContext } from '../../logger/context';
import {
  BookMakeupSessionResult,
  CancelSessionResult,
  FinalizeSessionResult,
  GetSessionResultSummaryResult,
  RescheduleSessionResult,
  ResolveStaleSessionResult,
  SESSION_STATUS,
  SessionActionErrorCode,
  SessionCallLogEntry,
  SessionChatMessageEntry,
  SessionListItem,
  SessionStatus,
} from '@gabby/types/session';

const logger = createLogger('common');

/**
 * RPCから返るPostgresエラーメッセージを、画面向けのエラーコードへ大まかに分類する。
 * cancel_session / reschedule_session / finalize_session / resolve_stale_session はいずれも
 * RAISE EXCEPTIONのメッセージ文言を一定のパターンに統一しているため、文字列一致で判定する。
 */
function classifyRpcError(message: string | undefined): SessionActionErrorCode {
  if (!message) return 'unexpected_error';
  if (message.includes('not authorized')) return 'unauthorized';
  if (message.includes('not found')) return 'not_found';
  if (message.includes('reason required')) return 'reason_required';
  if (message.includes('invalid resolved status')) return 'invalid_input';
  if (
    message.includes('not scheduled')
    || message.includes('already started')
    || message.includes('within 12 hours of its start time')
    || message.includes('must be in the future')
    || message.includes('cannot resolve a session before its end time')
    || message.includes('is not active')
  ) {
    return 'not_actionable';
  }
  if (message.includes('outside coach availability') || message.includes('blocked by coach exception')) {
    return 'slot_unavailable';
  }
  if (message.includes('already has a session')) return 'schedule_conflict';
  if (message.includes('no unassigned ticket available')) return 'no_ticket_available';
  return 'unexpected_error';
}

type SessionRow = {
  session_id: string;
  schedule_id: string;
  student_id: string;
  coach_id: string;
  start_datetime: string;
  end_datetime: string;
  status: SessionStatus;
  rescheduled_from: string | null;
  cancel_reason: string | null;
  status_note: string | null;
};

/**
 * com_t_sessionの生行から、相手方(counterpart)の名前を解決してSessionListItem[]を組み立てる。
 * getMySessionsCore/getMyUpcomingSessionsCore/getMyPastSessionsCoreで共通利用する。
 */
async function toSessionListItems(
  supabase: Awaited<ReturnType<typeof createServerClient>>,
  userId: string,
  rows: SessionRow[]
): Promise<SessionListItem[]> {
  if (rows.length === 0) return [];

  const counterpartIds = new Set<string>();
  for (const s of rows) {
    counterpartIds.add(s.student_id === userId ? s.coach_id : s.student_id);
  }

  const { data: counterparts } = await supabase
    .from('com_m_user')
    .select('id, user_name')
    .in('id', Array.from(counterpartIds));
  const nameById = new Map((counterparts ?? []).map((c) => [c.id, c.user_name ?? '(Unknown)']));

  return rows.map((s) => {
    const isStudent = s.student_id === userId;
    const counterpartId = isStudent ? s.coach_id : s.student_id;
    return {
      session_id: s.session_id,
      schedule_id: s.schedule_id,
      start_datetime: s.start_datetime,
      end_datetime: s.end_datetime,
      status: s.status,
      viewer_role: isStudent ? 'student' : 'coach',
      counterpart_id: counterpartId,
      counterpart_name: nameById.get(counterpartId) ?? '(Unknown)',
      rescheduled_from: s.rescheduled_from,
      cancel_reason: s.cancel_reason,
      status_note: s.status_note,
    };
  });
}

const SESSION_ROW_COLUMNS = 'session_id, schedule_id, student_id, coach_id, start_datetime, end_datetime, status, rescheduled_from, cancel_reason, status_note';

/**
 * ログイン中ユーザー（生徒/コーチいずれか）の、指定期間内のセッション一覧を取得する（ポータル共通）
 * RLSにより student_id = auth.uid() OR coach_id = auth.uid() の行のみ自動的に返るため、
 * 呼び出し側でロールを意識する必要はない。
 */
export async function getMySessionsCore(
  startIso: string,
  endIso: string
): Promise<{ success: true; sessions: SessionListItem[] } | { success: false; errorCode: SessionActionErrorCode }> {
  const ctx = await getLogContext();

  try {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, errorCode: 'unauthorized' };

    const { data: sessions, error } = await supabase
      .from('com_t_session')
      .select(SESSION_ROW_COLUMNS)
      .gte('start_datetime', startIso)
      .lt('start_datetime', endIso)
      .order('start_datetime', { ascending: true });

    if (error) {
      logger.error('session:get_my_sessions_failed', error.message, { ...ctx, userId: user.id });
      return { success: false, errorCode: 'unexpected_error' };
    }

    return { success: true, sessions: await toSessionListItems(supabase, user.id, sessions ?? []) };
  } catch (err) {
    logger.error('session:get_my_sessions_unexpected', err instanceof Error ? err.message : 'Unknown error', ctx);
    return { success: false, errorCode: 'unexpected_error' };
  }
}

/**
 * ログイン中ユーザーの、今後予定されている(status=scheduledかつ終了予定時刻が未来の)セッション一覧を
 * 開始時刻の昇順で取得する（ライブセッションハブのUpcomingタブ、ダッシュボードの次回レッスン表示用）。
 * 契約期間分まとめて事前生成されたセッションが多い場合でも直近の予定が漏れないよう、昇順+上限件数で取得する。
 */
export async function getMyUpcomingSessionsCore(
  limit = 20
): Promise<{ success: true; sessions: SessionListItem[] } | { success: false; errorCode: SessionActionErrorCode }> {
  const ctx = await getLogContext();

  try {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, errorCode: 'unauthorized' };

    const { data: sessions, error } = await supabase
      .from('com_t_session')
      .select(SESSION_ROW_COLUMNS)
      .eq('status', SESSION_STATUS.SCHEDULED)
      .gt('end_datetime', new Date().toISOString())
      .order('start_datetime', { ascending: true })
      .limit(limit);

    if (error) {
      logger.error('session:get_my_upcoming_sessions_failed', error.message, { ...ctx, userId: user.id });
      return { success: false, errorCode: 'unexpected_error' };
    }

    return { success: true, sessions: await toSessionListItems(supabase, user.id, sessions ?? []) };
  } catch (err) {
    logger.error('session:get_my_upcoming_sessions_unexpected', err instanceof Error ? err.message : 'Unknown error', ctx);
    return { success: false, errorCode: 'unexpected_error' };
  }
}

/**
 * ログイン中ユーザーの、確定済みの過去のセッション（完了・キャンセル・振替済み等、scheduled以外）を
 * 開始時刻の降順で取得する（ライブセッションハブの契約別スケジュール/変更履歴表示用）。
 * ticketIdを指定すると、その契約(チケット)分のみに絞り込む（契約切替用。ticket:licenseは1:1のため
 * ticket_idで契約単位の絞り込みができる）。
 */
export async function getMyPastSessionsCore(
  ticketId?: string,
  limit = 100
): Promise<{ success: true; sessions: SessionListItem[] } | { success: false; errorCode: SessionActionErrorCode }> {
  const ctx = await getLogContext();

  try {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, errorCode: 'unauthorized' };

    let query = supabase
      .from('com_t_session')
      .select(SESSION_ROW_COLUMNS)
      .neq('status', SESSION_STATUS.SCHEDULED)
      .order('start_datetime', { ascending: false })
      .limit(limit);
    if (ticketId) {
      query = query.eq('ticket_id', ticketId);
    }
    const { data: sessions, error } = await query;

    if (error) {
      logger.error('session:get_my_past_sessions_failed', error.message, { ...ctx, userId: user.id });
      return { success: false, errorCode: 'unexpected_error' };
    }

    return { success: true, sessions: await toSessionListItems(supabase, user.id, sessions ?? []) };
  } catch (err) {
    logger.error('session:get_my_past_sessions_unexpected', err instanceof Error ? err.message : 'Unknown error', ctx);
    return { success: false, errorCode: 'unexpected_error' };
  }
}

/**
 * 個別セッションをキャンセルする（生徒・コーチ共通。ポータル共通）
 * DB側の cancel_session RPC（SECURITY DEFINER）を呼び出す。
 */
export async function cancelSessionCore(sessionId: string, reason?: string): Promise<CancelSessionResult> {
  const ctx = await getLogContext();

  try {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, errorCode: 'unauthorized' };

    const { error } = await supabase.rpc('cancel_session', {
      p_session_id: sessionId,
      p_reason: reason?.trim() || null,
    });

    if (error) {
      logger.error('session:cancel_failed', error.message, { ...ctx, userId: user.id, payload: { sessionId } });
      return { success: false, errorCode: classifyRpcError(error.message) };
    }

    logger.info('session:cancel_success', 'Session cancelled', { ...ctx, userId: user.id });
    return { success: true };
  } catch (err) {
    logger.error('session:cancel_unexpected', err instanceof Error ? err.message : 'Unknown error', ctx);
    return { success: false, errorCode: 'unexpected_error' };
  }
}

/**
 * 個別セッションを振替/日時変更する（生徒・コーチ共通。ポータル共通）
 * DB側の reschedule_session RPC（SECURITY DEFINER）を呼び出す。
 * newDate / newStartTime はコーチのローカル時刻として扱われ、絶対時刻への変換・
 * 空き時間/重複チェックはすべてRPC側で行う。
 */
export async function rescheduleSessionCore(
  sessionId: string,
  newDate: string, // "YYYY-MM-DD"
  newStartTime: string, // "HH:MM"
  reason?: string
): Promise<RescheduleSessionResult> {
  const ctx = await getLogContext();

  try {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, errorCode: 'unauthorized' };

    if (!/^\d{4}-\d{2}-\d{2}$/.test(newDate) || !/^\d{2}:\d{2}$/.test(newStartTime)) {
      return { success: false, errorCode: 'invalid_input' };
    }

    const { data, error } = await supabase.rpc('reschedule_session', {
      p_session_id: sessionId,
      p_new_date: newDate,
      p_new_start_time: `${newStartTime}:00`,
      p_reason: reason?.trim() || null,
    });

    if (error || !data) {
      logger.error('session:reschedule_failed', error?.message ?? 'No session_id returned', { ...ctx, userId: user.id, payload: { sessionId } });
      return { success: false, errorCode: classifyRpcError(error?.message) };
    }

    logger.info('session:reschedule_success', 'Session rescheduled', { ...ctx, userId: user.id });
    return { success: true, newSessionId: data as string };
  } catch (err) {
    logger.error('session:reschedule_unexpected', err instanceof Error ? err.message : 'Unknown error', ctx);
    return { success: false, errorCode: 'unexpected_error' };
  }
}

/**
 * 未割当チケット（キャンセルによりticket_refunded=trueとなり未消化に戻った枠）を、
 * その定期スケジュール(コマ)の担当コーチ限定で新規に予約する（生徒・コーチ共通）。
 * DB側の book_makeup_session RPC（SECURITY DEFINER）を呼び出す。コーチ選択は行わず、
 * スケジュール(コマ)IDで対象コーチを一意に確定させる。
 */
export async function bookMakeupSessionCore(
  scheduleId: string,
  newDate: string, // "YYYY-MM-DD"
  newStartTime: string // "HH:MM"
): Promise<BookMakeupSessionResult> {
  const ctx = await getLogContext();

  try {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, errorCode: 'unauthorized' };

    if (!/^\d{4}-\d{2}-\d{2}$/.test(newDate) || !/^\d{2}:\d{2}$/.test(newStartTime)) {
      return { success: false, errorCode: 'invalid_input' };
    }

    const { data, error } = await supabase.rpc('book_makeup_session', {
      p_schedule_id: scheduleId,
      p_new_date: newDate,
      p_new_start_time: `${newStartTime}:00`,
    });

    if (error || !data) {
      logger.error('session:book_makeup_failed', error?.message ?? 'No session_id returned', { ...ctx, userId: user.id, payload: { scheduleId } });
      return { success: false, errorCode: classifyRpcError(error?.message) };
    }

    logger.info('session:book_makeup_success', 'Makeup session booked', { ...ctx, userId: user.id, payload: { scheduleId } });
    return { success: true, newSessionId: data as string };
  } catch (err) {
    logger.error('session:book_makeup_unexpected', err instanceof Error ? err.message : 'Unknown error', ctx);
    return { success: false, errorCode: 'unexpected_error' };
  }
}

/**
 * 「レッスン終了」ボタン用。コーチ・生徒双方の入退室ログの重複時間からセッション実施結果
 * （completed/early_ended/no_show）を自動判定する finalize_session RPC（SECURITY DEFINER）を呼び出す。
 * 20分未満かつ生徒の入室記録がある場合はreasonが必須で、未指定だとRPCが'reason required'で
 * 失敗する（errorCode: 'reason_required'）。呼び出し側はこれを検知して理由入力ダイアログを表示し、
 * reason付きで再実行すること。
 */
export async function finalizeSessionCore(sessionId: string, reason?: string): Promise<FinalizeSessionResult> {
  const ctx = await getLogContext();

  try {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, errorCode: 'unauthorized' };

    const { data, error } = await supabase.rpc('finalize_session', {
      p_session_id: sessionId,
      p_early_end_reason: reason?.trim() || null,
    });

    if (error || !data || data.length === 0) {
      logger.error('session:finalize_failed', error?.message ?? 'No row returned', { ...ctx, userId: user.id, payload: { sessionId } });
      return { success: false, errorCode: classifyRpcError(error?.message) };
    }

    const row = data[0] as { new_status: number; overlap_seconds: number };
    logger.info('session:finalize_success', 'Session finalized', { ...ctx, userId: user.id, payload: { sessionId, status: row.new_status } });
    return { success: true, status: row.new_status as SessionStatus, overlapSeconds: row.overlap_seconds };
  } catch (err) {
    logger.error('session:finalize_unexpected', err instanceof Error ? err.message : 'Unknown error', ctx);
    return { success: false, errorCode: 'unexpected_error' };
  }
}

/**
 * 予定終了時刻を過ぎてもscheduledのまま残ったセッションを、コーチが理由付きで手動解決する
 * （resolve_stale_session RPC呼び出し）。アプリ外Zoom等で代替実施したケース等の唯一の解決経路。
 */
export async function resolveStaleSessionCore(
  sessionId: string,
  resolvedStatus: number,
  reason: string
): Promise<ResolveStaleSessionResult> {
  const ctx = await getLogContext();

  try {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, errorCode: 'unauthorized' };

    const trimmed = reason.trim();
    if (!trimmed) {
      return { success: false, errorCode: 'invalid_input' };
    }

    const { error } = await supabase.rpc('resolve_stale_session', {
      p_session_id: sessionId,
      p_resolved_status: resolvedStatus,
      p_reason: trimmed,
    });

    if (error) {
      logger.error('session:resolve_stale_failed', error.message, { ...ctx, userId: user.id, payload: { sessionId, resolvedStatus } });
      return { success: false, errorCode: classifyRpcError(error.message) };
    }

    logger.info('session:resolve_stale_success', 'Stale session resolved', { ...ctx, userId: user.id, payload: { sessionId, resolvedStatus } });
    return { success: true };
  } catch (err) {
    logger.error('session:resolve_stale_unexpected', err instanceof Error ? err.message : 'Unknown error', ctx);
    return { success: false, errorCode: 'unexpected_error' };
  }
}

/**
 * レッスン結果画面用。対象セッションの基本情報＋入退室ログ一覧（コーチ・生徒共通、RLSにより
 * 本人が関わるセッションのみ取得可能）をまとめて取得する。
 */
export async function getSessionResultSummaryCore(sessionId: string): Promise<GetSessionResultSummaryResult> {
  const ctx = await getLogContext();

  try {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, errorCode: 'unauthorized' };

    const { data: session, error: sessionError } = await supabase
      .from('com_t_session')
      .select('session_id, student_id, coach_id, start_datetime, end_datetime, status, status_note')
      .eq('session_id', sessionId)
      .maybeSingle();

    if (sessionError) {
      logger.error('session:get_result_summary_failed', sessionError.message, { ...ctx, userId: user.id, payload: { sessionId } });
      return { success: false, errorCode: 'unexpected_error' };
    }
    if (!session) {
      return { success: false, errorCode: 'not_found' };
    }

    const isCoach = session.coach_id === user.id;
    const counterpartId = isCoach ? session.student_id : session.coach_id;

    const [{ data: counterpart }, { data: callLogRows, error: callLogError }, { data: chatRows, error: chatError }] = await Promise.all([
      supabase.from('com_m_user').select('user_name').eq('id', counterpartId).maybeSingle(),
      supabase
        .from('com_t_session_call_log')
        .select('call_log_id, role, joined_at, left_at')
        .eq('session_id', sessionId)
        .order('joined_at', { ascending: true }),
      supabase
        .from('com_t_session_chat')
        .select('chat_id, sender_role, message, created_at')
        .eq('session_id', sessionId)
        .order('created_at', { ascending: true }),
    ]);

    if (callLogError) {
      logger.error('session:get_result_summary_call_log_failed', callLogError.message, { ...ctx, userId: user.id, payload: { sessionId } });
      return { success: false, errorCode: 'unexpected_error' };
    }
    if (chatError) {
      logger.error('session:get_result_summary_chat_failed', chatError.message, { ...ctx, userId: user.id, payload: { sessionId } });
      return { success: false, errorCode: 'unexpected_error' };
    }

    const callLog: SessionCallLogEntry[] = (callLogRows ?? []).map((r) => ({
      call_log_id: r.call_log_id,
      role: r.role,
      joined_at: r.joined_at,
      left_at: r.left_at,
    }));

    const chatLog: SessionChatMessageEntry[] = (chatRows ?? []).map((r) => ({
      chat_id: r.chat_id,
      sender_role: r.sender_role,
      message: r.message,
      created_at: r.created_at,
    }));

    return {
      success: true,
      session: {
        session_id: session.session_id,
        start_datetime: session.start_datetime,
        end_datetime: session.end_datetime,
        status: session.status,
        status_note: session.status_note,
        counterpart_name: counterpart?.user_name ?? '(Unknown)',
        call_log: callLog,
        chat_log: chatLog,
      },
    };
  } catch (err) {
    logger.error('session:get_result_summary_unexpected', err instanceof Error ? err.message : 'Unknown error', ctx);
    return { success: false, errorCode: 'unexpected_error' };
  }
}
