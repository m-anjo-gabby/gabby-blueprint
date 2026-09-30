import type { ReactNode } from 'react';
import { Bell } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { PageHeader, PageSkeletonFrame } from './PageHeader';

/*
 * お知らせ・通知の画面（見出し＋件数バッジ＋一覧）の共通部品。画面と読み込み中の骨組み（loading.tsx）で共有する。
 */

export const INBOX_PAGES = {
  notice: { title: 'Notices', description: 'Announcements and updates from the Gabby Blueprint team.' },
  notification: { title: 'Notifications', description: 'Your training and messaging activity.' },
} as const;

type InboxPage = keyof typeof INBOX_PAGES;

/** 件数バッジ（count が null の間は数字を骨組みにする） */
function ItemCountBadge({ count }: { count: number | null }) {
  return (
    <div className="text-[10px] font-black text-brand uppercase tracking-widest bg-brand-50 px-3 py-1.5 rounded-xl border border-brand-100 flex items-center gap-1.5 shrink-0">
      <Bell size={10} />
      {count === null ? <Skeleton className="h-2.5 w-3" /> : count} <span className="opacity-60 ml-0.5">Items</span>
    </div>
  );
}

/** 画面の外枠（見出し＋一覧の領域） */
export function InboxPageLayout({ page, count, children }: { page: InboxPage; count: number | null; children: ReactNode }) {
  const { title, description } = INBOX_PAGES[page];
  return (
    <div className="space-y-6 h-full flex flex-col">
      <PageHeader title={title} description={description} aside={<ItemCountBadge count={count} />} />
      <div className="flex-1 min-h-0 overflow-y-auto space-y-3 max-w-2xl">{children}</div>
    </div>
  );
}

/** 一覧の骨組み（閉じたカード4件分。画面を開いた後の取得中と loading.tsx で共有する） */
export function InboxListSkeleton() {
  return (
    <div aria-hidden className="space-y-3">
      {Array.from({ length: 4 }, (_, i) => (
        <Skeleton key={i} className="h-21 w-full rounded-2xl" />
      ))}
    </div>
  );
}

/** お知らせ・通知の画面遷移中の骨組み（loading.tsx 用） */
export function InboxPageSkeleton({ page }: { page: InboxPage }) {
  return (
    <PageSkeletonFrame className="h-full">
      <InboxPageLayout page={page} count={null}>
        <InboxListSkeleton />
      </InboxPageLayout>
    </PageSkeletonFrame>
  );
}
