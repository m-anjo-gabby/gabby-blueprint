'use client';

import { useState, useTransition } from 'react';
import { usePlayAudioSpeech } from '@gabby/lib/hooks/usePlayAudioSpeech';
import { useToast } from '@gabby/lib/hooks/useToast';
import { deleteTTSAssetAction, type TTSAssetListItem } from '@/actions/adminTTSAction';
import { DataTable } from '@/components/list/DataTable';
import { DeleteConfirmDialog } from '@/components/list/DeleteConfirmDialog';
import { ListToolbar } from '@/components/list/ListToolbar';
import { useListQuery } from '@/components/list/useListQuery';
import { createColumns, downloadNameOf } from './columns';

interface TTSAssetTableProps {
  data: TTSAssetListItem[];
  totalCount: number;
  pageCount: number;
}

/** 生成済みの汎用音声の一覧（検索・試聴・ダウンロード・削除） */
export function TTSAssetTable({ data, totalCount, pageCount }: TTSAssetTableProps) {
  const { play, download, isPlaying, isDownloading } = usePlayAudioSpeech();
  const { showToast } = useToast();
  const query = useListQuery();
  const [deleting, setDeleting] = useState<TTSAssetListItem | null>(null);
  const [isDeleting, startDelete] = useTransition();

  const handleDelete = (asset: TTSAssetListItem) => {
    startDelete(async () => {
      const result = await deleteTTSAssetAction(asset.asset_id);
      showToast(result.success ? 'Asset deleted successfully' : result.message || 'Failed to delete asset', result.success ? 'success' : 'error');
    });
  };

  return (
    <div>
      <ListToolbar query={query} searchPlaceholder="Search phrases or comments..." totalCount={totalCount} pageCount={pageCount} />
      <DataTable
        columns={createColumns({
          playingId: isPlaying,
          downloadingId: isDownloading,
          onPlay: (asset) => asset.audio_path && play(asset.audio_path, asset.asset_id),
          onDownload: (asset) => asset.audio_path && download(asset.audio_path, asset.asset_id, downloadNameOf(asset)),
          onDelete: setDeleting,
        })}
        data={data}
        getRowId={(row) => row.asset_id}
        emptyMessage="No assets found."
        pending={query.isPending || isDeleting}
      />

      <DeleteConfirmDialog
        target={deleting}
        onClose={() => setDeleting(null)}
        onConfirm={handleDelete}
        title="Delete this asset?"
        description={(asset) => (
          <>
            {asset.raw_text.length > 60 ? `${asset.raw_text.slice(0, 60)}...` : asset.raw_text}
            <br />
            This action cannot be undone. The audio file will also be removed.
          </>
        )}
        confirmLabel="Delete"
      />
    </div>
  );
}
