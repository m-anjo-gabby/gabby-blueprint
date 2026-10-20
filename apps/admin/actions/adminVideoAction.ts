'use server';

import { getTranslations } from 'next-intl/server';
import { unstable_rethrow } from 'next/navigation';
import { createLogger, type LogContext } from '@gabby/lib/logger';
import { getLogContext } from '@gabby/lib/logger/context';
import { getErrorMessage } from '@gabby/lib/logger/errorMessage';
import { createAdminClient } from '@gabby/lib/supabase/admin';
import { isInUseError } from '@gabby/lib/supabase/pgErrors';
import {
  isVideoObjectKeyOf,
  VIDEO_FILE_MAX_BYTES,
  VIDEO_FILE_TYPES,
  type VideoFileCheckError,
  type VideoFileKind,
  type VideoUploadTarget,
} from '@gabby/lib/video/files';
import { moveInOrder, nextSeqNo, renumberChanges, type OrderedItem } from '@gabby/lib/video/order';
import {
  createVideoUploadTarget,
  getVideoFileInfo,
  getVideoFileUrls,
  removeVideoFiles,
} from '@gabby/lib/video/storage';
import type { ActionResult, BasicErrorCode, CoreResult } from '@gabby/types/action';
import {
  VIDEO_STATUS,
  type AdminVideoItem,
  type AdminVideoSection,
  type VideoMoveTarget,
  type VideoStatus,
} from '@gabby/types/video';
import { ADMIN_OR_CONTENT_MANAGER, requireAdminRole } from '@/lib/adminAuth';

const logger = createLogger('admin');

/** ビデオ教材の content_type（com_m_contents） */
const VIDEO_CONTENT_TYPE = 1;

type ErrorsT = Awaited<ReturnType<typeof getTranslations<'contents.errors'>>>;

/** セクション・ビデオの並びの同順の時の並び（旧データの seq_no の重複に備え、登録順で決める） */
function byOrder<T extends { seq_no: number; insert_date: string }>(a: T, b: T): number {
  return a.seq_no - b.seq_no || a.insert_date.localeCompare(b.insert_date);
}

/** 並べ替えの結果を書き戻す（seq_no が変わった行だけ。1行ずつの更新のため、途中で失敗したら次の並べ替えで詰め直る） */
async function writeOrder(
  table: 'com_m_video_section' | 'com_m_video',
  orderedIds: string[],
  current: OrderedItem[],
): Promise<void> {
  const supabase = createAdminClient();
  const results = await Promise.all(
    renumberChanges(orderedIds, current).map(({ id, seq_no }) =>
      table === 'com_m_video_section'
        ? supabase.from('com_m_video_section').update({ seq_no }).eq('section_id', id)
        : supabase.from('com_m_video').update({ seq_no }).eq('video_id', id),
    ),
  );
  const failed = results.find((r) => r.error);
  if (failed?.error) throw failed.error;
}

function fileErrorMessage(t: ErrorsT, error: VideoFileCheckError, kind: VideoFileKind): string {
  if (error === 'unsupported_type') return t('videoUnsupportedType');
  if (error === 'empty_file') return t('videoEmptyFile');
  return t('videoFileTooLarge', { max: Math.floor(VIDEO_FILE_MAX_BYTES[kind] / 1024 / 1024) });
}

/** ブラウザがアップロードしたと言うキーが、そのビデオのもので、実際に置かれた正しい種類のファイルかを確かめる */
async function isUploadedFile(videoId: string, key: string, kind: VideoFileKind): Promise<boolean> {
  if (!isVideoObjectKeyOf(videoId, key)) return false;
  const info = await getVideoFileInfo(key);
  return !!info && info.size > 0 && !!info.contentType && info.contentType in VIDEO_FILE_TYPES[kind];
}

/**
 * ビデオ教材のエディタのセクションとビデオ（非公開のビデオも含む）。サムネイルには表示用の URL を添える
 */
