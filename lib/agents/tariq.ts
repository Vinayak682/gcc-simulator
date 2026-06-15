/**
 * Tariq Al-Rashidi — Chief Strategy Officer
 * Domain: Competitive positioning, market expansion, strategic options
 * Autonomy: Level 1 (Inform) — advisors observe, do not act autonomously
 *
 * Tariq synthesizes inputs from all other agents and flags strategic drift.
 * He's the most expensive agent (streaming Mode A), so rule-based evaluation
 * determines whether to surface a recommendation without calling Claude.
 */

import type { AgentRunResult } from '../simulator/types';
import {
  type AgentRunContext,
  logObservation,
  createRecommendation,
  checkKPIThresholds,
} from './runner';

export async function runTariq(ctx: AgentRunContext): Promise<AgentRunResult> {
  const { latestKPIs, previousKPIs, gameState, activeEvents, currentMonth, session } = ctx;

  let activitiesCreated = 0;
  let recommendationsCreated = 0;

  // ── Rule-based checks (no LLM) ──────────────────────────────────────────

  const alerts = checkKPIThresholds(latestKPIs);

  // Strategic position check: are we losing share AND margin simultaneously?
  const shareDrop = previousKPIs
    ? latestKPIs.market_share_pct - previousKPIs.market_share_pct
    : 0;
  const marginDrop = previousKPIs
    ? latestKPIs.ebitda_margin - previousKPIs.ebitda_margin
    : 0;

  const doubleCompression = shareDrop < -0.5 && marginDrop < -0.01;

  // Month 6+ check: is strategy working?
  const strategyStalled =
    currentMonth >= 6 &&
    previousKPIs &&
    latestKPIs.share_price < previousKPIs.share_price * 0.95;

  // Active event that needs strategic response
  const highImpactEvents = activeEvents.filter(
    (ae) => Math.abs(ae.sim_market_events.price_impact_pct) >= 0.05
  );

  // ── Observations ─────────────────────────────────────────────────────────

  // Monthly strategic summary (always fires, Level 1)
  const kpiSummary = [
    `Share price: AED ${latestKPIs.share_price?.toFixed(2)}`,
    `Revenue: AED ${(latestKPIs.revenue_aed / 1_000_000).toFixed(1)}M`,
    `EBITDA: ${(latestKPIs.ebitda_margin * 100).toFixed(1)}%`,
    `Market share: ${latestKPIs.market_share_pct.toFixed(1)}%`,
  ].join(' | ');

  await logObservation(
    ctx,
    `Month ${currentMonth} Strategic Review`,
    kpiSummary,
    {
      share_price: latestKPIs.share_price,
      market_share: latestKPIs.market_share_pct,
      alerts: alerts.map((a) => a.kpiName),
    }
  );
  activitiesCreated++;

  // ── Recommendations (Level 2) ─────────────────────────────────────────────

  if (doubleCompression && ctx.autonomyLevel >= 2) {
    await createRecommendation(ctx, {
      title: 'Strategic Alert: Margin-Share Double Compression',
      recommendation: `Market share fell ${Math.abs(shareDrop).toFixed(1)}pts while EBITDA margin dropped ${(Math.abs(marginDrop) * 100).toFixed(1)}pp this month. This simultaneous compression is a leading indicator of strategic drift. Recommend immediate review of pricing strategy and cost base. Competitors may be executing a squeeze play.`,
      confidence: 0.82,
      reasoning:
        'Rule-based detection: both market share and margin declining MoM is a critical strategic signal that requires board attention.',
    });
    recommendationsCreated++;
  }

  if (strategyStalled && ctx.autonomyLevel >= 2) {
    const gameMode = String(session.session_metadata?.scenario_game_mode ?? 'turnaround');
    await createRecommendation(ctx, {
      title: `Strategy Review Needed — ${gameMode.toUpperCase()} momentum lost`,
      recommendation: `By Month ${currentMonth}, share price should be recovering. Current trajectory is AED ${latestKPIs.share_price?.toFixed(2)} vs Month ${currentMonth - 1} AED ${previousKPIs?.share_price?.toFixed(2)}. Consider: (1) Accelerate cost transformation, (2) Pricing architecture review, (3) Channel mix shift to higher-margin routes.`,
      confidence: 0.75,
      reasoning: 'Price declining in Month 6+ indicates chosen strategy is underperforming game mode requirements.',
    });
    recommendationsCreated++;
  }

  if (highImpactEvents.length > 0 && ctx.autonomyLevel >= 2) {
    const eventNames = highImpactEvents.map((e) => e.sim_market_events.name).join(', ');
    await createRecommendation(ctx, {
      title: `High-Impact Event Response: ${highImpactEvents[0].sim_market_events.name}`,
      recommendation: `Active market shock(s): ${eventNames}. Combined price impact: ${(highImpactEvents.reduce((s, e) => s + e.sim_market_events.price_impact_pct, 0) * 100).toFixed(1)}%. Recommend proactive DFM communication to prevent sentiment overshoot. Consider defensive hedging on commodity exposure if relevant.`,
      confidence: 0.80,
      reasoning: 'High-impact active events require strategic response to prevent share price spiral via sentiment channel.',
    });
    recommendationsCreated++;
  }

  return {
    agentName: 'tariq',
    success: true,
    activitiesCreated,
    recommendationsCreated,
    actionsExecuted: 0,
    costUsd: 0, // no LLM call in this tick (streaming Mode A is user-triggered)
  };
}
