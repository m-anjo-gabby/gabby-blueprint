'use server';

import { getTranslations } from 'next-intl/server';
import { revalidatePath } from 'next/cache';
import { unstable_rethrow } from 'next/navigation';
import { generateAzureAudioBuffer } from '@gabby/lib/azure/tts';
import { createLogger } from '@gabby/lib/logger';
import { getLogContext } from '@gabby/lib/logger/context';
import { getErrorMessage } from '@gabby/lib/logger/errorMessage';
import { removeStorageFiles } from '@gabby/lib/storage/removeStorageFiles';
import { createAdminClient } from '@gabby/lib/supabase/admin';
import type { ActionResult, BasicErrorCode, CoreResult } from '@gabby/types/action';
import type { TableInsert, TableUpdate } from '@gabby/types/db';
import { QUESTION_TYPES, type SprintQuestion, type SprintQuestionType } from '@gabby/types/sprint';
import type { TTSAdjustmentData } from '@gabby/types/word';
import { ADMIN_OR_CONTENT_MANAGER, requireAdminRole } from '@/lib/adminAuth';

const logger = createLogger('admin');

/** スプリントの問題の登録・更新の入力（登録日時・更新日時はこちらで入れる） */
export type SprintQuestionInput = Omit<TableInsert<'com_m_sprint_questions'>, 'insert_date' | 'update_date'>;

/**
 * 種別とレベルを指定してスプリント問題一覧を取得
 */
export async function getSprintQuestionsByFilter(
  contentId: string,
  type: SprintQuestionType,
  level: number,
): Promise<CoreResult<{ data: SprintQuestion[] }, BasicErrorCode>> {
  await requireAdminRole(ADMIN_OR_CONTENT_MANAGER);
  const ctx = await getLogContext();
  try {
    const supabase = await createAdminClient();

    const { data, error } = await supabase
      .from('com_m_sprint_questions')
      .select('*')
      .eq('content_id', contentId)
      .eq('question_type', type)
      .eq('difficulty_level', level)
      .order('group_id', { ascending: true })
      .order('seq_no', { ascending: true });

    if (error) throw error;
    return { success: true, data: data as SprintQuestion[] };
  } catch (err) {
    unstable_rethrow(err);
    logger.error('sprint:get_questions_failed', getErrorMessage(err), {
      ...ctx,
      err,
      payload: { contentId, type, level },
    });
    return { success: false, errorCode: 'unexpected_error' };
  }
}

/**
 * スプリント問題の複数一括登録・更新
 */
export async function bulkUpsertSprintQuestions(questions: SprintQuestionInput[]): Promise<ActionResult> {
  await requireAdminRole(ADMIN_OR_CONTENT_MANAGER);
  const t = await getTranslations();
  const ctx = await getLogContext();
  try {
    const supabase = await createAdminClient();
    const now = new Date().toISOString();

    const dataToSave = questions.map((q) => ({
      ...q,
      update_date: now,
      ...(q.question_id ? {} : { insert_date: now }),
    }));

    // Supabaseのupsertを使用（question_idが既にあれば更新、なければ挿入）
    const { error } = await supabase.from('com_m_sprint_questions').upsert(dataToSave, {
      onConflict: 'question_id',
    });

    if (error) throw error;

    logger.info('sprint:bulk_upsert_success', `${questions.length} questions processed`, { ...ctx });
    revalidatePath('/contents/[id]', 'layout');
    return { success: true };
  } catch (err) {
    unstable_rethrow(err);
    logger.error('sprint:bulk_upsert_failed', getErrorMessage(err), { ...ctx, err, payload: questions });
    return { success: false, message: t('common.errors.unexpected') };
  }
}

/**
 * スプリント問題の削除（検証・誤登録の片付け用。お気に入りも一緒に消える。
 * 回答の履歴（JSON）は問題IDだけを持つため残り、画面では「削除された問題」と表示する）
 */
export async function deleteSprintQuestion(questionId: string): Promise<ActionResult> {
  await requireAdminRole(ADMIN_OR_CONTENT_MANAGER);
  const t = await getTranslations();
  const ctx = await getLogContext();
  try {
    const supabase = await createAdminClient();
    const { data: deleted, error } = await supabase
      .from('com_m_sprint_questions')
      .delete()
      .eq('question_id', questionId)
      .select(SPRINT_VOICE_SELECT)
      .maybeSingle();

    if (error) throw error;

    // 音声ファイルの削除は問題の削除の後に行い、失敗しても削除は取り消さない（エラーのログで気付けるようにする）
    if (deleted) await removeSprintVoiceFiles(supabase, [deleted], ctx, { questionId });
    return { success: true };
  } catch (err) {
    unstable_rethrow(err);
    logger.error('sprint:delete_failed', getErrorMessage(err), { ...ctx, err, payload: { questionId } });
    return { success: false, message: t('common.errors.unexpected') };
  }
}