export async function getVideoEditorSections(
  contentId: string,
): Promise<CoreResult<{ sections: AdminVideoSection[] }, BasicErrorCode>> {
  await requireAdminRole(ADMIN_OR_CONTENT_MANAGER);
  const ctx = await getLogContext();
  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from('com_m_video_section')
      .select('*, com_m_video(*)')
      .eq('content_id', contentId);
    if (error) {
      logger.error('video:get_sections_failed', error.message, { ...ctx, err: error, payload: { contentId } });
      return { success: false, errorCode: 'unexpected_error' };
    }

    const rows = (data ?? []).sort(byOrder);
    const thumbnailUrls = await getVideoFileUrls(
      rows.flatMap((s) => s.com_m_video.map((v) => v.thumbnail_path)),
      60 * 60,
    );
    const sections: AdminVideoSection[] = rows.map(({ com_m_video: videos, ...section }) => ({
      ...section,
      videos: [...videos].sort(byOrder).map((v): AdminVideoItem => ({
        ...v,
        thumbnail_url: v.thumbnail_path ? (thumbnailUrls.get(v.thumbnail_path) ?? null) : null,
      })),
    }));
    return { success: true, sections };
  } catch (error) {
    unstable_rethrow(error);
    logger.error('video:get_sections_unexpected', getErrorMessage(error), {
      ...ctx,
      err: error,
      payload: { contentId },
    });
    return { success: false, errorCode: 'unexpected_error' };
  }
}

/**
 * セクションの登録・名前の変更。見出しを出さないセクションは名前を空にする（NULL）
 */
export async function saveVideoSection(input: {
  section_id?: string;
  content_id: string;
  section_name: string;
  section_name_en: string;
}): Promise<ActionResult> {
  await requireAdminRole(ADMIN_OR_CONTENT_MANAGER);
  const t = await getTranslations();
  const ctx = await getLogContext();
  try {
    const supabase = createAdminClient();
    const sectionName = input.section_name.trim() || null;
    const sectionNameEn = input.section_name_en.trim() || null;
    // 見出しの有無は和名で決めるため、英名だけのセクションは作らせない
    if (!sectionName && sectionNameEn) {
      return { success: false, message: t('contents.errors.videoSectionNameRequiredForEn') };
    }

    if (input.section_id) {
      const { error } = await supabase
        .from('com_m_video_section')
        .update({ section_name: sectionName, section_name_en: sectionNameEn })
        .eq('section_id', input.section_id)
        .eq('content_id', input.content_id);
      if (error) throw error;
    } else {
      const { data: content, error: contentError } = await supabase
        .from('com_m_contents')
        .select('content_type, com_m_video_section(seq_no)')
        .eq('content_id', input.content_id)
        .maybeSingle();
      if (contentError) throw contentError;
      if (!content || content.content_type !== VIDEO_CONTENT_TYPE) {
        return { success: false, message: t('common.errors.unexpected') };
      }
      const { error } = await supabase.from('com_m_video_section').insert({
        content_id: input.content_id,
        section_name: sectionName,
        section_name_en: sectionNameEn,
        seq_no: nextSeqNo(content.com_m_video_section),
      });
      if (error) throw error;
    }

    logger.info('video:save_section_success', `Video section ${input.section_id ? 'updated' : 'created'}`, {
      ...ctx,
      payload: { contentId: input.content_id, sectionId: input.section_id },
    });
    return { success: true };
  } catch (error) {
    unstable_rethrow(error);
    logger.error('video:save_section_failed', getErrorMessage(error), {
      ...ctx,
      err: error,
      payload: { contentId: input.content_id, sectionId: input.section_id },
    });
    return { success: false, message: t('common.errors.unexpected') };
  }
}

/**
 * セクションの削除。ビデオが残っているセクションは消さない（ビデオを移すか消してから）
 */
export async function deleteVideoSection(sectionId: string): Promise<ActionResult<object, 'not_empty'>> {
  await requireAdminRole(ADMIN_OR_CONTENT_MANAGER);
  const t = await getTranslations();
  const ctx = await getLogContext();
  try {
    const supabase = createAdminClient();
    const { count, error: countError } = await supabase
      .from('com_m_video')
      .select('video_id', { count: 'exact', head: true })
      .eq('section_id', sectionId);
    if (countError) throw countError;
    if ((count ?? 0) > 0) {
      return { success: false, errorCode: 'not_empty', message: t('contents.errors.videoSectionNotEmpty') };
    }

    const { error } = await supabase.from('com_m_video_section').delete().eq('section_id', sectionId);
    if (error) throw error;

    logger.info('video:delete_section_success', 'Video section deleted', { ...ctx, payload: { sectionId } });
    return { success: true };
  } catch (error) {
    unstable_rethrow(error);
    logger.error('video:delete_section_failed', getErrorMessage(error), { ...ctx, err: error, payload: { sectionId } });
    return { success: false, message: t('common.errors.unexpected') };
  }
}

