import {
  DISPOSABLE_EMAIL_DOMAIN,
  createDisposableCoach,
  createDisposableStudent,
  grantLiveLicense,
  type AuthFixture,
} from "./authFixtures.ts";

/**
 * コーチ評価のE2E用の使い捨てデータ（仕様書: e2e/specs/rating/coach-rating.md）。
 *
 * - コーチは createDisposableCoach で作る（プロフィールの作成と同時に、初期値の評価〔3項目とも4〕がトリガーで1件入る）。
 * - 生徒ごとにライブ付き契約（週1回。複数コマの確認は週2回）を付け、担当枠とセッションを直接入れて受付の条件を作り分ける
 *   （マッチングの承認では契約期間分の予定がまとめて作られ、実施済み・予定の数を選べないため。承認の流れは matching/ のテストで確認済み）。
 * - 後始末は authFixtures の cleanupAuthFixture（評価・担当枠・セッション・契約・ユーザーを消す）。
 */

const MINUTE_MS = 60 * 1000;
const DAY_MS = 24 * 60 * MINUTE_MS;
const LESSON_MS = 25 * MINUTE_MS;

export interface RatingCoach {
  coachId: string;
  coachName: string;
  coachEmail: string;
}

export interface RatingStudent {
  studentId: string;
  studentName: string;
  studentEmail: string;
  ticketId: string;
}

/** 評価される使い捨てのコーチ（日本時間）。評価は初期値の1件（4/4/4）から始まる */
export async function createRatingCoach(f: AuthFixture, password: string): Promise<RatingCoach> {
  const coachEmail = `${f.tag}-coach@${DISPOSABLE_EMAIL_DOMAIN}`;
  const coachName = `E2E Coach ${f.tag}`;
  const coachId = await createDisposableCoach(f, { email: coachEmail, password, userName: coachName, timezone: "Asia/Tokyo", availability: [] });
  return { coachId, coachName, coachEmail };
}

/**
 * コーチの担当の生徒を作る（日本時間のライブ付き契約。契約は90日間で、終了まで `endInDays` 日）。
 * 担当枠（稼働中）と、`completed` 回の実施済み（7日おきに過去へ）・`scheduled` 回の予定（3日後から7日おき）のセッションを入れる。
 * `weeklySlots: 2` は週2回の契約で、2コマとも同じコーチの担当枠にする（2コマ目は曜日と日付を3日ずらし、同じ回数のセッションを入れる）。
 * 同じコーチの予定が重ならないよう、生徒ごとに `slotNo` で開始時刻を1時間ずつずらす。
 */
export async function addRatingStudent(
  f: AuthFixture,
  coach: RatingCoach,
  password: string,
  params: { key: string; slotNo: number; endInDays: number; completed: number; scheduled: number; weeklySlots?: 1 | 2 }
): Promise<RatingStudent> {
  const { admin } = f;
  const weeklySlots = params.weeklySlots ?? 1;
  const studentEmail = `${f.tag}-${params.key}@${DISPOSABLE_EMAIL_DOMAIN}`;
  const studentName = `E2E生徒${params.key.toUpperCase()} ${f.tag}`;
  const studentId = await createDisposableStudent(f, { email: studentEmail, password, userName: studentName });
  await admin.from("com_m_user").update({ timezone: "Asia/Tokyo" }).eq("id", studentId);

  const now = Date.now();
  const end = new Date(now + params.endInDays * DAY_MS);
  const start = new Date(end.getTime() - 90 * DAY_MS);
  const planCode = weeklySlots === 2 ? "LIVE_WEEKLY2_3M" : "LIVE_WEEKLY1_3M";
  const { ticketId } = await grantLiveLicense(f, studentId, { planCode, label: params.key, start, end });

  const { data: ticket } = await admin.from("com_t_user_session_ticket").select("total_sessions").eq("ticket_id", ticketId).single();
  const isoDate = (d: Date) => d.toISOString().slice(0, 10);
  const hour = String(9 + params.slotNo).padStart(2, "0");

  for (let slot = 0; slot < weeklySlots; slot++) {
    const { data: schedule, error: scheduleError } = await admin
      .from("com_m_lesson_schedule")
      .insert({
        ticket_id: ticketId,
        student_id: studentId,
        coach_id: coach.coachId,
        slot_no: slot + 1,
        day_of_week: slot === 0 ? 5 : 1,
        start_time: `${hour}:00:00`,
        end_time: `${hour}:25:00`,
        schedule_timezone: "Asia/Tokyo",
        target_sessions: ticket!.total_sessions / weeklySlots,
        status: 1,
        start_date: isoDate(start),
        end_date: isoDate(end),
      })
      .select("schedule_id")
      .single();
    if (scheduleError || !schedule) throw new Error(`担当枠の作成に失敗しました: ${scheduleError?.message}`);

    const base = { schedule_id: schedule.schedule_id, ticket_id: ticketId, student_id: studentId, coach_id: coach.coachId };
    const at = (days: number) => now + (days + slot * 3) * DAY_MS + params.slotNo * 60 * MINUTE_MS;
    const rows = [
      ...Array.from({ length: params.completed }, (_, i) => ({ start: at(-7 * (i + 1)), status: 2, completion_result: 1 })),
      ...Array.from({ length: params.scheduled }, (_, i) => ({ start: at(3 + 7 * i), status: 1, completion_result: null })),
    ].map((s) => ({
      ...base,
      start_datetime: new Date(s.start).toISOString(),
      end_datetime: new Date(s.start + LESSON_MS).toISOString(),
      status: s.status,
      completion_result: s.completion_result,
    }));
    if (rows.length > 0) {
      const { error } = await admin.from("com_t_session").insert(rows);
      if (error) throw new Error(`セッションの作成に失敗しました: ${error.message}`);
    }
  }
  return { studentId, studentName, studentEmail, ticketId };
}

/** 評価済みにする（生徒アプリからの登録と同じ登録元 1。集計はトリガーで作り直される） */
export async function insertCoachRating(
  f: AuthFixture,
  coach: RatingCoach,
  student: RatingStudent,
  scores: { coaching: number; friendliness: number; recommendation: number }
): Promise<void> {
  const { error } = await f.admin.from("com_t_coach_rating").insert({
    coach_id: coach.coachId,
    student_id: student.studentId,
    ticket_id: student.ticketId,
    coaching_score: scores.coaching,
    friendliness_score: scores.friendliness,
    recommendation_score: scores.recommendation,
    source: 1,
  });
  if (error) throw new Error(`評価の登録に失敗しました: ${error.message}`);
}
