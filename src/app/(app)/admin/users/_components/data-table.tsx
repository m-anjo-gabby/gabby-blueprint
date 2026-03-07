"use client"

import {
  ColumnDef,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { useRouter, usePathname, useSearchParams } from "next/navigation"
import { Client } from "@/types/user"
import { useMemo } from "react"
import { createUserColumns } from "./columns"

interface DataTableProps<TData, TValue> {
  // columns prop を削除し、代わりに clients を受け取る
  data: TData[]
  pageCount: number
  clients: Client[] 
}

export function DataTable<TData, TValue>({
  data,
  pageCount,
  clients,
}: DataTableProps<TData, TValue>) {
  
// クライアントサイドでカラムを生成
  // TData を UserRecord として扱うために型キャストするか、
  // createUserColumns 側をジェネリックにする必要がありますが、
  // 今回は UserRecord 固定なので以下のように記述します。
  const columns = useMemo(() => 
    createUserColumns(clients) as ColumnDef<TData>[], 
    [clients]
  )

  const table = useReactTable({
    data,
    columns, // ここで internal な columns 変数を使用
    getCoreRowModel: getCoreRowModel(),
  })

  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const currentPage = Number(searchParams.get("page")) || 1

  // ページ移動処理（URLのクエリパラメータを更新）
  const handlePageChange = (newPage: number) => {
    const params = new URLSearchParams(searchParams)
    params.set("page", newPage.toString())
    router.push(`${pathname}?${params.toString()}`)
  }

  return (
    <div className="space-y-4">
      <div className="rounded-md border bg-white shadow-sm">
        <Table>
          <TableHeader className="bg-slate-50">
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id} className="font-semibold">
                    {flexRender(header.column.columnDef.header, header.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow key={row.id}>
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id} className="py-3">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-24 text-center text-slate-500">
                  該当するユーザーが見つかりませんでした。
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* ページネーションコントロール */}
      <div className="flex items-center justify-between px-2">
        <div className="text-sm text-slate-500">
           {currentPage} / {pageCount} ページ
        </div>
        <div className="flex items-center space-x-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => handlePageChange(currentPage - 1)}
            disabled={currentPage <= 1}
          >
            前へ
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => handlePageChange(currentPage + 1)}
            disabled={currentPage >= pageCount}
          >
            次へ
          </Button>
        </div>
      </div>
    </div>
  )
}