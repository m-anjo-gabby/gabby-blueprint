'use server';

import { createServerClient } from '../../supabase/server';
import { createLogger } from '../../logger';
import { getLogContext } from '../../logger/context';
import { DayOfWeek } from '@gabby/types/coachAvailability';
import {
  CoachBrowseItem,
  CreateMatchingRequestInput,
  CreateMatchingRequestResult,
  CancelMatchingRequestResult,
  ApproveMatchingRequestResult,
  RejectMatchingRequestResult,
  IncomingMatchingRequestItem,
  LiveSessionTicketSummary,
  MATCHING_REQUEST_STATUS,
  MatchingRequestErrorCode,
  SlotStatusItem,
} from '@gabby/types/matching';

const logger = createLogger('common');

function isValidTimeRange(startTime: string, endTime: string): boolean {
  return /^\d{2}:\d{2}$/.test(startTime) && /^\d{2}:\d{2}$/.test(endTime) && startTime < endTime;
}

/**
 * ログイン中の生徒が保有する、現在有効なライブセッションチケットの一覧を取得する（ポータル共通）
 * マッチング機能への遷移可否・週n回分の枠数の算定に使用する。
 */
export async function getMyLiveSessionTicketsCore(): Promise<
  { success: true; tickets: LiveSessionTicketSummary[] } | { success: false; errorCode: MatchingRequestErrorCode }
> {
  const ctx = await getLogContext();

  try {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, errorCode: 'unauthorized' };

    const { data: tickets, error: ticketError } = await supabase
      .from('com_t_user_session_ticket')
      .select('ticket_id, license_id, weekly_frequency, total_sessions, used_sessions')
      .eq('user_id', user.id);

    if (ticketError) {
      logger.error('matching:get_my_tickets_failed', ticketError.message, { ...ctx, userId: user.id });
      return { success: false, errorCode: 'unexpected_error' };
    }
    if (!tickets || tickets.length === 0) {
      return { success: true, tickets: [] };
    }

    const licenseIds = tickets.map((t) => t.license_id);
    const { data: licenses, error: licenseError } = await supabase
      .from('com_t_user_license')
      .select('license_id, status, end_date')
      .in('license_id', licenseIds);

    if (licenseError) {
      logger.error('matching:get_my_tickets_license_failed', licenseError.message, { ...ctx, userId: user.id });
      return { success: false, errorCode: 'unexpected_error' };
    }

    const now = new Date();
    const activeLicenseIds = new Set(
      (licenses ?? [])
        .filter((l) => l.status === 1 && new Date(l.end_date) >= now)
        .map((l) => l.license_id)
    );

    const activeTickets: LiveSessionTicketSummary[] = tickets
      .filter((t) => activeLicenseIds.has(t.license_id))
      .map((t) => ({
        ticket_id: t.ticket_id,
        weekly_frequency: t.weekly_frequency,
        total_sessions: t.total_sessions,
        used_sessions: t.used_sessions,
      }));

    return { success: true, tickets: activeTickets };
  } catch (err) {
    logger.error('matching:get_my_tickets_unexpected', err instanceof Error ? err.message : 'Unknown error', ctx);
    return { success: false, errorCode: 'unexpected_error' };
  }
}

/**
 * 指定チケットの、週n回分の各枠のマッチング状況を取得する（生徒向け。ポータル共通）
 */
