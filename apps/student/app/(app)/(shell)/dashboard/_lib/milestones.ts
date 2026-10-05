/**
 * 「これまでの歩み」の節目（次の目標値）の算出。
 * 節目は指標ごとの最初の数段のあと、1-2-5 の系列（50 → 100 → 200 → 500 → 1,000 …）で大きくしていく。
 * 数値が増えるほど間隔が広がるため、始めたばかりの人は早く次の節目に届き、続けている人にも先の目標が残る。
 */

/** 実施日数の節目（「3日・1週間・2週間・1か月」の区切りのあと、100日・1年を挟む） */
export const ACTIVE_DAY_MILESTONES = [3, 7, 14, 30, 50, 100, 200, 365];

/** 発話評価の節目 */
export const ASSESSMENT_MILESTONES = [10];

/**
 * 実施日数の節目の意味（次の節目の横に添える一言）。
 * 継続の手応えを伝えるため、評価の言葉や感嘆を避けて事実を名詞止めで書く。表に無い節目は既定の言い方にする。
 */
const ACTIVE_DAY_MILESTONE_LABELS: Record<number, string> = {
  3: '最初の3日間',
  7: '1週間の実践',
  14: '2週間の継続',
  30: '1か月の継続',
  50: '50日の実践',
  365: '1年分の実践',
};

export const getActiveDayMilestoneLabel = (days: number): string =>
  ACTIVE_DAY_MILESTONE_LABELS[days] ?? `${days.toLocaleString()}日の積み上げ`;

/** 1-2-5 の系列で、n の次の値を返す（30 → 50、50 → 100、100 → 200、365 → 500） */
const nextNiceNumber = (n: number): number => {
  const scale = 10 ** Math.floor(Math.log10(n));
  const lead = n / scale;
  if (lead < 2) return 2 * scale;
  if (lead < 5) return 5 * scale;
  return 10 * scale;
};

/** 節目の段階表示の1マス */
export interface MilestoneStep {
  value: number;
  state: 'reached' | 'next' | 'upcoming';
}

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

/** 節目を value の次の節目の、さらに先まで並べる */
const buildSteps = (value: number, head: readonly number[], extra: number): number[] => {
  const steps = [...head];
  const enough = () => steps.filter((step) => step > value).length > extra;
  while (!enough()) {
    steps.push(nextNiceNumber(steps[steps.length - 1]));
  }
  return steps;
};

/** 現在の値から、到達済みの節目と次の節目を求める */
export function resolveMilestone(value: number, head: readonly number[]): Milestone {
  const steps = buildSteps(value, head, 0);
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
 * 段階表示に並べる節目（size 個）。次の節目の先を1つ見せ、残りは到達済みの直近の節目で埋める。
 * 例: 23日 → 3・7・14・[30]・50・100、120日 → 14・30・50・100・[200]・365
 */
export function resolveMilestoneSteps(value: number, head: readonly number[], size: number): MilestoneStep[] {
  const steps = buildSteps(value, head, 1);
  const nextIndex = steps.findIndex((step) => step > value);
  const start = Math.max(0, Math.min(nextIndex - (size - 2), steps.length - size));
  return steps.slice(start, start + size).map((step) => ({
    value: step,
    state: step <= value ? 'reached' : step === steps[nextIndex] ? 'next' : 'upcoming',
  }));
}

/**
 * 今週のうちに節目を越えたか（到達バッジの表示判定）。
 * 今週増えた分を引いた値が節目に届いていなければ、今週到達したとみなす。翌週になると自然に表示されなくなる。
 */
export const isReachedThisWeek = (value: number, weekGain: number, milestone: Milestone): boolean =>
  milestone.reached > 0 && weekGain > 0 && value - weekGain < milestone.reached;
