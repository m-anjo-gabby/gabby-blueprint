// apps/coach/app/(public)/auth/invite/page.tsx
'use client';

import { useEffect, useState, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import { Loader2, AlertCircle, ArrowRight, CheckCircle2 } from 'lucide-react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { verifyInvitationToken, acceptInvitationAction } from '@gabby/lib/auth/actions';
import { PasswordInput } from '@gabby/lib/components/common/PasswordInput';
import { signIn } from '@/actions/coachAuthAction';

type PageStatus = 'loading' | 'expired' | 'error' | 'form' | 'success';

export default function InvitePage() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token');

  const [status, setStatus] = useState<PageStatus>('loading');
  const [invitedUser, setInvitedUser] = useState<{ email: string; user_name: string } | null>(null);

  // Form state
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Live password strength check
  const strengthStatus = useMemo(() => {
    if (!password) return null;
    const hasAlpha = /[a-zA-Z]/.test(password);
    const hasNumber = /[0-9]/.test(password);
    return hasAlpha && hasNumber;
  }, [password]);

  // Live password match check
  const matchStatus = useMemo(() => {
    if (!password || !confirmPassword) return null;
    return password === confirmPassword;
  }, [password, confirmPassword]);

  useEffect(() => {
    const checkToken = async () => {
      if (!token) {
        setStatus('error');
        return;
      }

      const result = await verifyInvitationToken(token);

      if (!result.valid || !result.data) {
        if (result.errorType === 'expired_token') {
          setStatus('expired');
        } else {
          setStatus('error');
        }
        return;
      }

      setInvitedUser({
        email: result.data.email,
        user_name: result.data.user_name || 'Coach'
      });
      setStatus('form');
    };

    checkToken();
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!token || !invitedUser) return;

    if (password.length < 8) {
      setFormError('Password must be at least 8 characters long.');
      return;
    }
    if (strengthStatus === false) {
      setFormError('Password must contain both letters and numbers.');
      return;
    }
    if (password !== confirmPassword) {
      setFormError('Passwords do not match.');
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await acceptInvitationAction({ token, password });

      if (!result.success) {
        setFormError(result.message || 'Failed to complete registration.');
        setIsSubmitting(false);
        return;
      }

      // Automatic sign-in
      const loginFormData = new FormData();
      loginFormData.append('email', invitedUser.email);
      loginFormData.append('password', password);

      const loginResult = await signIn(loginFormData);

      if (loginResult?.error) {
        setFormError(loginResult.error);
        setIsSubmitting(false);
      }
    } catch (err) {
      if (err instanceof Error && err.message === 'NEXT_REDIRECT') return;
      setFormError('An unexpected error occurred.');
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-slate-50 px-4">
      <div className="w-full max-w-md bg-white p-8 rounded-2xl shadow-xl shadow-slate-200/50 border border-slate-100">
        <AnimatePresence mode="wait">
          {status === 'loading' && <LoadingState key="loading" />}

          {(status === 'expired' || status === 'error') && (
            <ErrorState key="error" type={status === 'expired' ? 'expired' : 'error'} />
          )}

          {status === 'form' && invitedUser && (
            <motion.div
              key="form"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.25, ease: 'easeOut' }}
            >
              <div className="text-center mb-6">
                <p className="text-xs font-black text-indigo-600 uppercase tracking-widest mb-2">Coach Portal</p>
                <h1 className="text-2xl font-bold text-slate-800">Coach Account Setup</h1>
                <p className="text-sm text-slate-500 mt-2 leading-relaxed">
                  {invitedUser.user_name} ({invitedUser.email})<br />
                  Please set a password to sign in to the Coach Portal.
                </p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-1">
                  <PasswordInput
                    label="New Password"
                    name="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="At least 8 characters, letters and numbers"
                    required
                    minLength={8}
                  />
                  {strengthStatus !== null && !strengthStatus && (
                    <p className="text-[11px] text-red-500 font-bold ml-1 animate-in fade-in">
                      Password must contain both letters and numbers
                    </p>
                  )}
                </div>

                <div className="relative">
                  <PasswordInput
                    label="Confirm Password"
                    name="confirmPassword"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Re-enter your password"
                    required
                    minLength={8}
                  />
                  {matchStatus !== null && (
                    <p className={`text-[11px] font-bold mt-1 ml-1 flex items-center gap-1 animate-in fade-in ${
                      matchStatus ? 'text-emerald-600' : 'text-red-500'
                    }`}>
                      {matchStatus ? (
                        <><CheckCircle2 size={12} /> Passwords match</>
                      ) : (
                        'Passwords do not match'
                      )}
                    </p>
                  )}
                </div>

                {formError && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    className="p-3 bg-red-50 text-red-600 text-xs rounded-xl flex items-center gap-2 font-medium"
                  >
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{formError}</span>
                  </motion.div>
                )}

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white font-bold py-3 rounded-xl transition-all flex items-center justify-center gap-2 mt-2"
                >
                  {isSubmitting ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <>
                      Activate Account
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </form>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

function LoadingState() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: 0.25, ease: 'easeOut' }}
      className="flex flex-col items-center text-center"
    >
      <Loader2 className="w-8 h-8 animate-spin text-indigo-600 mb-4" />
      <h1 className="text-xl font-bold text-slate-800">Verifying Invitation</h1>
      <p className="text-sm text-slate-500 mt-2 leading-relaxed">
        Establishing a secure session. Please wait a moment...
      </p>
    </motion.div>
  );
}

function ErrorState({ type }: { type: 'expired' | 'error' }) {
  const isExpired = type === 'expired';
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: 0.25, ease: 'easeOut' }}
      className="flex flex-col items-center text-center"
    >
      <div className="w-12 h-12 bg-red-50 rounded-full flex items-center justify-center mb-4">
        <AlertCircle className="w-6 h-6 text-red-500" />
      </div>
      <h1 className="text-xl font-bold text-slate-800">
        {isExpired ? 'Invitation Link Expired' : 'Authentication Error'}
      </h1>
      <p className="text-sm text-slate-500 mt-3 mb-8 leading-relaxed">
        {isExpired
          ? 'This invitation link has expired or has already been used. Please ask your administrator to send a new invitation.'
          : 'An unexpected error occurred while creating your session. Please try the link again or contact your administrator.'}
      </p>
      <Link href="/login" className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 rounded-xl transition-all flex items-center justify-center gap-2">
        Back to Sign In
        <ArrowRight className="w-4 h-4" />
      </Link>
    </motion.div>
  );
}
