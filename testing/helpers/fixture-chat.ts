/**
 * 固定アカウント（testing/FIXTURES.md）のチャットルームと会話履歴を投入する共通処理。
 * 日付をさかのぼった時刻で投入するため service_role で書き込む（業務ロジックRPCは呼ばない）。
 * 状態ペルソナ（features/fixtures/seed-chat-rooms.ts）と利用者ペルソナ（seed-user-personas.ts）から使う。
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export interface ChatMessageSeed {
  from: string;
  text: string;
  at: Date;
}

export function createChatKit(admin: SupabaseClient) {
  async function ensureOneOnOneRoom(userA: string, userB: string): Promise<string> {
    const { data, error } = await admin
      .rpc("fn_ensure_one_on_one_chat_room", { p_user_a: userA, p_user_b: userB })
      .single<{ room_id: string; created: boolean }>();
    if (error || !data) throw error ?? new Error("fn_ensure_one_on_one_chat_room failed");
    return data.room_id;
  }

  /** 履歴が無いルームにだけメッセージを投入する。投入した chat_id を古い順に返す（投入済みなら null） */
  async function seedMessages(roomId: string, messages: ChatMessageSeed[]): Promise<string[] | null> {
    const { count } = await admin.from("com_t_chat").select("chat_id", { count: "exact", head: true }).eq("room_id", roomId);
    if ((count ?? 0) > 0) return null;

    const rows = messages.map((m) => ({ room_id: roomId, sender_user_id: m.from, message: m.text, message_type: "TEXT", created_at: m.at.toISOString() }));
    const { data, error } = await admin.from("com_t_chat").insert(rows).select("chat_id, created_at");
    if (error) throw error;
    return [...data].sort((a, b) => a.created_at.localeCompare(b.created_at)).map((r) => r.chat_id as string);
  }

  async function setLastRead(roomId: string, userId: string, chatId: string): Promise<void> {
    const { error } = await admin
      .from("com_t_chat_room_user")
      .update({ last_read_chat_id: chatId })
      .eq("room_id", roomId)
      .eq("user_id", userId);
    if (error) throw error;
  }

  return { ensureOneOnOneRoom, seedMessages, setLastRead };
}
