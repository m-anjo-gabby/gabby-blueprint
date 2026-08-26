'use client';

import * as React from 'react';
import {
  ColumnDef,
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  getFilteredRowModel,
  useReactTable,
} from '@tanstack/react-table';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ChevronLeft, ChevronRight, Search, X } from 'lucide-react';
import { getUserTypeLabel } from '@gabby/types/user';
import { formatDateTimeByZone } from '@gabby/lib/date/date';
import { CalendarEventParticipant } from '@/actions/adminCalendarEventAction';

interface CalendarEventParticipantsTableProps {
  data: CalendarEventParticipant[];
  totalCount: number;
}

export function CalendarEventParticipantsTable({ data, totalCount }: CalendarEventParticipantsTableProps) {
  const [globalFilter, setGlobalFilter] = React.useState('');

  const columns = React.useMemo<ColumnDef<CalendarEventParticipant>[]>(
    () => [
      {
        accessorKey: 'user_name',
        header: '氏名',
        cell: ({ row }) => <span className="font-bold text-slate-700">{row.original.user_name || '(不明)'}</span>,
      },
      {
        accessorKey: 'user_type',
        header: '種別',
        cell: ({ row }) => <span className="text-slate-600">{getUserTypeLabel(row.original.user_type)}</span>,
      },
      {
        accessorKey: 'insert_date',
        header: '参加登録日時',
        cell: ({ row }) => <span className="text-slate-500">{formatDateTimeByZone(row.original.insert_date)}</span>,
      },
    ],
    []
  );

  const table = useReactTable({
    data,
    columns,
    state: { globalFilter },
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    initialState: {
      pagination: { pageSize: 10 },
    },
  });

  return (
    <div className="space-y-4">
      <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm w-fit">
        <p className="text-[10px] font-black uppercase tracking-widest text-emerald-500">参加人数</p>
        <p className="text-2xl font-black text-slate-800 mt-1">{totalCount}</p>
      </div>

      <div className="space-y-0">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 px-4 py-3 bg-slate-50/80 rounded-t-lg border-x border-t border-slate-200">
          <div className="flex items-center gap-2 w-full max-w-md">
            <div className="relative flex-1 group">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 group-focus-within:text-slate-600 transition-colors" />
              <Input
                placeholder="氏名で検索..."
                value={globalFilter ?? ''}
                onChange={(e) => setGlobalFilter(e.target.value)}
                className="pl-10 pr-10 h-9 bg-white border-slate-200 focus-visible:ring-1 focus-visible:ring-slate-400 shadow-sm"
              />
              {globalFilter && (
                <button
                  onClick={() => setGlobalFilter('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                  type="button"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="hidden md:block text-[13px] text-slate-500 whitespace-nowrap font-medium">
              全 <span className="text-slate-900">{table.getFilteredRowModel().rows.length}</span> 件
            </div>

            <div className="flex items-center bg-white border border-slate-200 rounded-md p-0.5 shadow-sm">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => table.previousPage()}
                disabled={!table.getCanPreviousPage()}
                className="h-8 w-8 p-0 hover:bg-slate-100 disabled:opacity-30"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>

              <div className="flex items-center px-3 text-[13px] font-medium border-x border-slate-100 min-w-[4rem] justify-center text-slate-600">
                <span>{table.getState().pagination.pageIndex + 1}</span>
                <span className="mx-1 text-slate-300">/</span>
                <span>{table.getPageCount() || 1}</span>
              </div>

              <Button
                variant="ghost"
                size="sm"
                onClick={() => table.nextPage()}
                disabled={!table.getCanNextPage()}
                className="h-8 w-8 p-0 hover:bg-slate-100 disabled:opacity-30"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>

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
                  <TableRow key={row.id} className="hover:bg-slate-50/40 transition-colors border-slate-100">
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
                    参加者がまだいません。
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
