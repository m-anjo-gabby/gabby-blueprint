import { getTranslations } from 'next-intl/server';
import { RouteLoading } from '@/components/common/RouteLoading';
import { UsersRouteSkeletonSwitch } from './[id]/_components/PathSkeletonSwitch';
import { UserDetailPageSkeleton } from './[id]/_components/UserDetailSkeletons';

/** ユーザー管理の読み込み中表示（一覧 / 一覧から開いたユーザー詳細を表示中のパスで出し分ける） */
export default async function Loading() {
  const t = await getTranslations('common');
  return (
    <UsersRouteSkeletonSwitch
      list={<RouteLoading variant="table" />}
      detail={
        <div role="status" aria-busy aria-label={t('loading')}>
          <UserDetailPageSkeleton />
        </div>
      }
    />
  );
}
