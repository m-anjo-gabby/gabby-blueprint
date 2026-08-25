'use client';

import * as React from 'react';
import Link from 'next/link';
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
import { ChevronLeft, ChevronRight, Search, X, Trash2, Users } from 'lucide-react';
import { CalendarEventItem, CALENDAR_EVENT_TYPES } from '@gabby/types/calendarEvent';
import { formatDateTimeByZone } from '@gabby/lib/date/date';
import { CalendarEventFormDialog } from './CalendarEventFormDialog';
import { deleteCalendarEvent } from '@/actions/adminCalendarEventAction';
import { useToast } from '@gabby/lib/hooks/useToast';
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
} from '@/components/ui/alert-dialog';

interface CalendarEventDataTableProps {
  data: CalendarEventItem[];
}

export function CalendarEventDataTable({ data }: CalendarEventDataTableProps) {
  const { showToast } = useToast();
  const [globalFilter, setGlobalFilter] = React.useState('');

  const handleDelete = async (calendarEventId: string) => {
    const result = await deleteCalendarEvent(calendarEventId);
    if (result.success) {
      showToast('カレンダーイベントを削除しました', 'success');
    } else {
      showToast(result.message || '削除に失敗しました', 'error');
    }
  };

  const columns = React.useMemo<ColumnDef<CalendarEventItem>[]>(
    () => [
      {
        accessorKey: 'event_type',
        header: '種別',
        cell: ({ row }) => {
          const badge = CALENDAR_EVENT_TYPES[row.original.event_type];
          return (
            <span className={`text-[10px] font-black uppercase tracking-wider px-2 py-1 rounded-md border ${badge.badgeClass}`}>
              {badge.label}
            </span>
          );
        },
      },
      {
        accessorKey: 'title',
        header: 'タイトル',
        cell: ({ row }) => <span className="font-bold text-slate-700">{row.original.title}</span>,
      },
      {
        accessorKey: 'start_datetime',
        header: '開始日時',
        cell: ({ row }) => (
          <span className="text-slate-600">{formatDateTimeByZone(row.original.start_datetime, 'Asia/Tokyo', false)}</span>
        ),
      },
      {
        id: 'coaches',
        header: '担当コーチ',
        cell: ({ row }) => {
          const coaches = row.original.coaches ?? [];
          if (coaches.length === 0) return <span className="text-slate-300">-</span>;
          return (
            <span className="text-xs text-slate-600">{coaches.map((c) => c.user_name || '(名称未設定)').join(', ')}</span>
          );
        },
      },
      {
        accessorKey: 'is_published',
        header: '公開状態',
        cell: ({ row }) =>
          row.original.is_published ? (
            <span className="text-[10px] font-black uppercase tracking-wider px-2 py-1 rounded-md border bg-emerald-50 text-emerald-700 border-emerald-100">
              公開中
            </span>
          ) : (
            <span className="text-[10px] font-black uppercase tracking-wider px-2 py-1 rounded-md border bg-slate-100 text-slate-500 border-slate-200">
              下書き
            </span>
          ),
      },
      {
        id: 'actions',
        header: () => <div className="text-right">操作</div>,
        cell: ({ row }) => (
          <div className="flex justify-end gap-2">
            {(row.original.rsvp_enabled || (row.original.coaches?.length ?? 0) > 0) && (
              <Link
                href={`/calendar-events/${row.original.calendar_event_id}/participants`}
                className="p-2 rounded-xl text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 transition-all active:scale-95"
                title="参加者・アナウンスを管理"
              >
                <Users size={15} />
              </Link>
            )}

            <CalendarEventFormDialog mode="edit" initialData={row.original} />

            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-slate-400 hover:text-rose-600 hover:bg-rose-50">
                  <Trash2 size={14} />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle className="font-black">カレンダーイベントの削除</AlertDialogTitle>
                  <AlertDialogDescription>
                    「<span className="font-bold text-slate-900">{row.original.title}</span>」を削除してもよろしいですか？
                    <br />
                    削除後は生徒/コーチのカレンダーから表示されなくなります。
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel className="rounded-xl font-bold">キャンセル</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => handleDelete(row.original.calendar_event_id)}
                    className="bg-rose-600 hover:bg-rose-700 rounded-xl font-bold"
                  >
                    削除する
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        ),
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
    <div className="space-y-0">
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 px-4 py-3 bg-slate-50/80 rounded-t-lg border-x border-t border-slate-200">
        <div className="flex items-center gap-2 w-full max-w-md">
          <div className="relative flex-1 group">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 group-focus-within:text-slate-600 transition-colors" />
            <Input
              placeholder="タイトルで検索..."
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
                  カレンダーイベントが見つかりませんでした。
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
