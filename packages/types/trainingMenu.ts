import type { SprintQuestionType } from './sprint';

/** メニューの作り方（student_t_training_menu.menu_source） */
export const TRAINING_MENU_SOURCE = {
  /** 標準メニュー（旧システムのメニューを引き継ぎ、到達レベルと視聴の記録から決まりで組む） */
  STANDARD: 1,
} as const;

export type TrainingMenuSource = (typeof TRAINING_MENU_SOURCE)[keyof typeof TRAINING_MENU_SOURCE];

/** やることの種類（student_t_training_menu_item.item_type） */
export const TRAINING_MENU_ITEM_TYPE = {
  /** スプリントのタイムアタック（教材・種別・レベルを target_count 回） */
  SPRINT: 1,
  /** ビデオ1本 */
  VIDEO: 2,
} as const;

export type TrainingMenuItemType = (typeof TRAINING_MENU_ITEM_TYPE)[keyof typeof TRAINING_MENU_ITEM_TYPE];

/** 作成RPC（create_training_menu）に渡すスプリントのやること */
// eslint-disable-next-line @typescript-eslint/consistent-type-definitions -- JSON として RPC に渡すため（interface は Json に代入できない）
export type TrainingMenuSprintItemInput = {
  seq_no: number;
  item_type: typeof TRAINING_MENU_ITEM_TYPE.SPRINT;
  content_id: string;
  question_type: SprintQuestionType;
  difficulty_level: number;
  target_count: number;
};

/** 作成RPC（create_training_menu）に渡すビデオのやること */
// eslint-disable-next-line @typescript-eslint/consistent-type-definitions -- JSON として RPC に渡すため（interface は Json に代入できない）
export type TrainingMenuVideoItemInput = {
  seq_no: number;
  item_type: typeof TRAINING_MENU_ITEM_TYPE.VIDEO;
  content_id: string;
  video_id: string;
};

export type TrainingMenuItemInput = TrainingMenuSprintItemInput | TrainingMenuVideoItemInput;
