'use client';

import type { ListColumnDef } from '@/components/list/listTable';
import { format } from 'date-fns';
import { Calendar, Download, FileAudio, Headphones, Loader2, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import type { TTSAssetListItem } from '@/actions/adminTTSAction';

interface ColumnOptions {
  /** 再生中・ダウンロード中の音声の ID（usePlayAudioSpeech） */
  playingId: string | null;
  downloadingId: string | null;
  onPlay: (asset: TTSAssetListItem) => void;
  onDownload: (asset: TTSAssetListItem) => void;
  onDelete: (asset: TTSAssetListItem) => void;
}

const fileNameOf = (asset: TTSAssetListItem) => asset.audio_path?.split('/').pop() ?? null;

/** 音声ファイル名（ダウンロード時の名前にも使う） */
export const downloadNameOf = (asset: TTSAssetListItem) => fileNameOf(asset) ?? `tts_${asset.asset_id}`;

export function createColumns({
  playingId,
  downloadingId,
  onPlay,
  onDownload,
  onDelete,
}: ColumnOptions): ListColumnDef<TTSAssetListItem>[] {
  return [
    {
      accessorKey: 'raw_text',
      header: 'Phrase & Comment',
      cell: ({ row }) => (
        <div className="max-w-87.5">
          <div className="truncate text-sm font-bold text-slate-900" title={row.original.raw_text}>
            {row.original.raw_text}
          </div>
          <div className="mt-0.5 truncate text-[10px] italic text-slate-400">
            {row.original.comment || 'No comment'}
          </div>
        </div>
      ),
    },
    {
      accessorKey: 'audio_path',
      header: 'File & Audio',
      cell: ({ row }) => {
        const asset = row.original;
        const isPlaying = playingId === asset.asset_id;
        const isDownloading = downloadingId === asset.asset_id;
        return (
          <div className="flex items-center gap-3">
            <div className="flex min-w-35 items-center gap-2 rounded-md border border-slate-100 bg-slate-50/50 px-2 py-1 font-mono text-[10px] text-slate-500">
              <FileAudio size={12} className={asset.audio_path ? 'text-brand-400' : 'animate-pulse text-slate-300'} />
              <span className="max-w-37.5 truncate">{fileNameOf(asset) ?? 'processing...'}</span>
            </div>
            {asset.audio_path && (
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onPlay(asset)}
                  className={cn(
                    'h-7 w-22 justify-start gap-1.5 rounded-lg border px-2',
                    isPlaying
                      ? 'border-brand-200 bg-brand-50 text-brand shadow-sm'
                      : 'border-transparent text-brand-500 hover:border-slate-100 hover:bg-brand-50 hover:text-brand-strong',
                  )}
                >
                  {isPlaying ? <Loader2 size={12} className="animate-spin" /> : <Headphones size={12} />}
                  <span className="text-[10px] font-bold">{isPlaying ? 'Playing...' : 'Listen'}</span>
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={isDownloading}
                  onClick={() => onDownload(asset)}
                  aria-label="Download"
                  className="h-7 w-7 rounded-lg p-0 text-slate-400 hover:bg-brand-50 hover:text-brand"
                >
                  {isDownloading ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />}
                </Button>
              </div>
            )}
          </div>
        );
      },
    },
    {
      accessorKey: 'created_at',
      header: 'Date (UTC)',
      cell: ({ row }) => (
        <div className="flex items-center gap-1 text-[11px] font-medium text-slate-500">
          <Calendar size={12} className="opacity-30" />
          {format(new Date(row.original.created_at), 'MM/dd HH:mm')}
        </div>
      ),
    },
    {
      id: 'actions',
      header: () => null,
      cell: ({ row }) => (
        <div className="flex justify-end">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onDelete(row.original)}
            aria-label="Delete this asset"
            className="h-8 w-8 rounded-lg p-0 text-slate-300 hover:bg-rose-50 hover:text-rose-500"
          >
            <Trash2 size={14} />
          </Button>
        </div>
      ),
    },
  ];
}
