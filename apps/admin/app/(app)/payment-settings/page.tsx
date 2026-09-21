import { getCompanyProfile, getSessionPayRate } from '@/actions/adminPaymentSettingsAction';
import { PaymentSettingsForm } from './_components/PaymentSettingsForm';

export default async function PaymentSettingsPage() {
  const [companyProfile, sessionPayRate] = await Promise.all([getCompanyProfile(), getSessionPayRate()]);

  if (!companyProfile || !sessionPayRate) {
    return (
      <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
        設定データの取得に失敗しました。DDL/DMLが反映されているかご確認ください。
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-800">支払い設定</h1>
        <p className="text-xs text-slate-500 mt-1">
          コーチ向け月次支払通知書(PDF)に使用する会社情報・セッション単価を管理します。
        </p>
      </div>

      <PaymentSettingsForm initialCompanyProfile={companyProfile} initialSessionPayRate={sessionPayRate} />
    </div>
  );
}
