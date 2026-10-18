'use server';

import { unstable_rethrow } from 'next/navigation';

import { createServerClient } from '@gabby/lib/supabase/server';
import { createAdminClient } from '@gabby/lib/supabase/admin';
import { createLogger } from '@gabby/lib/logger';
import { getLogContext } from '@gabby/lib/logger/context';
import { USER_STATUS, USER_TYPES, type UserType } from '@gabby/types/user';
import {
  type AddChatRoomMemberPayload,
  CHAT_ROOM_TYPES,
  type ChatMessage,
  type ChatRoom,
  type ChatRoomListItem,
  type ChatRoomMemberSummary,
  type ChatTargetUser,
  type CreateChatRoomPayload,
  type RemoveChatRoomMemberPayload,
} from '@gabby/types/chat';
import { getAuthUser } from '@gabby/lib/supabase/authUser';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@gabby/types/db';
import { getErrorMessage } from '@gabby/lib/logger/errorMessage';
import type { CoreResult } from '@gabby/types/action';
import type { ChatActionErrorCode, ChatRoomDetail } from '@gabby/types/chat';

// ルーム作成で選択可能なuser_type
const HUMAN_USER_TYPES: readonly UserType[] = [USER_TYPES.ADMIN, USER_TYPES.STUDENT, USER_TYPES.COACH];

/** チャットに参加できる種別か（com_m_user.user_type は NULL を許す列のため、NULL も弾く） */
function isHumanUserType(userType: UserType | null): userType is UserType {
  return userType !== null && HUMAN_USER_TYPES.includes(userType);
}

// GROUPルームが維持すべき最低参加人数（これを下回る削除は拒否する）
const MIN_GROUP_ROOM_MEMBERS = 2;

const logger = createLogger('common');

/**
 * ログインユーザーの認証情報 + DB上のuser_typeを取得する。
 * JWTのapp_metadataではなくDBを正とする（ロール変更直後の反映遅延を避けるため）。
 */
export async function getCurrentUserWithType(): Promise<{ id: string; user_type: string } | null> {
  const supabase = await createServerClient();
  const user = await getAuthUser();
  if (!user) return null;

  const { data: profile } = await supabase.from('com_m_user').select('id, user_type').eq('id', user.id).single();

  if (!profile) return null;
  return { id: user.id, user_type: profile.user_type as string };
}

/**
 * Admin がルーム作成時に選択する候補ユーザー一覧（Admin・生徒・コーチ）を取得
 * Admin-Coach / Admin-Student / Coach-Student のいずれの組み合わせも作成できるよう、
 * Admin自身を含む全ユーザー種別を候補として返す。
 */
export async function getChatRoomTargetUsers(): Promise<CoreResult<{ data: ChatTargetUser[] }, ChatActionErrorCode>> {
  const ctx = await getLogContext();
  try {
    const currentUser = await getCurrentUserWithType();
    if (!currentUser || currentUser.user_type !== USER_TYPES.ADMIN) {
      return { success: false, errorCode: 'unauthorized' };
    }

    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from('com_m_user')
      .select('id, user_name, user_type, client_id')
      .in('user_type', HUMAN_USER_TYPES)
      .eq('status', USER_STATUS.ACTIVE)
      .order('user_name', { ascending: true });

    if (error) {
      logger.error('chat:get_target_users_failed', error.message, { ...ctx, err: error });
      return { success: false, errorCode: 'unexpected_error' };
    }

    return { success: true, data: (data || []) as ChatTargetUser[] };
  } catch (err) {
    unstable_rethrow(err);
    logger.error('chat:get_target_users_unexpected', getErrorMessage(err), {
      ...ctx,
      err,
    });
    return { success: false, errorCode: 'unexpected_error' };
  }
}

/**
 * チャットルーム作成(Adminのみ実行可能)
 * roomType: '1ON1' の場合、memberIds に指定した異なる2名でルームを作成する（種別の組み合わせ
 * 制限なし）。同一メンバー構成のアクティブなルームが既にあれば、それを返す（重複作成防止）。
 * roomType: 'GROUP' の場合、memberIds に指定した2名以上でルームを作成する（種別の組み合わせ
 * 制限なし、roomName必須）。重複作成防止は行わない（作成のたびに新規ルームとなる）。
 */
