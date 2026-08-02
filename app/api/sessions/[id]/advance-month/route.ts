/**
 * POST /api/sessions/[id]/advance-month
 * Core game loop — advances simulation by one month.
 *
 * Pipeline:
 * 1. Validate: session active, no pending critical decisions
 * 2. Apply decision KPI impacts (from decisions made this month)
 * 3. Apply active event KPI impacts
 * 4. Apply GCC seasonal modifiers
 * 5. Compute new KPI snapshot
 * 6. Calculate 3-layer share price
 * 7. Evaluate new event triggers
 * 8. Check win/loss conditions
 * 9. Generate next month's decisions
 * 10. Run agent tick
 * 11. Update session month counter
 * 12. Return AdvanceMonthResult
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, createSupabaseAdmin } from '@/lib/simulator/supabase';
import {
  getSessionWithContext,
  getDecisionHistory,
  createKPISnapshot,
  insertSharePrice,
  advanceSessionMonth,
  markSessionComplete,
  pushNotification,
  upsertGameState,
} from '@/lib/simulator/supabase';
import { calculateSharePrice, getGCCCalendarModifiers, checkWinLoss } from '@/lib/simulator/sharePrice';
import { evaluateEventTriggers, applyEventImpacts, aggregateKPIImpacts, buildEventNotification } from '@/lib/simulator/events';
import { runAgentTick } from '@/lib/agents/runner';
import type { AdvanceMonthResult, SimKPISnapshot, KPIImpact } from '@/lib/simulator/types';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authSession = await requireAuth();
    const { id: sessionId } = await params;

    // ── 1. Load session context ──────────────────────────────────────────────
    const ctx = await getSessionWithContext(sessionId);
    if (!ctx) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    const { session, latestKPIs, previousKPIs, gameState, activeEvents } = ctx;

    if (session.status !== 'active') {
      return NextResponse.json({ error: `Session is ${session.status}` }, { status: 409 });
    }

    if (!latestKPIs || !gameState) {
      return NextResponse.json({ error: 'Session state not initialized' }, { status: 500 });
    }

    const currentMonth = session.current_month;
    const nextMonth = currentMonth + 1;

    // ── 2. Apply decision KPI impacts ────────────────────────────────────────
    const admin = createSupabaseAdmin();
    const { data: decidedThisMonth } = await admin
      .from('sim_decisions')
      .select('kpi_impact, chosen_option_id, options')
      .eq('session_id', sessionId)
      .eq('month', currentMonth)
      .eq('status', 'decided');

    const decisionImpacts: KPIImpact[] = (decidedThisMonth ?? [])
      .filter((d: any) => d.kpi_impact)
      .map((d: any) => d.kpi_impact as KPIImpact);

    const aggregatedDecisionImpact = aggregateKPIImpacts(decisionImpacts);

    // ── 3. Apply event KPI impacts ────────────────────────────────────────────
    const alreadyTriggeredIds = activeEvents.map((ae) => ae.event_id);
    const eventTriggerResult = await evaluateEventTriggers({
      sessionId,
      currentMonth: nextMonth,
      scenarioId: session.scenario_id,
      currentKPIs: latestKPIs,
      gameState,
      alreadyTriggeredEventIds: alreadyTriggeredIds,
    });

    const allActiveImpacts = aggregateKPIImpacts([
      ...activeEvents.map((ae) => ae.kpi_impact_applied).filter(Boolean) as KPIImpact[],
      eventTriggerResult.kpiAdjustments,
    ]);

    // ── 4. GCC calendar for next month ───────────────────────────────────────
    const calendarMods = getGCCCalendarModifiers(nextMonth);

    // ── 5. Compute new KPI snapshot ──────────────────────────────────────────

    // Base KPIs evolve from current with small natural growth/decay
    const naturalGrowth = computeNaturalGrowth(latestKPIs, currentMonth);

    // Apply all impacts on top of natural growth
    const decisionAdjusted = applyEventImpacts(naturalGrowth, aggregatedDecisionImpact);
    const eventAdjusted = applyEventImpacts(
      { ...latestKPIs, ...decisionAdjusted },
      allActiveImpacts
    );

    const newRevenue = (eventAdjusted.revenue_aed ?? latestKPIs.revenue_aed) *
      (calendarMods.isRamadan ? calendarMods.ramadanDemandMultiplier : 1);
    const newGrossMargin = eventAdjusted.gross_margin ?? latestKPIs.gross_margin;
    const newEBITDAMargin = Math.max(
      -0.20,
      newGrossMargin - (calendarMods.isSummer ? 0.018 : 0.01) // summer cold chain drag
    );
    const newFillRate = Math.min(0.99, Math.max(0.30, eventAdjusted.fill_rate ?? latestKPIs.fill_rate));
    const newMarketShare = Math.min(50, Math.max(0, eventAdjusted.market_share_pct ?? latestKPIs.market_share_pct));
    const newCash = Math.max(0, eventAdjusted.cash_balance_aed ?? latestKPIs.cash_balance_aed);

    // ── 6. Calculate 3-layer share price ─────────────────────────────────────

    // Build the next month's KPI snapshot (partial) for price calculation
    const nextKPIPartial: SimKPISnapshot = {
      ...latestKPIs,
      month: nextMonth,
      revenue_aed: newRevenue,
      gross_margin: newGrossMargin,
      ebitda_margin: newEBITDAMargin,
      fill_rate: newFillRate,
      market_share_pct: newMarketShare,
      cash_balance_aed: newCash,
      inventory_days: latestKPIs.inventory_days + (newFillRate < 0.80 ? -5 : 2),
      receivable_days: latestKPIs.receivable_days,
      payable_days: latestKPIs.payable_days,
    } as SimKPISnapshot;

    // Combine old active events + new events for price calculation
    const allActiveAfter = [
      ...activeEvents.filter((ae) => !eventTriggerResult.expiredEventIds.includes(ae.id)),
      ...eventTriggerResult.newEvents.map((ne) => ({
        ...ne,
        sim_market_events: activeEvents.find((ae) => ae.event_id === ne.event_id)?.sim_market_events
          ?? { price_impact_pct: 0, name: '' } as any,
      })),
    ];

    const newGameStateForPrice = {
      ...gameState,
      ramadan_active: calendarMods.isRamadan,
      ramadan_demand_multiplier: calendarMods.ramadanDemandMultiplier,
      summer_active: calendarMods.isSummer,
      national_day_boost: calendarMods.isNationalDay,
    };

    const shareComponents = calculateSharePrice({
      basePrice: ctx.session.sim_scenarios.initial_share_price,
      currentKPIs: nextKPIPartial,
      previousKPIs: latestKPIs,
      activeEvents: allActiveAfter,
      gameState: newGameStateForPrice,
      previousSentiment: latestKPIs.market_sentiment ?? 0,
      // Seeds the sentiment walk so the same session and month always score the
      // same. Without this the leaderboard ranks part luck: two players who made
      // identical decisions would land on different share prices.
      sessionId,
    });

    // ── 7. Persist new KPI snapshot ───────────────────────────────────────────

    const grossProfit = newRevenue * newGrossMargin;
    const ebitda = newRevenue * newEBITDAMargin;
    const newKPISnapshot = await createKPISnapshot({
      session_id: sessionId,
      month: nextMonth,
      revenue_aed: newRevenue,
      cogs_aed: newRevenue - grossProfit,
      gross_profit_aed: grossProfit,
      gross_margin: newGrossMargin,
      ebitda_aed: ebitda,
      ebitda_margin: newEBITDAMargin,
      net_profit_aed: ebitda - (newRevenue * 0.06),
      net_margin: newEBITDAMargin - 0.06,
      cash_balance_aed: newCash,
      accounts_receivable_aed: newRevenue * (latestKPIs.receivable_days / 365),
      inventory_value_aed: latestKPIs.inventory_value_aed * (newFillRate > 0.90 ? 0.95 : 1.05),
      accounts_payable_aed: newRevenue * (latestKPIs.payable_days / 365),
      net_working_capital_aed: newRevenue * 0.18,
      fill_rate: newFillRate,
      inventory_days: nextKPIPartial.inventory_days,
      receivable_days: latestKPIs.receivable_days,
      payable_days: latestKPIs.payable_days,
      market_share_pct: newMarketShare,
      units_sold: Math.floor(newRevenue / 18.5),
      avg_selling_price_aed: 18.5,
      headcount: latestKPIs.headcount,
      employee_nps: Math.min(100, Math.max(-100, latestKPIs.employee_nps + (newEBITDAMargin > 0.10 ? 2 : -3))),
      saudization_pct: latestKPIs.saudization_pct,
      customer_satisfaction: Math.min(100, Math.max(0, latestKPIs.customer_satisfaction + (newFillRate > 0.90 ? 1 : -3))),
      nps: latestKPIs.nps,
      carbon_intensity: latestKPIs.carbon_intensity,
      fundamentals_score: shareComponents.fundamentalsScore,
      market_sentiment: shareComponents.sentimentDrift,
      event_shock_total: shareComponents.eventsShock,
      share_price: shareComponents.finalPrice,
    });

    // Persist share price history
    await insertSharePrice({
      session_id: sessionId,
      month: nextMonth,
      week: null,
      price_aed: shareComponents.finalPrice,
      fundamentals_component: shareComponents.finalPrice * 0.60,
      events_component: shareComponents.finalPrice * 0.25,
      sentiment_component: shareComponents.finalPrice * 0.15,
      fundamentals_score: shareComponents.fundamentalsScore,
      active_event_ids: allActiveAfter.map((e) => e.event_id),
      sentiment_drift: shareComponents.sentimentDrift,
    });

    // ── 8. Update game state for next month ───────────────────────────────────

    const updatedGameState = await upsertGameState({
      session_id: sessionId,
      month: nextMonth,
      ramadan_active: calendarMods.isRamadan,
      ramadan_demand_multiplier: calendarMods.ramadanDemandMultiplier,
      summer_active: calendarMods.isSummer,
      summer_cold_chain_cost_multiplier: calendarMods.summerColdChainMultiplier,
      national_day_boost: calendarMods.isNationalDay,
      saudization_fine_active: gameState.saudization_fine_active,
      dfm_disclosure_pending: eventTriggerResult.newEvents.some(
        (e) => e.sim_market_events?.type === 'regulatory'
      ),
      vat_rate: gameState.vat_rate,
      competitor_aggression: Math.min(10, gameState.competitor_aggression + (Math.random() > 0.7 ? 0.5 : 0)),
      consumer_confidence: gameState.consumer_confidence,
      commodity_index: gameState.commodity_index,
      fx_usd_aed: 3.6725,
      decisions_made: 0,
      decisions_available: 3,
      claude_calls_this_month: 0,
      claude_budget_remaining: gameState.claude_budget_remaining,
      phase: 'decision',
      pending_event_ids: eventTriggerResult.newEvents.map((e) => e.id),
    });

    // ── 9. Check win/loss ────────────────────────────────────────────────────

    const scenario = ctx.session.sim_scenarios;
    const winLoss = checkWinLoss({
      currentPrice: shareComponents.finalPrice,
      winTarget: scenario.win_target_price,
      lossFloor: scenario.loss_floor_price,
      currentMonth: nextMonth,
      totalMonths: session.total_months,
      currentKPIs: newKPISnapshot,
      gameMode: scenario.game_mode,
    });

    if (winLoss.won || winLoss.lost) {
      await markSessionComplete(
        sessionId,
        shareComponents.finalPrice,
        winLoss.won,
        winLoss.lost
      );

      await pushNotification({
        org_id: '',
        user_id: authSession.user.id,
        session_id: sessionId,
        type: winLoss.won ? 'win_condition' : 'loss_condition',
        priority: 'critical',
        title: winLoss.won ? '🏆 Victory — Simulation Complete!' : '💔 Simulation Ended',
        body: winLoss.won ? winLoss.winReason! : winLoss.lossReason!,
        action_url: `/simulator/${sessionId}/replay`,
        metadata: { final_price: shareComponents.finalPrice },
      });
    }

    // ── 10. Generate next month's decisions ───────────────────────────────────

    if (!winLoss.won && !winLoss.lost) {
      await generateMonthDecisions(sessionId, nextMonth, newKPISnapshot, updatedGameState, admin);
    }

    // ── 11. Run agent tick ────────────────────────────────────────────────────

    if (!winLoss.won && !winLoss.lost) {
      // Fire-and-forget — don't block the response
      runAgentTick({
        sessionId,
        month: nextMonth,
        triggerSource: 'month_advance',
        agentsToRun: ['omar', 'faris', 'nadia', 'zara', 'leila', 'priya', 'tariq', 'board'],
      }).catch((err) => console.error('Agent tick error:', err));
    }

    // ── 12. Advance session month counter ─────────────────────────────────────

    const updatedSession = await advanceSessionMonth(sessionId, nextMonth);

    // Notify about new events
    for (const newEvent of eventTriggerResult.newEvents) {
      const notification = buildEventNotification(
        newEvent.sim_market_events!,
        sessionId,
        true
      );
      await pushNotification({
        org_id: '',
        user_id: authSession.user.id,
        session_id: sessionId,
        type: 'market_event',
        priority: notification.priority,
        title: notification.title,
        body: notification.body,
        action_url: notification.actionUrl,
        metadata: { event_id: newEvent.event_id },
      });
    }

    const result: AdvanceMonthResult = {
      previousMonth: currentMonth,
      newMonth: nextMonth,
      kpiSnapshot: newKPISnapshot,
      sharePrice: shareComponents,
      newEvents: eventTriggerResult.newEvents,
      expiredEvents: eventTriggerResult.expiredEventIds,
      agentSummaries: {} as Record<string, string>, // populated by agent tick async
      sopCycle: null,
      nextDecisions: [],
      winTriggered: winLoss.won,
      lossTriggered: winLoss.lost,
      leaderboardUpdated: winLoss.won,
    };

    return NextResponse.json(result);
  } catch (err: any) {
    if (err.message === 'UNAUTHORIZED') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('POST /api/sessions/[id]/advance-month error:', err);
    return NextResponse.json({ error: err.message ?? 'Internal server error' }, { status: 500 });
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Natural organic growth/decay — small baseline momentum each month */
function computeNaturalGrowth(kpis: SimKPISnapshot, month: number): SimKPISnapshot {
  const growthRate = 0.005; // 0.5% MoM natural growth (6% annualized)
  const marginNoise = (Math.random() - 0.5) * 0.005; // ±0.25pp noise

  return {
    ...kpis,
    revenue_aed: kpis.revenue_aed * (1 + growthRate),
    ebitda_margin: Math.min(0.35, kpis.ebitda_margin + marginNoise),
    gross_margin: kpis.gross_margin + marginNoise * 0.5,
    fill_rate: Math.min(0.99, kpis.fill_rate + (kpis.fill_rate < 0.90 ? 0.01 : -0.002)),
    market_share_pct: kpis.market_share_pct + (Math.random() - 0.52) * 0.3, // slight mean reversion
    cash_balance_aed: kpis.cash_balance_aed + (kpis.net_profit_aed ?? 0),
  };
}