/** 問題の音声ファイルのパスを持つ列（Storage の audio バケット内のパス） */
const SPRINT_VOICE_COLUMNS = [
  'statement_voice',
  'question_voice',
  'answer_sentence_yes_voice',
  'answer_sentence_no_voice',
] as const;
type SprintVoiceRow = Record<(typeof SPRINT_VOICE_COLUMNS)[number], string | null>;
/** select に渡す形（Supabase の型が項目を読み取れるよう、連結せずに文字列で持つ。上の配列と同じ並び） */
const SPRINT_VOICE_SELECT = 'statement_voice, question_voice, answer_sentence_yes_voice, answer_sentence_no_voice';

/** 一度に照合・削除するパスの数（PostgREST の URL の長さと Storage の一括削除の上限に収める） */
const VOICE_REMOVE_CHUNK = 50;

/**
 * 削除した問題の音声ファイルを Storage から消す。他の問題がまだ同じパスを使っている場合は消さない。
 * 問題の削除の後に呼び、失敗しても例外にせず、エラーのログ（sprint:delete_audio_failed）だけを残す
 * （問題の削除は取り消さない）。
 */
async function removeSprintVoiceFiles(
  supabase: Awaited<ReturnType<typeof createAdminClient>>,
  rows: SprintVoiceRow[],
  ctx: Awaited<ReturnType<typeof getLogContext>>,
  payload: Record<string, unknown>,
) {
  const paths = [
    ...new Set(rows.flatMap((row) => SPRINT_VOICE_COLUMNS.map((col) => row[col])).filter((p): p is string => !!p)),
  ];
  for (let i = 0; i < paths.length; i += VOICE_REMOVE_CHUNK) {
    const chunk = paths.slice(i, i + VOICE_REMOVE_CHUNK);
    try {
      const list = chunk.map((p) => `"${p.replace(/"/g, '\\"')}"`).join(',');
      const { data: sharing, error: sharingError } = await supabase
        .from('com_m_sprint_questions')
        .select(SPRINT_VOICE_SELECT)
        .or(SPRINT_VOICE_COLUMNS.map((col) => `${col}.in.(${list})`).join(','));
      if (sharingError) throw sharingError;
      const inUse = new Set((sharing ?? []).flatMap((r) => SPRINT_VOICE_COLUMNS.map((col) => r[col])));
      await removeStorageFiles(
        supabase,
        'audio',
        chunk.filter((p) => !inUse.has(p)),
        { event: 'sprint:delete_audio_failed', ctx, payload },
      );
    } catch (err) {
      unstable_rethrow(err);
      logger.error('sprint:delete_audio_failed', getErrorMessage(err), {
        ...ctx,
        err,
        payload: { ...payload, paths: chunk },
      });
    }
  }
}

/**
 * 特定のセクション（statement, question, etc）の音声を生成して保存
 */
