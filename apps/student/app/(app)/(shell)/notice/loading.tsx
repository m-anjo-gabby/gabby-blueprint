import { RouteSkeleton } from '@/components/shell/RouteLoading';
import { NoticeListSkeleton, NoticePageHeader } from './_components/NoticeSkeleton';

export default function Loading() {
  return (
    <RouteSkeleton>
      <NoticePageHeader count={null} />
      <NoticeListSkeleton />
    </RouteSkeleton>
  );
}
