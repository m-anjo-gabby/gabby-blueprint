import { SprintQuestionType } from '@gabby/types/sprint';

/**
 * スプリント問題種別の画面表示用マスタ（実体データ）
 * 型パッケージから SprintQuestionType をインポートして、
 * 網羅されているかを型安全に縛ります。
 */
export const SPRINT_TYPES: Record<SprintQuestionType, { label: string; value: SprintQuestionType }> = {
  '0': { label: 'UG Speed', value: '0' },
  '4': { label: 'UG Structure', value: '4' },
  '5': { label: 'UG Builders', value: '5' },
  '6': { label: 'UG Mastery', value: '6' },
} as const;