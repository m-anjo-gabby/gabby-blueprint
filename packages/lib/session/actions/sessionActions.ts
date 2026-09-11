'use server';

import { createServerClient } from '../../supabase/server';
import { createLogger } from '../../logger';
import { getLogContext } from '../../logger/context';
import { groupRescheduleProposals } from '../rescheduleProposalUtils';
import {
  AcceptRescheduleProposalResult,
  ApproveSessionBookingRequestResult,
  CancelSessionResult,
  CheckSessionConflictResult,
  CreateSessionBookingRequestResult,
  DeclineRescheduleProposalResult,
  FinalizeSessionResult,
  GetMyRescheduleProposalsResult,
  GetSessionResultSummaryResult,
  IncomingRescheduleProposalGroup,
  MyRescheduleProposalGroup,
  PROPOSED_BY_ROLE,
  ProposedSlotInput,
  RESCHEDULE_PROPOSAL_STATUS,
  RespondSessionBookingRequestResult,
  ResolveStaleSessionResult,
  SESSION_BOOKING_REQUEST_STATUS,
  SESSION_STATUS,
  SessionActionErrorCode,
  SessionBookingRequest,
  SessionCallLogEntry,
  SessionChatMessageEntry,
  SessionListItem,
  SessionRescheduleProposal,
  SessionSprintSummaryEntry,
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
  if (message.includes('not found') || message.includes('no pending proposals')) return 'not_found';
  if (message.includes('reason required')) return 'reason_required';
  if (message.includes('invalid resolved status')) return 'invalid_input';
  if (
    message.includes('not scheduled')
    || message.includes('already started')
    || message.includes('within 12 hours of its start time')
    || message.includes('must be in the future')
    || message.includes('cannot resolve a session before its end time')
    || message.includes('is not active')
    || message.includes('no longer pending')
    || message.includes('has expired')
  ) {
    return 'not_actionable';
  }
  if (message.includes('already has a session')) return 'schedule_conflict';
  if (message.includes('no unassigned ticket available')) return 'no_ticket_available';
  if (message.includes('cannot propose more than 3') || message.includes('invalid proposed time range')) return 'invalid_input';
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
 * ログイン中ユーザー（生徒/コーチいずれか）の、指定期間内のセッション一覧を取得する（ポータル共通、
 * メインカレンダー・ダッシュボード用）。呼び出し側でロールを意識する必要はない。
 * coach_id/student_idの絞り込みを明示的に行う（RLSは「担当外だが担当関係のある生徒のセッション」も
 * コーチに開示するよう別途拡張されているため、それに引きずられてこの画面（自分の予定表）に
 * 他コーチのセッションが混ざらないよう、ここでは常に「自分が直接の当事者」のみに限定する）。
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
      .or(`coach_id.eq.${user.id},student_id.eq.${user.id}`)
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
 * proposedSlots はコーチによるキャンセル時のみ有効（最大3件。生徒キャンセル時に
 * 渡してもRPC側で無視される）。予約・振替の決定権は生徒側にあるため、コーチは
 * 直接reschedule_session/book_makeup_sessionを呼べず、代わりにここで候補を提案する。
 */
export async function cancelSessionCore(
  sessionId: string,
  reason?: string,
  proposedSlots?: ProposedSlotInput[]
): Promise<CancelSessionResult> {
  const ctx = await getLogContext();

  try {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, errorCode: 'unauthorized' };

    if (proposedSlots && proposedSlots.length > 3) {
      return { success: false, errorCode: 'invalid_input' };
    }

    const { error } = await supabase.rpc('cancel_session', {
      p_session_id: sessionId,
      p_reason: reason?.trim() || null,
      p_proposed_slots: proposedSlots && proposedSlots.length > 0 ? proposedSlots : null,
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

const RESCHEDULE_PROPOSAL_ROW_COLUMNS = 'proposal_id, session_id, coach_id, student_id, proposed_start_datetime, proposed_end_datetime, status, proposed_by_role, expires_at, insert_date';

/**
 * ログイン中の生徒宛の、未回答(pending)かつ未失効の振替候補一覧を取得する
 * （ライブセッションハブで、応答が必要な候補提案として表示する）。
 * コーチが提案したもの(proposed_by_role=COACH)のみが対象。生徒自身が提案したもの
 * (proposed_by_role=STUDENT)はコーチ側が応答するため、ここには含めない。
 */
export async function getMyRescheduleProposalsCore(): Promise<GetMyRescheduleProposalsResult> {
  const ctx = await getLogContext();

  try {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, errorCode: 'unauthorized' };

    const { data, error } = await supabase
      .from('com_t_session_reschedule_proposal')
      .select(RESCHEDULE_PROPOSAL_ROW_COLUMNS)
      .eq('student_id', user.id)
      .eq('proposed_by_role', PROPOSED_BY_ROLE.COACH)
      .eq('status', RESCHEDULE_PROPOSAL_STATUS.PENDING)
      .gt('expires_at', new Date().toISOString())
      .order('proposed_start_datetime', { ascending: true });

    if (error) {
      logger.error('session:get_reschedule_proposals_failed', error.message, { ...ctx, userId: user.id });
      return { success: false, errorCode: 'unexpected_error' };
    }

    return { success: true, proposals: (data ?? []) as SessionRescheduleProposal[] };
  } catch (err) {
    logger.error('session:get_reschedule_proposals_unexpected', err instanceof Error ? err.message : 'Unknown error', ctx);
    return { success: false, errorCode: 'unexpected_error' };
  }
}

/**
 * ログイン中生徒宛の、未回答(pending)かつ未失効の振替候補を、キャンセル(セッション)単位で
 * グルーピングし、コーチ名を結合して取得する（ライブセッションハブでの表示用）。
 */
export async function getMyRescheduleProposalGroupsCore(): Promise<
  { success: true; groups: MyRescheduleProposalGroup[] } | { success: false; errorCode: SessionActionErrorCode }
> {
  const result = await getMyRescheduleProposalsCore();
  if (!result.success) return result;

  const groups = groupRescheduleProposals(result.proposals);
  if (groups.length === 0) return { success: true, groups: [] };

  const ctx = await getLogContext();
  try {
    const supabase = await createServerClient();
    const coachIds = Array.from(new Set(groups.map((g) => g.coach_id)));
    const { data: coaches } = await supabase.from('com_m_user').select('id, user_name').in('id', coachIds);
    const nameById = new Map((coaches ?? []).map((c) => [c.id, c.user_name ?? '(Unknown)']));

    return { success: true, groups: groups.map((g) => ({ ...g, coach_name: nameById.get(g.coach_id) ?? '(Unknown)' })) };
  } catch (err) {
    logger.error('session:get_my_reschedule_proposal_groups_unexpected', err instanceof Error ? err.message : 'Unknown error', ctx);
    return { success: false, errorCode: 'unexpected_error' };
  }
}

/**
 * コーチ宛の、未回答(pending)かつ未失効の振替候補一覧を取得する（生徒がキャンセル時に
 * 提案したもののみ。proposed_by_role=STUDENT）。コーチ側の申請一覧画面用。
 */
export async function getIncomingRescheduleProposalsForCoachCore(): Promise<GetMyRescheduleProposalsResult> {
  const ctx = await getLogContext();

  try {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, errorCode: 'unauthorized' };

    const { data, error } = await supabase
      .from('com_t_session_reschedule_proposal')
      .select(RESCHEDULE_PROPOSAL_ROW_COLUMNS)
      .eq('coach_id', user.id)
      .eq('proposed_by_role', PROPOSED_BY_ROLE.STUDENT)
      .eq('status', RESCHEDULE_PROPOSAL_STATUS.PENDING)
      .gt('expires_at', new Date().toISOString())
      .order('proposed_start_datetime', { ascending: true });

    if (error) {
      logger.error('session:get_incoming_reschedule_proposals_failed', error.message, { ...ctx, userId: user.id });
      return { success: false, errorCode: 'unexpected_error' };
    }

    return { success: true, proposals: (data ?? []) as SessionRescheduleProposal[] };
  } catch (err) {
    logger.error('session:get_incoming_reschedule_proposals_unexpected', err instanceof Error ? err.message : 'Unknown error', ctx);
    return { success: false, errorCode: 'unexpected_error' };
  }
}

/**
 * ログイン中コーチ宛の、生徒がキャンセル時に提案した振替候補を、キャンセル(セッション)単位で
 * グルーピングし、生徒名・元セッションの開始日時を結合して取得する（申請一覧画面用）。
 */
export async function getIncomingRescheduleProposalGroupsForCoachCore(): Promise<
  { success: true; groups: IncomingRescheduleProposalGroup[] } | { success: false; errorCode: SessionActionErrorCode }
> {
  const result = await getIncomingRescheduleProposalsForCoachCore();
  if (!result.success) return result;

  const groups = groupRescheduleProposals(result.proposals);
  if (groups.length === 0) return { success: true, groups: [] };

  const ctx = await getLogContext();
  try {
    const supabase = await createServerClient();
    const studentIds = Array.from(new Set(groups.map((g) => g.student_id)));
    const sessionIds = groups.map((g) => g.session_id);
    const [{ data: students }, { data: sessions }] = await Promise.all([
      supabase.from('com_m_user').select('id, user_name').in('id', studentIds),
      supabase.from('com_t_session').select('session_id, start_datetime').in('session_id', sessionIds),
    ]);
    const nameById = new Map((students ?? []).map((s) => [s.id, s.user_name ?? '(Unknown)']));
    const startById = new Map((sessions ?? []).map((s) => [s.session_id, s.start_datetime]));

    return {
      success: true,
      groups: groups.map((g) => ({
        ...g,
        student_name: nameById.get(g.student_id) ?? '(Unknown)',
        original_session_start_datetime: startById.get(g.session_id) ?? g.insert_date,
      })),
    };
  } catch (err) {
    logger.error('session:get_incoming_reschedule_proposal_groups_unexpected', err instanceof Error ? err.message : 'Unknown error', ctx);
    return { success: false, errorCode: 'unexpected_error' };
  }
}

/**
 * コーチ提案の振替候補を生徒が承諾する。DB側の accept_session_reschedule_proposal RPC
 * （SECURITY DEFINER）を呼び出す。Availabilityチェックは行われず、二重予約チェックのみ行われる。
 */
export async function acceptRescheduleProposalCore(proposalId: string): Promise<AcceptRescheduleProposalResult> {
  const ctx = await getLogContext();

  try {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, errorCode: 'unauthorized' };

    const { data, error } = await supabase.rpc('accept_session_reschedule_proposal', { p_proposal_id: proposalId });

    if (error || !data) {
      logger.error('session:accept_reschedule_proposal_failed', error?.message ?? 'No session_id returned', { ...ctx, userId: user.id, payload: { proposalId } });
      return { success: false, errorCode: classifyRpcError(error?.message) };
    }

    logger.info('session:accept_reschedule_proposal_success', 'Reschedule proposal accepted', { ...ctx, userId: user.id });
    return { success: true, newSessionId: data as string };
  } catch (err) {
    logger.error('session:accept_reschedule_proposal_unexpected', err instanceof Error ? err.message : 'Unknown error', ctx);
    return { success: false, errorCode: 'unexpected_error' };
  }
}

/**
 * 振替候補を一括却下する（応答者本人。生徒提案ならコーチが、コーチ提案なら生徒が呼ぶ）。
 * DB側の decline_session_reschedule_proposals RPC（SECURITY DEFINER）を呼び出す。
 * 候補は「いずれか1つを選んで承諾する」ための選択肢のため、却下は候補単位ではなく
 * 同一キャンセル(session_id)にまとめて対する操作とする。
 */
export async function declineRescheduleProposalsCore(sessionId: string): Promise<DeclineRescheduleProposalResult> {
  const ctx = await getLogContext();

  try {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, errorCode: 'unauthorized' };

    const { error } = await supabase.rpc('decline_session_reschedule_proposals', { p_session_id: sessionId });

    if (error) {
      logger.error('session:decline_reschedule_proposals_failed', error.message, { ...ctx, userId: user.id, payload: { sessionId } });
      return { success: false, errorCode: classifyRpcError(error.message) };
    }

    logger.info('session:decline_reschedule_proposals_success', 'Reschedule proposals declined', { ...ctx, userId: user.id });
    return { success: true };
  } catch (err) {
    logger.error('session:decline_reschedule_proposals_unexpected', err instanceof Error ? err.message : 'Unknown error', ctx);
    return { success: false, errorCode: 'unexpected_error' };
  }
}

