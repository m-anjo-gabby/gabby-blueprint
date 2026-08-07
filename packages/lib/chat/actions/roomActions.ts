'use server';

import { createServerClient } from '@gabby/lib/supabase/server';
import { createAdminClient } from '@gabby/lib/supabase/admin';
import { createLogger, getLogContext } from '@gabby/lib/logger';
import { USER_TYPES, UserType } from '@gabby/types/user';
import {
  AddChatRoomMemberPayload,
  CHAT_ROOM_TYPES,
  ChatMessage,
  ChatRoom,
  ChatRoomListItem,
  ChatRoomMemberSummary,
  ChatTargetUser,
  CreateChatRoomPayload,
  RemoveChatRoomMemberPayload,
} from '@gabby/types/chat';

// ルーム作成で選択可能なuser_type
const HUMAN_USER_TYPES: readonly UserType[] = [USER_TYPES.ADMIN, USER_TYPES.STUDENT, USER_TYPES.COACH];

// GROUPルームが維持すべき最低参加人数（これを下回る削除は拒否する）
const MIN_GROUP_ROOM_MEMBERS = 2;

const logger = createLogger('common');

/**
 * ログインユーザーの認証情報 + DB上のuser_typeを取得する。
 * JWTのapp_metadataではなくDBを正とする（ロール変更直後の反映遅延を避けるため）。
 */
export async function getCurrentUserWithType(): Promise<{ id: string; user_type: string } | null> {
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
 * Admin がルーム作成時に選択する候補ユーザー一覧（Admin・生徒・コーチ）を取得
 * Admin-Coach / Admin-Student / Coach-Student のいずれの組み合わせも作成できるよう、
 * Admin自身を含む全ユーザー種別を候補として返す。
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
      .select('id, user_name, user_type, client_id')
      .in('user_type', HUMAN_USER_TYPES)
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
 * チャットルーム作成（Adminのみ実行可能）
 * roomType: '1ON1' の場合、memberIds に指定した異なる種別の2名でルームを作成する
 * （Admin-Coach / Admin-Student / Coach-Student）。同一メンバー構成のアクティブなルームが
 * 既にあれば、それを返す（重複作成防止）。
 * roomType: 'GROUP' の場合、memberIds に指定した2名以上でルームを作成する（種別の組み合わせ
 * 制限なし、roomName必須）。重複作成防止は行わない（作成のたびに新規ルームとなる）。
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

    if (payload.roomType === CHAT_ROOM_TYPES.GROUP) {
      return createGroupChatRoom(payload, ctx);
    }
    return createOneOnOneChatRoom(payload, ctx);
  } catch (err) {
    logger.error('chat:create_room_unexpected', err instanceof Error ? err.message : 'Unknown error', ctx);
    return { success: false, error: 'Unexpected error' };
  }
}