export async function getMySlotStatusCore(
  ticketId: string
): Promise<{ success: true; slots: SlotStatusItem[] } | { success: false; errorCode: MatchingRequestErrorCode }> {
  const ctx = await getLogContext();

  try {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, errorCode: 'unauthorized' };

    const { data: ticket, error: ticketError } = await supabase
      .from('com_t_user_session_ticket')
      .select('ticket_id, weekly_frequency')
      .eq('ticket_id', ticketId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (ticketError) {
      logger.error('matching:get_slot_status_ticket_failed', ticketError.message, { ...ctx, userId: user.id });
      return { success: false, errorCode: 'unexpected_error' };
    }
    if (!ticket) {
      return { success: false, errorCode: 'not_eligible' };
    }

    const { data: schedules, error: scheduleError } = await supabase
      .from('com_m_lesson_schedule')
      .select('slot_no, coach_id, day_of_week, start_time, end_time, coach_timezone')
      .eq('ticket_id', ticketId)
      .eq('status', 1);

    if (scheduleError) {
      logger.error('matching:get_slot_status_schedule_failed', scheduleError.message, { ...ctx, userId: user.id });
      return { success: false, errorCode: 'unexpected_error' };
    }

    const { data: requests, error: requestError } = await supabase
      .from('com_t_matching_request')
      .select('request_id, slot_no, coach_id, status, requested_day_of_week, requested_start_time, requested_end_time, reject_reason, insert_date')
      .eq('ticket_id', ticketId)
      .order('insert_date', { ascending: false });

    if (requestError) {
      logger.error('matching:get_slot_status_request_failed', requestError.message, { ...ctx, userId: user.id });
      return { success: false, errorCode: 'unexpected_error' };
    }

    const coachIds = new Set<string>();
    (schedules ?? []).forEach((s) => coachIds.add(s.coach_id));
    (requests ?? []).forEach((r) => coachIds.add(r.coach_id));

    let coachNameById = new Map<string, string>();
    let coachTimezoneById = new Map<string, string>();
    if (coachIds.size > 0) {
      const { data: coaches } = await supabase
        .from('com_m_user')
        .select('id, user_name, timezone')
        .in('id', Array.from(coachIds));
      coachNameById = new Map((coaches ?? []).map((c) => [c.id, c.user_name ?? '']));
      coachTimezoneById = new Map((coaches ?? []).map((c) => [c.id, c.timezone ?? 'Asia/Tokyo']));
    }

    const scheduleBySlot = new Map((schedules ?? []).map((s) => [s.slot_no, s]));
    // requestsはinsert_date降順のため、最初に見つかったものが最新
    const pendingRequestBySlot = new Map<number, (typeof requests)[number]>();
    const latestRejectedBySlot = new Map<number, (typeof requests)[number]>();
    for (const r of requests ?? []) {
      if (r.status === MATCHING_REQUEST_STATUS.PENDING && !pendingRequestBySlot.has(r.slot_no)) {
        pendingRequestBySlot.set(r.slot_no, r);
      }
      if (r.status === MATCHING_REQUEST_STATUS.REJECTED && !latestRejectedBySlot.has(r.slot_no)) {
        latestRejectedBySlot.set(r.slot_no, r);
      }
    }

    const slots: SlotStatusItem[] = [];
    for (let slotNo = 1; slotNo <= ticket.weekly_frequency; slotNo++) {
      const schedule = scheduleBySlot.get(slotNo);
      if (schedule) {
        slots.push({
          slot_no: slotNo,
          status: 'matched',
          coach_id: schedule.coach_id,
          coach_name: coachNameById.get(schedule.coach_id) ?? null,
          day_of_week: schedule.day_of_week as DayOfWeek,
          start_time: schedule.start_time,
          end_time: schedule.end_time,
          coach_timezone: schedule.coach_timezone,
          request_id: null,
          reject_reason: null,
        });
        continue;
      }

      const pending = pendingRequestBySlot.get(slotNo);
      if (pending) {
        slots.push({
          slot_no: slotNo,
          status: 'pending',
          coach_id: pending.coach_id,
          coach_name: coachNameById.get(pending.coach_id) ?? null,
          day_of_week: pending.requested_day_of_week as DayOfWeek,
          start_time: pending.requested_start_time,
          end_time: pending.requested_end_time,
          coach_timezone: coachTimezoneById.get(pending.coach_id) ?? null,
          request_id: pending.request_id,
          reject_reason: null,
        });
        continue;
      }

      const rejected = latestRejectedBySlot.get(slotNo);
      slots.push({
        slot_no: slotNo,
        status: 'unmatched',
        coach_id: null,
        coach_name: null,
        day_of_week: null,
        start_time: null,
        end_time: null,
        coach_timezone: null,
        request_id: null,
        reject_reason: rejected?.reject_reason ?? null,
      });
    }

    return { success: true, slots };
  } catch (err) {
    logger.error('matching:get_slot_status_unexpected', err instanceof Error ? err.message : 'Unknown error', ctx);
    return { success: false, errorCode: 'unexpected_error' };
  }
}

