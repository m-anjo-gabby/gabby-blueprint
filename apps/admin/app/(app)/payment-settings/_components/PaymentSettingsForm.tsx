'use client';

import { useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Save, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@gabby/lib/hooks/useToast';
import { updateCompanyProfile, updateSessionPayRate, uploadCompanyLogo } from '@/actions/adminPaymentSettingsAction';
import { getCompanyLogoUrl } from '@gabby/lib/monthlyReport/getCompanyLogoUrl';
import { CompanyProfile, SessionPayRate } from '@gabby/types/monthlyReport';

export function PaymentSettingsForm({
  initialCompanyProfile,
  initialSessionPayRate,
}: {
  initialCompanyProfile: CompanyProfile;
  initialSessionPayRate: SessionPayRate;
}) {
  const t = useTranslations('paymentSettings');
  const { showToast } = useToast();
  const [companyProfile, setCompanyProfile] = useState(initialCompanyProfile);
  const [sessionPayRate, setSessionPayRate] = useState(initialSessionPayRate);
  const [isSavingCompany, setIsSavingCompany] = useState(false);
  const [isSavingRate, setIsSavingRate] = useState(false);
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSaveCompany = async () => {
    setIsSavingCompany(true);
    const result = await updateCompanyProfile({
      company_name: companyProfile.company_name,
      address: companyProfile.address,
      tax_registration_number: companyProfile.tax_registration_number,
    });
    setIsSavingCompany(false);
    showToast(result.success ? t('toastCompanyUpdated') : result.message, result.success ? 'success' : 'error');
  };

  const handleSaveRate = async () => {
    setIsSavingRate(true);
    const result = await updateSessionPayRate(sessionPayRate);
    setIsSavingRate(false);
    showToast(result.success ? t('toastRateUpdated') : result.message, result.success ? 'success' : 'error');
  };

  const handleLogoFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploadingLogo(true);
    const result = await uploadCompanyLogo(file);
    setIsUploadingLogo(false);
    if (fileInputRef.current) fileInputRef.current.value = '';

    if (result.success) {
      setCompanyProfile({ ...companyProfile, logo_path: result.logoPath });
      showToast(t('toastLogoUpdated'), 'success');
    } else {
      showToast(result.message, 'error');
    }
  };

  const logoUrl = getCompanyLogoUrl(companyProfile.logo_path);

  return (
    <div className="space-y-6 max-w-xl">
      <div className="rounded-lg border border-slate-200 bg-white p-4 space-y-4">
        <h2 className="text-sm font-bold text-slate-800">{t('companyInfoTitle')}</h2>
        <p className="text-xs text-slate-500">
          {t('companyInfoDesc')}
        </p>

        <div className="space-y-1.5">
          <Label htmlFor="company_name">{t('companyNameLabel')}</Label>
          <Input
            id="company_name"
            value={companyProfile.company_name}
            onChange={(e) => setCompanyProfile({ ...companyProfile, company_name: e.target.value })}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="address">{t('addressLabel')}</Label>
          <Textarea
            id="address"
            rows={2}
            value={companyProfile.address}
            onChange={(e) => setCompanyProfile({ ...companyProfile, address: e.target.value })}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="tax_registration_number">{t('taxRegistrationLabel')}</Label>
          <Input
            id="tax_registration_number"
            value={companyProfile.tax_registration_number ?? ''}
            onChange={(e) => setCompanyProfile({ ...companyProfile, tax_registration_number: e.target.value })}
            placeholder={t('taxRegistrationPlaceholder')}
          />
          <p className="text-[11px] text-slate-400">
            {t('taxRegistrationHint')}
          </p>
        </div>

        <Button onClick={handleSaveCompany} disabled={isSavingCompany}>
          <Save size={14} className="mr-1.5" />
          {t('saveCompany')}
        </Button>

        <div className="space-y-1.5 pt-2 border-t border-slate-100">
          <Label>{t('logoLabel')}</Label>
          <div className="flex items-center gap-4">
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- Supabase Storage上の画像URLのプレビュー表示
              <img src={logoUrl} alt={t('logoAlt')} className="h-16 w-auto max-w-[160px] object-contain border border-slate-100 rounded-md p-2" />
            ) : (
              <span className="text-xs text-slate-400">{t('logoNotSet')}</span>
            )}
            <div>
              <input ref={fileInputRef} type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp" className="hidden" onChange={handleLogoFileSelected} />
              <Button type="button" variant="outline" disabled={isUploadingLogo} onClick={() => fileInputRef.current?.click()}>
                <Upload size={14} className="mr-1.5" />
                {isUploadingLogo ? t('uploadingLogo') : t('changeLogo')}
              </Button>
            </div>
          </div>
        </div>
      </div>

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

        <Button onClick={handleSaveRate} disabled={isSavingRate}>
          <Save size={14} className="mr-1.5" />
          {t('saveRate')}
        </Button>
      </div>
    </div>
  );
}
