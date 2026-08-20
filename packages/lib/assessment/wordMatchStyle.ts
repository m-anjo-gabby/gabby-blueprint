// packages/lib/assessment/wordMatchStyle.ts
import { WordMatch } from '@gabby/types/speechAssessment';

export interface WordMatchStyle {
  text: string;
  deco: string;
  tooltipType: 'missing' | 'fuzzy' | 'combined' | null;
}

/**
 * 発話評価の単語マッチング結果から、表示用のテキスト色・装飾クラスを算出する。
 * WordFeedback / SprintFeedback で共通利用。
 */
export function getWordMatchStyle(match: WordMatch): WordMatchStyle {
  if (!match.isMatch) return {
    text: 'text-slate-300',
    deco: 'border-b-2 border-dashed border-slate-300',
    tooltipType: 'missing'
  };
  if (match.isFuzzy) return {
    text: 'text-orange-500',
    deco: 'underline decoration-wavy decoration-orange-300 underline-offset-8',
    tooltipType: 'fuzzy'
  };
  if (match.isCombined) return {
    text: 'text-blue-500',
    deco: 'underline decoration-dotted decoration-blue-300 underline-offset-8',
    tooltipType: 'combined'
  };
  return { text: 'text-slate-800', deco: '', tooltipType: null };
}
