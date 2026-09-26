import { getTranslations } from 'next-intl/server';
import { PageSkeleton, type PageSkeletonVariant } from '@gabby/lib/components/common/PageSkeleton';

/** loading.tsx 用の標準の骨組み（画面遷移中に即座に表示する） */
export async function RouteLoading({ variant }: { variant?: PageSkeletonVariant }) {
  const t = await getTranslations('common');
  return <PageSkeleton label={t('loading')} variant={variant} />;
}
