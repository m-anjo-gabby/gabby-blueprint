'use server';

import { createServerClient } from '../../supabase/server';
import { createLogger } from '../../logger';
import { getLogContext } from '../../logger/context';
import {
  CancelSessionResult,
  RescheduleSessionResult,
  SessionActionErrorCode,
  SessionListItem,
} from '@gabby/types/session';

const logger = createLogger('common');

/**
 * RPCから返るPostgresエラーメッセージを、画面向けのエラーコードへ大まかに分類する。
 * cancel_session / reschedule_session はいずれもRAISE EXCEPTIONのメッセージ文言を
 * 一定のパターンに統一しているため、文字列一致で判定する。
 */
function classifyRpcError(message: string | undefined): SessionActionErrorCode {
  if (!message) return 'unexpected_error';
  if (message.includes('not authorized')) return 'unauthorized';
  if (message.includes('not found')) return 'not_found';
  if (message.includes('not scheduled') || message.includes('already started') || message.includes('must be in the future')) {
    return 'not_actionable';
  }
  if (message.includes('outside coach availability') || message.includes('blocked by coach exception')) {
    return 'slot_unavailable';
  }
  if (message.includes('already has a session')) return 'schedule_conflict';
  return 'unexpected_error';
}

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
      .select('session_id, schedule_id, student_id, coach_id, start_datetime, end_datetime, status, rescheduled_from, cancel_reason')
      .gte('start_datetime', startIso)
      .lt('start_datetime', endIso)
      .order('start_datetime', { ascending: true });

    if (error) {
      logger.error('session:get_my_sessions_failed', error.message, { ...ctx, userId: user.id });
      return { success: false, errorCode: 'unexpected_error' };
    }
    if (!sessions || sessions.length === 0) {
      return { success: true, sessions: [] };
    }

    const counterpartIds = new Set<string>();
    for (const s of sessions) {
      counterpartIds.add(s.student_id === user.id ? s.coach_id : s.student_id);
    }

    const { data: counterparts } = await supabase
      .from('com_m_user')
      .select('id, user_name')
      .in('id', Array.from(counterpartIds));
    const nameById = new Map((counterparts ?? []).map((c) => [c.id, c.user_name ?? '(Unknown)']));

    const items: SessionListItem[] = sessions.map((s) => {
      const isStudent = s.student_id === user.id;
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
      };
    });

    return { success: true, sessions: items };
  } catch (err) {
    logger.error('session:get_my_sessions_unexpected', err instanceof Error ? err.message : 'Unknown error', ctx);
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
