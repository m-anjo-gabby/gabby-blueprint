// apps/admin/actions/adminNoticeAction.ts
'use server';

import { createAdminClient } from '@gabby/lib/supabase/admin';
import { revalidatePath } from 'next/cache';
import { createLogger, getLogContext } from '@gabby/lib/logger';
import { NoticeItem, NoticeAttachment, NoticeType, NoticeTargetType } from '@gabby/types/notice';

const logger = createLogger('admin');

export interface AdminNoticeFilterParams {
  page?: number;
  pageSize?: number;
  searchQuery?: string;
  noticeType?: string;
}

export interface NoticeFormData {
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
 * JSTの日時文字列（YYYY-MM-DDTHH:mm）を UTC の ISO文字列に変換
 */
function jstToUtcIso(jstStr: string | null | undefined): string | null {
  if (!jstStr || jstStr.trim() === '') return null;
  // すでにタイムゾーン情報が含まれている場合はそのままDate解析
  if (jstStr.includes('+') || jstStr.endsWith('Z')) {
    const d = new Date(jstStr);
    return isNaN(d.getTime()) ? null : d.toISOString();
  }
  // 秒が含まれていなければ付与して+09:00(JST)指定
  const formatted = jstStr.length === 16 ? `${jstStr}:00+09:00` : `${jstStr}+09:00`;
  const d = new Date(formatted);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

/**
 * UTCの日時文字列を JST の <input type="datetime-local"> 用文字列 (YYYY-MM-DDTHH:mm) に変換
 */
export async function utcToJstInputStr(utcStr: string | null | undefined): Promise<string> {
  if (!utcStr) return '';
  const d = new Date(utcStr);
  if (isNaN(d.getTime())) return '';
  // JST (+9時間)
  const jstDate = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  return jstDate.toISOString().slice(0, 16);
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
