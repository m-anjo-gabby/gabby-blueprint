import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient, signInAsRole, signOutRole } from "../../helpers/auth.ts";
import { getPersonaPassword, PERSONAS } from "./personas.ts";

/**
 * チャットのE2E用の使い捨てルーム。
 * 固定アカウント（生徒01・担当外コーチUS01）の間に、テストごとに1対1とグループのルームを作り、テスト後に削除する。
 * 固定のチャットルーム（seed-chat-rooms.ts）の既読・未読の状態は変更しない（e2e/CONVENTIONS.md 3章）。
 * - ルームの作成・後始末は service_role で行う
 * - コーチ側の操作（送信・既読）は、実際にサインインしたコーチのJWTで行う（RLS配下の操作のため。CLAUDE.md 6章）
 */

const COACH_EMAIL = "qa-coach-us-01@gabby-qa-test.example";
/** 使い捨てデータの目印（固定フィクスチャと区別する。FIXTURES.md） */
const ROOM_NAME_PREFIX = "【QAテスト】チャットE2E";

export interface ChatE2EFixture {
  admin: SupabaseClient;
  coach: SupabaseClient;
  studentId: string;
  coachId: string;
  coachName: string;
  /** 1対1ルーム（コーチの発言3件のうち、最後の2件が生徒の未読） */
  oneOnOneRoomId: string;
  /** グループルーム（生徒・コーチの2名） */
  groupRoomId: string;
  groupRoomName: string;
  /** 1対1ルームに投入したコーチの発言（古い順） */
  coachMessages: string[];
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

async function createRoom(
  admin: SupabaseClient,
  roomType: "1ON1" | "GROUP",
  roomName: string,
  members: { id: string; type: string }[]
): Promise<string> {
  const { data: room, error } = await admin
    .from("com_t_chat_room")
    .insert({ room_type: roomType, room_name: roomName })
    .select("room_id")
    .single();
  if (error) throw new Error(`ルームの作成に失敗: ${error.message}`);
  const { error: memberError } = await admin
    .from("com_t_chat_room_user")
    .insert(members.map((m) => ({ room_id: room.room_id, user_id: m.id, user_type: m.type })));
  if (memberError) throw new Error(`参加者の登録に失敗: ${memberError.message}`);
  return room.room_id as string;
}

export async function createChatFixture(): Promise<ChatE2EFixture> {
  const admin = await createAdminClient();
  const studentId = await findUserIdByEmail(admin, PERSONAS.liveStudent.email);
  const coachId = await findUserIdByEmail(admin, COACH_EMAIL);
  const { data: coachUser } = await admin.from("com_m_user").select("user_name").eq("id", coachId).single();
  const tag = `${Date.now()}`;
  const members = [
    { id: studentId, type: "1" },
    { id: coachId, type: "2" },
  ];

  // 1対1ルームの表示名は相手の名前になるため、ルーム名は後始末用の目印としてだけ使う
  const oneOnOneRoomId = await createRoom(admin, "1ON1", `${ROOM_NAME_PREFIX}（${tag}）`, members);
  const groupRoomName = `${ROOM_NAME_PREFIX}グループ（${tag}）`;
  const groupRoomId = await createRoom(admin, "GROUP", groupRoomName, members);

  // 履歴（1時間前〜）。生徒は最初の1件だけ既読の状態にする
  const coachMessages = [`E2E message 1 (${tag})`, `E2E message 2 (${tag})`, `E2E message 3 (${tag})`];
  const base = Date.now() - 60 * 60 * 1000;
  const { data: chats, error } = await admin
    .from("com_t_chat")
    .insert(
      coachMessages.map((message, i) => ({
        room_id: oneOnOneRoomId,
        sender_user_id: coachId,
        message,
        message_type: "TEXT",
        created_at: new Date(base + i * 60 * 1000).toISOString(),
      }))
    )
    .select("chat_id, created_at");
  if (error) throw new Error(`メッセージの投入に失敗: ${error.message}`);
  const ordered = [...chats].sort((a, b) => a.created_at.localeCompare(b.created_at));
  await admin
    .from("com_t_chat_room_user")
    .update({ last_read_chat_id: ordered[0].chat_id })
    .eq("room_id", oneOnOneRoomId)
    .eq("user_id", studentId);
  await admin
    .from("com_t_chat_room_user")
    .update({ last_read_chat_id: ordered[ordered.length - 1].chat_id })
    .eq("room_id", oneOnOneRoomId)
    .eq("user_id", coachId);

  const coach = await signInAsRole(COACH_EMAIL, getPersonaPassword());
  return {
    admin,
    coach,
    studentId,
    coachId,
    coachName: (coachUser?.user_name as string | undefined) ?? "",
    oneOnOneRoomId,
    groupRoomId,
    groupRoomName,
    coachMessages,
  };
}

/** コーチとしてメッセージを送る（実JWT。通知トリガーも実運用と同じく動く） */
export async function sendAsCoach(fixture: ChatE2EFixture, roomId: string, message: string): Promise<void> {
  const { error } = await fixture.coach
    .from("com_t_chat")
    .insert({ room_id: roomId, sender_user_id: fixture.coachId, message, message_type: "TEXT" });
  if (error) throw new Error(`コーチの送信に失敗: ${error.message}`);
}

/** コーチがルームの最新メッセージまで読んだ状態にする（実JWT。自分の参加行の更新はRLSで許可されている） */
export async function markReadAsCoach(fixture: ChatE2EFixture, roomId: string): Promise<void> {
  const { data: latest } = await fixture.coach
    .from("com_t_chat")
    .select("chat_id")
    .eq("room_id", roomId)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();
  const { error } = await fixture.coach
    .from("com_t_chat_room_user")
    .update({ last_read_chat_id: latest!.chat_id })
    .eq("room_id", roomId)
    .eq("user_id", fixture.coachId);
  if (error) throw new Error(`コーチの既読化に失敗: ${error.message}`);
}

/** 使い捨てルームと、それに伴って作られたデータ（添付ファイルの実体・チャット新着通知）を削除する */
export async function cleanupChatFixture(fixture: ChatE2EFixture): Promise<void> {
  const { admin } = fixture;
  const roomIds = [fixture.oneOnOneRoomId, fixture.groupRoomId];

  const { data: chats } = await admin.from("com_t_chat").select("chat_id").in("room_id", roomIds);
  const chatIds = (chats ?? []).map((c) => c.chat_id as string);
  if (chatIds.length > 0) {
    const { data: attachments } = await admin.from("com_t_chat_attachment").select("file_path").in("chat_id", chatIds);
    const paths = (attachments ?? []).map((a) => a.file_path as string);
    if (paths.length > 0) await admin.storage.from("chat").remove(paths);
  }
  // 送信前に取り消された添付など、メッセージに紐付かないファイルもルームのフォルダごと消す
  for (const roomId of roomIds) {
    const { data: files } = await admin.storage.from("chat").list(`chat/${roomId}`);
    if (files && files.length > 0) await admin.storage.from("chat").remove(files.map((f) => `chat/${roomId}/${f.name}`));
  }

  await admin.from("com_t_notification").delete().eq("notification_type", "CHAT_NEW_MESSAGE").in("dedup_key", roomIds);
  // メッセージ・添付・参加者は ON DELETE CASCADE で消える
  const { error } = await admin.from("com_t_chat_room").delete().in("room_id", roomIds);
  if (error) throw new Error(`ルームの削除に失敗: ${error.message}`);
  await signOutRole(fixture.coach);
}
