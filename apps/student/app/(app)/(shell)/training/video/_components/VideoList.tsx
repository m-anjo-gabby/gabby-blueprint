'use client';

import { CheckCircle2, ImageOff, Play } from 'lucide-react';
import { ExternalImage } from '@gabby/lib/components/common/ExternalImage';
import { formatVideoDuration } from '@gabby/lib/video/format';
import { videoProgressPercent } from '@gabby/lib/video/progress';
import type { StudentVideoSection } from '@gabby/types/video';
import { cn } from '@/lib/utils';

interface VideoListProps {
  contentName: string;
  sections: StudentVideoSection[];
  currentId: string | null;
  completedCount: number;
  totalCount: number;
  onSelect: (videoId: string) => void;
}

/** 教材の中のビデオの一覧（区切りの見出しごと）。見終えたビデオに印、途中のビデオに進み具合を出す */
export function VideoList({ contentName, sections, currentId, completedCount, totalCount, onSelect }: VideoListProps) {
  return (
    <nav aria-label="ビデオの一覧" className="rounded-card border border-line bg-surface p-3">
      <div className="px-2 pb-2 pt-1">
        <p className="line-clamp-2 text-sm font-bold text-ink">{contentName}</p>
        <p className="mt-0.5 text-xs text-ink-muted tabular-nums">
          {completedCount} / {totalCount} 本 視聴済み
        </p>
      </div>

      <div className="space-y-3">
        {sections.map((section) => (
          <section key={section.section_id} aria-label={section.section_name ?? undefined}>
            {section.section_name && (
              <h3 className="px-2 pb-1 pt-2 text-xs font-semibold text-ink-muted">{section.section_name}</h3>
            )}
            <ul className="space-y-1">
              {section.videos.map((video) => {
                const isCurrent = video.video_id === currentId;
                const isCompleted = !!video.progress?.completed_at;
                const percent = videoProgressPercent(video.progress, video.duration_sec);
                return (
                  <li key={video.video_id}>
                    <button
                      type="button"
                      onClick={() => onSelect(video.video_id)}
                      aria-current={isCurrent ? 'true' : undefined}
                      className={cn(
                        'flex w-full items-center gap-3 rounded-control p-2 text-left transition-colors',
                        isCurrent ? 'bg-brand-50' : 'hover:bg-canvas',
                      )}
                    >
                      <span className="relative aspect-video w-24 shrink-0 overflow-hidden rounded-control bg-canvas">
                        {video.thumbnail_url ? (
                          <ExternalImage src={video.thumbnail_url} alt="" className="h-full w-full object-cover" />
                        ) : (
                          <span className="flex h-full w-full items-center justify-center text-ink-subtle">
                            <ImageOff size={18} aria-hidden />
                          </span>
                        )}
                        {isCurrent && (
                          <span className="absolute inset-0 flex items-center justify-center bg-ink/40 text-white">
                            <Play size={18} fill="currentColor" aria-hidden />
                          </span>
                        )}
                        {!isCompleted && percent > 0 && (
                          <span aria-hidden className="absolute inset-x-0 bottom-0 h-1 bg-ink/30">
                            <span className="block h-full bg-brand-500" style={{ width: `${percent}%` }} />
                          </span>
                        )}
                      </span>
                      <span className="min-w-0 flex-1 space-y-1">
                        <span
                          className={cn(
                            'line-clamp-2 text-sm leading-snug',
                            isCurrent ? 'font-bold text-brand-strong' : 'font-medium text-ink',
                          )}
                        >
                          {video.title}
                        </span>
                        <span className="flex items-center gap-2 text-xs text-ink-muted tabular-nums">
                          {formatVideoDuration(video.duration_sec)}
                          {isCompleted && (
                            <span className="flex items-center gap-0.5 text-emerald-600">
                              <CheckCircle2 size={13} aria-hidden />
                              視聴済み
                            </span>
                          )}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>
    </nav>
  );
}