/**
 * セクションを1つ上・下へ動かす
 */
export async function moveVideoSection(sectionId: string, direction: -1 | 1): Promise<ActionResult> {
  await requireAdminRole(ADMIN_OR_CONTENT_MANAGER);
  const t = await getTranslations();
  const ctx = await getLogContext();
  try {
    const supabase = createAdminClient();
    const { data: target, error: targetError } = await supabase
      .from('com_m_video_section')
      .select('content_id')
      .eq('section_id', sectionId)
      .single();
    if (targetError) throw targetError;

    const { data: sections, error } = await supabase
      .from('com_m_video_section')
      .select('section_id, seq_no, insert_date')
      .eq('content_id', target.content_id);
    if (error) throw error;

    const sorted = sections.sort(byOrder);
    const ordered = moveInOrder(
      sorted.map((s) => s.section_id),
      sectionId,
      direction,
    );
    if (ordered) {
      await writeOrder(
        'com_m_video_section',
        ordered,
        sorted.map((s) => ({ id: s.section_id, seq_no: s.seq_no })),
      );
    }
    return { success: true };
  } catch (error) {
    unstable_rethrow(error);
    logger.error('video:move_section_failed', getErrorMessage(error), { ...ctx, err: error, payload: { sectionId } });
    return { success: false, message: t('common.errors.unexpected') };
  }
}

interface UploadFileMeta {
  type: string;
  size: number;
}

/**
 * ファイルのアップロード先を作る。新しいビデオは videoId を渡さず、ここで決めた ID で saveVideo まで進める
 * （キーをビデオの ID のフォルダーに置くため、行より先に ID を決める）。
 */
export async function prepareVideoUpload(input: {
  videoId?: string;
  video?: UploadFileMeta;
  thumbnail?: UploadFileMeta;
}): Promise<ActionResult<{ videoId: string; targets: Partial<Record<VideoFileKind, VideoUploadTarget>> }>> {
  await requireAdminRole(ADMIN_OR_CONTENT_MANAGER);
  const t = await getTranslations();
  const tErrors = await getTranslations('contents.errors');
  const ctx = await getLogContext();
  try {
    let videoId = crypto.randomUUID();
    if (input.videoId) {
      const { data, error } = await createAdminClient()
        .from('com_m_video')
        .select('video_id')
        .eq('video_id', input.videoId)
        .maybeSingle();
      if (error) throw error;
      if (!data) return { success: false, message: t('contents.errors.videoNotFound') };
      videoId = data.video_id;
    }

    const targets: Partial<Record<VideoFileKind, VideoUploadTarget>> = {};
    for (const kind of ['video', 'thumbnail'] as const) {
      const file = input[kind];
      if (!file) continue;
      const result = await createVideoUploadTarget(kind, videoId, file);
      if (!result.ok) {
        if (result.error === 'storage_error') throw new Error(`Failed to create an upload URL (${kind})`);
        return { success: false, message: fileErrorMessage(tErrors, result.error, kind) };
      }
      targets[kind] = result.target;
    }
    return { success: true, videoId, targets };
  } catch (error) {
    unstable_rethrow(error);
    logger.error('video:prepare_upload_failed', getErrorMessage(error), {
      ...ctx,
      err: error,
      payload: { videoId: input.videoId },
    });
    return { success: false, message: t('common.errors.unexpected') };
  }
}

/**
 * 保存しなかったアップロード（アップロードの途中の失敗・ダイアログの取り消し）のファイルを消す。
 * そのビデオの行が使っているキーは消さない
 */
export async function discardVideoUploads(videoId: string, keys: string[]): Promise<ActionResult> {
  await requireAdminRole(ADMIN_OR_CONTENT_MANAGER);
  const t = await getTranslations();
  const ctx = await getLogContext();
  try {
    const { data, error } = await createAdminClient()
      .from('com_m_video')
      .select('video_path, thumbnail_path')
      .eq('video_id', videoId)
      .maybeSingle();
    if (error) throw error;
    const inUse = new Set([data?.video_path, data?.thumbnail_path]);
    await removeVideoFiles(
      keys.filter((key) => isVideoObjectKeyOf(videoId, key) && !inUse.has(key)),
      { ctx, payload: { videoId } },
    );
    return { success: true };
  } catch (error) {
    unstable_rethrow(error);
    logger.error('video:discard_uploads_failed', getErrorMessage(error), { ...ctx, err: error, payload: { videoId } });
    return { success: false, message: t('common.errors.unexpected') };
  }
}

