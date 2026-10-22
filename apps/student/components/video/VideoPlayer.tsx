'use client';

import { RotateCw } from 'lucide-react';
import { useState } from 'react';
import type { StudentVideoItem } from '@gabby/types/video';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { VideoWatchProgress } from './useVideoWatchProgress';

/** 再生できる状態になってから、自動再生が始まったかを確かめるまでの待ち時間 */
const AUTOPLAY_CHECK_MS = 500;

interface VideoPlayerProps {
  /** 再生するビデオ（無ければ「ビデオがありません」） */
  video: StudentVideoItem | undefined;
  /** 視聴の進み具合の保存（useVideoWatchProgress） */
  watch: VideoWatchProgress;
  /**
   * 開いたらすぐ再生する（再生するものが決まっている場合）。再生の前にサムネイルが一瞬見えないよう、サムネイルは出さない。
   * 端末に止められた時だけサムネイルを出し、再生ボタンで始めてもらう
   */
  autoPlay?: boolean;
  /** 動画を読み込めなかった時の「再読み込み」 */
  onRetry: () => void;
  className?: string;
}

/**
 * ビデオの再生画面（16:9）。視聴の進み具合は useVideoWatchProgress が保存する。
 * 動画を読み込めない時（署名付き URL の期限切れ等）は、再読み込みを案内する。
 */
export function VideoPlayer({ video, watch, autoPlay = false, onRetry, className }: VideoPlayerProps) {
  const [loadFailedId, setLoadFailedId] = useState<string | null>(null);
  const [autoPlayBlocked, setAutoPlayBlocked] = useState(false);

  return (
    <div className={cn('relative aspect-video w-full overflow-hidden bg-ink', className)}>
      {video?.video_url && watch.videoProps && loadFailedId !== video.video_id ? (
        <video
          key={video.video_id}
          {...watch.videoProps}
          src={video.video_url}
          poster={(autoPlay && !autoPlayBlocked ? null : video.thumbnail_url) ?? undefined}
          controls
          playsInline
          autoPlay={autoPlay}
          preload="metadata"
          controlsList="nodownload"
          className="h-full w-full"
          onCanPlay={(e) => {
            if (!autoPlay || autoPlayBlocked) return;
            // 再生できる状態になっても一度も再生していなければ、自動再生を止められたとみなす（止める理由を知る出来事は無い）
            const el = e.currentTarget;
            setTimeout(() => {
              if (el.paused && el.played.length === 0) setAutoPlayBlocked(true);
            }, AUTOPLAY_CHECK_MS);
          }}
          onError={() => setLoadFailedId(video.video_id)}
        >
          <track kind="captions" />
        </video>
      ) : (
        <VideoPlayerNotice
          message={video ? '動画を読み込めませんでした。画面を再読み込みしてください' : 'ビデオがありません'}
          onRetry={
            video
              ? () => {
                  setLoadFailedId(null);
                  onRetry();
                }
              : undefined
          }
        />
      )}
    </div>
  );
}

/** 再生画面の中の案内（読み込めない・ビデオが無い）。再読み込みを渡すとボタンを出す */
export function VideoPlayerNotice({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-3 p-6 text-center text-sm text-white">
      <p>{message}</p>
      {onRetry && (
        <Button
          variant="secondary"
          className="rounded-control font-bold"
          icon={<RotateCw size={16} />}
          onClick={onRetry}
        >
          再読み込み
        </Button>
      )}
    </div>
  );
}
