'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { AvatarCropUploader } from '@gabby/lib/components/common/AvatarCropUploader';
import { getProfileIconUrl } from '@gabby/lib/profile/getProfileIconUrl';
import { uploadProfileIcon, removeProfileIcon } from '@/actions/coachProfileAction';
import { useUserStore } from '@gabby/lib/stores/useUserStore';
import { useToast } from '@gabby/lib/hooks/useToast';

interface ProfileViewProps {
  userName: string;
  clientName: string | null;
  userTypeLabel: string;
  initialIconPath: string | null;
}

export function ProfileView({ userName, clientName, userTypeLabel, initialIconPath }: ProfileViewProps) {
  const [iconPath, setIconPath] = useState(initialIconPath);
  const user = useUserStore((state) => state.user);
  const setUser = useUserStore((state) => state.setUser);
  const { showToast } = useToast();

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

  return (
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
        </div>
      </CardContent>
    </Card>
  );
}
