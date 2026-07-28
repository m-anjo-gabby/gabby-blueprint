// apps/admin/app/(app)/notice/[id]/edit/page.tsx
import { getNoticeById } from "@/actions/adminNoticeAction";
import { NoticeEditor } from "../../_components/NoticeEditor";
import { notFound } from "next/navigation";

export default async function NoticeEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  let notice;
  try {
    notice = await getNoticeById(id);
    if (!notice) {
      notFound();
    }
  } catch (error) {
    console.error("Failed to load notice data:", error);
    return (
      <div className="flex flex-col items-center justify-center h-[calc(100vh-120px)] text-rose-600">
        <p className="font-bold text-sm">お知らせデータの読み込みに失敗しました。</p>
        <p className="text-xs text-slate-500 mt-2">時間をおいて再度お試しください。</p>
      </div>
    );
  }

  return (
    <NoticeEditor
      mode="edit"
      initialData={{
        notice_id: notice.notice_id,
        target_type: notice.target_type,
        client_id: notice.client_id,
        notice_type: notice.notice_type,
        is_important: notice.is_important,
        show_dialog: notice.show_dialog,
        title: notice.title,
        content: notice.content,
        attachments: notice.attachments || [],
        published_at: notice.published_at,
        expired_at: notice.expired_at,
        is_published: notice.is_published,
      }}
    />
  );
}