/**
 * コーチ・生徒それぞれのダブルブッキング有無を事前チェックする（生徒・コーチ共通）。
 * DB側の check_session_conflict RPC（SECURITY DEFINER）を呼び出す。候補提案・予約
 * リクエストの日時入力中に呼び、インラインでエラーメッセージを表示するために使う
 * （サーバー側の最終防衛ラインである各RPC内部のチェックとは別に、UXのために先出しする）。
 */
export async function checkSessionConflictCore(
  coachId: string,
  studentId: string,
  startIso: string,
  endIso: string,
  excludeSessionId?: string
): Promise<CheckSessionConflictResult> {
  const ctx = await getLogContext();

  try {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, errorCode: 'unauthorized' };

    const { data, error } = await supabase.rpc('check_session_conflict', {
      p_coach_id: coachId,
      p_student_id: studentId,
      p_start_datetime: startIso,
      p_end_datetime: endIso,
      p_exclude_session_id: excludeSessionId ?? null,
    });

    if (error || !data || data.length === 0) {
      logger.error('session:check_conflict_failed', error?.message ?? 'No row returned', { ...ctx, userId: user.id });
      return { success: false, errorCode: classifyRpcError(error?.message) };
    }

    const row = data[0] as { coach_conflict: boolean; student_conflict: boolean };
    return { success: true, coachConflict: row.coach_conflict, studentConflict: row.student_conflict };
  } catch (err) {
    logger.error('session:check_conflict_unexpected', err instanceof Error ? err.message : 'Unknown error', ctx);
    return { success: false, errorCode: 'unexpected_error' };
  }
}

