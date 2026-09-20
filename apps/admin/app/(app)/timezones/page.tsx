import { getTranslations } from 'next-intl/server';
import { getTimezones } from "@/actions/adminTimezoneAction";
import { TimezoneDataTable } from "./_components/TimezoneDataTable";
import { TimezoneFormDialog } from "./_components/TimezoneFormDialog";

export default async function TimezonesPage() {
  const t = await getTranslations('timezones.page');
  const timezones = await getTimezones();

  return (
    <div className="p-6 space-y-6">
      {/* ヘッダー */}
      <div className="flex justify-between items-center">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold tracking-tight">{t('title')}</h1>
          <p className="text-xs text-slate-500 mt-1">
            {t('subtitle')}
          </p>
        </div>
        <TimezoneFormDialog />
      </div>

      {/* 一覧テーブル */}
      <TimezoneDataTable data={timezones} />
    </div>
  );
}