/**
 * マッチング可能なコーチの一覧を取得する（生徒向け。ポータル共通）
 * zoom_meeting_url等の非公開項目は含めない。
 */
export async function getCoachBrowseListCore(): Promise<
  { success: true; coaches: CoachBrowseItem[] } | { success: false; errorCode: MatchingRequestErrorCode }
> {
  const ctx = await getLogContext();

  try {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, errorCode: 'unauthorized' };

    const { data: profiles, error: profileError } = await supabase
      .from('com_m_coach_profile')
      .select('user_id, country_code, teaching_years, introduction')
      .eq('delete_flg', '0');

    if (profileError) {
      logger.error('matching:get_coach_list_profile_failed', profileError.message, ctx);
      return { success: false, errorCode: 'unexpected_error' };
    }
    if (!profiles || profiles.length === 0) {
      return { success: true, coaches: [] };
    }

    const coachIds = profiles.map((p) => p.user_id);

    const [{ data: users, error: userError }, { data: availability, error: availabilityError }] = await Promise.all([
      supabase.from('com_m_user').select('id, user_name, icon_path, timezone').in('id', coachIds),
      supabase
        .from('com_m_coach_availability')
        .select('availability_id, coach_id, day_of_week, start_time, end_time')
        .in('coach_id', coachIds)
        .eq('delete_flg', '0'),
    ]);

    if (userError || availabilityError) {
      logger.error('matching:get_coach_list_join_failed', userError?.message ?? availabilityError?.message ?? 'unknown', ctx);
      return { success: false, errorCode: 'unexpected_error' };
    }

    const userById = new Map((users ?? []).map((u) => [u.id, u]));
    const availabilityByCoachId = new Map<string, typeof availability>();
    for (const slot of availability ?? []) {
      const list = availabilityByCoachId.get(slot.coach_id) ?? [];
      list.push(slot);
      availabilityByCoachId.set(slot.coach_id, list);
    }

    const coaches: CoachBrowseItem[] = profiles.map((p) => {
      const u = userById.get(p.user_id);
      return {
        user_id: p.user_id,
        user_name: u?.user_name ?? '(Unknown)',
        icon_path: u?.icon_path ?? null,
        timezone: u?.timezone ?? 'Asia/Tokyo',
        country_code: p.country_code,
        teaching_years: p.teaching_years,
        introduction: p.introduction,
        availability: (availabilityByCoachId.get(p.user_id) ?? []).map((a) => ({
          availability_id: a.availability_id,
          day_of_week: a.day_of_week as DayOfWeek,
          start_time: a.start_time,
          end_time: a.end_time,
        })),
      };
    });

    return { success: true, coaches };
  } catch (err) {
    logger.error('matching:get_coach_list_unexpected', err instanceof Error ? err.message : 'Unknown error', ctx);
    return { success: false, errorCode: 'unexpected_error' };
  }
}

/**
 * マッチングリクエストを作成する（生徒向け。ポータル共通）
 */