/** Generate 2-3 decisions for the next month */
async function generateMonthDecisions(
  sessionId: string,
  month: number,
  kpis: SimKPISnapshot,
  gameState: any,
  admin: any
): Promise<void> {
  const decisions = selectDecisionsForMonth(month, kpis, gameState);

  if (decisions.length === 0) return;

  await admin.from('sim_decisions').insert(
    decisions.map((d) => ({
      session_id: sessionId,
      month,
      category: d.category,
      title: d.title,
      description: d.description,
      context_data: {
        current_kpis: {
          share_price: kpis.share_price,
          fill_rate: kpis.fill_rate,
          ebitda_margin: kpis.ebitda_margin,
          market_share_pct: kpis.market_share_pct,
        },
        active_events: gameState.pending_event_ids ?? [],
        gcc_modifiers: {
          ramadan_active: gameState.ramadan_active,
          summer_active: gameState.summer_active,
        },
        relevant_history: [],
      },
      options: d.options,
      status: 'pending',
      expires_at: null,
    }))
  );
}

/** Decision selection logic — rotates categories across months */
function selectDecisionsForMonth(
  month: number,
  kpis: SimKPISnapshot,
  gameState: any
): any[] {
  const decisions: any[] = [];

  // Always: 1 operational decision
  if (kpis.fill_rate < 0.85) {
    decisions.push(fillRateCrisisDecision(kpis));
  } else if (kpis.inventory_days > 70) {
    decisions.push(inventoryOptimizationDecision(kpis));
  } else {
    decisions.push(pricingDecision(month, kpis));
  }

  // Context-based: Ramadan decision if active
  if (gameState.ramadan_active) {
    decisions.push(ramadanStrategyDecision(kpis));
  }

  // Every 3 months: strategic/HR decision
  if (month % 3 === 0) {
    decisions.push(quarterlyStrategicDecision(month, kpis));
  }

  return decisions.slice(0, 3);
}

