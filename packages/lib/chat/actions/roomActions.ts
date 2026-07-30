'use server';

import { createServerClient } from '@gabby/lib/supabase/server';
import { createAdminClient } from '@gabby/lib/supabase/admin';
import { createLogger, getLogContext } from '@gabby/lib/logger';
import { USER_TYPES } from '@gabby/types/user';
import {
  ChatMessage,
  ChatRoomListItem,
  ChatTargetUser,
  CreateChatRoomPayload,
} from '@gabby/types/chat';

const logger = createLogger('common');

/**
 * ログインユーザーの認証情報 + DB上のuser_typeを取得する。
 * JWTのapp_metadataではなくDBを正とする（ロール変更直後の反映遅延を避けるため）。
 */
async function getCurrentUserWithType(): Promise<{ id: string; user_type: string } | null> {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from('com_m_user')
    .select('id, user_type')
    .eq('id', user.id)
    .single();

  if (!profile) return null;
  return { id: user.id, user_type: profile.user_type as string };
}

/**
 * Admin がルーム作成時に選択する宛先ユーザー一覧（生徒・コーチ）を取得
 */
export async function getChatRoomTargetUsers(): Promise<{
  success: boolean;
  data: ChatTargetUser[];
  error?: string;
}> {
  const ctx = await getLogContext();
  try {
    const currentUser = await getCurrentUserWithType();
    if (!currentUser || currentUser.user_type !== USER_TYPES.ADMIN) {
      return { success: false, data: [], error: 'Unauthorized' };
    }

    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from('com_m_user')
      .select('id, user_name, user_type')
      .in('user_type', [USER_TYPES.STUDENT, USER_TYPES.COACH])
      .eq('delete_flg', '0')
      .order('user_name', { ascending: true });

    if (error) {
      logger.error('chat:get_target_users_failed', error.message, ctx);
      return { success: false, data: [], error: error.message };
    }

    return { success: true, data: (data || []) as ChatTargetUser[] };
  } catch (err) {
    logger.error('chat:get_target_users_unexpected', err instanceof Error ? err.message : 'Unknown error', ctx);
    return { success: false, data: [], error: 'Unexpected error' };
  }
}

/**
 * チャットルーム作成（Adminのみ）
 * 同一メンバー構成（自分 + 対象ユーザーの2人部屋）のアクティブなルームが既にあれば、それを返す。
 */
export async function createChatRoom(
  payload: CreateChatRoomPayload
): Promise<{ success: boolean; roomId?: string; error?: string }> {
  const ctx = await getLogContext();
  try {
    const currentUser = await getCurrentUserWithType();
    if (!currentUser) return { success: false, error: 'Unauthorized' };

    if (currentUser.user_type !== USER_TYPES.ADMIN) {
      logger.warn('chat:create_room_forbidden', 'Non-admin user attempted to create a chat room', {
        ...ctx,
        payload,
      });
      return { success: false, error: 'Only admins can create chat rooms' };
    }

    // Admin操作のためRLSをバイパスして相手ユーザー行のINSERT等を確実に行う
    const supabase = createAdminClient();

    const { data: targetProfile, error: targetError } = await supabase
      .from('com_m_user')
      .select('id, user_type')
      .eq('id', payload.targetUserId)
      .single();

    if (targetError || !targetProfile) {
      return { success: false, error: 'Target user not found' };
    }

    const existingRoomId = await findExistingTwoPersonRoom(supabase, currentUser.id, payload.targetUserId);
    if (existingRoomId) {
      return { success: true, roomId: existingRoomId };
    }

    const { data: newRoom, error: roomError } = await supabase
      .from('com_t_chat_room')
      .insert({ room_type: payload.roomType })
      .select('room_id')
      .single();

    if (roomError || !newRoom) {
      logger.error('chat:create_room_failed', roomError?.message || 'Unknown error', { ...ctx, payload });
      return { success: false, error: roomError?.message || 'Failed to create chat room' };
    }

    const { error: memberError } = await supabase.from('com_t_chat_room_user').insert([
      { room_id: newRoom.room_id, user_id: currentUser.id, user_type: currentUser.user_type },
      { room_id: newRoom.room_id, user_id: payload.targetUserId, user_type: targetProfile.user_type },
    ]);

    if (memberError) {
      logger.error('chat:create_room_members_failed', memberError.message, {
        ...ctx,
        payload: { roomId: newRoom.room_id },
      });
      return { success: false, error: memberError.message };
    }

    logger.info('chat:create_room_success', `Chat room created: ${newRoom.room_id}`, {
      ...ctx,
      payload: { roomId: newRoom.room_id },
    });

    return { success: true, roomId: newRoom.room_id };
  } catch (err) {
    logger.error('chat:create_room_unexpected', err instanceof Error ? err.message : 'Unknown error', ctx);
    return { success: false, error: 'Unexpected error' };
  }
}

/**
 * 自分と対象ユーザーだけが参加している、クローズされていないルームを探す（重複作成防止）
 */
