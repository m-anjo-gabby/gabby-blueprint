/** 星の表示は移行元システムと同じく0.5刻みにそろえる（4.26 → 4.5、4.24 → 4.0） */
export function roundRatingToHalf(value: number): number {
  return Math.round(value * 2) / 2;
}

/** 平均点の表示（小数1桁。例: 4.3） */
export function formatRatingValue(value: number): string {
  return value.toFixed(1);
}
