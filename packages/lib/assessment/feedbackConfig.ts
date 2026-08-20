// packages/lib/assessment/feedbackConfig.ts
import { FeedbackConfig } from '@gabby/types/speechAssessment';

export type ScoreTier = 'excellent' | 'great' | 'good' | 'fair' | 'poor';

/**
 * 発話スコアの5段階しきい値。
 * getFeedbackConfig / getScoreTier の唯一の判定基準として、両者から共通参照する。
 */
const SCORE_TIERS: { min: number; tier: ScoreTier; fill: string; tagText: string }[] = [
  { min: 0.90, tier: 'excellent', fill: '#10B981', tagText: 'Excellent' },
  { min: 0.80, tier: 'great', fill: '#3B82F6', tagText: 'Great' },
  { min: 0.60, tier: 'good', fill: '#F59E0B', tagText: 'Good' },
  { min: 0.30, tier: 'fair', fill: '#F97316', tagText: 'Fair' },
  { min: -Infinity, tier: 'poor', fill: '#EF4444', tagText: 'Poor' },
];

/**
 * 発話評価のフィードバックスコア設定取得
 * WordFeedback / SprintFeedback など、フィードバックUI（色・タグ文言）で共通利用。
 * @param score - 発話スコア (0-1)
 * @returns フィードバック設定
 */
export function getFeedbackConfig(score: number): FeedbackConfig {
  const { fill, tagText } = SCORE_TIERS.find(t => score >= t.min)!;
  return { fill, tagText };
}

/**
 * 発話スコアから5段階のティア（キー文字列）のみを取得する。
 * SprintTimePlayerの録音演出（リング色・ラベル切り替え）等、
 * 色コード以外の形でティアを参照したい箇所で使用する。
 * @param score - 発話スコア (0-1)
 */
export function getScoreTier(score: number): ScoreTier {
  return SCORE_TIERS.find(t => score >= t.min)!.tier;
}
