/**
 * Al Manar Industries — GCC Business Simulator
 * Supabase Server Client + Typed Query Helpers
 *
 * Use in Server Components, Server Actions, and API route handlers.
 * For browser/realtime use lib/simulator/supabase.client.ts instead.
 */

import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import type {
  SimSession,
  SimKPISnapshot,
  SimGameState,
  SimDecision,
  SimMarketEvent,
  SimActiveEvent,
  AgentActivityLog,
  AgentRecommendation,
  SimSOPCycle,
  SimFinancials,
  SimSharePriceHistory,
  SimExpansionOpp,
  SimSessionExpansion,
  Organization,
  Team,
  Notification,
  LeaderboardEntry,
  SimScenario,
} from './types';

// ─── Client Factory ───────────────────────────────────────────────────────────

export function createSupabaseServer() {
  // Next.js 15: cookies() returns a Promise. We pass the thenable directly
  // to createServerClient which handles the async access internally.
  const cookieStore = cookies() as any;
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return typeof cookieStore.getAll === 'function'
            ? cookieStore.getAll()
            : [];
        },
        setAll(cookiesToSet: { name: string; value: string; options?: object }[]) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              if (typeof cookieStore.set === 'function') {
                cookieStore.set(name, value, options);
              }
            });
          } catch {
            // Server Component — mutations are no-ops
          }
        },
      },
    }
  );
}