export async function createChatRoom(
  payload: CreateChatRoomPayload,
): Promise<CoreResult<{ roomId: string }, ChatActionErrorCode>> {
  const ctx = await getLogContext();
  try {
    const currentUser = await getCurrentUserWithType();
    if (!currentUser) return { success: false, errorCode: 'unauthorized' };

    if (currentUser.user_type !== USER_TYPES.ADMIN) {
      logger.warn('chat:create_room_forbidden', 'Non-admin user attempted to create a chat room', {
        ...ctx,
        payload,
      });
      return { success: false, errorCode: 'forbidden' };
    }

    if (payload.roomType === CHAT_ROOM_TYPES.GROUP) {
      return createGroupChatRoom(payload, ctx);
    }
    return createOneOnOneChatRoom(payload, ctx);
  } catch (err) {
    unstable_rethrow(err);
    logger.error('chat:create_room_unexpected', getErrorMessage(err), { ...ctx, err });
    return { success: false, errorCode: 'unexpected_error' };
  }
}

async function createOneOnOneChatRoom(
  payload: CreateChatRoomPayload,
  ctx: Awaited<ReturnType<typeof getLogContext>>,
): Promise<CoreResult<{ roomId: string }, ChatActionErrorCode>> {
  const [memberIdA, memberIdB] = payload.memberIds;
  if (!memberIdA || !memberIdB || payload.memberIds.length !== 2 || memberIdA === memberIdB) {
    return { success: false, errorCode: 'two_users_required' };
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
    return { success: false, errorCode: 'not_found' };
  }

  if (!isHumanUserType(profileA.user_type) || !isHumanUserType(profileB.user_type)) {
    return { success: false, errorCode: 'invalid_members' };
  }

  // 既存ルームの検索・開設はマッチング成立時の自動開設と共通のRPCに任せる
  // （判定条件と同時実行の制御は supabase/DDL/function/fn_ensure_one_on_one_chat_room.sql）
  const { data: ensured, error: ensureError } = await supabase
    .rpc('fn_ensure_one_on_one_chat_room', { p_user_a: memberIdA, p_user_b: memberIdB })
    .single<{ room_id: string; created: boolean }>();

  if (ensureError || !ensured) {
    logger.error('chat:create_room_failed', ensureError?.message || 'Unknown error', {
      ...ctx,
      err: ensureError,
      payload,
    });
    return { success: false, errorCode: 'unexpected_error' };
  }

  if (ensured.created) {
    logger.info('chat:create_room_success', `Chat room created: ${ensured.room_id}`, {
      ...ctx,
      payload: { roomId: ensured.room_id },
    });
  }

  return { success: true, roomId: ensured.room_id };
}

async function createGroupChatRoom(
  payload: CreateChatRoomPayload,
  ctx: Awaited<ReturnType<typeof getLogContext>>,
): Promise<CoreResult<{ roomId: string }, ChatActionErrorCode>> {
  const roomName = payload.roomName?.trim();
  if (!roomName) {
    return { success: false, errorCode: 'room_name_required' };
  }

  const memberIds = Array.from(new Set(payload.memberIds));
  if (memberIds.length < 2) {
    return { success: false, errorCode: 'participants_required' };
  }

  // Admin操作のためRLSをバイパスして参加者行のINSERT等を確実に行う
  const supabase = createAdminClient();

  const { data: profiles, error: profileError } = await supabase
    .from('com_m_user')
    .select('id, user_type')
    .in('id', memberIds);

  if (profileError || !profiles || profiles.length !== memberIds.length) {
    return { success: false, errorCode: 'not_found' };
  }

  const members = profiles.flatMap((p) => (isHumanUserType(p.user_type) ? [{ id: p.id, user_type: p.user_type }] : []));
  if (members.length !== profiles.length) {
    return { success: false, errorCode: 'invalid_members' };
  }

  const { data: newRoom, error: roomError } = await supabase
    .from('com_t_chat_room')
    .insert({ room_type: CHAT_ROOM_TYPES.GROUP, room_name: roomName })
    .select('room_id')
    .single();

  if (roomError || !newRoom) {
    logger.error('chat:create_room_failed', roomError?.message || 'Unknown error', { ...ctx, err: roomError, payload });
    return { success: false, errorCode: 'unexpected_error' };
  }

  const { error: memberError } = await supabase
    .from('com_t_chat_room_user')
    .insert(members.map((m) => ({ room_id: newRoom.room_id, user_id: m.id, user_type: m.user_type })));

  if (memberError) {
    logger.error('chat:create_room_members_failed', memberError.message, {
      ...ctx,
      err: memberError,
      payload: { roomId: newRoom.room_id },
    });
    return { success: false, errorCode: 'unexpected_error' };
  }

  logger.info('chat:create_room_success', `Chat room created: ${newRoom.room_id}`, {
    ...ctx,
    payload: { roomId: newRoom.room_id },
  });

  return { success: true, roomId: newRoom.room_id };
}

