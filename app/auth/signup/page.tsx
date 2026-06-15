'use client';

/**
 * /app/auth/signup/page.tsx
 *
 * New user signup. On success:
 *  1. Creates auth user via supabase.auth.signUp
 *  2. Calls /api/onboard to seed: organization + organization_members + teams + team_members
 *  3. Redirects to /dashboard
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createBrowserClient } from '@/lib/simulator/supabase.client';
import { Loader2, AlertCircle, CheckCircle2 } from 'lucide-react';

export default function SignupPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [orgName, setOrgName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<'form' | 'verify'>('form');

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    setLoading(true);
    setError(null);

    const supabase = createBrowserClient();

    // 1. Create auth user
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
        data: { org_name: orgName || email.split('@')[0] },
      },
    });

    if (authError) {
      setError(authError.message);
      setLoading(false);
      return;
    }

    // 2. If session exists immediately (email confirm disabled), seed org & redirect
    if (authData.session) {
      await seedOrganization(authData.session.access_token, orgName || email.split('@')[0]);
      router.push('/dashboard');
      router.refresh();
      return;
    }

    // 3. Email confirmation required — show verify step
    setStep('verify');
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-[#08080f] flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="flex justify-center mb-8">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-amber-500 to-amber-600 flex items-center justify-center font-bold text-black text-xl">
            AL
          </div>
        </div>

        {step === 'verify' ? (
          <VerifyStep email={email} />
        ) : (
          <>
            <h1 className="text-2xl font-bold text-white text-center mb-2">
              Create your account
            </h1>
            <p className="text-slate-500 text-sm text-center mb-8">
              Free simulator — no credit card needed
            </p>

            <form onSubmit={handleSignup} className="space-y-4">
              <div>
                <label className="block text-sm text-slate-400 mb-1.5">
                  Company / Team name
                </label>
                <input
                  type="text"
                  value={orgName}
                  onChange={(e) => setOrgName(e.target.value)}
                  className="w-full bg-[#0d0d1a] border border-[#1e1e3a] rounded-lg px-4 py-2.5 text-white placeholder-slate-600 focus:outline-none focus:border-amber-500/50 transition-colors text-sm"
                  placeholder="e.g. Al Farouq Capital"
                />
              </div>

              <div>
                <label className="block text-sm text-slate-400 mb-1.5">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="w-full bg-[#0d0d1a] border border-[#1e1e3a] rounded-lg px-4 py-2.5 text-white placeholder-slate-600 focus:outline-none focus:border-amber-500/50 transition-colors text-sm"
                  placeholder="you@company.com"
                />
              </div>

              <div>
                <label className="block text-sm text-slate-400 mb-1.5">Password</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={8}
                  className="w-full bg-[#0d0d1a] border border-[#1e1e3a] rounded-lg px-4 py-2.5 text-white placeholder-slate-600 focus:outline-none focus:border-amber-500/50 transition-colors text-sm"
                  placeholder="8+ characters"
                />
              </div>

              {error && (
                <div className="flex items-center gap-2 text-xs text-red-400 bg-red-500/5 border border-red-500/20 rounded-lg px-3 py-2">
                  <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-amber-500 hover:bg-amber-400 text-black font-bold py-2.5 rounded-lg transition-colors disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Creating account...
                  </>
                ) : (
                  'Launch Simulator'
                )}
              </button>
            </form>

            <p className="text-center text-sm text-slate-600 mt-6">
              Already have an account?{' '}
              <Link
                href="/auth/login"
                className="text-amber-400 hover:text-amber-300 transition-colors"
              >
                Sign in
              </Link>
            </p>

            <p className="text-center text-xs text-slate-700 mt-4">
              By signing up you agree to our terms. We never share your data.
            </p>
          </>
        )}
      </div>
    </div>
  );
}

function VerifyStep({ email }: { email: string }) {
  return (
    <div className="text-center">
      <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 flex items-center justify-center mx-auto mb-6">
        <CheckCircle2 className="w-8 h-8 text-emerald-400" />
      </div>
      <h2 className="text-xl font-bold text-white mb-2">Check your email</h2>
      <p className="text-slate-500 text-sm mb-6">
        We sent a confirmation link to{' '}
        <span className="text-slate-300 font-medium">{email}</span>.
        Click it to activate your account and start simulating.
      </p>
      <Link
        href="/auth/login"
        className="text-sm text-amber-400 hover:text-amber-300 transition-colors"
      >
        Return to sign in
      </Link>
    </div>
  );
}

async function seedOrganization(accessToken: string, orgName: string) {
  try {
    await fetch('/api/onboard', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ orgName }),
    });
  } catch {
    // Non-fatal — user can still reach dashboard, org seed retried on next load
  }
}
