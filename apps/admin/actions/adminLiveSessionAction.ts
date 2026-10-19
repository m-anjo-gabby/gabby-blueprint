// apps/admin/actions/adminLiveSessionAction.ts
'use server';

import { getTranslations } from 'next-intl/server';
import { revalidatePath } from 'next/cache';
import { unstable_rethrow } from 'next/navigation';
import { reportingMonthRange } from '@gabby/lib/date/reporting';
import { createLogger } from '@gabby/lib/logger';
import { getLogContext } from '@gabby/lib/logger/context';
import { getErrorMessage } from '@gabby/lib/logger/errorMessage';
import { getSessionOutcomeEvidenceCore } from '@gabby/lib/session/actions/sessionActions';
import { createAdminClient } from '@gabby/lib/supabase/admin';
import { containsPattern } from '@gabby/lib/supabase/ilike';
import { createServerClient } from '@gabby/lib/supabase/server';
import { getTimezoneNameMap } from '@gabby/lib/timezone/timezoneNames';
import type { ActionResult } from '@gabby/types/action';
import {
  type AdminCoachSummary,
  type AdminContractSummary,
  type AdminScheduleSlotSummary,
  type AdminSessionActionResult,
  type AdminSessionListItem,
  type AdminSessionOutcomeHistoryEntry,
  type AdminSessionRecord,
  type AdminStudentSummary,
  type GetClientStudentsResult,
  type GetScheduleSlotsForTicketResult,
  type ReleaseLessonScheduleSlotResult,
} from '@gabby/types/adminLiveSession';
import type { ConductedVia, SessionOutcome, SessionOutcomeEvidence } from '@gabby/types/session';
import { USER_TYPES } from '@gabby/types/user';
import { requireAdminRole, SYSTEM_ADMIN_ONLY } from '@/lib/adminAuth';
import { toRange, type ListParams, type ListResult } from '@/lib/list';

const logger = createLogger('admin');

/**
 * 指定顧客配下の生徒一覧を取得する（ライブセッション管理画面の生徒選択用）
 */
export async function getClientStudents(clientId: string): Promise<GetClientStudentsResult> {
  await requireAdminRole(SYSTEM_ADMIN_ONLY);
  const ctx = await getLogContext();
  try {
    const supabase = createAdminClient();

    const { data, error } = await supabase
      .schema('private')
      .from('vw_user_list')
      .select('id, user_name, email')
      .eq('client_id', clientId)
      .eq('user_type', USER_TYPES.STUDENT)
      .order('user_name');

    if (error) {
      logger.error('liveSession:get_client_students_failed', error.message, {
        ...ctx,
        err: error,
        payload: { clientId },
      });
      return { success: false, errorCode: 'unexpected_error' };
    }

    const students: AdminStudentSummary[] = (data ?? [])
      .filter((u): u is { id: string; user_name: string; email: string } => !!u.id && !!u.email)
      .map((u) => ({ id: u.id, user_name: u.user_name ?? '(Unknown)', email: u.email }));

    return { success: true, students };
  } catch (err) {
    unstable_rethrow(err);
    logger.error('liveSession:get_client_students_unexpected', getErrorMessage(err), {
      ...ctx,
      err,
      payload: { clientId },
    });
    return { success: false, errorCode: 'unexpected_error' };
  }
}

/**
 * 指定生徒が保有するライブセッションチケット付き契約の一覧（現在有効・過去満了分の両方）を
 * 取得する（アドミン向け。コーチ側のgetStudentLiveSessionContractsCoreと同じ形だが、
 * 担当関係の確認は行わない＝アドミンは常に全件参照可能）。
 * contract_name/plan_name/total_sessions（com_m_contractに非正規化済み）・used_sessions（チケット側）を
 * 追加で持たせ、「対象の選択」セクションのプラン情報表示に使う。
 */
