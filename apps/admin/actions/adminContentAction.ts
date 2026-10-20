'use server';

import { getTranslations } from 'next-intl/server';
import { revalidatePath } from 'next/cache';
import { unstable_rethrow } from 'next/navigation';
import { createLogger } from '@gabby/lib/logger';
import { getLogContext } from '@gabby/lib/logger/context';
import { getErrorMessage } from '@gabby/lib/logger/errorMessage';
import { removeStorageFiles } from '@gabby/lib/storage/removeStorageFiles';
import { createAdminClient } from '@gabby/lib/supabase/admin';
import { ilikeAny } from '@gabby/lib/supabase/ilike';
import { isInUseError } from '@gabby/lib/supabase/pgErrors';
import { removeVideoFiles } from '@gabby/lib/video/storage';
import type { ActionResult } from '@gabby/types/action';
import { CLIENT_STATUS } from '@gabby/types/client';
import {
  CONTENT_TYPES,
  type Content,
  type ContentRecord,
  type ContentTagSummary,
  type ContentType,
} from '@gabby/types/content';
import { ADMIN_OR_CONTENT_MANAGER, requireAdminRole } from '@/lib/adminAuth';
import { toRange, type ListParams, type ListResult } from '@/lib/list';

const logger = createLogger('admin');

/**
 * 教材一覧取得（ページネーション・教材名/ラベルの部分一致検索・種別での絞り込み）
 * 種別順(content_type)・セット分類順(category_id)・表示順(seq_no)で並べる。
 */
export async function getContents(params: ListParams<'type'>): Promise<ListResult<Content>> {
  await requireAdminRole(ADMIN_OR_CONTENT_MANAGER);
  const ctx = await getLogContext();
  const { q, filters } = params;
  // 種別は既知の値だけを条件にする（不正な値は「すべて」として扱う）
  const contentType = Object.hasOwn(CONTENT_TYPES, filters.type) ? (Number(filters.type) as ContentType) : undefined;
  try {
    const supabase = await createAdminClient();
    const [from, to] = toRange(params);

    let query = supabase
      .from('com_m_contents')
      .select(
        `
        *,
        tags:com_t_contents_tag_rel(
          tag:com_m_contents_tag(
            tag_id,
            tag_name,
            tag_type
          )
        ),
        access:com_m_contents_access(
          client:com_m_client(
            client_id,
            client_name
          )
        )
      `,
        { count: 'exact' },
      )
      .order('content_type', { ascending: true })
      // ダイアログ教材はセット分類ごとにseq_noを振り直しているため、分類単位でまとめて並べる（他種別はNULL）
      .order('category_id', { ascending: true, nullsFirst: false })
      .order('seq_no', { ascending: true })
      // 同順位の並びを一意に固定し、range(LIMIT/OFFSET)でのページ間の重複・欠落を防ぐ
      .order('content_id', { ascending: true })
      .order('seq_no', { referencedTable: 'com_t_contents_tag_rel.com_m_contents_tag', ascending: true })
      .range(from, to);

    if (q) {
      query = query.or(ilikeAny(['content_name', 'content_label'], q));
    }

    if (contentType !== undefined) {
      query = query.eq('content_type', contentType);
    }

    const { data, count, error } = await query;

    if (error) {
      logger.error('content:get_contents_failed', error.message, {
        ...ctx,
        err: error,
        payload: { from, to, contentType },
      });
      throw new Error(error.message);
    }

    const contents: Content[] = (data || []).map((item) => ({
      ...item,
      tags: item.tags?.map((t) => t.tag).filter(Boolean) || [],
      access_clients: item.access?.map((a) => a.client).filter(Boolean) || [],
    }));

    return {
      rows: contents,
      totalCount: count || 0,
    };
  } catch (error) {
    unstable_rethrow(error);
    logger.error('content:get_contents_unexpected', getErrorMessage(error), {
      ...ctx,
      err: error,
      payload: { contentType },
    });
    throw error instanceof Error ? error : new Error('予期せぬエラーが発生しました');
  }
}

