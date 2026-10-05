import { LoginForm } from '@gabby/lib/components/auth/LoginForm';
import { signIn } from '@/actions/coachAuthAction';
import { AUTH_LABELS } from '@/constants/auth';

export default function LoginPage() {
  return <LoginForm action={signIn} labels={AUTH_LABELS.login} badge={<p className="text-xs font-bold text-brand">Coach Portal</p>} />;
}
