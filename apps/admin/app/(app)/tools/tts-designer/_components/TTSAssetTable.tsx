"use client";

import * as React from "react";
import {
  ColumnDef,
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  getFilteredRowModel, // フィルタリング用に追加
  useReactTable,
} from "@tanstack/react-table";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input"; // 検索入力用
import { 
  ChevronLeft, ChevronRight, FileAudio, Calendar, 
  Download, Loader2, Headphones, Trash2, AlertCircle, Search, X 
} from "lucide-react";
import { format } from "date-fns";
import { usePlayAudioSpeech } from "@gabby/lib/hooks/usePlayAudioSpeech";
import { deleteTTSAssetAction } from "@/actions/adminTTSAction";
import { useToast } from "@gabby/lib/hooks/useToast";
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
  onRefresh?: () => void;
}

export default function TTSAssetTable({ assets = [], onRefresh }: TTSAssetTableProps) {
  const [pagination, setPagination] = React.useState({ pageIndex: 0, pageSize: 10 });
  const [globalFilter, setGlobalFilter] = React.useState(""); // 検索状態
  const { play, download, isPlaying, isDownloading } = usePlayAudioSpeech();
  const { showToast } = useToast();
  const [isDeleting, setIsDeleting] = React.useState<string | null>(null);

  const handleDelete = async (assetId: string, audioPath: string) => {
    if (!assetId) return;
    setIsDeleting(assetId);
    try {
      const result = await deleteTTSAssetAction(assetId, audioPath);
      if (result.success) {
        showToast("Asset deleted successfully", "success");
        if (onRefresh) onRefresh();
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
      header: "Phrase & Comment",
      cell: ({ row }) => (
        <div className="max-w-[350px] py-1">
          <div className="text-sm font-bold text-slate-900 truncate" title={row.original.raw_text}>
            {row.original.raw_text}
          </div>
          {/* コメント維持: 検索対象にも含まれます */}
          <div className="text-[10px] text-slate-400 truncate italic mt-0.5">
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
        const assetId = row.original.asset_id;
        const fileName = path ? path.split('/').pop() : "processing...";
        const isCurrentPlaying = isPlaying === assetId;
        const isCurrentDownloading = isDownloading === assetId;

        return (
          <div className="flex items-center gap-3 py-1">
            <div className="flex items-center gap-2 font-mono text-[10px] text-slate-500 bg-slate-50/50 px-2 py-1 rounded-md border border-slate-100 min-w-[140px]">
              <FileAudio size={12} className={path ? "text-indigo-400" : "text-slate-300 animate-pulse"}/>
              <span className="truncate max-w-[150px]">{fileName}</span>
            </div>

            {path && (
              <div className="flex items-center gap-1">
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

                <Button
                  variant="ghost"
                  size="sm"
                  disabled={isCurrentDownloading}
                  onClick={() => download(path, assetId, fileName || `tts_${assetId}`)}
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
      header: "Date (UTC)",
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
                <Button 
                  variant="ghost" 
                  size="sm" 
                  disabled={!assetId || isDeleting === assetId}
                  className="h-8 w-8 p-0 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-all"
                >
                  {isDeleting === assetId ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                </Button>
              </AlertDialogTrigger>
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
                  <AlertDialogCancel className="rounded-xl border-none bg-slate-100 font-bold text-slate-500">Cancel</AlertDialogCancel>
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
    state: { pagination, globalFilter },
    onPaginationChange: setPagination,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    // 検索ロジック: フレーズ(raw_text) または コメント(comment) に含まれるか
    globalFilterFn: (row, columnId, filterValue) => {
      const search = filterValue.toLowerCase();
      const phrase = String(row.original.raw_text ?? "").toLowerCase();
      const comment = String(row.original.comment ?? "").toLowerCase();
      return phrase.includes(search) || comment.includes(search);
    },
  });

  return (
    <div className="w-full space-y-4">
      {/* ツールバーエリア: 検索とページネーションを統合 */}
      <div className="flex flex-col md:flex-row items-center justify-between gap-4 px-4 py-1">
        <div className="flex items-center gap-4 w-full md:w-auto">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Assets</span>
            <span className="bg-indigo-50 text-indigo-600 text-[9px] font-bold px-2 py-0.5 rounded-full border border-indigo-100">
              {table.getFilteredRowModel().rows.length} hits
            </span>
          </div>

          {/* 検索バー */}
          <div className="relative w-full md:w-72 group">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-indigo-500 transition-colors" size={14} />
            <Input
              placeholder="Search phrases or comments..."
              value={globalFilter ?? ""}
              onChange={(e) => setGlobalFilter(e.target.value)}
              className="h-9 pl-9 pr-8 bg-white border-slate-200 rounded-xl text-xs font-medium focus-visible:ring-indigo-500 shadow-sm transition-all"
            />
            {globalFilter && (
              <button 
                onClick={() => setGlobalFilter("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 hover:bg-slate-100 rounded-full text-slate-400"
              >
                <X size={12} />
              </button>
            )}
          </div>
        </div>
        
        {/* ページネーションコントロール */}
        <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-xl p-1 shadow-sm shrink-0">
          <Button variant="ghost" size="sm" onClick={() => table.previousPage()} disabled={!table.getCanPreviousPage()} className="h-7 w-7 p-0"><ChevronLeft size={14}/></Button>
          <span className="text-[10px] font-mono font-bold px-2 text-slate-600">
            {table.getState().pagination.pageIndex + 1} / {table.getPageCount() || 1}
          </span>
          <Button variant="ghost" size="sm" onClick={() => table.nextPage()} disabled={!table.getCanNextPage()} className="h-7 w-7 p-0"><ChevronRight size={14}/></Button>
        </div>
      </div>

      {/* テーブル本体 */}
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
                <TableCell colSpan={columns.length} className="h-40 text-center">
                  <div className="flex flex-col items-center justify-center gap-2 text-slate-400">
                    <Search size={24} className="opacity-20" />
                    <p className="text-xs font-medium">No matching assets found.</p>
                  </div>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}