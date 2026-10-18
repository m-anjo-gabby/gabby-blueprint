// apps/admin/actions/adminNoticeAction.ts
'use server';

import { createAdminClient } from '@gabby/lib/supabase/admin';
import { revalidatePath } from 'next/cache';
import { removeStorageFiles } from '@gabby/lib/storage/removeStorageFiles';
import { createLogger } from '@gabby/lib/logger';
import { getLogContext } from '@gabby/lib/logger/context';
import {
  NOTICE_CTA_LABEL_MAX,
  NOTICE_DISPLAY_MODES,
  NOTICE_TYPES,
  isNoticeType,
  NoticeAttachment,
  NoticeType,
  NoticeTargetType,
  type AdminNoticeListItem,
  type NoticeDisplayMode,
} from '@gabby/types/notice';
import { isValidNoticeCtaUrl } from '@gabby/lib/notice/links';
import { containsPattern } from '@gabby/lib/supabase/ilike';
import { toRange, type ListParams, type ListResult } from '@/lib/list';
import { USER_STATUS, USER_TYPES, isUserType, type UserType } from '@gabby/types/user';

const logger = createLogger('admin');

export interface NoticeFormData {
  notice_id?: string;
  target_type: NoticeTargetType;
  client_id?: string | null;
  notice_type: NoticeType;
  is_important: boolean;
  display_mode: NoticeDisplayMode;
  title: string;
  content: string;
  published_at: string; // JST文字列 (例: "2026-07-22T10:00")
  expired_at?: string | null; // JST文字列
  is_published: boolean;
  attachments?: NoticeAttachment[];
  /** 見出し画像のStorageパス（生徒向けのみ） */
  image_path?: string | null;
  /** 行動ボタン（生徒向けのみ。文言とリンク先は両方そろえる） */
  cta_label?: string | null;
  cta_url?: string | null;
}

type DisplayFields = Pick<NoticeFormData, 'display_mode'> & {
  image_path: string | null;
  cta_label: string | null;
  cta_url: string | null;
};

/**
 * 表示方法・見出し画像・行動ボタンを検証して保存用の値にする。
 * コーチ向けはコーチアプリが未対応のため、ホームのカード・見出し画像・行動ボタンを使わない（DB の chk_notice_coach_display と同じ）。
 */
