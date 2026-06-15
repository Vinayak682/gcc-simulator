/**
 * Leila Hamdan — Commercial Director
 * Domain: Distribution, trade terms, key accounts, channel mix, pricing
 * Autonomy: Level 2 (Recommend), Level 3 for auto-renegotiating payment terms
 */

import type { AgentRunResult } from '../simulator/types';
import { type AgentRunContext, logObservation, createRecommendation, executeAction } from './runner';

export async function runLeila(ctx: AgentRunContext): Promise<AgentRunResult> {
  const { latestKPIs, previousKPIs, gameState, currentMonth } = ctx;
  let activitiesCreated = 0;
  let recommendationsCreated = 0;
  let actionsExecuted = 0;

  await logObservation(
    ctx,
    `Commercial Review — Month ${currentMonth}`,
    `Avg selling price: AED ${latestKPIs.avg_selling_price_aed?.toFixed(2) ?? 'N/A'} | Units sold: ${(latestKPIs.units_sold ?? 0).toLocaleString()} | Receivable days: ${latestKPIs.receivable_days.toFixed(0)}`,
    {
      avg_selling_price: latestKPIs.avg_selling_price_aed,
      units_sold: latestKPIs.units_sold,
      receivable_days: latestKPIs.receivable_days,
    }
  );
  activitiesCreated++;

  // Receivable days warning
  if (latestKPIs.receivable_days > 60 && ctx.autonomyLevel >= 2) {
    await createRecommendation(ctx, {
      title: `Receivables Slow: ${latestKPIs.receivable_days.toFixed(0)} Days`,
      recommendation: `Trade receivables at ${latestKPIs.receivable_days.toFixed(0)} days vs 45-day target. Key accounts stretching terms. Actions: (1) Issue 7-day overdue notices to accounts >75 days outstanding. (2) Offer 2% early payment discount to top 10 accounts (ROI positive vs financing cost). (3) Consider dynamic discounting platform. (4) Review credit limits for slow payers — reduce next cycle.`,
      confidence: 0.87,
      reasoning: 'Receivable days >60 indicates accounts are leveraging trade credit at our expense.',
    });
    recommendationsCreated++;

    // Level 3: Auto-enforce early payment discount
    if (ctx.autonomyLevel >= 3 && latestKPIs.receivable_days > 75) {
      await executeAction(ctx, {
        actionType: 'activate_early_payment_discount',
        description: 'Activated 1.5/10 net 45 early payment discount program for all accounts. Expected to reduce receivable days by 8-12 days within 2 months.',
        costAed: latestKPIs.revenue_aed * 0.005, // 0.5% revenue cost
        kpiImpact: { receivable_days: -10, cash_impact_aed: latestKPIs.revenue_aed * 0.005 },
      });
      actionsExecuted++;
    }
  }

  // Ramadan: peak season commercial push
  if (gameState.ramadan_active && ctx.autonomyLevel >= 2) {
    await createRecommendation(ctx, {
      title: 'Ramadan Trade Execution: Shelf Space & Promotions',
      recommendation: `Ramadan is peak for impulse categories. Action list: (1) Confirm secondary placement (end-caps, gondola ends) with all hypermarket accounts — 3-4× normal visibility. (2) Activate bundle promotions (Buy 2 Get 1) for gift occasions. (3) HoReCa: negotiate Iftar set menu placement with 5 star hotels. (4) Ensure payment terms are NOT extended for Ramadan incremental orders — cash cycle already pressured by stock build.`,
      confidence: 0.89,
      reasoning: 'Ramadan execution in-store is as important as above-the-line. GCC retailers expect proactive trade support.',
    });
    recommendationsCreated++;
  }

  return {
    agentName: 'leila',
    success: true,
    activitiesCreated,
    recommendationsCreated,
    actionsExecuted,
    costUsd: 0,
  };
}
