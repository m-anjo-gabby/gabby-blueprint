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
import { ChevronLeft, ChevronRight, Search, X } from "lucide-react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";

interface ClientDataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
  pageCount: number;
  totalCount?: number;
}

export function ClientDataTable<TData, TValue>({
  columns,
  data,
  pageCount,
  totalCount = 0,
}: ClientDataTableProps<TData, TValue>) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // 1. 検索キーワードのローカル状態（Inputの表示用）
  const [searchValue, setSearchValue] = React.useState(searchParams.get("q") || "");

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  const currentPage = Number(searchParams.get("page")) || 1;

  /**
   * 検索実行アクション
   * URLのクエリパラメータを更新し、サーバーサイドでの再取得をトリガーします。
   */
  const handleSearchTrigger = (term: string) => {
    const params = new URLSearchParams(searchParams);
    if (term) {
      params.set("q", term);
      params.set("page", "1"); // 検索時は1ページ目に戻す
    } else {
      params.delete("q");
    }
    router.push(`${pathname}?${params.toString()}`);
  };

  /**
   * 検索リセットアクション
   */
  const handleReset = () => {
    setSearchValue("");
    handleSearchTrigger("");
  };

  /**
   * ページ変更ハンドラ
   */
  const handlePageChange = (newPage: number) => {
    const params = new URLSearchParams(searchParams);
    params.set("page", newPage.toString());
    router.push(`${pathname}?${params.toString()}`);
  };

  return (
    <div className="space-y-0">
      {/* --- 上部コントロールパネル (検索 & ページネーション) --- */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 px-4 py-3 bg-slate-50/80 rounded-t-lg border-x border-t border-slate-200">
        
        {/* 左側：検索エリア (リセットボタンと実行ボタンを統合) */}
        <div className="flex items-center gap-2 w-full max-w-md">
          <div className="relative flex-1 group">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 group-focus-within:text-slate-600 transition-colors" />
            <Input
              placeholder="顧客名、コードで検索..."
              value={searchValue}
              onChange={(e) => setSearchValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSearchTrigger(searchValue);
              }}
              className="pl-10 pr-10 h-9 bg-white border-slate-200 focus-visible:ring-1 focus-visible:ring-slate-400 shadow-sm"
            />
            {/* 入力値がある場合のみリセットボタンを表示 */}
            {searchValue && (
              <button
                onClick={handleReset}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                type="button"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          <Button 
            onClick={() => handleSearchTrigger(searchValue)}
            variant="secondary" 
            size="sm" 
            className="h-9 px-4 bg-white border border-slate-200 hover:bg-slate-50 text-slate-600 shadow-sm shrink-0 font-medium"
          >
            検索
          </Button>
        </div>

        {/* 右側：ページネーション操作系 */}
        <div className="flex items-center gap-4">
          {totalCount > 0 && (
            <div className="hidden md:block text-[13px] text-slate-500 whitespace-nowrap font-medium">
              全 <span className="text-slate-900">{totalCount}</span> 件
            </div>
          )}
          
          <div className="flex items-center bg-white border border-slate-200 rounded-md p-0.5 shadow-sm">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handlePageChange(currentPage - 1)}
              disabled={currentPage <= 1}
              className="h-8 w-8 p-0 hover:bg-slate-100 disabled:opacity-30"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            
            <div className="flex items-center px-3 text-[13px] font-medium border-x border-slate-100 min-w-[4rem] justify-center text-slate-600">
              <span>{currentPage}</span>
              <span className="mx-1 text-slate-300">/</span>
              <span>{pageCount || 1}</span>
            </div>

            <Button
              variant="ghost"
              size="sm"
              onClick={() => handlePageChange(currentPage + 1)}
              disabled={currentPage >= pageCount}
              className="h-8 w-8 p-0 hover:bg-slate-100 disabled:opacity-30"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* --- テーブル本体エリア --- */}
      <div className="rounded-b-lg border border-slate-200 bg-white shadow-sm overflow-hidden">
        <Table>
          <TableHeader className="bg-slate-50/50">
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id} className="hover:bg-transparent">
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id} className="text-slate-600 font-bold py-3 px-4 text-xs uppercase tracking-wider">
                    {flexRender(header.column.columnDef.header, header.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  className="hover:bg-slate-50/40 transition-colors border-slate-100"
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id} className="py-3 px-4 text-slate-700">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-32 text-center text-slate-400 bg-slate-50/10">
                  顧客データが見つかりませんでした。
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}