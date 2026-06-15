/**
 * Board of Directors — Al Manar Industries
 * Domain: Corporate governance, shareholder value, material decisions, DFM compliance
 * Autonomy: Level 1 (Inform) — board cannot act, only advise and flag
 *
 * The Board fires at month-end and reviews the aggregate of all decisions.
 * At Months 3, 6, 9, 12 it delivers a quarterly governance review.
 * It's the last agent to run — it sees all other agent outputs.
 */

import type { AgentRunResult } from '../simulator/types';
import { type AgentRunContext, logObservation, createRecommendation } from './runner';

export async function runBoard(ctx: AgentRunContext): Promise<AgentRunResult> {
  const { latestKPIs, previousKPIs, gameState, currentMonth, session } = ctx;
  let activitiesCreated = 0;
  let recommendationsCreated = 0;

  const isQuarterlyReview = currentMonth % 3 === 0;

  // Monthly governance note
  await logObservation(
    ctx,
    `Board: Month ${currentMonth} Governance Note`,
    `Share price: AED ${latestKPIs.share_price?.toFixed(2)} | ${gameState.dfm_disclosure_pending ? '⚠️ DISCLOSURE PENDING' : '✓ Disclosures current'} | ${latestKPIs.ebitda_margin >= 0.08 ? '✓ EBITDA above covenant' : '⚠️ EBITDA covenant at risk'}`,
    {
      share_price: latestKPIs.share_price,
      disclosure_pending: gameState.dfm_disclosure_pending,
      ebitda_margin: latestKPIs.ebitda_margin,
    }
  );
  activitiesCreated++;

  // Quarterly Board Review
  if (isQuarterlyReview) {
    const quarterNumber = Math.floor(currentMonth / 3);
    const priceVsStart = previousKPIs
      ? ((latestKPIs.share_price - (session.session_metadata?.initial_share_price as number ?? latestKPIs.share_price)) /
          (session.session_metadata?.initial_share_price as number ?? latestKPIs.share_price)) *
        100
      : 0;

    await logObservation(
      ctx,
      `Q${quarterNumber} Board Review — Management Performance Assessment`,
      `Price performance: ${priceVsStart > 0 ? '+' : ''}${priceVsStart.toFixed(1)}% vs. start. EBITDA: ${(latestKPIs.ebitda_margin * 100).toFixed(1)}%. Market share: ${latestKPIs.market_share_pct.toFixed(1)}%. Key decisions this quarter: ${Math.floor(currentMonth * 2)} total.`,
      {
        quarter: quarterNumber,
        price_performance_pct: priceVsStart,
        ebitda_margin: latestKPIs.ebitda_margin,
      }
    );
    activitiesCreated++;

    if (ctx.autonomyLevel >= 2) {
      const boardVerdict =
        latestKPIs.ebitda_margin >= 0.10 && latestKPIs.share_price > (latestKPIs.share_price * 0.95)
          ? 'SATISFACTORY — Management on track'
          : latestKPIs.ebitda_margin >= 0.05
          ? 'REQUIRES ATTENTION — Some KPIs below target'
          : 'UNSATISFACTORY — Urgent course correction required';

      await createRecommendation(ctx, {
        title: `Q${quarterNumber} Board Assessment: ${boardVerdict.split('—')[0].trim()}`,
        recommendation: `Board quarterly assessment: ${boardVerdict}. \n\nKey concerns this quarter:\n${latestKPIs.ebitda_margin < 0.08 ? '• EBITDA margin below 8% covenant threshold\n' : ''}${latestKPIs.fill_rate < 0.85 ? '• Fill rate below board-mandated 85% target\n' : ''}${gameState.dfm_disclosure_pending ? '• DFM disclosure obligation outstanding\n' : ''}${latestKPIs.market_share_pct < 15 ? '• Market share below competitive floor\n' : ''}\n\nBoard resolution: Management to present recovery plan within 14 days if any red flags persist.`,
        confidence: 0.90,
        reasoning: `Quarterly board review at Month ${currentMonth}. All agent reports reviewed.`,
      });
      recommendationsCreated++;
    }
  }

  // Immediate board escalation: catastrophic share price drop
  if (
    previousKPIs &&
    latestKPIs.share_price < previousKPIs.share_price * 0.85 &&
    ctx.autonomyLevel >= 2
  ) {
    await createRecommendation(ctx, {
      title: '🚨 Board Emergency: Share Price -15% in One Month',
      recommendation: `Share price collapsed from AED ${previousKPIs.share_price.toFixed(2)} to AED ${latestKPIs.share_price.toFixed(2)} (-${(((previousKPIs.share_price - latestKPIs.share_price) / previousKPIs.share_price) * 100).toFixed(1)}%). Board requires immediate management briefing. Per DFM Listing Rules, a price movement >10% in a single session triggers mandatory company statement. Recommend: (1) Convene emergency board call. (2) Issue market guidance update via DFM Connect. (3) Activate investor relations communication to prevent panic selling. (4) Review if any insider trading suspicion — ensure trading windows closed for all directors.`,
      confidence: 0.97,
      reasoning: '>15% single-month price drop triggers board escalation protocol under DFM Listing Rules.',
    });
    recommendationsCreated++;
  }

  return {
    agentName: 'board',
    success: true,
    activitiesCreated,
    recommendationsCreated,
    actionsExecuted: 0,
    costUsd: 0,
  };
}
