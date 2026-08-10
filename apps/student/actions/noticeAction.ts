"use server";

import { createServerClient } from "@gabby/lib/supabase/server";
import { createLogger } from "@gabby/lib/logger";
import { getLogContext } from "@gabby/lib/logger/context";
import { NoticeItem } from "@gabby/types/notice";

const logger = createLogger('student');

/**
 * 公開中のお知らせ一覧を取得
 * - is_published = TRUE かつ公開期間内
 * - 既読状態 (is_read) を LEFT JOIN で付与
 * - RLS により target_type = 'ALL' または 自身の所属クライアントのみ返る
 */
export async function getNoticesAction(): Promise<{
  success: boolean;
  data: NoticeItem[];
  error?: string;
}> {
  const ctx = await getLogContext();
  try {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, data: [], error: 'Unauthorized' };

    const { data, error } = await supabase
      .from('com_m_notice')
      .select(`
        *,
        read:com_t_notice_read(notice_id)
      `)
      .order('is_important', { ascending: false })
      .order('published_at', { ascending: false });

    if (error) {
      logger.error("notice:get_all_failed", error.message, ctx);
      return { success: false, data: [], error: error.message };
    }

    const notices: NoticeItem[] = (data || []).map((row: any) => ({
      ...row,
      attachments: Array.isArray(row.attachments) ? row.attachments : [],
      // read配列に要素があれば既読
      is_read: Array.isArray(row.read) && row.read.length > 0,
    }));

    return { success: true, data: notices };
  } catch (err) {
    logger.error("notice:get_all_unexpected", err instanceof Error ? err.message : 'Unknown error', ctx);
    return { success: false, data: [], error: 'Unexpected error' };
  }
}

/**
 * 未読件数を取得（ヘッダーバッジ用）
 */
export async function getUnreadNoticeCountAction(): Promise<number> {
  const ctx = await getLogContext();
  try {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return 0;

    // 公開中お知らせの notice_id 一覧
    const { data: allNotices, error: noticeError } = await supabase
      .from('com_m_notice')
      .select('notice_id');

    if (noticeError || !allNotices) return 0;

    const noticeIds = allNotices.map((n: any) => n.notice_id);
    if (noticeIds.length === 0) return 0;

    // 既読済み notice_id
    const { data: readData, error: readError } = await supabase
      .from('com_t_notice_read')
      .select('notice_id')
      .eq('user_id', user.id)
      .in('notice_id', noticeIds);

    if (readError) return 0;

    const readIds = new Set((readData || []).map((r: any) => r.notice_id));
    return noticeIds.filter((id: string) => !readIds.has(id)).length;
  } catch (err) {
    logger.error("notice:unread_count_unexpected", err instanceof Error ? err.message : 'Unknown error', ctx);
    return 0;
  }
}

/**
 * 指定のお知らせを既読にする（UPSERT）
 */
export async function markNoticeAsReadAction(noticeId: string): Promise<{
  success: boolean;
  error?: string;
}> {
  const ctx = await getLogContext();
  try {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: 'Unauthorized' };

    const { error } = await supabase
      .from('com_t_notice_read')
      .upsert(
        {
          notice_id: noticeId,
          user_id: user.id,
          read_at: new Date().toISOString(),
          insert_date: new Date().toISOString(),
          update_date: new Date().toISOString(),
        },
        { onConflict: 'notice_id,user_id', ignoreDuplicates: true }
      );

    if (error) {
      logger.error("notice:mark_read_failed", error.message, ctx);
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (err) {
    logger.error("notice:mark_read_unexpected", err instanceof Error ? err.message : 'Unknown error', ctx);
    return { success: false, error: 'Unexpected error' };
  }
}

/**
 * 複数のお知らせをまとめて既読にする（ダイアログ表示後の一括既読化）
 */
export async function markNoticesAsReadBatchAction(noticeIds: string[]): Promise<{
  success: boolean;
  error?: string;
}> {
  const ctx = await getLogContext();
  if (noticeIds.length === 0) return { success: true };

  try {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: 'Unauthorized' };

    const now = new Date().toISOString();
    const rows = noticeIds.map(notice_id => ({
      notice_id,
      user_id: user.id,
      read_at: now,
      insert_date: now,
      update_date: now,
    }));

    const { error } = await supabase
      .from('com_t_notice_read')
      .upsert(rows, { onConflict: 'notice_id,user_id', ignoreDuplicates: true });

    if (error) {
      logger.error("notice:mark_read_batch_failed", error.message, ctx);
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (err) {
    logger.error("notice:mark_read_batch_unexpected", err instanceof Error ? err.message : 'Unknown error', ctx);
    return { success: false, error: 'Unexpected error' };
  }
}

/**
 * Supabase Storage (notices バケット) から添付ファイルの公開URLを取得
 * @param path Storageパス (例: notices/c7aaeab6.../file.pdf)
 */
export async function getNoticeAttachmentUrlAction(
  path: string
): Promise<{ url: string | null; error?: string }> {
  const ctx = await getLogContext();
  try {
    const supabase = await createServerClient();

    // Public バケット 'notices' から公開URLを取得
    const { data } = supabase.storage
      .from('notices')
      .getPublicUrl(path);

    if (data?.publicUrl) {
      return { url: data.publicUrl };
    }

    logger.error("notice:get_attachment_url_failed", 'Failed to generate public URL', {
      ...ctx,
      payload: { path }
    });
    return { url: null, error: 'Failed to generate public URL' };
  } catch (err) {
    logger.error("notice:get_attachment_url_unexpected", err instanceof Error ? err.message : 'Unknown error', {
      ...ctx,
      payload: { path }
    });
    return { url: null, error: 'Unexpected error' };
  }
}
