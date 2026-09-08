// apps/admin/actions/adminLiveSessionAction.ts
'use server';

import { createAdminClient } from '@gabby/lib/supabase/admin';
import { revalidatePath } from 'next/cache';
import { createLogger } from '@gabby/lib/logger';
import { getLogContext } from '@gabby/lib/logger/context';
import {
  AdminStudentSummary,
  AdminScheduleSlotSummary,
  GetClientStudentsResult,
  GetScheduleSlotsForTicketResult,
  ReleaseLessonScheduleSlotResult,
} from '@gabby/types/adminLiveSession';
import { StudentLiveSessionContractSummary, CoachSessionListItem } from '@gabby/types/coachStudent';

const logger = createLogger('admin');

/**
 * 指定顧客配下の生徒一覧を取得する（ライブセッション管理画面の生徒選択用）
 */
export async function getClientStudents(clientId: string): Promise<GetClientStudentsResult> {
  const ctx = await getLogContext();
  try {
    const supabase = createAdminClient();

    const { data, error } = await supabase
      .schema('private')
      .from('vw_user_list')
      .select('id, user_name, email')
      .eq('client_id', clientId)
      .eq('user_type', 1)
      .order('user_name');

    if (error) {
      logger.error('liveSession:get_client_students_failed', error.message, { ...ctx, payload: { clientId } });
      return { success: false, errorCode: 'unexpected_error' };
    }

    const students: AdminStudentSummary[] = (data ?? [])
      .filter((u): u is { id: string; user_name: string; email: string } => !!u.id && !!u.email)
      .map((u) => ({ id: u.id, user_name: u.user_name ?? '(Unknown)', email: u.email }));

    return { success: true, students };
  } catch (err) {
    logger.error('liveSession:get_client_students_unexpected', err instanceof Error ? err.message : 'Unknown error', { ...ctx, payload: { clientId } });
    return { success: false, errorCode: 'unexpected_error' };
  }
}

/**
 * 指定生徒が保有するライブセッションチケット付き契約の一覧（現在有効・過去満了分の両方）を
 * 取得する（アドミン向け。コーチ側のgetStudentLiveSessionContractsCoreと同じ形だが、
 * 担当関係の確認は行わない＝アドミンは常に全件参照可能）。
 */
export async function getStudentLiveSessionContractsForAdmin(studentId: string): Promise<StudentLiveSessionContractSummary[]> {
  const ctx = await getLogContext();
  try {
    const supabase = createAdminClient();

    const { data: tickets, error: ticketError } = await supabase
      .from('com_t_user_session_ticket')
      .select('ticket_id, license_id')
      .eq('user_id', studentId);

    if (ticketError) {
      logger.error('liveSession:get_student_contracts_ticket_failed', ticketError.message, { ...ctx, payload: { studentId } });
      return [];
    }
    if (!tickets || tickets.length === 0) return [];

    const { data: licenses, error: licenseError } = await supabase
      .from('com_t_user_license')
      .select('license_id, status, start_date, end_date')
      .in('license_id', tickets.map((t) => t.license_id));

    if (licenseError) {
      logger.error('liveSession:get_student_contracts_license_failed', licenseError.message, { ...ctx, payload: { studentId } });
      return [];
    }

    const licenseById = new Map((licenses ?? []).map((l) => [l.license_id, l]));
    const now = new Date();

    return tickets
      .map((t) => {
        const license = licenseById.get(t.license_id);
        if (!license) return null;
        const isCurrent = license.status === 1 && new Date(license.start_date) <= now && now <= new Date(license.end_date);
        return {
          ticket_id: t.ticket_id,
          license_id: t.license_id,
          start_date: license.start_date,
          end_date: license.end_date,
          is_current: isCurrent,
        };
      })
      .filter((c): c is StudentLiveSessionContractSummary => c !== null)
      .sort((a, b) => b.start_date.localeCompare(a.start_date));
  } catch (err) {
    logger.error('liveSession:get_student_contracts_unexpected', err instanceof Error ? err.message : 'Unknown error', { ...ctx, payload: { studentId } });
    return [];
  }
}

