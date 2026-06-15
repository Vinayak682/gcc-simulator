'use client';

/**
 * SimulatorSidebar — Left nav with:
 *   - Section navigation (Overview, Decisions, S&OP, Expansion, Leaderboard)
 *   - KPI mini-cards (5 key metrics with live color coding)
 *   - Active event count badge
 *   - Agent autonomy level display
 *
 * Receives KPI data via props (parent subscribes via Realtime).
 * Navigation is Next.js <Link> — no page reload.
 */

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  ListChecks,
  BarChart3,
  Globe,
  Trophy,
  TrendingUp,
  TrendingDown,
  Minus,
  AlertCircle,
  Zap,
} from 'lucide-react';
import type { SimKPISnapshot, SimGameState, MarketEventSession } from '@/lib/simulator/types';

interface SimulatorSidebarProps {
  sessionId: string;
  kpis: SimKPISnapshot | null;
  gameState: SimGameState | null;
  activeEvents: MarketEventSession[];
  pendingDecisions: number;
}

const NAV_ITEMS = [
  { href: 'overview', label: 'Overview', icon: LayoutDashboard },
  { href: 'decisions', label: 'Decisions', icon: ListChecks, badgeKey: 'pendingDecisions' as const },
  { href: 'sop-cycle', label: 'S&OP Cycle', icon: BarChart3 },
  { href: 'expansion', label: 'Expansion', icon: Globe },
  { href: 'leaderboard', label: 'Leaderboard', icon: Trophy },
];

const KPI_THRESHOLDS = {
  fill_rate: { warning: 0.80, danger: 0.75 },
  ebitda_margin: { warning: 0.08, danger: 0.05 },
  market_share: { warning: 18, danger: 15 },
  cash_aed: { warning: 10_000_000, danger: 5_000_000 },
  receivable_days: { warning: 60, danger: 75 },
};

function kpiStatus(
  key: keyof typeof KPI_THRESHOLDS,
  value: number | null | undefined
): 'good' | 'warning' | 'danger' | 'neutral' {
  if (value == null) return 'neutral';
  const t = KPI_THRESHOLDS[key];
  if (!t) return 'neutral';

  // For receivable_days: higher is worse
  if (key === 'receivable_days') {
    if (value >= t.danger) return 'danger';
    if (value >= t.warning) return 'warning';
    return 'good';
  }
  // For everything else: lower is worse
  if (value <= t.danger) return 'danger';
  if (value <= t.warning) return 'warning';
  return 'good';
}

const STATUS_COLORS = {
  good: 'text-emerald-400',
  warning: 'text-amber-400',
  danger: 'text-red-400',
  neutral: 'text-slate-400',
};

function formatKPIValue(key: string, value: number | null | undefined): string {
  if (value == null) return '—';
  switch (key) {
    case 'fill_rate':
    case 'ebitda_margin':
    case 'market_share':
      return `${(value * (key === 'market_share' ? 1 : 100)).toFixed(1)}%`;
    case 'cash_aed':
      return value >= 1_000_000
        ? `AED ${(value / 1_000_000).toFixed(1)}M`
        : `AED ${(value / 1_000).toFixed(0)}K`;
    case 'receivable_days':
      return `${Math.round(value)}d`;
    default:
      return String(value);
  }
}