/**
 * 【Admin専用・GROUPルームのみ】参加者を追加する。
 * 過去に退出済み（left_at設定済み）のユーザーを指定した場合は再参加として扱う。
 */
export async function addChatRoomMember(
  payload: AddChatRoomMemberPayload,
): Promise<CoreResult<{ member: ChatRoomMemberSummary }, ChatActionErrorCode>> {
  const ctx = await getLogContext();
  try {
    const currentUser = await getCurrentUserWithType();
    if (!currentUser) return { success: false, errorCode: 'unauthorized' };

    if (currentUser.user_type !== USER_TYPES.ADMIN) {
      logger.warn('chat:add_member_forbidden', 'Non-admin user attempted to add a chat room member', {
        ...ctx,
        payload,
      });
      return { success: false, errorCode: 'forbidden' };
    }

    // Admin操作のためRLSをバイパスして参加者行のINSERT/UPDATEを確実に行う
    const supabase = createAdminClient();

    const { data: room } = await supabase
      .from('com_t_chat_room')
      .select('room_id, room_type')
      .eq('room_id', payload.roomId)
      .maybeSingle();

    if (!room) return { success: false, errorCode: 'not_found' };
    if (room.room_type !== CHAT_ROOM_TYPES.GROUP) {
      return { success: false, errorCode: 'not_group_room' };
    }

    const { data: profile } = await supabase
      .from('com_m_user')
      .select('id, user_name, user_type, icon_path, client_id, status, com_m_client(client_name)')
      .eq('id', payload.userId)
      .maybeSingle();

    if (!profile || profile.status !== USER_STATUS.ACTIVE || !isHumanUserType(profile.user_type)) {
      return { success: false, errorCode: 'not_found' };
    }

    const { data: existingRow } = await supabase
      .from('com_t_chat_room_user')
      .select('room_id, user_id, left_at')
      .eq('room_id', payload.roomId)
      .eq('user_id', payload.userId)
      .maybeSingle();

    if (existingRow && existingRow.left_at === null) {
      return { success: false, errorCode: 'already_member' };
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
      logger.error('chat:add_member_failed', memberError.message, { ...ctx, err: memberError, payload });
      return { success: false, errorCode: 'unexpected_error' };
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
    unstable_rethrow(err);
    logger.error('chat:add_member_unexpected', getErrorMessage(err), { ...ctx, err });
    return { success: false, errorCode: 'unexpected_error' };
  }
}

/**
 * 【Admin専用・GROUPルームのみ】参加者を削除する（退出処理。left_atを設定する論理削除）。
 * 残り人数が MIN_GROUP_ROOM_MEMBERS を下回る削除は拒否する。
 */
export async function removeChatRoomMember(
  payload: RemoveChatRoomMemberPayload,
): Promise<CoreResult<object, ChatActionErrorCode>> {
  const ctx = await getLogContext();
  try {
    const currentUser = await getCurrentUserWithType();
    if (!currentUser) return { success: false, errorCode: 'unauthorized' };

    if (currentUser.user_type !== USER_TYPES.ADMIN) {
      logger.warn('chat:remove_member_forbidden', 'Non-admin user attempted to remove a chat room member', {
        ...ctx,
        payload,
      });
      return { success: false, errorCode: 'forbidden' };
    }

    // Admin操作のためRLSをバイパスして参加者行のUPDATEを確実に行う
    const supabase = createAdminClient();

    const { data: room } = await supabase
      .from('com_t_chat_room')
      .select('room_id, room_type')
      .eq('room_id', payload.roomId)
      .maybeSingle();

    if (!room) return { success: false, errorCode: 'not_found' };
    if (room.room_type !== CHAT_ROOM_TYPES.GROUP) {
      return { success: false, errorCode: 'not_group_room' };
    }

    const { count: activeCount } = await supabase
      .from('com_t_chat_room_user')
      .select('room_id', { count: 'exact', head: true })
      .eq('room_id', payload.roomId)
      .is('left_at', null);

    if ((activeCount ?? 0) <= MIN_GROUP_ROOM_MEMBERS) {
      return { success: false, errorCode: 'min_participants' };
    }

    const { data: updatedRows, error: updateError } = await supabase
      .from('com_t_chat_room_user')
      .update({ left_at: new Date().toISOString() })
      .eq('room_id', payload.roomId)
      .eq('user_id', payload.userId)
      .is('left_at', null)
      .select('user_id');

    if (updateError) {
      logger.error('chat:remove_member_failed', updateError.message, { ...ctx, err: updateError, payload });
      return { success: false, errorCode: 'unexpected_error' };
    }

    if (!updatedRows || updatedRows.length === 0) {
      return { success: false, errorCode: 'not_member' };
    }

    logger.info('chat:remove_member_success', `Member removed from room: ${payload.roomId}`, { ...ctx, payload });

    return { success: true };
  } catch (err) {
    unstable_rethrow(err);
    logger.error('chat:remove_member_unexpected', getErrorMessage(err), {
      ...ctx,
      err,
    });
    return { success: false, errorCode: 'unexpected_error' };
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
  // createServerClient / createAdminClient のいずれでも呼べる
  supabase: SupabaseClient<Database>,
  rooms: RoomBase[],
  currentUserId: string,
  myMembershipByRoom: Map<string, { last_read_chat_id: string | null }>,
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
    supabase.from('com_t_chat').select('*').in('room_id', roomIds).order('created_at', { ascending: false }).limit(500),
    lastReadChatIds.length > 0
      ? supabase.from('com_t_chat').select('chat_id, created_at').in('chat_id', lastReadChatIds)
      : Promise.resolve({ data: [] as { chat_id: string; created_at: string }[] }),
  ]);

  const lastReadCreatedAtByChatId = new Map(
    (lastReadMessages || []).map((m: { chat_id: string; created_at: string }) => [m.chat_id, m.created_at]),
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
      ? (lastReadCreatedAtByChatId.get(membership.last_read_chat_id) ?? null)
      : null;
    const isUnread = msg.sender_user_id !== currentUserId && (!lastReadAt || msg.created_at > lastReadAt);
    if (isUnread) {
      unreadCountByRoom.set(msg.room_id, (unreadCountByRoom.get(msg.room_id) || 0) + 1);
    }
  }

  const membersByRoom = new Map<string, ChatRoomListItem['members']>();
  for (const m of allMembers || []) {
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
        }) as ChatRoomListItem,
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
export async function getChatRooms(): Promise<CoreResult<{ data: ChatRoomListItem[] }, ChatActionErrorCode>> {
  const ctx = await getLogContext();
  try {
    const supabase = await createServerClient();
    const user = await getAuthUser();
    if (!user) return { success: false, errorCode: 'unauthorized' };

    const { data: myMemberships, error: memberError } = await supabase
      .from('com_t_chat_room_user')
      .select('room_id, last_read_chat_id')
      .eq('user_id', user.id)
      .is('left_at', null);

    if (memberError) {
      logger.error('chat:get_rooms_failed', memberError.message, { ...ctx, err: memberError });
      return { success: false, errorCode: 'unexpected_error' };
    }

    const myMembershipByRoom = new Map(
      (myMemberships || []).map((m) => [m.room_id, { last_read_chat_id: m.last_read_chat_id as string | null }]),
    );

    const roomIds = Array.from(myMembershipByRoom.keys());
    let rooms: RoomBase[] = [];
    if (roomIds.length > 0) {
      const { data: roomRows, error: roomsError } = await supabase
        .from('com_t_chat_room')
        .select('room_id, room_type, room_name, created_at, closed_at')
        .in('room_id', roomIds);

      if (roomsError) {
        logger.error('chat:get_rooms_failed', roomsError.message, { ...ctx, err: roomsError });
        return { success: false, errorCode: 'unexpected_error' };
      }
      rooms = (roomRows || []) as RoomBase[];
    }

    const data = await buildChatRoomListItems(supabase, rooms, user.id, myMembershipByRoom);
    return { success: true, data };
  } catch (err) {
    unstable_rethrow(err);
    logger.error('chat:get_rooms_unexpected', getErrorMessage(err), { ...ctx, err });
    return { success: false, errorCode: 'unexpected_error' };
  }
}

