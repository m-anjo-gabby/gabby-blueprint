// apps/admin/actions/adminNoticeAction.ts
'use server';

import { createAdminClient } from '@gabby/lib/supabase/admin';
import { revalidatePath } from 'next/cache';
import { createLogger } from '@gabby/lib/logger';
import { getLogContext } from '@gabby/lib/logger/context';
import { NoticeItem, NoticeAttachment, NoticeType, NoticeTargetType } from '@gabby/types/notice';
import { USER_TYPES } from '@gabby/types/user';

const logger = createLogger('admin');

export interface AdminNoticeFilterParams {
  page?: number;
  pageSize?: number;
  searchQuery?: string;
  noticeType?: string;
}

export interface NoticeFormData {
  notice_id?: string;
  target_type: NoticeTargetType;
  client_id?: string | null;
  notice_type: NoticeType;
  is_important: boolean;
  show_dialog: boolean;
  title: string;
  content: string;
  published_at: string; // JST文字列 (例: "2026-07-22T10:00")
  expired_at?: string | null; // JST文字列
  is_published: boolean;
  attachments?: NoticeAttachment[];
}

/**
 * JSTの日付または日時文字列（YYYY-MM-DD または YYYY-MM-DDTHH:mm）を UTC の ISO文字列に変換
 */
function jstToUtcIso(jstStr: string | null | undefined): string | null {
  if (!jstStr || jstStr.trim() === '') return null;
  // すでにタイムゾーン情報が含まれている場合はそのままDate解析
  if (jstStr.includes('+') || jstStr.endsWith('Z')) {
    const d = new Date(jstStr);
    return isNaN(d.getTime()) ? null : d.toISOString();
  }
  // YYYY-MM-DD (日付のみ) の場合は 00:00:00+09:00 を補う
  if (jstStr.length === 10) {
    const d = new Date(`${jstStr}T00:00:00+09:00`);
    return isNaN(d.getTime()) ? null : d.toISOString();
  }
  // 秒が含まれていなければ付与して+09:00(JST)指定
  const formatted = jstStr.length === 16 ? `${jstStr}:00+09:00` : `${jstStr}+09:00`;
  const d = new Date(formatted);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

/**
 * UTCの日時文字列を JST の <input type="date"> 用文字列 (YYYY-MM-DD) に変換
 */
export async function utcToJstInputStr(utcStr: string | null | undefined): Promise<string> {
  if (!utcStr) return '';
  const d = new Date(utcStr);
  if (isNaN(d.getTime())) return '';
  // JST (+9時間)
  const jstDate = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  return jstDate.toISOString().slice(0, 10);
}

/**
 * お知らせ一覧取得（ページネーション・検索・顧客名結合付き）
 */
export async function getNotices(params: AdminNoticeFilterParams = {}) {
  const ctx = await getLogContext();
  const page = params.page || 1;
  const pageSize = params.pageSize || 10;
  const searchQuery = params.searchQuery || '';
  const noticeType = params.noticeType || '';

  try {
    const supabase = createAdminClient();
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    let query = supabase
      .from('com_m_notice')
      .select(`
        *,
        com_m_client (
          client_name
        )
      `, { count: 'exact' })
      .eq('delete_flg', '0');

    if (searchQuery) {
      query = query.ilike('title', `%${searchQuery}%`);
    }

    if (noticeType && noticeType !== 'ALL') {
      query = query.eq('notice_type', noticeType);
    }

    const { data, count, error } = await query
      .order('insert_date', { ascending: false })
      .range(from, to);

    if (error) {
      logger.error('notice:get_notices_failed', error.message, { ...ctx, payload: params });
      throw error;
    }

    const formattedNotices = (data || []).map((item: any) => ({
      ...item,
      client_name: item.com_m_client?.client_name || null,
    }));

    return {
      notices: formattedNotices,
      totalCount: count || 0,
    };
  } catch (error) {
    logger.error('notice:get_notices_unexpected', error instanceof Error ? error.message : 'Unknown error', { ...ctx, payload: params });
    throw error instanceof Error ? error : new Error('予期せぬエラーが発生しました');
  }
}

/**
 * お知らせ詳細の取得
 */
export async function getNoticeById(noticeId: string) {
  const ctx = await getLogContext();
  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from('com_m_notice')
      .select(`
        *,
        com_m_client (
          client_name
        )
      `)
      .eq('notice_id', noticeId)
      .eq('delete_flg', '0')
      .single();

    if (error) {
      logger.error('notice:get_by_id_failed', error.message, { ...ctx, payload: { noticeId } });
      return null;
    }

    return {
      ...data,
      client_name: data.com_m_client?.client_name || null,
    };
  } catch (error) {
    logger.error('notice:get_by_id_unexpected', error instanceof Error ? error.message : 'Unknown error', { ...ctx, payload: { noticeId } });
    return null;
  }
}