function fillRateCrisisDecision(kpis: SimKPISnapshot) {
  const costOption = 2_000_000 + (1 - kpis.fill_rate) * 5_000_000;
  return {
    category: 'supply_chain',
    title: 'Fill Rate Crisis: Emergency Response',
    description: `Fill rate is at ${(kpis.fill_rate * 100).toFixed(0)}%. Retailers are threatening to delist. You must act now.`,
    options: [
      {
        id: 'A', label: 'Air Freight Emergency Stock',
        description: 'Charter air freight for top-20 revenue SKUs. Expensive but fastest.',
        tradeoffs: ['High cost (~AED 2M)', 'Restores fill rate in 2-3 weeks', 'Margin hit -1.5pp'],
        projected_kpi_impact: { fill_rate_delta: 0.12, cash_impact_aed: costOption, margin_delta: -0.015, revenue_pct: 0.05, share_price_delta_pct: 0.06, market_share_delta: 0.002, working_capital_delta: -0.02, employee_nps_delta: 5, customer_satisfaction_delta: 8, one_time: true, duration_months: 1, probability: 0.85 },
        risk_level: 'medium', gcc_context: 'DXB air freight priority lanes available',
        agent_notes: { tariq: 'Only option to prevent delisting', omar: 'Confirms air freight is fastest', nadia: 'Expensive but stockout cost is higher', zara: 'Retailers will notice if we act fast', faris: 'Air freight buys us 2 months', leila: 'Key accounts are already calling', priya: 'Inaction is riskier than cost', board: 'Authorized at MD level' },
      },
      {
        id: 'B', label: 'Allocate to Priority Accounts',
        description: 'Ration limited stock to highest-margin accounts only. Accept partial delisting in C-tier.',
        tradeoffs: ['Preserves margin', 'Damages C-tier relationships', 'Fill rate improves slowly'],
        projected_kpi_impact: { fill_rate_delta: 0.05, cash_impact_aed: 200000, margin_delta: 0.008, revenue_pct: -0.03, share_price_delta_pct: -0.01, market_share_delta: -0.005, working_capital_delta: 0, employee_nps_delta: 0, customer_satisfaction_delta: -5, one_time: false, duration_months: 2, probability: 0.75 },
        risk_level: 'medium', gcc_context: null,
        agent_notes: { tariq: 'Strategic but risky for brand', omar: 'Operationally feasible', nadia: 'Margin-preserving approach', zara: 'Brand damage in C-tier recoverable', faris: 'Demand planning needed', leila: 'Account managers will struggle', priya: 'Reputational risk manageable', board: 'Acceptable if communicated well' },
      },
      {
        id: 'C', label: 'Emergency Supplier Activation',
        description: 'Activate backup supplier at 15% premium. Slower than air freight but more sustainable.',
        tradeoffs: ['Medium cost', 'COGS increase', 'Fills gap in 4-6 weeks'],
        projected_kpi_impact: { fill_rate_delta: 0.07, cash_impact_aed: 800000, margin_delta: -0.008, revenue_pct: 0.02, share_price_delta_pct: 0.02, market_share_delta: 0, working_capital_delta: -0.01, employee_nps_delta: 0, customer_satisfaction_delta: 3, one_time: false, duration_months: 2, probability: 0.80 },
        risk_level: 'low', gcc_context: 'JBL Free Zone suppliers can activate within 2 weeks',
        agent_notes: { tariq: 'Sustainable medium-term fix', omar: 'Recommend this alongside option A', nadia: 'Better margin than air freight', zara: 'Brand impact minimal', faris: 'Demand buffer created', leila: 'Account managers can manage 4-6 week gap', priya: 'Single-source risk partially mitigated', board: 'Good risk management' },
      },
    ],
  };
}

