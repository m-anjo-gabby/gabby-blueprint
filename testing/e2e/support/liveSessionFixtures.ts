import type { SupabaseClient } from "@supabase/supabase-js";
import { signInAsRole, signOutRole } from "../../helpers/auth.ts";
import {
  DISPOSABLE_EMAIL_DOMAIN,
  createDisposableCoach,
  createDisposableStudent,
  grantLiveLicense,
  type AuthFixture,
} from "./authFixtures.ts";

/**
 * ライブセッション（専属コーチの申請・実施）のE2E用の使い捨てデータ。
 *
 * - 生徒（日本時間・週1回のライブ付き契約90日）とコーチ（日本時間。空き時間は UTC の金曜 10:00〜13:00＝日本時間 19:00〜22:00）を作り、
 *   生徒本人のログインで「金曜 20:00〜20:25」の申請を登録する（生徒の画面からの申請は e2e/tests/matching/ で確認済み）。
 * - 実施当日の状態は、ビデオ通話（Zoom Video SDK）を使わずに作る。通話ルームが記録する入退室ログ（`com_t_session_call_log`）を
 *   直接入れることで、セッションハブの End Session（`finalize_session`。入退室の重なりで実施結果を判定する）を通常どおり動かす。
 * - 後始末は authFixtures の cleanupAuthFixture（担当枠→セッション・宿題・入退室ログ・教材オープンの記録が連動して消える）と、
 *   成立時に作られるチャットルームの deleteFixtureChatRooms で行う。ログインしたクライアントは signOutLivePair で閉じる。
 */

const MINUTE_MS = 60 * 1000;
const DAY_MS = 24 * 60 * MINUTE_MS;
/** ライブセッション1回の長さ（25分） */
const LESSON_MS = 25 * MINUTE_MS;

export interface LivePair {
  studentId: string;
  studentName: string;
  studentEmail: string;
  coachId: string;
  coachName: string;
  coachEmail: string;
  password: string;
  ticketId: string;
  requestId: string;
  /** 生徒本人のログイン（申請・チャット送信用） */
  studentClient: SupabaseClient;
}

/** 使い捨ての生徒・コーチを作り、生徒本人のログインで承認待ちの申請（金曜 20:00〜20:25、日本時間）を1件登録する */
export async function createPendingMatchingRequest(f: AuthFixture, password: string): Promise<LivePair> {
  const studentEmail = `${f.tag}-student@${DISPOSABLE_EMAIL_DOMAIN}`;
  const studentName = `E2E生徒 ${f.tag}`;
  const studentId = await createDisposableStudent(f, { email: studentEmail, password, userName: studentName });
  await f.admin.from("com_m_user").update({ timezone: "Asia/Tokyo" }).eq("id", studentId);
  const now = Date.now();
  const { ticketId } = await grantLiveLicense(f, studentId, {
    planCode: "LIVE_WEEKLY1_3M",
    label: "live",
    start: new Date(now - DAY_MS),
    end: new Date(now + 90 * DAY_MS),
  });

  const coachEmail = `${f.tag}-coach@${DISPOSABLE_EMAIL_DOMAIN}`;
  const coachName = `E2E Coach ${f.tag}`;
  const coachId = await createDisposableCoach(f, {
    email: coachEmail,
    password,
    userName: coachName,
    timezone: "Asia/Tokyo",
    availability: [{ dayOfWeek: 5, startTime: "10:00:00", endTime: "13:00:00" }],
  });

  const studentClient = await signInAsRole(studentEmail, password);
  const { data: request, error } = await studentClient
    .from("com_t_matching_request")
    .insert({
      ticket_id: ticketId,
      student_id: studentId,
      coach_id: coachId,
      slot_no: 1,
      requested_day_of_week: 5,
      requested_start_time: "20:00:00",
      requested_end_time: "20:25:00",
      requested_timezone: "Asia/Tokyo",
    })
    .select("request_id")
    .single();
  if (error || !request) throw new Error(`申請の登録に失敗しました: ${error?.message}`);

  return { studentId, studentName, studentEmail, coachId, coachName, coachEmail, password, ticketId, requestId: request.request_id, studentClient };
}

/**
 * 担当を成立させる（コーチ本人のログインで承認。定期スケジュール・契約期間分のセッション・1対1のチャットルームが作られる）。
 * @returns 定期スケジュール（担当枠）のID
 */