export interface NoticeReadStatusParams {
  page?: number;
  pageSize?: number;
  clientId?: string;
  userType?: string; // '1': 生徒, '2': コーチ
}

export interface NoticeReadStatusUser {
  id: string;
  user_id: number;
  user_name: string | null;
  user_type: string;
  client_id: string | null;
  client_name: string | null;
  is_read: boolean;
  read_at: string | null;
}

export interface NoticeReadStatusResult {
  notice: { notice_id: string; title: string; target_type: NoticeTargetType; client_id: string | null } | null;
  users: NoticeReadStatusUser[];
  totalCount: number;
  readCount: number;
  unreadCount: number;
  pageCount: number;
}

/**
 * お知らせ単位の既読/未読ユーザー一覧取得
 * (配信対象ユーザー全体をお知らせのtarget_typeに基づいて特定し、既読トランザクションと突合する)
 */
export async function getNoticeReadStatus(
  noticeId: string,
  params: NoticeReadStatusParams = {}
): Promise<NoticeReadStatusResult> {
  const ctx = await getLogContext();
  const page = params.page || 1;
  const pageSize = params.pageSize || 10;
  const clientId = params.clientId || '';
  const userType = params.userType || '';

  try {
    const supabase = createAdminClient();

    const { data: notice, error: noticeError } = await supabase
      .from('com_m_notice')
      .select('notice_id, title, target_type, client_id')
      .eq('notice_id', noticeId)
      .single();

    if (noticeError || !notice) {
      logger.error('notice:read_status_notice_not_found', noticeError?.message || 'notice not found', { ...ctx, payload: { noticeId } });
      return { notice: null, users: [], totalCount: 0, readCount: 0, unreadCount: 0, pageCount: 0 };
    }

    // 配信対象ユーザー母集団を、お知らせのtarget_typeに基づいて絞り込む
    let query = supabase
      .from('com_m_user')
      .select(`
        id,
        user_id,
        user_name,
        user_type,
        client_id,
        com_m_client ( client_name )
      `)
      .eq('delete_flg', '0');

    if (notice.target_type === 'ALL') {
      query = query.eq('user_type', USER_TYPES.STUDENT);
    } else if (notice.target_type === 'CLIENT') {
      query = query.eq('user_type', USER_TYPES.STUDENT).eq('client_id', notice.client_id);
    } else if (notice.target_type === 'COACH') {
      query = query.eq('user_type', USER_TYPES.COACH);
    }

    // 画面上の追加フィルター（顧客・ユーザー種別）
    if (clientId) {
      query = query.eq('client_id', clientId);
    }
    if (userType) {
      query = query.eq('user_type', userType);
    }

    const { data: targetUsers, error: usersError } = await query.order('user_id', { ascending: true });

    if (usersError) {
      logger.error('notice:read_status_users_failed', usersError.message, { ...ctx, payload: { noticeId, params } });
      throw usersError;
    }

    // このお知らせに対する既読トランザクションを取得し、user_id -> read_at のマップを作成
    const { data: reads, error: readsError } = await supabase
      .from('com_t_notice_read')
      .select('user_id, read_at')
      .eq('notice_id', noticeId);

    if (readsError) {
      logger.error('notice:read_status_reads_failed', readsError.message, { ...ctx, payload: { noticeId } });
      throw readsError;
    }

    const readMap = new Map<string, string>();
    (reads || []).forEach((r: any) => readMap.set(r.user_id, r.read_at));

    const merged: NoticeReadStatusUser[] = (targetUsers || []).map((u: any) => ({
      id: u.id,
      user_id: u.user_id,
      user_name: u.user_name,
      user_type: u.user_type,
      client_id: u.client_id,
      client_name: u.com_m_client?.client_name || null,
      is_read: readMap.has(u.id),
      read_at: readMap.get(u.id) || null,
    }));

    // 既読（既読日時の新しい順）を先頭に、未読（user_id昇順）を後続に並べる
    merged.sort((a, b) => {
      if (a.is_read !== b.is_read) return a.is_read ? -1 : 1;
      if (a.is_read && b.is_read) {
        return new Date(b.read_at as string).getTime() - new Date(a.read_at as string).getTime();
      }
      return a.user_id - b.user_id;
    });

    const totalCount = merged.length;
    const readCount = merged.filter((u) => u.is_read).length;
    const unreadCount = totalCount - readCount;
    const pageCount = Math.max(1, Math.ceil(totalCount / pageSize));
    const from = (page - 1) * pageSize;

    return {
      notice: {
        notice_id: notice.notice_id,
        title: notice.title,
        target_type: notice.target_type,
        client_id: notice.client_id,
      },
      users: merged.slice(from, from + pageSize),
      totalCount,
      readCount,
      unreadCount,
      pageCount,
    };
  } catch (error) {
    logger.error('notice:read_status_unexpected', error instanceof Error ? error.message : 'Unknown error', { ...ctx, payload: { noticeId, params } });
    throw error instanceof Error ? error : new Error('予期せぬエラーが発生しました');
  }
}

