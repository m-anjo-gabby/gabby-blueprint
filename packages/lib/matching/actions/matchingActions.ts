'use server';

import { createServerClient } from '../../supabase/server';
import { createAdminClient } from '../../supabase/admin';
import { createLogger } from '../../logger';
import { getLogContext } from '../../logger/context';
import { DayOfWeek } from '@gabby/types/coachAvailability';
import {
  BookableTicketSlot,
  CoachBrowseItem,
  CreateMatchingRequestInput,
  CreateMatchingRequestResult,
  WithdrawMatchingRequestResult,
  ApproveMatchingRequestResult,
  GetMatchingSlotOptionsResult,
  GetMyBookableTicketsResult,
  GetMyLiveSessionContractsResult,
  GetMyLiveSessionOverviewResult,
  RejectMatchingRequestResult,
  IncomingMatchingRequestItem,
  LiveSessionContractSummary,
  LiveSessionTicketSummary,
  MATCHING_REQUEST_STATUS,
  MatchingRequestErrorCode,
  MatchingSlotAvailability,
  MatchingSlotOption,
  SlotStatusItem,
} from '@gabby/types/matching';
import { SESSION_STATUS } from '@gabby/types/session';
import { getAuthUser } from '@gabby/lib/supabase/authUser';
import { getFirstLiveSessionOccurrence, getLessonEndTime } from '../../date/date';

const logger = createLogger('common');

function isValidTimeRange(startTime: string, endTime: string): boolean {
  return /^\d{2}:\d{2}$/.test(startTime) && /^\d{2}:\d{2}$/.test(endTime) && startTime < endTime;
}

type ScheduleShortfallRow = { expected_sessions: number; actual_sessions: number; shortfall: number };

type SlotOptionRow = MatchingSlotAvailability & { day_of_week: number; start_time: string };

/** get_matching_slot_options（生徒の現地の曜日・時刻ごとの予約できる回数）を呼ぶ。開始時刻は "HH:MM" で返す */
async function fetchMatchingSlotOptions(
  supabase: Awaited<ReturnType<typeof createServerClient>>,
  ticketId: string,
  coachId: string,
  slotNo: number,
  candidates: { day_of_week: DayOfWeek; start_time: string }[]
) {
  const { data, error } = await supabase.rpc('get_matching_slot_options', {
    p_ticket_id: ticketId,
    p_coach_id: coachId,
    p_slot_no: slotNo,
    p_days: candidates.map((c) => c.day_of_week),
    p_start_times: candidates.map((c) => `${c.start_time}:00`),
    p_end_times: candidates.map((c) => `${getLessonEndTime(c.start_time)}:00`),
  });
  if (error) return { error };
  const options: MatchingSlotOption[] = ((data ?? []) as SlotOptionRow[]).map((row) => ({
    day_of_week: row.day_of_week as DayOfWeek,
    start_time: row.start_time.slice(0, 5),
    target_sessions: row.target_sessions,
    possible_sessions: row.possible_sessions,
    bookable_sessions: row.bookable_sessions,
    required_sessions: row.required_sessions,
    is_acceptable: row.is_acceptable,
  }));
  return { options };
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
    const user = await getAuthUser();
    if (!user) return { success: false, errorCode: 'unauthorized' };

    const { data: tickets, error: ticketError } = await supabase
      .from('com_t_user_session_ticket')
      .select('ticket_id, license_id, weekly_frequency, total_sessions, used_sessions')
      .eq('user_id', user.id);

    if (ticketError) {
      logger.error('matching:get_my_tickets_failed', ticketError.message, { ...ctx, err: ticketError, userId: user.id });
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
      logger.error('matching:get_my_tickets_license_failed', licenseError.message, { ...ctx, err: licenseError, userId: user.id });
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
    logger.error('matching:get_my_tickets_unexpected', err instanceof Error ? err.message : 'Unknown error', { ...ctx, err });
    return { success: false, errorCode: 'unexpected_error' };
  }
}

/**
 * ログイン中の生徒が保有する、ライブセッションチケット付き契約の一覧（現在有効・過去満了分の両方）を
 * 取得する（ライブセッションハブの契約切替用）。getMyLiveSessionTicketsCoreと異なり、
 * 満了済み(status<>1 または end_date<now)の契約も含めて全件返す。
 */
