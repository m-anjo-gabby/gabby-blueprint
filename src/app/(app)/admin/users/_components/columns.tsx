"use client"

import { ColumnDef } from "@tanstack/react-table"
import { Client, UserRecord } from "@/types/user"
import { Badge } from "@/components/ui/badge"
import { getUserTypeLabel } from "@/constants/userTypes"
import { UserFormDialog } from "./UserFormDialog"
import { LicenseFormDialog } from "./LicenseFormDialog"

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
      const { last_sign_in_at, confirmed_at } = row.original;
      
      // 1. アクティブ（ログイン済み）
      if (last_sign_in_at) {
        return (
          <div className="flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-emerald-500" />
            <span className="text-xs font-medium text-slate-700">アクティブ</span>
          </div>
        );
      }

      // 2. 招待承諾済み・未ログイン（パスワード設定は終わっているが、まだ入っていない）
      if (confirmed_at) {
        return (
          <div className="flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-blue-400" />
            <span className="text-xs font-medium text-slate-600">セットアップ済</span>
          </div>
        );
      }

      // 3. 招待中（未完了）
      return (
        <div className="flex items-center gap-2">
          <div className="h-2 w-2 rounded-full bg-orange-400 animate-pulse" />
          <span className="text-xs font-bold text-orange-600 uppercase tracking-tighter">メール確認待ち</span>
        </div>
      );
    },
  },
  {
    id: "actions",
    header: () => <div className="text-right">操作</div>,
    cell: ({ row }) => {
      const user = row.original;
      return (
        <div className="flex justify-end items-center gap-2">
          {/* 1. ライセンス管理（期間延長・プラン変更・解除） */}
          <LicenseFormDialog user={user} />

          {/* 2. ユーザー基本情報の編集 */}
          <UserFormDialog 
            mode="edit" 
            initialData={user} 
            clients={clients} 
          />
        </div>
      );
    },
  },
];