/**
 * 未消化チケット（未割当／キャンセルで返還されたもの）を使い、自由な日時で新規予約を
 * リクエストする（生徒本人のみ）。DB側の create_session_booking_request RPC
 * （SECURITY DEFINER）を呼び出す。即時確定ではなく、担当コーチの承認を待つ
 * pending行(com_t_session_booking_request)を作成するのみ。
 */
export async function createSessionBookingRequestCore(
  scheduleId: string,
  startIso: string,
  endIso: string,
  reason?: string
): Promise<CreateSessionBookingRequestResult> {
  const ctx = await getLogContext();

  try {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, errorCode: 'unauthorized' };

    const { data, error } = await supabase.rpc('create_session_booking_request', {
      p_schedule_id: scheduleId,
      p_start_datetime: startIso,
      p_end_datetime: endIso,
      p_reason: reason?.trim() || null,
    });

    if (error || !data) {
      logger.error('session:create_booking_request_failed', error?.message ?? 'No request_id returned', { ...ctx, userId: user.id, payload: { scheduleId } });
      return { success: false, errorCode: classifyRpcError(error?.message) };
    }

    logger.info('session:create_booking_request_success', 'Session booking requested', { ...ctx, userId: user.id, payload: { scheduleId } });
    return { success: true, requestId: data as string };
  } catch (err) {
    logger.error('session:create_booking_request_unexpected', err instanceof Error ? err.message : 'Unknown error', ctx);
    return { success: false, errorCode: 'unexpected_error' };
  }
}

