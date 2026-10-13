import { getTranslations } from 'next-intl/server';
import { UserDetailTabSkeletons } from './_components/UserDetailSkeletons';

/** タブを切り替えた時の読み込み中表示（見出し・タブは layout の本物のまま、中身だけ骨組み） */
export default async function Loading() {
  const t = await getTranslations('common');
  return (
    <div role="status" aria-busy aria-label={t('loading')}>
      <UserDetailTabSkeletons />
    </div>
  );
}