/**
 * IDを指定して教材情報を取得する
 */
export async function getContentById(contentId: string): Promise<ContentRecord | null> {
  await requireAdminRole(ADMIN_OR_CONTENT_MANAGER);
  const ctx = await getLogContext();
  try {
    const supabase = createAdminClient();

    const { data, error } = await supabase.from('com_m_contents').select('*').eq('content_id', contentId).single();

    if (error) {
      logger.error('content:get_content_by_id_failed', error.message, { ...ctx, err: error, payload: { contentId } });
      return null;
    }

    return data as ContentRecord;
  } catch (err) {
    unstable_rethrow(err);
    logger.error('content:get_content_by_id_unexpected', getErrorMessage(err), {
      ...ctx,
      err,
      payload: { contentId },
    });
    return null;
  }
}

/**
 * 教材の登録・更新 (Upsert)
 */
/** 教材の登録・更新の入力（タグ・公開先は別の操作で保存するため含めない） */
export type ContentUpsertInput = Pick<ContentRecord, 'content_name' | 'content_label'> &
  Partial<Omit<ContentRecord, 'content_name' | 'content_label'>>;

export async function upsertContent(payload: ContentUpsertInput): Promise<ActionResult<{ data: Content }>> {
  await requireAdminRole(ADMIN_OR_CONTENT_MANAGER);
  const t = await getTranslations();
  const ctx = await getLogContext();
  try {
    const supabase = createAdminClient();
    const { content_id: contentId, metadata, ...columns } = payload;
    const isEdit = !!contentId;

    // 更新（Edit）時の既存メタデータとの安全なマージ処理
    let finalMetadata = metadata || {};
    if (contentId) {
      const { data: existingRecord } = await supabase
        .from('com_m_contents')
        .select('metadata')
        .eq('content_id', contentId)
        .single();

      if (existingRecord?.metadata) {
        finalMetadata = {
          ...existingRecord.metadata,
          ...metadata,
          // スプリントデータの階層が壊れないよう明示的にディープマージ
          sprint: metadata?.sprint
            ? {
                ...(existingRecord.metadata.sprint || {}),
                ...metadata.sprint,
              }
            : existingRecord.metadata.sprint,
        };
      }
    }

    // クライアント側で既存の metadata とマージされたものが送られてくる想定
    const dataToSave = {
      ...columns,
      metadata: finalMetadata,
      update_date: new Date().toISOString(),
    };

    let query;
    if (contentId) {
      query = supabase.from('com_m_contents').update(dataToSave).eq('content_id', contentId).select();
    } else {
      query = supabase.from('com_m_contents').insert([dataToSave]).select();
    }

    const { data, error } = await query;

    if (error) {
      logger.error('content:upsert_content_failed', error.message, { ...ctx, err: error, payload });
      return { success: false, message: t('common.errors.unexpected') };
    }

    const savedContent = data?.[0] as Content;

    // ビデオ教材はセクションの中にビデオを置くため、見出しの無いセクションを1つ作っておく（失敗してもエディタから足せる）
    if (!isEdit && savedContent.content_type === 1) {
      const { error: sectionError } = await supabase
        .from('com_m_video_section')
        .insert({ content_id: savedContent.content_id, section_name: null, seq_no: 1 });
      if (sectionError) {
        logger.error('video:create_default_section_failed', sectionError.message, {
          ...ctx,
          err: sectionError,
          payload: { contentId: savedContent.content_id },
        });
      }
    }
    logger.info(
      'content:upsert_content_success',
      `Content ${isEdit ? 'updated' : 'created'}: ${savedContent.content_name}`,
      {
        ...ctx,
        payload: { contentId: savedContent.content_id, isEdit },
      },
    );

    revalidatePath('/contents');
    return { success: true, data: savedContent };
  } catch (error) {
    unstable_rethrow(error);
    logger.error('content:upsert_content_unexpected', getErrorMessage(error), {
      ...ctx,
      err: error,
      payload,
    });
    return { success: false, message: t('common.errors.unexpected') };
  }
}