export async function getStudentLiveSessionContractsForAdmin(studentId: string): Promise<AdminContractSummary[]> {
  await requireAdminRole(SYSTEM_ADMIN_ONLY);
  const t = await getTranslations();
  const ctx = await getLogContext();
  try {
    const supabase = createAdminClient();

    const { data: tickets, error: ticketError } = await supabase
      .from('com_t_user_session_ticket')
      .select('ticket_id, license_id, contract_id, weekly_frequency, total_sessions, used_sessions')
      .eq('user_id', studentId);

    if (ticketError) {
      logger.error('liveSession:get_student_contracts_ticket_failed', ticketError.message, {
        ...ctx,
        err: ticketError,
        payload: { studentId },
      });
      return [];
    }
    if (!tickets || tickets.length === 0) return [];

    const [{ data: licenses, error: licenseError }, { data: contracts, error: contractError }] = await Promise.all([
      supabase
        .from('com_t_user_license')
        .select('license_id, status, start_date, end_date')
        .in(
          'license_id',
          tickets.map((ticket) => ticket.license_id),
        ),
      supabase
        .from('com_m_contract')
        .select('contract_id, contract_name, plan_name')
        .in(
          'contract_id',
          tickets.map((ticket) => ticket.contract_id),
        ),
    ]);

    if (licenseError) {
      logger.error('liveSession:get_student_contracts_license_failed', licenseError.message, {
        ...ctx,
        err: licenseError,
        payload: { studentId },
      });
      return [];
    }
    if (contractError) {
      logger.error('liveSession:get_student_contracts_contract_failed', contractError.message, {
        ...ctx,
        err: contractError,
        payload: { studentId },
      });
      return [];
    }

    const licenseById = new Map((licenses ?? []).map((l) => [l.license_id, l]));
    const contractById = new Map((contracts ?? []).map((c) => [c.contract_id, c]));
    const now = new Date();

    return tickets
      .map((ticket) => {
        const license = licenseById.get(ticket.license_id);
        if (!license) return null;
        const isCurrent =
          license.status === 1 && new Date(license.start_date) <= now && now <= new Date(license.end_date);
        return {
          ticket_id: ticket.ticket_id,
          license_id: ticket.license_id,
          start_date: license.start_date,
          end_date: license.end_date,
          is_current: isCurrent,
          weekly_frequency: ticket.weekly_frequency,
          contract_name: contractById.get(ticket.contract_id)?.contract_name ?? `(${t('common.fallback.contract')})`,
          plan_name: contractById.get(ticket.contract_id)?.plan_name ?? `(${t('common.fallback.plan')})`,
          total_sessions: ticket.total_sessions,
          used_sessions: ticket.used_sessions,
        };
      })
      .filter((c): c is AdminContractSummary => c !== null)
      .sort((a, b) => b.start_date.localeCompare(a.start_date));
  } catch (err) {
    unstable_rethrow(err);
    logger.error('liveSession:get_student_contracts_unexpected', getErrorMessage(err), {
      ...ctx,
      err,
      payload: { studentId },
    });
    return [];
  }
}

/**
 * 指定契約(チケット)の定期スケジュール枠一覧を取得する（アドミン向け）。
 * 稼働中(1)・一時停止(0)・終了済み(9)を問わず全件返す。
 */
