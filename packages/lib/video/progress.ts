import type { StudentVideoProgress, StudentVideoSection } from '@gabby/types/video';

/**
 * 生徒のビデオの視聴の進み具合の判定（最後まで見たか・続きの再生位置・最初に開くビデオ）。
 */

/** 残りがこの秒数以下なら最後まで見たとみなす（終わりの数秒は締めの挨拶・無音が多いため） */
const COMPLETE_MARGIN_SEC = 3;
/** 続きからの再生位置がこれより前なら、最初から再生する */
const MIN_RESUME_SEC = 5;

/** 再生位置が最後まで見たとみなせる位置か */
export function isWatchCompleted(positionSec: number, durationSec: number | null): boolean {
  if (!durationSec || durationSec <= 0) return false;
  return positionSec >= durationSec - Math.min(COMPLETE_MARGIN_SEC, durationSec * 0.05);
}

/**
 * 開いた時の再生位置（秒）。見ていない・最後まで見た・始まってすぐ・終わり間際のビデオは最初から再生する
 */
export function resumePositionSec(progress: StudentVideoProgress | null, durationSec: number | null): number {
  if (!progress || progress.completed_at) return 0;
  const position = progress.last_position_sec;
  if (position < MIN_RESUME_SEC) return 0;
  if (isWatchCompleted(position, durationSec)) return 0;
  return position;
}

/** 一覧に出す進み具合（0〜100。最後まで見たビデオは 100、再生時間が分からない途中のビデオは 0） */
export function videoProgressPercent(progress: StudentVideoProgress | null, durationSec: number | null): number {
  if (!progress) return 0;
  if (progress.completed_at) return 100;
  if (!durationSec || durationSec <= 0) return 0;
  return Math.min(99, Math.floor((progress.last_position_sec / durationSec) * 100));
}

/**
 * 最初に開くビデオ。指定のビデオ（URL・続きから）があればそれ、無ければ最後まで見ていない最初のビデオ、
 * 全て見終わっていれば先頭のビデオ（ビデオが無ければ null）
 */
export function pickInitialVideoId(sections: StudentVideoSection[], requestedId: string | null): string | null {
  const videos = sections.flatMap((s) => s.videos);
  if (requestedId && videos.some((v) => v.video_id === requestedId)) return requestedId;
  return (videos.find((v) => !v.progress?.completed_at) ?? videos[0])?.video_id ?? null;
}

/** 教材の中の、最後まで見たビデオの数と全体の数 */
export function countCompletedVideos(sections: StudentVideoSection[]): { completed: number; total: number } {
  const videos = sections.flatMap((s) => s.videos);
  return { completed: videos.filter((v) => !!v.progress?.completed_at).length, total: videos.length };
}