/**
 * 教材の削除（誤登録の取り消し）。学習の履歴・割当がある教材は外部キー（RESTRICT）で止まり、
 * 非公開（status = 0）にするよう案内する
 */
export async function deleteContent(contentId: string): Promise<ActionResult<object, 'in_use'>> {
  await requireAdminRole(ADMIN_OR_CONTENT_MANAGER);
  const t = await getTranslations();
  const ctx = await getLogContext();
  try {
    const supabase = await createAdminClient();

    // 消す前に、教材に付属するファイルのパスを集める（単語・フレーズ・セクション・ビデオは CASCADE、
    // スプリントの問題は外部キーが無いため後で消す）
    const [
      { data: phrases, error: phraseError },
      { data: questions, error: questionError },
      { data: videos, error: videoError },
    ] = await Promise.all([
      supabase
        .from('com_m_phrase')
        .select('audio_path, com_m_word!inner(content_id)')
        .eq('com_m_word.content_id', contentId),
      supabase
        .from('com_m_sprint_questions')
        .select('statement_voice, question_voice, answer_sentence_yes_voice, answer_sentence_no_voice')
        .eq('content_id', contentId),
      supabase
        .from('com_m_video')
        .select('video_path, thumbnail_path, com_m_video_section!inner(content_id)')
        .eq('com_m_video_section.content_id', contentId),
    ]);
    if (phraseError) throw phraseError;
    if (questionError) throw questionError;
    if (videoError) throw videoError;

    const { error } = await supabase.from('com_m_contents').delete().eq('content_id', contentId);

    if (error) {
      if (isInUseError(error))
        return { success: false, errorCode: 'in_use' as const, message: t('common.errors.unexpected') };
      logger.error('content:delete_content_failed', error.message, { ...ctx, err: error, payload: { contentId } });
      return { success: false, message: t('common.errors.unexpected') };
    }

    const { error: questionDeleteError } = await supabase
      .from('com_m_sprint_questions')
      .delete()
      .eq('content_id', contentId);
    if (questionDeleteError) {
      logger.error('content:delete_sprint_questions_failed', questionDeleteError.message, {
        ...ctx,
        err: questionDeleteError,
        payload: { contentId },
      });
    }
    await removeStorageFiles(
      supabase,
      'audio',
      [
        ...(phrases ?? []).map((p) => p.audio_path as string | null),
        // 問題の行が消せなかった場合は、残った行が参照する音声を消さない
        ...(questionDeleteError
          ? []
          : (questions ?? []).flatMap((q) => [
              q.statement_voice,
              q.question_voice,
              q.answer_sentence_yes_voice,
              q.answer_sentence_no_voice,
            ])),
      ],
      { event: 'content:delete_files_failed', ctx, payload: { contentId } },
    );
    await removeVideoFiles(
      (videos ?? []).flatMap((v) => [v.video_path, v.thumbnail_path]),
      { ctx, payload: { contentId } },
    );

    logger.info('content:delete_content_success', `Content deleted`, {
      ...ctx,
      payload: { contentId },
    });

    revalidatePath('/contents');
    return { success: true };
  } catch (error) {
    unstable_rethrow(error);
    logger.error('content:delete_content_unexpected', getErrorMessage(error), {
      ...ctx,
      err: error,
      payload: { contentId },
    });
    return { success: false, message: t('common.errors.unexpected') };
  }
}

/**
 * タグ割当用データの取得
 */
