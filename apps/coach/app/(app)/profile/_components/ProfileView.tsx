'use client';

import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Eye, Loader2 } from 'lucide-react';
import { AvatarCropUploader } from '@gabby/lib/components/common/AvatarCropUploader';
import { TimezoneSelector } from '@gabby/lib/components/common/TimezoneSelector';
import { CoachProfileDialog } from '@gabby/lib/components/common/CoachProfileDialog';
import { getProfileIconUrl } from '@gabby/lib/profile/getProfileIconUrl';
import { getCountryFlagUrl } from '@gabby/lib/country/getCountryFlagUrl';
import {
  uploadProfileIcon,
  removeProfileIcon,
  updateMyTimezone,
  updateMyCoachProfile,
} from '@/actions/coachProfileAction';
import { useUserStore } from '@gabby/lib/stores/useUserStore';
import { useToast } from '@gabby/lib/hooks/useToast';
import { TimezoneMaster } from '@gabby/types/timezone';
import { CountryMaster } from '@gabby/types/country';
import { CoachProfileFormValues, CoachProfileRecord } from '@gabby/types/coachProfile';

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
  coach_since: null,
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
    coach_since: profile.coach_since,
    education: profile.education,
    qualifications: profile.qualifications,
    teaching_years: profile.teaching_years,
    job_experience: profile.job_experience,
    introduction: profile.introduction,
  };
}

/** "2024-11-01" -> "2024-11" (month input用) */
function toMonthInputValue(dateStr: string | null): string {
  return dateStr ? dateStr.slice(0, 7) : '';
}

/** "2024-11" -> "2024-11-01" (DB保存用、月初日固定) */
function fromMonthInputValue(monthStr: string): string | null {
  return monthStr ? `${monthStr}-01` : null;
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
  const [isSavingCoachProfile, setIsSavingCoachProfile] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
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
      showToast('Public profile updated successfully', 'success');
    } finally {
      setIsSavingCoachProfile(false);
    }
  };

  const previewData = {
    userName,
    iconUrl: getProfileIconUrl(iconPath),
    countryName: selectedCountry?.name_en ?? null,
    countryFlagUrl: getCountryFlagUrl(selectedCountry?.icon_path),
    coachSinceLabel: formatCoachSinceLabel(coachProfileForm.coach_since),
    education: coachProfileForm.education,
    qualifications: coachProfileForm.qualifications,
    teachingYearsLabel: formatTeachingYearsLabel(coachProfileForm.teaching_years),
    jobExperience: coachProfileForm.job_experience,
    introduction: coachProfileForm.introduction,
  };

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Account Information</CardTitle>
          <CardDescription>You can update your icon image here. Your name cannot be changed.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <AvatarCropUploader
            currentImageUrl={getProfileIconUrl(iconPath)}
            onUpload={handleUpload}
            onRemove={handleRemove}
            labels={{
              modalTitle: 'Adjust Icon Image',
              cancelLabel: 'Cancel',
              applyLabel: 'Save',
              uploadingLabel: 'Saving...',
              removeLabel: 'Remove Image',
              invalidFileLabel: 'Please select a PNG, JPEG, or WebP image up to 5MB.',
            }}
          />

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Name</Label>
              <Input value={userName} disabled />
            </div>
            <div className="space-y-1.5">
              <Label>Affiliation</Label>
              <Input value={clientName ?? '-'} disabled />
            </div>
            <div className="space-y-1.5">
              <Label>Role</Label>
              <Input value={userTypeLabel} disabled />
            </div>
            <div className="space-y-1.5">
              <TimezoneSelector
                value={timezone}
                timezones={timezones}
                onChange={handleTimezoneChange}
                displayField="display_name_en"
                labels={{ label: 'Timezone', currentTimeLabel: 'Current time' }}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div>
            <CardTitle>Public Coach Profile</CardTitle>
            <CardDescription>
              These details are shown to students when they choose a coach. Fill them in to help students get to know you.
            </CardDescription>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={() => setShowPreview(true)}>
            <Eye size={14} /> Preview
          </Button>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Nationality</Label>
              <select
                value={coachProfileForm.country_code ?? ''}
                onChange={(e) => handleCoachProfileFieldChange('country_code', e.target.value || null)}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring md:text-sm"
              >
                <option value="">(Not set)</option>
                {countries.map((country) => (
                  <option key={country.country_code} value={country.country_code}>
                    {country.name_en}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>Gabby Coach Since</Label>
              <Input
                type="month"
                value={toMonthInputValue(coachProfileForm.coach_since)}
                onChange={(e) => handleCoachProfileFieldChange('coach_since', fromMonthInputValue(e.target.value))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>English Teaching (years)</Label>
              <Input
                type="number"
                min={0}
                max={60}
                value={coachProfileForm.teaching_years ?? ''}
                onChange={(e) =>
                  handleCoachProfileFieldChange('teaching_years', e.target.value === '' ? null : Number(e.target.value))
                }
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Education</Label>
            <Textarea
              rows={2}
              value={coachProfileForm.education ?? ''}
              onChange={(e) => handleCoachProfileFieldChange('education', e.target.value || null)}
              placeholder="e.g. University of Alberta - Bachelor of Science in Nursing"
            />
          </div>

          <div className="space-y-1.5">
            <Label>Qualifications</Label>
            <Textarea
              rows={2}
              value={coachProfileForm.qualifications ?? ''}
              onChange={(e) => handleCoachProfileFieldChange('qualifications', e.target.value || null)}
              placeholder="e.g. TESOL Certificate"
            />
          </div>

          <div className="space-y-1.5">
            <Label>Job Experience</Label>
            <Textarea
              rows={2}
              value={coachProfileForm.job_experience ?? ''}
              onChange={(e) => handleCoachProfileFieldChange('job_experience', e.target.value || null)}
              placeholder="e.g. Professional communication & medical vocabulary"
            />
          </div>

          <div className="space-y-1.5">
            <Label>Personal Introduction</Label>
            <Textarea
              rows={5}
              value={coachProfileForm.introduction ?? ''}
              onChange={(e) => handleCoachProfileFieldChange('introduction', e.target.value || null)}
              placeholder="Tell students a bit about yourself and your teaching style."
            />
          </div>

          <div className="flex justify-end">
            <Button type="button" onClick={handleSaveCoachProfile} disabled={isSavingCoachProfile}>
              {isSavingCoachProfile && <Loader2 size={14} className="animate-spin" />}
              Save Public Profile
            </Button>
          </div>
        </CardContent>
      </Card>

      {showPreview && (
        <CoachProfileDialog
          data={previewData}
          labels={{
            closeLabel: 'Close',
            coachSince: 'Gabby Coach Since',
            education: 'Education',
            qualifications: 'Qualifications',
            englishTeaching: 'English Teaching',
            jobExperience: 'Job Experience',
            personalIntroduction: 'Personal Introduction',
          }}
          onClose={() => setShowPreview(false)}
        />
      )}
    </>
  );
}
