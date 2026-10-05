'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@gabby/lib/hooks/useToast';
import { updateSessionPayRate } from '@/actions/adminPaymentSettingsAction';
import { SessionPayRate } from '@gabby/types/monthlyReport';

export function PaymentSettingsForm({ initialSessionPayRate }: { initialSessionPayRate: SessionPayRate }) {
  const t = useTranslations('paymentSettings');
  const { showToast } = useToast();
  const [sessionPayRate, setSessionPayRate] = useState(initialSessionPayRate);
  const [isSavingRate, setIsSavingRate] = useState(false);

  const handleSaveRate = async () => {
    setIsSavingRate(true);
    const result = await updateSessionPayRate(sessionPayRate);
    setIsSavingRate(false);
    showToast(result.success ? t('toastRateUpdated') : result.message, result.success ? 'success' : 'error');
  };

  return (
    <div className="space-y-6 max-w-xl">
      <div className="rounded-lg border border-slate-200 bg-white p-4 space-y-4">
        <h2 className="text-sm font-bold text-slate-800">{t('sessionRateTitle')}</h2>
        <p className="text-xs text-slate-500">
          {t('sessionRateDesc')}
        </p>

        <div className="flex gap-4">
          <div className="space-y-1.5 flex-1">
            <Label htmlFor="rate_amount">{t('rateAmountLabel')}</Label>
            <Input
              id="rate_amount"
              type="number"
              min={0}
              step="0.01"
              value={sessionPayRate.rate_amount}
              onChange={(e) => setSessionPayRate({ ...sessionPayRate, rate_amount: Number(e.target.value) })}
            />
          </div>
          <div className="space-y-1.5 w-32">
            <Label htmlFor="currency_code">{t('currencyCodeLabel')}</Label>
            <Input
              id="currency_code"
              value={sessionPayRate.currency_code}
              onChange={(e) => setSessionPayRate({ ...sessionPayRate, currency_code: e.target.value })}
              placeholder="CAD"
            />
          </div>
        </div>

        <Button onClick={handleSaveRate} pending={isSavingRate} icon={<Save size={14} />}>
          {t('saveRate')}
        </Button>
      </div>
    </div>
  );
}