/** Service role client — bypasses RLS. Use only in server-side admin paths. */
export function createSupabaseAdmin() {
  const { createClient } = require('@supabase/supabase-js');
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

// ─── Auth Helpers ─────────────────────────────────────────────────────────────

export async function getServerSession() {
  const supabase = createSupabaseServer();
  const {
    data: { session },
    error,
  } = await supabase.auth.getSession();
  if (error || !session) return null;
  return session;
}

export async function requireAuth() {
  const session = await getServerSession();
  if (!session) throw new Error('UNAUTHORIZED');
  return session;
}

export async function getCurrentUser() {
  const supabase = createSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

// ─── Organization Queries ─────────────────────────────────────────────────────

export async function getMyOrganizations(): Promise<Organization[]> {
  const supabase = createSupabaseServer();
  const { data, error } = await supabase
    .from('organizations')
    .select(
      `
      *,
      organization_members!inner(user_id, role, status)
    `
    )
    .eq('organization_members.status', 'active')
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data ?? []) as Organization[];
}

export async function getOrganization(orgId: string): Promise<Organization | null> {
  const supabase = createSupabaseServer();
  const { data, error } = await supabase
    .from('organizations')
    .select('*')
    .eq('id', orgId)
    .single();

  if (error) return null;
  return data as Organization;
}

// ─── Session Queries ──────────────────────────────────────────────────────────

export async function getSession(sessionId: string): Promise<SimSession | null> {
  const supabase = createSupabaseServer();
  const { data, error } = await supabase
    .from('sim_sessions')
    .select('*')
    .eq('id', sessionId)
    .single();

  if (error) return null;
  return data as SimSession;
}

export async function getSessionWithContext(sessionId: string) {
  const supabase = createSupabaseServer();

  const [sessionRes, kpiRes, gameStateRes, activeEventsRes] = await Promise.all([
    supabase.from('sim_sessions').select('*, sim_scenarios(*)').eq('id', sessionId).single(),
    supabase
      .from('sim_kpi_snapshots')
      .select('*')
      .eq('session_id', sessionId)
      .order('month', { ascending: false })
      .limit(2),
    supabase.from('sim_game_state').select('*').eq('session_id', sessionId).single(),
    supabase
      .from('sim_active_events')
      .select('*, sim_market_events(*)')
      .eq('session_id', sessionId)
      .eq('is_resolved', false),
  ]);

  if (sessionRes.error || !sessionRes.data) return null;

  return {
    session: sessionRes.data as SimSession & { sim_scenarios: SimScenario },
    latestKPIs: (kpiRes.data?.[0] ?? null) as SimKPISnapshot | null,
    previousKPIs: (kpiRes.data?.[1] ?? null) as SimKPISnapshot | null,
    gameState: gameStateRes.data as SimGameState | null,
    activeEvents: (activeEventsRes.data ?? []) as (SimActiveEvent & {
      sim_market_events: SimMarketEvent;
    })[],
  };
}

export async function getSessionsByTeam(teamId: string): Promise<SimSession[]> {
  const supabase = createSupabaseServer();
  const { data, error } = await supabase
    .from('sim_sessions')
    .select('*')
    .eq('team_id', teamId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data ?? []) as SimSession[];
}

// ─── KPI Queries ──────────────────────────────────────────────────────────────

export async function getKPIHistory(
  sessionId: string,
  fromMonth?: number,
  toMonth?: number
): Promise<SimKPISnapshot[]> {
  const supabase = createSupabaseServer();
  let query = supabase
    .from('sim_kpi_snapshots')
    .select('*')
    .eq('session_id', sessionId)
    .order('month', { ascending: true });

  if (fromMonth !== undefined) query = query.gte('month', fromMonth);
  if (toMonth !== undefined) query = query.lte('month', toMonth);

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as SimKPISnapshot[];
}

export async function getLatestKPIs(sessionId: string): Promise<SimKPISnapshot | null> {
  const supabase = createSupabaseServer();
  const { data, error } = await supabase
    .from('sim_kpi_snapshots')
    .select('*')
    .eq('session_id', sessionId)
    .order('month', { ascending: false })
    .limit(1)
    .single();

  if (error) return null;
  return data as SimKPISnapshot;
}

// ─── Share Price Queries ──────────────────────────────────────────────────────

export async function getSharePriceHistory(
  sessionId: string,
  limit = 60
): Promise<SimSharePriceHistory[]> {
  const supabase = createSupabaseServer();
  const { data, error } = await supabase
    .from('sim_share_price_history')
    .select('*')
    .eq('session_id', sessionId)
    .order('recorded_at', { ascending: true })
    .limit(limit);

  if (error) throw error;
  return (data ?? []) as SimSharePriceHistory[];
}

export async function getCurrentSharePrice(sessionId: string): Promise<number | null> {
  const supabase = createSupabaseServer();
  const { data } = await supabase
    .from('sim_share_price_history')
    .select('price_aed')
    .eq('session_id', sessionId)
    .order('recorded_at', { ascending: false })
    .limit(1)
    .single();

  return data?.price_aed ?? null;
}

// ─── Decision Queries ─────────────────────────────────────────────────────────

export async function getPendingDecisions(sessionId: string): Promise<SimDecision[]> {
  const supabase = createSupabaseServer();
  const { data, error } = await supabase
    .from('sim_decisions')
    .select('*')
    .eq('session_id', sessionId)
    .eq('status', 'pending')
    .order('created_at', { ascending: true });

  if (error) throw error;
  return (data ?? []) as SimDecision[];
}

export async function getDecisionHistory(
  sessionId: string,
  limit = 20
): Promise<SimDecision[]> {
  const supabase = createSupabaseServer();
  const { data, error } = await supabase
    .from('sim_decisions')
    .select('*')
    .eq('session_id', sessionId)
    .in('status', ['decided', 'skipped'])
    .order('decided_at', { ascending: false })
    .limit(limit);

  if (error) throw error;
  return (data ?? []) as SimDecision[];
}

export async function getDecision(decisionId: string): Promise<SimDecision | null> {
  const supabase = createSupabaseServer();
  const { data, error } = await supabase
    .from('sim_decisions')
    .select('*')
    .eq('id', decisionId)
    .single();

  if (error) return null;
  return data as SimDecision;
}

// ─── Agent Queries ────────────────────────────────────────────────────────────

export async function getAgentFeed(
  sessionId: string,
  limit = 30
): Promise<AgentActivityLog[]> {
  const supabase = createSupabaseServer();
  const { data, error } = await supabase
    .from('agent_activity_log')
    .select('*')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw error;
  return (data ?? []) as AgentActivityLog[];
}

export async function getPendingRecommendations(
  sessionId: string
): Promise<AgentRecommendation[]> {
  const supabase = createSupabaseServer();
  const { data, error } = await supabase
    .from('agent_recommendations')
    .select('*')
    .eq('session_id', sessionId)
    .eq('status', 'pending')
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data ?? []) as AgentRecommendation[];
}

