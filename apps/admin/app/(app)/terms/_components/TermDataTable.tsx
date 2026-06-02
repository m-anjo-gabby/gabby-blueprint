// apps/admin/app/(app)/terms/_components/TermDataTable.tsx
"use client"

import * as React from "react";
import {
  ColumnDef,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { 
  ChevronLeft, 
  ChevronRight, 
  Search, 
  X, 
  ShieldCheck, 
  FileText,
  Eye,
  Edit,
  Trash2,
  AlertCircle
} from "lucide-react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { formatToJstDate } from "@gabby/lib/date/date";
import Link from "next/link";
import { deleteTerm } from "@/actions/adminTermAction";
import { useToast } from "@gabby/lib/hooks/useToast";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface TermDataTableProps {
  data: any[];
  pageCount: number;
  totalCount: number;
}

export function TermDataTable({
  data,
  pageCount,
  totalCount,
}: TermDataTableProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { showToast } = useToast();
  const [searchValue, setSearchValue] = React.useState(searchParams.get("q") || "");
  const [deletingTerm, setDeletingTerm] = React.useState<any | null>(null);
  const [isDeleting, setIsDeleting] = React.useState(false);

  const currentPage = Number(searchParams.get("page")) || 1;

  const handleDelete = async () => {
    if (!deletingTerm) return;
    setIsDeleting(true);
    try {
      const result = await deleteTerm(deletingTerm.term_id);
      if (result.success) {
        showToast("規約を削除しました", "success");
        router.refresh();
      } else {
        showToast(result.message || "削除に失敗しました", "error");
      }
    } catch (error) {
      showToast("予期せぬエラーが発生しました", "error");
    } finally {
      setIsDeleting(false);
      setDeletingTerm(null);
    }
  };

  // --- カラム定義 (ContentDataTable のスタイルに準拠) ---
  const columns = React.useMemo<ColumnDef<any>[]>(() => [
    {
      accessorKey: "term_type",
      header: "規約種別",
      cell: ({ row }) => {
        const type = row.original.term_type;
        const isTerms = type === "TERMS";
        return (
          <div className="flex items-center gap-2 py-1">
            <div className={`p-1.5 rounded-lg ${isTerms ? 'bg-indigo-50 text-indigo-600' : 'bg-amber-50 text-amber-600'}`}>
              {isTerms ? <ShieldCheck size={14} /> : <FileText size={14} />}
            </div>
            <span className="text-sm font-bold text-slate-900">
              {isTerms ? "利用規約" : "プライバシーポリシー"}
            </span>
          </div>
        );
      },
    },
    {
      accessorKey: "version_name",
      header: "バージョン",
      cell: ({ row }) => (
        <span className="text-sm font-mono font-bold text-slate-600 bg-slate-100 px-2 py-0.5 rounded text-[11px]">
          {row.original.version_name}
        </span>
      ),
    },
    {
      accessorKey: "status",
      header: "ステータス",
      cell: ({ row }) => {
        const term = row.original;
        const now = new Date();
        const pubDate = new Date(term.published_date);

        // 1. 公開日時が未来
        if (pubDate > now) {
          return (
            <Badge variant="outline" className="bg-amber-50 text-amber-600 border-amber-100 font-bold text-[10px] px-2">
              公開前
            </Badge>
          );
        }

        // 2. 公開日時が過去、かつ「その種別の中で現在有効な最新版」
        if (term.is_current) {
          return (
            <Badge className="bg-emerald-50 text-emerald-600 border-emerald-100 font-bold text-[10px] px-2 shadow-sm">
              公開中
            </Badge>
          );
        }

        // 3. それ以外（過去の版）
        return (
          <Badge variant="outline" className="bg-slate-50 text-slate-400 border-slate-100 font-medium text-[10px] px-2">
            公開終了
          </Badge>
        );
      },
    },
    {
    accessorKey: "published_date",
    header: "公開開始日 (JST)",
    cell: ({ row }) => (
      <span className="text-slate-500 text-[12px] font-medium font-mono">
        {row.original.published_date}
      </span>
    ),
    },
    {
      id: "actions",
      header: () => (
        <div className="text-right px-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
          操作
        </div>
      ),
      cell: ({ row }) => {
        const term = row.original;
        const now = new Date();
        const pubDate = new Date(term.published_date);
        const isDeletable = pubDate > now;

        return (
          <div className="flex justify-end items-center px-2 gap-1">
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors"
              asChild
              title="規約を編集"
            >
              <Link href={`/terms/${term.term_id}/edit`}>
                <Edit size={16} />
              </Link>
            </Button>

            {isDeletable && (
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0 text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                onClick={() => setDeletingTerm(term)}
                title="規約を削除"
              >
                <Trash2 size={16} />
              </Button>
            )}
          </div>
        );
      },
    },
  ], [setDeletingTerm]);

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  const handleSearchTrigger = (term: string) => {
    const params = new URLSearchParams(searchParams);
    if (term) { params.set("q", term); params.set("page", "1"); }
    else { params.delete("q"); }
    router.push(`${pathname}?${params.toString()}`);
  };

  const handlePageChange = (newPage: number) => {
    const params = new URLSearchParams(searchParams);
    params.set("page", newPage.toString());
    router.push(`${pathname}?${params.toString()}`);
  };

  return (
    <div className="space-y-0">
      {/* 100% 移植したコントロールパネル */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 px-4 py-3 bg-slate-50/80 rounded-t-lg border-x border-t border-slate-200">
        <div className="flex items-center gap-2 w-full max-w-md">
          <div className="relative flex-1 group">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 group-focus-within:text-slate-600 transition-colors" />
            <Input
              placeholder="バージョン名で検索..."
              value={searchValue}
              onChange={(e) => setSearchValue(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearchTrigger(searchValue)}
              className="pl-10 pr-10 h-9 bg-white border-slate-200 focus-visible:ring-1 shadow-sm rounded-xl"
            />
            {searchValue && (
              <button onClick={() => {setSearchValue(""); handleSearchTrigger("");}} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          <Button onClick={() => handleSearchTrigger(searchValue)} variant="secondary" size="sm" className="h-9 px-4 bg-white border border-slate-200 shadow-sm font-bold text-slate-600 rounded-xl hover:bg-slate-50 transition-colors">
            検索
          </Button>
        </div>

        <div className="flex items-center gap-4">
          <div className="hidden md:block text-[13px] text-slate-500 font-medium">
            全 <span className="text-slate-900 font-bold">{totalCount}</span> 件
          </div>
          <div className="flex items-center bg-white border border-slate-200 rounded-xl p-0.5 shadow-sm">
            <Button variant="ghost" size="sm" onClick={() => handlePageChange(currentPage - 1)} disabled={currentPage <= 1} className="h-8 w-8 p-0 rounded-lg">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <div className="flex items-center px-3 text-[13px] font-bold border-x border-slate-100 min-w-[4rem] justify-center text-slate-600 font-mono">
              {currentPage} / {pageCount || 1}
            </div>
            <Button variant="ghost" size="sm" onClick={() => handlePageChange(currentPage + 1)} disabled={currentPage >= pageCount} className="h-8 w-8 p-0 rounded-lg">
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* テーブル本体 */}
      <div className="rounded-b-lg border-x border-b border-slate-200 bg-white shadow-sm overflow-hidden relative">
        {/* 削除中オーバーレイ */}
        {isDeleting && (
          <div className="absolute inset-0 bg-white/50 backdrop-blur-[1px] z-10 flex items-center justify-center">
            <div className="bg-white p-4 rounded-2xl shadow-xl flex items-center gap-3 border">
              <div className="w-5 h-5 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
              <span className="text-sm font-bold text-slate-700">削除しています...</span>
            </div>
          </div>
        )}

        <Table>
          <TableHeader className="bg-slate-50/50">
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id} className="hover:bg-transparent border-slate-200">
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id} className="text-slate-500 font-bold py-3 px-4 text-[10px] uppercase tracking-[0.1em]">
                    {flexRender(header.column.columnDef.header, header.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow key={row.id} className="hover:bg-slate-50/40 transition-colors border-slate-100">
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id} className="py-2.5 px-4 text-slate-700">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={5} className="h-32 text-center text-slate-400 bg-slate-50/10">
                  規約データが見つかりませんでした。
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* 削除確認ダイアログ */}
      <AlertDialog open={!!deletingTerm} onOpenChange={(open) => !open && !isDeleting && setDeletingTerm(null)}>
        <AlertDialogContent className="max-w-md rounded-[32px] border-none shadow-2xl p-8">
          <AlertDialogHeader className="space-y-4">
            <div className="mx-auto w-14 h-14 rounded-2xl bg-rose-50 flex items-center justify-center text-rose-500 mb-2 rotate-12">
              <Trash2 size={28} />
            </div>
            <AlertDialogTitle className="text-center text-xl font-black text-slate-800 tracking-tight">
              規約を削除しますか？
            </AlertDialogTitle>
            <AlertDialogDescription className="text-center text-slate-500 font-bold text-sm leading-relaxed">
              {deletingTerm?.term_type === "TERMS" ? "利用規約" : "プライバシーポリシー"} のバージョン「{deletingTerm?.version_name}」を完全に削除します。<br />
              この操作は取り消すことができません。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="mt-8 flex gap-3 sm:justify-center">
            <AlertDialogCancel className="flex-1 h-12 rounded-2xl font-bold text-slate-400 border-none bg-slate-50 hover:bg-slate-100 transition-all" disabled={isDeleting}>
              キャンセル
            </AlertDialogCancel>
            <AlertDialogAction 
              onClick={(e) => {
                e.preventDefault();
                handleDelete();
              }}
              className="flex-1 h-12 rounded-2xl font-black bg-rose-600 hover:bg-rose-700 text-white shadow-lg shadow-rose-600/20 border-none transition-all active:scale-[0.98]"
              disabled={isDeleting}
            >
              {isDeleting ? "削除中..." : "はい、削除します"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}