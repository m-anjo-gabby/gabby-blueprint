"use client";

import * as React from "react";
import {
  ColumnDef,
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { 
  ChevronLeft, ChevronRight, FileAudio, Calendar, 
  Download, Loader2, Headphones, Trash2, AlertCircle 
} from "lucide-react";
import { format } from "date-fns";
import { usePlayAudioSpeech } from "@/hooks/usePlayAudioSpeech";
import { deleteTTSAssetAction } from "@/actions/adminTTSAction";
import { useToast } from "@/hooks/useToast";
import { cn } from "@/lib/utils";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

interface TTSAssetTableProps {
  assets: any[];
  onRefresh?: () => void; // 削除後に親コンポーネントでデータを再取得するためのコールバック
}

export default function TTSAssetTable({ assets = [], onRefresh }: TTSAssetTableProps) {
  const [pagination, setPagination] = React.useState({ pageIndex: 0, pageSize: 10 });
  const { play, download, isPlaying, isDownloading } = usePlayAudioSpeech();
  const { showToast } = useToast();
  
  // 削除処理中の asset_id を保持してローディング状態を管理
  const [isDeleting, setIsDeleting] = React.useState<string | null>(null);

  /**
   * 物理削除処理の実行
   */
  const handleDelete = async (assetId: string, audioPath: string) => {
    if (!assetId) return;
    setIsDeleting(assetId);
    try {
      const result = await deleteTTSAssetAction(assetId, audioPath);
      if (result.success) {
        showToast("Asset deleted successfully", "success");
        if (onRefresh) onRefresh(); // リストの更新
      } else {
        showToast(result.message || "Failed to delete asset", "error");
      }
    } catch (error) {
      showToast("A system error occurred during deletion", "error");
    } finally {
      setIsDeleting(null);
    }
  };

  const columns = React.useMemo<ColumnDef<any>[]>(() => [
    {
      accessorKey: "raw_text",
      header: "Phrase",
      cell: ({ row }) => (
        <div className="max-w-[350px] py-1">
          {/* メインのテキスト表示 */}
          <div className="text-sm font-bold text-slate-900 truncate" title={row.original.raw_text}>
            {row.original.raw_text}
          </div>
          {/* 補足コメント（メモ）の表示 */}
          <div className="text-[10px] text-slate-400 truncate italic">
            {row.original.comment || "No comment"}
          </div>
        </div>
      ),
    },
    {
      accessorKey: "audio_path",
      header: "File & Audio",
      cell: ({ row }) => {
        const path = row.original.audio_path;
        const assetId = row.original.asset_id; // DDL主キー asset_id を使用
        const fileName = path ? path.split('/').pop() : "processing...";
        const isCurrentPlaying = isPlaying === assetId;
        const isCurrentDownloading = isDownloading === assetId;

        return (
          <div className="flex items-center gap-3 py-1">
            {/* ファイル名バッジ */}
            <div className="flex items-center gap-2 font-mono text-[10px] text-slate-500 bg-slate-50/50 px-2 py-1 rounded-md border border-slate-100 min-w-[140px]">
              <FileAudio size={12} className={path ? "text-indigo-400" : "text-slate-300 animate-pulse"}/>
              <span className="truncate max-w-[100px]">{fileName}</span>
            </div>

            {path && (
              <div className="flex items-center gap-1">
                {/* 再生/停止ボタン: ガタつき防止のため幅を w-[88px] に固定 */}
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={() => play(path, assetId)}
                  className={cn(
                    "h-7 w-[88px] px-2 gap-1.5 rounded-lg border transition-all justify-start",
                    isCurrentPlaying 
                      ? "bg-indigo-50 text-indigo-600 border-indigo-200 shadow-sm" 
                      : "text-indigo-500 hover:text-indigo-700 hover:bg-indigo-50 border-transparent hover:border-slate-100"
                  )}
                >
                  {isCurrentPlaying ? <Loader2 size={12} className="animate-spin" /> : <Headphones size={12} />}
                  <span className="text-[10px] font-bold">{isCurrentPlaying ? "Playing..." : "Listen"}</span>
                </Button>

                {/* ダウンロードボタン */}
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={isCurrentDownloading}
                  onClick={() => download(path, assetId, `tts_${assetId}`)}
                  className="h-7 w-7 p-0 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all"
                >
                  {isCurrentDownloading ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />}
                </Button>
              </div>
            )}
          </div>
        );
      },
    },
    {
      accessorKey: "created_at",
      header: "Date",
      cell: ({ row }) => (
        <div className="text-[11px] font-medium text-slate-500 flex items-center gap-1">
          <Calendar size={12} className="opacity-30"/>
          {row.original.created_at ? format(new Date(row.original.created_at), "MM/dd HH:mm") : "---"}
        </div>
      ),
    },
    {
      id: "delete",
      header: "",
      cell: ({ row }) => {
        const assetId = row.original.asset_id;
        const audioPath = row.original.audio_path;

        return (
          <div className="flex justify-end pr-2">
            <AlertDialog>
              <AlertDialogTrigger asChild>
                {/* 削除開始ボタン */}
                <Button 
                  variant="ghost" 
                  size="sm" 
                  disabled={!assetId || isDeleting === assetId}
                  className="h-8 w-8 p-0 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-all"
                >
                  {isDeleting === assetId ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                </Button>
              </AlertDialogTrigger>
              
              {/* 削除確認ダイアログ (UIは英語) */}
              <AlertDialogContent className="rounded-2xl border-none shadow-2xl">
                <AlertDialogHeader>
                  <div className="flex items-center gap-2 text-rose-600 mb-2">
                    <AlertCircle size={20} />
                    <AlertDialogTitle className="font-black">Delete this asset?</AlertDialogTitle>
                  </div>
                  <AlertDialogDescription className="text-xs font-medium text-slate-500 italic">
                    {row.original.raw_text?.substring(0, 60)}... <br />
                    This action cannot be undone. The audio file will also be removed.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter className="mt-4 gap-2">
                  <AlertDialogCancel className="rounded-xl border-none bg-slate-100 font-bold text-slate-500">
                    Cancel
                  </AlertDialogCancel>
                  <AlertDialogAction 
                    onClick={() => assetId && handleDelete(assetId, audioPath)}
                    className="rounded-xl bg-rose-500 text-white font-bold hover:bg-rose-600 shadow-lg shadow-rose-100 border-none"
                  >
                    Delete
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        );
      },
    },
  ], [isPlaying, isDownloading, isDeleting, play, download]);

  const table = useReactTable({
    data: assets,
    columns,
    state: { pagination },
    onPaginationChange: setPagination,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  });

  return (
    <div className="w-full space-y-4">
      {/* テーブル上部: ページネーションと件数表示 */}
      <div className="flex items-center justify-between px-4">
        <div className="flex items-center gap-3">
          <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Recent Logs</span>
          <span className="bg-slate-100 text-slate-500 text-[9px] font-bold px-2 py-0.5 rounded-full">
            {assets.length} items
          </span>
        </div>
        
        <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-xl p-1 shadow-sm">
          <Button variant="ghost" size="sm" onClick={() => table.previousPage()} disabled={!table.getCanPreviousPage()} className="h-7 w-7 p-0"><ChevronLeft size={14}/></Button>
          <span className="text-[10px] font-mono font-bold px-2 text-slate-600">{table.getState().pagination.pageIndex + 1} / {table.getPageCount() || 1}</span>
          <Button variant="ghost" size="sm" onClick={() => table.nextPage()} disabled={!table.getCanNextPage()} className="h-7 w-7 p-0"><ChevronRight size={14}/></Button>
        </div>
      </div>

      {/* テーブルメイン筐体 */}
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
        <Table>
          <TableHeader className="bg-slate-50/50">
            {table.getHeaderGroups().map(hg => (
              <TableRow key={hg.id} className="border-slate-200 hover:bg-transparent">
                {hg.headers.map(h => (
                  <TableHead key={h.id} className="text-[10px] font-black uppercase tracking-widest text-slate-400 h-10 px-6">
                    {flexRender(h.column.columnDef.header, h.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.length ? (
              table.getRowModel().rows.map(row => (
                <TableRow key={row.id} className="border-slate-100 hover:bg-slate-50/50 transition-colors">
                  {row.getVisibleCells().map(cell => (
                    <TableCell key={cell.id} className="px-6 py-2.5">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-32 text-center text-slate-400 text-xs font-medium">
                  No assets found.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}