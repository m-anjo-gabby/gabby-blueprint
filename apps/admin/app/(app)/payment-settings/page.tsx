import { getTranslations } from 'next-intl/server';
import { getSessionPayRate } from '@/actions/adminPaymentSettingsAction';
import { PageHeader } from '@/components/common/PageHeader';
import { PaymentSettingsForm } from './_components/PaymentSettingsForm';

export default async function PaymentSettingsPage() {
  const t = await getTranslations('paymentSettings');
  const sessionPayRate = await getSessionPayRate();

  if (!sessionPayRate) {
    return (
      <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
        {t('fetchFailed')}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader title={t('title')} description={t('subtitle')} />

      <PaymentSettingsForm initialSessionPayRate={sessionPayRate} />
    </div>
  );
}
