import { getTranslations } from 'next-intl/server';
import { getCompanyProfiles } from '@/actions/adminCompanyProfileAction';
import { CompanyProfileCard } from './_components/CompanyProfileCard';

export default async function CompanyProfilesPage() {
  const [t, profiles] = await Promise.all([getTranslations('companyProfiles'), getCompanyProfiles()]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-800">{t('title')}</h1>
        <p className="text-xs text-slate-500 mt-1">{t('subtitle')}</p>
      </div>

      {!profiles || profiles.length === 0 ? (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{t('fetchFailed')}</div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-2 max-w-5xl">
          {profiles.map((profile) => (
            <CompanyProfileCard key={profile.company_code} initialProfile={profile} />
          ))}
        </div>
      )}
    </div>
  );
}
