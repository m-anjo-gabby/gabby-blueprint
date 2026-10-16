import { signInAsRole, signOutRole } from "../../../helpers/auth.ts";
import { cleanupAuthFixture, createAuthFixture, createDisposableStudent, DISPOSABLE_EMAIL_DOMAIN, grantAppLicense, type AuthFixture } from "../../support/authFixtures.ts";
import { expect, test } from "../../support/studentApp.ts";

/**
 * グループセッションの配信対象と参加登録（仕様書: e2e/specs/group-session/group-sessions.md 異常系 #4・#5）。
 *
 * 画面には配信対象外の回が出ないため、生徒本人のログインで直接読み書きして確かめる。
 * 使い捨ての顧客A（生徒が所属）・顧客B向けの回を作り、テストの最後に消す。desktop だけで実行する。
 */

const PASSWORD = "GroupAccess2026a";
const DAY_MS = 24 * 60 * 60 * 1000;

const fixtures: AuthFixture[] = [];
const eventIds: string[] = [];

test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "使い捨てデータを作るため desktop だけで実行する");
});

test.afterEach(async () => {
  if (fixtures[0] && eventIds.length > 0) await fixtures[0].admin.from("com_m_calendar_event").delete().in("calendar_event_id", eventIds);
  eventIds.length = 0;
  for (const f of fixtures.splice(0)) await cleanupAuthFixture(f);
});

async function createEvent(f: AuthFixture, label: string, options: { clientId: string; rsvp: boolean }): Promise<string> {
  const start = new Date(Date.now() + 3 * DAY_MS);
  const { data, error } = await f.admin
    .from("com_m_calendar_event")
    .insert({
      event_type: options.rsvp ? "GROUP_SESSION" : "MAINTENANCE",
      title: `【E2E】配信対象 ${label} ${f.tag}`,
      start_datetime: start.toISOString(),
      end_datetime: new Date(start.getTime() + 60 * 60 * 1000).toISOString(),
      location_url: `https://example.com/e2e-access/${label}`,
      target_type: "CLIENT",
      client_id: options.clientId,
      rsvp_enabled: options.rsvp,
      is_published: true,
    })
    .select("calendar_event_id")
    .single();
  if (error || !data) throw new Error(`イベントの作成に失敗: ${error?.message}`);
  eventIds.push(data.calendar_event_id);
  return data.calendar_event_id;
}

test("生徒は配信対象外の回を見られず、直接の登録でも参加登録できない。配信対象の回には登録できる", async () => {
  const a = await createAuthFixture("groupaccess");
  fixtures.push(a);
  const b = await createAuthFixture("groupaccess");
  fixtures.push(b);
  const email = `${a.tag}-student@${DISPOSABLE_EMAIL_DOMAIN}`;
  const studentId = await createDisposableStudent(a, { email, password: PASSWORD });
  await grantAppLicense(a, studentId);

  const own = await createEvent(a, "own", { clientId: a.clientId, rsvp: true });
  const ownNoRsvp = await createEvent(a, "own-no-rsvp", { clientId: a.clientId, rsvp: false });
  const other = await createEvent(a, "other", { clientId: b.clientId, rsvp: true });

  const student = await signInAsRole(email, PASSWORD);
  try {
    // #4 配信対象外（別の顧客向け）の回は見えない
    const { data: visible } = await student.from("com_m_calendar_event").select("calendar_event_id").in("calendar_event_id", [own, other]);
    expect(visible?.map((r) => r.calendar_event_id)).toEqual([own]);

    // #5 配信対象外の回・参加確認なしの回には、本人の行でも登録できない
    for (const id of [other, ownNoRsvp]) {
      const { error } = await student.from("com_t_calendar_event_participant").insert({ user_id: studentId, calendar_event_id: id });
      expect(error?.message).toContain("row-level security");
    }
    // 配信対象の回には登録でき、取り消せる
    const { error: joinError } = await student.from("com_t_calendar_event_participant").insert({ user_id: studentId, calendar_event_id: own });
    expect(joinError).toBeNull();
    const { error: cancelError } = await student.from("com_t_calendar_event_participant").delete().eq("user_id", studentId).eq("calendar_event_id", own);
    expect(cancelError).toBeNull();
  } finally {
    await signOutRole(student);
  }

  const { data: rows } = await a.admin.from("com_t_calendar_event_participant").select("calendar_event_id").eq("user_id", studentId);
  expect(rows).toEqual([]);
});
