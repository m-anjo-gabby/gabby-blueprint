// apps/admin/app/(app)/notice/[id]/reads/page.tsx
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getTranslations } from 'next-intl/server';
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
  const t = await getTranslations('notice.readsPage');
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
          <ArrowLeft size={14} /> {t('backToList')}
        </Link>
        <p className="text-sm text-slate-500 font-bold">{t('notFound')}</p>
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
          <ArrowLeft size={14} /> {t('backToList')}
        </Link>
        <h1 className="text-xl font-bold text-slate-800 tracking-tight line-clamp-1">
          {t('readStatusTitle', { title: notice.title })}
        </h1>
        <p className="text-[13px] text-slate-500 mt-1">
          {t('subtitle')}
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
