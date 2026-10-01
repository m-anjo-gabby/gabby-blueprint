/**
 * 固定アカウント（testing/FIXTURES.md）同士のチャットルームと会話履歴を投入する冪等スクリプト。
 * チャット画面（2ペイン・未読の区切り線・過去メッセージの読み込み等）の目視確認・E2Eの土台に使う。
 * 前提: seed-fixed-accounts.ts で固定アカウントが投入済みであること。
 *
 * 使い方:
 *   pnpm exec tsx testing/features/fixtures/seed-chat-rooms.ts --env=dev
 *
 * - ルーム: 生徒01×担当コーチ(CA01)の1対1、生徒01×qa-admin の1対1、3名のグループ
 * - 履歴: メッセージが1件も無いルームにだけ投入する（再実行しても増えない）。日付をさかのぼった
 *   時刻で投入するため、ルーム作成と同じく service_role で書き込む（業務ロジックRPCは呼ばない）
 * - 未読: 生徒01は、コーチとのルームの最後の3件・グループの最後の1件を未読の状態にする
 */
import { loadTestEnv, resolveTestEnvFromArgs } from "../../helpers/env.ts";
import { createAdminClient } from "../../helpers/auth.ts";
import { createChatKit, type ChatMessageSeed } from "../../helpers/fixture-chat.ts";

const env = resolveTestEnvFromArgs();
loadTestEnv(env);

const admin = await createAdminClient();
const chat = createChatKit(admin);
const { ensureOneOnOneRoom, setLastRead } = chat;

const EMAIL = {
  student: "qa-student-01@gabby-qa-test.example",
  coach: "qa-coach-ca-01@gabby-qa-test.example",
  admin: "qa-admin@gabby-qa-test.example",
} as const;
const GROUP_ROOM_NAME = "【QA固定】チャット表示確認グループ";

console.log(`\n=== チャットルーム投入: env=${env} ===`);

async function findAuthUserByEmail(email: string): Promise<string> {
  for (let page = 1; page <= 50; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const found = data.users.find((u) => u.email === email);
    if (found) return found.id;
    if (data.users.length < 200) break;
  }
  throw new Error(`固定アカウントが見つかりません: ${email}（seed-fixed-accounts.ts を先に実行してください）`);
}

async function ensureGroupRoom(members: { id: string; type: string }[]): Promise<string> {
  const { data: existing } = await admin
    .from("com_t_chat_room")
    .select("room_id")
    .eq("room_type", "GROUP")
    .eq("room_name", GROUP_ROOM_NAME)
    .is("closed_at", null)
    .maybeSingle();
  if (existing) return existing.room_id as string;

  const { data: room, error } = await admin
    .from("com_t_chat_room")
    .insert({ room_type: "GROUP", room_name: GROUP_ROOM_NAME })
    .select("room_id")
    .single();
  if (error) throw error;
  const { error: memberError } = await admin
    .from("com_t_chat_room_user")
    .insert(members.map((m) => ({ room_id: room.room_id, user_id: m.id, user_type: m.type })));
  if (memberError) throw memberError;
  return room.room_id as string;
}

type Script = { from: string; text: string; daysAgo: number; time: string }[];

/** 実行日から daysAgo 日前の JST の time に送ったメッセージとして投入する（履歴が無いルームのみ） */
async function seedMessages(roomId: string, script: Script): Promise<string[] | null> {
  const now = new Date();
  const messages: ChatMessageSeed[] = script.map((m) => {
    const d = new Date(now);
    d.setUTCDate(d.getUTCDate() - m.daysAgo);
    const [h, min] = m.time.split(":").map(Number);
    // 時刻は JST 指定
    d.setUTCHours(h - 9, min, 0, 0);
    return { from: m.from, text: m.text, at: d };
  });
  return chat.seedMessages(roomId, messages);
}

const studentId = await findAuthUserByEmail(EMAIL.student);
const coachId = await findAuthUserByEmail(EMAIL.coach);
const adminId = await findAuthUserByEmail(EMAIL.admin);

