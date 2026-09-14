'use client';

import { AvatarCropUploader } from '@gabby/lib/components/common/AvatarCropUploader';
import { TimezoneSelector } from '@gabby/lib/components/common/TimezoneSelector';
import { TimezoneMaster } from '@gabby/types/timezone';

interface AccountSummaryCardProps {
  userName: string;
  clientName: string | null;
  userTypeLabel: string;
  iconUrl: string | null;
  onUploadIcon: (blob: Blob) => Promise<void>;
  onRemoveIcon: () => Promise<void>;
  timezone: string;
  timezones: TimezoneMaster[];
  onTimezoneChange: (timezone: string) => Promise<void>;
}

/** Name / Affiliation / Role / Timezoneをまとめた、変更頻度の低いアカウント情報の帯 */
export function AccountSummaryCard({
  userName,
  clientName,
  userTypeLabel,
  iconUrl,
  onUploadIcon,
  onRemoveIcon,
  timezone,
  timezones,
  onTimezoneChange,
}: AccountSummaryCardProps) {
  return (
    <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-5 flex flex-wrap items-center gap-6">
      <AvatarCropUploader
        currentImageUrl={iconUrl}
        onUpload={onUploadIcon}
        onRemove={onRemoveIcon}
        size={56}
        labels={{
          modalTitle: 'Adjust Icon Image',
          cancelLabel: 'Cancel',
          applyLabel: 'Save',
          uploadingLabel: 'Saving...',
          removeLabel: 'Remove Image',
          invalidFileLabel: 'Please select a PNG, JPEG, or WebP image up to 5MB.',
          removeConfirmTitle: 'Remove profile icon?',
          removeConfirmMessage: 'This cannot be undone.',
        }}
      />

      <div className="flex-1 min-w-[180px]">
        <p className="text-[15px] font-bold text-slate-800">{userName}</p>
        <p className="text-[12.5px] text-slate-500 mt-0.5">
          {clientName ?? '-'} &middot; {userTypeLabel}
        </p>
      </div>

      <div className="w-full sm:w-auto sm:min-w-[240px]">
        <TimezoneSelector
          value={timezone}
          timezones={timezones}
          onChange={onTimezoneChange}
          displayField="display_name_en"
          labels={{ label: 'Timezone', currentTimeLabel: 'Current time' }}
        />
      </div>
    </div>
  );
}
