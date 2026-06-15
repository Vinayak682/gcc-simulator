/**
 * /app/simulator/[sessionId]/overview/page.tsx
 *
 * Main game overview RSC. Server-renders everything above the fold,
 * hydrates only the interactive client components (chart, feed, advisor).
 *
 * Layout:
 *   ┌──────────────────────────────────────────────────┐
 *   │  Share Price Chart (full width)                   │
 *   ├──────────────────────────────────────────────────┤
 *   │  KPI Row (6 cards)                               │
 *   ├─────────────────────────┬────────────────────────┤
 *   │  Pending Decisions      │  Agent Feed            │
 *   │  (left col)             │  (right col)           │
 *   └─────────────────────────┴────────────────────────┘
 *   │  Tariq Advisor Chat (bottom)                     │
 *   └──────────────────────────────────────────────────┘
 */

import { notFound, redirect } from 'next/navigation';
import { Suspense } from 'react';
import { createSupabaseServer, requireAuth } from '@/lib/simulator/supabase';
import { SharePriceChart } from '@/components/simulator/SharePriceChart';
import { DecisionCard } from '@/components/simulator/DecisionCard';
import { AgentFeed } from '@/components/simulator/AgentFeed';
import { AdvanceMonthButton } from '@/components/simulator/AdvanceMonthButton';
import { TariqAdvisor } from '@/components/simulator/TariqAdvisor';
import {
  TrendingUp,
  TrendingDown,
  Minus,
  Package,
  DollarSign,
  BarChart2,
  Users,
  Clock,
  Truck,
} from 'lucide-react';