export async function createMatchingRequestCore(input: CreateMatchingRequestInput): Promise<CreateMatchingRequestResult> {
  const ctx = await getLogContext();

  try {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, errorCode: 'unauthorized' };

    if (
      input.day_of_week < 0 || input.day_of_week > 6 ||
      !isValidTimeRange(input.start_time, input.end_time) ||
      input.slot_no < 1
    ) {
      return { success: false, errorCode: 'invalid_input' };
    }

    const { data: ticket, error: ticketError } = await supabase
      .from('com_t_user_session_ticket')
      .select('ticket_id, weekly_frequency')
      .eq('ticket_id', input.ticket_id)
      .eq('user_id', user.id)
      .maybeSingle();

    if (ticketError) {
      logger.error('matching:create_request_ticket_check_failed', ticketError.message, { ...ctx, userId: user.id });
      return { success: false, errorCode: 'unexpected_error' };
    }
    if (!ticket || input.slot_no > ticket.weekly_frequency) {
      return { success: false, errorCode: 'not_eligible' };
    }

    // 希望時間帯がコーチの公開している空き時間内に収まっているか確認
    const { data: availabilityMatch } = await supabase
      .from('com_m_coach_availability')
      .select('availability_id')
      .eq('coach_id', input.coach_id)
      .eq('day_of_week', input.day_of_week)
      .eq('delete_flg', '0')
      .lte('start_time', `${input.start_time}:00`)
      .gte('end_time', `${input.end_time}:00`)
      .limit(1);

    if (!availabilityMatch || availabilityMatch.length === 0) {
      return { success: false, errorCode: 'invalid_input' };
    }

    const { data, error } = await supabase
      .from('com_t_matching_request')
      .insert({
        ticket_id: input.ticket_id,
        student_id: user.id,
        coach_id: input.coach_id,
        slot_no: input.slot_no,
        requested_day_of_week: input.day_of_week,
        requested_start_time: `${input.start_time}:00`,
        requested_end_time: `${input.end_time}:00`,
      })
      .select('*')
      .single();

    if (error || !data) {
      // 同一枠への重複リクエストはユニークインデックス(uq_matching_request_active_slot)違反(23505)として検出
      if (error?.code === '23505') {
        return { success: false, errorCode: 'slot_already_requested' };
      }
      logger.error('matching:create_request_insert_failed', error?.message ?? 'No row inserted', { ...ctx, userId: user.id });
      return { success: false, errorCode: 'db_insert_failed' };
    }

    logger.info('matching:create_request_success', 'Matching request created', { ...ctx, userId: user.id });
    return { success: true, request: data };
  } catch (err) {
    logger.error('matching:create_request_unexpected', err instanceof Error ? err.message : 'Unknown error', ctx);
    return { success: false, errorCode: 'unexpected_error' };
  }
}

/**
 * 承認待ちの自分のマッチングリクエストを取消す（生徒向け。ポータル共通）
 */
export async function cancelMatchingRequestCore(requestId: string): Promise<CancelMatchingRequestResult> {
  const ctx = await getLogContext();

  try {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, errorCode: 'unauthorized' };

    const { data, error } = await supabase
      .from('com_t_matching_request')
      .update({ status: MATCHING_REQUEST_STATUS.CANCELLED, update_date: new Date().toISOString() })
      .eq('request_id', requestId)
      .eq('student_id', user.id)
      .eq('status', MATCHING_REQUEST_STATUS.PENDING)
      .select('request_id')
      .maybeSingle();

    if (error) {
      logger.error('matching:cancel_request_failed', error.message, { ...ctx, userId: user.id, payload: { requestId } });
      return { success: false, errorCode: 'db_update_failed' };
    }
    if (!data) {
      return { success: false, errorCode: 'invalid_input' };
    }

    logger.info('matching:cancel_request_success', 'Matching request cancelled', { ...ctx, userId: user.id });
    return { success: true };
  } catch (err) {
    logger.error('matching:cancel_request_unexpected', err instanceof Error ? err.message : 'Unknown error', ctx);
    return { success: false, errorCode: 'unexpected_error' };
  }
}