export async function saveSprintAudio(
  contentId: string,
  questionId: string,
  section: 'statement' | 'question' | 'answer_yes' | 'answer_no',
  type: SprintQuestionType,
  level: number,
  ssml: string,
  mode: 'auto' | 'manual',
  adjustmentData: TTSAdjustmentData,
  currentPath?: string | null,
): Promise<ActionResult<{ path: string }>> {
  await requireAdminRole(ADMIN_OR_CONTENT_MANAGER);
  const t = await getTranslations();
  const ctx = await getLogContext();
  try {
    const supabase = await createAdminClient();

    // 1. Azure 生成
    const audioBuffer = await generateAzureAudioBuffer(ssml);

    // 2. パス生成 (sprints/[content_id]/[type]/level[n]/question_id-section-timestamp.mp3)
    const typeMap: Record<string, string> = { '0': 'speed', '4': 'structure', '5': 'builders', '6': 'mastery' };
    const typeDir = typeMap[type] || 'unknown';
    const levelDir = `level${level}`;

    const timestamp = new Date()
      .toISOString()
      .replace(/[-:T.Z]/g, '')
      .slice(0, 14);
    const fileName = `${questionId}-${section}-${timestamp}.mp3`;
    const filePath = `sprints/${contentId}/${typeDir}/${levelDir}/${fileName}`;

    // 3. Storage アップロード
    const { error: uploadError } = await supabase.storage.from('audio').upload(filePath, audioBuffer, {
      contentType: 'audio/mpeg',
      upsert: false,
    });

    if (uploadError) throw uploadError;

    // 4. DB 更新用カラムのマッピング
    const updates: TableUpdate<'com_m_sprint_questions'> = {
      update_date: new Date().toISOString(),
    };

    if (section === 'statement') {
      updates.statement_voice = filePath;
      updates.statement_tts_ssml = ssml;
      updates.statement_tts_ssml_mode = mode;
      updates.statement_tts_adjustments = adjustmentData;
      updates.statement_tts_status = 1;
    } else if (section === 'question') {
      updates.question_voice = filePath;
      updates.question_tts_ssml = ssml;
      updates.question_tts_ssml_mode = mode;
      updates.question_tts_adjustments = adjustmentData;
      updates.question_tts_status = 1;
    } else if (section === 'answer_yes') {
      updates.answer_sentence_yes_voice = filePath;
      updates.answer_sentence_yes_tts_ssml = ssml;
      updates.answer_sentence_yes_tts_ssml_mode = mode;
      updates.answer_sentence_yes_tts_adjustments = adjustmentData;
      updates.answer_sentence_yes_tts_status = 1;
    } else if (section === 'answer_no') {
      updates.answer_sentence_no_voice = filePath;
      updates.answer_sentence_no_tts_ssml = ssml;
      updates.answer_sentence_no_tts_ssml_mode = mode;
      updates.answer_sentence_no_tts_adjustments = adjustmentData;
      updates.answer_sentence_no_tts_status = 1;
    }

    const { error: dbError } = await supabase
      .from('com_m_sprint_questions')
      .update(updates)
      .eq('question_id', questionId);

    if (dbError) {
      await supabase.storage.from('audio').remove([filePath]);
      throw dbError;
    }

    // 5. 旧ファイル削除
    if (currentPath && currentPath !== filePath) {
      await supabase.storage.from('audio').remove([currentPath]);
    }

    return { success: true, path: filePath };
  } catch (err) {
    unstable_rethrow(err);
    logger.error('sprint:save_audio_failed', getErrorMessage(err), { ...ctx, err, payload: { questionId, section } });
    return { success: false, message: t('common.errors.unexpected') };
  }
}

/**
 * スプリント問題（Speedは1問、それ以外はグループ単位）を別のレベルへ移動する。
 * 移動元はすべて同じ教材・種別・レベルであることを確認する。Speedは移動先の末尾に並ぶよう出題順を振り直し、
 * グループ（Structure/Builders/Mastery）はグループ内の出題順をそのまま保つ。
 * 音声ファイルの保存場所（level{n}ディレクトリ）は問題データに記録されたパスで参照するため移動しない。
 */