function pricingDecision(month: number, kpis: SimKPISnapshot) {
  return {
    category: 'pricing',
    title: 'Quarterly Pricing Review',
    description: `Market data shows commodity costs ${kpis.gross_margin < 0.40 ? 'squeezing your margins' : 'have stabilized'}. How do you respond on pricing?`,
    options: [
      {
        id: 'A', label: 'Hold Prices — Volume Priority',
        description: 'Maintain current prices to defend volume and market share in competitive GCC market.',
        tradeoffs: ['Protects volume', 'Margin stays compressed', 'Market share maintained'],
        projected_kpi_impact: { revenue_pct: 0.01, margin_delta: -0.003, share_price_delta_pct: 0, market_share_delta: 0.003, fill_rate_delta: 0, working_capital_delta: 0, employee_nps_delta: 0, customer_satisfaction_delta: 2, cash_impact_aed: 0, one_time: false, duration_months: 3, probability: 0.80 },
        risk_level: 'low', gcc_context: 'GCC consumers price-sensitive in modern trade', agent_notes: {} as any,
      },
      {
        id: 'B', label: 'Selective +5% Price Increase',
        description: 'Increase prices 5% on premium SKUs only. Protect value tier to maintain household penetration.',
        tradeoffs: ['Margin recovery +1.5pp', 'Volume risk -3-5% on premium SKUs', 'Net revenue neutral to positive'],
        projected_kpi_impact: { revenue_pct: 0.02, margin_delta: 0.015, share_price_delta_pct: 0.03, market_share_delta: -0.003, fill_rate_delta: 0, working_capital_delta: 0, employee_nps_delta: 0, customer_satisfaction_delta: -3, cash_impact_aed: 0, one_time: false, duration_months: 3, probability: 0.72 },
        risk_level: 'medium', gcc_context: 'DFM investors track margin recovery closely', agent_notes: {} as any,
      },
      {
        id: 'C', label: 'Promotional Investment — Buy Market Share',
        description: 'Increase trade promotions by AED 1.5M to grab share while competitors are distracted by cost pressures.',
        tradeoffs: ['Market share +0.8-1.2pp', 'Margin hit -1pp short-term', 'Revenue uplift if successful'],
        projected_kpi_impact: { revenue_pct: 0.06, margin_delta: -0.010, share_price_delta_pct: 0.01, market_share_delta: 0.010, fill_rate_delta: -0.03, working_capital_delta: -0.01, employee_nps_delta: 0, customer_satisfaction_delta: 5, cash_impact_aed: 1500000, one_time: true, duration_months: 2, probability: 0.65 },
        risk_level: 'high', gcc_context: 'Ramadan and National Day promo periods offer 2× ROI on trade spend', agent_notes: {} as any,
      },
    ],
  };
}

