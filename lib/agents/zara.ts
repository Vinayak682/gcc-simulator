/**
 * Zara Al-Mansoori — Chief Marketing Officer
 * Domain: Brand health, consumer sentiment, marketing ROI, GCC cultural calendar
 * Autonomy: Level 2 (Recommend)
 */

import type { AgentRunResult } from '../simulator/types';
import { type AgentRunContext, logObservation, createRecommendation } from './runner';

export async function runZara(ctx: AgentRunContext): Promise<AgentRunResult> {
  const { latestKPIs, previousKPIs, gameState, currentMonth } = ctx;
  let activitiesCreated = 0;
  let recommendationsCreated = 0;

  // Monthly observation
  await logObservation(
    ctx,
    `Month ${currentMonth} Brand & Consumer Health`,
    `Customer satisfaction: ${latestKPIs.customer_satisfaction.toFixed(0)}/100 | NPS: ${latestKPIs.nps} | Market share: ${latestKPIs.market_share_pct.toFixed(1)}%`,
    {
      customer_satisfaction: latestKPIs.customer_satisfaction,
      nps: latestKPIs.nps,
      market_share: latestKPIs.market_share_pct,
    }
  );
  activitiesCreated++;

  // Ramadan marketing window
  if (gameState.ramadan_active && ctx.autonomyLevel >= 2) {
    await createRecommendation(ctx, {
      title: 'Ramadan Marketing Window: Activate Campaign Now',
      recommendation:
        'Ramadan is prime FMCG brand-building season in GCC. Recommend: (1) Launch Ramadan hamper bundle — AED 199 gift set for gifting occasion. (2) Increase social spend 40% on Instagram/TikTok (peak evening engagement after Iftar). (3) Activate loyalty double points. (4) Partner with 3 Iftar tent events in Dubai/Abu Dhabi for sampling. ROI on Ramadan activation typically 3.2× vs. standard media.',
      confidence: 0.88,
      reasoning: 'Ramadan represents highest per-capita FMCG spend in GCC calendar. Missing this window = ceding share to competitors.',
    });
    recommendationsCreated++;
  }

  // Customer satisfaction drop
  if (
    previousKPIs &&
    latestKPIs.customer_satisfaction < previousKPIs.customer_satisfaction - 5 &&
    ctx.autonomyLevel >= 2
  ) {
    await createRecommendation(ctx, {
      title: `Customer Satisfaction Drop: -${(previousKPIs.customer_satisfaction - latestKPIs.customer_satisfaction).toFixed(0)}pts`,
      recommendation: `Customer satisfaction fell from ${previousKPIs.customer_satisfaction.toFixed(0)} to ${latestKPIs.customer_satisfaction.toFixed(0)} this month. Likely driven by fill rate issues or quality complaints. Recommend: (1) Deploy customer listening sprint — 50 interviews in 2 weeks. (2) Activate hyper-targeted retention offers for at-risk customers. (3) Engage top 5 retail partners for shelf-level feedback. (4) Check social listening for brand mentions.`,
      confidence: 0.82,
      reasoning: 'Satisfaction drop of 5+ points in one month signals systemic issue, not noise.',
    });
    recommendationsCreated++;
  }

  // Market share erosion
  if (
    previousKPIs &&
    latestKPIs.market_share_pct < previousKPIs.market_share_pct - 0.5 &&
    ctx.autonomyLevel >= 2
  ) {
    await createRecommendation(ctx, {
      title: `Market Share Loss: -${(previousKPIs.market_share_pct - latestKPIs.market_share_pct).toFixed(1)}pts`,
      recommendation: `Lost ${(previousKPIs.market_share_pct - latestKPIs.market_share_pct).toFixed(1)}pp market share this month. Need to identify whether this is: (a) pricing-driven — competitors undercutting, (b) distribution-driven — competitor gaining facings, (c) trial-driven — new entrant capturing first purchase. Trade promotion response recommended within 2 weeks.`,
      confidence: 0.85,
      reasoning: 'Market share loss >0.5pp in a single month is above normal volatility threshold.',
    });
    recommendationsCreated++;
  }

  return {
    agentName: 'zara',
    success: true,
    activitiesCreated,
    recommendationsCreated,
    actionsExecuted: 0,
    costUsd: 0,
  };
}