export async function approveMatchingRequest(f: AuthFixture, pair: LivePair): Promise<string> {
  const coachClient = await signInAsRole(pair.coachEmail, pair.password);
  try {
    const { error } = await coachClient.rpc("approve_matching_request", { p_request_id: pair.requestId });
    if (error) throw new Error(`申請の承認に失敗しました: ${error.message}`);
  } finally {
    await signOutRole(coachClient);
  }
  const { data: schedule, error } = await f.admin.from("com_m_lesson_schedule").select("schedule_id").eq("ticket_id", pair.ticketId).single();
  if (error || !schedule) throw new Error(`定期スケジュールが見つかりません: ${error?.message}`);
  return schedule.schedule_id;
}

export interface LiveSessionDay {
  /** いま実施中のセッション（開始から21分経過、残り4分） */
  sessionId: string;
  /** 前回（7日前）に実施済みのセッション */
  previousSessionId: string;
  /** 前回の宿題の本文（ハブの Last Homework に出る） */
  previousHomework: string;
  /** 生徒からコーチへの未読のチャット */
  studentMessage: string;
}

/**
 * ライブセッション当日の状態を作る（担当成立後に呼ぶ）。
 * - 前回（7日前）のセッション: 実施済み（正常終了）で、宿題が投稿済み
 * - 今回のセッション: 開始から21分経過・残り4分。コーチは開始時から通話に入っている（入退室ログ。退室は未記録）。
 *   生徒も開始時から入っている（既定。End Session で重なりが20分以上となり「実施完了」）。`studentMinutesInCall` を20未満にすると
 *   生徒はその分だけ前に入ったことになり、End Session で理由の入力が必要な「早期終了」になる。0 は生徒が入室していない（「無断欠席」）
 * - 生徒の自主トレーニング: 今日と昨日の実績（スプリントの日次集計）
 * - 生徒からコーチへの未読のチャット1件（成立時のルーム）
 */
export async function prepareLiveSessionDay(
  f: AuthFixture,
  pair: LivePair,
  scheduleId: string,
  options: { studentMinutesInCall?: number } = {}
): Promise<LiveSessionDay> {
  const { admin } = f;
  const now = Date.now();
  const base = { schedule_id: scheduleId, ticket_id: pair.ticketId, student_id: pair.studentId, coach_id: pair.coachId };

  const previous = await createCompletedSessionWithHomework(f, pair, scheduleId, { daysAgo: 7 });

  const start = now - 21 * MINUTE_MS;
  const { data: current, error: currentError } = await admin
    .from("com_t_session")
    .insert({ ...base, start_datetime: new Date(start).toISOString(), end_datetime: new Date(start + LESSON_MS).toISOString(), status: 1 })
    .select("session_id")
    .single();
  if (currentError || !current) throw new Error(`今回のセッションの作成に失敗しました: ${currentError?.message}`);
  const studentMinutesInCall = options.studentMinutesInCall ?? 21;
  const studentJoinedAt = Math.max(start, now - studentMinutesInCall * MINUTE_MS);
  const { error: callLogError } = await admin.from("com_t_session_call_log").insert([
    { session_id: current.session_id, user_id: pair.coachId, role: "coach", joined_at: new Date(start).toISOString() },
    ...(studentMinutesInCall > 0
      ? [{ session_id: current.session_id, user_id: pair.studentId, role: "student", joined_at: new Date(studentJoinedAt).toISOString() }]
      : []),
  ]);
  if (callLogError) throw new Error(`入退室ログの作成に失敗しました: ${callLogError.message}`);

  const { data: sprintContent } = await admin
    .from("com_m_contents").select("content_id").eq("content_type", 2).eq("delete_flg", "0").limit(1).single();
  const isoDate = (t: number) => new Date(t).toISOString().slice(0, 10);
  const { error: summaryError } = await admin.from("self_t_sprint_summary").insert([
    { user_id: pair.studentId, content_id: sprintContent!.content_id, training_date: isoDate(now), question_count: 12, assessment_count: 5 },
    { user_id: pair.studentId, content_id: sprintContent!.content_id, training_date: isoDate(now - DAY_MS), question_count: 8, assessment_count: 3 },
  ]);
  if (summaryError) throw new Error(`自主トレーニングの実績の作成に失敗しました: ${summaryError.message}`);

  const { data: room, error: roomError } = await admin
    .from("com_t_chat_room_user").select("room_id").eq("user_id", pair.studentId).limit(1).single();
  if (roomError || !room) throw new Error(`チャットルームが見つかりません: ${roomError?.message}`);
  const studentMessage = `Hi coach, see you in today's session! (${f.tag})`;
  const { error: chatError } = await pair.studentClient
    .from("com_t_chat")
    .insert({ room_id: room.room_id, sender_user_id: pair.studentId, message: studentMessage, message_type: "TEXT" });
  if (chatError) throw new Error(`生徒のチャット送信に失敗しました: ${chatError.message}`);

  return { sessionId: current.session_id, previousSessionId: previous.sessionId, previousHomework: previous.homeworkText, studentMessage };
}