async function findExistingTwoPersonRoom(
  supabase: ReturnType<typeof createAdminClient>,
  userId: string,
  targetUserId: string
): Promise<string | null> {
  const { data: myRooms } = await supabase
    .from('com_t_chat_room_user')
    .select('room_id')
    .eq('user_id', userId)
    .is('left_at', null);

  const myRoomIds = (myRooms || []).map((r) => r.room_id);
  if (myRoomIds.length === 0) return null;

  const { data: sharedRooms } = await supabase
    .from('com_t_chat_room_user')
    .select('room_id, com_t_chat_room!inner(closed_at)')
    .eq('user_id', targetUserId)
    .is('left_at', null)
    .in('room_id', myRoomIds);

  for (const shared of sharedRooms || []) {
    const room = Array.isArray(shared.com_t_chat_room) ? shared.com_t_chat_room[0] : shared.com_t_chat_room;
    if (room?.closed_at) continue;

    const { count } = await supabase
      .from('com_t_chat_room_user')
      .select('room_id', { count: 'exact', head: true })
      .eq('room_id', shared.room_id)
      .is('left_at', null);

    // 将来の1対多対応時はこの「2人部屋」判定を拡張する
    if (count === 2) {
      return shared.room_id;
    }
  }

  return null;
}

/**
 * ログインユーザーが参加中のルーム一覧を、最新メッセージ・未読件数・参加者情報付きで取得
 */
export async function getChatRooms(): Promise<{
  success: boolean;
  data: ChatRoomListItem[];
  error?: string;
}> {
  const ctx = await getLogContext();
  try {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, data: [], error: 'Unauthorized' };

    const { data: myMemberships, error: memberError } = await supabase
      .from('com_t_chat_room_user')
      .select('room_id, last_read_chat_id, com_t_chat_room(room_id, room_type, created_at, closed_at)')
      .eq('user_id', user.id)
      .is('left_at', null);

    if (memberError) {
      logger.error('chat:get_rooms_failed', memberError.message, ctx);
      return { success: false, data: [], error: memberError.message };
    }

    const roomIds = (myMemberships || []).map((m) => m.room_id);
    if (roomIds.length === 0) return { success: true, data: [] };

    const lastReadChatIds = (myMemberships || [])
      .map((m) => m.last_read_chat_id)
      .filter((id): id is string => Boolean(id));

    const [{ data: allMembers }, { data: recentMessages }, { data: lastReadMessages }] = await Promise.all([
      supabase
        .from('com_t_chat_room_user')
        .select('room_id, user_id, user_type, com_m_user(user_name)')
        .in('room_id', roomIds)
        .is('left_at', null),
      // 直近メッセージのみを対象に「最新メッセージ」「未読件数」を算出する（大量履歴を毎回全走査しないための現実的な上限）
      supabase
        .from('com_t_chat')
        .select('*')
        .in('room_id', roomIds)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(500),
      lastReadChatIds.length > 0
        ? supabase.from('com_t_chat').select('chat_id, created_at').in('chat_id', lastReadChatIds)
        : Promise.resolve({ data: [] as { chat_id: string; created_at: string }[] }),
    ]);

    const lastReadCreatedAtByChatId = new Map((lastReadMessages || []).map((m) => [m.chat_id, m.created_at]));

    const lastReadCreatedAtByRoom = new Map<string, string | null>();
    for (const membership of myMemberships || []) {
      const createdAt = membership.last_read_chat_id
        ? lastReadCreatedAtByChatId.get(membership.last_read_chat_id) ?? null
        : null;
      lastReadCreatedAtByRoom.set(membership.room_id, createdAt);
    }

    const lastMessageByRoom = new Map<string, ChatMessage>();
    const unreadCountByRoom = new Map<string, number>();

    for (const msg of recentMessages || []) {
      if (!lastMessageByRoom.has(msg.room_id)) {
        lastMessageByRoom.set(msg.room_id, msg as ChatMessage);
      }
      const lastReadAt = lastReadCreatedAtByRoom.get(msg.room_id);
      const isUnread = msg.sender_user_id !== user.id && (!lastReadAt || msg.created_at > lastReadAt);
      if (isUnread) {
        unreadCountByRoom.set(msg.room_id, (unreadCountByRoom.get(msg.room_id) || 0) + 1);
      }
    }

    const membersByRoom = new Map<string, ChatRoomListItem['members']>();
    for (const m of (allMembers || []) as any[]) {
      const list = membersByRoom.get(m.room_id) || [];
      const userInfo = Array.isArray(m.com_m_user) ? m.com_m_user[0] : m.com_m_user;
      list.push({ user_id: m.user_id, user_name: userInfo?.user_name ?? null, user_type: m.user_type });
      membersByRoom.set(m.room_id, list);
    }

    const rooms: ChatRoomListItem[] = (myMemberships || [])
      .map((m) => {
        const room = Array.isArray(m.com_t_chat_room) ? m.com_t_chat_room[0] : (m.com_t_chat_room as any);
        if (!room) return null;
        return {
          ...room,
          last_message: lastMessageByRoom.get(m.room_id) ?? null,
          unread_count: unreadCountByRoom.get(m.room_id) ?? 0,
          members: membersByRoom.get(m.room_id) ?? [],
        } as ChatRoomListItem;
      })
      .filter((r): r is ChatRoomListItem => r !== null)
      .sort((a, b) => {
        const aTime = a.last_message?.created_at ?? a.created_at;
        const bTime = b.last_message?.created_at ?? b.created_at;
        return bTime.localeCompare(aTime);
      });

    return { success: true, data: rooms };
  } catch (err) {
    logger.error('chat:get_rooms_unexpected', err instanceof Error ? err.message : 'Unknown error', ctx);
    return { success: false, data: [], error: 'Unexpected error' };
  }
}
