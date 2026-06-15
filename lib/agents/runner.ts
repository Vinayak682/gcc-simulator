/**
 * Al Manar Industries — GCC Business Simulator
 * Agent Runner — QStash Tick Orchestrator
 *
 * Runs all 8 autonomous agents for a session tick.
 * Called by /api/agents/tick (QStash endpoint) every 60 seconds in active sessions.
 * Also called manually at month-advance by /api/sessions/[id]/advance-month.
 *
 * Architecture:
 * - Rule-based evaluation FIRST (no LLM) — fast and free
 * - LLM only called when rule-based triggers a meaningful recommendation
 * - Each agent has its own domain; they share the same session context
 * - Level 1 (Inform): always, just logs observation
 * - Level 2 (Recommend): logs + creates agent_recommendations record
 * - Level 3 (Act): logs + applies KPI change + creates agent_actions record
 */

import type {
  AgentName,
  AgentTickPayload,
  AgentTickResult,
  AgentRunResult,
  SimSession,
  SimKPISnapshot,
  SimGameState,
  SimActiveEvent,
  SimMarketEvent,
  AgentRecommendation,
} from '../simulator/types';
import { createSupabaseAdmin } from '../simulator/supabase';
import { generateDecisionRec } from '../simulator/claude';
import { logAgentActivity } from '../simulator/supabase';

// Import individual agents
import { runTariq } from './tariq';
import { runZara } from './zara';
import { runOmar } from './omar';
import { runNadia } from './nadia';
import { runFaris } from './faris';
import { runLeila } from './leila';
import { runPriya } from './priya';
import { runBoard } from './board';

// ─── Agent Registry ───────────────────────────────────────────────────────────

type AgentRunner = (ctx: AgentRunContext) => Promise<AgentRunResult>;

const AGENT_RUNNERS: Record<AgentName, AgentRunner> = {
  tariq: runTariq,
  zara: runZara,
  omar: runOmar,
  nadia: runNadia,
  faris: runFaris,
  leila: runLeila,
  priya: runPriya,
  board: runBoard,
};

/** Order agents run — dependency aware (supply informs demand, finance reads both) */
const AGENT_RUN_ORDER: AgentName[] = [
  'omar',   // Supply first — knows inventory constraints
  'faris',  // Planning second — demand forecast uses supply data
  'nadia',  // Finance third — reads supply + demand
  'zara',   // Marketing — reads finance + market data
  'leila',  // Commercial — reads marketing + supply
  'priya',  // Risk — reads everything
  'tariq',  // Strategy — synthesizes all
  'board',  // Board last — governance review of all decisions
];

// ─── Context Passed to Each Agent ────────────────────────────────────────────

export interface AgentRunContext {
  sessionId: string;
  session: SimSession;
  currentMonth: number;
  latestKPIs: SimKPISnapshot;
  previousKPIs: SimKPISnapshot | null;
  gameState: SimGameState;
  activeEvents: (SimActiveEvent & { sim_market_events: SimMarketEvent })[];
  agentName: AgentName;
  autonomyLevel: number;
  claudeBudgetRemaining: number;
  // Results from earlier agents in this tick (for cross-agent awareness)
  priorTickResults: Map<AgentName, AgentRunResult>;
}

// ─── Main Orchestrator ────────────────────────────────────────────────────────

