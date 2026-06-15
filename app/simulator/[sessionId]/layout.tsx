/**
 * /app/simulator/[sessionId]/layout.tsx
 *
 * RSC layout. Loads session + KPI context server-side,
 * wraps children in the client SimulatorShell.
 *
 * All child pages (overview, decisions, sop-cycle, expansion, leaderboard)
 * receive the shell layout automatically.
 */

import { redirect, notFound } from 'next/navigation';
import { createSupabaseServer, requireAuth } from '@/lib/simulator/supabase';
import { SimulatorShell } from '@/components/simulator/SimulatorShell';

export default async function SimulatorLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ sessionId: string }>;
}) {
  const supabase = createSupabaseServer();

  // Auth guard
  let authSession;
  try {
    authSession = await requireAuth();
  } catch {
    redirect('/auth/login');
  }

  const { sessionId } = await params;

  // Load session with scenario
  const { data: session, error } = await supabase
    .from('sim_sessions')
    .select(`
      *,
      sim_scenarios (*)
    `)
    .eq('id', sessionId)
    .single();

  if (error || !session) {
    notFound();
  }

  // Load latest KPI snapshot
  const { data: latestKPIs } = await supabase
    .from('sim_kpi_snapshots')
    .select('*')
    .eq('session_id', sessionId)
    .order('month', { ascending: false })
    .limit(1)
    .single();

  // Load previous KPI snapshot (for deltas)
  const { data: prevKPIs } = await supabase
    .from('sim_kpi_snapshots')
    .select('*')
    .eq('session_id', sessionId)
    .order('month', { ascending: false })
    .range(1, 1)
    .single();

  // Load game state
  const { data: gameState } = await supabase
    .from('sim_game_state')
    .select('*')
    .eq('session_id', sessionId)
    .single();

  // Load share price history (last 2 entries for current + prev)
  const { data: priceHistory } = await supabase
    .from('sim_share_price_history')
    .select('*')
    .eq('session_id', sessionId)
    .order('month', { ascending: false })
    .limit(2);

  const currentPrice = priceHistory?.[0]?.price_aed ?? session.sim_scenarios.initial_share_price;
  const prevPrice = priceHistory?.[1]?.price_aed ?? currentPrice;

  // Load active market events
  const { data: activeEvents } = await supabase
    .from('market_event_sessions')
    .select(`*, sim_market_events(*)`)
    .eq('session_id', sessionId)
    .eq('is_active', true);

  // Count pending decisions
  const { count: pendingDecisions } = await supabase
    .from('sim_decisions')
    .select('*', { count: 'exact', head: true })
    .eq('session_id', sessionId)
    .eq('status', 'pending')
    .eq('month', session.current_month);

  return (
    <SimulatorShell
      session={session}
      scenario={session.sim_scenarios}
      initialKPIs={latestKPIs ?? null}
      initialGameState={gameState ?? null}
      initialSharePrice={currentPrice}
      previousSharePrice={prevPrice}
      initialActiveEvents={activeEvents ?? []}
      pendingDecisions={pendingDecisions ?? 0}
      userId={authSession.user.id}
    >
      {children}
    </SimulatorShell>
  );
}