// ─── S&OP Queries ─────────────────────────────────────────────────────────────

export async function getSOPCycle(
  sessionId: string,
  month: number
): Promise<SimSOPCycle | null> {
  const supabase = createSupabaseServer();
  const { data, error } = await supabase
    .from('sim_sop_cycles')
    .select('*')
    .eq('session_id', sessionId)
    .eq('month', month)
    .single();

  if (error) return null;
  return data as SimSOPCycle;
}

export async function getSOPHistory(sessionId: string): Promise<SimSOPCycle[]> {
  const supabase = createSupabaseServer();
  const { data, error } = await supabase
    .from('sim_sop_cycles')
    .select('*')
    .eq('session_id', sessionId)
    .order('month', { ascending: true });

  if (error) throw error;
  return (data ?? []) as SimSOPCycle[];
}

// ─── Financials Queries ───────────────────────────────────────────────────────

export async function getFinancialHistory(sessionId: string): Promise<SimFinancials[]> {
  const supabase = createSupabaseServer();
  const { data, error } = await supabase
    .from('sim_financials')
    .select('*')
    .eq('session_id', sessionId)
    .order('month', { ascending: true });

  if (error) throw error;
  return (data ?? []) as SimFinancials[];
}

// ─── Expansion Queries ────────────────────────────────────────────────────────

export async function getAvailableExpansions(
  sessionId: string,
  currentMonth: number
): Promise<SimExpansionOpp[]> {
  const supabase = createSupabaseServer();

  // Get already-pursued expansion IDs for this session
  const { data: pursued } = await supabase
    .from('sim_session_expansions')
    .select('expansion_id')
    .eq('session_id', sessionId);

  const pursuedIds = (pursued ?? []).map((r) => r.expansion_id);

  let query = supabase
    .from('sim_expansion_opps')
    .select('*')
    .lte('available_from_month', currentMonth)
    .order('investment_aed', { ascending: true });

  if (pursuedIds.length > 0) {
    query = query.not('id', 'in', `(${pursuedIds.join(',')})`);
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as SimExpansionOpp[];
}

export async function getSessionExpansions(
  sessionId: string
): Promise<SimSessionExpansion[]> {
  const supabase = createSupabaseServer();
  const { data, error } = await supabase
    .from('sim_session_expansions')
    .select('*, sim_expansion_opps(*)')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data ?? []) as SimSessionExpansion[];
}

// ─── Leaderboard Queries ──────────────────────────────────────────────────────

export async function getLeaderboard(
  scenarioId: string,
  limit = 10
): Promise<LeaderboardEntry[]> {
  const supabase = createSupabaseServer();
  const { data, error } = await supabase
    .from('sim_sessions')
    .select(
      `
      id,
      scenario_id,
      final_share_price,
      current_month,
      win_achieved,
      created_at,
      sim_scenarios(name, game_mode, difficulty),
      teams(name, org_id, organizations(name))
    `
    )
    .eq('scenario_id', scenarioId)
    .eq('leaderboard_eligible', true)
    .eq('status', 'completed')
    .order('final_share_price', { ascending: false })
    .limit(limit);

  if (error) throw error;

  return ((data ?? []) as any[]).map((row, idx) => ({
    id: row.id,
    session_id: row.id,
    org_id: row.teams?.org_id ?? '',
    org_name: row.teams?.organizations?.name ?? 'Anonymous',
    scenario_id: row.scenario_id,
    scenario_name: row.sim_scenarios?.name ?? '',
    game_mode: row.sim_scenarios?.game_mode ?? 'turnaround',
    difficulty: row.sim_scenarios?.difficulty ?? 'normal',
    final_share_price: row.final_share_price ?? 0,
    months_taken: row.current_month,
    win_achieved: row.win_achieved,
    player_names: [],
    ghost: false,
    rank: idx + 1,
    created_at: row.created_at,
  })) as LeaderboardEntry[];
}

// ─── Notification Queries ─────────────────────────────────────────────────────

