import { LoginForm } from '@gabby/lib/components/auth/LoginForm';
import { signIn } from '@/actions/authAction';
import { AUTH_LABELS } from '@/constants/auth';

export default function LoginPage() {
  return <LoginForm action={signIn} labels={AUTH_LABELS.login} />;
}
