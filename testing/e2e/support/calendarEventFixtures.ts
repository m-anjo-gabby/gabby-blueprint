import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "../../helpers/auth.ts";

/**
 * カレンダーイベント（グループセッション）の使い捨てデータ。
 * 固定アカウントの所属テナント限定（target_type='CLIENT'）で配信し、全体の生徒には表示しない。
 * 参加登録（com_t_calendar_event_participant）・担当コーチ（com_t_calendar_event_coach）はイベントの削除で ON DELETE CASCADE により消える。
 * service_role はテストデータの準備・後始末にのみ使う（testing/CONVENTIONS.md 3章）。
 */

export const E2E_EVENT_TITLE_PREFIX = "【E2E】グループセッション";

export interface GroupSessionFixture {
  admin: SupabaseClient;
  calendarEventId: string;
  title: string;
  locationUrl: string;
  /** シリーズに入れた場合のシリーズID・シリーズ名 */
  seriesId: string | null;
  seriesTitle: string | null;
  /** 担当コーチを付けた場合のコーチ名 */
  coachName: string | null;
}

async function findUserIdByEmail(admin: SupabaseClient, email: string): Promise<string> {
  for (let page = 1; page <= 50; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const found = data.users.find((u) => u.email === email);
    if (found) return found.id;
    if (data.users.length < 200) break;
  }
  throw new Error(`固定アカウントが見つかりません: ${email}（seed-fixed-accounts.ts を実行してください）`);
}

async function findUserByEmail(admin: SupabaseClient, email: string): Promise<{ id: string; clientId: string }> {
  const id = await findUserIdByEmail(admin, email);
  const { data: user, error } = await admin.from("com_m_user").select("client_id").eq("id", id).single();
  if (error || !user?.client_id) throw new Error(`所属テナントが取得できません: ${email} ${error?.message ?? ""}`);
  return { id, clientId: user.client_id as string };
}

/**
 * 指定の生徒の所属テナント宛てに、公開済み・参加確認ありのグループセッションを作る。
 * startOffsetMinutes は現在からの開始までの分（負の値で開催中）。
 * withSeries を指定すると使い捨てのシリーズに入れ、coachEmail を指定するとそのコーチを担当に付ける。
 */
export async function createGroupSession(
  studentEmail: string,
  {
    startOffsetMinutes,
    label,
    withSeries = false,
    coachEmail,
  }: { startOffsetMinutes: number; label: string; withSeries?: boolean; coachEmail?: string }
): Promise<GroupSessionFixture> {
  const admin = await createAdminClient();
  const { clientId } = await findUserByEmail(admin, studentEmail);

  let seriesId: string | null = null;
  let seriesTitle: string | null = null;
  if (withSeries) {
    seriesTitle = `${E2E_EVENT_TITLE_PREFIX}シリーズ ${label} ${Date.now()}`;
    const { data: series, error: seriesErr } = await admin
      .from("com_m_calendar_event_series")
      .insert({ title: seriesTitle, description: "E2E で作成したシリーズの説明です。" })
      .select("series_id")
      .single();
    if (seriesErr || !series) throw new Error(`シリーズの作成に失敗: ${seriesErr?.message}`);
    seriesId = series.series_id as string;
  }
  const start = new Date(Date.now() + startOffsetMinutes * 60 * 1000);
  const end = new Date(start.getTime() + 60 * 60 * 1000);
  const title = `${E2E_EVENT_TITLE_PREFIX} ${label} ${Date.now()}`;
  const locationUrl = `https://example.com/e2e-group-session/${Date.now()}`;

  const { data, error } = await admin
    .from("com_m_calendar_event")
    .insert({
      event_type: "GROUP_SESSION",
      title,
      description: "E2E で作成したグループセッションです。",
      start_datetime: start.toISOString(),
      end_datetime: end.toISOString(),
      location_url: locationUrl,
      target_type: "CLIENT",
      client_id: clientId,
      rsvp_enabled: true,
      is_published: true,
      series_id: seriesId,
    })
    .select("calendar_event_id")
    .single();
  if (error || !data) throw new Error(`グループセッションの作成に失敗: ${error?.message}`);
  const calendarEventId = data.calendar_event_id as string;

  let coachName: string | null = null;
  if (coachEmail) {
    const coachId = await findUserIdByEmail(admin, coachEmail);
    const { data: coach } = await admin.from("com_m_user").select("user_name").eq("id", coachId).single();
    coachName = (coach?.user_name as string | null) ?? null;
    const { error: coachErr } = await admin.from("com_t_calendar_event_coach").insert({ calendar_event_id: calendarEventId, coach_id: coachId });
    if (coachErr) throw new Error(`担当コーチの割当に失敗: ${coachErr.message}`);
  }
  return { admin, calendarEventId, title, locationUrl, seriesId, seriesTitle, coachName };
}

/**
 * 作成したグループセッションを削除する（参加登録・担当コーチは一緒に消える）。
 * テスト中に pg_cron が登録したリマインダー（固定アカウント宛てのため送られない行）と、シリーズも消す。
 */
export async function deleteGroupSession({ admin, calendarEventId, seriesId }: GroupSessionFixture): Promise<void> {
  await admin.from("com_t_mail_outbox").delete().like("dedup_key", `${calendarEventId}:%`);
  const { error } = await admin.from("com_m_calendar_event").delete().eq("calendar_event_id", calendarEventId);
  if (error) throw new Error(`グループセッションの削除に失敗: ${error.message}`);
  if (seriesId) await admin.from("com_m_calendar_event_series").delete().eq("series_id", seriesId);
}