export async function runAgentTick(payload: AgentTickPayload): Promise<AgentTickResult> {
  const startTime = Date.now();
  const admin = createSupabaseAdmin();

  const { sessionId, month, agentsToRun } = payload;

  // ── Load session context ──────────────────────────────────────────────────
  const [sessionRes, kpiRes, gameStateRes, activeEventsRes, agentConfigRes] =
    await Promise.all([
      admin.from('sim_sessions').select('*').eq('id', sessionId).single(),
      admin
        .from('sim_kpi_snapshots')
        .select('*')
        .eq('session_id', sessionId)
        .order('month', { ascending: false })
        .limit(2),
      admin.from('sim_game_state').select('*').eq('session_id', sessionId).single(),
      admin
        .from('sim_active_events')
        .select('*, sim_market_events(*)')
        .eq('session_id', sessionId)
        .eq('is_resolved', false),
      admin.from('sim_agents').select('*').eq('is_active', true),
    ]);

  if (!sessionRes.data || sessionRes.data.status !== 'active') {
    return {
      sessionId,
      month,
      agentResults: [],
      totalCostUsd: 0,
      totalTokens: 0,
      durationMs: Date.now() - startTime,
    };
  }

  const session = sessionRes.data;
  const latestKPIs = kpiRes.data?.[0] ?? null;
  const previousKPIs = kpiRes.data?.[1] ?? null;
  const gameState = gameStateRes.data;
  const activeEvents = activeEventsRes.data ?? [];
  const agentConfigs = agentConfigRes.data ?? [];

  if (!latestKPIs || !gameState) {
    console.error(`Agent tick: missing KPIs or game state for session ${sessionId}`);
    return {
      sessionId,
      month,
      agentResults: [],
      totalCostUsd: 0,
      totalTokens: 0,
      durationMs: Date.now() - startTime,
    };
  }

  // ── Check org Claude budget ───────────────────────────────────────────────
  const { data: orgData } = await admin
    .from('teams')
    .select('org_id, organizations(credits_remaining)')
    .eq('id', session.team_id)
    .single();

  const creditsRemaining = (orgData as any)?.organizations?.credits_remaining ?? 0;

  // ── Run agents in order ───────────────────────────────────────────────────
  const agentsToProcess = AGENT_RUN_ORDER.filter((name) => agentsToRun.includes(name));
  const agentResults: AgentRunResult[] = [];
  const priorTickResults = new Map<AgentName, AgentRunResult>();
  let totalCostUsd = 0;
  let totalTokens = 0;

  for (const agentName of agentsToProcess) {
    const agentConfig = agentConfigs.find((a: any) => a.name === agentName);
    if (!agentConfig) continue;

    const runner = AGENT_RUNNERS[agentName];
    if (!runner) continue;

    const ctx: AgentRunContext = {
      sessionId,
      session,
      currentMonth: month,
      latestKPIs,
      previousKPIs,
      gameState,
      activeEvents,
      agentName,
      autonomyLevel: agentConfig.autonomy_level,
      claudeBudgetRemaining: creditsRemaining,
      priorTickResults,
    };

    try {
      const result = await runner(ctx);
      agentResults.push(result);
      priorTickResults.set(agentName, result);
      totalCostUsd += result.costUsd;
      totalTokens += 0; // token tracking per agent
    } catch (err) {
      agentResults.push({
        agentName,
        success: false,
        activitiesCreated: 0,
        recommendationsCreated: 0,
        actionsExecuted: 0,
        costUsd: 0,
        error: String(err),
      });
    }
  }

  return {
    sessionId,
    month,
    agentResults,
    totalCostUsd,
    totalTokens,
    durationMs: Date.now() - startTime,
  };
}

// ─── Shared Agent Helpers ─────────────────────────────────────────────────────

/** Log an observation to agent_activity_log */
export async function logObservation(
  ctx: AgentRunContext,
  title: string,
  summary: string,
  metadata: Record<string, unknown> = {}
): Promise<void> {
  const admin = createSupabaseAdmin();
  await admin.from('agent_activity_log').insert({
    session_id: ctx.sessionId,
    agent_name: ctx.agentName,
    month: ctx.currentMonth,
    activity_type: 'analysis',
    title,
    summary,
    full_content: null,
    metadata,
    tokens_used: 0,
    cost_usd: 0,
  });
}

/** Create a recommendation (Level 2+) */
export async function createRecommendation(
  ctx: AgentRunContext,
  params: {
    title: string;
    recommendation: string;
    decisionId?: string;
    recommendedOptionId?: string;
    confidence: number;
    reasoning: string;
  }
): Promise<void> {
  const admin = createSupabaseAdmin();
  const expiresAt = new Date();
  expiresAt.setMonth(expiresAt.getMonth() + 1); // expire after 1 sim month

  await admin.from('agent_recommendations').insert({
    session_id: ctx.sessionId,
    agent_name: ctx.agentName,
    month: ctx.currentMonth,
    decision_id: params.decisionId ?? null,
    title: params.title,
    recommendation: params.recommendation,
    recommended_option_id: params.recommendedOptionId ?? null,
    confidence: params.confidence,
    reasoning: params.reasoning,
    status: 'pending',
    player_feedback: null,
    expires_at: expiresAt.toISOString(),
  });
}