/**
 * お知らせの新規作成
 */
export async function createNotice(formData: NoticeFormData) {
  const ctx = await getLogContext();
  try {
    const supabase = createAdminClient();

    const publishedUtc = jstToUtcIso(formData.published_at);
    if (!publishedUtc) {
      return { success: false, message: '有効な公開開始日時を入力してください' };
    }

    const expiredUtc = formData.expired_at ? jstToUtcIso(formData.expired_at) : null;

    const insertPayload = {
      ...(formData.notice_id ? { notice_id: formData.notice_id } : {}),
      target_type: formData.target_type,
      client_id: formData.target_type === 'CLIENT' ? formData.client_id : null,
      notice_type: formData.notice_type,
      is_important: formData.is_important,
      show_dialog: formData.show_dialog,
      title: formData.title,
      content: formData.content,
      attachments: formData.attachments || [],
      published_at: publishedUtc,
      expired_at: expiredUtc,
      is_published: formData.is_published,
      delete_flg: '0',
    };

    const { data, error } = await supabase
      .from('com_m_notice')
      .insert(insertPayload)
      .select()
      .single();

    if (error) {
      logger.error('notice:create_failed', error.message, { ...ctx, payload: formData });
      return { success: false, message: error.message };
    }

    logger.info('notice:create_success', `Notice created: ${data.notice_id}`, {
      ...ctx,
      payload: { noticeId: data.notice_id }
    });

    revalidatePath('/notice');
    return { success: true, noticeId: data.notice_id };
  } catch (error) {
    logger.error('notice:create_unexpected', error instanceof Error ? error.message : 'Unknown error', { ...ctx, payload: formData });
    return { success: false, message: '予期せぬエラーが発生しました' };
  }
}

/**
 * お知らせの更新
 */
export async function updateNotice(noticeId: string, formData: NoticeFormData) {
  const ctx = await getLogContext();
  try {
    const supabase = createAdminClient();

    const publishedUtc = jstToUtcIso(formData.published_at);
    if (!publishedUtc) {
      return { success: false, message: '有効な公開開始日時を入力してください' };
    }

    const expiredUtc = formData.expired_at ? jstToUtcIso(formData.expired_at) : null;

    const updatePayload = {
      target_type: formData.target_type,
      client_id: formData.target_type === 'CLIENT' ? formData.client_id : null,
      notice_type: formData.notice_type,
      is_important: formData.is_important,
      show_dialog: formData.show_dialog,
      title: formData.title,
      content: formData.content,
      attachments: formData.attachments || [],
      published_at: publishedUtc,
      expired_at: expiredUtc,
      is_published: formData.is_published,
      update_date: new Date().toISOString(),
    };

    const { error } = await supabase
      .from('com_m_notice')
      .update(updatePayload)
      .eq('notice_id', noticeId);

    if (error) {
      logger.error('notice:update_failed', error.message, { ...ctx, payload: { noticeId, ...formData } });
      return { success: false, message: error.message };
    }

    logger.info('notice:update_success', `Notice updated: ${noticeId}`, {
      ...ctx,
      payload: { noticeId }
    });

    revalidatePath('/notice');
    revalidatePath(`/notice/${noticeId}/edit`);
    return { success: true };
  } catch (error) {
    logger.error('notice:update_unexpected', error instanceof Error ? error.message : 'Unknown error', { ...ctx, payload: { noticeId } });
    return { success: false, message: '予期せぬエラーが発生しました' };
  }
}

