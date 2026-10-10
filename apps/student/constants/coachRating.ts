import type { CoachRatingItem, CoachRatingStats } from '@gabby/types/coachRating';
import type { CoachProfileRatingDisplay } from '@gabby/types/coachProfile';
import { formatRatingValue } from '@gabby/lib/coachRating/format';

/** コーチ評価の項目（評価ダイアログの並び順）。項目は移行元システムと同じ3項目 */
export const COACH_RATING_ITEMS: { key: CoachRatingItem; label: string; description: string }[] = [
  { key: 'coaching', label: 'コーチング', description: 'レッスンは分かりやすく、上達を実感できましたか' },
  { key: 'friendliness', label: '親近感', description: '緊張せずに話せる雰囲気でしたか' },
  { key: 'recommendation', label: 'おすすめ度', description: 'このコーチを他の受講者にもすすめたいですか' },
];

/** 星の読み上げ用の文言 */
export const ratingOptionLabel = (value: number) => `${value}点`;
export const ratingValueLabel = (value: number) => `5点満点中${formatRatingValue(value)}点`;

/** コーチの総合評価の表示（コーチ選択のカード・プロフィール。評価が無いコーチは null） */
export function toCoachRatingDisplay(stats: CoachRatingStats | null): CoachProfileRatingDisplay | null {
  if (!stats || stats.overallAvg === null) return null;
  return {
    value: stats.overallAvg,
    valueLabel: formatRatingValue(stats.overallAvg),
    countLabel: `${stats.ratingCount}件の評価`,
    ariaLabel: ratingValueLabel(stats.overallAvg),
  };
}