export async function getMyLiveSessionContractsCore(): Promise<GetMyLiveSessionContractsResult> {
  const ctx = await getLogContext();

  try {
    const supabase = await createServerClient();
    const user = await getAuthUser();
    if (!user) return { success: false, errorCode: 'unauthorized' };

    const { data: tickets, error: ticketError } = await supabase
      .from('com_t_user_session_ticket')
      .select('ticket_id, license_id')
      .eq('user_id', user.id);

    if (ticketError) {
      logger.error('matching:get_my_contracts_ticket_failed', ticketError.message, { ...ctx, err: ticketError, userId: user.id });
      return { success: false, errorCode: 'unexpected_error' };
    }
    if (!tickets || tickets.length === 0) {
      return { success: true, contracts: [] };
    }

    const { data: licenses, error: licenseError } = await supabase
      .from('com_t_user_license')
      .select('license_id, status, start_date, end_date, com_m_contract!inner(plan_name)')
      .in('license_id', tickets.map((t) => t.license_id));

    if (licenseError) {
      logger.error('matching:get_my_contracts_license_failed', licenseError.message, { ...ctx, err: licenseError, userId: user.id });
      return { success: false, errorCode: 'unexpected_error' };
    }

    const licenseById = new Map((licenses ?? []).map((l) => [l.license_id, l]));
    const now = new Date();

    const contracts: LiveSessionContractSummary[] = tickets
      .map((t) => {
        const license = licenseById.get(t.license_id);
        if (!license) return null;
        const isActive = license.status === 1 && now <= new Date(license.end_date);
        const isCurrent = isActive && new Date(license.start_date) <= now;
        return {
          ticket_id: t.ticket_id,
          license_id: t.license_id,
          // 多対一の結合のため実体は1件のオブジェクト（型生成なしのクライアントでは配列として推論される）
          plan_name: ([] as { plan_name: string }[]).concat(license.com_m_contract)[0]?.plan_name ?? '',
          start_date: license.start_date,
          end_date: license.end_date,
          is_current: isCurrent,
          is_active: isActive,
        };
      })
      .filter((c): c is LiveSessionContractSummary => c !== null)
      .sort((a, b) => b.start_date.localeCompare(a.start_date));

    return { success: true, contracts };
  } catch (err) {
    logger.error('matching:get_my_contracts_unexpected', err instanceof Error ? err.message : 'Unknown error', { ...ctx, err });
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
    const user = await getAuthUser();
    if (!user) return { success: false, errorCode: 'unauthorized' };

    const { data: ticket, error: ticketError } = await supabase
      .from('com_t_user_session_ticket')
      .select('ticket_id, weekly_frequency')
      .eq('ticket_id', ticketId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (ticketError) {
      logger.error('matching:get_slot_status_ticket_failed', ticketError.message, { ...ctx, err: ticketError, userId: user.id });
      return { success: false, errorCode: 'unexpected_error' };
    }
    if (!ticket) {
      return { success: false, errorCode: 'not_eligible' };
    }

    const { data: schedules, error: scheduleError } = await supabase
      .from('com_m_lesson_schedule')
      .select('slot_no, coach_id, day_of_week, start_time, end_time, schedule_timezone')
      .eq('ticket_id', ticketId)
      .eq('status', 1);

    if (scheduleError) {
      logger.error('matching:get_slot_status_schedule_failed', scheduleError.message, { ...ctx, err: scheduleError, userId: user.id });
      return { success: false, errorCode: 'unexpected_error' };
    }

    const { data: requests, error: requestError } = await supabase
      .from('com_t_matching_request')
      .select('request_id, slot_no, coach_id, status, requested_day_of_week, requested_start_time, requested_end_time, requested_timezone, reject_reason, expires_at, insert_date')
      .eq('ticket_id', ticketId)
      .order('insert_date', { ascending: false });

    if (requestError) {
      logger.error('matching:get_slot_status_request_failed', requestError.message, { ...ctx, err: requestError, userId: user.id });
      return { success: false, errorCode: 'unexpected_error' };
    }

    const coachIds = new Set<string>();
    (schedules ?? []).forEach((s) => coachIds.add(s.coach_id));
    (requests ?? []).forEach((r) => coachIds.add(r.coach_id));

    let coachNameById = new Map<string, string>();
    if (coachIds.size > 0) {
      const { data: coaches } = await supabase
        .from('com_m_user')
        .select('id, user_name')
        .in('id', Array.from(coachIds));
      coachNameById = new Map((coaches ?? []).map((c) => [c.id, c.user_name ?? '']));
    }

    const scheduleBySlot = new Map((schedules ?? []).map((s) => [s.slot_no, s]));
    // requestsはinsert_date降順のため、最初に見つかったものが最新。
    // 回答期限を過ぎた承認待ちは、期限切れの処理（毎分）を待たずに期限切れとして扱う
    const nowIso = new Date().toISOString();
    const isExpired = (r: { status: number; expires_at: string | null }) =>
      r.status === MATCHING_REQUEST_STATUS.EXPIRED ||
      (r.status === MATCHING_REQUEST_STATUS.PENDING && r.expires_at !== null && r.expires_at <= nowIso);
    const pendingRequestBySlot = new Map<number, (typeof requests)[number]>();
    const latestClosedBySlot = new Map<number, (typeof requests)[number]>();
    for (const r of requests ?? []) {
      if (r.status === MATCHING_REQUEST_STATUS.PENDING && !isExpired(r) && !pendingRequestBySlot.has(r.slot_no)) {
        pendingRequestBySlot.set(r.slot_no, r);
      }
      // 否認・期限切れのうち最新のもの（再リクエストを促す表示用）
      if ((r.status === MATCHING_REQUEST_STATUS.REJECTED || isExpired(r)) && !latestClosedBySlot.has(r.slot_no)) {
        latestClosedBySlot.set(r.slot_no, r);
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
          schedule_timezone: schedule.schedule_timezone,
          request_id: null,
          expires_at: null,
          reject_reason: null,
          last_request_expired: false,
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
          schedule_timezone: pending.requested_timezone,
          request_id: pending.request_id,
          expires_at: pending.expires_at,
          reject_reason: null,
          last_request_expired: false,
        });
        continue;
      }

      const closed = latestClosedBySlot.get(slotNo);
      slots.push({
        slot_no: slotNo,
        status: 'unmatched',
        coach_id: null,
        coach_name: null,
        day_of_week: null,
        start_time: null,
        end_time: null,
        schedule_timezone: null,
        request_id: null,
        expires_at: null,
        reject_reason: closed?.status === MATCHING_REQUEST_STATUS.REJECTED ? closed.reject_reason : null,
        last_request_expired: !!closed && isExpired(closed),
      });
    }

    return { success: true, slots };
  } catch (err) {
    logger.error('matching:get_slot_status_unexpected', err instanceof Error ? err.message : 'Unknown error', { ...ctx, err });
    return { success: false, errorCode: 'unexpected_error' };
  }
}

