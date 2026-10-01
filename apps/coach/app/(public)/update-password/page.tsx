import { UpdatePasswordFlow, type UpdatePasswordActions } from '@gabby/lib/components/auth/UpdatePasswordFlow';
import { hasRecoverySession, resetPassword, verifyRecovery } from '@/actions/coachAuthAction';
import { AUTH_LABELS } from '@/constants/auth';

const ACTIONS: UpdatePasswordActions = { verifyRecovery, hasRecoverySession, resetPassword };

export default function UpdatePasswordPage() {
  return <UpdatePasswordFlow actions={ACTIONS} labels={AUTH_LABELS.updatePassword} passwordLabels={AUTH_LABELS.passwordFields} />;
}
