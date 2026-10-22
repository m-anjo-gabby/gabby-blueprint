'use client';

import { ArrowRight } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useEffectEvent, useState } from 'react';
import { formatVideoDuration } from '@gabby/lib/video/format';
import type { StudentVideoItem } from '@gabby/types/video';
import { getStudentVideo } from '@/actions/videoAction';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { useVideoWatchProgress } from './useVideoWatchProgress';
import { VideoPlayer, VideoPlayerNotice } from './VideoPlayer';

/** その場で再生するビデオ（見出しは取得を待たずに出すため、開く側が持っている値を渡す） */
export interface VideoPlayerTarget {
  videoId: string;
  title: string;
  /** 見出しの上に添える教材名等 */
  subtitle: string | null;
  /** ビデオの画面（シリーズの一覧・次のビデオ・ブックマーク） */
  href: string;
}

interface VideoPlayerDialogProps {
  /** 開くビデオ（null で閉じる） */
  target: VideoPlayerTarget | null;
  /** 閉じた時（閉じるボタン・枠の外・端末の「戻る」） */
  onClose: () => void;
  /** 初めて最後まで見た時（保存の Promise を渡す。完了を画面に反映する場合は保存を待ってから取り直す） */
  onCompleted?: (saved: Promise<unknown>) => void;
}

type LoadState =
  | { status: 'loading' }
  | { status: 'ready'; video: StudentVideoItem }
  | { status: 'missing' }
  | { status: 'error'; message: string };

/** 再生画面の枠（読み込み中・案内と本番で同じ形にする） */
const PLAYER_FRAME_CLASS = 'aspect-video w-full bg-ink';

/**
 * ビデオを画面を移らずにその場で再生するダイアログ（再生するものが決まっているので、開いたら自動で再生する）。
 * 動画の URL と続きの位置は開いた時に取得する（画面を開くたびに作らない。長く置いた後でも期限が切れない）。
 * 視聴の進み具合はビデオの画面と同じく自動で保存する。開いた時に履歴を1つ積み、端末の「戻る」でダイアログだけを閉じる。
 */
export function VideoPlayerDialog({ target, onClose, onCompleted }: VideoPlayerDialogProps) {
  const open = target !== null;
  const handleClose = useEffectEvent(onClose);

  useEffect(() => {
    if (!open) return;
    window.history.pushState(null, '', window.location.href);
    const handlePopState = () => handleClose();
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [open]);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        // 積んだ履歴を戻る（上の popstate で閉じる）
        if (!next) window.history.back();
      }}
    >
      <DialogContent aria-describedby={undefined} className="max-w-3xl gap-0 overflow-hidden p-0 sm:rounded-card">
        {target && (
          <>
            <div className="space-y-0.5 py-4 pl-5 pr-12">
              {target.subtitle && <p className="truncate text-xs text-ink-muted">{target.subtitle}</p>}
              <DialogTitle className="line-clamp-2 text-base font-bold leading-snug text-ink wrap-anywhere">
                {target.title}
              </DialogTitle>
            </div>
            <DialogPlayer key={target.videoId} target={target} onCompleted={onCompleted} />
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function DialogPlayer({
  target,
  onCompleted,
}: {
  target: VideoPlayerTarget;
  onCompleted: VideoPlayerDialogProps['onCompleted'];
}) {
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);

  // 利用者が開いた時の取得（初期表示のデータではないため、サーバーアクションで取りに行く）
  useEffect(() => {
    let active = true;
    getStudentVideo(target.videoId)
      .then((res) => {
        if (!active) return;
        if (!res.success) setState({ status: 'error', message: res.message });
        else setState(res.data ? { status: 'ready', video: res.data } : { status: 'missing' });
      })
      .catch(() => {
        if (active) setState({ status: 'error', message: '動画を読み込めませんでした' });
      });
    return () => {
      active = false;
    };
  }, [target.videoId, attempt]);

  const retry = () => {
    setState({ status: 'loading' });
    setAttempt((n) => n + 1);
  };

  return (
    <>
      {state.status === 'ready' ? (
        <ReadyPlayer video={state.video} onRetry={retry} onCompleted={onCompleted} />
      ) : (
        <div className={cn(PLAYER_FRAME_CLASS, state.status === 'loading' && 'animate-pulse')}>
          {state.status === 'error' && <VideoPlayerNotice message={state.message} onRetry={retry} />}
          {state.status === 'missing' && <VideoPlayerNotice message="このビデオは見られません" />}
        </div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
        <p className="text-xs text-ink-muted tabular-nums">
          {state.status === 'ready' && formatVideoDuration(state.video.duration_sec)}
        </p>
        <Link
          href={target.href}
          className="inline-flex items-center gap-1 text-sm font-semibold text-brand-strong hover:text-brand-900 transition-colors"
        >
          ビデオの画面で見る
          <ArrowRight size={16} />
        </Link>
      </div>
    </>
  );
}

function ReadyPlayer({
  video,
  onRetry,
  onCompleted,
}: {
  video: StudentVideoItem;
  onRetry: () => void;
  onCompleted: VideoPlayerDialogProps['onCompleted'];
}) {
  const watch = useVideoWatchProgress({
    videos: [video],
    current: video,
    onCompleted: (_, saved) => onCompleted?.(saved),
  });
  return <VideoPlayer video={video} watch={watch} autoPlay onRetry={onRetry} className={PLAYER_FRAME_CLASS} />;
}
