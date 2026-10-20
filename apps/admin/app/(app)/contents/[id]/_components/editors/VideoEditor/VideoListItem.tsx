'use client';

import { ArrowDown, ArrowUp, FolderInput, ImageOff, Pencil, Play, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { ExternalImage } from '@gabby/lib/components/common/ExternalImage';
import { formatVideoDuration } from '@gabby/lib/video/format';
import { VIDEO_STATUS, type AdminVideoItem, type VideoStatus } from '@gabby/types/video';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';

interface VideoListItemProps {
  video: AdminVideoItem;
  isFirst: boolean;
  isLast: boolean;
  isBusy: boolean;
  onEdit: () => void;
  onPreview: () => void;
  onMoveToSection: () => void;
  onDelete: () => void;
  onMove: (direction: -1 | 1) => void;
  onChangeStatus: (status: VideoStatus) => void;
}

/** 区切りの中のビデオ1本の行 */
export function VideoListItem({
  video,
  isFirst,
  isLast,
  isBusy,
  onEdit,
  onPreview,
  onMoveToSection,
  onDelete,
  onMove,
  onChangeStatus,
}: VideoListItemProps) {
  const t = useTranslations('contents.editor.video.item');
  const isPublished = video.status === VIDEO_STATUS.PUBLISHED;

  return (
    <li className="flex items-center gap-4 px-5 py-3">
      <button
        type="button"
        onClick={onPreview}
        aria-label={t('preview')}
        className="relative w-32 aspect-video shrink-0 overflow-hidden rounded-xl bg-slate-100 group"
      >
        {video.thumbnail_url ? (
          <ExternalImage src={video.thumbnail_url} alt="" className="h-full w-full object-cover" />
        ) : (
          <span className="flex h-full w-full items-center justify-center text-slate-300">
            <ImageOff size={20} aria-hidden />
          </span>
        )}
        <span className="absolute inset-0 flex items-center justify-center bg-slate-900/0 text-white opacity-0 transition group-hover:bg-slate-900/40 group-hover:opacity-100">
          <Play size={22} fill="currentColor" aria-hidden />
        </span>
      </button>

      <div className="flex-1 min-w-0 space-y-1">
        <p className="text-sm font-bold text-slate-800 truncate">{video.title}</p>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-bold text-slate-400">
          <span>{formatVideoDuration(video.duration_sec)}</span>
          {video.legacy_code && <span className="font-mono">{t('legacyCode', { code: video.legacy_code })}</span>}
        </div>
      </div>

      <label className="flex items-center gap-2 shrink-0 text-xs font-bold text-slate-500">
        <Switch
          checked={isPublished}
          disabled={isBusy}
          onCheckedChange={(checked) => onChangeStatus(checked ? VIDEO_STATUS.PUBLISHED : VIDEO_STATUS.UNPUBLISHED)}
        />
        <span className={isPublished ? 'text-emerald-600' : undefined}>
          {isPublished ? t('published') : t('unpublished')}
        </span>
      </label>

      <div className="flex items-center gap-1 shrink-0">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          aria-label={t('moveUp')}
          title={t('moveUp')}
          disabled={isFirst || isBusy}
          onClick={() => onMove(-1)}
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
          onClick={() => onMove(1)}
        >
          <ArrowDown size={14} />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          aria-label={t('moveToSection')}
          title={t('moveToSection')}
          disabled={isBusy}
          onClick={onMoveToSection}
        >
          <FolderInput size={14} />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          aria-label={t('edit')}
          title={t('edit')}
          disabled={isBusy}
          onClick={onEdit}
        >
          <Pencil size={14} />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-slate-400 hover:text-rose-500 hover:bg-rose-50"
          aria-label={t('delete')}
          title={t('delete')}
          disabled={isBusy}
          onClick={onDelete}
        >
          <Trash2 size={14} />
        </Button>
      </div>
    </li>
  );
}
