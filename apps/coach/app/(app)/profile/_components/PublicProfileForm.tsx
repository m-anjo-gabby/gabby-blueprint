'use client';

import { GraduationCap, Briefcase, MessageSquare, Loader2 } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { VideoUploader } from '@gabby/lib/components/common/VideoUploader';
import { CoachProfileFormValues } from '@gabby/types/coachProfile';
import { CountryMaster } from '@gabby/types/country';
import { ProfileFieldGroup } from './ProfileFieldGroup';
import { ProfileTextAreaField } from './ProfileTextAreaField';

/**
 * 自由記述の項目グループ定義。同じ形（見出しアイコン + テキストエリアの並び）の項目を
 * 増やしたい場合は、ここに1エントリー追加するだけでよい（JSXの変更は不要）。
 */
const TEXT_FIELD_GROUPS: {
  icon: typeof GraduationCap;
  label: string;
  fields: {
    key: 'education' | 'qualifications' | 'job_experience';
    label: string;
    placeholder: string;
    rows: number;
  }[];
}[] = [
  {
    icon: GraduationCap,
    label: 'Credentials',
    fields: [
      {
        key: 'education',
        label: 'Education',
        placeholder: 'e.g. University of Alberta - Bachelor of Science in Nursing',
        rows: 2,
      },
      { key: 'qualifications', label: 'Qualifications', placeholder: 'e.g. TESOL Certificate', rows: 2 },
    ],
  },
  {
    icon: Briefcase,
    label: 'Experience',
    fields: [
      {
        key: 'job_experience',
        label: 'Job Experience',
        placeholder: 'e.g. Professional communication & medical vocabulary',
        rows: 2,
      },
    ],
  },
];

interface PublicProfileFormProps {
  countries: CountryMaster[];
  form: CoachProfileFormValues;
  onFieldChange: <K extends keyof CoachProfileFormValues>(field: K, value: CoachProfileFormValues[K]) => void;
  coachSinceLabel: string | null;
  introVideoUrl: string | null;
  introVideoPath: string | null;
  onUploadIntroVideo: (file: File) => Promise<void>;
  onRemoveIntroVideo: () => Promise<void>;
  onSave: () => void;
  isSaving: boolean;
}

export function PublicProfileForm({
  countries,
  form,
  onFieldChange,
  coachSinceLabel,
  introVideoUrl,
  introVideoPath,
  onUploadIntroVideo,
  onRemoveIntroVideo,
  onSave,
  isSaving,
}: PublicProfileFormProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Public Coach Profile</CardTitle>
        <CardDescription>
          These details are shown to students when they choose a coach. The panel on the right previews your changes
          as you type, but nothing is saved until you press Save Public Profile below.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <ProfileFieldGroup icon={GraduationCap} label="Basics" withDivider={false}>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label>Nationality</Label>
              <select
                value={form.country_code ?? ''}
                onChange={(e) => onFieldChange('country_code', e.target.value || null)}
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
              <div className="h-9 flex items-center text-sm text-slate-500">{coachSinceLabel ?? '-'}</div>
            </div>
            <div className="space-y-1.5">
              <Label>English Teaching</Label>
              <div className="relative">
                <Input
                  type="number"
                  min={0}
                  max={60}
                  className="pr-10"
                  value={form.teaching_years ?? ''}
                  onChange={(e) => onFieldChange('teaching_years', e.target.value === '' ? null : Number(e.target.value))}
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none">
                  yrs
                </span>
              </div>
            </div>
          </div>
        </ProfileFieldGroup>

        {TEXT_FIELD_GROUPS.map((group) => (
          <ProfileFieldGroup key={group.label} icon={group.icon} label={group.label}>
            <div className="space-y-4">
              {group.fields.map((field) => (
                <ProfileTextAreaField
                  key={field.key}
                  label={field.label}
                  placeholder={field.placeholder}
                  rows={field.rows}
                  value={form[field.key]}
                  onChange={(value) => onFieldChange(field.key, value)}
                />
              ))}
            </div>
          </ProfileFieldGroup>
        ))}

        <ProfileFieldGroup icon={MessageSquare} label="About You">
          <div className="space-y-4">
            <ProfileTextAreaField
              label="Personal Introduction"
              placeholder="Tell students a bit about yourself and your teaching style."
              rows={5}
              value={form.introduction}
              onChange={(value) => onFieldChange('introduction', value)}
            />

            <div className="space-y-1.5">
              <Label>Introduction Video</Label>
              <VideoUploader
                currentVideoUrl={introVideoUrl}
                onUpload={onUploadIntroVideo}
                onRemove={onRemoveIntroVideo}
                labels={{
                  emptyLabel: 'No video uploaded',
                  uploadLabel: introVideoPath ? 'Replace Video' : 'Upload Video',
                  uploadingLabel: 'Uploading...',
                  removeLabel: 'Remove Video',
                  invalidFileLabel: 'Please select an MP4, WebM, or MOV video up to 100MB.',
                  removeConfirmTitle: 'Remove introduction video?',
                  removeConfirmMessage: 'This cannot be undone.',
                  removeConfirmCancelLabel: 'Cancel',
                }}
              />
            </div>
          </div>
        </ProfileFieldGroup>

        <div className="flex justify-end pt-2">
          <Button type="button" onClick={onSave} disabled={isSaving}>
            {isSaving && <Loader2 size={14} className="animate-spin" />}
            Save Public Profile
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
