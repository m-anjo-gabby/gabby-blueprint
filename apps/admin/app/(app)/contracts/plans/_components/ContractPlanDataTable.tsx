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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ChevronLeft, ChevronRight, Search, X, Trash2 } from 'lucide-react';
import { ContractPlan } from '@gabby/types/contract';
import { ContractPlanFormDialog } from './ContractPlanFormDialog';
import { deleteContractPlan } from '@/actions/adminContractAction';
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

interface ContractPlanDataTableProps {
  data: ContractPlan[];
}

export function ContractPlanDataTable({ data }: ContractPlanDataTableProps) {
  const { showToast } = useToast();
  const [globalFilter, setGlobalFilter] = React.useState('');

  const handleDelete = async (planId: string) => {
    const result = await deleteContractPlan(planId);
    if (result.success) {
      showToast('プランを削除しました', 'success');
    } else {
      showToast(result.message || '削除に失敗しました', 'error');
    }
  };

  const columns = React.useMemo<ColumnDef<ContractPlan>[]>(() => [
    {
      accessorKey: 'sort_no',
      header: 'SEQ',
      cell: ({ row }) => <span className="font-mono text-slate-500">{row.original.sort_no}</span>,
    },
    {
      accessorKey: 'plan_name',
      header: 'プラン名',
      cell: ({ row }) => (
        <div className="flex flex-col">
          <span className="font-bold text-slate-700">{row.original.plan_name}</span>
          <span className="text-[11px] text-slate-400">{row.original.plan_name_en}</span>
        </div>
      ),
    },
    {
      accessorKey: 'contract_type',
      header: '構成',
      cell: ({ row }) => {
        const plan = row.original;
        return (
          <div className="flex flex-wrap gap-1.5">
            {plan.contract_type === 1 ? (
              <Badge variant="outline" className="bg-slate-100 text-slate-600 border-slate-200 text-[10px] font-bold">
                コーチ無し
              </Badge>
            ) : (
              <>
                <Badge className="bg-indigo-100 text-indigo-700 border-indigo-200 hover:bg-indigo-100 text-[10px] font-bold">
                  週{plan.weekly_frequency}回・全{plan.total_sessions}回
                </Badge>
                {plan.has_dialogue_practice && (
                  <Badge className="bg-purple-100 text-purple-700 border-purple-200 hover:bg-purple-100 text-[10px] font-bold">
                    ダイアログプラクティス
                  </Badge>
                )}
              </>
            )}
          </div>
        );
      },
    },
    {
      accessorKey: 'period_months',
      header: '標準期間',
      cell: ({ row }) => <span className="text-slate-600">{row.original.period_months}か月</span>,
    },
    {
      accessorKey: 'plan_code',
      header: 'プランコード',
      cell: ({ row }) => <span className="text-[10px] text-slate-400 font-mono">{row.original.plan_code}</span>,
    },
    {
      id: 'actions',
      header: () => <div className="text-right">操作</div>,
      cell: ({ row }) => (
        <div className="flex justify-end gap-2">
          <ContractPlanFormDialog mode="edit" initialData={row.original} />

          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-slate-400 hover:text-rose-600 hover:bg-rose-50">
                <Trash2 size={14} />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle className="font-black">プランの削除</AlertDialogTitle>
                <AlertDialogDescription>
                  プラン「<span className="font-bold text-slate-900">{row.original.plan_name}</span>」を削除してもよろしいですか？<br />
                  既にこのプランを選択して作成された契約には影響しません（選択肢から消えるのみです）。
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel className="rounded-xl font-bold">キャンセル</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => handleDelete(row.original.plan_id)}
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
  ], []);

  const table = useReactTable({
    data,
    columns,
    state: {
      globalFilter,
    },
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    initialState: {
      pagination: {
        pageSize: 10,
      },
    },
  });

  return (
    <div className="space-y-0">
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 px-4 py-3 bg-slate-50/80 rounded-t-lg border-x border-t border-slate-200">
        <div className="flex items-center gap-2 w-full max-w-md">
          <div className="relative flex-1 group">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 group-focus-within:text-slate-600 transition-colors" />
            <Input
              placeholder="プラン名、コードで検索..."
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
                  プランデータが見つかりませんでした。
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
