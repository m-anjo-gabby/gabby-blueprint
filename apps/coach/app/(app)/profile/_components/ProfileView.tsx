'use client';

import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Eye, Loader2 } from 'lucide-react';
import { AvatarCropUploader } from '@gabby/lib/components/common/AvatarCropUploader';
import { VideoUploader } from '@gabby/lib/components/common/VideoUploader';
import { TimezoneSelector } from '@gabby/lib/components/common/TimezoneSelector';
import { CoachProfileDialog } from '@gabby/lib/components/common/CoachProfileDialog';
import { getProfileIconUrl } from '@gabby/lib/profile/getProfileIconUrl';
import { getCoachIntroVideoUrl } from '@gabby/lib/coachProfile/getCoachIntroVideoUrl';
import { getCountryFlagUrl } from '@gabby/lib/country/getCountryFlagUrl';
import {
  uploadProfileIcon,
  removeProfileIcon,
  updateMyTimezone,
  updateMyCoachProfile,
  updateMyCoachZoomSettings,
  uploadCoachIntroVideo,
  removeCoachIntroVideo,
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
  const [zoomMeetingUrl, setZoomMeetingUrl] = useState(initialCoachProfile?.zoom_meeting_url ?? '');
  const [isSavingCoachProfile, setIsSavingCoachProfile] = useState(false);
  const [isSavingZoomSettings, setIsSavingZoomSettings] = useState(false);
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

  const handleSaveZoomSettings = async () => {
    setIsSavingZoomSettings(true);
    try {
      const result = await updateMyCoachZoomSettings({ zoom_meeting_url: zoomMeetingUrl || null });
      if (!result.success) {
        showToast(result.message, 'error');
        return;
      }
      setZoomMeetingUrl(result.profile.zoom_meeting_url ?? '');
      showToast('Live session settings updated successfully', 'success');
    } finally {
      setIsSavingZoomSettings(false);
    }
  };

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
              <Input value={formatCoachSinceLabel(coachSince) ?? '-'} disabled />
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

          <div className="space-y-1.5">
            <Label>Introduction Video</Label>
            <VideoUploader
              currentVideoUrl={getCoachIntroVideoUrl(introVideoPath)}
              onUpload={handleUploadIntroVideo}
              onRemove={handleRemoveIntroVideo}
              labels={{
                emptyLabel: 'No video uploaded',
                uploadLabel: introVideoPath ? 'Replace Video' : 'Upload Video',
                uploadingLabel: 'Uploading...',
                removeLabel: 'Remove Video',
                invalidFileLabel: 'Please select an MP4, WebM, or MOV video up to 100MB.',
              }}
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

      <Card>
        <CardHeader>
          <CardTitle>Live Session Settings</CardTitle>
          <CardDescription>
            This link is used for your 1-on-1 live sessions with matched students. It is not shown on your public profile.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-1.5">
            <Label>Zoom Meeting URL</Label>
            <Input
              type="url"
              value={zoomMeetingUrl}
              onChange={(e) => setZoomMeetingUrl(e.target.value)}
              placeholder="https://zoom.us/j/xxxxxxxxxx"
            />
          </div>

          <div className="flex justify-end">
            <Button type="button" onClick={handleSaveZoomSettings} disabled={isSavingZoomSettings}>
              {isSavingZoomSettings && <Loader2 size={14} className="animate-spin" />}
              Save Live Session Settings
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
            introVideo: 'Introduction Video',
          }}
          onClose={() => setShowPreview(false)}
        />
      )}
    </>
  );
}