/**
 * 【Admin専用】非参加ルームも含む全チャットルームを査閲用に取得する
 */
export async function getAllChatRoomsForAdmin(): Promise<
  CoreResult<{ data: ChatRoomListItem[] }, ChatActionErrorCode>
> {
  const ctx = await getLogContext();
  try {
    const currentUser = await getCurrentUserWithType();
    if (!currentUser) return { success: false, errorCode: 'unauthorized' };
    if (currentUser.user_type !== USER_TYPES.ADMIN) {
      return { success: false, errorCode: 'forbidden' };
    }

    const supabase = await createServerClient();

    const { data: allRooms, error: roomsError } = await supabase
      .from('com_t_chat_room')
      .select('room_id, room_type, room_name, created_at, closed_at');

    if (roomsError) {
      logger.error('chat:get_all_rooms_failed', roomsError.message, { ...ctx, err: roomsError });
      return { success: false, errorCode: 'unexpected_error' };
    }

    const { data: myMemberships } = await supabase
      .from('com_t_chat_room_user')
      .select('room_id, last_read_chat_id')
      .eq('user_id', currentUser.id)
      .is('left_at', null);

    const myMembershipByRoom = new Map(
      (myMemberships || []).map((m) => [m.room_id, { last_read_chat_id: m.last_read_chat_id as string | null }]),
    );

    const data = await buildChatRoomListItems(
      supabase,
      (allRooms || []) as RoomBase[],
      currentUser.id,
      myMembershipByRoom,
    );
    return { success: true, data };
  } catch (err) {
    unstable_rethrow(err);
    logger.error('chat:get_all_rooms_unexpected', getErrorMessage(err), {
      ...ctx,
      err,
    });
    return { success: false, errorCode: 'unexpected_error' };
  }
}