// --- 生徒01 × 担当コーチ ---------------------------------------------------
const coachRoom = await ensureOneOnOneRoom(studentId, coachId);
const coachScript: Script = [
  { from: coachId, daysAgo: 12, time: "09:05", text: "Hi, QA student! Thank you for choosing me as your Gabby Coach! See you in the first live Coaching session." },
  { from: studentId, daysAgo: 12, time: "12:30", text: "よろしくお願いします！英語で話すのはまだ緊張しますが、頑張ります。" },
  { from: coachId, daysAgo: 11, time: "08:10", text: "No worries at all. We'll start slowly. Before our first session, could you tell me what you want to use English for?" },
  { from: studentId, daysAgo: 11, time: "21:15", text: "海外の取引先との電話会議です。\n聞き取りはなんとかなるのですが、自分の意見をすぐに言えません。" },
  { from: coachId, daysAgo: 10, time: "07:45", text: "Got it. Let's focus on short phrases for sharing opinions, like \"From my point of view…\" and \"I'd suggest that…\"." },
  { from: coachId, daysAgo: 10, time: "07:46", text: "Here is a short article about meeting phrases: https://www.gabbyacademy.com/" },
  { from: studentId, daysAgo: 9, time: "19:02", text: "ありがとうございます。読んでおきます！" },
  { from: coachId, daysAgo: 7, time: "10:20", text: "Great job in today's session! Your pronunciation of \"schedule\" has improved a lot." },
  { from: studentId, daysAgo: 7, time: "10:48", text: "Thank you! I practiced with the sprint drill every morning." },
  { from: coachId, daysAgo: 7, time: "10:50", text: "That's the spirit 👍" },
  { from: studentId, daysAgo: 5, time: "22:10", text: "質問です。\"I'd suggest\" と \"I recommend\" はどう使い分ければいいですか？" },
  { from: coachId, daysAgo: 4, time: "06:30", text: "Good question! Both are polite. \"I'd suggest\" sounds a bit softer, so it's nice when you are proposing an idea to a client. \"I recommend\" sounds more confident — use it when you are sure." },
  { from: coachId, daysAgo: 4, time: "06:31", text: "Try making one sentence with each and send them to me here." },
  { from: studentId, daysAgo: 3, time: "20:40", text: "I'd suggest that we move the deadline to Friday.\nI recommend using the new template for the report." },
  { from: coachId, daysAgo: 2, time: "09:15", text: "Perfect! Both sentences are natural." },
  { from: studentId, daysAgo: 2, time: "12:05", text: "やった！ありがとうございます。" },
  { from: coachId, daysAgo: 0, time: "08:00", text: "Good morning! Quick reminder: our next session is this Wednesday." },
  { from: coachId, daysAgo: 0, time: "08:01", text: "Please review the dialogue assignment before the session." },
  { from: coachId, daysAgo: 0, time: "08:03", text: "If the time doesn't work for you, let me know by tomorrow." },
];
const coachChats = await seedMessages(coachRoom, coachScript);
if (coachChats) {
  await setLastRead(coachRoom, coachId, coachChats[coachChats.length - 1]);
  await setLastRead(coachRoom, studentId, coachChats[coachChats.length - 4]);
}
console.log(`コーチとの1対1: ${coachRoom} ${coachChats ? `（${coachChats.length}件投入）` : "（投入済み）"}`);

// --- 生徒01 × 運営 ---------------------------------------------------------
const adminRoom = await ensureOneOnOneRoom(studentId, adminId);
const adminChats = await seedMessages(adminRoom, [
  { from: adminId, daysAgo: 20, time: "10:00", text: "Gabby Blueprint English 運営事務局です。ご不明点があれば、こちらのチャットでお気軽にご相談ください。" },
  { from: studentId, daysAgo: 19, time: "18:30", text: "ライブセッションの日程変更はどこからできますか？" },
  { from: adminId, daysAgo: 19, time: "18:45", text: "「ライブセッション」タブの予定一覧から変更できます。前日までの変更をお願いしております。" },
  { from: studentId, daysAgo: 19, time: "19:00", text: "わかりました。ありがとうございます！" },
]);
if (adminChats) {
  await setLastRead(adminRoom, studentId, adminChats[adminChats.length - 1]);
  await setLastRead(adminRoom, adminId, adminChats[adminChats.length - 1]);
}
console.log(`運営との1対1: ${adminRoom} ${adminChats ? `（${adminChats.length}件投入）` : "（投入済み）"}`);

// --- グループ ---------------------------------------------------------------
const groupRoom = await ensureGroupRoom([
  { id: studentId, type: "1" },
  { id: coachId, type: "2" },
  { id: adminId, type: "0" },
]);
const groupChats = await seedMessages(groupRoom, [
  { from: adminId, daysAgo: 6, time: "11:00", text: "表示確認用のグループです。生徒・コーチ・運営の3名が参加しています。" },
  { from: coachId, daysAgo: 6, time: "11:20", text: "Hello everyone! Nice to meet you." },
  { from: studentId, daysAgo: 5, time: "08:15", text: "よろしくお願いします。" },
  { from: adminId, daysAgo: 1, time: "15:30", text: "来月からセッションの録画機能が使えるようになります。詳しくはお知らせをご確認ください。" },
]);
if (groupChats) {
  await setLastRead(groupRoom, studentId, groupChats[groupChats.length - 2]);
  await setLastRead(groupRoom, coachId, groupChats[groupChats.length - 1]);
  await setLastRead(groupRoom, adminId, groupChats[groupChats.length - 1]);
}
console.log(`グループ: ${groupRoom} ${groupChats ? `（${groupChats.length}件投入）` : "（投入済み）"}`);
