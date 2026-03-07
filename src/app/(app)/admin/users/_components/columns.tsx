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