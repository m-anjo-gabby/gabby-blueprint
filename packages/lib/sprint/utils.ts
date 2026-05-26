import { SPRINT_TYPES } from './constants';
import { SprintQuestionType } from '@gabby/types/sprint';

/**
 * 安全な動的教材タイトル生成ヘルパー
 */
export const getSprintTitle = (type: SprintQuestionType | string, level: number): string => {
  const typeConfig = SPRINT_TYPES[type as SprintQuestionType];
  const typeLabel = typeConfig ? typeConfig.label : "UG Sprint";
  
  // Level=0の場合は「Lv.」をつけずに「Basic」とする
  if (level === 0) {
    return `${typeLabel} Basic`; // 例: "UG Speed Basic"
  }
  
  return `${typeLabel} Lv.${level}`; // 例: "UG Speed Lv.1"
};