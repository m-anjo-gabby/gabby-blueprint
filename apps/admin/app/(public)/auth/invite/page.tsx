'use client';

import { InviteSetupFlow, type InviteActions } from '@gabby/lib/components/auth/InviteSetupFlow';
import { acceptInvitation, signIn, verifyInvitation } from '@/actions/adminAuthAction';
import { useAuthLabels } from '@/components/auth/useAuthLabels';

const ACTIONS: InviteActions = { verifyInvitation, acceptInvitation, signIn };

export default function InvitePage() {
  const labels = useAuthLabels();
  return <InviteSetupFlow actions={ACTIONS} labels={labels.invite} passwordLabels={labels.passwordFields} />;
}
