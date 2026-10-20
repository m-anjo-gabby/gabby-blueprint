'use client';

import { Bookmark, ChevronRight, RotateCw } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useEffectEvent, useRef, useState } from 'react';
import { useConfirm } from '@gabby/lib/hooks/useConfirm';
import { useToast } from '@gabby/lib/hooks/useToast';
import { formatVideoDuration } from '@gabby/lib/video/format';
import {
  countCompletedVideos,
  isWatchCompleted,
  resumePositionSec,
  videoProgressPercent,
} from '@gabby/lib/video/progress';
import type { StudentVideoContent, StudentVideoItem, StudentVideoProgress } from '@gabby/types/video';
import { takeResumeContent } from '@/actions/contentAction';
import { saveVideoBookmark, saveVideoProgress } from '@/actions/videoAction';
import { Button } from '@/components/ui/button';
import { VIDEO_LAYOUT_CLASS, VideoPageHeader } from './VideoContentSkeleton';
import { VideoList } from './VideoList';

interface VideoContentViewProps {
  content: StudentVideoContent;
  /** 最初に開くビデオ（URL の v が無い・見つからない時に使う） */
  initialVideoId: string | null;
  /** ホームの「続きから」から来た（開いた時点でブックマークを使い終える） */
  consumeBookmark: boolean;
}

/** 再生中に視聴の進み具合を保存する間隔（秒） */
const SAVE_INTERVAL_SEC = 15;

type ProgressMap = Record<string, StudentVideoProgress | null>;

/**
 * ビデオ教材（シリーズ）の再生画面と一覧。ビデオの選び直しは URL（?v=）だけを変え、ページは描き直さない。
 * 視聴の進み具合はビデオごとに自動で保存し、次に開いた時はその位置から再生する（最後まで見たビデオは最初から）。
 */
