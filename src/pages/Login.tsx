import React, { useState } from 'react';
import { Navigate } from 'react-router';
import { LayoutDashboard } from 'lucide-react';
import { useAuth } from '../lib/AuthContext';

type AuthMode = 'signIn' | 'signUp' | 'reset';

type FeedbackState = {
  tone: 'error' | 'success';
  message: string;
} | null;

function getAuthErrorMessage(error: any) {
  switch (error?.code) {
    case 'auth/invalid-credential':
      return 'Invalid email or password.';
    case 'auth/email-already-in-use':
      return 'This email is already registered.';
    case 'auth/weak-password':
      return 'Password must be at least 6 characters.';
    case 'auth/too-many-requests':
      return 'Too many attempts. Please wait and try again.';
    case 'auth/network-request-failed':
      return 'Network error. Check your connection and try again.';
    default:
      return 'Authentication failed. Please try again.';
  }
}

export function Login() {
  const { user, accessState, authNotice, clearAuthNotice, signIn, signUp, resetPassword, logOut } = useAuth();
  const [mode, setMode] = useState<AuthMode>('signIn');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<FeedbackState>(null);

  if (user && accessState === 'active') {
    return <Navigate to="/" replace />;
  }

  const isResetMode = mode === 'reset';
  const isSignUpMode = mode === 'signUp';

  const handleModeChange = (nextMode: AuthMode) => {
    setMode(nextMode);
    clearAuthNotice();
    setFeedback(null);
    setPassword('');
    setConfirmPassword('');
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) {
      setFeedback({ tone: 'error', message: 'Email is required.' });
      return;
    }

    if (!isResetMode && !password) {
      setFeedback({ tone: 'error', message: 'Password is required.' });
      return;
    }

    if (isSignUpMode && password !== confirmPassword) {
      setFeedback({ tone: 'error', message: 'Passwords do not match.' });
      return;
    }

    setSubmitting(true);
    clearAuthNotice();
    setFeedback(null);

    try {
      if (mode === 'signIn') {
        await signIn(normalizedEmail, password);
      } else if (mode === 'signUp') {
        await signUp(normalizedEmail, password);
      } else {
        await resetPassword(normalizedEmail);
        setFeedback({
          tone: 'success',
          message: 'Reset link sent. Check your inbox.'
        });
      }
    } catch (error: any) {
      const message = error?.code === 'auth/account-not-provisioned'
        ? 'Account not provisioned. Please contact an admin.'
        : getAuthErrorMessage(error);

      setFeedback({
        tone: 'error',
        message
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#f9f9f9] px-4 py-6 text-[#000000] [font-family:Inter,system-ui,sans-serif] sm:px-6 sm:py-8 lg:px-8 lg:py-12">
      <div className="mx-auto flex min-h-[calc(100vh-3rem)] w-full max-w-5xl items-center justify-center">
        <div className="w-full max-w-md sm:max-w-lg lg:max-w-xl">
        <div className="mb-8 border-b border-[#c4c7c5] pb-6 text-center sm:mb-10 sm:pb-8">
          <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center border border-[#747775] bg-[#000000] text-[#ffffff] sm:h-20 sm:w-20">
            <LayoutDashboard size={32} />
          </div>
          <h1 className="text-[36px] font-bold leading-[44px] tracking-[-0.25px] text-[#000000] sm:text-[45px] sm:leading-[52px]">
            Ops Control Center
          </h1>
          <p className="mt-3 text-[14px] font-normal leading-5 tracking-[0.25px] text-[#444746] sm:text-[16px] sm:leading-6 sm:tracking-[0.5px]">
            Sign in with your work email.
          </p>
        </div>

        <div className="border border-[#747775] bg-[#ffffff] p-5 sm:p-8">
          {user && accessState && accessState !== 'active' ? (
            <div className="space-y-5">
              <div className={`border px-5 py-4 ${
                accessState === 'invited'
                  ? 'border-[#c4c7c5] bg-[#eeeeee]'
                  : 'border-[#ba1a1a] bg-[#ffdad6]'
              }`}>
                <p className={`text-[14px] font-semibold leading-5 tracking-[0.1px] ${
                  accessState === 'invited' ? 'text-[#111111]' : 'text-[#410002]'
                }`}>
                  {accessState === 'invited' && 'Account pending'}
                  {accessState === 'suspended' && 'Account suspended'}
                  {accessState === 'not_provisioned' && 'Account not provisioned'}
                </p>
                <p className={`mt-2 text-[14px] font-normal leading-5 tracking-[0.25px] ${
                  accessState === 'invited' ? 'text-[#444746]' : 'text-[#410002]'
                }`}>
                  {authNotice || 'You do not have access to the workspace yet.'}
                </p>
              </div>

              <button
                type="button"
                onClick={logOut}
                className="w-full border border-[#747775] bg-[#ffffff] px-4 py-3 text-[14px] font-medium leading-5 tracking-[0.1px] text-[#000000] transition-colors hover:bg-[#f3f3f3]"
              >
                Log Out
              </button>
            </div>
          ) : (
            <>
          <div className="grid grid-cols-3 border border-[#c4c7c5] bg-[#eeeeee]">
            <button
              type="button"
              onClick={() => handleModeChange('signIn')}
              className={`border-r border-[#c4c7c5] px-3 py-3 text-[12px] font-medium uppercase leading-4 tracking-[0.5px] transition-colors sm:text-[14px] sm:normal-case sm:tracking-[0.1px] ${
                mode === 'signIn'
                  ? 'bg-[#ffffff] text-[#000000]'
                  : 'bg-[#eeeeee] text-[#444746] hover:bg-[#e2e2e2] hover:text-[#000000]'
              }`}
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => handleModeChange('signUp')}
              className={`border-r border-[#c4c7c5] px-3 py-3 text-[12px] font-medium uppercase leading-4 tracking-[0.5px] transition-colors sm:text-[14px] sm:normal-case sm:tracking-[0.1px] ${
                mode === 'signUp'
                  ? 'bg-[#ffffff] text-[#000000]'
                  : 'bg-[#eeeeee] text-[#444746] hover:bg-[#e2e2e2] hover:text-[#000000]'
              }`}
            >
              Sign Up
            </button>
            <button
              type="button"
              onClick={() => handleModeChange('reset')}
              className={`px-3 py-3 text-[12px] font-medium uppercase leading-4 tracking-[0.5px] transition-colors sm:text-[14px] sm:normal-case sm:tracking-[0.1px] ${
                mode === 'reset'
                  ? 'bg-[#ffffff] text-[#000000]'
                  : 'bg-[#eeeeee] text-[#444746] hover:bg-[#e2e2e2] hover:text-[#000000]'
              }`}
            >
              Reset
            </button>
          </div>

          <div className="mt-8 border-b border-[#c4c7c5] pb-4">
            <h2 className="text-[24px] font-semibold leading-8 text-[#000000] sm:text-[28px] sm:leading-9">
              {mode === 'signIn' && 'Sign in'}
              {mode === 'signUp' && 'Create account'}
              {mode === 'reset' && 'Reset password'}
            </h2>
            <p className="mt-2 text-[14px] font-normal leading-5 tracking-[0.25px] text-[#444746]">
              {mode === 'signIn' && 'Enter your details to continue.'}
              {mode === 'signUp' && 'Use your work email and a password.'}
              {mode === 'reset' && 'We will email a reset link.'}
            </p>
          </div>

          {(feedback || authNotice) && (
            <div
              className={`mt-5 border px-4 py-3 text-[14px] font-medium leading-5 tracking-[0.1px] ${
                feedback?.tone === 'success'
                  ? 'border-[#c4c7c5] bg-[#eeeeee] text-[#111111]'
                  : 'border-[#ba1a1a] bg-[#ffdad6] text-[#410002]'
              }`}
            >
              {feedback?.message || authNotice}
            </div>
          )}

          <form onSubmit={handleSubmit} className="mt-6 space-y-5">
            <div>
              <label htmlFor="email" className="mb-2 block text-[12px] font-medium uppercase leading-4 tracking-[0.5px] text-[#444746] sm:text-[14px] sm:normal-case sm:tracking-[0.1px]">
                Email
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                disabled={submitting}
                className="w-full border border-[#747775] bg-[#ffffff] px-4 py-3 text-[16px] font-normal leading-6 tracking-[0.5px] text-[#000000] outline-none transition focus:border-[#000000] focus:bg-[#f9f9f9] disabled:bg-[#f3f3f3] disabled:text-[#747775]"
                placeholder="name@company.com"
              />
            </div>

            {!isResetMode && (
              <div>
                <label htmlFor="password" className="mb-2 block text-[12px] font-medium uppercase leading-4 tracking-[0.5px] text-[#444746] sm:text-[14px] sm:normal-case sm:tracking-[0.1px]">
                  Password
                </label>
                <input
                  id="password"
                  type="password"
                  autoComplete={isSignUpMode ? 'new-password' : 'current-password'}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  disabled={submitting}
                  minLength={6}
                className="w-full border border-[#747775] bg-[#ffffff] px-4 py-3 text-[16px] font-normal leading-6 tracking-[0.5px] text-[#000000] outline-none transition focus:border-[#000000] focus:bg-[#f9f9f9] disabled:bg-[#f3f3f3] disabled:text-[#747775]"
                placeholder="Password"
              />
            </div>
            )}

            {isSignUpMode && (
              <div>
                <label htmlFor="confirmPassword" className="mb-2 block text-[12px] font-medium uppercase leading-4 tracking-[0.5px] text-[#444746] sm:text-[14px] sm:normal-case sm:tracking-[0.1px]">
                  Confirm Password
                </label>
                <input
                  id="confirmPassword"
                  type="password"
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  disabled={submitting}
                  minLength={6}
                  className="w-full border border-[#747775] bg-[#ffffff] px-4 py-3 text-[16px] font-normal leading-6 tracking-[0.5px] text-[#000000] outline-none transition focus:border-[#000000] focus:bg-[#f9f9f9] disabled:bg-[#f3f3f3] disabled:text-[#747775]"
                  placeholder="Confirm password"
                />
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full border border-[#000000] bg-[#000000] px-4 py-3 text-[14px] font-medium leading-5 tracking-[0.1px] text-[#ffffff] transition-colors hover:bg-[#333333] disabled:cursor-not-allowed disabled:border-[#747775] disabled:bg-[#747775] disabled:text-[#ffffff]"
            >
              {submitting
                ? mode === 'reset'
                  ? 'Sending reset link...'
                  : mode === 'signUp'
                    ? 'Creating account...'
                    : 'Signing in...'
                : mode === 'reset'
                  ? 'Send reset link'
                  : mode === 'signUp'
                    ? 'Create account'
                    : 'Sign In'}
            </button>
          </form>
            </>
          )}
        </div>
      </div>
      </div>
    </div>
  );
}
