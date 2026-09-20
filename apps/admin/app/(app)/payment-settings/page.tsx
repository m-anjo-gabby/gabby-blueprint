import { getTranslations } from 'next-intl/server';
import { getCompanyProfile, getSessionPayRate } from '@/actions/adminPaymentSettingsAction';
import { PaymentSettingsForm } from './_components/PaymentSettingsForm';

export default async function PaymentSettingsPage() {
  const t = await getTranslations('paymentSettings');
  const [companyProfile, sessionPayRate] = await Promise.all([getCompanyProfile(), getSessionPayRate()]);

  if (!companyProfile || !sessionPayRate) {
    return (
      <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
        {t('fetchFailed')}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-800">{t('title')}</h1>
        <p className="text-xs text-slate-500 mt-1">
          {t('subtitle')}
        </p>
      </div>

      <PaymentSettingsForm initialCompanyProfile={companyProfile} initialSessionPayRate={sessionPayRate} />
    </div>
  );
}
