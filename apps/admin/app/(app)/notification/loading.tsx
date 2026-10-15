import { getTranslations } from 'next-intl/server';
import { NotificationListSkeleton, NotificationPageLayout } from './_components/NotificationPageParts';

/** 通知の画面遷移中の骨組み（見出しは本物、件数と一覧だけ骨組み） */
export default async function Loading() {
  const t = await getTranslations('common');
  return (
    <div role="status" aria-busy aria-label={t('loading')} className="h-full">
      <NotificationPageLayout count={null}>
        <NotificationListSkeleton />
      </NotificationPageLayout>
    </div>
  );
}
