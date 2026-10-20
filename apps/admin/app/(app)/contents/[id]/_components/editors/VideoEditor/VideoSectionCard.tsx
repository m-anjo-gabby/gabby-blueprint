'use client';

import { ArrowDown, ArrowUp, Pencil, Plus, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { AdminVideoItem, AdminVideoSection, VideoStatus } from '@gabby/types/video';
import { Button } from '@/components/ui/button';
import { VideoListItem } from './VideoListItem';

interface VideoSectionCardProps {
  section: AdminVideoSection;
  isFirst: boolean;
  isLast: boolean;
  busyId: string | null;
  onMoveSection: (direction: -1 | 1) => void;
  onRenameSection: () => void;
  onDeleteSection: () => void;
  onAddVideo: () => void;
  onEditVideo: (video: AdminVideoItem) => void;
  onPreviewVideo: (video: AdminVideoItem) => void;
  onMoveVideoToSection: (video: AdminVideoItem) => void;
  onDeleteVideo: (video: AdminVideoItem) => void;
  onMoveVideo: (video: AdminVideoItem, direction: -1 | 1) => void;
  onChangeStatus: (video: AdminVideoItem, status: VideoStatus) => void;
}

/** 区切り1つ（見出しと、その中のビデオ） */
export function VideoSectionCard({
  section,
  isFirst,
  isLast,
  busyId,
  onMoveSection,
  onRenameSection,
  onDeleteSection,
  onAddVideo,
  onEditVideo,
  onPreviewVideo,
  onMoveVideoToSection,
  onDeleteVideo,
  onMoveVideo,
  onChangeStatus,
}: VideoSectionCardProps) {
  const t = useTranslations('contents.editor.video.section');
  const isBusy = busyId === section.section_id;
  const hasVideos = section.videos.length > 0;

  return (
    <section className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
      <header className="flex items-center justify-between gap-3 px-5 py-3 bg-slate-50 border-b border-slate-100">
        <div className="flex items-center gap-3 min-w-0">
          <h2 className={`text-sm font-black truncate ${section.section_name ? 'text-slate-800' : 'text-slate-400'}`}>
            {section.section_name ?? t('untitled')}
          </h2>
          <span className="text-[11px] font-bold text-slate-400 shrink-0">
            {t('videoCount', { count: section.videos.length })}
          </span>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            aria-label={t('moveUp')}
            title={t('moveUp')}
            disabled={isFirst || isBusy}
            onClick={() => onMoveSection(-1)}
          >
            <ArrowUp size={14} />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            aria-label={t('moveDown')}
            title={t('moveDown')}
            disabled={isLast || isBusy}
            onClick={() => onMoveSection(1)}
          >
            <ArrowDown size={14} />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            aria-label={t('rename')}
            title={t('rename')}
            onClick={onRenameSection}
          >
            <Pencil size={14} />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-slate-400 hover:text-rose-500 hover:bg-rose-50"
            aria-label={t('delete')}
            title={hasVideos ? t('deleteDisabledHint') : t('delete')}
            disabled={hasVideos || isBusy}
            onClick={onDeleteSection}
          >
            <Trash2 size={14} />
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-8 ml-2 rounded-lg font-bold"
            icon={<Plus size={14} />}
            onClick={onAddVideo}
          >
            {t('addVideo')}
          </Button>
        </div>
      </header>

      {hasVideos ? (
        <ul className="divide-y divide-slate-100">
          {section.videos.map((video, index) => (
            <VideoListItem
              key={video.video_id}
              video={video}
              isFirst={index === 0}
              isLast={index === section.videos.length - 1}
              isBusy={busyId === video.video_id}
              onEdit={() => onEditVideo(video)}
              onPreview={() => onPreviewVideo(video)}
              onMoveToSection={() => onMoveVideoToSection(video)}
              onDelete={() => onDeleteVideo(video)}
              onMove={(direction) => onMoveVideo(video, direction)}
              onChangeStatus={(status) => onChangeStatus(video, status)}
            />
          ))}
        </ul>
      ) : (
        <p className="px-5 py-8 text-center text-xs font-bold text-slate-300">{t('empty')}</p>
      )}
    </section>
  );
}