/**
 * 実施済み（正常終了）のセッションと、その宿題を作る（宿題の登録で生徒へ HOMEWORK_POSTED が通知される）。
 * `checklist` を渡すとチェックリストの項目も作る（コーチの投稿と同じく、本体と同時に作る）。
 */
export async function createCompletedSessionWithHomework(
  f: AuthFixture,
  pair: LivePair,
  scheduleId: string,
  options: { daysAgo: number; checklist?: string[] }
): Promise<{ sessionId: string; homeworkText: string }> {
  const { admin } = f;
  const start = Date.now() - options.daysAgo * DAY_MS;
  const { data: session, error: sessionError } = await admin
    .from("com_t_session")
    .insert({
      schedule_id: scheduleId,
      ticket_id: pair.ticketId,
      student_id: pair.studentId,
      coach_id: pair.coachId,
      start_datetime: new Date(start).toISOString(),
      end_datetime: new Date(start + LESSON_MS).toISOString(),
      status: 2,
      completion_result: 1,
    })
    .select("session_id")
    .single();
  if (sessionError || !session) throw new Error(`実施済みのセッションの作成に失敗しました: ${sessionError?.message}`);
  const homeworkText = `Review the meeting phrases from the session ${options.daysAgo} days ago (${f.tag}).`;
  const { data: homework, error: homeworkError } = await admin
    .from("com_t_session_homework")
    .insert({ session_id: session.session_id, coach_id: pair.coachId, student_id: pair.studentId, homework_text: homeworkText })
    .select("homework_id")
    .single();
  if (homeworkError || !homework) throw new Error(`宿題の作成に失敗しました: ${homeworkError?.message}`);
  if (options.checklist && options.checklist.length > 0) {
    const { error: checklistError } = await admin.from("com_t_session_homework_checklist_item").insert(
      options.checklist.map((itemText, index) => ({ homework_id: homework.homework_id, item_no: index + 1, item_text: itemText }))
    );
    if (checklistError) throw new Error(`チェックリストの作成に失敗しました: ${checklistError.message}`);
  }
  return { sessionId: session.session_id, homeworkText };
}

/**
 * 終了予定を過ぎても実施予定のまま残ったセッション（通話の記録なし）を作る。Resolve Manually の対象になる。
 * 複数作る場合は2時間ずつずらす（1件目は45分前に終了予定）。
 */
export async function createStaleSessions(f: AuthFixture, pair: LivePair, scheduleId: string, count: number): Promise<string[]> {
  const now = Date.now();
  const rows = Array.from({ length: count }, (_, i) => {
    const start = now - 70 * MINUTE_MS - i * 120 * MINUTE_MS;
    return {
      schedule_id: scheduleId,
      ticket_id: pair.ticketId,
      student_id: pair.studentId,
      coach_id: pair.coachId,
      start_datetime: new Date(start).toISOString(),
      end_datetime: new Date(start + LESSON_MS).toISOString(),
      status: 1,
    };
  });
  const { data, error } = await f.admin.from("com_t_session").insert(rows).select("session_id");
  if (error || !data) throw new Error(`終了予定を過ぎたセッションの作成に失敗しました: ${error?.message}`);
  return data.map((r) => r.session_id);
}

/** ログインしたクライアントを閉じる（afterEach で cleanupAuthFixture の前に呼ぶ） */
export async function signOutLivePair(pair: LivePair | undefined): Promise<void> {
  if (pair) await signOutRole(pair.studentClient);
}
