/**
 * POST /api/sessions — Create a new simulation session
 * GET  /api/sessions — List sessions for current user's teams
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  requireAuth,
  createSupabaseServer,
  createSupabaseAdmin,
  createKPISnapshot,
  upsertGameState,
  pushNotification,
} from '@/lib/simulator/supabase';
import type { CreateSessionInput, CreateSessionResult, SimScenario } from '@/lib/simulator/types';
import { getGCCCalendarModifiers } from '@/lib/simulator/sharePrice';
import { insertSharePrice } from '@/lib/simulator/supabase';

export async function POST(req: NextRequest) {
  try {
    const session = await requireAuth();
    const body: CreateSessionInput = await req.json();

    const { teamId, scenarioId, playerCount = 1 } = body;

    if (!teamId || !scenarioId) {
      return NextResponse.json({ error: 'teamId and scenarioId are required' }, { status: 400 });
    }

    const admin = createSupabaseAdmin();

    // Verify team membership
    const { data: teamMember } = await admin
      .from('team_members')
      .select('role')
      .eq('team_id', teamId)
      .eq('user_id', session.user.id)
      .single();

    if (!teamMember) {
      return NextResponse.json({ error: 'Not a member of this team' }, { status: 403 });
    }

    // Load scenario
    const { data: scenario, error: scenarioError } = await admin
      .from('sim_scenarios')
      .select('*')
      .eq('id', scenarioId)
      .single();

    if (scenarioError || !scenario) {
      return NextResponse.json({ error: 'Scenario not found' }, { status: 404 });
    }

    const sc = scenario as SimScenario;

    // Check org concurrent session limits
    const { data: org } = await admin
      .from('teams')
      .select('org_id, organizations(max_concurrent_sessions, plan)')
      .eq('id', teamId)
      .single();

    if (org) {
      const { data: activeSessions } = await admin
        .from('sim_sessions')
        .select('id')
        .eq('team_id', teamId)
        .eq('status', 'active');

      const maxSessions = (org as any).organizations?.max_concurrent_sessions ?? 1;
      if ((activeSessions?.length ?? 0) >= maxSessions) {
        return NextResponse.json(
          { error: `Plan limit: max ${maxSessions} active session(s). Upgrade to run more.` },
          { status: 402 }
        );
      }
    }

    // Create session record
    const { data: newSession, error: sessionError } = await admin
      .from('sim_sessions')
      .insert({
        team_id: teamId,
        scenario_id: scenarioId,
        created_by: session.user.id,
        status: 'active',
        current_month: 1,
        total_months: sc.months_total,
        started_at: new Date().toISOString(),
        player_count: playerCount,
        session_metadata: {
          scenario_game_mode: sc.game_mode,
          initial_share_price: sc.initial_share_price,
        },
      })
      .select()
      .single();

    if (sessionError || !newSession) {
      throw sessionError ?? new Error('Failed to create session');
    }

    const sessionId = newSession.id;

    // Seed Month 1 KPI snapshot from scenario initial_kpis
    const initialKPIs = sc.initial_kpis as any;
    const revenueAed = initialKPIs.revenue_aed;
    const grossMargin = initialKPIs.gross_margin;

    const kpiSnapshot = await createKPISnapshot({
      session_id: sessionId,
      month: 1,
      revenue_aed: revenueAed,
      cogs_aed: revenueAed * (1 - grossMargin),
      gross_profit_aed: revenueAed * grossMargin,
      gross_margin: grossMargin,
      ebitda_aed: revenueAed * initialKPIs.ebitda_margin,
      ebitda_margin: initialKPIs.ebitda_margin,
      net_profit_aed: revenueAed * (initialKPIs.ebitda_margin - 0.05),
      net_margin: initialKPIs.ebitda_margin - 0.05,
      cash_balance_aed: initialKPIs.cash_balance_aed,
      accounts_receivable_aed: revenueAed * 0.15,
      inventory_value_aed: revenueAed * 0.12,
      accounts_payable_aed: revenueAed * 0.08,
      net_working_capital_aed: revenueAed * 0.19,
      fill_rate: initialKPIs.fill_rate,
      inventory_days: initialKPIs.inventory_days,
      receivable_days: 45,
      payable_days: 30,
      market_share_pct: initialKPIs.market_share_pct,
      units_sold: Math.floor(revenueAed / 12),
      avg_selling_price_aed: 18.50,
      headcount: 320,
      employee_nps: initialKPIs.employee_nps,
      saudization_pct: null,
      customer_satisfaction: initialKPIs.customer_satisfaction,
      nps: -15,
      carbon_intensity: 105,
      fundamentals_score: 45,
      market_sentiment: 0,
      event_shock_total: 0,
      share_price: sc.initial_share_price,
    });

    // Seed initial share price history
    await insertSharePrice({
      session_id: sessionId,
      month: 1,
      week: null,
      price_aed: sc.initial_share_price,
      fundamentals_component: sc.initial_share_price * 0.60,
      events_component: 0,
      sentiment_component: 0,
      fundamentals_score: 45,
      active_event_ids: [],
      sentiment_drift: 0,
    });

    // Seed initial game state
    const calendarMods = getGCCCalendarModifiers(1);
    const gameState = await upsertGameState({
      session_id: sessionId,
      month: 1,
      ramadan_active: calendarMods.isRamadan,
      ramadan_demand_multiplier: calendarMods.ramadanDemandMultiplier,
      summer_active: calendarMods.isSummer,
      summer_cold_chain_cost_multiplier: calendarMods.summerColdChainMultiplier,
      national_day_boost: calendarMods.isNationalDay,
      saudization_fine_active: false,
      dfm_disclosure_pending: false,
      vat_rate: 0.05,
      competitor_aggression: 5,
      consumer_confidence: 65,
      commodity_index: 100,
      fx_usd_aed: 3.6725,
      decisions_made: 0,
      decisions_available: 3,
      claude_calls_this_month: 0,
      claude_budget_remaining: 100,
      phase: 'decision',
      pending_event_ids: [],
    });

    // Seed Month 1 decisions
    const { data: firstDecisions } = await admin
      .from('sim_decisions')
      .select('*')
      .eq('session_id', sessionId)
      .eq('month', 1)
      .eq('status', 'pending')
      .order('created_at', { ascending: true });

    // Push welcome notification
    await pushNotification({
      org_id: (org as any)?.org_id ?? '',
      user_id: session.user.id,
      session_id: sessionId,
      type: 'system',
      priority: 'low',
      title: `${sc.name} — Simulation Started`,
      body: `Month 1 of ${sc.months_total}. Share price: AED ${sc.initial_share_price.toFixed(2)}. Target: AED ${sc.win_target_price.toFixed(2)}. Good luck, MD.`,
      action_url: `/simulator/${sessionId}/overview`,
      metadata: { scenario_id: scenarioId },
    });

    const result: CreateSessionResult = {
      session: newSession,
      initialKPIs: kpiSnapshot,
      gameState,
      firstDecisions: firstDecisions ?? [],
    };

    return NextResponse.json(result, { status: 201 });
  } catch (err: any) {
    if (err.message === 'UNAUTHORIZED') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('POST /api/sessions error:', err);
    return NextResponse.json({ error: err.message ?? 'Internal server error' }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  try {
    const authSession = await requireAuth();
    const supabase = createSupabaseServer();

    const { searchParams } = new URL(req.url);
    const teamId = searchParams.get('teamId');
    const status = searchParams.get('status');

    let query = supabase
      .from('sim_sessions')
      .select('*, sim_scenarios(name, game_mode, difficulty, initial_share_price), teams(name)')
      .order('created_at', { ascending: false });

    if (teamId) query = query.eq('team_id', teamId);
    if (status) query = query.eq('status', status);

    const { data, error } = await query;
    if (error) throw error;

    return NextResponse.json(data ?? []);
  } catch (err: any) {
    if (err.message === 'UNAUTHORIZED') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
