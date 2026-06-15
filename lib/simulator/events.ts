/**
 * Al Manar Industries — GCC Business Simulator
 * Market Events Engine
 *
 * Handles:
 * 1. Event trigger evaluation at each month-advance
 * 2. KPI impact application for active events
 * 3. Event expiry and resolution
 * 4. GCC-specific event modifiers
 */

import type {
  SimMarketEvent,
  SimActiveEvent,
  SimKPISnapshot,
  SimGameState,
  KPIImpact,
  EventResponseOption,
} from './types';
import { createSupabaseAdmin } from './supabase';
import { seededRandom, hashString } from './sharePrice';

// ─── Event Trigger Logic ──────────────────────────────────────────────────────

export interface EventTriggerInput {
  sessionId: string;
  currentMonth: number;
  scenarioId: string;
  currentKPIs: SimKPISnapshot;
  gameState: SimGameState;
  alreadyTriggeredEventIds: string[];
}

export interface EventTriggerResult {
  newEvents: SimActiveEvent[];
  expiredEventIds: string[];
  kpiAdjustments: KPIImpact; // aggregated impact of all active events this month
}

/**
 * Evaluate which events should fire this month.
 * Uses seeded random for deterministic results in replays.
 */
export async function evaluateEventTriggers(
  input: EventTriggerInput
): Promise<EventTriggerResult> {
  const admin = createSupabaseAdmin();
  const { sessionId, currentMonth, scenarioId, currentKPIs, gameState, alreadyTriggeredEventIds } = input;

  // Fetch all available market events for this scenario
  const { data: allEvents } = await admin
    .from('sim_market_events')
    .select('*')
    .or(`scenario_ids.cs.{${scenarioId}},scenario_ids.eq.{}`);

  const events = (allEvents ?? []) as SimMarketEvent[];

  // Fetch currently active events to check for expiry
  const { data: activeEventRows } = await admin
    .from('sim_active_events')
    .select('*')
    .eq('session_id', sessionId)
    .eq('is_resolved', false);

  const activeEvents = (activeEventRows ?? []) as SimActiveEvent[];

  // Check for expired events
  const expiredEventIds: string[] = [];
  for (const ae of activeEvents) {
    if (currentMonth > ae.expires_month) {
      expiredEventIds.push(ae.id);
      await admin
        .from('sim_active_events')
        .update({ is_resolved: true })
        .eq('id', ae.id);
    }
  }

  // Evaluate which new events should trigger
  const newEvents: SimActiveEvent[] = [];

  for (const event of events) {
    // Skip already triggered
    if (alreadyTriggeredEventIds.includes(event.id)) continue;

    // Check month window
    const [earliest, latest] = event.trigger_month_range;
    if (currentMonth < earliest || currentMonth > latest) continue;

    // Roll for probability using seeded random (session + month + event = deterministic)
    const seed = hashString(`${sessionId}:${currentMonth}:${event.id}`);
    const roll = seededRandom(seed);

    if (roll > event.probability) continue;

    // Additional condition checks
    if (!shouldEventFire(event, currentKPIs, gameState)) continue;

    // Create active event record
    const newActiveEvent: Omit<SimActiveEvent, 'id' | 'created_at'> = {
      session_id: sessionId,
      event_id: event.id,
      triggered_month: currentMonth,
      expires_month: currentMonth + event.duration_months,
      is_resolved: false,
      player_response_option_id: null,
      price_impact_applied: event.price_impact_pct,
      kpi_impact_applied: event.kpi_impacts,
    };

    const { data: inserted } = await admin
      .from('sim_active_events')
      .insert(newActiveEvent)
      .select()
      .single();

    if (inserted) {
      newEvents.push(inserted as SimActiveEvent);
    }
  }

  // Compute aggregated KPI adjustments from ALL active events (existing + new)
  const allActiveAfterUpdate = activeEvents
    .filter((ae) => !expiredEventIds.includes(ae.id))
    .concat(newEvents);

  const kpiAdjustments = aggregateKPIImpacts(
    allActiveAfterUpdate.map((ae) => ae.kpi_impact_applied).filter(Boolean) as KPIImpact[]
  );

  return { newEvents, expiredEventIds, kpiAdjustments };
}