/**
 * ログイン中コーチ宛の受信マッチングリクエスト一覧を取得する（ポータル共通）
 */
export async function getIncomingRequestsAsCoachCore(): Promise<
  { success: true; requests: IncomingMatchingRequestItem[] } | { success: false; errorCode: MatchingRequestErrorCode }
> {
  const ctx = await getLogContext();

  try {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, errorCode: 'unauthorized' };

    const { data: requests, error } = await supabase
      .from('com_t_matching_request')
      .select('*')
      .eq('coach_id', user.id)
      .order('insert_date', { ascending: false })
      .limit(100);

    if (error) {
      logger.error('matching:get_incoming_requests_failed', error.message, { ...ctx, userId: user.id });
      return { success: false, errorCode: 'unexpected_error' };
    }
    if (!requests || requests.length === 0) {
      return { success: true, requests: [] };
    }

    const studentIds = Array.from(new Set(requests.map((r) => r.student_id)));
    const { data: students } = await supabase.from('com_m_user').select('id, user_name').in('id', studentIds);
    const studentNameById = new Map((students ?? []).map((s) => [s.id, s.user_name ?? '(Unknown)']));

    const items: IncomingMatchingRequestItem[] = requests.map((r) => ({
      ...r,
      student_name: studentNameById.get(r.student_id) ?? '(Unknown)',
    }));

    return { success: true, requests: items };
  } catch (err) {
    logger.error('matching:get_incoming_requests_unexpected', err instanceof Error ? err.message : 'Unknown error', ctx);
    return { success: false, errorCode: 'unexpected_error' };
  }
}

/**
 * マッチングリクエストを承認する（コーチ向け。ポータル共通）
 * DB側の approve_matching_request RPC（SECURITY DEFINER）を呼び出す。
 * 承認と同時に com_m_lesson_schedule / com_t_session が自動生成される。
 */
export async function approveMatchingRequestCore(requestId: string): Promise<ApproveMatchingRequestResult> {
  const ctx = await getLogContext();

  try {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, errorCode: 'unauthorized' };

    const { data, error } = await supabase.rpc('approve_matching_request', { p_request_id: requestId });

    if (error || !data) {
      logger.error('matching:approve_request_failed', error?.message ?? 'No schedule_id returned', { ...ctx, userId: user.id, payload: { requestId } });
      return { success: false, errorCode: 'db_update_failed' };
    }

    logger.info('matching:approve_request_success', 'Matching request approved', { ...ctx, userId: user.id });
    return { success: true, scheduleId: data as string };
  } catch (err) {
    logger.error('matching:approve_request_unexpected', err instanceof Error ? err.message : 'Unknown error', ctx);
    return { success: false, errorCode: 'unexpected_error' };
  }
}

/**
 * マッチングリクエストを否認する（コーチ向け。ポータル共通）
 * DB側の reject_matching_request RPC（SECURITY DEFINER）を呼び出す。
 */
export async function rejectMatchingRequestCore(requestId: string, reason: string): Promise<RejectMatchingRequestResult> {
  const ctx = await getLogContext();

  try {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, errorCode: 'unauthorized' };

    if (!reason || reason.trim().length === 0) {
      return { success: false, errorCode: 'invalid_input' };
    }

    const { error } = await supabase.rpc('reject_matching_request', { p_request_id: requestId, p_reason: reason.trim() });

    if (error) {
      logger.error('matching:reject_request_failed', error.message, { ...ctx, userId: user.id, payload: { requestId } });
      return { success: false, errorCode: 'db_update_failed' };
    }

    logger.info('matching:reject_request_success', 'Matching request rejected', { ...ctx, userId: user.id });
    return { success: true };
  } catch (err) {
    logger.error('matching:reject_request_unexpected', err instanceof Error ? err.message : 'Unknown error', ctx);
    return { success: false, errorCode: 'unexpected_error' };
  }
}