export async function getUnreadNotifications(
  sessionId?: string
): Promise<Notification[]> {
  const supabase = createSupabaseServer();
  let query = supabase
    .from('notifications')
    .select('*')
    .eq('is_read', false)
    .order('created_at', { ascending: false })
    .limit(20);

  if (sessionId) {
    query = query.eq('session_id', sessionId);
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as Notification[];
}

// ─── Write Helpers ────────────────────────────────────────────────────────────

export async function createKPISnapshot(
  snapshot: Omit<SimKPISnapshot, 'id' | 'created_at'>
): Promise<SimKPISnapshot> {
  const supabase = createSupabaseServer();
  const { data, error } = await supabase
    .from('sim_kpi_snapshots')
    .insert(snapshot)
    .select()
    .single();

  if (error) throw error;
  return data as SimKPISnapshot;
}

export async function updateDecision(
  decisionId: string,
  update: Partial<SimDecision>
): Promise<SimDecision> {
  const supabase = createSupabaseServer();
  const { data, error } = await supabase
    .from('sim_decisions')
    .update(update)
    .eq('id', decisionId)
    .select()
    .single();

  if (error) throw error;
  return data as SimDecision;
}

export async function insertSharePrice(
  entry: Omit<SimSharePriceHistory, 'id' | 'recorded_at'>
): Promise<SimSharePriceHistory> {
  const supabase = createSupabaseServer();
  const { data, error } = await supabase
    .from('sim_share_price_history')
    .insert(entry)
    .select()
    .single();

  if (error) throw error;
  return data as SimSharePriceHistory;
}

export async function logAgentActivity(
  activity: Omit<AgentActivityLog, 'id' | 'created_at'>
): Promise<AgentActivityLog> {
  const supabase = createSupabaseServer();
  const { data, error } = await supabase
    .from('agent_activity_log')
    .insert(activity)
    .select()
    .single();

  if (error) throw error;
  return data as AgentActivityLog;
}

export async function upsertGameState(
  gameState: Partial<SimGameState> & { session_id: string; month: number }
): Promise<SimGameState> {
  const supabase = createSupabaseServer();
  const { data, error } = await supabase
    .from('sim_game_state')
    .upsert({ ...gameState, updated_at: new Date().toISOString() })
    .select()
    .single();

  if (error) throw error;
  return data as SimGameState;
}

export async function advanceSessionMonth(
  sessionId: string,
  newMonth: number
): Promise<SimSession> {
  const supabase = createSupabaseServer();
  const { data, error } = await supabase
    .from('sim_sessions')
    .update({ current_month: newMonth, updated_at: new Date().toISOString() })
    .eq('id', sessionId)
    .select()
    .single();

  if (error) throw error;
  return data as SimSession;
}

export async function markSessionComplete(
  sessionId: string,
  finalSharePrice: number,
  won: boolean,
  lost: boolean
): Promise<void> {
  const supabase = createSupabaseServer();
  const { error } = await supabase
    .from('sim_sessions')
    .update({
      status: 'completed',
      completed_at: new Date().toISOString(),
      final_share_price: finalSharePrice,
      win_achieved: won,
      loss_triggered: lost,
      updated_at: new Date().toISOString(),
    })
    .eq('id', sessionId);

  if (error) throw error;
}

export async function pushNotification(
  notification: Omit<Notification, 'id' | 'is_read' | 'read_at' | 'created_at'>
): Promise<void> {
  const supabase = createSupabaseServer();
  const { error } = await supabase.from('notifications').insert({
    ...notification,
    is_read: false,
  });
  if (error) throw error;
}

// ─── Org Credit Helpers ───────────────────────────────────────────────────────

export async function consumeCredits(
  orgId: string,
  amount: number,
  description: string,
  sessionId?: string
): Promise<boolean> {
  const admin = createSupabaseAdmin();

  const { data: org } = await admin
    .from('organizations')
    .select('credits_remaining')
    .eq('id', orgId)
    .single();

  if (!org || org.credits_remaining < amount) return false;

  const newBalance = org.credits_remaining - amount;

  await Promise.all([
    admin
      .from('organizations')
      .update({ credits_remaining: newBalance })
      .eq('id', orgId),
    admin.from('credit_transactions').insert({
      org_id: orgId,
      type: 'usage',
      amount: -amount,
      balance_after: newBalance,
      description,
      session_id: sessionId ?? null,
    }),
  ]);

  return true;
}
