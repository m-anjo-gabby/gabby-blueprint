'use client';

import { useEffect, useEffectEvent, useRef, useState } from 'react';
import { isWatchCompleted, resumePositionSec } from '@gabby/lib/video/progress';
import type { StudentVideoItem, StudentVideoProgress } from '@gabby/types/video';
import { saveVideoProgress } from '@/actions/videoAction';

/** 再生中に視聴の進み具合を保存する間隔（秒） */
const SAVE_INTERVAL_SEC = 15;

type ProgressMap = Record<string, StudentVideoProgress | null>;

interface UseVideoWatchProgressOptions {
  /** 進み具合を持つビデオ（一覧に出すもの。開いているビデオも含める） */
  videos: StudentVideoItem[];
  /** いま開いているビデオ */
  current: StudentVideoItem | undefined;
  /** 初めて最後まで見た時（保存の Promise を渡す。保存の後に画面を取り直す場合に待つ） */
  onCompleted?: (videoId: string, saved: Promise<unknown>) => void;
}

/**
 * ビデオの視聴の進み具合を、再生に合わせて自動で保存する（ビデオの画面・ホームのその場の再生で共用する）。
 * 開いた時は続きの位置から再生し（最後まで見たビデオは最初から）、再生中は一定の間隔・一時停止・最後まで見た時・
 * 画面を離れる時に保存する。動画の要素には videoProps を渡す。
 */
export function useVideoWatchProgress({ videos, current, onCompleted }: UseVideoWatchProgressOptions) {
  const [progressMap, setProgressMap] = useState<ProgressMap>(() =>
    Object.fromEntries(videos.map((v) => [v.video_id, v.progress])),
  );
  const videoRef = useRef<HTMLVideoElement>(null);
  /** 最後に見ていた位置（まだ保存していなければ dirty） */
  const lastKnown = useRef<{ videoId: string; position: number; dirty: boolean } | null>(null);
  const lastSavedPosition = useRef<Record<string, number>>({});

  const durationOf = (video: StudentVideoItem) => video.duration_sec ?? videoRef.current?.duration ?? null;

  const persist = (videoId: string, positionSec: number, completed: boolean) => {
    const position = Math.max(0, Math.round(positionSec));
    lastSavedPosition.current[videoId] = position;
    if (lastKnown.current?.videoId === videoId) lastKnown.current.dirty = false;
    setProgressMap((map) => ({
      ...map,
      [videoId]: {
        last_position_sec: position,
        completed_at: completed ? new Date().toISOString() : (map[videoId]?.completed_at ?? null),
      },
    }));
    // 定期的な保存の失敗は再生の邪魔をしない（失敗はサーバーのログに残る。次の保存で取り戻す）
    const saved = saveVideoProgress({ videoId, positionSec: position, completed }).catch(() => undefined);
    if (completed) onCompleted?.(videoId, saved);
  };

  const flush = () => {
    const known = lastKnown.current;
    if (known?.dirty) persist(known.videoId, known.position, false);
  };

  // 画面・ダイアログを離れる・タブを隠す時に、最後の位置を保存する
  const onLeave = useEffectEvent(flush);
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === 'hidden') onLeave();
    };
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', onLeave);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', onLeave);
      onLeave();
    };
  }, []);

  /** 続きの位置に合わせた動画の要素（ビデオを開くたびに要素を作り直すため、要素ごとに1回だけ合わせる） */
  const seekedElements = useRef(new WeakSet<HTMLVideoElement>());
  const seekToResume = (video: StudentVideoItem, el: HTMLVideoElement) => {
    if (seekedElements.current.has(el)) return;
    seekedElements.current.add(el);
    const start = resumePositionSec(progressMap[video.video_id] ?? null, video.duration_sec ?? el.duration);
    lastSavedPosition.current[video.video_id] = start;
    if (start > 0) el.currentTime = start;
  };
  // サーバーで描いた動画は、ハイドレーションの前にメタデータを読み終えて loadedmetadata を受け取り損ねることがあるため、
  // 読み込み済みなら開いた時点で合わせる
  const seekIfLoaded = useEffectEvent(() => {
    const el = videoRef.current;
    if (current && el && el.readyState >= 1) seekToResume(current, el);
  });
  const currentId = current?.video_id;
  useEffect(() => seekIfLoaded(), [currentId]);

  const handleTimeUpdate = (video: StudentVideoItem, el: HTMLVideoElement) => {
    const position = el.currentTime;
    lastKnown.current = { videoId: video.video_id, position, dirty: true };
    const isCompleted = !!progressMap[video.video_id]?.completed_at;
    if (!isCompleted && isWatchCompleted(position, durationOf(video))) {
      persist(video.video_id, position, true);
      return;
    }
    const saved = lastSavedPosition.current[video.video_id] ?? 0;
    if (Math.abs(position - saved) >= SAVE_INTERVAL_SEC) persist(video.video_id, position, false);
  };

  /** 動画の要素に渡す ref と再生の出来事（開いているビデオが無ければ null） */
  const videoProps = current
    ? {
        ref: videoRef,
        onLoadedMetadata: (e: React.SyntheticEvent<HTMLVideoElement>) => seekToResume(current, e.currentTarget),
        onTimeUpdate: (e: React.SyntheticEvent<HTMLVideoElement>) => handleTimeUpdate(current, e.currentTarget),
        onPause: (e: React.SyntheticEvent<HTMLVideoElement>) => {
          if (!e.currentTarget.ended) flush();
        },
        onEnded: (e: React.SyntheticEvent<HTMLVideoElement>) => {
          const isCompleted = !!progressMap[current.video_id]?.completed_at;
          persist(current.video_id, e.currentTarget.duration, !isCompleted);
        },
      }
    : null;

  return { videoRef, progressMap, persist, flush, durationOf, videoProps };
}

export type VideoWatchProgress = ReturnType<typeof useVideoWatchProgress>;