/**
 * 指定チケット(契約)のセッション回数の内訳と、コマごとのコーチ選択状況を取得する
 * （生徒向け。ライブセッションハブの「契約の状況」表示用。ポータル共通）。
 * 未予約数はcreate_session_booking_request RPCの予約可否判定と同じfn_schedule_shortfall()で算出し、
 * コーチ未選択のコマの回数は承認時(fn_commit_matching_schedule)と同じ均等割りで見積もる。
 */
export async function getMyLiveSessionOverviewCore(ticketId: string): Promise<GetMyLiveSessionOverviewResult> {
  const ctx = await getLogContext();

  try {
    const supabase = await createServerClient();
    const user = await getAuthUser();
    if (!user) return { success: false, errorCode: 'unauthorized' };

    const { data: ticket, error: ticketError } = await supabase
      .from('com_t_user_session_ticket')
      .select('ticket_id, weekly_frequency, total_sessions')
      .eq('ticket_id', ticketId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (ticketError) {
      logger.error('matching:get_overview_ticket_failed', ticketError.message, { ...ctx, err: ticketError, userId: user.id });
      return { success: false, errorCode: 'unexpected_error' };
    }
    if (!ticket) return { success: false, errorCode: 'not_eligible' };

    const [slotResult, { data: sessions, error: sessionError }, { data: schedules, error: scheduleError }] = await Promise.all([
      getMySlotStatusCore(ticketId),
      supabase.from('com_t_session').select('status, ticket_refunded').eq('ticket_id', ticketId),
      supabase.from('com_m_lesson_schedule').select('schedule_id').eq('ticket_id', ticketId).eq('status', 1),
    ]);

    if (!slotResult.success) return slotResult;
    if (sessionError || scheduleError) {
      logger.error('matching:get_overview_failed', sessionError?.message ?? scheduleError?.message ?? 'unknown', { ...ctx, err: sessionError, userId: user.id });
      return { success: false, errorCode: 'unexpected_error' };
    }

    const shortfallResults = await Promise.all(
      (schedules ?? []).map((schedule) =>
        supabase.rpc('fn_schedule_shortfall', { p_schedule_id: schedule.schedule_id }).single()
      )
    );
    const unbookedCount = shortfallResults.reduce(
      (sum, { data }) => sum + ((data as ScheduleShortfallRow | null)?.shortfall ?? 0),
      0
    );

    // コーチ未選択のコマは承認時にtotal_sessions/weekly_frequencyを均等割りし、余りをslot_no昇順に配分する
    const baseTarget = Math.floor(ticket.total_sessions / ticket.weekly_frequency);
    const remainder = ticket.total_sessions % ticket.weekly_frequency;
    const unassignedCount = slotResult.slots
      .filter((slot) => slot.status !== 'matched')
      .reduce((sum, slot) => sum + baseTarget + (slot.slot_no <= remainder ? 1 : 0), 0);

    const rows = sessions ?? [];
    return {
      success: true,
      overview: {
        ticket_id: ticket.ticket_id,
        weekly_frequency: ticket.weekly_frequency,
        total_sessions: ticket.total_sessions,
        completed_count: rows.filter((s) => s.status === SESSION_STATUS.COMPLETED).length,
        scheduled_count: rows.filter((s) => s.status === SESSION_STATUS.SCHEDULED).length,
        forfeited_count: rows.filter((s) => s.status === SESSION_STATUS.CANCELLED && s.ticket_refunded === false).length,
        unbooked_count: unbookedCount,
        unassigned_count: unassignedCount,
        slots: slotResult.slots,
      },
    };
  } catch (err) {
    logger.error('matching:get_overview_unexpected', err instanceof Error ? err.message : 'Unknown error', { ...ctx, err });
    return { success: false, errorCode: 'unexpected_error' };
  }
}

/**
 * 生徒本人の、未割当チケット(キャンセルによりticket_refunded=trueとなり未消化に戻った枠等)により
 * 再予約可能な定期スケジュール(コマ)の一覧を取得する（生徒向け。ポータル共通）。
 * 週n回契約でコマごとに担当コーチが異なりうるため、コーチ選択はさせず対象コマ(schedule_id)を
 * 選ばせる（担当コーチはcom_m_lesson_schedule.coach_idで既に確定している）。
 * 予約できる回数はDB側のfn_schedule_bookable_count()（未予約の回から予約リクエスト・振替候補の回答待ちを
 * 差し引いた数。create_session_booking_request RPCの予約可否判定と同一）。
 */
export async function getMyBookableTicketsCore(): Promise<GetMyBookableTicketsResult> {
  const ctx = await getLogContext();

  try {
    const supabase = await createServerClient();
    const user = await getAuthUser();
    if (!user) return { success: false, errorCode: 'unauthorized' };

    const { data: schedules, error: scheduleError } = await supabase
      .from('com_m_lesson_schedule')
      .select('schedule_id, slot_no, coach_id, day_of_week, start_time, end_time, schedule_timezone')
      .eq('student_id', user.id)
      .eq('status', 1);

    if (scheduleError) {
      logger.error('matching:get_my_bookable_tickets_schedule_failed', scheduleError.message, { ...ctx, err: scheduleError, userId: user.id });
      return { success: false, errorCode: 'unexpected_error' };
    }
    if (!schedules || schedules.length === 0) {
      return { success: true, slots: [] };
    }

    const bookableResults = await Promise.all(
      schedules.map((schedule) => supabase.rpc('fn_schedule_bookable_count', { p_schedule_id: schedule.schedule_id }))
    );

    const bookableCountByScheduleId = new Map<string, number>();
    schedules.forEach((schedule, index) => {
      const { data, error } = bookableResults[index];
      if (error || typeof data !== 'number') {
        logger.error('matching:get_my_bookable_tickets_rpc_failed', error?.message ?? 'No value returned', { ...ctx, err: error, userId: user.id, payload: { scheduleId: schedule.schedule_id } });
        return;
      }
      bookableCountByScheduleId.set(schedule.schedule_id, data);
    });
    const bookableSchedules = schedules.filter((schedule) => (bookableCountByScheduleId.get(schedule.schedule_id) ?? 0) > 0);

    if (bookableSchedules.length === 0) {
      return { success: true, slots: [] };
    }

    const coachIds = Array.from(new Set(bookableSchedules.map((s) => s.coach_id)));

    const { data: coaches, error: coachError } = await supabase
      .from('com_m_user')
      .select('id, user_name, timezone')
      .in('id', coachIds);

    if (coachError) {
      logger.error('matching:get_my_bookable_tickets_join_failed', coachError.message, { ...ctx, err: coachError, userId: user.id });
      return { success: false, errorCode: 'unexpected_error' };
    }

    const coachById = new Map((coaches ?? []).map((c) => [c.id, c]));

    const slots: BookableTicketSlot[] = bookableSchedules.map((schedule) => ({
      schedule_id: schedule.schedule_id,
      slot_no: schedule.slot_no,
      coach_id: schedule.coach_id,
      coach_name: coachById.get(schedule.coach_id)?.user_name ?? '(Unknown)',
      coach_timezone: coachById.get(schedule.coach_id)?.timezone ?? 'Asia/Tokyo',
      schedule_timezone: schedule.schedule_timezone,
      day_of_week: schedule.day_of_week as DayOfWeek,
      start_time: schedule.start_time,
      end_time: schedule.end_time,
      shortfall: bookableCountByScheduleId.get(schedule.schedule_id) ?? 0,
    }));

    return { success: true, slots };
  } catch (err) {
    logger.error('matching:get_my_bookable_tickets_unexpected', err instanceof Error ? err.message : 'Unknown error', { ...ctx, err });
    return { success: false, errorCode: 'unexpected_error' };
  }
}

/**
 * マッチング可能なコーチの一覧を取得する（生徒向け。ポータル共通）
 * zoom_meeting_url等の非公開項目は含めない。
 * 対象コーチはget_matchable_coach_ids()で決まる（通常の生徒にはデモコーチを含めない）。
 */
export async function getCoachBrowseListCore(): Promise<
  { success: true; coaches: CoachBrowseItem[] } | { success: false; errorCode: MatchingRequestErrorCode }
> {
  const ctx = await getLogContext();

  try {
    const supabase = await createServerClient();
    const user = await getAuthUser();
    if (!user) return { success: false, errorCode: 'unauthorized' };

    const { data: matchableCoaches, error: matchableError } = await supabase.rpc('get_matchable_coach_ids');

    if (matchableError) {
      logger.error('matching:get_coach_list_matchable_failed', matchableError.message, { ...ctx, err: matchableError });
      return { success: false, errorCode: 'unexpected_error' };
    }
    if (!matchableCoaches || matchableCoaches.length === 0) {
      return { success: true, coaches: [] };
    }

    const { data: profiles, error: profileError } = await supabase
      .from('com_m_coach_profile')
      .select('user_id, country_code, coach_since, education, qualifications, teaching_years, job_experience, introduction, intro_video_path')
      .in('user_id', matchableCoaches.map((c: { coach_id: string }) => c.coach_id))
      .eq('delete_flg', '0');

    if (profileError) {
      logger.error('matching:get_coach_list_profile_failed', profileError.message, { ...ctx, err: profileError });
      return { success: false, errorCode: 'unexpected_error' };
    }
    if (!profiles || profiles.length === 0) {
      return { success: true, coaches: [] };
    }

    const coachIds = profiles.map((p) => p.user_id);

    // 予約済みの枠との重なりは、申請ダイアログで候補ごとに予約できる回数として取得する（getMatchingSlotOptionsCore）
    const [{ data: users, error: userError }, { data: availability, error: availabilityError }] = await Promise.all([
      supabase.from('com_m_user').select('id, user_name, icon_path, timezone').in('id', coachIds),
      supabase
        .from('com_m_coach_availability')
        .select('availability_id, coach_id, day_of_week, start_time, end_time')
        .in('coach_id', coachIds)
        .eq('delete_flg', '0'),
    ]);

    if (userError || availabilityError) {
      logger.error('matching:get_coach_list_join_failed', userError?.message ?? availabilityError?.message ?? 'unknown', {
        ...ctx,
        err: userError ?? availabilityError,
      });
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
        coach_since: p.coach_since,
        education: p.education,
        qualifications: p.qualifications,
        teaching_years: p.teaching_years,
        job_experience: p.job_experience,
        introduction: p.introduction,
        intro_video_path: p.intro_video_path,
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
    logger.error('matching:get_coach_list_unexpected', err instanceof Error ? err.message : 'Unknown error', { ...ctx, err });
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
    const user = await getAuthUser();
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
      .select('ticket_id, license_id, weekly_frequency')
      .eq('ticket_id', input.ticket_id)
      .eq('user_id', user.id)
      .maybeSingle();

    if (ticketError) {
      logger.error('matching:create_request_ticket_check_failed', ticketError.message, { ...ctx, err: ticketError, userId: user.id });
      return { success: false, errorCode: 'unexpected_error' };
    }
    if (!ticket || input.slot_no > ticket.weekly_frequency) {
      return { success: false, errorCode: 'not_eligible' };
    }

    // 申請先がこの生徒のマッチング対象コーチか確認（一覧に出ないデモコーチへの直接申請を防ぐ）
    const { data: matchableCoach, error: matchableError } = await supabase
      .rpc('get_matchable_coach_ids')
      .eq('coach_id', input.coach_id)
      .maybeSingle();

    if (matchableError) {
      logger.error('matching:create_request_matchable_check_failed', matchableError.message, { ...ctx, err: matchableError, userId: user.id });
      return { success: false, errorCode: 'unexpected_error' };
    }
    if (!matchableCoach) {
      return { success: false, errorCode: 'not_eligible' };
    }

    // 申請した曜日・時刻は生徒の現地時刻。基準のタイムゾーンは申請時の生徒のプロフィールの値を保存する
    // （クライアントの値は使わない。承認時に定期スケジュールへ引き継ぎ、セッションもこのタイムゾーンで作る）
    const [{ data: student, error: studentError }, { data: license, error: licenseError }] = await Promise.all([
      supabase.from('com_m_user').select('timezone').eq('id', user.id).maybeSingle(),
      supabase.from('com_t_user_license').select('start_date, end_date').eq('license_id', ticket.license_id).maybeSingle(),
    ]);

    if (studentError || licenseError || !license) {
      logger.error('matching:create_request_profile_check_failed', studentError?.message ?? licenseError?.message ?? 'license not found', { ...ctx, err: studentError, userId: user.id });
      return { success: false, errorCode: 'unexpected_error' };
    }
    const studentTimezone = student?.timezone ?? 'Asia/Tokyo';

    // 希望の枠がコーチの公開している空き時間（UTC）内に収まっているか、初回の回の実際の日時で確認する
    // （画面の申請カレンダーと同じ換算。開始前の契約なら契約の開始以降の回）
    const now = new Date();
    const first = getFirstLiveSessionOccurrence(
      input.day_of_week, input.start_time, studentTimezone, 'UTC', now, new Date(license.start_date)
    );
    if (first.instant > new Date(license.end_date)) {
      return { success: false, errorCode: 'invalid_input' };
    }
    const utcStartTime = first.start_time;
    const utcEndTime = getLessonEndTime(utcStartTime);

    const { data: availabilityMatch } = await supabase
      .from('com_m_coach_availability')
      .select('availability_id')
      .eq('coach_id', input.coach_id)
      .eq('day_of_week', first.day_of_week)
      .eq('delete_flg', '0')
      .lte('start_time', `${utcStartTime}:00`)
      .gte('end_time', `${utcEndTime}:00`)
      .limit(1);

    if (!availabilityMatch || availabilityMatch.length === 0) {
      return { success: false, errorCode: 'invalid_input' };
    }

    // 契約期間内に予約できる回数を数え、割合に満たなければ申請させない（ダブルブッキング防止を含む）。
    // 承認時(approve_matching_request)にも同じ関数で数え直すため、ここでの判定は「成立しない申請を早期に弾く」ためのもの。
    const { options, error: optionsError } = await fetchMatchingSlotOptions(supabase, input.ticket_id, input.coach_id, input.slot_no, [
      { day_of_week: input.day_of_week, start_time: input.start_time },
    ]);
    if (optionsError) {
      logger.error('matching:create_request_availability_check_failed', optionsError.message, { ...ctx, err: optionsError, userId: user.id });
      return { success: false, errorCode: 'unexpected_error' };
    }
    const availability = options?.[0];
    if (!availability || !availability.is_acceptable) {
      return { success: false, errorCode: 'insufficient_bookable' };
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
        requested_timezone: studentTimezone,
        requested_bookable_sessions: availability.bookable_sessions,
      })
      .select('*')
      .single();

    if (error || !data) {
      // 同一枠への重複リクエストはユニークインデックス(uq_matching_request_active_slot)違反(23505)として検出
      if (error?.code === '23505') {
        return { success: false, errorCode: 'slot_already_requested' };
      }
      logger.error('matching:create_request_insert_failed', error?.message ?? 'No row inserted', { ...ctx, err: error, userId: user.id });
      return { success: false, errorCode: 'db_insert_failed' };
    }

    logger.info('matching:create_request_success', 'Matching request created', { ...ctx, userId: user.id });
    return { success: true, request: data };
  } catch (err) {
    logger.error('matching:create_request_unexpected', err instanceof Error ? err.message : 'Unknown error', { ...ctx, err });
    return { success: false, errorCode: 'unexpected_error' };
  }
}

/**
 * 申請カレンダーの候補（生徒の現地の曜日・開始時刻）ごとに、契約期間内に予約できる回数を取得する（生徒向け。ポータル共通）。
 * 申請ダイアログで○（全ての回）△（割合以上。残りは個別に調整）×（割合未満）を出すために使う。
 */
export async function getMatchingSlotOptionsCore(
  ticketId: string,
  coachId: string,
  slotNo: number,
  candidates: { day_of_week: DayOfWeek; start_time: string }[]
): Promise<GetMatchingSlotOptionsResult> {
  const ctx = await getLogContext();

  try {
    const supabase = await createServerClient();
    const user = await getAuthUser();
    if (!user) return { success: false, errorCode: 'unauthorized' };

    if (
      slotNo < 1 ||
      candidates.some((c) => c.day_of_week < 0 || c.day_of_week > 6 || !/^\d{2}:\d{2}$/.test(c.start_time))
    ) {
      return { success: false, errorCode: 'invalid_input' };
    }
    if (candidates.length === 0) return { success: true, options: [] };

    const { options, error } = await fetchMatchingSlotOptions(supabase, ticketId, coachId, slotNo, candidates);
    if (error) {
      logger.error('matching:get_slot_options_failed', error.message, { ...ctx, err: error, userId: user.id });
      return { success: false, errorCode: 'unexpected_error' };
    }
    return { success: true, options: options ?? [] };
  } catch (err) {
    logger.error('matching:get_slot_options_unexpected', err instanceof Error ? err.message : 'Unknown error', { ...ctx, err });
    return { success: false, errorCode: 'unexpected_error' };
  }
}

/**
 * 承認待ちの自分のマッチングリクエストを取り下げる（生徒向け。ポータル共通）。
 * DB側の withdraw_matching_request RPC が、取り下げと宛先コーチへの通知（アプリ内のみ）を行う。
 */
export async function withdrawMatchingRequestCore(requestId: string): Promise<WithdrawMatchingRequestResult> {
  const ctx = await getLogContext();

  try {
    const supabase = await createServerClient();
    const user = await getAuthUser();
    if (!user) return { success: false, errorCode: 'unauthorized' };

    const { error } = await supabase.rpc('withdraw_matching_request', { p_request_id: requestId });

    if (error) {
      if (error.message?.includes('NOT_PENDING')) {
        return { success: false, errorCode: 'not_pending' };
      }
      if (error.message?.includes('EXPIRED')) {
        return { success: false, errorCode: 'expired' };
      }
      logger.error('matching:withdraw_request_failed', error.message, { ...ctx, err: error, userId: user.id, payload: { requestId } });
      return { success: false, errorCode: 'db_update_failed' };
    }

    logger.info('matching:withdraw_request_success', 'Matching request withdrawn', { ...ctx, userId: user.id });
    return { success: true };
  } catch (err) {
    logger.error('matching:withdraw_request_unexpected', err instanceof Error ? err.message : 'Unknown error', { ...ctx, err });
    return { success: false, errorCode: 'unexpected_error' };
  }
}

/**
 * insert_dateで取得した行に、生徒名と申請した契約の期間を結合する（コーチ宛マッチングリクエスト系クエリの共通処理）。
 * 契約の期間は、担当になる前のコーチはRLSで読めないため管理者権限で取得する。対象は、コーチがRLSで読めた
 * 自分宛のリクエストのチケットに限り、返すのは開始・終了日時だけ。
 * 承認待ちの申請には、今承認した場合に予約できる回数（get_matching_request_availability）を付ける
 * （申請後にコーチの予定が埋まると、申請時より回数が減る・承認できなくなることがある）。
 */
async function attachRequestDetails(
  supabase: Awaited<ReturnType<typeof createServerClient>>,
  requests: Omit<IncomingMatchingRequestItem, 'student_name' | 'license_start_date' | 'license_end_date' | 'availability'>[]
): Promise<IncomingMatchingRequestItem[]> {
  if (requests.length === 0) return [];
  const studentIds = Array.from(new Set(requests.map((r) => r.student_id)));
  const ticketIds = Array.from(new Set(requests.map((r) => r.ticket_id)));
  const pendingIds = requests.filter((r) => r.status === MATCHING_REQUEST_STATUS.PENDING).map((r) => r.request_id);
  const [{ data: students }, { data: tickets }, { data: availabilityRows }] = await Promise.all([
    supabase.from('com_m_user').select('id, user_name').in('id', studentIds),
    createAdminClient()
      .from('com_t_user_session_ticket')
      .select('ticket_id, com_t_user_license!inner(start_date, end_date)')
      .in('ticket_id', ticketIds),
    pendingIds.length > 0
      ? supabase.rpc('get_matching_request_availability', { p_request_ids: pendingIds })
      : Promise.resolve({ data: [] }),
  ]);
  const availabilityByRequestId = new Map(
    ((availabilityRows ?? []) as (MatchingSlotAvailability & { request_id: string })[]).map(({ request_id, ...availability }) => [
      request_id,
      availability,
    ])
  );
  const studentNameById = new Map((students ?? []).map((s) => [s.id, s.user_name ?? '(Unknown)']));
  const periodByTicketId = new Map(
    (tickets ?? []).map((t) => {
      const license = Array.isArray(t.com_t_user_license) ? t.com_t_user_license[0] : t.com_t_user_license;
      return [t.ticket_id as string, license as { start_date: string; end_date: string } | undefined];
    })
  );
  return requests.map((r) => ({
    ...r,
    student_name: studentNameById.get(r.student_id) ?? '(Unknown)',
    license_start_date: periodByTicketId.get(r.ticket_id)?.start_date ?? null,
    license_end_date: periodByTicketId.get(r.ticket_id)?.end_date ?? null,
    availability: availabilityByRequestId.get(r.request_id) ?? null,
  }));
}

/**
 * ログイン中コーチ宛の、未対応(pending)のマッチングリクエストのみを取得する。
 * Pending Requestsパネル・サイドバーの件数バッジ等、常時参照される軽量な用途向け
 * （statusで絞り込むため、対象は常に少数に収まる。既存の(coach_id, status)
 * インデックスを利用できる）。History一覧はgetMatchingRequestHistoryPageAsCoachCoreを使うこと。
 */
export async function getPendingIncomingRequestsAsCoachCore(): Promise<
  { success: true; requests: IncomingMatchingRequestItem[] } | { success: false; errorCode: MatchingRequestErrorCode }
> {
  const ctx = await getLogContext();

  try {
    const supabase = await createServerClient();
    const user = await getAuthUser();
    if (!user) return { success: false, errorCode: 'unauthorized' };

    const { data: requests, error } = await supabase
      .from('com_t_matching_request')
      .select('*')
      .eq('coach_id', user.id)
      .eq('status', MATCHING_REQUEST_STATUS.PENDING)
      // 回答期限を過ぎたものは、期限切れの処理（毎分）を待たずに除く
      .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)
      .order('insert_date', { ascending: false });

    if (error) {
      logger.error('matching:get_pending_incoming_requests_failed', error.message, { ...ctx, err: error, userId: user.id });
      return { success: false, errorCode: 'unexpected_error' };
    }

    return { success: true, requests: await attachRequestDetails(supabase, requests ?? []) };
  } catch (err) {
    logger.error('matching:get_pending_incoming_requests_unexpected', err instanceof Error ? err.message : 'Unknown error', { ...ctx, err });
    return { success: false, errorCode: 'unexpected_error' };
  }
}