/**
 * 予約リクエストを担当コーチが承認する。DB側の approve_session_booking_request RPC
 * （SECURITY DEFINER）を呼び出す。承認によりcom_t_sessionへ新規行が作成される。
 */
export async function approveSessionBookingRequestCore(requestId: string): Promise<ApproveSessionBookingRequestResult> {
  const ctx = await getLogContext();

  try {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, errorCode: 'unauthorized' };

    const { data, error } = await supabase.rpc('approve_session_booking_request', { p_request_id: requestId });

    if (error || !data) {
      logger.error('session:approve_booking_request_failed', error?.message ?? 'No session_id returned', { ...ctx, userId: user.id, payload: { requestId } });
      return { success: false, errorCode: classifyRpcError(error?.message) };
    }

    logger.info('session:approve_booking_request_success', 'Session booking request approved', { ...ctx, userId: user.id });
    return { success: true, newSessionId: data as string };
  } catch (err) {
    logger.error('session:approve_booking_request_unexpected', err instanceof Error ? err.message : 'Unknown error', ctx);
    return { success: false, errorCode: 'unexpected_error' };
  }
}

/**
 * 予約リクエストを担当コーチが却下する。DB側の reject_session_booking_request RPC
 * （SECURITY DEFINER）を呼び出す。却下してもチケットは未割当のまま残る。
 */
