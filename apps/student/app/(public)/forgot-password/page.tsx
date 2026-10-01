import { ForgotPasswordForm } from '@gabby/lib/components/auth/ForgotPasswordForm';
import { forgotPassword } from '@/actions/authAction';
import { AUTH_LABELS } from '@/constants/auth';

export default function ForgotPasswordPage() {
  return <ForgotPasswordForm action={forgotPassword} labels={AUTH_LABELS.forgotPassword} />;
}