/**
 * ログイン中コーチ宛のマッチングリクエスト履歴を、insert_dateカーソルでページング取得する
 * （申請一覧画面のHistoryタブ用）。コーチの稼働年数が伸びるほど件数が増え続けるため、
 * 1回のリクエストでは全件取得せず、cursor(直前ページ最終行のinsert_date)より古い行を
 * limit件だけ返す。nextCursorがnullなら以降のページは存在しない。
 */
export async function getMatchingRequestHistoryPageAsCoachCore(
  cursor: string | null,
  limit: number
): Promise<
  | { success: true; items: IncomingMatchingRequestItem[]; nextCursor: string | null }
  | { success: false; errorCode: MatchingRequestErrorCode }
> {
  const ctx = await getLogContext();

  try {
    const supabase = await createServerClient();
    const user = await getAuthUser();
    if (!user) return { success: false, errorCode: 'unauthorized' };

    let query = supabase
      .from('com_t_matching_request')
      .select('*')
      .eq('coach_id', user.id)
      .order('insert_date', { ascending: false })
      .limit(limit + 1);
    if (cursor) query = query.lt('insert_date', cursor);

    const { data: rows, error } = await query;
    if (error) {
      logger.error('matching:get_request_history_page_failed', error.message, { ...ctx, err: error, userId: user.id });
      return { success: false, errorCode: 'unexpected_error' };
    }

    const hasMore = (rows?.length ?? 0) > limit;
    const page = (rows ?? []).slice(0, limit);
    const nextCursor = hasMore ? (page[page.length - 1]?.insert_date ?? null) : null;

    return { success: true, items: await attachRequestDetails(supabase, page), nextCursor };
  } catch (err) {
    logger.error('matching:get_request_history_page_unexpected', err instanceof Error ? err.message : 'Unknown error', { ...ctx, err });
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
    const user = await getAuthUser();
    if (!user) return { success: false, errorCode: 'unauthorized' };

    const { data, error } = await supabase.rpc('approve_matching_request', { p_request_id: requestId });

    if (error || !data) {
      logger.error('matching:approve_request_failed', error?.message ?? 'No schedule_id returned', { ...ctx, err: error, userId: user.id, payload: { requestId } });
      // 予約できる回数が割合に満たない場合は、fn_commit_matching_schedule()からINSUFFICIENT_BOOKABLEで
      // RAISE EXCEPTIONされる（申請後にコーチの予定が埋まった場合等。詳細はfunction/fn_matching_slot_availability.sql）。
      // 否認して個別に調整する旨を伝えるため、専用のerrorCodeにマッピングする。
      if (error?.message?.includes('INSUFFICIENT_BOOKABLE')) {
        return { success: false, errorCode: 'insufficient_bookable' };
      }
      if (error?.message?.includes('is not pending')) {
        return { success: false, errorCode: 'not_pending' };
      }
      if (error?.message?.includes('EXPIRED')) {
        return { success: false, errorCode: 'expired' };
      }
      return { success: false, errorCode: 'db_update_failed' };
    }

    logger.info('matching:approve_request_success', 'Matching request approved', { ...ctx, userId: user.id });
    return { success: true, scheduleId: data as string };
  } catch (err) {
    logger.error('matching:approve_request_unexpected', err instanceof Error ? err.message : 'Unknown error', { ...ctx, err });
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
    const user = await getAuthUser();
    if (!user) return { success: false, errorCode: 'unauthorized' };

    if (!reason || reason.trim().length === 0) {
      return { success: false, errorCode: 'invalid_input' };
    }

    const { error } = await supabase.rpc('reject_matching_request', { p_request_id: requestId, p_reason: reason.trim() });

    if (error) {
      if (error.message?.includes('EXPIRED')) {
        return { success: false, errorCode: 'expired' };
      }
      logger.error('matching:reject_request_failed', error.message, { ...ctx, err: error, userId: user.id, payload: { requestId } });
      return { success: false, errorCode: 'db_update_failed' };
    }

    logger.info('matching:reject_request_success', 'Matching request rejected', { ...ctx, userId: user.id });
    return { success: true };
  } catch (err) {
    logger.error('matching:reject_request_unexpected', err instanceof Error ? err.message : 'Unknown error', { ...ctx, err });
    return { success: false, errorCode: 'unexpected_error' };
  }
}