export async function getScheduleSlotsForTicket(ticketId: string): Promise<GetScheduleSlotsForTicketResult> {
  await requireAdminRole(SYSTEM_ADMIN_ONLY);
  const ctx = await getLogContext();
  try {
    const supabase = createAdminClient();

    const { data: schedules, error } = await supabase
      .from('com_m_lesson_schedule')
      .select(
        'schedule_id, ticket_id, slot_no, day_of_week, start_time, end_time, schedule_timezone, coach_id, status, target_sessions',
      )
      .eq('ticket_id', ticketId)
      .order('slot_no', { ascending: true });

    if (error) {
      logger.error('liveSession:get_schedule_slots_failed', error.message, {
        ...ctx,
        err: error,
        payload: { ticketId },
      });
      return { success: false, errorCode: 'unexpected_error' };
    }

    const rows = schedules ?? [];
    const coachIds = Array.from(new Set(rows.map((s) => s.coach_id)));
    let nameById = new Map<string, string>();
    if (coachIds.length > 0) {
      const { data: coaches } = await supabase.from('com_m_user').select('id, user_name').in('id', coachIds);
      nameById = new Map((coaches ?? []).map((c) => [c.id, c.user_name ?? '(Unknown)']));
    }

    // 稼働中の枠のみ、未割当チケット枠数(fn_schedule_shortfall)を合わせて取得する
    // （「セッションを予約」ボタンの表示可否に使用）
    const [shortfallResults, timezoneNames] = await Promise.all([
      Promise.all(
        rows.map((s) =>
          s.status === 1
            ? supabase.rpc('fn_schedule_shortfall', { p_schedule_id: s.schedule_id }).single()
            : Promise.resolve(null),
        ),
      ),
      getTimezoneNameMap(),
    ]);

    const slots: AdminScheduleSlotSummary[] = rows.map((s, i) => {
      const shortfallRow = shortfallResults[i]?.data as { shortfall: number } | null | undefined;
      return {
        ...s,
        schedule_timezone_names: timezoneNames.get(s.schedule_timezone) ?? null,
        coach_name: nameById.get(s.coach_id) ?? '(Unknown)',
        shortfall: shortfallRow?.shortfall ?? 0,
      };
    });

    return { success: true, slots };
  } catch (err) {
    unstable_rethrow(err);
    logger.error('liveSession:get_schedule_slots_unexpected', getErrorMessage(err), {
      ...ctx,
      err,
      payload: { ticketId },
    });
    return { success: false, errorCode: 'unexpected_error' };
  }
}

/**
 * 指定契約(チケット)のセッション一覧を取得する（アドミン向け、担当コーチを問わず全件）。
 */
export async function getSessionsForTicket(ticketId: string): Promise<AdminSessionListItem[]> {
  await requireAdminRole(SYSTEM_ADMIN_ONLY);
  const ctx = await getLogContext();
  try {
    const supabase = createAdminClient();

    const { data: sessions, error } = await supabase
      .from('com_t_session')
      .select(
        'session_id, schedule_id, start_datetime, end_datetime, status, completion_result, cancel_category, rescheduled_from, cancel_reason, status_note, coach_id, conducted_via, outcome_mismatch',
      )
      .eq('ticket_id', ticketId)
      .order('start_datetime', { ascending: false });

    if (error) {
      logger.error('liveSession:get_sessions_for_ticket_failed', error.message, {
        ...ctx,
        err: error,
        payload: { ticketId },
      });
      return [];
    }

    const rows = sessions ?? [];
    const coachIds = Array.from(new Set(rows.map((s) => s.coach_id)));
    let nameById = new Map<string, string>();
    if (coachIds.length > 0) {
      const { data: coaches } = await supabase.from('com_m_user').select('id, user_name').in('id', coachIds);
      nameById = new Map((coaches ?? []).map((c) => [c.id, c.user_name ?? '(Unknown)']));
    }

    return rows.map((s) => ({ ...s, coach_name: nameById.get(s.coach_id) ?? '(Unknown)' }));
  } catch (err) {
    unstable_rethrow(err);
    logger.error('liveSession:get_sessions_for_ticket_unexpected', getErrorMessage(err), {
      ...ctx,
      err,
      payload: { ticketId },
    });
    return [];
  }
}

/**
 * コーチ交代: 指定スケジュール枠を終了させ、紐づく承認済みマッチングリクエストを終了、
 * 未実施の未来のセッションをキャンセルする。DELETEは一切行わないため、実施済みの
 * セッション結果・チャット・宿題は変更されない。
 */
export async function releaseLessonScheduleSlot(scheduleId: string): Promise<ReleaseLessonScheduleSlotResult> {
  await requireAdminRole(SYSTEM_ADMIN_ONLY);
  const t = await getTranslations();
  const ctx = await getLogContext();
  try {
    const supabase = createAdminClient();

    const { error } = await supabase.rpc('release_lesson_schedule_slot', { p_schedule_id: scheduleId });

    if (error) {
      logger.error('liveSession:release_schedule_slot_failed', error.message, {
        ...ctx,
        err: error,
        payload: { scheduleId },
      });
      return { success: false, errorCode: 'unexpected_error', message: t('common.errors.unexpected') };
    }

    logger.info('liveSession:release_schedule_slot_success', 'Lesson schedule slot released', {
      ...ctx,
      payload: { scheduleId },
    });

    revalidatePath('/live-sessions');
    return { success: true };
  } catch (err) {
    unstable_rethrow(err);
    logger.error('liveSession:release_schedule_slot_unexpected', getErrorMessage(err), {
      ...ctx,
      err,
      payload: { scheduleId },
    });
    return { success: false, errorCode: 'unexpected_error', message: t('common.errors.unexpected') };
  }
}