export default async function OverviewPage({
  params,
}: {
  params: { sessionId: string };
}) {
  const supabase = createSupabaseServer();

  try {
    await requireAuth();
  } catch {
    redirect('/auth/login');
  }

  const { sessionId } = params;

  // Load all data for the overview
  const [
    { data: session },
    { data: priceHistory },
    { data: decisions },
    { data: activities },
    { data: kpis },
    { data: prevKPIs },
  ] = await Promise.all([
    supabase
      .from('sim_sessions')
      .select('*, sim_scenarios(*)')
      .eq('id', sessionId)
      .single(),

    supabase
      .from('sim_share_price_history')
      .select('*')
      .eq('session_id', sessionId)
      .order('month', { ascending: true }),

    supabase
      .from('sim_decisions')
      .select('*')
      .eq('session_id', sessionId)
      .eq('month', 0) // will be overridden below
      .limit(0), // placeholder

    supabase
      .from('agent_activity_log')
      .select('*')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: false })
      .limit(40),

    supabase
      .from('sim_kpi_snapshots')
      .select('*')
      .eq('session_id', sessionId)
      .order('month', { ascending: false })
      .limit(1)
      .single(),

    supabase
      .from('sim_kpi_snapshots')
      .select('*')
      .eq('session_id', sessionId)
      .order('month', { ascending: false })
      .range(1, 1)
      .single(),
  ]);

  if (!session) notFound();

  const currentMonth = session.current_month;

  // Load decisions for current month
  const { data: currentDecisions } = await supabase
    .from('sim_decisions')
    .select('*')
    .eq('session_id', sessionId)
    .eq('month', currentMonth)
    .order('created_at', { ascending: true });

  const pendingDecisions = (currentDecisions ?? []).filter((d) => d.status === 'pending');
  const decidedDecisions = (currentDecisions ?? []).filter((d) => d.status === 'decided');

  const scenario = session.sim_scenarios;
  const latestKPIs = kpis;
  const previousKPIs = prevKPIs;

  // Compute KPI deltas
  function delta(curr: number | null | undefined, prev: number | null | undefined) {
    if (curr == null || prev == null || prev === 0) return null;
    return ((curr - prev) / Math.abs(prev)) * 100;
  }

  const kpiCards = [
    {
      label: 'Revenue',
      value: latestKPIs?.revenue_aed
        ? `AED ${(latestKPIs.revenue_aed / 1_000_000).toFixed(1)}M`
        : '—',
      delta: delta(latestKPIs?.revenue_aed, previousKPIs?.revenue_aed),
      icon: TrendingUp,
      color: 'text-emerald-400',
      bg: 'bg-emerald-400/10',
    },
    {
      label: 'EBITDA Margin',
      value: latestKPIs?.ebitda_margin != null
        ? `${(latestKPIs.ebitda_margin * 100).toFixed(1)}%`
        : '—',
      delta: delta(latestKPIs?.ebitda_margin, previousKPIs?.ebitda_margin),
      icon: BarChart2,
      color: 'text-blue-400',
      bg: 'bg-blue-400/10',
    },
    {
      label: 'Market Share',
      value: latestKPIs?.market_share != null
        ? `${latestKPIs.market_share.toFixed(1)}%`
        : '—',
      delta: delta(latestKPIs?.market_share, previousKPIs?.market_share),
      icon: Users,
      color: 'text-purple-400',
      bg: 'bg-purple-400/10',
    },
    {
      label: 'Fill Rate',
      value: latestKPIs?.fill_rate != null
        ? `${(latestKPIs.fill_rate * 100).toFixed(1)}%`
        : '—',
      delta: delta(latestKPIs?.fill_rate, previousKPIs?.fill_rate),
      icon: Truck,
      color: 'text-amber-400',
      bg: 'bg-amber-400/10',
    },
    {
      label: 'Cash Position',
      value: latestKPIs?.cash_aed != null
        ? `AED ${(latestKPIs.cash_aed / 1_000_000).toFixed(1)}M`
        : '—',
      delta: delta(latestKPIs?.cash_aed, previousKPIs?.cash_aed),
      icon: DollarSign,
      color: 'text-emerald-400',
      bg: 'bg-emerald-400/10',
    },
    {
      label: 'Receivable Days',
      value: latestKPIs?.receivable_days != null
        ? `${Math.round(latestKPIs.receivable_days)}d`
        : '—',
      delta: delta(latestKPIs?.receivable_days, previousKPIs?.receivable_days),
      invertDelta: true,
      icon: Clock,
      color: 'text-orange-400',
      bg: 'bg-orange-400/10',
    },
  ];

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">
            {scenario.name}
          </h1>
          <p className="text-slate-500 text-sm mt-0.5">
            Month {currentMonth} of {session.total_months} •{' '}
            <span className="capitalize">{scenario.game_mode}</span> Mode •{' '}
            <span className="capitalize">{scenario.difficulty}</span>
          </p>
        </div>

        <AdvanceMonthButton
          sessionId={sessionId}
          currentMonth={currentMonth}
          totalMonths={session.total_months}
          pendingDecisionsCount={pendingDecisions.length}
          sessionStatus={session.status}
        />
      </div>

      {/* Share Price Chart */}
      <div className="rounded-xl border border-[#1e1e3a] bg-[#0d0d1a] p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-white">DFM: ALMAN Share Price</h2>
          <div className="text-xs text-slate-500 font-mono">
            AED {(priceHistory?.[priceHistory.length - 1]?.price_aed ?? scenario.initial_share_price).toFixed(2)}
          </div>
        </div>
        <div className="h-48">
          <SharePriceChart
            history={priceHistory ?? []}
            initialPrice={scenario.initial_share_price}
            winTargetPrice={scenario.win_target_price}
            currentMonth={currentMonth}
          />
        </div>
      </div>

      {/* KPI Cards Row */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {kpiCards.map(({ label, value, delta: d, icon: Icon, color, bg, invertDelta }) => {
          const isPositive = invertDelta ? (d ?? 0) < 0 : (d ?? 0) > 0;
          const isNegative = invertDelta ? (d ?? 0) > 0 : (d ?? 0) < 0;
          const DeltaIcon = d == null ? Minus : isPositive ? TrendingUp : isNegative ? TrendingDown : Minus;
          const deltaColor = isPositive ? 'text-emerald-400' : isNegative ? 'text-red-400' : 'text-slate-500';

          return (
            <div
              key={label}
              className="rounded-xl border border-[#1e1e3a] bg-[#0d0d1a] p-4"
            >
              <div className="flex items-center gap-2 mb-2">
                <div className={`p-1.5 rounded-lg ${bg}`}>
                  <Icon className={`w-3.5 h-3.5 ${color}`} />
                </div>
                <span className="text-[11px] text-slate-500">{label}</span>
              </div>
              <div className="text-white font-mono font-bold text-lg leading-none mb-1">
                {value}
              </div>
              {d != null && (
                <div className={`flex items-center gap-1 text-[11px] ${deltaColor}`}>
                  <DeltaIcon className="w-3 h-3" />
                  <span>{Math.abs(d).toFixed(1)}% MoM</span>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Two-column: Decisions + Agent Feed */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Decisions column */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-white">
              Month {currentMonth} Decisions
            </h2>
            {pendingDecisions.length > 0 && (
              <span className="text-xs bg-amber-500/20 text-amber-400 px-2 py-0.5 rounded-full font-medium">
                {pendingDecisions.length} pending
              </span>
            )}
          </div>

          <div className="space-y-3">
            {pendingDecisions.length === 0 && decidedDecisions.length === 0 && (
              <div className="rounded-xl border border-[#1e1e3a] bg-[#0d0d1a] p-8 text-center">
                <Package className="w-8 h-8 text-slate-700 mx-auto mb-2" />
                <p className="text-slate-600 text-sm">
                  No decisions for Month {currentMonth} yet.
                </p>
                <p className="text-slate-700 text-xs mt-1">
                  Advance to the next month to unlock decisions.
                </p>
              </div>
            )}

            {pendingDecisions.map((decision) => (
              <DecisionCard
                key={decision.id}
                decision={decision}
                sessionId={sessionId}
                onDecided={() => {}}
              />
            ))}

            {decidedDecisions.length > 0 && (
              <div>
                <div className="text-xs text-slate-600 mb-2">
                  Completed ({decidedDecisions.length})
                </div>
                {decidedDecisions.map((decision) => (
                  <DecisionCard
                    key={decision.id}
                    decision={decision}
                    sessionId={sessionId}
                    onDecided={() => {}}
                  />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Agent Feed column */}
        <div>
          <h2 className="text-sm font-semibold text-white mb-3">Agent Activity</h2>
          <div className="rounded-xl border border-[#1e1e3a] bg-[#0d0d1a] p-4 h-[480px]">
            <AgentFeed
              sessionId={sessionId}
              initialActivities={activities ?? []}
            />
          </div>
        </div>
      </div>

      {/* Tariq Advisor Chat */}
      <div>
        <h2 className="text-sm font-semibold text-white mb-3">
          Ask Tariq — Your Strategy Advisor
        </h2>
        <TariqAdvisor sessionId={sessionId} currentMonth={currentMonth} />
      </div>
    </div>
  );
}
