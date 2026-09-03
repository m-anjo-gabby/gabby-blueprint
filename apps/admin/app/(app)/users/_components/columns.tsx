"use client";

import { ColumnDef } from "@tanstack/react-table";
import { Badge } from "@/components/ui/badge";
import { UserFormDialog } from "./UserFormDialog";
import { LicenseFormDialog } from "./LicenseFormDialog";
import { ImpersonateButton } from "./ImpersonateButton";
import { SprintProgressFormDialog } from "./SprintProgressFormDialog";
import { Calendar, Building2, Plus, StickyNote, ShieldCheck, Pencil, ShieldAlert, Rocket } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getUserTypeLabel, UserRecord, USER_TYPES } from "@gabby/types/user";
import { isBefore, startOfDay } from "date-fns";

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
      const { last_sign_in_at, confirmed_at, mail_sent_at, last_mail_error } = row.original;
      
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
      } else if (last_mail_error || (!mail_sent_at && !last_sign_in_at)) {
        // エラーメッセージがある、または送信記録がなくログインもしていない場合を「送信失敗」とみなす
        statusBadge = (
          <Badge 
            className="bg-rose-50 text-rose-600 border-rose-200 h-5 px-1.5 text-[10px] font-black shadow-sm whitespace-nowrap gap-1 cursor-help"
            title={last_mail_error || "招待メールが送信されていません"}
          >
            <ShieldAlert size={10} /> 送信失敗
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
      const { license_state, plan_name, license_end_date, user_type } = user;
      
      // 生徒(user_type === '1')のみを編集対象とする
      const isStudent = user_type === '1';
      // 💡 招待中のユーザー（まだ本登録が完了していない）にはライセンス割当を許可しない
      const isRegistered = !!user.last_sign_in_at || !!user.confirmed_at;
      const canAssign = isStudent && isRegistered;

      // 生徒以外は「対象外」や「空」として扱うためのUI
      if (!isStudent) {
        return <div className="text-[10px] text-slate-300 italic">対象外</div>;
      }

      const LicenseContent = (
        <div className={`flex items-center gap-4 ${canAssign ? 'cursor-pointer group/lic' : 'cursor-default'} py-2 w-fit`}>
          {/* 左側：プラン情報 */}
          <div className="flex flex-col gap-0.5 min-w-30">
            {license_state === 'none' ? (
              <Button variant="outline" size="sm" className="h-7 px-2 text-[10px] border-dashed border-slate-300 text-slate-400">
                <ShieldAlert size={12} className="mr-1.5" /> 未設定
              </Button>
            ) : (
              <>
                <div className={`flex items-center gap-1`}>
                  <div className={`text-[11px] font-black truncate transition-colors ${
                    license_state === 'active' ? 'text-slate-700 group-hover/lic:text-indigo-600' :
                    license_state === 'future' ? 'text-blue-600' : 'text-rose-500'
                  }`}>
                    {plan_name}
                  </div>
                  {license_state === 'future' && <span className="text-[9px] text-blue-400 font-bold">[開始待ち]</span>}
                  {license_state === 'expired' && <span className="text-[9px] text-rose-400 font-bold">[期限切れ]</span>}
                </div>
                
                <div className="flex items-center gap-1 text-[10px] text-slate-400">
                  <Calendar size={10} />
                  <span>{license_end_date ? license_end_date.split('T')[0] : ''}</span>
                </div>
              </>
            )}
          </div>

          {/* 生徒のみペンシルを表示 */}
          {canAssign && (
            <div className="flex items-center justify-center w-6 h-6 rounded-xl bg-indigo-50 text-indigo-500 border border-indigo-100 shadow-sm transition-all duration-300 group-hover/lic:bg-indigo-600 group-hover/lic:text-white group-hover/lic:border-indigo-600 group-hover/lic:shadow-md group-hover/lic:scale-105">
              <Pencil size={14} strokeWidth={2.5} />
            </div>
          )}
        </div>
      );

      // 生徒の場合のみダイアログをラップ
      return canAssign ? <LicenseFormDialog user={user}>{LicenseContent}</LicenseFormDialog> : LicenseContent;
    },
  },
  {
    id: "actions",
    header: () => <div className="text-right px-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">操作</div>,
    cell: ({ row }) => {
      const user = row.original;
      // 本登録済み（招待中ではない）の生徒・コーチのみ代理ログイン対象とする（管理者は対象外）
      const isImpersonatableType = user.user_type === USER_TYPES.STUDENT || user.user_type === USER_TYPES.COACH;
      const isRegistered = !!user.last_sign_in_at || !!user.confirmed_at;
      const canImpersonate = isImpersonatableType && isRegistered;
      const isStudent = user.user_type === USER_TYPES.STUDENT;

      return (
        <div className="flex justify-end items-center gap-2 px-2">
          {/* 障害対応・問合せ調査用の代理ログイン */}
          {canImpersonate && <ImpersonateButton user={user} />}

          {/* 生徒のスプリントステージ・レベル管理（コーチの誤操作補正も含め、上げ下げ両方に対応） */}
          {isStudent && (
            <SprintProgressFormDialog user={user}>
              <Button variant="outline" size="sm" className="h-8 px-3 gap-1.5 border-slate-200 text-slate-600 hover:bg-slate-50 transition-all">
                <Rocket size={14} /> ステージ
              </Button>
            </SprintProgressFormDialog>
          )}

          {/* ユーザー基本情報の編集 */}
          <UserFormDialog
            mode="edit"
            initialData={user}
          />
        </div>
      );
    },
  },
];