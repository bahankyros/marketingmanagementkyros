import React, { useState } from 'react';
import { useNavigate } from 'react-router';
import { KeyRound } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/AuthContext';

type FeedbackState = {
  tone: 'error' | 'success';
  message: string;
} | null;

function getUpdatePasswordErrorMessage(error: any) {
  const message = typeof error?.message === 'string' ? error.message.toLowerCase() : '';

  if (message.includes('session') || message.includes('token')) {
    return 'This recovery link is no longer valid. Request a new reset link.';
  }

  if (message.includes('password')) {
    return 'Password must be at least 6 characters.';
  }

  return 'Unable to update password. Please try again.';
}

export function UpdatePassword() {
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<FeedbackState>(null);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!password || password.length < 6) {
      setFeedback({ tone: 'error', message: 'Password must be at least 6 characters.' });
      return;
    }

    if (password !== confirmPassword) {
      setFeedback({ tone: 'error', message: 'Passwords do not match.' });
      return;
    }

    setSubmitting(true);
    setFeedback(null);

    try {
      const { error } = await supabase.auth.updateUser({ password });

      if (error) throw error;

      setPassword('');
      setConfirmPassword('');
      setFeedback({ tone: 'success', message: 'Password updated. You can continue to the portal.' });
    } catch (error) {
      console.error('Error updating password:', error);
      setFeedback({ tone: 'error', message: getUpdatePasswordErrorMessage(error) });
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
              <KeyRound size={32} />
            </div>
            <h1 className="text-[36px] font-bold leading-[44px] tracking-[-0.25px] text-[#000000] sm:text-[45px] sm:leading-[52px]">
              Update Password
            </h1>
            <p className="mt-3 text-[14px] font-normal leading-5 tracking-[0.25px] text-[#444746] sm:text-[16px] sm:leading-6 sm:tracking-[0.5px]">
              Create a new password for your Kyros account.
            </p>
          </div>

          <div className="border border-[#747775] bg-[#ffffff] p-5 sm:p-8">
            {!loading && !user && (
              <div className="mb-5 border border-[#ba1a1a] bg-[#ffdad6] px-4 py-3 text-[14px] font-medium leading-5 tracking-[0.1px] text-[#410002]">
                Recovery session not found. Request a new reset link from the login screen.
              </div>
            )}

            {feedback && (
              <div
                className={`mb-5 border px-4 py-3 text-[14px] font-medium leading-5 tracking-[0.1px] ${
                  feedback.tone === 'success'
                    ? 'border-[#c4c7c5] bg-[#eeeeee] text-[#111111]'
                    : 'border-[#ba1a1a] bg-[#ffdad6] text-[#410002]'
                }`}
              >
                {feedback.message}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label htmlFor="new-password" className="mb-2 block text-[12px] font-medium uppercase leading-4 tracking-[0.5px] text-[#444746] sm:text-[14px] sm:normal-case sm:tracking-[0.1px]">
                  New Password
                </label>
                <input
                  id="new-password"
                  type="password"
                  autoComplete="new-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  disabled={submitting || loading || !user}
                  minLength={6}
                  className="w-full border border-[#747775] bg-[#ffffff] px-4 py-3 text-[16px] font-normal leading-6 tracking-[0.5px] text-[#000000] outline-none transition focus:border-[#000000] focus:bg-[#f9f9f9] disabled:bg-[#f3f3f3] disabled:text-[#747775]"
                  placeholder="New password"
                />
              </div>

              <div>
                <label htmlFor="confirm-new-password" className="mb-2 block text-[12px] font-medium uppercase leading-4 tracking-[0.5px] text-[#444746] sm:text-[14px] sm:normal-case sm:tracking-[0.1px]">
                  Confirm Password
                </label>
                <input
                  id="confirm-new-password"
                  type="password"
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  disabled={submitting || loading || !user}
                  minLength={6}
                  className="w-full border border-[#747775] bg-[#ffffff] px-4 py-3 text-[16px] font-normal leading-6 tracking-[0.5px] text-[#000000] outline-none transition focus:border-[#000000] focus:bg-[#f9f9f9] disabled:bg-[#f3f3f3] disabled:text-[#747775]"
                  placeholder="Confirm password"
                />
              </div>

              <button
                type="submit"
                disabled={submitting || loading || !user}
                className="w-full border border-[#000000] bg-[#000000] px-4 py-3 text-[14px] font-medium leading-5 tracking-[0.1px] text-[#ffffff] transition-colors hover:bg-[#333333] disabled:cursor-not-allowed disabled:border-[#747775] disabled:bg-[#747775] disabled:text-[#ffffff]"
              >
                {submitting ? 'Updating password...' : 'Update Password'}
              </button>

              <button
                type="button"
                onClick={() => navigate('/login', { replace: true })}
                className="w-full border border-[#747775] bg-[#ffffff] px-4 py-3 text-[14px] font-medium leading-5 tracking-[0.1px] text-[#000000] transition-colors hover:bg-[#f3f3f3]"
              >
                Back to Login
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
