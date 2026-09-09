'use client';

import { useMemo, useState } from 'react';
import { getProfileIconUrl } from '@gabby/lib/profile/getProfileIconUrl';
import { getCoachIntroVideoUrl } from '@gabby/lib/coachProfile/getCoachIntroVideoUrl';
import { getCountryFlagUrl } from '@gabby/lib/country/getCountryFlagUrl';
import {
  uploadProfileIcon,
  removeProfileIcon,
  updateMyTimezone,
  updateMyCoachProfile,
  uploadCoachIntroVideo,
  removeCoachIntroVideo,
} from '@/actions/coachProfileAction';
import { useUserStore } from '@gabby/lib/stores/useUserStore';
import { useToast } from '@gabby/lib/hooks/useToast';
import { TimezoneMaster } from '@gabby/types/timezone';
import { CountryMaster } from '@gabby/types/country';
import { CoachProfileFormValues, CoachProfileRecord } from '@gabby/types/coachProfile';
import { getCoachProfileCompleteness } from '../_lib/profileCompleteness';
import { AccountSummaryCard } from './AccountSummaryCard';
import { PublicProfileForm } from './PublicProfileForm';
import { LivePreviewPanel } from './LivePreviewPanel';

interface ProfileViewProps {
  userName: string;
  clientName: string | null;
  userTypeLabel: string;
  initialIconPath: string | null;
  initialTimezone: string;
  timezones: TimezoneMaster[];
  initialCoachProfile: CoachProfileRecord | null;
  countries: CountryMaster[];
}

const EMPTY_COACH_PROFILE_FORM: CoachProfileFormValues = {
  country_code: null,
  education: null,
  qualifications: null,
  teaching_years: null,
  job_experience: null,
  introduction: null,
};

function toCoachProfileFormValues(profile: CoachProfileRecord | null): CoachProfileFormValues {
  if (!profile) return EMPTY_COACH_PROFILE_FORM;
  return {
    country_code: profile.country_code,
    education: profile.education,
    qualifications: profile.qualifications,
    teaching_years: profile.teaching_years,
    job_experience: profile.job_experience,
    introduction: profile.introduction,
  };
}

/** "2024-11-01" -> "Nov, 2024" */
function formatCoachSinceLabel(dateStr: string | null): string | null {
  if (!dateStr) return null;
  const date = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat('en-US', { month: 'short', year: 'numeric' }).format(date);
}

function formatTeachingYearsLabel(years: number | null): string | null {
  if (years === null) return null;
  return `${years} ${years === 1 ? 'year' : 'years'}`;
}