export async function getTagAssignmentData(
  contentId: string,
): Promise<{ assignedTags: ContentTagSummary[]; unassignedTags: ContentTagSummary[] }> {
  await requireAdminRole(ADMIN_OR_CONTENT_MANAGER);
  const ctx = await getLogContext();
  try {
    const supabase = await createAdminClient();

    const { data: allTags, error: tagError } = await supabase
      .from('com_m_contents_tag')
      .select('tag_id, tag_name, tag_type, seq_no')
      .order('seq_no', { ascending: true });

    if (tagError) {
      logger.error('content:get_tag_assignment_all_tags_failed', tagError.message, {
        ...ctx,
        err: tagError,
        payload: { contentId },
      });
      throw new Error(tagError.message);
    }

    const { data: relData, error: relError } = await supabase
      .from('com_t_contents_tag_rel')
      .select('tag_id')
      .eq('content_id', contentId);

    if (relError) {
      logger.error('content:get_tag_assignment_rel_data_failed', relError.message, {
        ...ctx,
        err: relError,
        payload: { contentId },
      });
      throw new Error(relError.message);
    }

    const assignedTagIds = new Set(relData.map((r) => r.tag_id));
    const assignedTags: ContentTagSummary[] = [];
    const unassignedTags: ContentTagSummary[] = [];

    allTags.forEach((tag) => {
      if (assignedTagIds.has(tag.tag_id)) {
        assignedTags.push(tag);
      } else {
        unassignedTags.push(tag);
      }
    });

    return { assignedTags, unassignedTags };
  } catch (error) {
    unstable_rethrow(error);
    logger.error('content:get_tag_assignment_data_unexpected', getErrorMessage(error), {
      ...ctx,
      err: error,
      payload: { contentId },
    });
    throw error instanceof Error ? error : new Error('予期せぬエラーが発生しました');
  }
}

/**
 * 教材にタグを割り当てる
 */
export async function assignTag(contentId: string, tagId: string): Promise<ActionResult> {
  await requireAdminRole(ADMIN_OR_CONTENT_MANAGER);
  const t = await getTranslations();
  const ctx = await getLogContext();
  try {
    const supabase = await createAdminClient();

    const { error } = await supabase.from('com_t_contents_tag_rel').insert({
      content_id: contentId,
      tag_id: tagId,
    });

    if (error) {
      logger.error('content:assign_tag_failed', error.message, { ...ctx, err: error, payload: { contentId, tagId } });
      return { success: false, message: t('common.errors.unexpected') };
    }

    logger.info('content:assign_tag_success', `Tag assigned to content`, {
      ...ctx,
      payload: { contentId, tagId },
    });

    return { success: true };
  } catch (error) {
    unstable_rethrow(error);
    logger.error('content:assign_tag_unexpected', getErrorMessage(error), {
      ...ctx,
      err: error,
      payload: { contentId, tagId },
    });
    return { success: false, message: t('common.errors.unexpected') };
  }
}

/**
 * 教材からタグの割当を解除する
 */
export async function removeTag(contentId: string, tagId: string): Promise<ActionResult> {
  await requireAdminRole(ADMIN_OR_CONTENT_MANAGER);
  const t = await getTranslations();
  const ctx = await getLogContext();
  try {
    const supabase = await createAdminClient();

    const { error } = await supabase
      .from('com_t_contents_tag_rel')
      .delete()
      .eq('content_id', contentId)
      .eq('tag_id', tagId);

    if (error) {
      logger.error('content:remove_tag_failed', error.message, { ...ctx, err: error, payload: { contentId, tagId } });
      return { success: false, message: t('common.errors.unexpected') };
    }

    logger.info('content:remove_tag_success', `Tag removed from content`, {
      ...ctx,
      payload: { contentId, tagId },
    });

    return { success: true };
  } catch (error) {
    unstable_rethrow(error);
    logger.error('content:remove_tag_unexpected', getErrorMessage(error), {
      ...ctx,
      err: error,
      payload: { contentId, tagId },
    });
    return { success: false, message: t('common.errors.unexpected') };
  }
}

/**
 * 教材のアクセス権限（クライアント割当）データ取得
 */
