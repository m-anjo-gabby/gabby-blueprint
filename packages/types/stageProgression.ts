import type { SprintQuestionType } from './sprint';

/**
 * ----------------------------------------------
 * スプリント種別×レベルの組み合わせによる、生徒の「ステージ」到達条件の型定義
 * ----------------------------------------------
 * ステージはスプリント問題種別（Speed/Structure/Builders/Mastery）の到達レベルから
 * 導出される、生徒の総合的な習熟度指標。判定・更新ロジックは packages/lib/sprint/stageProgression.ts
 * に一元化し、Coach/Admin/システム自動判定の各所から共通で利用する。
 */

/** スプリント問題種別ごとの到達レベル一式 */
export type StageLevels = Record<SprintQuestionType, number>;

/** 各ステージへ到達するために必要な、問題種別ごとの最低到達レベル */
export interface StageConditionData {
  stage: number;
  goals: StageLevels;
}

/** 到達可能な最大ステージ */
export const MAX_STAGE = 10;

/**
 * ステージごとの到達条件マスタ
 * 各値は「そのステージに到達するために必要な最低レベル」（累積値、差分ではない）。
 * 例: Stage 3 は Speed Lv.3 + Builders Lv.3 + Structure Lv.1 + Mastery Lv.1 が必要。
 */
export const STAGE_CONDITIONS: StageConditionData[] = [
  { stage: 1, goals: { '0': 1, '5': 1, '4': 0, '6': 0 } },
  { stage: 2, goals: { '0': 2, '5': 2, '4': 0, '6': 0 } },
  { stage: 3, goals: { '0': 3, '5': 3, '4': 1, '6': 1 } },
  { stage: 4, goals: { '0': 4, '5': 4, '4': 2, '6': 2 } },
  { stage: 5, goals: { '0': 5, '5': 5, '4': 3, '6': 3 } },
  { stage: 6, goals: { '0': 6, '5': 5, '4': 4, '6': 4 } },
  { stage: 7, goals: { '0': 7, '5': 5, '4': 5, '6': 5 } },
  { stage: 8, goals: { '0': 8, '5': 5, '4': 6, '6': 6 } },
  { stage: 9, goals: { '0': 9, '5': 5, '4': 8, '6': 8 } },
  { stage: 10, goals: { '0': 10, '5': 5, '4': 10, '6': 10 } },
];

/** ステージ到達条件のうち、未達となっている問題種別1件分 */
export interface StageLevelGap {
  questionType: SprintQuestionType;
  required: number;
  current: number;
}
