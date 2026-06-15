/**
 * Omar Al-Habtoor — Head of Supply Chain
 * Domain: Inventory, suppliers, fill rate, cold chain, procurement
 * Autonomy: Level 2 (Recommend) by default, Level 3 (Act) for emergency reorders
 *
 * Omar is the most operationally critical agent. He fires daily checks
 * and can autonomously trigger emergency purchase orders at Level 3.
 */

import type { AgentRunResult } from '../simulator/types';
import {
  type AgentRunContext,
  logObservation,
  createRecommendation,
  executeAction,
  checkKPIThresholds,
} from './runner';
import { createSupabaseAdmin } from '../simulator/supabase';

export async function runOmar(ctx: AgentRunContext): Promise<AgentRunResult> {
  const { latestKPIs, previousKPIs, gameState, currentMonth, sessionId } = ctx;

  let activitiesCreated = 0;
  let recommendationsCreated = 0;
  let actionsExecuted = 0;

  const admin = createSupabaseAdmin();

  // ── Load supply chain data ────────────────────────────────────────────────

  const { data: inventoryRows } = await admin
    .from('sim_inventory')
    .select('*, sim_skus(*)')
    .eq('session_id', sessionId)
    .eq('month', currentMonth)
    .order('days_of_cover', { ascending: true });

  const { data: inTransitPOs } = await admin
    .from('sim_purchase_orders')
    .select('*')
    .eq('session_id', sessionId)
    .in('status', ['confirmed', 'in_transit']);

  const lowCoverSKUs = (inventoryRows ?? []).filter(
    (r: any) => r.days_of_cover < 14 && r.closing_qty > 0
  );
  const stockoutSKUs = (inventoryRows ?? []).filter((r: any) => r.stockout_occurred);
  const highInventorySKUs = (inventoryRows ?? []).filter(
    (r: any) => r.days_of_cover > 90
  );

  // ── Observations ──────────────────────────────────────────────────────────

  await logObservation(
    ctx,
    `Supply Chain Status — Month ${currentMonth}`,
    `Fill rate: ${(latestKPIs.fill_rate * 100).toFixed(0)}% | Inventory: ${latestKPIs.inventory_days.toFixed(0)} days | ${stockoutSKUs.length} stockouts | ${lowCoverSKUs.length} SKUs critical`,
    {
      fill_rate: latestKPIs.fill_rate,
      inventory_days: latestKPIs.inventory_days,
      stockout_count: stockoutSKUs.length,
      in_transit_pos: (inTransitPOs ?? []).length,
      low_cover_sku_count: lowCoverSKUs.length,
    }
  );
  activitiesCreated++;

  // Summer cold chain alert
  if (gameState.summer_active) {
    await logObservation(
      ctx,
      'Summer Cold Chain Advisory',
      `Summer season active — cold chain operating costs elevated 15-20%. Monitor temperature-sensitive SKU integrity. Pre-position refrigerated stock in Abu Dhabi hub before peak July heat.`,
      { summer_multiplier: gameState.summer_cold_chain_cost_multiplier }
    );
    activitiesCreated++;
  }

  // Ramadan stock advisory
  if (gameState.ramadan_active) {
    await logObservation(
      ctx,
      'Ramadan Stock Surge Alert',
      `Ramadan demand multiplier active (${(gameState.ramadan_demand_multiplier * 100 - 100).toFixed(0)}% uplift). Verify safety stock levels for high-velocity Ramadan categories. Shelf-life perishables need faster rotation.`,
      { demand_multiplier: gameState.ramadan_demand_multiplier }
    );
    activitiesCreated++;
  }

  // ── Recommendations / Actions ─────────────────────────────────────────────

  // CRITICAL: Fill rate collapse
  if (latestKPIs.fill_rate < 0.75 && ctx.autonomyLevel >= 2) {
    const severity = latestKPIs.fill_rate < 0.65 ? 'CRITICAL' : 'WARNING';

    await createRecommendation(ctx, {
      title: `${severity}: Fill Rate at ${(latestKPIs.fill_rate * 100).toFixed(0)}%`,
      recommendation: `Fill rate below 75% risks retailer delisting and shelf space loss. ${stockoutSKUs.length} SKUs currently stocked out. Recommend: (1) Emergency air freight for top-20 SKUs by revenue. (2) Activate secondary suppliers. (3) Allocate limited stock to highest-margin accounts first. (4) Initiate customer communication protocol.`,
      confidence: 0.92,
      reasoning: `Fill rate ${(latestKPIs.fill_rate * 100).toFixed(0)}% is below the 75% threshold. ${stockoutSKUs.length} stockout(s) detected this month.`,
    });
    recommendationsCreated++;

    // Level 3: Emergency reorder
    if (ctx.autonomyLevel >= 3 && stockoutSKUs.length > 0) {
      const emergencyCost = stockoutSKUs.length * 250_000; // AED per SKU emergency order
      await executeAction(ctx, {
        actionType: 'emergency_reorder',
        description: `Automatically initiated emergency reorder for ${stockoutSKUs.length} stockout SKU(s). Air freight option selected. Estimated cost: AED ${(emergencyCost / 1_000_000).toFixed(1)}M.`,
        costAed: emergencyCost,
        kpiImpact: {
          fill_rate_delta: 0.08,
          cash_impact_aed: emergencyCost,
          margin_delta: -0.005,
        },
      });
      actionsExecuted++;
    }
  }

  // High inventory warning
  if (latestKPIs.inventory_days > 75 && ctx.autonomyLevel >= 2) {
    const excessValueM = ((latestKPIs.inventory_days - 45) / 45) * latestKPIs.inventory_value_aed / 1_000_000;
    await createRecommendation(ctx, {
      title: `Inventory Overstock: ${latestKPIs.inventory_days.toFixed(0)} Days Cover`,
      recommendation: `Carrying ${latestKPIs.inventory_days.toFixed(0)} days of inventory vs. 45-day target. Estimated excess: AED ${excessValueM.toFixed(1)}M tied up in working capital. Recommend: (1) Pause non-critical POs for 4-6 weeks. (2) Negotiate extended payment terms with suppliers. (3) Identify near-expiry stock for promotional clearance. (4) Review safety stock parameters — may be over-set.`,
      confidence: 0.85,
      reasoning: `Inventory days ${latestKPIs.inventory_days.toFixed(0)} exceeds 75-day threshold, impacting cash conversion cycle.`,
    });
    recommendationsCreated++;

    // Level 3: Auto-pause POs
    if (ctx.autonomyLevel >= 3 && latestKPIs.inventory_days > 90) {
      await executeAction(ctx, {
        actionType: 'pause_non_critical_pos',
        description: 'Automatically paused non-critical purchase orders to reduce inventory build-up. Critical SKUs and Ramadan lines excluded.',
        costAed: 0,
        kpiImpact: {
          inventory_days: -10,
          working_capital_delta: -0.05,
        },
      });
      actionsExecuted++;
    }
  }

  return {
    agentName: 'omar',
    success: true,
    activitiesCreated,
    recommendationsCreated,
    actionsExecuted,
    costUsd: 0, // Omar is fully rule-based
  };
}
