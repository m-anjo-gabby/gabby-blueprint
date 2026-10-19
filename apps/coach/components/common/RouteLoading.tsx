import { PageSkeleton, type PageSkeletonVariant } from '@gabby/lib/components/common/PageSkeleton';

/** loading.tsx 用の標準の骨組み（画面の移動中にすぐ出す） */
export function RouteLoading({ variant }: { variant?: PageSkeletonVariant }) {
  return <PageSkeleton label="Loading..." variant={variant} />;
}