export interface SaveVideoInput {
  video_id: string;
  /** 新しいビデオの登録先のセクション（登録時だけ使う。移動は moveVideoToSection） */
  section_id?: string;
  title: string;
  title_en: string;
  description: string;
  status: VideoStatus;
  /** 新しくアップロードした動画のキー（登録時は必須。編集時は差し替える時だけ） */
  video_key?: string;
  /** 新しくアップロードしたサムネイルのキー */
  thumbnail_key?: string;
  /** サムネイルを外す（thumbnail_key と同時には使わない） */
  remove_thumbnail?: boolean;
  /** ブラウザで動画のファイルから測った再生時間（動画を選んだ時だけ） */
  duration_sec?: number | null;
}

/**
 * ビデオの登録・更新。ファイルは prepareVideoUpload の先へブラウザがアップロード済みのものを、置かれたことを確かめてから使う。
 * 差し替え・外したファイルは、行の更新の後に消す
 */
export async function saveVideo(input: SaveVideoInput): Promise<ActionResult> {
  await requireAdminRole(ADMIN_OR_CONTENT_MANAGER);
  const t = await getTranslations();
  const ctx = await getLogContext();
  const uploadedKeys = [input.video_key, input.thumbnail_key].filter((k): k is string => !!k);
  try {
    const supabase = createAdminClient();
    const title = input.title.trim();
    if (!title) return { success: false, message: t('contents.errors.videoTitleRequired') };
    const titleEn = input.title_en.trim() || null;
    if (!Object.values(VIDEO_STATUS).includes(input.status)) {
      return { success: false, message: t('common.errors.unexpected') };
    }
    const durationSec =
      typeof input.duration_sec === 'number' && Number.isFinite(input.duration_sec) && input.duration_sec >= 0
        ? Math.round(input.duration_sec)
        : null;

    if (
      (input.video_key && !(await isUploadedFile(input.video_id, input.video_key, 'video'))) ||
      (input.thumbnail_key && !(await isUploadedFile(input.video_id, input.thumbnail_key, 'thumbnail')))
    ) {
      return { success: false, message: t('contents.errors.videoUploadMissing') };
    }

    const { data: existing, error: existingError } = await supabase
      .from('com_m_video')
      .select('video_path, thumbnail_path')
      .eq('video_id', input.video_id)
      .maybeSingle();
    if (existingError) throw existingError;

    if (!existing) {
      if (!input.section_id || !input.video_key) return { success: false, message: t('common.errors.unexpected') };
      const { data: section, error: sectionError } = await supabase
        .from('com_m_video_section')
        .select('section_id, com_m_video(seq_no)')
        .eq('section_id', input.section_id)
        .maybeSingle();
      if (sectionError) throw sectionError;
      if (!section) return { success: false, message: t('contents.errors.videoSectionNotFound') };

      const { error } = await supabase.from('com_m_video').insert({
        video_id: input.video_id,
        section_id: section.section_id,
        title,
        title_en: titleEn,
        description: input.description.trim() || null,
        status: input.status,
        video_path: input.video_key,
        thumbnail_path: input.thumbnail_key ?? null,
        duration_sec: durationSec,
        seq_no: nextSeqNo(section.com_m_video),
      });
      if (error) throw error;
      logger.info('video:create_video_success', 'Video created', {
        ...ctx,
        payload: { videoId: input.video_id, sectionId: section.section_id },
      });
      return { success: true };
    }

    const thumbnailPath = input.thumbnail_key ?? (input.remove_thumbnail ? null : existing.thumbnail_path);
    const { error } = await supabase
      .from('com_m_video')
      .update({
        title,
        title_en: titleEn,
        description: input.description.trim() || null,
        status: input.status,
        thumbnail_path: thumbnailPath,
        ...(input.video_key ? { video_path: input.video_key, duration_sec: durationSec } : {}),
      })
      .eq('video_id', input.video_id);
    if (error) throw error;

    await removeVideoFiles(
      [
        input.video_key ? existing.video_path : null,
        thumbnailPath !== existing.thumbnail_path ? existing.thumbnail_path : null,
      ],
      { ctx, payload: { videoId: input.video_id } },
    );
    logger.info('video:update_video_success', 'Video updated', {
      ...ctx,
      payload: { videoId: input.video_id, replacedVideo: !!input.video_key, replacedThumbnail: !!input.thumbnail_key },
    });
    return { success: true };
  } catch (error) {
    unstable_rethrow(error);
    logger.error('video:save_video_failed', getErrorMessage(error), {
      ...ctx,
      err: error,
      payload: { videoId: input.video_id },
    });
    await removeUnsavedUploads(input.video_id, uploadedKeys, ctx);
    return { success: false, message: t('common.errors.unexpected') };
  }
}

