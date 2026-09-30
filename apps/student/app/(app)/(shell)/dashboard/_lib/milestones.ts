/**
 * 「これまでの歩み」の節目（次の目標値）の算出。
 * 節目は指標ごとの最初の数段のあと、1-2-5 の系列（50 → 100 → 200 → 500 → 1,000 …）で大きくしていく。
 * 数値が増えるほど間隔が広がるため、始めたばかりの人は早く次の節目に届き、続けている人にも先の目標が残る。
 */

/** 実施日数の節目（最初の数段は「3日・1週間・2週間・1か月」の区切り） */
export const ACTIVE_DAY_MILESTONES = [3, 7, 14, 30];

/** 発話回数・フレーズ数の節目 */
export const COUNT_MILESTONES = [10];

/** 1-2-5 の系列で、n の次の値を返す（30 → 50、50 → 100、100 → 200、200 → 500） */
const nextNiceNumber = (n: number): number => {
  const scale = 10 ** Math.floor(Math.log10(n));
  const lead = n / scale;
  if (lead < 2) return 2 * scale;
  if (lead < 5) return 5 * scale;
  return 10 * scale;
};

export interface Milestone {
  /** 到達済みの直近の節目（未到達は 0） */
  reached: number;
  /** 次の節目 */
  next: number;
  /** 次の節目までの残り */
  remaining: number;
  /** 直近の節目から次の節目までの進み具合（0〜100） */
  progressPercent: number;
}

/** 現在の値から、到達済みの節目と次の節目を求める */
export function resolveMilestone(value: number, head: readonly number[]): Milestone {
  const steps = [...head];
  while (steps[steps.length - 1] <= value) {
    steps.push(nextNiceNumber(steps[steps.length - 1]));
  }
  const nextIndex = steps.findIndex((step) => step > value);
  const next = steps[nextIndex];
  const reached = nextIndex > 0 ? steps[nextIndex - 1] : 0;

  return {
    reached,
    next,
    remaining: next - value,
    progressPercent: ((value - reached) / (next - reached)) * 100,
  };
}

/**
 * 今週のうちに節目を越えたか（達成バッジの表示判定）。
 * 今週増えた分を引いた値が節目に届いていなければ、今週達成したとみなす。翌週になると自然に表示されなくなる。
 */
export const isReachedThisWeek = (value: number, weekGain: number, milestone: Milestone): boolean =>
  milestone.reached > 0 && weekGain > 0 && value - weekGain < milestone.reached;
