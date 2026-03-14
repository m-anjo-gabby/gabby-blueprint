"use client";

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
  Layers, 
  Video, 
  MessageSquare, 
  Globe, 
  Lock,
  ExternalLink,
  Plus,
  TagIcon,
  EyeOff,
  HelpCircle,
  Building2
} from "lucide-react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Content, CONTENT_TYPES, CONTENT_SCOPES } from "@/types/content";
import { ContentFormDialog } from "./ContentFormDialog";
import Link from "next/link";
import { ContentTagDialog } from "./ContentTagDialog";
import { ContentAccessDialog } from "./ContentAccessDialog";

interface ContentDataTableProps {
  data: Content[];
  pageCount: number;
  totalCount: number;
}

export function ContentDataTable({
  data,
  pageCount,
  totalCount,
}: ContentDataTableProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [searchValue, setSearchValue] = React.useState(searchParams.get("q") || "");

  const currentPage = Number(searchParams.get("page")) || 1;

  // --- カラム定義 ---
  const columns = React.useMemo<ColumnDef<Content>[]>(() => [
    {
      accessorKey: "content_name",
      header: "教材 / ラベル",
      cell: ({ row }) => (
        <div className="flex flex-col gap-0.5 py-1">
          <span className="text-sm font-bold text-slate-900 leading-tight">
            {row.original.content_name}
          </span>
          <span className="text-[10px] text-slate-400 font-mono font-medium tracking-tight truncate max-w-[200px]">
            {row.original.content_label}
          </span>
        </div>
      ),
    },
    {
      accessorKey: "content_type",
      header: "種別",
      cell: ({ row }) => {
        const type = row.original.content_type;
        const config = {
          0: { icon: <MessageSquare size={12} />, className: "bg-blue-50 text-blue-600 border-blue-100" },
          1: { icon: <Video size={12} />, className: "bg-purple-50 text-purple-600 border-purple-100" },
          2: { icon: <Layers size={12} />, className: "bg-emerald-50 text-emerald-600 border-emerald-100" },
        }[type] || { icon: null, className: "" };

        return (
          <Badge variant="outline" className={`${config.className} gap-1 font-bold text-[10px] px-2`}>
            {config.icon}
            {CONTENT_TYPES[type]?.label}
          </Badge>
        );
      },
    },
    {
      accessorKey: "content_scope",
      header: "公開範囲",
      cell: ({ row }) => {
        const content = row.original;
        const scope = content.content_scope as keyof typeof CONTENT_SCOPES;
        const config = CONTENT_SCOPES[scope];
        const clients = content.access_clients || [];
        const isAlert = scope === 1 && clients.length === 0;

        const styles = {
          0: { icon: <Globe size={11} />, text: "text-emerald-600", bg: "bg-emerald-50", border: "border-emerald-100" },
          1: { icon: <Lock size={11} />, text: "text-amber-600", bg: "bg-amber-50", border: "border-amber-100" },
          9: { icon: <EyeOff size={11} />, text: "text-slate-500", bg: "bg-slate-100", border: "border-slate-200" },
        }[scope];

        // 限定(1)の場合のみ、全体をダイアログのトリガーにする
        if (scope === 1) {
          return (
            <ContentAccessDialog content={content}>
              <div className="group flex flex-col gap-1.5 min-w-[140px] cursor-pointer">
                {/* 上段：バッジ ＋ プラスアイコン */}
                <div className="flex items-center gap-2">
                  <div className={`
                    flex items-center gap-1 px-2 py-0.5 rounded-full border transition-all
                    ${styles.bg} ${styles.border} group-hover:bg-amber-100 group-hover:border-amber-300
                  `}>
                    {isAlert ? (
                      <div className="relative flex items-center">
                        <Lock size={11} className="text-rose-500" />
                        <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 bg-rose-500 rounded-full border border-white animate-pulse" />
                      </div>
                    ) : (
                      <span className="opacity-70">{styles.icon}</span>
                    )}
                    <span className={`text-[10px] font-black tracking-tight ${isAlert ? 'text-rose-600' : styles.text}`}>
                      {config?.label}
                    </span>
                  </div>
                  
                  {/* ガイドとしてのプラスアイコン */}
                  <Plus size={12} className="text-slate-300 group-hover:text-amber-600 transition-colors" />
                </div>

                {/* 下段：クライアント名 */}
                <div className="flex items-center gap-1.5 pl-1 text-slate-500 group-hover:text-amber-700 transition-colors">
                  {isAlert ? (
                    <span className="text-[10px] font-bold text-rose-400 italic">未割当（非表示中）</span>
                  ) : (
                    <>
                      <Building2 size={10} className="text-slate-300 group-hover:text-amber-400 flex-shrink-0" />
                      <span className="text-[11px] font-bold text-slate-600 group-hover:text-amber-700 truncate max-w-[100px]">
                        {clients[0]?.client_name}
                      </span>
                      {clients.length > 1 && (
                        <span className="text-[9px] font-black text-amber-600 bg-amber-50 border border-amber-100 px-1 rounded-sm group-hover:bg-amber-100">
                          +{clients.length - 1}
                        </span>
                      )}
                    </>
                  )}
                </div>
              </div>
            </ContentAccessDialog>
          );
        }

        // 共通・非公開は従来通り（クリック不可）
        return (
          <div className="flex flex-col gap-1.5 min-w-[140px]">
            <div className={`flex items-center gap-1 px-2 py-0.5 rounded-full border w-fit ${styles.bg} ${styles.border}`}>
              <span className="opacity-70">{styles.icon}</span>
              <span className={`text-[10px] font-black tracking-tight ${styles.text}`}>
                {config?.label}
              </span>
            </div>
          </div>
        );
      },
    },
    {
      id: "tags",
      header: "タグ",
      cell: ({ row }) => {
        // row.original は Content 型
        const content = row.original;
        
        return (
          <div className="flex items-center gap-2 flex-wrap max-w-[250px]">
            {/* content を丸ごと渡すことで、内部で content_id や現在の tags を参照可能
            */}
            <ContentTagDialog content={content} />
          </div>
        );
      },
    },
    {
      id: "actions",
      header: () => <div className="text-right px-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">操作</div>,
      cell: ({ row }) => (
        <div className="flex justify-end items-center gap-2 px-2">
          {/* 教材基本情報の編集モーダル */}
          <ContentFormDialog mode="edit" initialData={row.original} />

          {/* 詳細（単語エディタ等）画面へ */}
          <Button 
            variant="ghost" 
            size="sm" 
            asChild
            className="h-8 w-8 p-0 text-slate-400 hover:text-slate-900 hover:bg-slate-100"
            title="詳細・エディタを開く"
          >
            <Link href={`/admin/contents/${row.original.content_id}`}>
              <ExternalLink size={14} />
            </Link>
          </Button>
        </div>
      ),
    },
  ], []);

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  const handleSearchTrigger = (term: string) => {
    const params = new URLSearchParams(searchParams);
    if (term) {
      params.set("q", term);
      params.set("page", "1");
    } else {
      params.delete("q");
    }
    router.push(`${pathname}?${params.toString()}`);
  };

  const handlePageChange = (newPage: number) => {
    const params = new URLSearchParams(searchParams);
    params.set("page", newPage.toString());
    router.push(`${pathname}?${params.toString()}`);
  };

  return (
    <div className="space-y-0">
      {/* コントロールパネル */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 px-4 py-3 bg-slate-50/80 rounded-t-lg border-x border-t border-slate-200">
        <div className="flex items-center gap-2 w-full max-w-md">
          <div className="relative flex-1 group">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 group-focus-within:text-slate-600 transition-colors" />
            <Input
              placeholder="教材名、ラベルで検索..."
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
      <div className="rounded-b-lg border-x border-b border-slate-200 bg-white shadow-sm overflow-hidden">
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
                <TableCell colSpan={columns.length} className="h-32 text-center text-slate-400 bg-slate-50/10">
                  教材データが見つかりませんでした。
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}