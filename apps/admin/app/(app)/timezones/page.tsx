import { getTimezones } from "@/actions/adminTimezoneAction";
import { TimezoneDataTable } from "./_components/TimezoneDataTable";
import { TimezoneFormDialog } from "./_components/TimezoneFormDialog";

export default async function TimezonesPage() {
  const timezones = await getTimezones();

  return (
    <div className="p-6 space-y-6">
      {/* ヘッダー */}
      <div className="flex justify-between items-center">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold tracking-tight">タイムゾーン管理</h1>
          <p className="text-xs text-slate-500 mt-1">
            生徒・コーチ・管理者のプロフィールで選択可能なタイムゾーン（IANA準拠）を管理します
          </p>
        </div>
        <TimezoneFormDialog />
      </div>

      {/* 一覧テーブル */}
      <TimezoneDataTable data={timezones} />
    </div>
  );
}