function ramadanStrategyDecision(kpis: SimKPISnapshot) {
  return {
    category: 'marketing',
    title: 'Ramadan Strategy: How to Play the Peak Season',
    description: 'Ramadan is the most important retail season in GCC. Your decisions now will define your full-year market position.',
    options: [
      {
        id: 'A', label: 'Premium Gifting Push',
        description: 'Launch Ramadan gift sets at AED 199-299 price point. High margin, targets gifting occasion.',
        tradeoffs: ['Margin +2pp', 'Lower volume', 'Brand premium positioning'],
        projected_kpi_impact: { revenue_pct: 0.12, margin_delta: 0.02, share_price_delta_pct: 0.04, market_share_delta: 0.005, fill_rate_delta: -0.05, working_capital_delta: 0, employee_nps_delta: 3, customer_satisfaction_delta: 8, cash_impact_aed: 500000, one_time: true, duration_months: 1, probability: 0.78 },
        risk_level: 'medium', gcc_context: 'UAE gifting market for Ramadan is AED 2.3B annually', agent_notes: {} as any,
      },
      {
        id: 'B', label: 'Mass Market Value Bundles',
        description: 'Heavy promotion on value packs to drive household penetration and volume.',
        tradeoffs: ['High volume', 'Margin pressure -1pp', 'Market share gain'],
        projected_kpi_impact: { revenue_pct: 0.20, margin_delta: -0.01, share_price_delta_pct: 0.03, market_share_delta: 0.015, fill_rate_delta: -0.08, working_capital_delta: -0.02, employee_nps_delta: 0, customer_satisfaction_delta: 5, cash_impact_aed: 800000, one_time: true, duration_months: 1, probability: 0.82 },
        risk_level: 'medium', gcc_context: 'Blue-collar segment in Sharjah/Ajman is key volume driver', agent_notes: {} as any,
      },
      {
        id: 'C', label: 'Balanced Portfolio Approach',
        description: 'Both gifting and value lines activated. Higher cost but full market coverage.',
        tradeoffs: ['Neutral margin', 'Full segment coverage', 'Operational complexity'],
        projected_kpi_impact: { revenue_pct: 0.16, margin_delta: 0.005, share_price_delta_pct: 0.035, market_share_delta: 0.010, fill_rate_delta: -0.06, working_capital_delta: -0.01, employee_nps_delta: 2, customer_satisfaction_delta: 6, cash_impact_aed: 1200000, one_time: true, duration_months: 1, probability: 0.80 },
        risk_level: 'low', gcc_context: 'Most major GCC FMCG players run both tracks', agent_notes: {} as any,
      },
    ],
  };
}