export function SimulatorSidebar({
  sessionId,
  kpis,
  gameState,
  activeEvents,
  pendingDecisions,
}: SimulatorSidebarProps) {
  const pathname = usePathname();
  const basePath = `/simulator/${sessionId}`;

  const kpiRows: { key: keyof typeof KPI_THRESHOLDS; label: string }[] = [
    { key: 'fill_rate', label: 'Fill Rate' },
    { key: 'ebitda_margin', label: 'EBITDA Margin' },
    { key: 'market_share', label: 'Market Share' },
    { key: 'cash_aed', label: 'Cash' },
    { key: 'receivable_days', label: 'Recv Days' },
  ];

  return (
    <aside className="fixed left-0 top-16 bottom-0 w-56 bg-[#0a0a15] border-r border-[#1e1e3a] flex flex-col z-40 overflow-y-auto">
      {/* Navigation */}
      <nav className="p-3 space-y-1">
        {NAV_ITEMS.map(({ href, label, icon: Icon, badgeKey }) => {
          const isActive = pathname === `${basePath}/${href}`;
          const badgeCount = badgeKey === 'pendingDecisions' ? pendingDecisions : 0;

          return (
            <Link
              key={href}
              href={`${basePath}/${href}`}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all text-sm ${
                isActive
                  ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              <Icon className="w-4 h-4 flex-shrink-0" />
              <span>{label}</span>
              {badgeCount > 0 && (
                <span className="ml-auto text-[10px] font-bold bg-amber-500 text-black px-1.5 py-0.5 rounded-full">
                  {badgeCount}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* Divider */}
      <div className="mx-3 border-t border-[#1e1e3a] my-1" />

      {/* KPI Mini-Cards */}
      <div className="p-3">
        <div className="text-[10px] font-bold text-slate-600 uppercase tracking-wider mb-2 px-1">
          KPI Vitals
        </div>
        <div className="space-y-1.5">
          {kpiRows.map(({ key, label }) => {
            const rawValue = kpis?.[key as keyof SimKPISnapshot] as number | null | undefined;
            const status = kpiStatus(key, rawValue);
            const formatted = formatKPIValue(key, rawValue);
            const ColorClass = STATUS_COLORS[status];
            const TrendIcon =
              status === 'danger' || status === 'warning'
                ? TrendingDown
                : status === 'good'
                ? TrendingUp
                : Minus;

            return (
              <div
                key={key}
                className="flex items-center justify-between px-2 py-1.5 rounded-lg bg-[#0f0f1a]"
              >
                <div className="flex items-center gap-1.5">
                  <TrendIcon className={`w-3 h-3 ${ColorClass}`} />
                  <span className="text-[11px] text-slate-500">{label}</span>
                </div>
                <span className={`text-[11px] font-mono font-bold ${ColorClass}`}>
                  {formatted}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Active Events */}
      {activeEvents.length > 0 && (
        <>
          <div className="mx-3 border-t border-[#1e1e3a] my-1" />
          <div className="p-3">
            <div className="flex items-center gap-2 mb-2 px-1">
              <AlertCircle className="w-3 h-3 text-amber-400" />
              <div className="text-[10px] font-bold text-slate-600 uppercase tracking-wider">
                Active Events
              </div>
              <span className="text-[10px] font-bold bg-amber-500/20 text-amber-400 px-1.5 py-0.5 rounded-full ml-auto">
                {activeEvents.length}
              </span>
            </div>
            <div className="space-y-1">
              {activeEvents.slice(0, 4).map((ae) => (
                <div
                  key={ae.id}
                  className="px-2 py-1 rounded-md bg-[#0f0f1a] text-[10px] text-amber-300 truncate"
                  title={(ae as any).sim_market_events?.name ?? 'Market Event'}
                >
                  🌐 {(ae as any).sim_market_events?.name ?? 'Market Event'}
                </div>
              ))}
              {activeEvents.length > 4 && (
                <div className="text-[10px] text-slate-600 px-2">
                  +{activeEvents.length - 4} more
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* Agent Status */}
      {gameState && (
        <>
          <div className="mx-3 border-t border-[#1e1e3a] my-1" />
          <div className="p-3 mt-auto">
            <div className="flex items-center gap-2 mb-2 px-1">
              <Zap className="w-3 h-3 text-emerald-400" />
              <div className="text-[10px] font-bold text-slate-600 uppercase tracking-wider">
                Agents
              </div>
              <span className="text-[10px] text-emerald-400 ml-auto">
                {gameState.agents_autonomy_level === 3
                  ? '• AUTONOMOUS'
                  : gameState.agents_autonomy_level === 2
                  ? '• ADVISORY'
                  : '• MONITOR'}
              </span>
            </div>
          </div>
        </>
      )}
    </aside>
  );
}
