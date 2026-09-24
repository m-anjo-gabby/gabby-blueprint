// apps/admin/app/(app)/dashboard/_components/DashboardHeader.tsx
import { getTranslations } from 'next-intl/server';

export default async function DashboardHeader() {
  const t = await getTranslations('dashboard');
  return (
    <div>
      <h1 className="text-xl font-bold text-slate-800">{t('title')}</h1>
      <p className="text-xs text-slate-500 mt-1">
        {t('subtitle')}
      </p>
    </div>
  );
}