/** 保存に失敗した時に、今回アップロードしたファイルのうち行が使っていないものを消す */
async function removeUnsavedUploads(videoId: string, keys: string[], ctx: LogContext): Promise<void> {
  if (keys.length === 0) return;
  try {
    const { data } = await createAdminClient()
      .from('com_m_video')
      .select('video_path, thumbnail_path')
      .eq('video_id', videoId)
      .maybeSingle();
    const inUse = new Set([data?.video_path, data?.thumbnail_path]);
    await removeVideoFiles(
      keys.filter((key) => !inUse.has(key)),
      { ctx, payload: { videoId } },
    );
  } catch (error) {
    unstable_rethrow(error);
    logger.error('video:delete_files_failed', getErrorMessage(error), { ...ctx, err: error, payload: { videoId } });
  }
}

/**
 * 公開・非公開の切り替え（一覧から）
 */
export async function setVideoStatus(videoId: string, status: VideoStatus): Promise<ActionResult> {
  await requireAdminRole(ADMIN_OR_CONTENT_MANAGER);
  const t = await getTranslations();
  const ctx = await getLogContext();
  try {
    if (!Object.values(VIDEO_STATUS).includes(status)) {
      return { success: false, message: t('common.errors.unexpected') };
    }
    const { error } = await createAdminClient().from('com_m_video').update({ status }).eq('video_id', videoId);
    if (error) throw error;
    logger.info('video:set_status_success', 'Video status changed', { ...ctx, payload: { videoId, status } });
    return { success: true };
  } catch (error) {
    unstable_rethrow(error);
    logger.error('video:set_status_failed', getErrorMessage(error), { ...ctx, err: error, payload: { videoId } });
    return { success: false, message: t('common.errors.unexpected') };
  }
}

/**
 * ビデオの削除（誤登録の取り消し）。視聴の記録があるビデオは外部キー（RESTRICT）で止まり、非公開にするよう案内する。
 * ファイルは行の削除の後に消す
 */
export async function deleteVideo(videoId: string): Promise<ActionResult<object, 'in_use'>> {
  await requireAdminRole(ADMIN_OR_CONTENT_MANAGER);
  const t = await getTranslations();
  const ctx = await getLogContext();
  try {
    const { data, error } = await createAdminClient()
      .from('com_m_video')
      .delete()
      .eq('video_id', videoId)
      .select('video_path, thumbnail_path');
    if (error) {
      if (isInUseError(error)) {
        return { success: false, errorCode: 'in_use', message: t('contents.errors.videoInUse') };
      }
      throw error;
    }

    await removeVideoFiles(
      (data ?? []).flatMap((v) => [v.video_path, v.thumbnail_path]),
      { ctx, payload: { videoId } },
    );
    logger.info('video:delete_video_success', 'Video deleted', { ...ctx, payload: { videoId } });
    return { success: true };
  } catch (error) {
    unstable_rethrow(error);
    logger.error('video:delete_video_failed', getErrorMessage(error), { ...ctx, err: error, payload: { videoId } });
    return { success: false, message: t('common.errors.unexpected') };
  }
}

/**
 * ビデオをセクションの中で1つ上・下へ動かす
 */
export async function moveVideoInSection(videoId: string, direction: -1 | 1): Promise<ActionResult> {
  await requireAdminRole(ADMIN_OR_CONTENT_MANAGER);
  const t = await getTranslations();
  const ctx = await getLogContext();
  try {
    const supabase = createAdminClient();
    const { data: target, error: targetError } = await supabase
      .from('com_m_video')
      .select('section_id')
      .eq('video_id', videoId)
      .single();
    if (targetError) throw targetError;

    const { data: videos, error } = await supabase
      .from('com_m_video')
      .select('video_id, seq_no, insert_date')
      .eq('section_id', target.section_id);
    if (error) throw error;

    const sorted = videos.sort(byOrder);
    const ordered = moveInOrder(
      sorted.map((v) => v.video_id),
      videoId,
      direction,
    );
    if (ordered) {
      await writeOrder(
        'com_m_video',
        ordered,
        sorted.map((v) => ({ id: v.video_id, seq_no: v.seq_no })),
      );
    }
    return { success: true };
  } catch (error) {
    unstable_rethrow(error);
    logger.error('video:move_video_failed', getErrorMessage(error), { ...ctx, err: error, payload: { videoId } });
    return { success: false, message: t('common.errors.unexpected') };
  }
}

