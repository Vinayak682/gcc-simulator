'use client';

/**
 * /app/sessions/new/page.tsx
 *
 * Scenario picker — shows the 3 seeded scenarios and lets the player start a game.
 * Calls POST /api/sessions then redirects to the new session's overview.
 */

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Loader2, ChevronRight, Trophy, TrendingUp, Globe, AlertCircle } from 'lucide-react';

const SCENARIOS = [
  {
    id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    name: 'Turnaround — Al Manar FY2025',
    mode: 'turnaround',
    description:
      'You have inherited Al Manar Industries at a critical inflection point. Share price has fallen 38% from IPO. The board has given you 12 months to restore investor confidence.',
    difficulty: 'hard',
    months: 12,
    startPrice: 9.2,
    winTarget: 18.0,
    icon: Trophy,
    color: 'text-amber-400',
    bg: 'bg-amber-400/10',
    border: 'border-amber-400/30',
    tag: '🔥 Most Popular',
  },
  {
    id: 'b2c3d4e5-f6a7-8901-bcde-f01234567891',
    name: 'Growth Mode — FY2025',
    mode: 'growth',
    description:
      'Healthy operations with ambitious growth targets. Scale revenue from AED 2.8B to AED 3.5B while protecting EBITDA margin above 14%.',
    difficulty: 'medium',
    months: 24,
    startPrice: 15.0,
    winTarget: 22.0,
    icon: TrendingUp,
    color: 'text-emerald-400',
    bg: 'bg-emerald-400/10',
    border: 'border-emerald-400/30',
    tag: '⭐ Beginner Friendly',
  },
  {
    id: 'c3d4e5f6-a7b8-9012-cdef-012345678902',
    name: 'GCC Expansion — FY2025-2027',
    mode: 'expansion',
    description:
      'Dominate the Gulf. Successful UAE operations provide a launchpad. Enter 2 new GCC markets while maintaining DFM listing above AED 15.00.',
    difficulty: 'expert',
    months: 36,
    startPrice: 15.0,
    winTarget: 30.0,
    icon: Globe,
    color: 'text-blue-400',
    bg: 'bg-blue-400/10',
    border: 'border-blue-400/30',
    tag: '💀 Expert Only',
  },
];

const DIFFICULTY_COLOR: Record<string, string> = {
  easy: 'text-emerald-400',
  medium: 'text-amber-400',
  hard: 'text-orange-400',
  expert: 'text-red-400',
};

export default function NewSessionPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const teamId = searchParams.get('teamId');

  const [selectedId, setSelectedId] = useState<string>(SCENARIOS[0].id);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!teamId) router.push('/dashboard');
  }, [teamId, router]);

  const handleStart = async () => {
    if (!teamId || !selectedId) return;
    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ teamId, scenarioId: selectedId }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }

      const { session } = await res.json();
      router.push(`/simulator/${session.id}/overview`);
    } catch (err: any) {
      setError(err.message ?? 'Failed to create session');
      setLoading(false);
    }
  };

  const selected = SCENARIOS.find((s) => s.id === selectedId)!;

  return (
    <div className="min-h-screen bg-[#08080f] text-white">
      {/* Nav */}
      <nav className="fixed top-0 left-0 right-0 z-50 h-16 bg-[#08080f]/80 backdrop-blur border-b border-[#1e1e3a] flex items-center justify-between px-6">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-500 to-amber-600 flex items-center justify-center font-bold text-black text-sm">
            AL
          </div>
          <span className="font-semibold text-white">Al Manar Industries</span>
        </div>
        <Link
          href="/dashboard"
          className="text-sm text-slate-400 hover:text-white transition-colors"
        >
          ← Dashboard
        </Link>
      </nav>

      <div className="pt-24 pb-16 px-6 max-w-4xl mx-auto">
        <div className="mb-10">
          <h1 className="text-3xl font-black text-white mb-2">Choose Your Scenario</h1>
          <p className="text-slate-500">
            Each scenario starts with different financial conditions and win targets.
          </p>
        </div>

        {/* Scenario cards */}
        <div className="grid gap-4 mb-8">
          {SCENARIOS.map((scenario) => {
            const Icon = scenario.icon;
            const isSelected = scenario.id === selectedId;

            return (
              <button
                key={scenario.id}
                onClick={() => setSelectedId(scenario.id)}
                className={`w-full text-left rounded-xl border p-6 transition-all ${
                  isSelected
                    ? `${scenario.border} bg-[#0d0d1a]`
                    : 'border-[#1e1e3a] bg-[#0d0d1a] hover:border-[#2a2a5a]'
                }`}
              >
                <div className="flex items-start gap-4">
                  <div className={`p-2.5 rounded-xl ${scenario.bg} flex-shrink-0`}>
                    <Icon className={`w-5 h-5 ${scenario.color}`} />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 flex-wrap mb-1.5">
                      <h3 className="font-bold text-white">{scenario.name}</h3>
                      <span className="text-[10px] text-slate-500 bg-slate-800 px-2 py-0.5 rounded-full">
                        {scenario.tag}
                      </span>
                    </div>

                    <p className="text-sm text-slate-500 mb-4 leading-relaxed">
                      {scenario.description}
                    </p>

                    <div className="flex flex-wrap gap-x-6 gap-y-2 text-xs">
                      <span className="text-slate-400">
                        Difficulty:{' '}
                        <span
                          className={`font-semibold capitalize ${
                            DIFFICULTY_COLOR[scenario.difficulty]
                          }`}
                        >
                          {scenario.difficulty}
                        </span>
                      </span>
                      <span className="text-slate-400">
                        Duration:{' '}
                        <span className="text-white font-semibold">
                          {scenario.months} months
                        </span>
                      </span>
                      <span className="text-slate-400">
                        Start price:{' '}
                        <span className="text-white font-mono font-semibold">
                          AED {scenario.startPrice.toFixed(2)}
                        </span>
                      </span>
                      <span className="text-slate-400">
                        Win target:{' '}
                        <span className="text-emerald-400 font-mono font-semibold">
                          AED {scenario.winTarget.toFixed(2)}
                        </span>
                      </span>
                    </div>
                  </div>

                  {/* Radio */}
                  <div
                    className={`w-5 h-5 rounded-full border-2 flex-shrink-0 mt-1 flex items-center justify-center transition-colors ${
                      isSelected
                        ? 'border-amber-500 bg-amber-500'
                        : 'border-slate-600'
                    }`}
                  >
                    {isSelected && (
                      <div className="w-2 h-2 rounded-full bg-black" />
                    )}
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {/* Error */}
        {error && (
          <div className="flex items-center gap-2 text-sm text-red-400 bg-red-500/5 border border-red-500/20 rounded-lg px-4 py-3 mb-6">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            {error}
          </div>
        )}

        {/* CTA */}
        <div className="flex items-center justify-between gap-4">
          <div className="text-sm text-slate-500">
            Selected:{' '}
            <span className="text-white font-medium">{selected.name}</span>
          </div>

          <button
            onClick={handleStart}
            disabled={loading || !teamId}
            className="flex items-center gap-2 bg-amber-500 hover:bg-amber-400 text-black font-bold px-6 py-3 rounded-xl transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Starting simulation...
              </>
            ) : (
              <>
                Start as MD/CEO
                <ChevronRight className="w-4 h-4" />
              </>
            )}
          </button>
        </div>

        <p className="text-xs text-slate-700 mt-4 text-center">
          8 AI agents will be assigned to your session automatically.
          They'll start acting within 60 seconds of simulation start.
        </p>
      </div>
    </div>
  );
}