// ─── Conditional Event Firing ─────────────────────────────────────────────────

/**
 * Some events only fire if specific KPI conditions are met.
 * Example: FMD scare only fires if cold chain fill rate is high (products in market).
 */
function shouldEventFire(
  event: SimMarketEvent,
  kpis: SimKPISnapshot,
  gameState: SimGameState
): boolean {
  const name = event.name.toLowerCase();

  // Ramadan surge: only fire if Ramadan is NOT already active (avoid double-counting)
  if (name.includes('ramadan') && gameState.ramadan_active) return false;

  // Commodity spikes are more likely in summer
  if (name.includes('commodity') && gameState.summer_active) return true; // boost probability

  // Competitor aggression events: more likely when company has high market share
  if (name.includes('competitor') && kpis.market_share_pct < 15) return false;

  // Saudization fine: only relevant if company operates in Saudi
  if (name.includes('saudization') && kpis.saudization_pct === null) return false;

  // DFM disclosure events: only when company hasn't already disclosed
  if (name.includes('disclosure') && gameState.dfm_disclosure_pending) return false;

  // Cash crisis events: more likely when cash balance is low
  if (name.includes('liquidity') && kpis.cash_balance_aed > 50_000_000) return false;

  return true;
}

// ─── KPI Impact Application ───────────────────────────────────────────────────

/**
 * Apply event KPI impacts to a KPI snapshot.
 * Used when computing next month's baseline KPIs.
 */
export function applyEventImpacts(
  baseKPIs: SimKPISnapshot,
  aggregatedImpact: KPIImpact
): Partial<SimKPISnapshot> {
  const revenue = baseKPIs.revenue_aed * (1 + aggregatedImpact.revenue_pct);
  const grossMargin = Math.max(
    0,
    Math.min(1, baseKPIs.gross_margin + aggregatedImpact.margin_delta)
  );

  return {
    revenue_aed: revenue,
    gross_margin: grossMargin,
    gross_profit_aed: revenue * grossMargin,
    fill_rate: Math.max(
      0,
      Math.min(1, baseKPIs.fill_rate + aggregatedImpact.fill_rate_delta)
    ),
    market_share_pct: Math.max(
      0,
      Math.min(100, baseKPIs.market_share_pct + aggregatedImpact.market_share_delta * 100)
    ),
    employee_nps: Math.max(
      -100,
      Math.min(100, baseKPIs.employee_nps + aggregatedImpact.employee_nps_delta)
    ),
    customer_satisfaction: Math.max(
      0,
      Math.min(100, baseKPIs.customer_satisfaction + aggregatedImpact.customer_satisfaction_delta)
    ),
    cash_balance_aed: baseKPIs.cash_balance_aed - aggregatedImpact.cash_impact_aed,
  };
}

/**
 * Aggregate multiple KPI impacts (sum most fields, compound revenue).
 */
export function aggregateKPIImpacts(impacts: KPIImpact[]): KPIImpact {
  if (impacts.length === 0) return zeroImpact();

  return impacts.reduce(
    (acc, impact) => ({
      revenue_pct: acc.revenue_pct + impact.revenue_pct,
      margin_delta: acc.margin_delta + impact.margin_delta,
      working_capital_delta: acc.working_capital_delta + impact.working_capital_delta,
      fill_rate_delta: acc.fill_rate_delta + impact.fill_rate_delta,
      market_share_delta: acc.market_share_delta + impact.market_share_delta,
      employee_nps_delta: acc.employee_nps_delta + impact.employee_nps_delta,
      customer_satisfaction_delta:
        acc.customer_satisfaction_delta + impact.customer_satisfaction_delta,
      cash_impact_aed: acc.cash_impact_aed + impact.cash_impact_aed,
      share_price_delta_pct: acc.share_price_delta_pct + impact.share_price_delta_pct,
      one_time: false, // aggregated = ongoing
      duration_months: Math.max(acc.duration_months, impact.duration_months),
      probability: 1, // already applied
    }),
    zeroImpact()
  );
}

