/**
 * Faris Al-Zahrani — Head of Planning (S&OP)
 * Domain: Demand forecasting, S&OP cycle, seasonality, inventory planning
 * Autonomy: Level 2 (Recommend), Level 3 for S&OP parameter auto-adjustments
 */

import type { AgentRunResult } from '../simulator/types';
import {
  type AgentRunContext,
  logObservation,
  createRecommendation,
  executeAction,
} from './runner';
import { createSupabaseAdmin } from '../simulator/supabase';

export async function runFaris(ctx: AgentRunContext): Promise<AgentRunResult> {
  const { latestKPIs, gameState, currentMonth, sessionId } = ctx;
  let activitiesCreated = 0;
  let recommendationsCreated = 0;
  let actionsExecuted = 0;

  const admin = createSupabaseAdmin();

  // Check if S&OP cycle exists for this month
  const { data: sopCycle } = await admin
    .from('sim_sop_cycles')
    .select('*')
    .eq('session_id', sessionId)
    .eq('month', currentMonth)
    .single();

  // Monthly observation
  await logObservation(
    ctx,
    `S&OP Planning — Month ${currentMonth}`,
    `Status: ${sopCycle?.status ?? 'not started'} | Demand confidence: ${((sopCycle?.demand_confidence ?? 0.7) * 100).toFixed(0)}% | Fill rate: ${(latestKPIs.fill_rate * 100).toFixed(0)}%`,
    {
      sop_status: sopCycle?.status ?? 'not_started',
      demand_forecast: sopCycle?.demand_forecast_units ?? 0,
      supply_plan: sopCycle?.supply_plan_units ?? 0,
    }
  );
  activitiesCreated++;

  // Ramadan demand uplift
  if (gameState.ramadan_active && ctx.autonomyLevel >= 2) {
    const upliftPct = ((gameState.ramadan_demand_multiplier - 1) * 100).toFixed(0);
    await createRecommendation(ctx, {
      title: `Ramadan Demand Plan: +${upliftPct}% Uplift Required`,
      recommendation: `Ramadan seasonal uplift is ${upliftPct}% for core FMCG categories. Demand plan must be revised upward from baseline. Category breakdown: Dates/sweets +60%, Beverages +45%, Personal care +25%, Dairy +35%. Submit revised demand plan to Omar (Supply) for PO adjustment. Lead time is 6-8 weeks so advance ordering is critical.`,
      confidence: 0.91,
      reasoning: 'Ramadan uplift is well-documented historical pattern in GCC. Plan must pre-position stock.',
    });
    recommendationsCreated++;
  }

  // S&OP cycle not started by mid-month
  if (!sopCycle && currentMonth > 1 && ctx.autonomyLevel >= 2) {
    await createRecommendation(ctx, {
      title: 'S&OP Cycle Not Initiated',
      recommendation: `Month ${currentMonth} S&OP cycle has not been started. Recommend initiating the demand planning review now. Go to the S&OP Cycle module to begin the demand-supply balancing process. Delay risks misaligned inventory positions for next month.`,
      confidence: 0.95,
      reasoning: 'S&OP cycle is fundamental to operational alignment. Missing it creates downstream inventory and cash flow risk.',
    });
    recommendationsCreated++;
  }

  // Auto-adjust safety stock in summer (Level 3)
  if (gameState.summer_active && ctx.autonomyLevel >= 3) {
    await executeAction(ctx, {
      actionType: 'adjust_safety_stock_summer',
      description: 'Auto-increased safety stock parameters for cold-chain SKUs by 15% to account for summer demand volatility and logistics disruption risk. Applied to temperature-sensitive categories only.',
      costAed: 0,
      kpiImpact: { fill_rate_delta: 0.03, inventory_days: 5 },
    });
    actionsExecuted++;
  }

  return {
    agentName: 'faris',
    success: true,
    activitiesCreated,
    recommendationsCreated,
    actionsExecuted,
    costUsd: 0,
  };
}
