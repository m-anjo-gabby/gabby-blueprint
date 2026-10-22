'use client';

import { Bookmark, ChevronRight } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useConfirm } from '@gabby/lib/hooks/useConfirm';
import { useToast } from '@gabby/lib/hooks/useToast';
import { formatVideoDuration } from '@gabby/lib/video/format';
import { countCompletedVideos, videoProgressPercent } from '@gabby/lib/video/progress';
import type { StudentVideoContent, StudentVideoItem } from '@gabby/types/video';
import { takeResumeContent } from '@/actions/contentAction';
import { saveVideoBookmark } from '@/actions/videoAction';
import { Button } from '@/components/ui/button';
import { useVideoWatchProgress } from '@/components/video/useVideoWatchProgress';
import { VideoPlayer } from '@/components/video/VideoPlayer';
import { VIDEO_LAYOUT_CLASS, VideoPageHeader } from './VideoContentSkeleton';
import { VideoList } from './VideoList';

interface VideoContentViewProps {
  content: StudentVideoContent;
  /** 最初に開くビデオ（URL の v が無い・見つからない時に使う） */
  initialVideoId: string | null;
  /** ホームの「続きから」から来た（開いた時点でブックマークを使い終える） */
  consumeBookmark: boolean;
}

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

  const watch = useVideoWatchProgress({ videos, current });
  const { progressMap, persist, flush, durationOf, videoRef } = watch;
  const [isBookmarking, setIsBookmarking] = useState(false);

  // 「続きから」で開いたら、ブックマークを使い終える（URL も ?v= の形にそろえる）
  useEffect(() => {
    if (!consumeBookmark) return;
    void takeResumeContent(content.content_id).catch(() => undefined);
    if (initialVideoId) window.history.replaceState(null, '', `?v=${initialVideoId}`);
  }, [consumeBookmark, content.content_id, initialVideoId]);

  const select = (videoId: string) => {
    if (videoId === currentId) return;
    flush();
    // 選んでも自動では再生しない（サムネイル・説明を見てから再生してもらう）。
    // 履歴は積まず、画面の戻るで教材を開く前の画面へ戻れるようにする
    window.history.replaceState(null, '', `?v=${videoId}`);
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
          <VideoPlayer video={current} watch={watch} onRetry={() => router.refresh()} className="rounded-card" />

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
