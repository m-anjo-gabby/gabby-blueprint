'use client';

import { UpdatePasswordFlow, type UpdatePasswordActions } from '@gabby/lib/components/auth/UpdatePasswordFlow';
import { hasRecoverySession, resetPassword, verifyRecovery } from '@/actions/adminAuthAction';
import { useAuthLabels } from '@/components/auth/useAuthLabels';

const ACTIONS: UpdatePasswordActions = { verifyRecovery, hasRecoverySession, resetPassword };

export default function UpdatePasswordPage() {
  const labels = useAuthLabels();
  return <UpdatePasswordFlow actions={ACTIONS} labels={labels.updatePassword} passwordLabels={labels.passwordFields} />;
}