/**
 * お知らせの論理削除
 */
export async function deleteNotice(noticeId: string) {
  const ctx = await getLogContext();
  try {
    const supabase = createAdminClient();

    const { error } = await supabase
      .from('com_m_notice')
      .update({
        delete_flg: '1',
        update_date: new Date().toISOString(),
      })
      .eq('notice_id', noticeId);

    if (error) {
      logger.error('notice:delete_failed', error.message, { ...ctx, payload: { noticeId } });
      return { success: false, message: error.message };
    }

    logger.info('notice:delete_success', `Notice deleted: ${noticeId}`, {
      ...ctx,
      payload: { noticeId }
    });

    revalidatePath('/notice');
    return { success: true };
  } catch (error) {
    logger.error('notice:delete_unexpected', error instanceof Error ? error.message : 'Unknown error', { ...ctx, payload: { noticeId } });
    return { success: false, message: '予期せぬエラーが発生しました' };
  }
}

/**
 * 添付ファイルのアップロード（FormData）
 * Storageバケット "notices" に notices/{notice_id}/{file.name} で保存
 */
export async function uploadNoticeFile(
  noticeId: string,
  formData: FormData
): Promise<{ success: boolean; attachment?: NoticeAttachment; message?: string }> {
  const ctx = await getLogContext();
  try {
    const file = formData.get('file') as File;
    if (!file) {
      return { success: false, message: 'ファイルが選択されていません' };
    }

    const supabase = createAdminClient();

    // UUID生成またはファイル名クリーン化
    const fileExt = file.name.split('.').pop();
    const cleanFileName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const storagePath = `notices/${noticeId}/${cleanFileName}`;

    // Storageへアップロード
    const buffer = Buffer.from(await file.arrayBuffer());
    const { error: uploadError } = await supabase.storage
      .from('notices')
      .upload(storagePath, buffer, {
        contentType: file.type || 'application/octet-stream',
        upsert: true,
      });

    if (uploadError) {
      logger.error('notice:upload_file_failed', uploadError.message, { ...ctx, payload: { noticeId, fileName: file.name } });
      return { success: false, message: `アップロードに失敗しました: ${uploadError.message}` };
    }

    const newAttachment: NoticeAttachment = {
      id: crypto.randomUUID(),
      name: file.name,
      path: storagePath,
      size: file.size,
      mime_type: file.type || 'application/octet-stream',
    };

    logger.info('notice:upload_file_success', `Attachment uploaded: ${storagePath}`, {
      ...ctx,
      payload: { noticeId, storagePath }
    });

    return { success: true, attachment: newAttachment };
  } catch (error) {
    logger.error('notice:upload_file_unexpected', error instanceof Error ? error.message : 'Unknown error', { ...ctx, payload: { noticeId } });
    return { success: false, message: '予期せぬエラーが発生しました' };
  }
}

/**
 * 添付ファイルの削除 (Storageから物理削除)
 */
export async function deleteNoticeFile(storagePath: string): Promise<{ success: boolean; message?: string }> {
  const ctx = await getLogContext();
  try {
    const supabase = createAdminClient();
    const cleanPath = storagePath.startsWith('/') ? storagePath.substring(1) : storagePath;

    const { error } = await supabase.storage
      .from('notices')
      .remove([cleanPath]);

    if (error) {
      logger.error('notice:delete_file_failed', error.message, { ...ctx, payload: { storagePath } });
      return { success: false, message: error.message };
    }

    logger.info('notice:delete_file_success', `Attachment removed: ${cleanPath}`, { ...ctx, payload: { storagePath } });
    return { success: true };
  } catch (error) {
    logger.error('notice:delete_file_unexpected', error instanceof Error ? error.message : 'Unknown error', { ...ctx, payload: { storagePath } });
    return { success: false, message: '予期せぬエラーが発生しました' };
  }
}
