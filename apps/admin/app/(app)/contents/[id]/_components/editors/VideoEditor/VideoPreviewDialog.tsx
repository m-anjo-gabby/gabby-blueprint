'use client';

import { Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import type { AdminVideoItem } from '@gabby/types/video';
import { getVideoPreviewUrl } from '@/actions/adminVideoAction';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';

interface VideoPreviewDialogProps {
  /** 再生するビデオ（null で閉じる） */
  video: AdminVideoItem | null;
  onClose: () => void;
}

/** 非公開のビデオも含めて再生して確かめる。再生用の URL は開いた時に取得する */
export function VideoPreviewDialog({ video, onClose }: VideoPreviewDialogProps) {
  const t = useTranslations('contents.editor.video.previewDialog');
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!video) return;
    let cancelled = false;
    void getVideoPreviewUrl(video.video_id).then((res) => {
      if (cancelled) return;
      if (res.success) setUrl(res.url);
      else setError(res.message);
    });
    return () => {
      cancelled = true;
      setUrl(null);
      setError(null);
    };
  }, [video]);

  return (
    <Dialog open={video !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="truncate pr-6">{video?.title}</DialogTitle>
          {video?.description && <DialogDescription>{video.description}</DialogDescription>}
        </DialogHeader>
        <div className="aspect-video w-full overflow-hidden rounded-xl bg-slate-900">
          {url ? (
            <video
              src={url}
              poster={video?.thumbnail_url ?? undefined}
              controls
              autoPlay
              preload="metadata"
              className="h-full w-full"
            >
              <track kind="captions" />
            </video>
          ) : (
            <div className="flex h-full w-full items-center justify-center text-sm text-slate-300">
              {error ?? <Loader2 className="animate-spin" size={28} aria-label={t('loading')} />}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