export async function rejectSessionBookingRequestCore(requestId: string, reason?: string): Promise<RespondSessionBookingRequestResult> {
  const ctx = await getLogContext();

  try {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, errorCode: 'unauthorized' };

    const { error } = await supabase.rpc('reject_session_booking_request', {
      p_request_id: requestId,
      p_reason: reason?.trim() || null,
    });

    if (error) {
      logger.error('session:reject_booking_request_failed', error.message, { ...ctx, userId: user.id, payload: { requestId } });
      return { success: false, errorCode: classifyRpcError(error.message) };
    }

    logger.info('session:reject_booking_request_success', 'Session booking request rejected', { ...ctx, userId: user.id });
    return { success: true };
  } catch (err) {
    logger.error('session:reject_booking_request_unexpected', err instanceof Error ? err.message : 'Unknown error', ctx);
    return { success: false, errorCode: 'unexpected_error' };
  }
}

/**
 * 予約リクエストを生徒本人が取り下げる。DB側の withdraw_session_booking_request RPC
 * （SECURITY DEFINER）を呼び出す。コーチの応答を待たずに取り下げたい場合の経路。
 */
export async function withdrawSessionBookingRequestCore(requestId: string): Promise<RespondSessionBookingRequestResult> {
  const ctx = await getLogContext();

  try {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, errorCode: 'unauthorized' };

    const { error } = await supabase.rpc('withdraw_session_booking_request', { p_request_id: requestId });

    if (error) {
      logger.error('session:withdraw_booking_request_failed', error.message, { ...ctx, userId: user.id, payload: { requestId } });
      return { success: false, errorCode: classifyRpcError(error.message) };
    }

    logger.info('session:withdraw_booking_request_success', 'Session booking request withdrawn', { ...ctx, userId: user.id });
    return { success: true };
  } catch (err) {
    logger.error('session:withdraw_booking_request_unexpected', err instanceof Error ? err.message : 'Unknown error', ctx);
    return { success: false, errorCode: 'unexpected_error' };
  }
}

const BOOKING_REQUEST_ROW_COLUMNS = 'request_id, schedule_id, student_id, coach_id, requested_start_datetime, requested_end_datetime, reason, status, reject_reason, insert_date';

/**
 * ログイン中生徒本人の、未消化チケットによる予約リクエスト一覧を取得する（pending中のものを
 * ライブセッションハブで「コーチの承認待ち」として表示するために使う）。
 */
export async function getMyBookingRequestsCore(): Promise<
  { success: true; requests: SessionBookingRequest[] } | { success: false; errorCode: SessionActionErrorCode }
> {
  const ctx = await getLogContext();

  try {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, errorCode: 'unauthorized' };

    const { data, error } = await supabase
      .from('com_t_session_booking_request')
      .select(BOOKING_REQUEST_ROW_COLUMNS)
      .eq('student_id', user.id)
      .eq('status', SESSION_BOOKING_REQUEST_STATUS.PENDING)
      .order('insert_date', { ascending: false });

    if (error) {
      logger.error('session:get_my_booking_requests_failed', error.message, { ...ctx, userId: user.id });
      return { success: false, errorCode: 'unexpected_error' };
    }

    return { success: true, requests: (data ?? []) as SessionBookingRequest[] };
  } catch (err) {
    logger.error('session:get_my_booking_requests_unexpected', err instanceof Error ? err.message : 'Unknown error', ctx);
    return { success: false, errorCode: 'unexpected_error' };
  }
}

