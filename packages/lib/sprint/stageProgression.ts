import { QUESTION_TYPES, SprintQuestionType } from '@gabby/types/sprint';
import {
  MAX_STAGE,
  STAGE_CONDITIONS,
  StageLevelGap,
  StageLevels,
} from '@gabby/types/stageProgression';

/**
 * ステージ判定・レベル更新に関する共通ロジック。
 * Coach/Adminの手動編集、および将来的な自動判定（スプリント結果からの昇格処理）の
 * 双方から参照される想定のため、DBアクセスを含まない純粋関数として実装する。
 */

const QUESTION_TYPE_LIST = Object.values(QUESTION_TYPES).sort((a, b) => a.seq_no - b.seq_no);

export { MAX_STAGE, STAGE_CONDITIONS };
export type { StageLevels, StageLevelGap };

/** 指定ステージの到達条件を取得する。定義が無い場合（stage=0等）は全種別0を返す */
export function getStageGoals(stage: number): StageLevels {
  const found = STAGE_CONDITIONS.find((c) => c.stage === stage);
  if (found) return found.goals;
  return { '0': 0, '4': 0, '5': 0, '6': 0 };
}

/** 現在のレベル一式が、指定ステージの到達条件をすべて満たしているか判定する */
export function meetsStageGoals(stage: number, levels: StageLevels): boolean {
  const goals = getStageGoals(stage);
  return (Object.keys(goals) as SprintQuestionType[]).every((type) => levels[type] >= goals[type]);
}

/**
 * 現在のレベル一式から、到達済みとみなせる最大のステージを逆算する。
 * レベル変更のたびに本関数でstageを再計算することで、stage列とlevel列の不整合を防ぐ。
 */
export function computeStage(levels: StageLevels): number {
  let reached = 0;
  for (const condition of STAGE_CONDITIONS) {
    if (meetsStageGoals(condition.stage, levels)) {
      reached = Math.max(reached, condition.stage);
    }
  }
  return reached;
}

/** 指定ステージの到達条件のうち、未達の問題種別と不足量を一覧化する（警告表示用） */
export function getStageGaps(stage: number, levels: StageLevels): StageLevelGap[] {
  const goals = getStageGoals(stage);
  return QUESTION_TYPE_LIST.map((type) => ({
    questionType: type.value,
    required: goals[type.value],
    current: levels[type.value],
  })).filter((gap) => gap.current < gap.required);
}

/**
 * 指定ステージへの強制到達に必要なレベル一式を計算する。
 * 既に条件を満たしている種別は変更せず、不足している種別のみ必要値まで底上げする。
 */
export function getForcedLevels(stage: number, levels: StageLevels): StageLevels {
  const goals = getStageGoals(stage);
  const result = { ...levels };
  (Object.keys(goals) as SprintQuestionType[]).forEach((type) => {
    result[type] = Math.max(result[type], goals[type]);
  });
  return result;
}

/** 問題種別の最小/最大レベル範囲内にクランプする */
export function clampLevel(questionType: SprintQuestionType, level: number): number {
  const meta = QUESTION_TYPES[questionType];
  return Math.min(meta.maxLevel, Math.max(meta.minLevel, level));
}
