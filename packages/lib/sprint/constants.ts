import { SprintQuestionType } from '@gabby/types/sprint';

/**
 * スプリント問題種別の画面表示用マスタ（実体データ）
 * 型パッケージから SprintQuestionType をインポートして、
 * 網羅されているかを型安全に縛ります。
 * seq_no を用いて、画面上のプルダウンの並び順を明示的に制御します。
 */
export const SPRINT_TYPES: Record<SprintQuestionType, { label: string; value: SprintQuestionType; seq_no: number }> = {
  '0': { label: 'UG Speed', value: '0', seq_no: 1 },
  '4': { label: 'UG Structure', value: '4', seq_no: 3 },
  '5': { label: 'UG Builders', value: '5', seq_no: 2 },
  '6': { label: 'UG Mastery', value: '6', seq_no: 4 },
} as const;

export const DRILL_TIMING = {
  thinkingTime: 2000,   // 問いのあとの沈黙
  nextCardDelay: 2000,  // 解答が終わって次へ行くまでの余韻
  audioGap: 200,        // 基本文と問いの間の隙間
};