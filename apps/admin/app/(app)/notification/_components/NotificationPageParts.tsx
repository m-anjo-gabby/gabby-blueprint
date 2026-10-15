import type { ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { Bell } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { PageHeader } from '@/components/common/PageHeader';

/*
 * 通知の画面（見出し＋件数バッジ＋一覧）の部品。画面と読み込み中の骨組み（loading.tsx）で共有する。
 * サーバー・クライアントのどちらの部品からも使えるよう、フックは next-intl の useTranslations だけを使う。
 */

/** 件数バッジ（count が null の間は数字を骨組みにする） */
function ItemCountBadge({ count }: { count: number | null }) {
  const t = useTranslations('notification');
  return (
    <div className="flex shrink-0 items-center gap-1.5 rounded-xl border border-brand-100 bg-brand-50 px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-brand">
      <Bell size={10} />
      {count === null ? <Skeleton className="h-2.5 w-3" /> : count} <span className="ml-0.5 opacity-60">{t('itemsLabel')}</span>
    </div>
  );
}

/** 画面の外枠（見出し＋一覧の領域） */
export function NotificationPageLayout({ count, children }: { count: number | null; children: ReactNode }) {
  const t = useTranslations('notification');
  return (
    <div className="flex h-full flex-col space-y-6">
      <PageHeader title={t('title')} description={t('subtitle')} actions={<ItemCountBadge count={count} />} />
      <div className="max-w-2xl flex-1 space-y-3 overflow-y-auto min-h-0">{children}</div>
    </div>
  );
}

/** 一覧の骨組み（閉じたカード4件分。画面を開いた後の取得中と loading.tsx で共有する） */
export function NotificationListSkeleton() {
  return (
    <div aria-hidden className="space-y-3">
      {Array.from({ length: 4 }, (_, i) => (
        <Skeleton key={i} className="h-25 w-full rounded-2xl" />
      ))}
    </div>
  );
}