export function ProfileView({
  userName,
  clientName,
  userTypeLabel,
  initialIconPath,
  initialTimezone,
  timezones,
  initialCoachProfile,
  countries,
}: ProfileViewProps) {
  const [iconPath, setIconPath] = useState(initialIconPath);
  const [timezone, setTimezone] = useState(initialTimezone);
  const [coachProfileForm, setCoachProfileForm] = useState<CoachProfileFormValues>(
    toCoachProfileFormValues(initialCoachProfile)
  );
  // Gabby Coach Since はアカウント作成日から自動設定される読み取り専用項目のため、フォームとは別に保持する
  const [coachSince, setCoachSince] = useState(initialCoachProfile?.coach_since ?? null);
  const [introVideoPath, setIntroVideoPath] = useState(initialCoachProfile?.intro_video_path ?? null);
  const [isSavingCoachProfile, setIsSavingCoachProfile] = useState(false);
  const user = useUserStore((state) => state.user);
  const setUser = useUserStore((state) => state.setUser);
  const { showToast } = useToast();

  const selectedCountry = useMemo(
    () => countries.find((c) => c.country_code === coachProfileForm.country_code) ?? null,
    [countries, coachProfileForm.country_code]
  );

  const handleUpload = async (blob: Blob) => {
    const formData = new FormData();
    formData.append('file', blob, 'icon.png');
    const result = await uploadProfileIcon(formData);
    if (!result.success) {
      showToast(result.message, 'error');
      return;
    }
    setIconPath(result.iconPath);
    if (user) setUser({ ...user, icon_path: result.iconPath });
    showToast('Profile icon updated successfully', 'success');
  };

  const handleRemove = async () => {
    const result = await removeProfileIcon();
    if (!result.success) {
      showToast(result.message, 'error');
      return;
    }
    setIconPath(null);
    if (user) setUser({ ...user, icon_path: null });
    showToast('Profile icon removed', 'success');
  };

  const handleUploadIntroVideo = async (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    const result = await uploadCoachIntroVideo(formData);
    if (!result.success) {
      showToast(result.message, 'error');
      return;
    }
    setIntroVideoPath(result.introVideoPath);
    showToast('Introduction video updated successfully', 'success');
  };

  const handleRemoveIntroVideo = async () => {
    const result = await removeCoachIntroVideo();
    if (!result.success) {
      showToast(result.message, 'error');
      return;
    }
    setIntroVideoPath(null);
    showToast('Introduction video removed', 'success');
  };

  const handleTimezoneChange = async (next: string) => {
    const result = await updateMyTimezone(next);
    if (!result.success) {
      showToast(result.message, 'error');
      return;
    }
    setTimezone(result.timezone);
    if (user) setUser({ ...user, timezone: result.timezone });
    showToast('Timezone updated successfully', 'success');
  };

  const handleCoachProfileFieldChange = <K extends keyof CoachProfileFormValues>(
    field: K,
    value: CoachProfileFormValues[K]
  ) => {
    setCoachProfileForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSaveCoachProfile = async () => {
    setIsSavingCoachProfile(true);
    try {
      const result = await updateMyCoachProfile(coachProfileForm);
      if (!result.success) {
        showToast(result.message, 'error');
        return;
      }
      setCoachProfileForm(toCoachProfileFormValues(result.profile));
      setCoachSince(result.profile.coach_since);
      showToast('Public profile updated successfully', 'success');
    } finally {
      setIsSavingCoachProfile(false);
    }
  };

  const completeness = useMemo(
    () => getCoachProfileCompleteness(coachProfileForm, !!introVideoPath),
    [coachProfileForm, introVideoPath]
  );

  const previewData = {
    userName,
    iconUrl: getProfileIconUrl(iconPath),
    countryName: selectedCountry?.name_en ?? null,
    countryFlagUrl: getCountryFlagUrl(selectedCountry?.icon_path),
    coachSinceLabel: formatCoachSinceLabel(coachSince),
    education: coachProfileForm.education,
    qualifications: coachProfileForm.qualifications,
    teachingYearsLabel: formatTeachingYearsLabel(coachProfileForm.teaching_years),
    jobExperience: coachProfileForm.job_experience,
    introduction: coachProfileForm.introduction,
    introVideoUrl: getCoachIntroVideoUrl(introVideoPath),
  };

  return (
    <div className="flex flex-col gap-6">
      <AccountSummaryCard
        userName={userName}
        clientName={clientName}
        userTypeLabel={userTypeLabel}
        iconUrl={getProfileIconUrl(iconPath)}
        onUploadIcon={handleUpload}
        onRemoveIcon={handleRemove}
        timezone={timezone}
        timezones={timezones}
        onTimezoneChange={handleTimezoneChange}
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px] items-start">
        <PublicProfileForm
          countries={countries}
          form={coachProfileForm}
          onFieldChange={handleCoachProfileFieldChange}
          coachSinceLabel={formatCoachSinceLabel(coachSince)}
          introVideoUrl={getCoachIntroVideoUrl(introVideoPath)}
          introVideoPath={introVideoPath}
          onUploadIntroVideo={handleUploadIntroVideo}
          onRemoveIntroVideo={handleRemoveIntroVideo}
          onSave={handleSaveCoachProfile}
          isSaving={isSavingCoachProfile}
        />

        <div className="lg:sticky lg:top-6">
          <LivePreviewPanel
            data={previewData}
            labels={{
              closeLabel: 'Close',
              coachSince: 'Gabby Coach Since',
              education: 'Education',
              qualifications: 'Qualifications',
              englishTeaching: 'English Teaching',
              jobExperience: 'Job Experience',
              personalIntroduction: 'Personal Introduction',
              introVideo: 'Introduction Video',
            }}
            completionPercent={completeness.percent}
            missingLabels={completeness.missingLabels}
          />
        </div>
      </div>
    </div>
  );
}
