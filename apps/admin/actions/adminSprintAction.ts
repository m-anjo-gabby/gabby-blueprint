'use server';

import { createAdminClient } from "@gabby/lib/supabase/admin";
import { SprintQuestion, SprintQuestionType } from "@gabby/types/sprint";
import { revalidatePath } from 'next/cache';
import { createLogger, getLogContext } from '@gabby/lib/logger';
import { generateAzureAudioBuffer } from '@gabby/lib/azure/tts';

const logger = createLogger('admin');

/**
 * 種別とレベルを指定してスプリント問題一覧を取得
 */
export async function getSprintQuestionsByFilter(type: SprintQuestionType, level: number) {
  const ctx = await getLogContext();
  try {
    const supabase = await createAdminClient();

    const { data, error } = await supabase
      .from('com_m_sprint_questions')
      .select('*')
      .eq('question_type', type)
      .eq('difficulty_level', level)
      .eq('delete_flg', '0')
      .order('group_id', { ascending: true })
      .order('seq_no', { ascending: true });

    if (error) throw error;
    return data as SprintQuestion[];
  } catch (err: any) {
    logger.error('sprint:get_questions_failed', err.message, { ...ctx, payload: { type, level } });
    return [];
  }
}

/**
 * スプリント問題の登録・更新
 */
export async function upsertSprintQuestion(payload: Partial<SprintQuestion>) {
  const ctx = await getLogContext();
  try {
    const supabase = await createAdminClient();
    const isEdit = !!payload.question_id;

    const dataToSave = {
      ...payload,
      update_date: new Date().toISOString(),
    };

    let error;
    if (isEdit) {
      const { error: updateError } = await supabase
        .from('com_m_sprint_questions')
        .update(dataToSave)
        .eq('question_id', payload.question_id!);
      error = updateError;
    } else {
      const { error: insertError } = await supabase
        .from('com_m_sprint_questions')
        .insert([{ ...dataToSave, insert_date: new Date().toISOString() }]);
      error = insertError;
    }

    if (error) throw error;

    logger.info('sprint:upsert_success', `Question ${isEdit ? 'updated' : 'created'}`, { ...ctx });
    return { success: true };
  } catch (err: any) {
    logger.error('sprint:upsert_failed', err.message, { ...ctx, payload });
    return { success: false, message: err.message };
  }
}

/**
 * スプリント問題の複数一括登録・更新
 */
export async function bulkUpsertSprintQuestions(questions: Partial<SprintQuestion>[]) {
  const ctx = await getLogContext();
  try {
    const supabase = await createAdminClient();
    const now = new Date().toISOString();

    const dataToSave = questions.map(q => ({
      ...q,
      update_date: now,
      insert_date: q.question_id ? undefined : now,
      delete_flg: '0'
    }));

    // Supabaseのupsertを使用（question_idが既にあれば更新、なければ挿入）
    const { error } = await supabase
      .from('com_m_sprint_questions')
      .upsert(dataToSave, { 
        onConflict: 'question_id' 
      });

    if (error) throw error;

    logger.info('sprint:bulk_upsert_success', `${questions.length} questions processed`, { ...ctx });
    revalidatePath('/contents/[id]', 'layout');
    return { success: true };
  } catch (err: any) {
    logger.error('sprint:bulk_upsert_failed', err.message, { ...ctx, payload: questions });
    return { success: false, message: err.message };
  }
}

/**
 * スプリント問題の論理削除
 */
export async function deleteSprintQuestion(questionId: string) {
  const ctx = await getLogContext();
  try {
    const supabase = await createAdminClient();
    const { error } = await supabase
      .from('com_m_sprint_questions')
      .update({ delete_flg: '1', update_date: new Date().toISOString() })
      .eq('question_id', questionId);

    if (error) throw error;
    return { success: true };
  } catch (err: any) {
    logger.error('sprint:delete_failed', err.message, { ...ctx, questionId });
    return { success: false, message: err.message };
  }
}

/**
 * 特定のセクション（statement, question, etc）の音声を生成して保存
 */
export async function saveSprintAudio(
  questionId: string,
  section: 'statement' | 'question' | 'answer_yes' | 'answer_no',
  type: SprintQuestionType,
  level: number,
  ssml: string,
  mode: 'auto' | 'manual',
  adjustmentData: any,
  currentPath?: string | null
) {
  const ctx = await getLogContext();
  try {
    const supabase = await createAdminClient();

    // 1. Azure 生成
    const audioBuffer = await generateAzureAudioBuffer(ssml);

    // 2. パス生成 (sprints/[type]/level[n]/question_id-section-timestamp.mp3)
    const typeMap: Record<string, string> = { '0': 'speed', '4': 'structure', '5': 'builders', '6': 'mastery' };
    const typeDir = typeMap[type] || 'unknown';
    const levelDir = `level${level}`;
    
    const timestamp = new Date().toISOString().replace(/[-:T.Z]/g, "").slice(0, 14);
    const fileName = `${questionId}-${section}-${timestamp}.mp3`;
    const filePath = `sprints/${typeDir}/${levelDir}/${fileName}`;

    // 3. Storage アップロード
    const { error: uploadError } = await supabase.storage
      .from('audio')
      .upload(filePath, audioBuffer, {
        contentType: 'audio/mpeg',
        upsert: false
      });

    if (uploadError) throw uploadError;

    // 4. DB 更新用カラムのマッピング
    const updates: any = {
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
  } catch (err: any) {
    logger.error('sprint:save_audio_failed', err.message, { ...ctx, questionId, section });
    return { success: false, message: err.message };
  }
}

/**
 * 同一グループの基本文を一括更新
 */
export async function updateGroupStatement(groupId: string, statement: string, statementJa: string | null) {
  const supabase = await createAdminClient();
  const { error } = await supabase
    .from('com_m_sprint_questions')
    .update({ statement, statement_ja: statementJa, update_date: new Date().toISOString() })
    .eq('group_id', groupId);
  
  if (error) return { success: false, message: error.message };
  return { success: true };
}