/**
 * 指定契約(チケット)の定期スケジュール枠一覧を取得する（アドミン向け）。
 * 稼働中(1)・一時停止(0)・終了済み(9)を問わず全件返す。
 */
export async function getScheduleSlotsForTicket(ticketId: string): Promise<GetScheduleSlotsForTicketResult> {
  const ctx = await getLogContext();
  try {
    const supabase = createAdminClient();

    const { data: schedules, error } = await supabase
      .from('com_m_lesson_schedule')
      .select('schedule_id, ticket_id, slot_no, day_of_week, start_time, end_time, coach_id, status')
      .eq('ticket_id', ticketId)
      .order('slot_no', { ascending: true });

    if (error) {
      logger.error('liveSession:get_schedule_slots_failed', error.message, { ...ctx, payload: { ticketId } });
      return { success: false, errorCode: 'unexpected_error' };
    }

    const rows = schedules ?? [];
    const coachIds = Array.from(new Set(rows.map((s) => s.coach_id)));
    let nameById = new Map<string, string>();
    if (coachIds.length > 0) {
      const { data: coaches } = await supabase.from('com_m_user').select('id, user_name').in('id', coachIds);
      nameById = new Map((coaches ?? []).map((c) => [c.id, c.user_name ?? '(Unknown)']));
    }

    const slots: AdminScheduleSlotSummary[] = rows.map((s) => ({
      ...s,
      coach_name: nameById.get(s.coach_id) ?? '(Unknown)',
    }));

    return { success: true, slots };
  } catch (err) {
    logger.error('liveSession:get_schedule_slots_unexpected', err instanceof Error ? err.message : 'Unknown error', { ...ctx, payload: { ticketId } });
    return { success: false, errorCode: 'unexpected_error' };
  }
}

/**
 * 指定契約(チケット)のセッション一覧を取得する（アドミン向け、担当コーチを問わず全件）。
 */
export async function getSessionsForTicket(ticketId: string): Promise<CoachSessionListItem[]> {
  const ctx = await getLogContext();
  try {
    const supabase = createAdminClient();

    const { data: sessions, error } = await supabase
      .from('com_t_session')
      .select('session_id, schedule_id, start_datetime, end_datetime, status, rescheduled_from, cancel_reason, status_note, coach_id')
      .eq('ticket_id', ticketId)
      .order('start_datetime', { ascending: false });

    if (error) {
      logger.error('liveSession:get_sessions_for_ticket_failed', error.message, { ...ctx, payload: { ticketId } });
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
    logger.error('liveSession:get_sessions_for_ticket_unexpected', err instanceof Error ? err.message : 'Unknown error', { ...ctx, payload: { ticketId } });
    return [];
  }
}

/**
 * コーチ交代: 指定スケジュール枠を終了させ、紐づく承認済みマッチングリクエストを終了、
 * 未実施の未来のセッションをキャンセルする。DELETEは一切行わないため、実施済みの
 * セッション結果・チャット・宿題は変更されない。
 */
export async function releaseLessonScheduleSlot(scheduleId: string): Promise<ReleaseLessonScheduleSlotResult> {
  const ctx = await getLogContext();
  try {
    const supabase = createAdminClient();

    const { error } = await supabase.rpc('release_lesson_schedule_slot', { p_schedule_id: scheduleId });

    if (error) {
      logger.error('liveSession:release_schedule_slot_failed', error.message, { ...ctx, payload: { scheduleId } });
      return { success: false, errorCode: 'unexpected_error', message: error.message };
    }

    logger.info('liveSession:release_schedule_slot_success', 'Lesson schedule slot released', { ...ctx, payload: { scheduleId } });

    revalidatePath('/live-sessions');
    return { success: true };
  } catch (err) {
    logger.error('liveSession:release_schedule_slot_unexpected', err instanceof Error ? err.message : 'Unknown error', { ...ctx, payload: { scheduleId } });
    return { success: false, errorCode: 'unexpected_error', message: '予期せぬエラーが発生しました' };
  }
}
