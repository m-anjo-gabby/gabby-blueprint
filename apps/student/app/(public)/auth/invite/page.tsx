'use client';

import { InviteSetupFlow, type InviteActions } from '@gabby/lib/components/auth/InviteSetupFlow';
import { acceptInvitation, signIn, verifyInvitation } from '@/actions/authAction';
import { AUTH_LABELS } from '@/constants/auth';

const ACTIONS: InviteActions = { verifyInvitation, acceptInvitation, signIn };

export default function InvitePage() {
  return <InviteSetupFlow actions={ACTIONS} labels={AUTH_LABELS.invite} passwordLabels={AUTH_LABELS.passwordFields} />;
}