/**
 * コーチ一覧を取得する（アドミンの直接マッチング画面のコーチ選択用）
 */
export async function getCoachesForMatching(): Promise<AdminCoachSummary[]> {
  await requireAdminRole(SYSTEM_ADMIN_ONLY);
  const ctx = await getLogContext();
  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from('com_m_user')
      .select('id, user_name, timezone')
      .eq('user_type', USER_TYPES.COACH)
      .order('user_name');

    if (error) {
      logger.error('liveSession:get_coaches_failed', error.message, { ...ctx, err: error });
      return [];
    }

    return (data ?? []).map((c) => ({ id: c.id, user_name: c.user_name ?? '(Unknown)', timezone: c.timezone }));
  } catch (err) {
    unstable_rethrow(err);
    logger.error('liveSession:get_coaches_unexpected', getErrorMessage(err), {
      ...ctx,
      err,
    });
    return [];
  }
}

/**
 * 以下、生徒・コーチに代わって行う代理操作。実装上の重要な注意点として、これらのRPCは
 * 内部で get_jwt_user_type()/auth.uid() を見て認可・分岐しているため、他の関数群と異なり
 * service_role(createAdminClient)ではなく、管理者自身の認証済みセッションに紐づく
 * クライアント(createServerClient)で呼び出す必要がある（service_roleにはJWTが無く、
 * auth.uid()/get_jwt_user_type()が両方NULLになり認可チェックに失敗するため）。
 */

/**
 * セッションのキャンセル（アドミン代理操作）。
 * チケット返還の可否は12時間ルール等を適用せず、管理者が明示的に指定する
 * （cancel_session側のp_admin_refund_ticket。詳細はDDLコメント参照）。
 */
export async function cancelSessionAsAdmin(
  sessionId: string,
  refundTicket: boolean,
  reason?: string,
): Promise<AdminSessionActionResult> {
  await requireAdminRole(SYSTEM_ADMIN_ONLY);
  const t = await getTranslations();
  const ctx = await getLogContext();
  try {
    const supabase = await createServerClient();
    const { error } = await supabase.rpc('cancel_session', {
      p_session_id: sessionId,
      p_reason: reason || null,
      p_proposed_slots: null,
      p_admin_refund_ticket: refundTicket,
      p_as_admin: true,
    });

    if (error) {
      logger.error('liveSession:cancel_as_admin_failed', error.message, {
        ...ctx,
        err: error,
        payload: { sessionId, refundTicket },
      });
      return { success: false, message: t('common.errors.unexpected') };
    }

    revalidatePath('/live-sessions');
    return { success: true };
  } catch (err) {
    unstable_rethrow(err);
    logger.error('liveSession:cancel_as_admin_unexpected', getErrorMessage(err), {
      ...ctx,
      err,
      payload: { sessionId },
    });
    return { success: false, message: t('common.errors.unexpected') };
  }
}

/**
 * 未消化チケットの新規予約（アドミン代理操作）。生徒向けの新規予約は承認制になった
 * （create_session_booking_request+approve_slot_proposalの2ステップ）が、
 * アドミンは既に関係者間で調整済みの内容を即時反映すればよいため、管理者専用の
 * admin_book_session_direct RPCを使う（承認ステップを挟まず即座にセッション行を作る）。
 *
 * 日時の変更は、生徒・コーチと同じく「キャンセル＋予約」の2操作で行う（管理者専用の日時変更の RPC は持たない）。
 * 日時を変更したい場合は、
 * cancelSessionAsAdmin（返還あり）でチケットを未割当に戻してから、本関数で改めて
 * 予約するという「キャンセル＋予約」の2操作に統一する（生徒・コーチと同じ操作の型に揃え、
 * 管理者専用の特殊経路を極力減らす）。
 */
