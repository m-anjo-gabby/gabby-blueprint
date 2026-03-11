"use client"

import { ColumnDef } from "@tanstack/react-table"
import { Client, UserRecord } from "@/types/user"
import { Badge } from "@/components/ui/badge"
import { getUserTypeLabel } from "@/constants/userTypes"
import { UserFormDialog } from "./UserFormDialog"
import { LicenseFormDialog } from "./LicenseFormDialog"
import { Calendar, Building2 } from "lucide-react"

export const createUserColumns = (clients: Client[]): ColumnDef<UserRecord>[] => [
  {
    accessorKey: "user_id",
    header: "ID",
    cell: ({ row }) => (
      <span className="text-xs font-mono text-slate-400">#{row.original.user_id}</span>
    ),
  },
  {
    accessorKey: "user_name",
    header: "ユーザー / アカウント状態",
    cell: ({ row }) => {
      const { user_name, email, last_sign_in_at, confirmed_at } = row.original;
      
      // アカウント状態の判定
      let statusBadge;
      if (last_sign_in_at) {
        statusBadge = (
          <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 h-5 px-1.5 text-[10px] font-bold shadow-sm">
            アクティブ
          </Badge>
        );
      } else if (confirmed_at) {
        statusBadge = (
          <Badge variant="secondary" className="bg-blue-50 text-blue-600 border-blue-100 h-5 px-1.5 text-[10px] font-bold shadow-sm">
            セットアップ済
          </Badge>
        );
      } else {
        statusBadge = (
          <Badge className="bg-orange-50 text-orange-600 border-orange-200 h-5 px-1.5 text-[10px] font-black animate-pulse shadow-sm">
            招待中
          </Badge>
        );
      }

      return (
      <div className="flex flex-col gap-1 py-1.5">
        {/* 1段目：氏名 */}
        <span className="text-sm font-bold text-slate-900 leading-tight">
          {user_name || "名称未設定"}
        </span>

        {/* 2段目：メールアドレス（テキスト情報をまとめる） */}
        <span className="text-[10px] text-slate-400 font-medium tracking-tight truncate max-w-[160px]">
          {email}
        </span>

        {/* 3段目：アカウント状態（行の土台として配置） */}
        <div className="flex items-center h-5 mt-0.5">
          {statusBadge}
        </div>
      </div>
      );
    },
  },
  {
    accessorKey: "client_name",
    header: "所属顧客",
    cell: ({ row }) => {
      const clientName = row.getValue("client_name") as string;
      return (
        <div className="flex items-center gap-1.5 text-slate-600">
          <Building2 size={13} className="text-slate-300" />
          <span className="text-xs font-medium">{clientName || "未所属"}</span>
        </div>
      );
    },
  },
  {
    accessorKey: "user_type",
    header: "区分",
    cell: ({ row }) => {
      const type = row.getValue("user_type") as string;
      // 権限タイプによって色分け（生徒=1, その他=0など想定）
      const isStudent = type === '1';
      return (
        <Badge 
          variant="outline" 
          className={`font-bold border-2 text-[10px] px-2 ${
            isStudent 
              ? 'text-indigo-600 border-indigo-100 bg-indigo-50/30' 
              : 'text-slate-500 border-slate-100 bg-slate-50'
          }`}
        >
          {getUserTypeLabel(type)}
        </Badge>
      );
    },
  },
  {
    accessorKey: "plan_name",
    header: "ライセンス状況",
    cell: ({ row }) => {
      const { plan_name, license_end_date } = row.original;
      
      if (!plan_name) {
        return <span className="text-[11px] text-slate-300 italic font-medium">ライセンスなし</span>;
      }

      return (
        <div className="flex flex-col gap-0.5">
          <span className="text-xs font-bold text-slate-700">{plan_name}</span>
          {license_end_date && (
            <div className="flex items-center gap-1 text-[10px] text-slate-400">
              <Calendar size={10} />
              <span>{license_end_date.split('T')[0]} まで</span>
            </div>
          )}
        </div>
      );
    },
  },
  {
    id: "actions",
    header: () => <div className="text-right px-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">操作</div>,
    cell: ({ row }) => {
      const user = row.original;
      return (
        <div className="flex justify-end items-center gap-2 px-2">
          {/* ライセンス管理（プラン変更・解除） */}
          <LicenseFormDialog user={user} />

          {/* ユーザー基本情報の編集 */}
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