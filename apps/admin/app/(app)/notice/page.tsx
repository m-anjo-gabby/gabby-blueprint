// apps/admin/app/(app)/notice/page.tsx
import { getNotices } from "@/actions/adminNoticeAction";
import { NoticeDataTable } from "./_components/NoticeDataTable";

export default async function NoticePage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; q?: string; type?: string }>;
}) {
  const params = await searchParams;
  const currentPage = Number(params.page) || 1;
  const searchQuery = params.q || "";
  const noticeType = params.type || "ALL";
  const pageSize = 10;

  const { notices, totalCount } = await getNotices({
    page: currentPage,
    pageSize,
    searchQuery,
    noticeType,
  });

  const pageCount = Math.ceil(totalCount / pageSize);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-xl font-bold text-slate-800 tracking-tight">お知らせ管理</h1>
          <p className="text-[13px] text-slate-500 mt-1">
            アプリ内でお知らせする通知・キャンペーン・メンテナンス情報の管理を行います。
          </p>
        </div>
      </div>

      <NoticeDataTable
        data={notices || []}
        pageCount={pageCount}
        totalCount={totalCount}
      />
    </div>
  );
}
