'use client';

import { flexRender, getCoreRowModel, useReactTable, type ColumnDef } from '@tanstack/react-table';
import { cn } from '@/lib/utils';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

interface DataTableProps<T> {
  columns: ColumnDef<T>[];
  /** 表示するページの行（ページ分けは呼び出し側で済ませる） */
  data: T[];
  emptyMessage: string;
  /** 一覧を取り直している最中（条件の変更・削除等）。行を薄くして操作中であることを示す */
  pending?: boolean;
  getRowId?: (row: T) => string;
}

/**
 * 一覧の表。ListToolbar の直下に置く前提で、下側だけ角丸にしている。
 * 表のオブジェクト（useReactTable の戻り値）は中身が変わっても同じ参照のため、
 * React Compiler に表示を使い回されないよう、親から受け取らずにこの部品の中で作る。
 */
export function DataTable<T>({ columns, data, emptyMessage, pending = false, getRowId }: DataTableProps<T>) {
  const table = useReactTable({ data, columns, getRowId, getCoreRowModel: getCoreRowModel() });

  return (
    <div
      aria-busy={pending || undefined}
      className={cn(
        'overflow-hidden rounded-b-lg border border-slate-200 bg-white shadow-sm transition-opacity',
        pending && 'pointer-events-none opacity-60'
      )}
    >
      <Table>
        <TableHeader className="bg-slate-50/50">
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id} className="hover:bg-transparent">
              {headerGroup.headers.map((header) => (
                <TableHead key={header.id} className="px-4 py-3 text-xs font-bold uppercase tracking-wider text-slate-600">
                  {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                </TableHead>
              ))}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {table.getRowModel().rows.length ? (
            table.getRowModel().rows.map((row) => (
              <TableRow key={row.id} className="border-slate-100 transition-colors hover:bg-slate-50/40">
                {row.getVisibleCells().map((cell) => (
                  <TableCell key={cell.id} className="px-4 py-3 text-slate-700">
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
            ))
          ) : (
            <TableRow className="hover:bg-transparent">
              <TableCell colSpan={columns.length} className="h-32 text-center text-slate-400">
                {emptyMessage}
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