function inventoryOptimizationDecision(kpis: SimKPISnapshot) {
  return {
    category: 'supply_chain',
    title: 'Inventory Rationalization',
    description: `Inventory at ${kpis.inventory_days.toFixed(0)} days is tying up AED ${(kpis.inventory_value_aed / 1_000_000).toFixed(1)}M in working capital. How do you address this?`,
    options: [
      {
        id: 'A', label: 'Promotional Clearance',
        description: 'Run trade promotion to sell through excess stock quickly.',
        tradeoffs: ['Frees cash', 'Margin hit', 'Fill rate improvement on cleared lines'],
        projected_kpi_impact: { revenue_pct: 0.05, margin_delta: -0.012, share_price_delta_pct: 0.01, market_share_delta: 0.002, fill_rate_delta: 0.03, working_capital_delta: 0.05, employee_nps_delta: 0, customer_satisfaction_delta: 2, cash_impact_aed: -1000000, one_time: true, duration_months: 1, probability: 0.85 },
        risk_level: 'low', gcc_context: null, agent_notes: {} as any,
      },
      {
        id: 'B', label: 'Pause Purchasing 6 Weeks',
        description: 'Stop non-critical POs and let inventory naturally sell down.',
        tradeoffs: ['Free cash', 'Fill rate risk', 'Supplier relationship strain'],
        projected_kpi_impact: { revenue_pct: -0.01, margin_delta: 0.008, share_price_delta_pct: 0.005, market_share_delta: -0.002, fill_rate_delta: -0.04, working_capital_delta: 0.08, employee_nps_delta: -2, customer_satisfaction_delta: -4, cash_impact_aed: -2000000, one_time: false, duration_months: 2, probability: 0.90 },
        risk_level: 'medium', gcc_context: null, agent_notes: {} as any,
      },
      {
        id: 'C', label: 'Rebalance with Supply Chain Finance',
        description: 'Use SCF to extend payables while inventory naturally turns. No promotional dilution.',
        tradeoffs: ['Financing cost', 'No margin hit', 'Preserves supplier terms'],
        projected_kpi_impact: { revenue_pct: 0, margin_delta: -0.003, share_price_delta_pct: 0.01, market_share_delta: 0, fill_rate_delta: 0.01, working_capital_delta: 0.04, employee_nps_delta: 0, customer_satisfaction_delta: 0, cash_impact_aed: -500000, one_time: false, duration_months: 3, probability: 0.75 },
        risk_level: 'low', gcc_context: 'Emirates NBD SCF program active in UAE market', agent_notes: {} as any,
      },
    ],
  };
}