/**
 * ビデオを別のセクション（別の教材のセクションでもよい）の末尾へ移す。視聴の記録はビデオに付くため、そのまま残る
 */
export async function moveVideoToSection(videoId: string, targetSectionId: string): Promise<ActionResult> {
  await requireAdminRole(ADMIN_OR_CONTENT_MANAGER);
  const t = await getTranslations();
  const ctx = await getLogContext();
  try {
    const supabase = createAdminClient();
    const { data: section, error: sectionError } = await supabase
      .from('com_m_video_section')
      .select('section_id, com_m_contents!inner(content_type), com_m_video(seq_no)')
      .eq('section_id', targetSectionId)
      .maybeSingle();
    if (sectionError) throw sectionError;
    if (!section || section.com_m_contents.content_type !== VIDEO_CONTENT_TYPE) {
      return { success: false, message: t('contents.errors.videoSectionNotFound') };
    }

    const { error } = await supabase
      .from('com_m_video')
      .update({ section_id: section.section_id, seq_no: nextSeqNo(section.com_m_video) })
      .eq('video_id', videoId)
      .neq('section_id', section.section_id);
    if (error) throw error;

    logger.info('video:move_to_section_success', 'Video moved to another section', {
      ...ctx,
      payload: { videoId, targetSectionId },
    });
    return { success: true };
  } catch (error) {
    unstable_rethrow(error);
    logger.error('video:move_to_section_failed', getErrorMessage(error), {
      ...ctx,
      err: error,
      payload: { videoId, targetSectionId },
    });
    return { success: false, message: t('common.errors.unexpected') };
  }
}

/**
 * ビデオの移動先の候補（全てのビデオ教材と、そのセクション）
 */
export async function getVideoMoveTargets(): Promise<CoreResult<{ targets: VideoMoveTarget[] }, BasicErrorCode>> {
  await requireAdminRole(ADMIN_OR_CONTENT_MANAGER);
  const ctx = await getLogContext();
  try {
    const { data, error } = await createAdminClient()
      .from('com_m_contents')
      .select('content_id, content_name, seq_no, com_m_video_section(section_id, section_name, seq_no)')
      .eq('content_type', VIDEO_CONTENT_TYPE)
      .order('category_id', { ascending: true, nullsFirst: false })
      .order('seq_no', { ascending: true })
      .order('content_name', { ascending: true });
    if (error) throw error;

    const targets: VideoMoveTarget[] = (data ?? []).map((c) => ({
      content_id: c.content_id,
      content_name: c.content_name,
      sections: [...c.com_m_video_section].sort((a, b) => a.seq_no - b.seq_no),
    }));
    return { success: true, targets };
  } catch (error) {
    unstable_rethrow(error);
    logger.error('video:get_move_targets_failed', getErrorMessage(error), { ...ctx, err: error });
    return { success: false, errorCode: 'unexpected_error' };
  }
}

/**
 * プレビュー用の動画の URL（非公開のビデオも見られる）
 */
export async function getVideoPreviewUrl(videoId: string): Promise<ActionResult<{ url: string }>> {
  await requireAdminRole(ADMIN_OR_CONTENT_MANAGER);
  const t = await getTranslations();
  const ctx = await getLogContext();
  try {
    const { data, error } = await createAdminClient()
      .from('com_m_video')
      .select('video_path')
      .eq('video_id', videoId)
      .maybeSingle();
    if (error) throw error;
    if (!data) return { success: false, message: t('contents.errors.videoNotFound') };

    const url = (await getVideoFileUrls([data.video_path])).get(data.video_path);
    if (!url) throw new Error('Failed to create a signed URL');
    return { success: true, url };
  } catch (error) {
    unstable_rethrow(error);
    logger.error('video:get_preview_url_failed', getErrorMessage(error), { ...ctx, err: error, payload: { videoId } });
    return { success: false, message: t('common.errors.unexpected') };
  }
}
