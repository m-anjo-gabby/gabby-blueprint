import type { StudentSprintProgress } from '@gabby/types/coachStudent';
import { QUESTION_TYPES, type SprintAvailableLevels, type SprintQuestionType } from '@gabby/types/sprint';
import { MAX_STAGE } from '@gabby/types/stageProgression';
import { TRAINING_MENU_ITEM_TYPE, type TrainingMenuItemInput } from '@gabby/types/trainingMenu';
import { clampLevel, getStageGoals } from '../sprint/stageProgression';
import { hasSprintQuestionsForType, isSprintLevelSelectable, pickSprintLevel } from '../sprint/utils';

/**
 * 標準メニューのスプリントのタイムアタックの回数（1つ目・2つ目）。
 * 旧システムは1日の本数を 6:4 に分けていた。1つ目は練習の少ない種別のため多めにする。
 */
export const STANDARD_MENU_SPRINT_COUNTS = [2, 1] as const;

/** 標準メニューに入れるビデオの最大本数（2本目は1本目と同じセクションの続きの場合だけ） */
export const STANDARD_MENU_MAX_VIDEOS = 2;

/** 標準メニューの候補のビデオ（未視聴のものを、教材・セクション・ビデオの並び順に並べたもの） */
export interface StandardMenuVideoCandidate {
  contentId: string;
  sectionId: string;
  videoId: string;
}

export interface StandardMenuInput {
  /** 汎用スプリントの教材と、その教材の「問題がある種別×レベル」（未取得なら null）。教材が無ければ null */
  sprint: { contentId: string; availableLevels: SprintAvailableLevels | null } | null;
  /** スプリントの到達レベル（行が無い生徒は null = ステージ0・全種別0） */
  progress: StudentSprintProgress | null;
  /** 直近7日の種別ごとのタイムアタックの回数（練習の少ない種別を先に出すため） */
  recentSessionCounts: Partial<Record<SprintQuestionType, number>>;
  /** 候補のビデオ（未視聴のもの、並び順） */
  videos: StandardMenuVideoCandidate[];
  /** 2つ目の種別を選ぶ乱数（0以上1未満。テストで差し替える） */
  random?: () => number;
}

const TYPE_ORDER = (Object.keys(QUESTION_TYPES) as SprintQuestionType[]).sort(
  (a, b) => QUESTION_TYPES[a].seq_no - QUESTION_TYPES[b].seq_no,
);

const clearedLevel = (progress: StudentSprintProgress | null, type: SprintQuestionType): number => {
  if (!progress) return 0;
  const value = progress[QUESTION_TYPES[type].dbKey as keyof StudentSprintProgress];
  return typeof value === 'number' ? value : 0;
};

/**
 * 今のステージで練習する種別。次のステージの到達条件に入っている種別のうち、教材に問題があるもの。
 * 該当が無い場合（教材に問題が無い等）は、問題のある種別をすべて候補にする。
 */
function resolveCandidateTypes(
  progress: StudentSprintProgress | null,
  availableLevels: SprintAvailableLevels | null,
): SprintQuestionType[] {
  const withQuestions = TYPE_ORDER.filter((type) => hasSprintQuestionsForType(availableLevels, type));
  const nextGoals = getStageGoals(Math.min((progress?.stage ?? 0) + 1, MAX_STAGE));
  const inStage = withQuestions.filter((type) => nextGoals[type] > 0);
  return inStage.length > 0 ? inStage : withQuestions;
}

/** 種別ごとに練習するレベル。到達レベルの次（選べて問題があるもの。無ければ選べる最も低いレベル） */
function resolvePracticeLevel(
  type: SprintQuestionType,
  progress: StudentSprintProgress | null,
  availableLevels: SprintAvailableLevels | null,
): number {
  return pickSprintLevel(type, {
    hasLevel: true,
    availableLevels,
    isSelectable: (level) => isSprintLevelSelectable(type, level, progress),
    preferred: clampLevel(type, clearedLevel(progress, type) + 1),
  });
}

/**
 * 旧システムのメニューを引き継いだ標準メニューのやることを組む。
 * - スプリント2つ: 1つ目は直近7日で練習の少ない種別（同数なら次のステージまでの差が大きい種別）、2つ目は残りから無作為に選ぶ。
 *   レベルは到達レベルの次。
 * - ビデオ: 未視聴の最初の1本と、同じセクションの続きがあればもう1本。
 * やることが1つも無ければ空の配列を返す（メニューを作らない）。
 */
export function buildStandardMenu(input: StandardMenuInput): TrainingMenuItemInput[] {
  const items: TrainingMenuItemInput[] = [];
  const random = input.random ?? Math.random;

  if (input.sprint) {
    const { contentId, availableLevels } = input.sprint;
    const candidates = resolveCandidateTypes(input.progress, availableLevels);
    const nextGoals = getStageGoals(Math.min((input.progress?.stage ?? 0) + 1, MAX_STAGE));
    const gap = (type: SprintQuestionType) => nextGoals[type] - clearedLevel(input.progress, type);

    const ranked = [...candidates].sort(
      (a, b) =>
        (input.recentSessionCounts[a] ?? 0) - (input.recentSessionCounts[b] ?? 0) ||
        gap(b) - gap(a) ||
        QUESTION_TYPES[a].seq_no - QUESTION_TYPES[b].seq_no,
    );
    const primary = ranked[0];
    const rest = ranked.slice(1);
    const secondary = rest.length > 0 ? rest[Math.min(rest.length - 1, Math.floor(random() * rest.length))] : null;

    [primary, secondary].forEach((type, index) => {
      if (!type) return;
      items.push({
        seq_no: items.length + 1,
        item_type: TRAINING_MENU_ITEM_TYPE.SPRINT,
        content_id: contentId,
        question_type: type,
        difficulty_level: resolvePracticeLevel(type, input.progress, availableLevels),
        target_count: STANDARD_MENU_SPRINT_COUNTS[index],
      });
    });
  }

  const [firstVideo, ...laterVideos] = input.videos;
  if (firstVideo) {
    const sameSection = laterVideos.filter((v) => v.sectionId === firstVideo.sectionId);
    [firstVideo, ...sameSection].slice(0, STANDARD_MENU_MAX_VIDEOS).forEach((video) => {
      items.push({
        seq_no: items.length + 1,
        item_type: TRAINING_MENU_ITEM_TYPE.VIDEO,
        content_id: video.contentId,
        video_id: video.videoId,
      });
    });
  }

  return items;
}
