/**
 * 利用者ペルソナ（testing/FIXTURES.md）のライブ契約まわりの投入処理。seed-user-personas.ts から使う。
 *
 * 過去のセッションを再現するため、スケジュール・マッチングリクエスト・セッションは service_role で直接作る
 * （admin_match_student_with_coach 等のRPCは「今日以降」のセッションしか作れないため）。
 * 終了時刻を過ぎたセッションの完了だけは、担当コーチ本人のJWTで resolve_stale_session を呼び、
 * チケット消化と履歴の記録をアプリと同じ経路で行う（CLAUDE.md 6章）。
 * セッションは「スケジュール×開始日時」で重複を判定するため、再実行すると不足分の作成と、
 * 前回以降に終了時刻を過ぎたセッションの完了だけが行われる。
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { signInAsRole } from "../../helpers/auth.ts";
import { toUtcAvailabilityRows, type LocalWeeklyRange } from "../../helpers/coach-availability.ts";

/** タイムゾーン tz の暦日 date・時刻 time（'HH:MM:SS'）を UTC の Date にする */
export function zonedToUtc(date: string, time: string, tz: string): Date {
  const [h, m, s] = time.split(":").map(Number);
  const naive = Date.parse(`${date}T00:00:00Z`) + ((h * 60 + m) * 60 + (s ?? 0)) * 1000;
  const offsetAt = (utcMs: number): number => {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
    }).formatToParts(new Date(utcMs));
    const get = (type: string): number => Number(parts.find((p) => p.type === type)?.value);
    return Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second")) - utcMs;
  };
  // 夏時間の切り替わりをまたぐ場合に備えて、求めた時刻のオフセットでもう一度補正する
  const first = naive - offsetAt(naive);
  return new Date(naive - offsetAt(first));
}

