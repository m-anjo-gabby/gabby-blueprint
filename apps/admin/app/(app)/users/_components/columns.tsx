"use client";

import Link from "next/link";
import { ColumnDef } from "@tanstack/react-table";
import type { useTranslations } from "next-intl";
import { Building2, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { UserRecord, USER_TYPES } from "@gabby/types/user";
import { LicenseFormDialog } from "./LicenseFormDialog";
import { ImpersonateButton } from "./ImpersonateButton";
import { LicenseSummary } from "./LicenseSummary";
import { UserStatusBadge, UserTypeBadge } from "./UserBadges";
import { canImpersonateUser, isRegisteredUser } from "../_lib/userSchema";
import { getUserDetailPath } from "../[id]/_lib/tabs";

type TableT = ReturnType<typeof useTranslations<'users.table'>>;

/**
 * ユーザー一覧の列。行の操作は「代理ログイン」と「編集（詳細画面へ）」だけにし、
 * 生徒のスプリント・コーチの専門などの設定は詳細画面のタブで行う。
 * ライセンスの割当は件数が多いため、一覧のライセンス欄から直接ダイアログで行う。
 */
export function createColumns(t: TableT): ColumnDef<UserRecord>[] {
  return [
  {
    accessorKey: "user_name",
    header: t('user'),
    cell: ({ row }) => {
      const user = row.original;
      return (
        <div className="flex w-56 flex-col gap-0.5 py-1 xl:w-64">
          <div className="flex min-w-0 items-center gap-2">
            <Link
              href={getUserDetailPath(user.id)}
              title={user.user_name ?? undefined}
              className="min-w-0 truncate text-sm font-bold leading-tight text-slate-900 hover:text-brand hover:underline"
            >
              {user.user_name || t('unnamed')}
            </Link>
            <UserStatusBadge user={user} />
          </div>
          <span className="truncate text-[11px] text-slate-400" title={user.email}>
            {user.email}
          </span>
          {/* 所属顧客の列を隠す狭い画面では、ここに出す */}
          <span className="flex min-w-0 items-center gap-1 text-[11px] text-slate-500 xl:hidden" title={user.client_name ?? undefined}>
            <Building2 size={11} className="shrink-0 text-slate-300" />
            <span className="truncate">{user.client_name || t('noClient')}</span>
          </span>
        </div>
      );
    },
  },
  {
    accessorKey: "client_name",
    header: t('client'),
    meta: { className: "hidden xl:table-cell" },
    cell: ({ row }) => {
      const clientName = row.original.client_name;
      return (
        <div className="flex items-center gap-1.5 text-slate-600">
          <Building2 size={13} className="shrink-0 text-slate-300" />
          <span className="max-w-40 truncate text-xs font-medium" title={clientName ?? undefined}>
            {clientName || t('noClient')}
          </span>
        </div>
      );
    },
  },
  {
    accessorKey: "user_type",
    header: t('userType'),
    cell: ({ row }) => <UserTypeBadge userType={row.original.user_type} />,
  },
  {
    accessorKey: "contract_name",
    header: t('license'),
    cell: ({ row }) => {
      const user = row.original;
      if (user.user_type !== USER_TYPES.STUDENT) {
        return <span className="whitespace-nowrap text-[11px] text-slate-300">{t('notApplicable')}</span>;
      }

      // 招待中（本登録前）の生徒にはライセンスを割り当てない
      if (!isRegisteredUser(user)) return <LicenseSummary user={user} compact />;

      return (
        <LicenseFormDialog user={user}>
          <button
            type="button"
            className="group/lic flex w-fit max-w-60 items-center gap-3 rounded-md py-1 text-left"
          >
            <LicenseSummary user={user} compact />
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border border-brand-100 bg-brand-50 text-brand-500 transition-colors group-hover/lic:border-brand group-hover/lic:bg-brand group-hover/lic:text-white">
              <Pencil size={13} strokeWidth={2.5} />
            </span>
          </button>
        </LicenseFormDialog>
      );
    },
  },
  {
    id: "actions",
    header: () => <div className="text-right">{t('actions')}</div>,
    cell: ({ row }) => {
      const user = row.original;
      return (
        <div className="flex items-center justify-end gap-2 whitespace-nowrap">
          {canImpersonateUser(user) && <ImpersonateButton user={user} compact />}
          <Button asChild variant="outline" size="sm" className="h-8 gap-1.5 border-slate-200 px-3 text-slate-600 hover:bg-slate-50">
            <Link href={getUserDetailPath(user.id)}>
              <Pencil size={14} /> {t('editButton')}
            </Link>
          </Button>
        </div>
      );
    },
  },
  ];
}