async function createOneOnOneChatRoom(
  payload: CreateChatRoomPayload,
  ctx: Awaited<ReturnType<typeof getLogContext>>
): Promise<{ success: boolean; roomId?: string; error?: string }> {
  const [memberIdA, memberIdB] = payload.memberIds;
  if (!memberIdA || !memberIdB || payload.memberIds.length !== 2 || memberIdA === memberIdB) {
    return { success: false, error: 'Please select two different users' };
  }

  // Admin操作のためRLSをバイパスして相手ユーザー行のINSERT等を確実に行う
  const supabase = createAdminClient();

  const { data: profiles, error: profileError } = await supabase
    .from('com_m_user')
    .select('id, user_type')
    .in('id', [memberIdA, memberIdB]);

  const profileA = profiles?.find((p) => p.id === memberIdA);
  const profileB = profiles?.find((p) => p.id === memberIdB);

  if (profileError || !profileA || !profileB) {
    return { success: false, error: 'Target user not found' };
  }

  if (
    profileA.user_type === profileB.user_type ||
    !HUMAN_USER_TYPES.includes(profileA.user_type as UserType) ||
    !HUMAN_USER_TYPES.includes(profileB.user_type as UserType)
  ) {
    // 許可される組み合わせ: Admin-Coach / Admin-Student / Coach-Student（同一種別同士は不可）
    return { success: false, error: 'Invalid member combination' };
  }

  const existingRoomId = await findExistingTwoPersonRoom(supabase, memberIdA, memberIdB);
  if (existingRoomId) {
    return { success: true, roomId: existingRoomId };
  }

  const { data: newRoom, error: roomError } = await supabase
    .from('com_t_chat_room')
    .insert({ room_type: CHAT_ROOM_TYPES.ONE_ON_ONE })
    .select('room_id')
    .single();

  if (roomError || !newRoom) {
    logger.error('chat:create_room_failed', roomError?.message || 'Unknown error', { ...ctx, payload });
    return { success: false, error: roomError?.message || 'Failed to create chat room' };
  }

  const { error: memberError } = await supabase.from('com_t_chat_room_user').insert([
    { room_id: newRoom.room_id, user_id: profileA.id, user_type: profileA.user_type },
    { room_id: newRoom.room_id, user_id: profileB.id, user_type: profileB.user_type },
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
}

async function createGroupChatRoom(
  payload: CreateChatRoomPayload,
  ctx: Awaited<ReturnType<typeof getLogContext>>
): Promise<{ success: boolean; roomId?: string; error?: string }> {
  const roomName = payload.roomName?.trim();
  if (!roomName) {
    return { success: false, error: 'Please enter a room name' };
  }

  const memberIds = Array.from(new Set(payload.memberIds));
  if (memberIds.length < 2) {
    return { success: false, error: 'Please select at least two participants' };
  }

  // Admin操作のためRLSをバイパスして参加者行のINSERT等を確実に行う
  const supabase = createAdminClient();

  const { data: profiles, error: profileError } = await supabase
    .from('com_m_user')
    .select('id, user_type')
    .in('id', memberIds);

  if (profileError || !profiles || profiles.length !== memberIds.length) {
    return { success: false, error: 'Target user not found' };
  }

  if (profiles.some((p) => !HUMAN_USER_TYPES.includes(p.user_type as UserType))) {
    return { success: false, error: 'Invalid member combination' };
  }

  const { data: newRoom, error: roomError } = await supabase
    .from('com_t_chat_room')
    .insert({ room_type: CHAT_ROOM_TYPES.GROUP, room_name: roomName })
    .select('room_id')
    .single();

  if (roomError || !newRoom) {
    logger.error('chat:create_room_failed', roomError?.message || 'Unknown error', { ...ctx, payload });
    return { success: false, error: roomError?.message || 'Failed to create chat room' };
  }

  const { error: memberError } = await supabase.from('com_t_chat_room_user').insert(
    profiles.map((p) => ({ room_id: newRoom.room_id, user_id: p.id, user_type: p.user_type }))
  );

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
}

/**
 * memberIdA と memberIdB だけが参加している、クローズされていないルームを探す（重複作成防止）
 */
async function findExistingTwoPersonRoom(
  supabase: ReturnType<typeof createAdminClient>,
  memberIdA: string,
  memberIdB: string
): Promise<string | null> {
  const { data: roomsOfA } = await supabase
    .from('com_t_chat_room_user')
    .select('room_id')
    .eq('user_id', memberIdA)
    .is('left_at', null);

  const roomIdsOfA = (roomsOfA || []).map((r) => r.room_id);
  if (roomIdsOfA.length === 0) return null;

  const { data: sharedRooms } = await supabase
    .from('com_t_chat_room_user')
    .select('room_id, com_t_chat_room!inner(closed_at)')
    .eq('user_id', memberIdB)
    .is('left_at', null)
    .in('room_id', roomIdsOfA);

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
 * 【Admin専用・GROUPルームのみ】参加者を追加する。
 * 過去に退出済み（left_at設定済み）のユーザーを指定した場合は再参加として扱う。
 */
export async function addChatRoomMember(
  payload: AddChatRoomMemberPayload
): Promise<{ success: boolean; member?: ChatRoomMemberSummary; error?: string }> {
  const ctx = await getLogContext();
  try {
    const currentUser = await getCurrentUserWithType();
    if (!currentUser) return { success: false, error: 'Unauthorized' };

    if (currentUser.user_type !== USER_TYPES.ADMIN) {
      logger.warn('chat:add_member_forbidden', 'Non-admin user attempted to add a chat room member', {
        ...ctx,
        payload,
      });
      return { success: false, error: 'Only admins can manage chat room participants' };
    }

    // Admin操作のためRLSをバイパスして参加者行のINSERT/UPDATEを確実に行う
    const supabase = createAdminClient();

    const { data: room } = await supabase
      .from('com_t_chat_room')
      .select('room_id, room_type')
      .eq('room_id', payload.roomId)
      .maybeSingle();

    if (!room) return { success: false, error: 'Room not found' };
    if (room.room_type !== CHAT_ROOM_TYPES.GROUP) {
      return { success: false, error: 'Participants can only be managed for group rooms' };
    }

    const { data: profile } = await supabase
      .from('com_m_user')
      .select('id, user_name, user_type, icon_path, client_id, delete_flg, com_m_client(client_name)')
      .eq('id', payload.userId)
      .maybeSingle();

    if (!profile || profile.delete_flg !== '0' || !HUMAN_USER_TYPES.includes(profile.user_type as UserType)) {
      return { success: false, error: 'Target user not found' };
    }

    const { data: existingRow } = await supabase
      .from('com_t_chat_room_user')
      .select('room_id, user_id, left_at')
      .eq('room_id', payload.roomId)
      .eq('user_id', payload.userId)
      .maybeSingle();

    if (existingRow && existingRow.left_at === null) {
      return { success: false, error: 'User is already a member of this room' };
    }

    const { error: memberError } = existingRow
      ? await supabase
          .from('com_t_chat_room_user')
          .update({ left_at: null, joined_at: new Date().toISOString(), user_type: profile.user_type })
          .eq('room_id', payload.roomId)
          .eq('user_id', payload.userId)
      : await supabase
          .from('com_t_chat_room_user')
          .insert({ room_id: payload.roomId, user_id: profile.id, user_type: profile.user_type });

    if (memberError) {
      logger.error('chat:add_member_failed', memberError.message, { ...ctx, payload });
      return { success: false, error: memberError.message };
    }

    logger.info('chat:add_member_success', `Member added to room: ${payload.roomId}`, { ...ctx, payload });

    const clientInfo = Array.isArray(profile.com_m_client) ? profile.com_m_client[0] : profile.com_m_client;

    return {
      success: true,
      member: {
        user_id: profile.id,
        user_name: profile.user_name,
        user_type: profile.user_type,
        icon_path: profile.icon_path,
        client_id: profile.client_id,
        client_name: clientInfo?.client_name ?? null,
      },
    };
  } catch (err) {
    logger.error('chat:add_member_unexpected', err instanceof Error ? err.message : 'Unknown error', ctx);
    return { success: false, error: 'Unexpected error' };
  }
}

/**
 * 【Admin専用・GROUPルームのみ】参加者を削除する（退出処理。left_atを設定する論理削除）。
 * 残り人数が MIN_GROUP_ROOM_MEMBERS を下回る削除は拒否する。
 */
export async function removeChatRoomMember(
  payload: RemoveChatRoomMemberPayload
): Promise<{ success: boolean; error?: string }> {
  const ctx = await getLogContext();
  try {
    const currentUser = await getCurrentUserWithType();
    if (!currentUser) return { success: false, error: 'Unauthorized' };

    if (currentUser.user_type !== USER_TYPES.ADMIN) {
      logger.warn('chat:remove_member_forbidden', 'Non-admin user attempted to remove a chat room member', {
        ...ctx,
        payload,
      });
      return { success: false, error: 'Only admins can manage chat room participants' };
    }

    // Admin操作のためRLSをバイパスして参加者行のUPDATEを確実に行う
    const supabase = createAdminClient();

    const { data: room } = await supabase
      .from('com_t_chat_room')
      .select('room_id, room_type')
      .eq('room_id', payload.roomId)
      .maybeSingle();

    if (!room) return { success: false, error: 'Room not found' };
    if (room.room_type !== CHAT_ROOM_TYPES.GROUP) {
      return { success: false, error: 'Participants can only be managed for group rooms' };
    }

    const { count: activeCount } = await supabase
      .from('com_t_chat_room_user')
      .select('room_id', { count: 'exact', head: true })
      .eq('room_id', payload.roomId)
      .is('left_at', null);

    if ((activeCount ?? 0) <= MIN_GROUP_ROOM_MEMBERS) {
      return { success: false, error: `Group rooms need at least ${MIN_GROUP_ROOM_MEMBERS} participants` };
    }

    const { data: updatedRows, error: updateError } = await supabase
      .from('com_t_chat_room_user')
      .update({ left_at: new Date().toISOString() })
      .eq('room_id', payload.roomId)
      .eq('user_id', payload.userId)
      .is('left_at', null)
      .select('user_id');

    if (updateError) {
      logger.error('chat:remove_member_failed', updateError.message, { ...ctx, payload });
      return { success: false, error: updateError.message };
    }

    if (!updatedRows || updatedRows.length === 0) {
      return { success: false, error: 'User is not an active member of this room' };
    }

    logger.info('chat:remove_member_success', `Member removed from room: ${payload.roomId}`, { ...ctx, payload });

    return { success: true };
  } catch (err) {
    logger.error('chat:remove_member_unexpected', err instanceof Error ? err.message : 'Unknown error', ctx);
    return { success: false, error: 'Unexpected error' };
  }
}

/**
 * ルーム一覧の最新メッセージ取得結果を ChatMessage 形式に正規化する。
 * 一覧プレビューには添付ファイルの明細までは不要なため attachments は空配列とする
 * （プレビュー文言は message_type から組み立てる。詳細は getChatMessagePreviewText 参照）。
 * 論理削除済みメッセージは本文もマスクする。
 */
function normalizeAndMaskIfDeleted(raw: ChatMessage): ChatMessage {
  return raw.deleted_at ? { ...raw, message: '', attachments: [] } : { ...raw, attachments: [] };
}

interface RoomBase {
  room_id: string;
  room_type: string;
  room_name: string | null;
  created_at: string;
  closed_at: string | null;
}

/**
 * ルーム一覧を、最新メッセージ・未読件数・参加者情報付きで組み立てる共通ロジック。
 * myMembershipByRoom に含まれないルームは「自分が参加していない（=Adminの査閲対象）」として
 * is_member=false・unread_count=0 を返す。
 */
async function buildChatRoomListItems(
  // createServerClient / createAdminClient のいずれでも呼べるよう緩く型付け
  supabase: any,
  rooms: RoomBase[],
  currentUserId: string,
  myMembershipByRoom: Map<string, { last_read_chat_id: string | null }>
): Promise<ChatRoomListItem[]> {
  const roomIds = rooms.map((r) => r.room_id);
  if (roomIds.length === 0) return [];

  const lastReadChatIds = Array.from(myMembershipByRoom.values())
    .map((m) => m.last_read_chat_id)
    .filter((id): id is string => Boolean(id));

  const [{ data: allMembers }, { data: recentMessages }, { data: lastReadMessages }] = await Promise.all([
    supabase
      .from('com_t_chat_room_user')
      .select('room_id, user_id, user_type, com_m_user(user_name, icon_path, client_id, com_m_client(client_name))')
      .in('room_id', roomIds)
      .is('left_at', null),
    // 直近メッセージのみを対象に「最新メッセージ」「未読件数」を算出する（大量履歴を毎回全走査しないための現実的な上限）
    supabase
      .from('com_t_chat')
      .select('*')
      .in('room_id', roomIds)
      .order('created_at', { ascending: false })
      .limit(500),
    lastReadChatIds.length > 0
      ? supabase.from('com_t_chat').select('chat_id, created_at').in('chat_id', lastReadChatIds)
      : Promise.resolve({ data: [] as { chat_id: string; created_at: string }[] }),
  ]);

  const lastReadCreatedAtByChatId = new Map(
    (lastReadMessages || []).map((m: { chat_id: string; created_at: string }) => [m.chat_id, m.created_at])
  );

  const lastMessageByRoom = new Map<string, ChatMessage>();
  const unreadCountByRoom = new Map<string, number>();

  for (const raw of (recentMessages || []) as ChatMessage[]) {
    const msg = normalizeAndMaskIfDeleted(raw);
    if (!lastMessageByRoom.has(msg.room_id)) {
      lastMessageByRoom.set(msg.room_id, msg);
    }

    // 非参加ルーム（Adminの査閲対象）は未読集計の対象外
    const membership = myMembershipByRoom.get(msg.room_id);
    if (!membership) continue;

    const lastReadAt = membership.last_read_chat_id
      ? lastReadCreatedAtByChatId.get(membership.last_read_chat_id) ?? null
      : null;
    const isUnread = msg.sender_user_id !== currentUserId && (!lastReadAt || msg.created_at > lastReadAt);
    if (isUnread) {
      unreadCountByRoom.set(msg.room_id, (unreadCountByRoom.get(msg.room_id) || 0) + 1);
    }
  }

  const membersByRoom = new Map<string, ChatRoomListItem['members']>();
  for (const m of (allMembers || []) as any[]) {
    const list = membersByRoom.get(m.room_id) || [];
    const userInfo = Array.isArray(m.com_m_user) ? m.com_m_user[0] : m.com_m_user;
    const clientInfo = Array.isArray(userInfo?.com_m_client) ? userInfo.com_m_client[0] : userInfo?.com_m_client;
    list.push({
      user_id: m.user_id,
      user_name: userInfo?.user_name ?? null,
      user_type: m.user_type,
      icon_path: userInfo?.icon_path ?? null,
      client_id: userInfo?.client_id ?? null,
      client_name: clientInfo?.client_name ?? null,
    });
    membersByRoom.set(m.room_id, list);
  }

  return rooms
    .map(
      (room) =>
        ({
          ...room,
          last_message: lastMessageByRoom.get(room.room_id) ?? null,
          unread_count: unreadCountByRoom.get(room.room_id) ?? 0,
          members: membersByRoom.get(room.room_id) ?? [],
          is_member: myMembershipByRoom.has(room.room_id),
        }) as ChatRoomListItem
    )
    .sort((a, b) => {
      const aTime = a.last_message?.created_at ?? a.created_at;
      const bTime = b.last_message?.created_at ?? b.created_at;
      return bTime.localeCompare(aTime);
    });
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
      .select('room_id, last_read_chat_id')
      .eq('user_id', user.id)
      .is('left_at', null);

    if (memberError) {
      logger.error('chat:get_rooms_failed', memberError.message, ctx);
      return { success: false, data: [], error: memberError.message };
    }

    const myMembershipByRoom = new Map(
      (myMemberships || []).map((m) => [m.room_id, { last_read_chat_id: m.last_read_chat_id as string | null }])
    );

    const roomIds = Array.from(myMembershipByRoom.keys());
    let rooms: RoomBase[] = [];
    if (roomIds.length > 0) {
      const { data: roomRows, error: roomsError } = await supabase
        .from('com_t_chat_room')
        .select('room_id, room_type, room_name, created_at, closed_at')
        .in('room_id', roomIds);

      if (roomsError) {
        logger.error('chat:get_rooms_failed', roomsError.message, ctx);
        return { success: false, data: [], error: roomsError.message };
      }
      rooms = (roomRows || []) as RoomBase[];
    }

    const data = await buildChatRoomListItems(supabase, rooms, user.id, myMembershipByRoom);
    return { success: true, data };
  } catch (err) {
    logger.error('chat:get_rooms_unexpected', err instanceof Error ? err.message : 'Unknown error', ctx);
    return { success: false, data: [], error: 'Unexpected error' };
  }
}

/**
 * 【Admin専用】非参加ルームも含む全チャットルームを査閲用に取得する
 */
export async function getAllChatRoomsForAdmin(): Promise<{
  success: boolean;
  data: ChatRoomListItem[];
  error?: string;
}> {
  const ctx = await getLogContext();
  try {
    const currentUser = await getCurrentUserWithType();
    if (!currentUser) return { success: false, data: [], error: 'Unauthorized' };
    if (currentUser.user_type !== USER_TYPES.ADMIN) {
      return { success: false, data: [], error: 'Only admins can view all chat rooms' };
    }

    const supabase = await createServerClient();

    const { data: allRooms, error: roomsError } = await supabase
      .from('com_t_chat_room')
      .select('room_id, room_type, room_name, created_at, closed_at');

    if (roomsError) {
      logger.error('chat:get_all_rooms_failed', roomsError.message, ctx);
      return { success: false, data: [], error: roomsError.message };
    }

    const { data: myMemberships } = await supabase
      .from('com_t_chat_room_user')
      .select('room_id, last_read_chat_id')
      .eq('user_id', currentUser.id)
      .is('left_at', null);

    const myMembershipByRoom = new Map(
      (myMemberships || []).map((m) => [m.room_id, { last_read_chat_id: m.last_read_chat_id as string | null }])
    );

    const data = await buildChatRoomListItems(supabase, (allRooms || []) as RoomBase[], currentUser.id, myMembershipByRoom);
    return { success: true, data };
  } catch (err) {
    logger.error('chat:get_all_rooms_unexpected', err instanceof Error ? err.message : 'Unknown error', ctx);
    return { success: false, data: [], error: 'Unexpected error' };
  }
}

/**
 * ルーム詳細（参加者一覧・自分が参加者かどうか）を取得する。
 * 非参加ルームはRLSにより非Adminからは取得できない（Adminは査閲のため取得可能）。
 */
export async function getChatRoomDetail(roomId: string): Promise<{
  success: boolean;
  data?: { room: ChatRoom; members: ChatRoomListItem['members']; isMember: boolean };
  error?: string;
}> {
  const ctx = await getLogContext();
  try {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: 'Unauthorized' };

    const { data: room, error: roomError } = await supabase
      .from('com_t_chat_room')
      .select('room_id, room_type, room_name, created_at, closed_at')
      .eq('room_id', roomId)
      .maybeSingle();

    if (roomError || !room) {
      return { success: false, error: 'Room not found' };
    }

    const { data: members } = await supabase
      .from('com_t_chat_room_user')
      .select('user_id, user_type, com_m_user(user_name, icon_path, client_id, com_m_client(client_name))')
      .eq('room_id', roomId)
      .is('left_at', null);

    const memberList = ((members || []) as any[]).map((m) => {
      const userInfo = Array.isArray(m.com_m_user) ? m.com_m_user[0] : m.com_m_user;
      const clientInfo = Array.isArray(userInfo?.com_m_client) ? userInfo.com_m_client[0] : userInfo?.com_m_client;
      return {
        user_id: m.user_id as string,
        user_name: (userInfo?.user_name ?? null) as string | null,
        user_type: m.user_type,
        icon_path: (userInfo?.icon_path ?? null) as string | null,
        client_id: (userInfo?.client_id ?? null) as string | null,
        client_name: (clientInfo?.client_name ?? null) as string | null,
      };
    });

    const isMember = memberList.some((m) => m.user_id === user.id);

    return { success: true, data: { room: room as ChatRoom, members: memberList, isMember } };
  } catch (err) {
    logger.error('chat:get_room_detail_unexpected', err instanceof Error ? err.message : 'Unknown error', {
      ...ctx,
      payload: { roomId },
    });
    return { success: false, error: 'Unexpected error' };
  }
}
