'use client';

import { useRef, useState } from 'react';
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
    showToast(result.success ? '会社情報を更新しました' : result.message, result.success ? 'success' : 'error');
  };

  const handleSaveRate = async () => {
    setIsSavingRate(true);
    const result = await updateSessionPayRate(sessionPayRate);
    setIsSavingRate(false);
    showToast(result.success ? 'セッション単価を更新しました' : result.message, result.success ? 'success' : 'error');
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
      showToast('ロゴ画像を更新しました', 'success');
    } else {
      showToast(result.message, 'error');
    }
  };

  const logoUrl = getCompanyLogoUrl(companyProfile.logo_path);

  return (
    <div className="space-y-6 max-w-xl">
      <div className="rounded-lg border border-slate-200 bg-white p-4 space-y-4">
        <h2 className="text-sm font-bold text-slate-800">会社情報</h2>
        <p className="text-xs text-slate-500">
          コーチ向け月次支払通知書・請求書(INVOICE)(いずれもPDF)に印字されます。コーチとの
          業務委託契約主体（バンクーバー法人）の情報を設定してください。
        </p>

        <div className="space-y-1.5">
          <Label htmlFor="company_name">会社名</Label>
          <Input
            id="company_name"
            value={companyProfile.company_name}
            onChange={(e) => setCompanyProfile({ ...companyProfile, company_name: e.target.value })}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="address">住所</Label>
          <Textarea
            id="address"
            rows={2}
            value={companyProfile.address}
            onChange={(e) => setCompanyProfile({ ...companyProfile, address: e.target.value })}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="tax_registration_number">税務登録番号（任意）</Label>
          <Input
            id="tax_registration_number"
            value={companyProfile.tax_registration_number ?? ''}
            onChange={(e) => setCompanyProfile({ ...companyProfile, tax_registration_number: e.target.value })}
            placeholder="例: カナダGST/HST登録番号（未登録の場合は空欄）"
          />
          <p className="text-[11px] text-slate-400">
            設定した場合のみ請求書(INVOICE)に印字されます。記載要否は税務専門家にご確認ください。
          </p>
        </div>

        <Button onClick={handleSaveCompany} disabled={isSavingCompany}>
          <Save size={14} className="mr-1.5" />
          会社情報を保存
        </Button>

        <div className="space-y-1.5 pt-2 border-t border-slate-100">
          <Label>会社ロゴ</Label>
          <div className="flex items-center gap-4">
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- Supabase Storage上の画像URLのプレビュー表示
              <img src={logoUrl} alt="会社ロゴ" className="h-16 w-auto max-w-[160px] object-contain border border-slate-100 rounded-md p-2" />
            ) : (
              <span className="text-xs text-slate-400">未設定</span>
            )}
            <div>
              <input ref={fileInputRef} type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp" className="hidden" onChange={handleLogoFileSelected} />
              <Button type="button" variant="outline" disabled={isUploadingLogo} onClick={() => fileInputRef.current?.click()}>
                <Upload size={14} className="mr-1.5" />
                {isUploadingLogo ? 'アップロード中...' : 'ロゴ画像を変更'}
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-4 space-y-4">
        <h2 className="text-sm font-bold text-slate-800">セッション単価</h2>
        <p className="text-xs text-slate-500">
          全コーチ共通の単価です。月次支払通知書の支払額は「単価 × 月間総セッション数」で算出されます
          （単価自体は通知書には表示しません）。承認済み月は承認時点の単価で固定されるため、
          ここでの変更は未承認の月にのみ影響します。
        </p>

        <div className="flex gap-4">
          <div className="space-y-1.5 flex-1">
            <Label htmlFor="rate_amount">単価</Label>
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
            <Label htmlFor="currency_code">通貨コード</Label>
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
          単価を保存
        </Button>
      </div>
    </div>
  );
}
