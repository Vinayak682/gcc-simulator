/**
 * Root page — redirects logged-in users to /dashboard,
 * shows landing for unauthenticated visitors.
 */

import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createSupabaseServer } from '@/lib/simulator/supabase';
import { ChevronRight, Zap, BarChart2, Globe, Shield } from 'lucide-react';

export default async function HomePage() {
  const supabase = createSupabaseServer();
  const { data: { session } } = await supabase.auth.getSession();

  if (session) {
    redirect('/dashboard');
  }

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
        <div className="flex items-center gap-3">
          <Link
            href="/auth/login"
            className="text-sm text-slate-400 hover:text-white transition-colors"
          >
            Sign in
          </Link>
          <Link
            href="/auth/signup"
            className="text-sm bg-amber-500 hover:bg-amber-400 text-black font-semibold px-4 py-2 rounded-lg transition-colors"
          >
            Start Playing
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <div className="pt-32 pb-20 px-6 max-w-4xl mx-auto text-center">
        <div className="inline-flex items-center gap-2 text-xs font-semibold text-amber-400 bg-amber-400/10 border border-amber-400/20 rounded-full px-4 py-1.5 mb-8">
          <span>🚀</span>
          <span>ProductHunt Launch — GCC Business Simulator</span>
        </div>

        <h1 className="text-5xl md:text-6xl font-black text-white mb-6 leading-tight">
          Run a Dubai-Listed
          <br />
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-400 to-amber-600">
            FMCG Empire
          </span>
        </h1>

        <p className="text-xl text-slate-400 mb-10 max-w-2xl mx-auto leading-relaxed">
          Step into the boardroom of Al Manar Industries as MD/CEO.
          8 autonomous AI agents advise and act in real time.
          Navigate Ramadan surges, summer cold-chain disruptions,
          and DFM share price volatility.
        </p>

        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Link
            href="/auth/signup"
            className="flex items-center justify-center gap-2 bg-gradient-to-r from-amber-500 to-amber-400 hover:from-amber-400 hover:to-amber-300 text-black font-bold px-8 py-4 rounded-xl text-lg transition-all shadow-lg shadow-amber-500/20"
          >
            Launch Simulator
            <ChevronRight className="w-5 h-5" />
          </Link>
          <Link
            href="/auth/login"
            className="flex items-center justify-center gap-2 border border-[#1e1e3a] hover:border-[#2a2a5a] text-slate-300 px-8 py-4 rounded-xl text-lg transition-colors"
          >
            Sign In
          </Link>
        </div>
      </div>

      {/* Feature grid */}
      <div className="max-w-5xl mx-auto px-6 pb-24 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          {
            icon: Zap,
            color: 'text-amber-400',
            bg: 'bg-amber-400/10',
            title: '8 AI Agents',
            desc: 'Tariq, Zara, Omar, Nadia, Faris, Leila, Priya & the Board — each running live autonomy logic every 60 seconds.',
          },
          {
            icon: BarChart2,
            color: 'text-blue-400',
            bg: 'bg-blue-400/10',
            title: 'DFM Share Price',
            desc: '3-layer pricing model: fundamentals (60%) + market events (25%) + sentiment drift (15%). Real GCC volatility.',
          },
          {
            icon: Globe,
            color: 'text-emerald-400',
            bg: 'bg-emerald-400/10',
            title: 'GCC Mechanics',
            desc: 'Ramadan demand spikes, summer cold chain drag, Saudization fines, VAT (UAE/KSA), DFM disclosure rules.',
          },
          {
            icon: Shield,
            color: 'text-purple-400',
            bg: 'bg-purple-400/10',
            title: 'Win / Lose',
            desc: 'Turnaround, Growth or Expansion mode. Circuit breakers for cash-out, fill rate collapse, or price floor breach.',
          },
        ].map(({ icon: Icon, color, bg, title, desc }) => (
          <div
            key={title}
            className="rounded-xl border border-[#1e1e3a] bg-[#0d0d1a] p-5"
          >
            <div className={`p-2.5 rounded-xl ${bg} w-fit mb-4`}>
              <Icon className={`w-5 h-5 ${color}`} />
            </div>
            <h3 className="font-bold text-white mb-2">{title}</h3>
            <p className="text-sm text-slate-500 leading-relaxed">{desc}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
