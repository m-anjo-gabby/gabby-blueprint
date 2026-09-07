'use server';

import { createAdminClient } from '@gabby/lib/supabase/admin';
import { revalidatePath } from 'next/cache';
import { createLogger } from '@gabby/lib/logger';
import { getLogContext } from '@gabby/lib/logger/context';
import { QUESTION_TYPES, SprintQuestionType } from '@gabby/types/sprint';
import { MAX_STAGE, StageLevels } from '@gabby/types/stageProgression';
import { clampLevel, computeStage, getForcedLevels, getStageGoals } from '@gabby/lib/sprint/stageProgression';
import type { StudentSprintProgress } from '@gabby/types/coachStudent';

const logger = createLogger('admin');

type StudentProgressActionResult =
  | { success: true; progress: StudentSprintProgress }
  | { success: false; message: string };

function toStageLevels(progress: StudentSprintProgress): StageLevels {
  return {
    '0': progress.level_speed,
    '4': progress.level_structure,
    '5': progress.level_builders,
    '6': progress.level_mastery,
  };
}

function toProgressColumns(levels: StageLevels) {
  return {
    level_speed: levels['0'],
    level_structure: levels['4'],
    level_builders: levels['5'],
    level_mastery: levels['6'],
  };
}

async function fetchProgress(
  supabase: ReturnType<typeof createAdminClient>,
  userId: string
): Promise<StudentSprintProgress> {
  const { data } = await supabase
    .from('student_m_sprint_progress')
    .select('stage, level_speed, level_structure, level_builders, level_mastery')
    .eq('user_id', userId)
    .maybeSingle();

  return {
    stage: data?.stage ?? 0,
    level_speed: data?.level_speed ?? 0,
    level_structure: data?.level_structure ?? 0,
    level_builders: data?.level_builders ?? 0,
    level_mastery: data?.level_mastery ?? 0,
  };
}

/**
 * 指定生徒のスプリント進捗（ステージ・レベル）を取得する（管理者向け）
 */
export async function getStudentSprintProgress(userId: string): Promise<StudentSprintProgress> {
  const supabase = createAdminClient();
  return fetchProgress(supabase, userId);
}

/**
 * 指定生徒の、指定した問題種別1つのレベルを変更する（管理者向け）。
 * コーチ向け機能と異なり、上げる/下げるの両方向を許可する（コーチの誤操作補正のため）。
 * 更新後は computeStage() でstageを再計算し、level列との整合性を常に保つ。
 */
export async function updateStudentSprintLevel(
  userId: string,
  questionType: SprintQuestionType,
  newLevel: number
): Promise<StudentProgressActionResult> {
  const ctx = await getLogContext();

  try {
    if (!Number.isInteger(newLevel) || clampLevel(questionType, newLevel) !== newLevel) {
      return { success: false, message: 'レベルの値が不正です。' };
    }

    const supabase = createAdminClient();
    const current = await fetchProgress(supabase, userId);
    const meta = QUESTION_TYPES[questionType];
    const newLevels = { ...toStageLevels(current), [questionType]: newLevel };
    const newStage = computeStage(newLevels);

    const { data, error } = await supabase
      .from('student_m_sprint_progress')
      .update({ [meta.dbKey]: newLevel, stage: newStage, update_date: new Date().toISOString() })
      .eq('user_id', userId)
      .select('stage, level_speed, level_structure, level_builders, level_mastery')
      .single();

    if (error || !data) {
      logger.error('admin:update_student_level_failed', error?.message ?? 'No row updated', {
        ...ctx,
        payload: { userId, questionType, newLevel },
      });
      return { success: false, message: 'レベルの更新に失敗しました。' };
    }

    revalidatePath('/users');
    logger.info('admin:update_student_level_success', 'Student sprint level updated', {
      ...ctx,
      payload: { userId, questionType, newLevel, newStage },
    });
    return { success: true, progress: data as StudentSprintProgress };
  } catch (err) {
    logger.error('admin:update_student_level_unexpected', err instanceof Error ? err.message : 'Unknown error', ctx);
    return { success: false, message: 'システムエラーが発生しました。' };
  }
}

/**
 * 指定生徒のステージを、指定した値に直接変更する（管理者向け）。
 * 上げる場合: コーチ向け機能と同様、不足している問題種別のみ必要値まで底上げする（満たしている種別は変更しない）。
 * 下げる場合: 全問題種別のレベルを、目標ステージの到達条件ちょうどの値にリセットする
 *   （到達条件マスタは種別ごとに単調増加のため、この値は必ず目標ステージちょうどに一致する）。
 */
export async function setStudentSprintStage(
  userId: string,
  targetStage: number
): Promise<StudentProgressActionResult> {
  const ctx = await getLogContext();

  try {
    if (!Number.isInteger(targetStage) || targetStage < 0 || targetStage > MAX_STAGE) {
      return { success: false, message: 'ステージの値が不正です。' };
    }

    const supabase = createAdminClient();
    const current = await fetchProgress(supabase, userId);

    if (targetStage === current.stage) {
      return { success: false, message: '現在と同じステージが指定されています。' };
    }

    const newLevels =
      targetStage > current.stage
        ? getForcedLevels(targetStage, toStageLevels(current))
        : getStageGoals(targetStage);
    const newStage = computeStage(newLevels);

    const { data, error } = await supabase
      .from('student_m_sprint_progress')
      .update({ ...toProgressColumns(newLevels), stage: newStage, update_date: new Date().toISOString() })
      .eq('user_id', userId)
      .select('stage, level_speed, level_structure, level_builders, level_mastery')
      .single();

    if (error || !data) {
      logger.error('admin:set_student_stage_failed', error?.message ?? 'No row updated', {
        ...ctx,
        payload: { userId, targetStage },
      });
      return { success: false, message: 'ステージの更新に失敗しました。' };
    }

    revalidatePath('/users');
    logger.info('admin:set_student_stage_success', 'Student stage set', {
      ...ctx,
      payload: { userId, targetStage, newStage },
    });
    return { success: true, progress: data as StudentSprintProgress };
  } catch (err) {
    logger.error('admin:set_student_stage_unexpected', err instanceof Error ? err.message : 'Unknown error', ctx);
    return { success: false, message: 'システムエラーが発生しました。' };
  }
}
