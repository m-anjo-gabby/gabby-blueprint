'use client';

import { LoginForm } from '@gabby/lib/components/auth/LoginForm';
import { signIn } from '@/actions/adminAuthAction';
import { useAuthLabels } from '@/components/auth/useAuthLabels';

export default function LoginPage() {
  const labels = useAuthLabels();
  return <LoginForm action={signIn} labels={labels.login} />;
}