function zeroImpact(): KPIImpact {
  return {
    revenue_pct: 0,
    margin_delta: 0,
    working_capital_delta: 0,
    fill_rate_delta: 0,
    market_share_delta: 0,
    employee_nps_delta: 0,
    customer_satisfaction_delta: 0,
    cash_impact_aed: 0,
    share_price_delta_pct: 0,
    one_time: false,
    duration_months: 0,
    probability: 1,
  };
}

// ─── Player Event Response ────────────────────────────────────────────────────

/**
 * Apply a player's chosen response to an active event.
 * Updates the event record and adjusts KPI impacts accordingly.
 */
export async function applyPlayerEventResponse(
  activeEventId: string,
  responseOptionId: string,
  responseOption: EventResponseOption,
  sessionId: string
): Promise<void> {
  const admin = createSupabaseAdmin();

  await admin
    .from('sim_active_events')
    .update({
      player_response_option_id: responseOptionId,
      kpi_impact_applied: responseOption.kpi_modifier,
      price_impact_applied:
        responseOption.kpi_modifier.share_price_delta_pct ?? 0,
    })
    .eq('id', activeEventId)
    .eq('session_id', sessionId);
}

// ─── GCC Seasonal Events (Scripted) ──────────────────────────────────────────

/**
 * Scripted events that fire deterministically based on calendar month.
 * These are in addition to the probabilistic events in the DB.
 */
export interface ScriptedEvent {
  name: string;
  description: string;
  kpiImpact: Partial<KPIImpact>;
  sharePriceImpact: number;
  durationMonths: number;
}

export function getScriptedGCCEvents(
  calendarMonth: number,
  gameState: SimGameState
): ScriptedEvent[] {
  const events: ScriptedEvent[] = [];

  // Ramadan: fires automatically based on calendar
  if (gameState.ramadan_active) {
    events.push({
      name: 'Ramadan Consumer Surge',
      description:
        'Ramadan drives 30-40% FMCG demand increase. Retail channels stocked. Promotional spend peaks.',
      kpiImpact: {
        revenue_pct: 0.35,
        fill_rate_delta: -0.05, // stock pressure
        customer_satisfaction_delta: 5,
      },
      sharePriceImpact: 0.04,
      durationMonths: 1,
    });
  }

  // National Day (UAE Dec, KSA Sept)
  if (gameState.national_day_boost) {
    events.push({
      name: 'National Day Sales Uplift',
      description: 'National Day promotional period drives category volume.',
      kpiImpact: { revenue_pct: 0.08, market_share_delta: 0.005 },
      sharePriceImpact: 0.02,
      durationMonths: 1,
    });
  }

  // Summer cold chain premium (Jun-Aug)
  if (gameState.summer_active) {
    events.push({
      name: 'Summer Cold Chain Premium',
      description: 'Temperature extremes increase cold chain logistics cost by 15-20%.',
      kpiImpact: {
        margin_delta: -0.018,
        cash_impact_aed: 500_000,
      },
      sharePriceImpact: -0.01,
      durationMonths: 3,
    });
  }

  return events;
}

// ─── Event Notification Builder ───────────────────────────────────────────────

export interface EventNotificationPayload {
  title: string;
  body: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  actionUrl: string;
}

export function buildEventNotification(
  event: SimMarketEvent,
  sessionId: string,
  isNew: boolean
): EventNotificationPayload {
  const impactPct = (event.price_impact_pct * 100).toFixed(1);
  const direction = event.price_impact_pct >= 0 ? '+' : '';

  let priority: 'low' | 'medium' | 'high' | 'critical' = 'medium';
  if (Math.abs(event.price_impact_pct) >= 0.10) priority = 'critical';
  else if (Math.abs(event.price_impact_pct) >= 0.05) priority = 'high';
  else if (Math.abs(event.price_impact_pct) >= 0.02) priority = 'medium';
  else priority = 'low';

  return {
    title: isNew ? `⚡ ${event.name}` : `📋 ${event.name} — Ongoing`,
    body: isNew
      ? `${event.flavor_text} Share price impact: ${direction}${impactPct}%.`
      : `Event continues for ${event.duration_months} more month(s). ${direction}${impactPct}% price drag.`,
    priority,
    actionUrl: `/simulator/${sessionId}/overview#events`,
  };
}
