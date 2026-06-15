'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createBrowserClient } from '@/lib/simulator/supabase.client';
import { Loader2, AlertCircle } from 'lucide-react';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const supabase = createBrowserClient();
    const { error: authError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (authError) {
      setError(authError.message);
      setLoading(false);
      return;
    }

    // Seed org + team if this user doesn't have one yet (idempotent — safe to always call)
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.access_token) {
        await fetch('/api/onboard', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({}),
        });
      }
    } catch {
      // Non-fatal — dashboard will auto-seed as fallback
    }

    router.push('/dashboard');
    router.refresh();
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

        <h1 className="text-2xl font-bold text-white text-center mb-2">Welcome back</h1>
        <p className="text-slate-500 text-sm text-center mb-8">
          Sign in to Al Manar Industries
        </p>

        <form onSubmit={handleLogin} className="space-y-4">
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
              className="w-full bg-[#0d0d1a] border border-[#1e1e3a] rounded-lg px-4 py-2.5 text-white placeholder-slate-600 focus:outline-none focus:border-amber-500/50 transition-colors text-sm"
              placeholder="••••••••"
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
                Signing in...
              </>
            ) : (
              'Sign In'
            )}
          </button>
        </form>

        <p className="text-center text-sm text-slate-600 mt-6">
          No account?{' '}
          <Link href="/auth/signup" className="text-amber-400 hover:text-amber-300 transition-colors">
            Create one free
          </Link>
        </p>
      </div>
    </div>
  );
}
