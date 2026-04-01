"use client";

import { ColumnDef } from "@tanstack/react-table";
import { UserRecord } from "@/types/user";
import { Badge } from "@/components/ui/badge";
import { getUserTypeLabel } from "@/constants/userTypes";
import { UserFormDialog } from "./UserFormDialog";
import { LicenseFormDialog } from "./LicenseFormDialog";
import { Calendar, Building2, Plus, StickyNote, ShieldCheck, Pencil, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";

export const columns: ColumnDef<UserRecord>[] = [
  {
    accessorKey: "user_name",
    header: "ユーザー",
    cell: ({ row }) => {
      const { user_name, email } = row.original;

      return (
        <div className="flex flex-col gap-0.5 py-1">
          <span className="text-sm font-bold text-slate-900 leading-tight">
            {user_name || "名称未設定"}
          </span>
          <span className="text-[10px] text-slate-400 font-medium tracking-tight truncate max-w-45">
            {email}
          </span>
        </div>
      );
    },
  },
  {
    accessorKey: "status",
    header: "",
    cell: ({ row }) => {
      const { last_sign_in_at, confirmed_at, user_id } = row.original;
      
      let statusBadge;
      if (last_sign_in_at) {
        statusBadge = (
          <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 h-5 px-1.5 text-[10px] font-bold shadow-sm whitespace-nowrap">
            アクティブ
          </Badge>
        );
      } else if (confirmed_at) {
        statusBadge = (
          <Badge variant="secondary" className="bg-blue-50 text-blue-600 border-blue-100 h-5 px-1.5 text-[10px] font-bold shadow-sm whitespace-nowrap">
            招待確認済
          </Badge>
        );
      } else {
        statusBadge = (
          <Badge className="bg-orange-50 text-orange-600 border-orange-200 h-5 px-1.5 text-[10px] font-black animate-pulse shadow-sm whitespace-nowrap">
            招待中
          </Badge>
        );
      };

      return (
        <div className="flex flex-col gap-1 items-start">
          {statusBadge}
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
    header: "ライセンス",
    cell: ({ row }) => {
      const user = row.original;
      const { plan_name, license_end_date } = user;
      
      return (
        <LicenseFormDialog user={user}>
          <div className="flex items-center gap-4 cursor-pointer group/lic py-2 w-fit">
            {/* 左側：プラン情報の塊 */}
            <div className="flex flex-col gap-0.5 min-w-30">
              {!plan_name ? (
                /* 未割当：点線バッジ（厚みあり） */
                <Button
                  variant="outline"
                  size="sm"
                  className="
                    h-7 px-2 text-[10px] border-dashed border-slate-300 
                    text-slate-400 hover:text-indigo-600 hover:border-indigo-200 
                    hover:bg-indigo-50 rounded-lg transition-all group/btn 
                    bg-transparent font-black shadow-none
                  "
                >
                  <ShieldAlert size={12} className="mr-1.5 opacity-70 group-hover/btn:text-indigo-500" />
                  <span className="mr-1.5">未設定</span>
                  <Plus 
                    size={12} 
                    strokeWidth={3} 
                    className="text-indigo-400 group-hover/btn:text-indigo-600 transition-colors" 
                  />
                </Button>
              ) : (
                /* 割当済み：プラン名 ＋ 期限 */
                <>
                  <div className="text-[11px] font-black text-slate-700 leading-tight max-w-35 truncate group-hover/lic:text-indigo-700 transition-colors">
                    {plan_name}
                  </div>
                  <div className="flex items-center gap-1 text-[10px] text-slate-400 transition-colors group-hover/lic:text-indigo-500">
                    <Calendar size={10} className="opacity-70" />
                    <span className="font-bold tracking-tight">
                      {license_end_date ? license_end_date.split('T')[0] : '無期限'}
                    </span>
                  </div>
                </>
              )}
            </div>

            {/* 右側：ペンシルボタン（割当済みのみ） */}
            {plan_name && (
              <div className="flex items-center justify-center w-6 h-6 rounded-xl bg-indigo-50 text-indigo-500 border border-indigo-100 shadow-sm transition-all duration-300 group-hover/lic:bg-indigo-600 group-hover/lic:text-white group-hover/lic:border-indigo-600 group-hover/lic:shadow-md group-hover/lic:scale-105">
                <Pencil size={14} strokeWidth={2.5} />
              </div>
            )}
          </div>
        </LicenseFormDialog>
      );
    },
  },
  {
    id: "actions",
    header: () => <div className="text-right px-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">操作</div>,
    cell: ({ row }) => (
      <div className="flex justify-end items-center gap-2 px-2">
        {/* ユーザー基本情報の編集 */}
        <UserFormDialog 
          mode="edit" 
          initialData={row.original} 
        />
      </div>
    ),
  },
];