/**
 * ルーム詳細（参加者一覧・自分が参加者かどうか・既読位置）を取得する。
 * 非参加ルームはRLSにより非Adminからは取得できない（Adminは査閲のため取得可能）。
 * - viewerUserId: 表示しているユーザー。クライアントのユーザー情報の読み込みを待たずに、
 *   初回表示から自分/相手の発言を正しく出し分けるために返す（メール等のリンクから直接開いた場合も同じ）
 * - myLastReadAt: 自分が最後に読んだメッセージの送信時刻（「ここから未読」の位置。参加者でなければ null）
 * - counterpartLastReadAt: 自分が参加している1対1ルームの相手の既読位置（既読表示用。グループ・査閲では null）
 */
export async function getChatRoomDetail(
  roomId: string,
): Promise<CoreResult<{ data: ChatRoomDetail }, ChatActionErrorCode>> {
  const ctx = await getLogContext();
  try {
    const supabase = await createServerClient();
    const user = await getAuthUser();
    if (!user) return { success: false, errorCode: 'unauthorized' };

    const { data: room, error: roomError } = await supabase
      .from('com_t_chat_room')
      .select('room_id, room_type, room_name, created_at, closed_at')
      .eq('room_id', roomId)
      .maybeSingle();

    if (roomError || !room) {
      return { success: false, errorCode: 'not_found' };
    }

    const { data: members } = await supabase
      .from('com_t_chat_room_user')
      .select(
        'user_id, user_type, last_read_chat_id, com_m_user(user_name, icon_path, client_id, com_m_client(client_name))',
      )
      .eq('room_id', roomId)
      .is('left_at', null);

    const memberList = (members || []).map((m) => {
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

    // 既読位置（メッセージID）を送信時刻に置き換える（自分=「ここから未読」、1対1の相手=「既読」表示）
    const readRows = (members || []) as { user_id: string; last_read_chat_id: string | null }[];
    const myReadChatId = isMember ? (readRows.find((m) => m.user_id === user.id)?.last_read_chat_id ?? null) : null;
    const counterpartReadChatId =
      isMember && room.room_type === CHAT_ROOM_TYPES.ONE_ON_ONE
        ? (readRows.find((m) => m.user_id !== user.id)?.last_read_chat_id ?? null)
        : null;
    const readChatIds = [myReadChatId, counterpartReadChatId].filter((id): id is string => !!id);
    const readAtByChatId = new Map<string, string>();
    if (readChatIds.length > 0) {
      const { data: readChats } = await supabase
        .from('com_t_chat')
        .select('chat_id, created_at')
        .in('chat_id', readChatIds);
      for (const c of readChats ?? []) readAtByChatId.set(c.chat_id as string, c.created_at as string);
    }

    return {
      success: true,
      data: {
        room: room as ChatRoom,
        members: memberList,
        isMember,
        viewerUserId: user.id,
        myLastReadAt: myReadChatId ? (readAtByChatId.get(myReadChatId) ?? null) : null,
        counterpartLastReadAt: counterpartReadChatId ? (readAtByChatId.get(counterpartReadChatId) ?? null) : null,
      },
    };
  } catch (err) {
    unstable_rethrow(err);
    logger.error('chat:get_room_detail_unexpected', getErrorMessage(err), {
      ...ctx,
      err,
      payload: { roomId },
    });
    return { success: false, errorCode: 'unexpected_error' };
  }
}
