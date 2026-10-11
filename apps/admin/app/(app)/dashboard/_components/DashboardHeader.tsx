// apps/admin/app/(app)/dashboard/_components/DashboardHeader.tsx
import { getTranslations } from 'next-intl/server';
import { PageHeader } from '@/components/common/PageHeader';

export default async function DashboardHeader() {
  const t = await getTranslations('dashboard');
  return <PageHeader title={t('title')} description={t('subtitle')} />;
}