/** Execute an autonomous action (Level 3) */
export async function executeAction(
  ctx: AgentRunContext,
  params: {
    actionType: string;
    description: string;
    costAed: number;
    kpiImpact?: Record<string, number>;
  }
): Promise<void> {
  if (ctx.autonomyLevel < 3) {
    // Downgrade to recommendation if not Level 3
    await createRecommendation(ctx, {
      title: `Proposed: ${params.actionType}`,
      recommendation: params.description,
      confidence: 0.8,
      reasoning: 'Action proposed — awaiting Level 3 autonomy approval.',
    });
    return;
  }

  const admin = createSupabaseAdmin();
  await admin.from('agent_actions').insert({
    session_id: ctx.sessionId,
    agent_name: ctx.agentName,
    month: ctx.currentMonth,
    action_type: params.actionType,
    description: params.description,
    kpi_impact: params.kpiImpact ?? null,
    cost_aed: params.costAed,
    approved_by: null, // auto-approved at Level 3
    approved_at: new Date().toISOString(),
    rolled_back: false,
    rollback_reason: null,
  });

  // Log the action taken
  await logObservation(ctx, `ACTION: ${params.actionType}`, params.description, {
    auto_applied: true,
    cost_aed: params.costAed,
  });
}

// ─── KPI Threshold Checks (Rule-Based, No LLM) ───────────────────────────────

export interface KPIThresholdAlert {
  triggered: boolean;
  severity: 'info' | 'warning' | 'critical';
  message: string;
  kpiName: string;
  currentValue: number;
  threshold: number;
}

export function checkKPIThresholds(kpis: SimKPISnapshot): KPIThresholdAlert[] {
  const alerts: KPIThresholdAlert[] = [];

  // Fill rate
  if (kpis.fill_rate < 0.75) {
    alerts.push({
      triggered: true,
      severity: kpis.fill_rate < 0.60 ? 'critical' : 'warning',
      message: `Fill rate at ${(kpis.fill_rate * 100).toFixed(0)}% — stockout risk`,
      kpiName: 'fill_rate',
      currentValue: kpis.fill_rate,
      threshold: 0.75,
    });
  }

  // Cash balance
  if (kpis.cash_balance_aed < 5_000_000) {
    alerts.push({
      triggered: true,
      severity: kpis.cash_balance_aed < 1_000_000 ? 'critical' : 'warning',
      message: `Cash balance AED ${(kpis.cash_balance_aed / 1_000_000).toFixed(1)}M — cash runway critical`,
      kpiName: 'cash_balance_aed',
      currentValue: kpis.cash_balance_aed,
      threshold: 5_000_000,
    });
  }

  // EBITDA margin
  if (kpis.ebitda_margin < 0.05) {
    alerts.push({
      triggered: true,
      severity: kpis.ebitda_margin < 0 ? 'critical' : 'warning',
      message: `EBITDA margin ${(kpis.ebitda_margin * 100).toFixed(1)}% — profitability at risk`,
      kpiName: 'ebitda_margin',
      currentValue: kpis.ebitda_margin,
      threshold: 0.05,
    });
  }

  // Inventory days
  if (kpis.inventory_days > 60) {
    alerts.push({
      triggered: true,
      severity: kpis.inventory_days > 90 ? 'warning' : 'info',
      message: `Inventory at ${kpis.inventory_days.toFixed(0)} days — working capital tied up`,
      kpiName: 'inventory_days',
      currentValue: kpis.inventory_days,
      threshold: 60,
    });
  }

  // Market share
  if (kpis.market_share_pct < 15) {
    alerts.push({
      triggered: true,
      severity: kpis.market_share_pct < 10 ? 'critical' : 'warning',
      message: `Market share ${kpis.market_share_pct.toFixed(1)}% — competitive position weakening`,
      kpiName: 'market_share_pct',
      currentValue: kpis.market_share_pct,
      threshold: 15,
    });
  }

  // Receivable days
  if (kpis.receivable_days > 75) {
    alerts.push({
      triggered: true,
      severity: 'warning',
      message: `Receivables at ${kpis.receivable_days.toFixed(0)} days — collections slow`,
      kpiName: 'receivable_days',
      currentValue: kpis.receivable_days,
      threshold: 75,
    });
  }

  return alerts.filter((a) => a.triggered);
}
