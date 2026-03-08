"use client"

import { ColumnDef } from "@tanstack/react-table"
import { Client, UserRecord } from "@/types/user"
import { Badge } from "@/components/ui/badge"
import { getUserTypeLabel } from "@/constants/userTypes"
import { UserFormDialog } from "./UserFormDialog"

export const createUserColumns = (clients: Client[]): ColumnDef<UserRecord>[] => [
  {
    accessorKey: "user_id",
    header: "ID",
  },
  {
    accessorKey: "user_name",
    header: "ユーザー情報",
    cell: ({ row }) => (
      <div className="flex flex-col">
        <span className="font-medium text-slate-900">{row.original.user_name}</span>
        <span className="text-xs text-slate-500">{row.original.email}</span>
      </div>
    ),
  },
  {
    accessorKey: "client_name",
    header: "所属顧客",
    cell: ({ row }) => row.getValue("client_name") || "-",
  },
  {
    accessorKey: "user_type",
    header: "タイプ",
    cell: ({ row }) => {
      const type = row.getValue("user_type") as string;
      return (
        <Badge variant={type === '0' ? 'default' : 'secondary'} className="font-medium">
          {getUserTypeLabel(type)}
        </Badge>
      );
    },
  },
  {
    accessorKey: "last_sign_in_at",
    header: "ステータス",
    cell: ({ row }) => {
      const lastSignIn = row.original.last_sign_in_at;
      const isActivated = !!lastSignIn;

      return (
        <div className="flex items-center gap-2">
          <div className={`h-2 w-2 rounded-full ${isActivated ? 'bg-emerald-500' : 'bg-orange-400 animate-pulse'}`} />
          <span className="text-xs font-medium text-slate-600">
            {isActivated ? "アクティブ" : "未招待/未完了"}
          </span>
        </div>
      );
    },
  },
  {
    id: "actions",
    cell: ({ row }) => (
      <div className="text-right">
        <UserFormDialog 
          mode="edit" 
          initialData={row.original} 
          clients={clients} 
        />
      </div>
    ),
  },
];