export async function bookMakeupSessionAsAdmin(
  scheduleId: string,
  startIso: string,
  endIso: string,
): Promise<AdminSessionActionResult> {
  await requireAdminRole(SYSTEM_ADMIN_ONLY);
  const t = await getTranslations();
  const ctx = await getLogContext();
  try {
    const supabase = await createServerClient();
    const { error } = await supabase.rpc('admin_book_session_direct', {
      p_schedule_id: scheduleId,
      p_start_datetime: startIso,
      p_end_datetime: endIso,
    });

    if (error) {
      logger.error('liveSession:book_makeup_as_admin_failed', error.message, {
        ...ctx,
        err: error,
        payload: { scheduleId, startIso, endIso },
      });
      return { success: false, message: t('common.errors.unexpected') };
    }

    revalidatePath('/live-sessions');
    return { success: true };
  } catch (err) {
    unstable_rethrow(err);
    logger.error('liveSession:book_makeup_as_admin_unexpected', getErrorMessage(err), {
      ...ctx,
      err,
      payload: { scheduleId },
    });
    return { success: false, message: t('common.errors.unexpected') };
  }
}

/**
 * 生徒とコーチの直接マッチング（アドミン代理操作）。生徒のリクエスト・コーチの承認を
 * 省略し、admin_match_student_with_coach RPCで即座に成立させる（予約=セッション一括生成まで行う）。
 */
export async function matchStudentWithCoachAsAdmin(params: {
  ticketId: string;
  coachId: string;
  slotNo: number;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
}): Promise<AdminSessionActionResult> {
  await requireAdminRole(SYSTEM_ADMIN_ONLY);
  const t = await getTranslations();
  const ctx = await getLogContext();
  try {
    const supabase = await createServerClient();
    const { error } = await supabase.rpc('admin_match_student_with_coach', {
      p_ticket_id: params.ticketId,
      p_coach_id: params.coachId,
      p_slot_no: params.slotNo,
      p_day_of_week: params.dayOfWeek,
      p_start_time: params.startTime,
      p_end_time: params.endTime,
    });

    if (error) {
      logger.error('liveSession:admin_match_failed', error.message, { ...ctx, err: error, payload: params });
      if (error.code === '23505') {
        return { success: false, message: t('liveSessions.errors.slotTaken') };
      }
      // 直接マッチングは予約できる回数の割合の基準を適用しない（重なる回は飛ばして作る）。1回も予約できない場合だけ失敗する
      if (error.message?.includes('NO_REMAINING_SESSIONS')) {
        return {
          success: false,
          message: t('liveSessions.errors.usedUpBeforeCoachChange'),
        };
      }
      if (error.message?.includes('NO_BOOKABLE_SESSION')) {
        return {
          success: false,
          message: t('liveSessions.errors.noBookableSessions'),
        };
      }
      return { success: false, message: t('common.errors.unexpected') };
    }

    revalidatePath('/live-sessions');
    return { success: true };
  } catch (err) {
    unstable_rethrow(err);
    logger.error('liveSession:admin_match_unexpected', getErrorMessage(err), {
      ...ctx,
      err,
      payload: params,
    });
    return { success: false, message: t('common.errors.unexpected') };
  }
}

/**
 * 定期スケジュール枠のtarget_sessions個別引き上げ（アドミン代理操作）。
 * total_sessions（契約全体のセッション数）は変更しない、あくまで正当な理由がある
 * 追加予約の例外措置。fn_generate_sessions_for_schedule()は呼ばない
 * （同関数は「この呼び出しで新規作成した行数」しか数えないため、既存生成済み分を
 * 考慮できず再実行すると過剰生成してしまう。target_sessions引き上げ後は
 * fn_schedule_shortfall()が自動的にshortfallを検知し、既存の「セッションを予約」/
 * 「直接マッチング」ボタンから管理者が個別に日時を指定して追加予約する）。
 * 理由(reason)は必須。DB側に履歴テーブルは持たないため、説明責任の担保として
 * ここでログに残す。
 */