const DAY_MS = 86_400_000;
const addDays = (d: string, n: number): string => new Date(Date.parse(`${d}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);
const dayOfWeek = (d: string): number => new Date(`${d}T00:00:00Z`).getUTCDay();

export interface LiveCoach {
  id: string;
  email: string;
  timezone: string;
}

export interface LiveScheduleSeed {
  ticketId: string;
  studentId: string;
  coach: LiveCoach;
  slotNo: number;
  /** コーチのローカル時刻基準（このシードは定期スケジュールの基準のタイムゾーン schedule_timezone をコーチのタイムゾーンにする。
   *  アプリの申請は生徒の申請時のタイムゾーンを基準にするが、投入済みのデータとそろえるためシードはこのまま） */
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  /** コーチのローカル日付（この期間の該当曜日にセッションを作る） */
  startDate: string;
  endDate: string;
  targetSessions: number;
  /** コーチ交代で終了した枠（スケジュールは terminated、リクエストは ended） */
  terminated: boolean;
  /** 生徒・コーチがキャンセルした回（コーチのローカル日付） */
  cancellations?: { date: string; by: "student" | "coach"; reason: string }[];
}

export function createLiveKit(admin: SupabaseClient, password: string) {
  const coachClients = new Map<string, SupabaseClient>();
  async function coachClient(coach: LiveCoach): Promise<SupabaseClient> {
    const cached = coachClients.get(coach.id);
    if (cached) return cached;
    const client = await signInAsRole(coach.email, password);
    coachClients.set(coach.id, client);
    return client;
  }

  /** 週次の対応可能時間帯（未登録のときだけ作る）。ranges はコーチの現地時刻で書き、UTC に換算して保存する */
  async function ensureAvailabilities(coachId: string, timeZone: string, ranges: LocalWeeklyRange[]): Promise<void> {
    const { data: existing } = await admin.from("com_m_coach_availability").select("availability_id").eq("coach_id", coachId).limit(1);
    if (existing && existing.length > 0) return;
    const { error } = await admin.from("com_m_coach_availability").insert(toUtcAvailabilityRows(coachId, ranges, timeZone));
    if (error) throw error;
  }

  /** 承認済み（または交代で終了した）マッチングリクエストと、成立したスケジュール */
  async function ensureSchedule(seed: LiveScheduleSeed): Promise<string> {
    const { data: existing } = await admin
      .from("com_m_lesson_schedule")
      .select("schedule_id")
      .eq("ticket_id", seed.ticketId)
      .eq("slot_no", seed.slotNo)
      .eq("coach_id", seed.coach.id)
      .maybeSingle();
    if (existing) return existing.schedule_id as string;

    const respondedAt = zonedToUtc(addDays(seed.startDate, -7), "09:00:00", seed.coach.timezone).toISOString();
    const { data: request, error: reqErr } = await admin
      .from("com_t_matching_request")
      .insert({
        ticket_id: seed.ticketId,
        student_id: seed.studentId,
        coach_id: seed.coach.id,
        slot_no: seed.slotNo,
        requested_day_of_week: seed.dayOfWeek,
        requested_start_time: seed.startTime,
        requested_end_time: seed.endTime,
        requested_timezone: seed.coach.timezone,
        status: seed.terminated ? 5 : 2,
        responded_by: seed.coach.id,
        responded_at: respondedAt,
        insert_date: respondedAt,
        update_date: respondedAt,
      })
      .select("request_id")
      .single();
    if (reqErr) throw reqErr;

    const { data, error } = await admin
      .from("com_m_lesson_schedule")
      .insert({
        ticket_id: seed.ticketId,
        student_id: seed.studentId,
        coach_id: seed.coach.id,
        slot_no: seed.slotNo,
        day_of_week: seed.dayOfWeek,
        start_time: seed.startTime,
        end_time: seed.endTime,
        schedule_timezone: seed.coach.timezone,
        status: seed.terminated ? 9 : 1,
        start_date: seed.startDate,
        end_date: seed.endDate,
        target_sessions: seed.targetSessions,
        source_request_id: request.request_id,
        insert_date: respondedAt,
        update_date: respondedAt,
      })
      .select("schedule_id")
      .single();
    if (error) throw error;
    return data.schedule_id as string;
  }

  /** スケジュールの該当曜日ごとのセッション（不足分のみ）。戻り値は作成数 */
  async function ensureSessions(seed: LiveScheduleSeed, scheduleId: string): Promise<number> {
    const { data: existing, error: exErr } = await admin.from("com_t_session").select("start_datetime").eq("schedule_id", scheduleId);
    if (exErr) throw exErr;
    const have = new Set((existing ?? []).map((r) => new Date(r.start_datetime as string).getTime()));

    let cursor = addDays(seed.startDate, (seed.dayOfWeek - dayOfWeek(seed.startDate) + 7) % 7);
    const rows: Record<string, unknown>[] = [];
    let count = 0;
    while (cursor <= seed.endDate && count < seed.targetSessions) {
      count++;
      const start = zonedToUtc(cursor, seed.startTime, seed.coach.timezone);
      const end = zonedToUtc(cursor, seed.endTime, seed.coach.timezone);
      if (!have.has(start.getTime())) {
        const cancel = seed.cancellations?.find((c) => c.date === cursor);
        const base = {
          schedule_id: scheduleId,
          ticket_id: seed.ticketId,
          student_id: seed.studentId,
          coach_id: seed.coach.id,
          start_datetime: start.toISOString(),
          end_datetime: end.toISOString(),
          // 一括INSERTでは行ごとに無い列が NULL で送られるため、全行に入れる
          update_date: new Date().toISOString(),
        };
        if (cancel && start.getTime() < Date.now()) {
          const cancelledAt = new Date(start.getTime() - 2 * DAY_MS).toISOString();
          rows.push({
            ...base,
            status: 3,
            cancel_category: cancel.by === "student" ? 1 : 2,
            ticket_refunded: true,
            cancelled_by: cancel.by === "student" ? seed.studentId : seed.coach.id,
            cancel_reason: cancel.reason,
            update_date: cancelledAt,
          });
        } else {
          rows.push({ ...base, status: 1 });
        }
      }
      cursor = addDays(cursor, 7);
    }
    if (rows.length > 0) {
      const { error } = await admin.from("com_t_session").insert(rows);
      if (error) throw error;
    }
    return rows.length;
  }

  /** 終了時刻を過ぎた予定のセッションを、担当コーチのJWTで「通常完了」にする。戻り値は完了数 */
  async function completePastSessions(ticketId: string, coaches: LiveCoach[]): Promise<number> {
    const { data, error } = await admin
      .from("com_t_session")
      .select("session_id, coach_id")
      .eq("ticket_id", ticketId)
      .eq("status", 1)
      .lt("end_datetime", new Date().toISOString())
      .order("start_datetime");
    if (error) throw error;
    for (const s of data ?? []) {
      const coach = coaches.find((c) => c.id === s.coach_id);
      if (!coach) throw new Error(`担当コーチが見つかりません: ${s.coach_id as string}`);
      const client = await coachClient(coach);
      const { error: rpcErr } = await client.rpc("resolve_stale_session", {
        p_session_id: s.session_id,
        p_resolution: 1,
        p_reason: "【QA固定】利用者ペルソナの受講実績",
      });
      if (rpcErr) throw rpcErr;
    }
    return data?.length ?? 0;
  }

  /**
   * ダイアログ課題（教材名で指定。見つからなければ同じ難易度帯の別教材）と、各回の実施記録。
   * completedDates の日付順に、教材の回（session_no 順）を完了にする。
   */
  async function ensureDialogueAssignment(params: {
    studentId: string;
    coachId: string;
    contentNames: string[];
    assignedDate: string;
    completedDates: string[];
  }): Promise<string | null> {
    let content: { content_id: string; content_name: string } | null = null;
    for (const name of params.contentNames) {
      const { data } = await admin.from("com_m_contents").select("content_id, content_name").eq("content_type", 3).eq("content_name", name).eq("delete_flg", "0").maybeSingle();
      if (data) {
        content = data as { content_id: string; content_name: string };
        break;
      }
    }
    if (!content) return null;

    const { data: existing } = await admin
      .from("com_t_dialogue_assignment")
      .select("assignment_id")
      .eq("student_id", params.studentId)
      .eq("content_id", content.content_id)
      .eq("delete_flg", "0")
      .maybeSingle();
    let assignmentId = existing?.assignment_id as string | undefined;
    if (!assignmentId) {
      const at = `${params.assignedDate}T01:00:00Z`;
      const { data, error } = await admin
        .from("com_t_dialogue_assignment")
        .insert({ student_id: params.studentId, content_id: content.content_id, assigned_by_coach_id: params.coachId, assigned_date: params.assignedDate, insert_date: at, update_date: at })
        .select("assignment_id")
        .single();
      if (error) throw error;
      assignmentId = data.assignment_id as string;
    }

    const { data: sessions, error: sErr } = await admin
      .from("com_m_dialogue_session")
      .select("dialogue_session_id, session_no")
      .eq("content_id", content.content_id)
      .eq("delete_flg", "0")
      .order("session_no");
    if (sErr) throw sErr;
    const rows = (sessions ?? []).slice(0, params.completedDates.length).map((s, i) => ({
      assignment_id: assignmentId,
      dialogue_session_id: s.dialogue_session_id,
      is_completed: true,
      completed_date: params.completedDates[i],
      updated_by_coach_id: params.coachId,
      insert_date: `${params.completedDates[i]}T12:00:00Z`,
      update_date: `${params.completedDates[i]}T12:00:00Z`,
    }));
    if (rows.length > 0) {
      const { error } = await admin.from("com_t_dialogue_session_progress").upsert(rows, { onConflict: "assignment_id,dialogue_session_id", ignoreDuplicates: true });
      if (error) throw error;
    }
    return content.content_name;
  }

  /** 完了したセッションの開始日（コーチのローカル日付ではなくJST）を古い順に返す */
  async function completedSessionDates(studentId: string, coachId: string, from: string, to: string): Promise<string[]> {
    const { data, error } = await admin
      .from("com_t_session")
      .select("start_datetime")
      .eq("student_id", studentId)
      .eq("coach_id", coachId)
      .eq("status", 2)
      .gte("start_datetime", `${from}T00:00:00+09:00`)
      .lte("start_datetime", `${to}T23:59:59+09:00`)
      .order("start_datetime");
    if (error) throw error;
    return (data ?? []).map((r) => new Date(new Date(r.start_datetime as string).getTime() + 9 * 3_600_000).toISOString().slice(0, 10));
  }

  return { ensureAvailabilities, ensureSchedule, ensureSessions, completePastSessions, ensureDialogueAssignment, completedSessionDates };
}
