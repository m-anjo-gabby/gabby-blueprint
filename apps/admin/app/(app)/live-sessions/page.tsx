import { getClientsFilter } from '@/actions/adminClientAction';
import { LiveSessionManagementView } from './_components/LiveSessionManagementView';

export default async function LiveSessionsPage() {
  const clients = await getClientsFilter();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-800">ライブセッション管理</h1>
        <p className="text-xs text-slate-500 mt-1">
          顧客・生徒を選択して予約状況を確認し、必要に応じて担当コーチの交代を行います
        </p>
      </div>

      <LiveSessionManagementView clients={clients} />
    </div>
  );
}