export async function adjustTargetSessionsAsAdmin(
  scheduleId: string,
  newTargetSessions: number,
  reason: string,
): Promise<AdminSessionActionResult> {
  await requireAdminRole(SYSTEM_ADMIN_ONLY);
  const t = await getTranslations();
  const ctx = await getLogContext();
  try {
    const supabase = await createServerClient();
    const { error } = await supabase.rpc('admin_adjust_schedule_target_sessions', {
      p_schedule_id: scheduleId,
      p_new_target_sessions: newTargetSessions,
      p_reason: reason,
    });

    if (error) {
      logger.error('liveSession:adjust_target_sessions_failed', error.message, {
        ...ctx,
        err: error,
        payload: { scheduleId, newTargetSessions, reason },
      });
      return { success: false, message: t('common.errors.unexpected') };
    }

    logger.info('liveSession:adjust_target_sessions_success', 'Schedule target_sessions adjusted', {
      ...ctx,
      payload: { scheduleId, newTargetSessions, reason },
    });

    revalidatePath('/live-sessions');
    return { success: true };
  } catch (err) {
    unstable_rethrow(err);
    logger.error('liveSession:adjust_target_sessions_unexpected', getErrorMessage(err), {
      ...ctx,
      err,
      payload: { scheduleId, newTargetSessions, reason },
    });
    return { success: false, message: t('common.errors.unexpected') };
  }
}

/**
 * 以下、ライブセッションの実施結果の確認・修正。
 * 結果の修正（admin_correct_session_outcome）・推定の取得（get_session_outcome_evidence）・実施記録の一覧
 * （admin_get_session_records）は fn_assert_actor_or_admin で管理者のJWTを見るため、上の代理操作と同じく
 * createServerClient で呼ぶ。
 */

/** 入退室ログからの実施結果の推定と根拠（結果の修正ダイアログを開いた時に取得する） */
export async function getSessionOutcomeEvidenceAsAdmin(
  sessionId: string,
): Promise<ActionResult<{ evidence: SessionOutcomeEvidence }>> {
  await requireAdminRole(SYSTEM_ADMIN_ONLY);
  const result = await getSessionOutcomeEvidenceCore(sessionId);
  if (!result.success) {
    const ctx = await getLogContext();
    logger.error('liveSession:get_outcome_evidence_failed', result.errorCode, { ...ctx, payload: { sessionId } });
    return { success: false, message: result.errorCode };
  }
  return { success: true, evidence: result.evidence };
}

/** 実施結果の記録・修正の履歴（新しい順。結果の修正ダイアログを開いた時に取得する） */
export async function getSessionOutcomeHistory(sessionId: string): Promise<AdminSessionOutcomeHistoryEntry[]> {
  await requireAdminRole(SYSTEM_ADMIN_ONLY);
  const ctx = await getLogContext();
  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from('com_t_session_outcome_history')
      .select('history_id, action, outcome, conducted_via, ticket_action, reason, performed_by, performed_at')
      .eq('session_id', sessionId)
      .order('performed_at', { ascending: false });

    if (error) {
      logger.error('liveSession:get_outcome_history_failed', error.message, {
        ...ctx,
        err: error,
        payload: { sessionId },
      });
      return [];
    }

    const rows = data ?? [];
    const userIds = Array.from(new Set(rows.map((r) => r.performed_by).filter((id): id is string => !!id)));
    let nameById = new Map<string, string>();
    if (userIds.length > 0) {
      const { data: users } = await supabase.from('com_m_user').select('id, user_name').in('id', userIds);
      nameById = new Map((users ?? []).map((u) => [u.id, u.user_name ?? '(Unknown)']));
    }

    return rows.map((r) => ({
      history_id: r.history_id,
      action: r.action,
      outcome: r.outcome,
      conducted_via: r.conducted_via,
      ticket_action: r.ticket_action,
      reason: r.reason,
      performed_by_name: r.performed_by ? (nameById.get(r.performed_by) ?? null) : null,
      performed_at: r.performed_at,
    }));
  } catch (err) {
    unstable_rethrow(err);
    logger.error('liveSession:get_outcome_history_unexpected', getErrorMessage(err), {
      ...ctx,
      err,
      payload: { sessionId },
    });
    return [];
  }
}

