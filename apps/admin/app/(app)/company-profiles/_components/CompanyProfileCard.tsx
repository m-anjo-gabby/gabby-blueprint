'use client';

import { useRef, useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { Save, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@gabby/lib/hooks/useToast';
import { updateCompanyProfile, uploadCompanyLogo } from '@/actions/adminCompanyProfileAction';
import { getCompanyLogoUrl } from '@gabby/lib/companyProfile/getCompanyLogoUrl';
import { COMPANY_CODES, CompanyProfile } from '@gabby/types/companyProfile';

/** 法人1社分の会社情報の編集カード（書面の発行元として印字される内容） */
export function CompanyProfileCard({ initialProfile }: { initialProfile: CompanyProfile }) {
  const t = useTranslations('companyProfiles');
  const { showToast } = useToast();
  const [profile, setProfile] = useState(initialProfile);
  const [isSaving, startSaving] = useTransition();
  const [isUploadingLogo, startUploadingLogo] = useTransition();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const code = profile.company_code;
  const idPrefix = code.toLowerCase();
  const isJapan = code === COMPANY_CODES.JAPAN;

  const handleSave = () => {
    startSaving(async () => {
      const result = await updateCompanyProfile(code, {
        company_name: profile.company_name,
        company_name_ja: profile.company_name_ja,
        address: profile.address,
        tax_registration_number: profile.tax_registration_number,
      });
      showToast(result.success ? t('toastUpdated') : result.message, result.success ? 'success' : 'error');
    });
  };

  const handleLogoFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    startUploadingLogo(async () => {
      const result = await uploadCompanyLogo(code, file);
      if (fileInputRef.current) fileInputRef.current.value = '';
      if (result.success) {
        setProfile((prev) => ({ ...prev, logo_path: result.logoPath }));
        showToast(t('toastLogoUpdated'), 'success');
      } else {
        showToast(result.message, 'error');
      }
    });
  };

  const logoUrl = getCompanyLogoUrl(profile.logo_path);

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 space-y-4">
      <div>
        <h2 className="text-sm font-bold text-slate-800">{t(`companies.${code}.title`)}</h2>
        <p className="text-xs text-slate-500 mt-1">{t(`companies.${code}.usage`)}</p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={`${idPrefix}-company_name`}>{t('companyNameLabel')}</Label>
        <Input
          id={`${idPrefix}-company_name`}
          value={profile.company_name}
          onChange={(e) => setProfile({ ...profile, company_name: e.target.value })}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={`${idPrefix}-company_name_ja`}>{t('companyNameJaLabel')}</Label>
        <Input
          id={`${idPrefix}-company_name_ja`}
          value={profile.company_name_ja ?? ''}
          onChange={(e) => setProfile({ ...profile, company_name_ja: e.target.value })}
          placeholder={t('companyNameJaPlaceholder')}
        />
        <p className="text-[11px] text-slate-400">{t('companyNameJaHint')}</p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={`${idPrefix}-address`}>{t('addressLabel')}</Label>
        <Textarea
          id={`${idPrefix}-address`}
          rows={3}
          value={profile.address}
          onChange={(e) => setProfile({ ...profile, address: e.target.value })}
        />
        <p className="text-[11px] text-slate-400">{t('addressHint')}</p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={`${idPrefix}-tax_registration_number`}>{t('taxRegistrationLabel')}</Label>
        <Input
          id={`${idPrefix}-tax_registration_number`}
          value={profile.tax_registration_number ?? ''}
          onChange={(e) => setProfile({ ...profile, tax_registration_number: e.target.value })}
          placeholder={t(isJapan ? 'taxRegistrationPlaceholderJp' : 'taxRegistrationPlaceholderCa')}
        />
        <p className="text-[11px] text-slate-400">{t('taxRegistrationHint')}</p>
      </div>

      <Button onClick={handleSave} pending={isSaving} icon={<Save size={14} />}>
        {t('save')}
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
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/svg+xml,image/webp"
              className="hidden"
              onChange={handleLogoFileSelected}
            />
            <Button
              type="button"
              variant="outline"
              pending={isUploadingLogo}
              icon={<Upload size={14} />}
              onClick={() => fileInputRef.current?.click()}
            >
              {t('changeLogo')}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
