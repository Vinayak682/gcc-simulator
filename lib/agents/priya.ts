/**
 * Priya Sharma — Chief Risk Officer
 * Domain: Enterprise risk, regulatory compliance, ESG, geopolitical, scenario planning
 * Autonomy: Level 1 (Inform) — risk flags inform, never act unilaterally
 *
 * Priya monitors all cross-cutting risks that other agents might miss.
 * She is purely observational — her job is to surface blind spots.
 */

import type { AgentRunResult } from '../simulator/types';
import { type AgentRunContext, logObservation, createRecommendation } from './runner';

export async function runPriya(ctx: AgentRunContext): Promise<AgentRunResult> {
  const { latestKPIs, gameState, activeEvents, currentMonth, session } = ctx;
  let activitiesCreated = 0;
  let recommendationsCreated = 0;

  // Risk dashboard observation
  const riskScore = computeRiskScore(ctx);
  await logObservation(
    ctx,
    `Enterprise Risk Assessment — Month ${currentMonth}`,
    `Overall risk score: ${riskScore}/100 | Active shocks: ${activeEvents.length} | Regulatory flags: ${gameState.saudization_fine_active ? '⚠️ Saudization' : ''}${gameState.dfm_disclosure_pending ? ' ⚠️ DFM' : ''}${!gameState.saudization_fine_active && !gameState.dfm_disclosure_pending ? '✓ None' : ''}`,
    {
      risk_score: riskScore,
      active_events: activeEvents.length,
      cash_months_runway: latestKPIs.cash_balance_aed / Math.max(1, Math.abs(latestKPIs.net_profit_aed || 1)),
      fill_rate: latestKPIs.fill_rate,
    }
  );
  activitiesCreated++;

  // High concentration of negative events
  const negativeEvents = activeEvents.filter(
    (ae) => ae.sim_market_events.price_impact_pct < -0.03
  );
  if (negativeEvents.length >= 2 && ctx.autonomyLevel >= 2) {
    await createRecommendation(ctx, {
      title: `Risk Cluster: ${negativeEvents.length} Simultaneous Headwinds`,
      recommendation: `Multiple negative market events active simultaneously — ${negativeEvents.map((e) => e.sim_market_events.name).join(', ')}. This is a risk cluster scenario. Combined price impact: ${(negativeEvents.reduce((s, e) => s + e.sim_market_events.price_impact_pct, 0) * 100).toFixed(1)}%. Recommend stress test: what if one more negative event fires? Review contingency plans for cash covenant breach and supply disruption simultaneously.`,
      confidence: 0.85,
      reasoning: 'Simultaneous adverse events create non-linear risk due to correlation (e.g., FX shock + commodity shock both hit COGS).',
    });
    recommendationsCreated++;
  }

  // ESG watch
  if (latestKPIs.carbon_intensity > 120 && ctx.autonomyLevel >= 2) {
    await createRecommendation(ctx, {
      title: 'ESG: Carbon Intensity Above GCC Benchmark',
      recommendation: `Carbon intensity at ${latestKPIs.carbon_intensity} kg CO₂/AED 1M revenue — above GCC consumer goods benchmark of 100. DFM ESG disclosure season approaching. Actions: (1) Review cold chain refrigerant efficiency. (2) Assess last-mile delivery fleet electrification plan. (3) Prepare GRI-aligned sustainability report section. Institutional investors (Mubadala, ADIA) increasingly screen on ESG in DFM listings.`,
      confidence: 0.72,
      reasoning: 'ESG risk is a medium-term share price factor as UAE aligns to Net Zero 2050.',
    });
    recommendationsCreated++;
  }

  // Saudization fine risk
  if (gameState.saudization_fine_active && ctx.autonomyLevel >= 2) {
    await createRecommendation(ctx, {
      title: '⚠️ Saudization (Nitaqat) Violation Risk',
      recommendation: `Saudi operations are below the Nitaqat quota for Saudi nationals. Monthly fine will be levied until compliance is restored. Path to compliance: (1) Accelerate Saudi national hiring — target commercial roles, sales representatives, administrative functions. (2) Engage HRDF (Human Resources Development Fund) for co-sponsored training programs. (3) Consider management fee reclassification if operations are truly eligible for lower quota band. Timeline: must resolve within 3 months to avoid escalation to "Red" Nitaqat zone.`,
      confidence: 0.91,
      reasoning: 'Nitaqat violation carries escalating financial penalties and ultimately visa/license suspension for Saudi operations.',
    });
    recommendationsCreated++;
  }

  return {
    agentName: 'priya',
    success: true,
    activitiesCreated,
    recommendationsCreated,
    actionsExecuted: 0,
    costUsd: 0,
  };
}

function computeRiskScore(ctx: AgentRunContext): number {
  const { latestKPIs, gameState, activeEvents } = ctx;
  let score = 20; // baseline

  // Add risk for each negative event
  score += activeEvents.filter((e) => e.sim_market_events.price_impact_pct < 0).length * 8;

  // Cash risk
  if (latestKPIs.cash_balance_aed < 5_000_000) score += 20;
  else if (latestKPIs.cash_balance_aed < 15_000_000) score += 10;

  // Fill rate risk
  if (latestKPIs.fill_rate < 0.70) score += 15;
  else if (latestKPIs.fill_rate < 0.85) score += 7;

  // Regulatory risk
  if (gameState.saudization_fine_active) score += 10;
  if (gameState.dfm_disclosure_pending) score += 8;

  // Market share risk
  if (latestKPIs.market_share_pct < 12) score += 10;

  return Math.min(100, score);
}