export async function getContentAccessData(contentId: string): Promise<{
  assignedClients: { client_id: string; client_name: string }[];
  unassignedClients: { client_id: string; client_name: string }[];
}> {
  await requireAdminRole(ADMIN_OR_CONTENT_MANAGER);
  const ctx = await getLogContext();
  try {
    const supabase = await createAdminClient();

    const { data: allClients, error: clientError } = await supabase
      .from('com_m_client')
      .select('client_id, client_name')
      .eq('status', CLIENT_STATUS.ACTIVE)
      .order('client_name', { ascending: true });

    if (clientError) {
      logger.error('content:get_content_access_all_clients_failed', clientError.message, {
        ...ctx,
        err: clientError,
        payload: { contentId },
      });
      throw new Error(clientError.message);
    }

    const { data: accessData, error: accessError } = await supabase
      .from('com_m_contents_access')
      .select('client_id')
      .eq('content_id', contentId);

    if (accessError) {
      logger.error('content:get_content_access_data_failed', accessError.message, {
        ...ctx,
        err: accessError,
        payload: { contentId },
      });
      throw new Error(accessError.message);
    }

    const assignedClientIds = new Set(accessData.map((a) => a.client_id));
    const assignedClients = allClients.filter((client) => assignedClientIds.has(client.client_id));
    const unassignedClients = allClients.filter((client) => !assignedClientIds.has(client.client_id));

    return { assignedClients, unassignedClients };
  } catch (error) {
    unstable_rethrow(error);
    logger.error('content:get_content_access_data_unexpected', getErrorMessage(error), {
      ...ctx,
      err: error,
      payload: { contentId },
    });
    throw error instanceof Error ? error : new Error('予期せぬエラーが発生しました');
  }
}

/**
 * クライアントに教材アクセス権を付与
 */
export async function assignAccess(contentId: string, clientId: string): Promise<ActionResult> {
  await requireAdminRole(ADMIN_OR_CONTENT_MANAGER);
  const t = await getTranslations();
  const ctx = await getLogContext();
  try {
    const supabase = await createAdminClient();
    const { error } = await supabase
      .from('com_m_contents_access')
      .insert({ content_id: contentId, client_id: clientId });

    if (error) {
      logger.error('content:assign_access_failed', error.message, {
        ...ctx,
        err: error,
        payload: { contentId, clientId },
      });
      return { success: false, message: t('common.errors.unexpected') };
    }

    logger.info('content:assign_access_success', `Access assigned to client`, {
      ...ctx,
      payload: { contentId, clientId },
    });

    revalidatePath('/contents');
    return { success: true };
  } catch (error) {
    unstable_rethrow(error);
    logger.error('content:assign_access_unexpected', getErrorMessage(error), {
      ...ctx,
      err: error,
      payload: { contentId, clientId },
    });
    return { success: false, message: t('common.errors.unexpected') };
  }
}

/**
 * クライアントの教材アクセス権を解除
 */
export async function removeAccess(contentId: string, clientId: string): Promise<ActionResult> {
  await requireAdminRole(ADMIN_OR_CONTENT_MANAGER);
  const t = await getTranslations();
  const ctx = await getLogContext();
  try {
    const supabase = await createAdminClient();
    const { error } = await supabase
      .from('com_m_contents_access')
      .delete()
      .eq('content_id', contentId)
      .eq('client_id', clientId);

    if (error) {
      logger.error('content:remove_access_failed', error.message, {
        ...ctx,
        err: error,
        payload: { contentId, clientId },
      });
      return { success: false, message: t('common.errors.unexpected') };
    }

    logger.info('content:remove_access_success', `Access removed from client`, {
      ...ctx,
      payload: { contentId, clientId },
    });

    revalidatePath('/contents');
    return { success: true };
  } catch (error) {
    unstable_rethrow(error);
    logger.error('content:remove_access_unexpected', getErrorMessage(error), {
      ...ctx,
      err: error,
      payload: { contentId, clientId },
    });
    return { success: false, message: t('common.errors.unexpected') };
  }
}