function toDisplayFields(
  formData: NoticeFormData,
): { ok: true; fields: DisplayFields } | { ok: false; message: string } {
  if (!NOTICE_DISPLAY_MODES.includes(formData.display_mode)) {
    return { ok: false, message: '表示方法が正しくありません' };
  }
  const isCoach = formData.target_type === 'COACH';
  if (isCoach && formData.display_mode === 'HOME') {
    return { ok: false, message: 'コーチ向けのお知らせでは「ホームのカード」を選べません' };
  }
  const ctaLabel = isCoach ? '' : (formData.cta_label ?? '').trim();
  const ctaUrl = isCoach ? '' : (formData.cta_url ?? '').trim();
  if (Boolean(ctaLabel) !== Boolean(ctaUrl)) {
    return { ok: false, message: '行動ボタンは文言とリンク先を両方入力してください' };
  }
  if (ctaLabel.length > NOTICE_CTA_LABEL_MAX) {
    return { ok: false, message: `行動ボタンの文言は${NOTICE_CTA_LABEL_MAX}文字以内で入力してください` };
  }
  if (ctaUrl && !isValidNoticeCtaUrl(ctaUrl)) {
    return {
      ok: false,
      message: '行動ボタンのリンク先は「/」で始まるアプリ内の画面か「https://」で始まるURLを入力してください',
    };
  }
  return {
    ok: true,
    fields: {
      display_mode: formData.display_mode,
      image_path: isCoach ? null : formData.image_path || null,
      cta_label: ctaLabel || null,
      cta_url: ctaUrl || null,
    },
  };
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
 * お知らせ一覧取得（ページネーション・タイトルの部分一致検索・種別での絞り込み・顧客名結合付き）
 */
export async function getNotices(params: ListParams<'type'>): Promise<ListResult<AdminNoticeListItem>> {
  const ctx = await getLogContext();
  const { q, filters } = params;
  // 種別は既知の値だけを条件にする（旧URLの type=ALL・不正な値は「すべて」として扱う）
  const noticeType = Object.hasOwn(NOTICE_TYPES, filters.type) ? filters.type : '';

  try {
    const supabase = createAdminClient();
    const [from, to] = toRange(params);

    let query = supabase.from('com_m_notice').select(
      `
        *,
        com_m_client (
          client_name
        )
      `,
      { count: 'exact' },
    );

    if (q) {
      query = query.ilike('title', containsPattern(q));
    }

    if (isNoticeType(noticeType)) {
      query = query.eq('notice_type', noticeType);
    }

    const { data, count, error } = await query
      .order('insert_date', { ascending: false })
      .order('notice_id', { ascending: true }) // 同順位の並びを一意に固定し、range(LIMIT/OFFSET)でのページ間の重複・欠落を防ぐ
      .range(from, to);

    if (error) {
      logger.error('notice:get_notices_failed', error.message, {
        ...ctx,
        err: error,
        payload: { from, to, noticeType },
      });
      throw error;
    }

    const rows = (data || []).map(({ com_m_client, ...item }) => ({
      ...item,
      client_name: (com_m_client as { client_name: string } | null)?.client_name ?? null,
    })) as AdminNoticeListItem[];

    return {
      rows,
      totalCount: count || 0,
    };
  } catch (error) {
    logger.error('notice:get_notices_unexpected', error instanceof Error ? error.message : 'Unknown error', {
      ...ctx,
      err: error,
      payload: { noticeType },
    });
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
      .select(
        `
        *,
        com_m_client (
          client_name
        )
      `,
      )
      .eq('notice_id', noticeId)
      .single();

    if (error) {
      logger.error('notice:get_by_id_failed', error.message, { ...ctx, err: error, payload: { noticeId } });
      return null;
    }

    return {
      ...data,
      client_name: data.com_m_client?.client_name || null,
    };
  } catch (error) {
    logger.error('notice:get_by_id_unexpected', error instanceof Error ? error.message : 'Unknown error', {
      ...ctx,
      err: error,
      payload: { noticeId },
    });
    return null;
  }
}

export interface NoticeReadStatusUser {
  id: string;
  user_id: number;
  user_name: string | null;
  user_type: UserType | null;
  client_id: string | null;
  client_name: string | null;
  is_read: boolean;
  read_at: string | null;
  /** 行動ボタンを最初に押した日時（押していなければ null） */
  cta_clicked_at: string | null;
}

export interface NoticeReadStatusResult extends ListResult<NoticeReadStatusUser> {
  notice: {
    notice_id: string;
    title: string;
    target_type: NoticeTargetType;
    client_id: string | null;
    has_cta: boolean;
  } | null;
  /** 絞り込み後の対象者のうち既読・未読の人数 */
  readCount: number;
  unreadCount: number;
  /** 絞り込み後の対象者のうち行動ボタンを押した人数 */
  ctaClickCount: number;
}

/**
 * お知らせ単位の既読/未読ユーザー一覧取得
 * (配信対象ユーザー全体をお知らせのtarget_typeに基づいて特定し、既読トランザクションと突合する。
 *  既読を先頭に並べるため、対象者を全件突合してからページ分けする。検索は氏名の部分一致)
 */
export async function getNoticeReadStatus(
  noticeId: string,
  params: ListParams<'clientId' | 'userType'>,
): Promise<NoticeReadStatusResult> {
  const ctx = await getLogContext();
  const {
    q,
    filters: { clientId, userType },
  } = params;

  try {
    const supabase = createAdminClient();

    const { data: notice, error: noticeError } = await supabase
      .from('com_m_notice')
      .select('notice_id, title, target_type, client_id, cta_url')
      .eq('notice_id', noticeId)
      .single();

    if (noticeError || !notice) {
      logger.error('notice:read_status_notice_not_found', noticeError?.message || 'notice not found', {
        ...ctx,
        err: noticeError,
        payload: { noticeId },
      });
      return { notice: null, rows: [], totalCount: 0, readCount: 0, unreadCount: 0, ctaClickCount: 0 };
    }

    // 配信対象ユーザー母集団を、お知らせのtarget_typeに基づいて絞り込む
    let query = supabase
      .from('com_m_user')
      .select(
        `
        id,
        user_id,
        user_name,
        user_type,
        client_id,
        com_m_client ( client_name )
      `,
      )
      .neq('status', USER_STATUS.WITHDRAWN);

    if (notice.target_type === 'ALL') {
      query = query.eq('user_type', USER_TYPES.STUDENT);
    } else if (notice.target_type === 'CLIENT' && notice.client_id) {
      // 顧客向けは client_id が必ず入る（CHECK 制約 chk_notice_target）
      query = query.eq('user_type', USER_TYPES.STUDENT).eq('client_id', notice.client_id);
    } else if (notice.target_type === 'COACH') {
      query = query.eq('user_type', USER_TYPES.COACH);
    }

    // 画面上の追加フィルター（顧客・ユーザー種別）
    if (clientId) {
      query = query.eq('client_id', clientId);
    }
    if (isUserType(userType)) {
      query = query.eq('user_type', userType);
    }
    if (q) {
      query = query.ilike('user_name', containsPattern(q));
    }

    const { data: targetUsers, error: usersError } = await query.order('user_id', { ascending: true });

    if (usersError) {
      logger.error('notice:read_status_users_failed', usersError.message, {
        ...ctx,
        err: usersError,
        payload: { noticeId, clientId, userType },
      });
      throw usersError;
    }

    // このお知らせに対する既読トランザクションを取得し、user_id -> read_at のマップを作成
    const { data: reads, error: readsError } = await supabase
      .from('com_t_notice_read')
      .select('user_id, read_at, cta_clicked_at')
      .eq('notice_id', noticeId);

    if (readsError) {
      logger.error('notice:read_status_reads_failed', readsError.message, {
        ...ctx,
        err: readsError,
        payload: { noticeId },
      });
      throw readsError;
    }

    const readMap = new Map<string, { read_at: string; cta_clicked_at: string | null }>();
    (reads || []).forEach((r) => readMap.set(r.user_id, { read_at: r.read_at, cta_clicked_at: r.cta_clicked_at }));

    const merged: NoticeReadStatusUser[] = (targetUsers || []).map((u) => ({
      id: u.id,
      user_id: u.user_id,
      user_name: u.user_name,
      user_type: u.user_type,
      client_id: u.client_id,
      // 多対一の埋め込みは型推論上は配列になるため、単一行として取り出す
      client_name: [u.com_m_client].flat()[0]?.client_name || null,
      is_read: readMap.has(u.id),
      read_at: readMap.get(u.id)?.read_at ?? null,
      cta_clicked_at: readMap.get(u.id)?.cta_clicked_at ?? null,
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
    const ctaClickCount = merged.filter((u) => u.cta_clicked_at).length;
    const [from, to] = toRange(params);

    return {
      notice: {
        notice_id: notice.notice_id,
        title: notice.title,
        target_type: notice.target_type,
        client_id: notice.client_id,
        has_cta: notice.cta_url !== null,
      },
      rows: merged.slice(from, to + 1),
      totalCount,
      readCount,
      unreadCount,
      ctaClickCount,
    };
  } catch (error) {
    logger.error('notice:read_status_unexpected', error instanceof Error ? error.message : 'Unknown error', {
      ...ctx,
      err: error,
      payload: { noticeId },
    });
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

    const display = toDisplayFields(formData);
    if (!display.ok) {
      return { success: false, message: display.message };
    }

    const insertPayload = {
      ...(formData.notice_id ? { notice_id: formData.notice_id } : {}),
      target_type: formData.target_type,
      client_id: formData.target_type === 'CLIENT' ? formData.client_id : null,
      notice_type: formData.notice_type,
      is_important: formData.is_important,
      ...display.fields,
      title: formData.title,
      content: formData.content,
      attachments: formData.attachments || [],
      published_at: publishedUtc,
      expired_at: expiredUtc,
      is_published: formData.is_published,
    };

    const { data, error } = await supabase.from('com_m_notice').insert(insertPayload).select().single();

    if (error) {
      logger.error('notice:create_failed', error.message, { ...ctx, err: error, payload: formData });
      return { success: false, message: error.message };
    }

    logger.info('notice:create_success', `Notice created: ${data.notice_id}`, {
      ...ctx,
      payload: { noticeId: data.notice_id },
    });

    revalidatePath('/notice');
    return { success: true, noticeId: data.notice_id };
  } catch (error) {
    logger.error('notice:create_unexpected', error instanceof Error ? error.message : 'Unknown error', {
      ...ctx,
      err: error,
      payload: formData,
    });
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

    const display = toDisplayFields(formData);
    if (!display.ok) {
      return { success: false, message: display.message };
    }

    const updatePayload = {
      target_type: formData.target_type,
      client_id: formData.target_type === 'CLIENT' ? formData.client_id : null,
      notice_type: formData.notice_type,
      is_important: formData.is_important,
      ...display.fields,
      title: formData.title,
      content: formData.content,
      attachments: formData.attachments || [],
      published_at: publishedUtc,
      expired_at: expiredUtc,
      is_published: formData.is_published,
      update_date: new Date().toISOString(),
    };

    const { error } = await supabase.from('com_m_notice').update(updatePayload).eq('notice_id', noticeId);

    if (error) {
      logger.error('notice:update_failed', error.message, { ...ctx, err: error, payload: { noticeId, ...formData } });
      return { success: false, message: error.message };
    }

    logger.info('notice:update_success', `Notice updated: ${noticeId}`, {
      ...ctx,
      payload: { noticeId },
    });

    revalidatePath('/notice');
    revalidatePath(`/notice/${noticeId}/edit`);
    return { success: true };
  } catch (error) {
    logger.error('notice:update_unexpected', error instanceof Error ? error.message : 'Unknown error', {
      ...ctx,
      err: error,
      payload: { noticeId },
    });
    return { success: false, message: '予期せぬエラーが発生しました' };
  }
}

/**
 * お知らせの削除（既読の記録も一緒に消える）。削除の後に画像・添付のファイルを消す
 */
export async function deleteNotice(noticeId: string) {
  const ctx = await getLogContext();
  try {
    const supabase = createAdminClient();

    const { data: deleted, error } = await supabase
      .from('com_m_notice')
      .delete()
      .eq('notice_id', noticeId)
      .select('image_path, attachments')
      .maybeSingle();

    if (error) {
      logger.error('notice:delete_failed', error.message, { ...ctx, err: error, payload: { noticeId } });
      return { success: false, message: error.message };
    }

    if (deleted) {
      const attachments = Array.isArray(deleted.attachments) ? (deleted.attachments as { path?: string }[]) : [];
      await removeStorageFiles(supabase, 'notices', [deleted.image_path, ...attachments.map((a) => a.path)], {
        event: 'notice:delete_files_failed',
        ctx,
        payload: { noticeId },
      });
    }

    logger.info('notice:delete_success', `Notice deleted: ${noticeId}`, {
      ...ctx,
      payload: { noticeId },
    });

    revalidatePath('/notice');
    return { success: true };
  } catch (error) {
    logger.error('notice:delete_unexpected', error instanceof Error ? error.message : 'Unknown error', {
      ...ctx,
      err: error,
      payload: { noticeId },
    });
    return { success: false, message: '予期せぬエラーが発生しました' };
  }
}

/** 見出し画像として受け付ける形式と上限（2MB） */
const NOTICE_IMAGE_TYPES: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' };
const NOTICE_IMAGE_MAX_BYTES = 2 * 1024 * 1024;

/**
 * 見出し画像のアップロード（FormData）
 * Storageバケット "notices" に notices/{notice_id}/image/{uuid}.{拡張子} で保存し、パスを返す
 */
export async function uploadNoticeImage(
  noticeId: string,
  formData: FormData,
): Promise<{ success: boolean; path?: string; message?: string }> {
  const ctx = await getLogContext();
  try {
    const file = formData.get('file');
    if (!(file instanceof File)) {
      return { success: false, message: '画像が選択されていません' };
    }
    const ext = NOTICE_IMAGE_TYPES[file.type];
    if (!ext) {
      return { success: false, message: '画像はPNG・JPEG・WebPのいずれかを選んでください' };
    }
    if (file.size > NOTICE_IMAGE_MAX_BYTES) {
      return { success: false, message: '画像は2MB以下のファイルを選んでください' };
    }

    const supabase = createAdminClient();
    const storagePath = `notices/${noticeId}/image/${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage
      .from('notices')
      .upload(storagePath, Buffer.from(await file.arrayBuffer()), { contentType: file.type });

    if (error) {
      logger.error('notice:upload_image_failed', error.message, { ...ctx, err: error, payload: { noticeId } });
      return { success: false, message: `アップロードに失敗しました: ${error.message}` };
    }

    logger.info('notice:upload_image_success', `Notice image uploaded: ${storagePath}`, {
      ...ctx,
      payload: { noticeId, storagePath },
    });
    return { success: true, path: storagePath };
  } catch (error) {
    logger.error('notice:upload_image_unexpected', error instanceof Error ? error.message : 'Unknown error', {
      ...ctx,
      err: error,
      payload: { noticeId },
    });
    return { success: false, message: '予期せぬエラーが発生しました' };
  }
}

/**
 * 添付ファイルのアップロード（FormData）
 * Storageバケット "notices" に notices/{notice_id}/{file.name} で保存
 */
export async function uploadNoticeFile(
  noticeId: string,
  formData: FormData,
): Promise<{ success: boolean; attachment?: NoticeAttachment; message?: string }> {
  const ctx = await getLogContext();
  try {
    const file = formData.get('file') as File;
    if (!file) {
      return { success: false, message: 'ファイルが選択されていません' };
    }

    const supabase = createAdminClient();

    // ファイル名クリーン化
    const cleanFileName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const storagePath = `notices/${noticeId}/${cleanFileName}`;

    // Storageへアップロード
    const buffer = Buffer.from(await file.arrayBuffer());
    const { error: uploadError } = await supabase.storage.from('notices').upload(storagePath, buffer, {
      contentType: file.type || 'application/octet-stream',
      upsert: true,
    });

    if (uploadError) {
      logger.error('notice:upload_file_failed', uploadError.message, {
        ...ctx,
        err: uploadError,
        payload: { noticeId, fileName: file.name },
      });
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
      payload: { noticeId, storagePath },
    });

    return { success: true, attachment: newAttachment };
  } catch (error) {
    logger.error('notice:upload_file_unexpected', error instanceof Error ? error.message : 'Unknown error', {
      ...ctx,
      err: error,
      payload: { noticeId },
    });
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

    const { error } = await supabase.storage.from('notices').remove([cleanPath]);

    if (error) {
      logger.error('notice:delete_file_failed', error.message, { ...ctx, err: error, payload: { storagePath } });
      return { success: false, message: error.message };
    }

    logger.info('notice:delete_file_success', `Attachment removed: ${cleanPath}`, { ...ctx, payload: { storagePath } });
    return { success: true };
  } catch (error) {
    logger.error('notice:delete_file_unexpected', error instanceof Error ? error.message : 'Unknown error', {
      ...ctx,
      err: error,
      payload: { storagePath },
    });
    return { success: false, message: '予期せぬエラーが発生しました' };
  }
}
