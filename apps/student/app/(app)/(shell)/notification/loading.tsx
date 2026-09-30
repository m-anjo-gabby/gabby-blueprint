import { RouteSkeleton } from '@/components/shell/RouteLoading';
import { NotificationListSkeleton, NotificationPageHeader } from './_components/NotificationSkeleton';

export default function Loading() {
  return (
    <RouteSkeleton>
      <NotificationPageHeader count={null} />
      <NotificationListSkeleton />
    </RouteSkeleton>
  );
}
