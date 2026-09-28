'use client';

import { ForgotPasswordForm } from '@gabby/lib/components/auth/ForgotPasswordForm';
import { forgotPassword } from '@/actions/adminAuthAction';
import { useAuthLabels } from '@/components/auth/useAuthLabels';

export default function ForgotPasswordPage() {
  const labels = useAuthLabels();
  return <ForgotPasswordForm action={forgotPassword} labels={labels.forgotPassword} />;
}