export function VideoContentView({ content, initialVideoId, consumeBookmark }: VideoContentViewProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { showToast } = useToast();
  const { showConfirm } = useConfirm();

  const videos = content.sections.flatMap((s) => s.videos);
  const requestedId = searchParams.get('v');
  const currentId = requestedId && videos.some((v) => v.video_id === requestedId) ? requestedId : initialVideoId;
  const currentIndex = videos.findIndex((v) => v.video_id === currentId);
  const current: StudentVideoItem | undefined = videos[currentIndex];
  const next: StudentVideoItem | undefined = videos[currentIndex + 1];

  const [progressMap, setProgressMap] = useState<ProgressMap>(() =>
    Object.fromEntries(videos.map((v) => [v.video_id, v.progress])),
  );
  const [loadFailedId, setLoadFailedId] = useState<string | null>(null);
  const [isBookmarking, setIsBookmarking] = useState(false);

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
    void saveVideoProgress({ videoId, positionSec: position, completed }).catch(() => undefined);
  };

  const flush = () => {
    const known = lastKnown.current;
    if (known?.dirty) persist(known.videoId, known.position, false);
  };

  // 画面を離れる・タブを隠す時に、最後の位置を保存する
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

  // 「続きから」で開いたら、ブックマークを使い終える（URL も ?v= の形にそろえる）
  useEffect(() => {
    if (!consumeBookmark) return;
    void takeResumeContent(content.content_id).catch(() => undefined);
    if (initialVideoId) window.history.replaceState(null, '', `?v=${initialVideoId}`);
  }, [consumeBookmark, content.content_id, initialVideoId]);

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
  useEffect(() => seekIfLoaded(), [currentId]);

  const select = (videoId: string) => {
    if (videoId === currentId) return;
    flush();
    setLoadFailedId(null);
    // 選んでも自動では再生しない（サムネイル・説明を見てから再生してもらう）。
    // 履歴は積まず、画面の戻るで教材を開く前の画面へ戻れるようにする
    window.history.replaceState(null, '', `?v=${videoId}`);
  };

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

  const handleBookmark = async () => {
    if (!current) return;
    const ok = await showConfirm(
      'ブックマークして終了しますか？',
      'ホームの「続きから」で、このビデオの今の位置から再開できます。',
      { variant: 'warning', isModal: false },
    );
    if (!ok) return;
    videoRef.current?.pause();
    const position = videoRef.current?.currentTime ?? progressMap[current.video_id]?.last_position_sec ?? 0;
    setIsBookmarking(true);
    try {
      persist(current.video_id, position, false);
      const res = await saveVideoBookmark({
        contentId: content.content_id,
        videoId: current.video_id,
        videoTitle: current.title,
        positionSec: position,
        progressPercent: videoProgressPercent(
          { last_position_sec: Math.round(position), completed_at: null },
          durationOf(current),
        ),
      });
      if (!res.success) {
        showToast(res.message, 'error');
        return;
      }
      showToast('ブックマークしました', 'success');
      router.push('/dashboard');
    } finally {
      setIsBookmarking(false);
    }
  };

  const sectionsWithProgress = content.sections.map((s) => ({
    ...s,
    videos: s.videos.map((v) => ({ ...v, progress: progressMap[v.video_id] ?? null })),
  }));
  const { completed, total } = countCompletedVideos(sectionsWithProgress);

  return (
    <>
      <VideoPageHeader />
      <div className={VIDEO_LAYOUT_CLASS}>
        <div className="space-y-4">
          <div className="relative aspect-video w-full overflow-hidden rounded-card bg-ink">
            {current?.video_url && loadFailedId !== current.video_id ? (
              <video
                key={current.video_id}
                ref={videoRef}
                src={current.video_url}
                poster={current.thumbnail_url ?? undefined}
                controls
                playsInline
                preload="metadata"
                controlsList="nodownload"
                className="h-full w-full"
                onLoadedMetadata={(e) => seekToResume(current, e.currentTarget)}
                onTimeUpdate={(e) => handleTimeUpdate(current, e.currentTarget)}
                onPause={(e) => {
                  if (!e.currentTarget.ended) flush();
                }}
                onEnded={(e) => {
                  const isCompleted = !!progressMap[current.video_id]?.completed_at;
                  persist(current.video_id, e.currentTarget.duration, !isCompleted);
                }}
                onError={() => setLoadFailedId(current.video_id)}
              >
                <track kind="captions" />
              </video>
            ) : (
              <div className="flex h-full w-full flex-col items-center justify-center gap-3 p-6 text-center text-sm text-white">
                <p>{current ? '動画を読み込めませんでした。画面を再読み込みしてください' : 'ビデオがありません'}</p>
                {current && (
                  <Button
                    variant="secondary"
                    className="rounded-control font-bold"
                    icon={<RotateCw size={16} />}
                    onClick={() => router.refresh()}
                  >
                    再読み込み
                  </Button>
                )}
              </div>
            )}
          </div>

          {current && (
            <section className="space-y-3">
              <div className="space-y-1">
                <p className="text-xs text-ink-muted">{content.content_name}</p>
                <h2 className="text-lg font-bold leading-snug text-ink wrap-anywhere">{current.title}</h2>
                <p className="text-xs text-ink-muted tabular-nums">
                  {formatVideoDuration(current.duration_sec)}・{currentIndex + 1} / {total} 本目
                </p>
              </div>
              {current.description && (
                <p className="whitespace-pre-wrap wrap-anywhere text-sm leading-relaxed text-ink-soft">
                  {current.description}
                </p>
              )}
              <div className="flex flex-wrap gap-2">
                {next && (
                  <Button
                    onClick={() => select(next.video_id)}
                    icon={<ChevronRight size={16} />}
                    className="h-11 rounded-control bg-brand px-5 font-bold text-white hover:bg-brand-strong"
                  >
                    次のビデオへ
                  </Button>
                )}
                <Button
                  variant="outline"
                  className="h-11 rounded-control border-line px-5 font-bold text-ink-soft"
                  pending={isBookmarking}
                  icon={<Bookmark size={16} />}
                  onClick={() => void handleBookmark()}
                >
                  ブックマークして終了
                </Button>
              </div>
            </section>
          )}
        </div>

        <VideoList
          contentName={content.content_name}
          sections={sectionsWithProgress}
          currentId={currentId}
          completedCount={completed}
          totalCount={total}
          onSelect={select}
        />
      </div>
    </>
  );
}
