// apps/admin/app/(app)/notice/[id]/reads/page.tsx
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getNoticeReadStatus } from "@/actions/adminNoticeAction";
import { getClientsFilter } from "@/actions/adminClientAction";
import { NoticeReadStatusTable } from "./_components/NoticeReadStatusTable";

export default async function NoticeReadStatusPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ page?: string; clientId?: string; userType?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const currentPage = Number(sp.page) || 1;
  const clientId = sp.clientId || "";
  const userType = sp.userType || "";
  const pageSize = 10;

  const [{ notice, users, totalCount, readCount, unreadCount, pageCount }, clients] = await Promise.all([
    getNoticeReadStatus(id, { page: currentPage, pageSize, clientId, userType }),
    getClientsFilter(),
  ]);

  if (!notice) {
    return (
      <div className="space-y-4">
        <Link
          href="/notice"
          className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-indigo-600 transition-colors"
        >
          <ArrowLeft size={14} /> お知らせ一覧に戻る
        </Link>
        <p className="text-sm text-slate-500 font-bold">お知らせが見つかりません。</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/notice"
          className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-indigo-600 transition-colors mb-2"
        >
          <ArrowLeft size={14} /> お知らせ一覧に戻る
        </Link>
        <h1 className="text-xl font-bold text-slate-800 tracking-tight line-clamp-1">
          既読状況: {notice.title}
        </h1>
        <p className="text-[13px] text-slate-500 mt-1">
          このお知らせの配信対象ユーザーごとの既読・未読状況を確認できます。
        </p>
      </div>

      <NoticeReadStatusTable
        data={users}
        pageCount={pageCount}
        totalCount={totalCount}
        readCount={readCount}
        unreadCount={unreadCount}
        clients={clients}
      />
    </div>
  );
}