export async function moveSprintQuestionsLevel(
  contentId: string,
  type: SprintQuestionType,
  questionIds: string[],
  toLevel: number,
): Promise<ActionResult> {
  await requireAdminRole(ADMIN_OR_CONTENT_MANAGER);
  const t = await getTranslations();
  const ctx = await getLogContext();
  try {
    const meta = QUESTION_TYPES[type];
    if (!meta || !Number.isInteger(toLevel) || toLevel < meta.minLevel || toLevel > meta.maxLevel) {
      return { success: false, message: t('contents.errors.invalidLevel') };
    }
    if (questionIds.length === 0) {
      return { success: false, message: t('contents.errors.noQuestionsSelected') };
    }

    const supabase = await createAdminClient();

    const { data: sources, error: fetchError } = await supabase
      .from('com_m_sprint_questions')
      .select('question_id, difficulty_level, seq_no')
      .in('question_id', questionIds)
      .eq('content_id', contentId)
      .eq('question_type', type);

    if (fetchError) throw fetchError;
    const fromLevels = new Set((sources ?? []).map((q) => q.difficulty_level));
    if (!sources || sources.length !== questionIds.length || fromLevels.size !== 1) {
      return { success: false, message: t('contents.errors.questionsNotFound') };
    }
    if (fromLevels.has(toLevel)) {
      return { success: false, message: t('contents.errors.sameLevel') };
    }

    const now = new Date().toISOString();

    if (type === '0') {
      const { data: last, error: lastError } = await supabase
        .from('com_m_sprint_questions')
        .select('seq_no')
        .eq('content_id', contentId)
        .eq('question_type', type)
        .eq('difficulty_level', toLevel)
        .order('seq_no', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (lastError) throw lastError;

      const ordered = [...sources].sort((a, b) => a.seq_no - b.seq_no);
      for (const [idx, q] of ordered.entries()) {
        const { error } = await supabase
          .from('com_m_sprint_questions')
          .update({ difficulty_level: toLevel, seq_no: (last?.seq_no ?? 0) + idx + 1, update_date: now })
          .eq('question_id', q.question_id);
        if (error) throw error;
      }
    } else {
      const { error } = await supabase
        .from('com_m_sprint_questions')
        .update({ difficulty_level: toLevel, update_date: now })
        .in('question_id', questionIds);
      if (error) throw error;
    }

    logger.info('sprint:move_level_success', `Moved ${questionIds.length} questions to level ${toLevel}`, {
      ...ctx,
      payload: { contentId, type, fromLevel: [...fromLevels][0], toLevel, questionIds },
    });
    revalidatePath('/contents/[id]', 'layout');
    return { success: true };
  } catch (err) {
    unstable_rethrow(err);
    logger.error('sprint:move_level_failed', getErrorMessage(err), {
      ...ctx,
      err,
      payload: { contentId, type, questionIds, toLevel },
    });
    return { success: false, message: t('common.errors.unexpected') };
  }
}

/**
 * 同一グループの基本文を一括更新
 */
export async function updateGroupStatement(
  groupId: string,
  statementEn: string,
  statementJa: string | null,
): Promise<ActionResult> {
  await requireAdminRole(ADMIN_OR_CONTENT_MANAGER);
  const t = await getTranslations();
  const ctx = await getLogContext();
  const supabase = await createAdminClient();
  const { error } = await supabase
    .from('com_m_sprint_questions')
    .update({ statement_en: statementEn, statement_ja: statementJa, update_date: new Date().toISOString() })
    .eq('group_id', groupId);

  if (error) {
    logger.error('sprint:update_group_statement_failed', error.message, { ...ctx, err: error, payload: { groupId } });
    return { success: false, message: t('common.errors.unexpected') };
  }
  return { success: true };
}

/**
 * 特定の教材・種別・レベルのスプリント問題を全削除し、TSVデータから一括新規登録する (トランザクション代替)
 */
export async function bulkImportSprintQuestions(
  contentId: string,
  type: SprintQuestionType,
  level: number,
  questions: Omit<SprintQuestionInput, 'content_id' | 'question_type' | 'difficulty_level'>[],
): Promise<ActionResult> {
  await requireAdminRole(ADMIN_OR_CONTENT_MANAGER);
  const t = await getTranslations();
  const ctx = await getLogContext();
  try {
    const supabase = await createAdminClient();
    const now = new Date().toISOString();

    // 1. 既存の該当する問題種別・レベルの問題を削除 (洗い替え)
    const { data: deletedRows, error: deleteError } = await supabase
      .from('com_m_sprint_questions')
      .delete()
      .eq('content_id', contentId)
      .eq('question_type', type)
      .eq('difficulty_level', level)
      .select(SPRINT_VOICE_SELECT);

    if (deleteError) throw deleteError;
    // 消した問題の音声ファイルは、新しい行の登録の後に消す（取り込むデータが同じパスを持つ場合は残す）。
    // 登録に失敗しても消した問題は戻らないため、成否にかかわらず消す
    const removeDeletedVoices = () =>
      removeSprintVoiceFiles(supabase, deletedRows ?? [], ctx, {
        contentId,
        type,
        level,
      });

    // 2. 新しいデータを挿入
    const dataToInsert = questions.map((q) => ({
      ...q,
      content_id: contentId,
      question_type: type,
      difficulty_level: level,
      insert_date: now,
      update_date: now,
    }));

    if (dataToInsert.length > 0) {
      const { error: insertError } = await supabase.from('com_m_sprint_questions').insert(dataToInsert);

      if (insertError) {
        await removeDeletedVoices();
        throw insertError;
      }
    }
    await removeDeletedVoices();

    logger.info(
      'sprint:bulk_import_success',
      `Imported ${questions.length} questions for content ${contentId}, type ${type}, level ${level}`,
      { ...ctx },
    );
    revalidatePath('/contents/[id]', 'layout');
    return { success: true };
  } catch (err) {
    unstable_rethrow(err);
    logger.error('sprint:bulk_import_failed', getErrorMessage(err), {
      ...ctx,
      err,
      payload: { contentId, type, level, count: questions.length },
    });
    return { success: false, message: t('common.errors.unexpected') };
  }
}