function quarterlyStrategicDecision(month: number, kpis: SimKPISnapshot) {
  return {
    category: month % 6 === 0 ? 'hr' : 'governance',
    title: month % 6 === 0 ? 'Quarterly Talent Review' : 'Board Governance Update',
    description: month % 6 === 0
      ? `Employee NPS at ${kpis.employee_nps}. With ${kpis.headcount} staff, talent strategy needs review.`
      : `Board requires quarterly business update. How do you frame performance for investors?`,
    options: [
      {
        id: 'A', label: month % 6 === 0 ? 'Invest in L&D' : 'Transparent Disclosure',
        description: month % 6 === 0 ? 'AED 500K leadership development program.' : 'Full disclosure of challenges and recovery plan.',
        tradeoffs: month % 6 === 0 ? ['Cost AED 500K', 'NPS +15 over 2Q', 'Retention up'] : ['Short-term share price pressure', 'Long-term credibility', 'Analyst respect'],
        projected_kpi_impact: { revenue_pct: 0, margin_delta: month % 6 === 0 ? -0.003 : 0, share_price_delta_pct: month % 6 === 0 ? 0.01 : -0.02, market_share_delta: 0, fill_rate_delta: month % 6 === 0 ? 0.01 : 0, working_capital_delta: 0, employee_nps_delta: month % 6 === 0 ? 12 : 0, customer_satisfaction_delta: month % 6 === 0 ? 3 : 0, cash_impact_aed: month % 6 === 0 ? 500000 : 0, one_time: true, duration_months: 2, probability: 0.80 },
        risk_level: 'low', gcc_context: null, agent_notes: {} as any,
      },
      { id: 'B', label: 'Hold Line', description: 'Maintain current approach.', tradeoffs: ['Status quo'], projected_kpi_impact: { revenue_pct: 0, margin_delta: 0, share_price_delta_pct: 0, market_share_delta: 0, fill_rate_delta: 0, working_capital_delta: 0, employee_nps_delta: 0, customer_satisfaction_delta: 0, cash_impact_aed: 0, one_time: true, duration_months: 1, probability: 0.7 }, risk_level: 'low', gcc_context: null, agent_notes: {} as any },
      { id: 'C', label: 'Restructure', description: 'More significant change.', tradeoffs: ['Short-term cost', 'Long-term benefit'], projected_kpi_impact: { revenue_pct: -0.02, margin_delta: 0.02, share_price_delta_pct: 0.01, market_share_delta: 0, fill_rate_delta: 0, working_capital_delta: 0, employee_nps_delta: -5, customer_satisfaction_delta: 0, cash_impact_aed: 1000000, one_time: true, duration_months: 2, probability: 0.65 }, risk_level: 'high', gcc_context: null, agent_notes: {} as any },
    ],
  };
}
