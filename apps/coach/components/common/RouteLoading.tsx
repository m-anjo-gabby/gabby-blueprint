import { PageSkeleton, type PageSkeletonVariant } from '@gabby/lib/components/common/PageSkeleton';

/** Standard skeleton for loading.tsx (shown immediately while navigating) */
export function RouteLoading({ variant }: { variant?: PageSkeletonVariant }) {
  return <PageSkeleton label="Loading..." variant={variant} />;
}