/**
 * ログイン中コーチ宛の、未消化チケットによる予約リクエスト一覧を取得する（申請一覧画面用）。
 */
export async function getIncomingBookingRequestsForCoachCore(): Promise<
  { success: true; requests: SessionBookingRequest[] } | { success: false; errorCode: SessionActionErrorCode }
> {
  const ctx = await getLogContext();

  try {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, errorCode: 'unauthorized' };

    const { data, error } = await supabase
      .from('com_t_session_booking_request')
      .select(BOOKING_REQUEST_ROW_COLUMNS)
      .eq('coach_id', user.id)
      .order('insert_date', { ascending: false });

    if (error) {
      logger.error('session:get_incoming_booking_requests_failed', error.message, { ...ctx, userId: user.id });
      return { success: false, errorCode: 'unexpected_error' };
    }

    return { success: true, requests: (data ?? []) as SessionBookingRequest[] };
  } catch (err) {
    logger.error('session:get_incoming_booking_requests_unexpected', err instanceof Error ? err.message : 'Unknown error', ctx);
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

    const [
      { data: counterpart },
      { data: callLogRows, error: callLogError },
      { data: chatRows, error: chatError },
      { data: sprintRows, error: sprintError },
    ] = await Promise.all([
      supabase.from('com_m_user').select('user_name, icon_path').eq('id', counterpartId).maybeSingle(),
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
      supabase
        .from('lesson_t_sprint')
        .select('lesson_sprint_id, question_type, difficulty_level, total_answered, total_evaluated, answered_history, insert_date, com_m_contents(content_name, content_name_en)')
        .eq('session_id', sessionId)
        .order('insert_date', { ascending: true }),
    ]);

    if (callLogError) {
      logger.error('session:get_result_summary_call_log_failed', callLogError.message, { ...ctx, userId: user.id, payload: { sessionId } });
      return { success: false, errorCode: 'unexpected_error' };
    }
    if (chatError) {
      logger.error('session:get_result_summary_chat_failed', chatError.message, { ...ctx, userId: user.id, payload: { sessionId } });
      return { success: false, errorCode: 'unexpected_error' };
    }
    if (sprintError) {
      logger.error('session:get_result_summary_sprint_failed', sprintError.message, { ...ctx, userId: user.id, payload: { sessionId } });
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

    const sprintLog: SessionSprintSummaryEntry[] = (sprintRows ?? []).map((r) => {
      const history = (r.answered_history as { score: number | null }[] | null) ?? [];
      const scored = history.filter((h) => typeof h.score === 'number');
      const averageScore = scored.length > 0
        ? Math.round((scored.reduce((sum, h) => sum + (h.score ?? 0), 0) / scored.length) * 10) / 10
        : null;
      const contentJoin = Array.isArray(r.com_m_contents) ? r.com_m_contents[0] : r.com_m_contents;

      return {
        lesson_sprint_id: r.lesson_sprint_id,
        content_name: contentJoin?.content_name ?? '(Unknown)',
        content_name_en: contentJoin?.content_name_en ?? null,
        question_type: r.question_type,
        difficulty_level: r.difficulty_level,
        total_answered: r.total_answered,
        total_evaluated: r.total_evaluated,
        average_score: averageScore,
        insert_date: r.insert_date,
      };
    });

    return {
      success: true,
      session: {
        session_id: session.session_id,
        start_datetime: session.start_datetime,
        end_datetime: session.end_datetime,
        status: session.status,
        status_note: session.status_note,
        counterpart_name: counterpart?.user_name ?? '(Unknown)',
        counterpart_icon_path: counterpart?.icon_path ?? null,
        call_log: callLog,
        chat_log: chatLog,
        sprint_log: sprintLog,
      },
    };
  } catch (err) {
    logger.error('session:get_result_summary_unexpected', err instanceof Error ? err.message : 'Unknown error', ctx);
    return { success: false, errorCode: 'unexpected_error' };
  }
}