/**
 * 実施結果の修正（アドミン）。チケットの消化・返還の差分はRPC側で反映し、履歴を残す。
 * 生徒・コーチへの通知は送らない。
 */
export async function correctSessionOutcomeAsAdmin(
  sessionId: string,
  outcome: SessionOutcome,
  conductedVia: ConductedVia | null,
  reason: string,
): Promise<AdminSessionActionResult> {
  await requireAdminRole(SYSTEM_ADMIN_ONLY);
  const t = await getTranslations();
  const ctx = await getLogContext();
  try {
    const supabase = await createServerClient();
    const { error } = await supabase.rpc('admin_correct_session_outcome', {
      p_session_id: sessionId,
      p_outcome: outcome,
      p_conducted_via: conductedVia,
      p_reason: reason.trim(),
    });

    if (error) {
      logger.error('liveSession:correct_outcome_failed', error.message, {
        ...ctx,
        err: error,
        payload: { sessionId, outcome, conductedVia },
      });
      return { success: false, message: t('common.errors.unexpected') };
    }

    logger.info('liveSession:correct_outcome_success', 'Session outcome corrected', {
      ...ctx,
      payload: { sessionId, outcome, conductedVia },
    });
    revalidatePath('/live-sessions', 'layout');
    return { success: true };
  } catch (err) {
    unstable_rethrow(err);
    logger.error('liveSession:correct_outcome_unexpected', getErrorMessage(err), {
      ...ctx,
      err,
      payload: { sessionId },
    });
    return { success: false, message: t('common.errors.unexpected') };
  }
}

const SESSION_RECORD_RESULTS = [
  'unrecorded',
  'completed',
  'left_early',
  'no_show',
  'coach_absent',
  'technical',
] as const;
const SESSION_RECORD_VIAS = ['app', 'external'] as const;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

type SessionRecordRpcRow = AdminSessionRecord & { total_count: number };

/**
 * 「実施記録」一覧（/live-sessions/records）。絞り込みのクエリ名は records/_lib/list.ts の
 * SESSION_RECORD_LIST_FILTERS（month = 開始月 YYYY-MM（日本時間）、coach = コーチID、result = 結果、
 * via = 実施方法、review = '1' で要確認だけ）。不正な値は「すべて」として扱う。
 */
export async function getSessionRecordList(
  params: ListParams<'month' | 'coach' | 'result' | 'via' | 'review'>,
): Promise<ListResult<AdminSessionRecord>> {
  await requireAdminRole(SYSTEM_ADMIN_ONLY);
  const ctx = await getLogContext();
  const { q, filters } = params;
  const range = MONTH_PATTERN.test(filters.month) ? reportingMonthRange(filters.month) : null;
  const result = (SESSION_RECORD_RESULTS as readonly string[]).includes(filters.result) ? filters.result : null;
  const via = (SESSION_RECORD_VIAS as readonly string[]).includes(filters.via) ? filters.via : null;
  const [from, to] = toRange(params);

  const supabase = await createServerClient();
  const { data, error } = await supabase.rpc('admin_get_session_records', {
    p_from: range?.from ?? null,
    p_to: range?.to ?? null,
    p_coach_id: UUID_PATTERN.test(filters.coach) ? filters.coach : null,
    p_result: result,
    p_via: via,
    p_review_only: filters.review === '1',
    p_name_pattern: q ? containsPattern(q) : null,
    p_limit: to - from + 1,
    p_offset: from,
  });

  if (error) {
    logger.error('liveSession:get_session_records_failed', error.message, {
      ...ctx,
      err: error,
      payload: { filters, from },
    });
    throw new Error(error.message);
  }

  const rows = (data ?? []) as SessionRecordRpcRow[];
  return {
    rows: rows.map((row) => {
      const { total_count, ...record } = row;
      void total_count;
      return record;
    }),
    totalCount: rows[0]?.total_count ?? 0,
  };
}
