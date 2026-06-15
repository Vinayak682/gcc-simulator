/**
 * Nadia Khalil — Chief Financial Officer
 * Domain: P&L, cash flow, working capital, DFM compliance, debt covenants
 * Autonomy: Level 2 (Recommend) — finance actions require MD approval
 *
 * Nadia is the most data-driven agent. Pure rule-based, no LLM.
 * She monitors the 3 most common ways FMCG companies run into trouble:
 * 1. Working capital trap (slow receivables + fast payables)
 * 2. Margin compression (COGS creep + price war)
 * 3. DFM compliance violations (GCC-specific)
 */

import type { AgentRunResult } from '../simulator/types';
import {
  type AgentRunContext,
  logObservation,
  createRecommendation,
} from './runner';

export async function runNadia(ctx: AgentRunContext): Promise<AgentRunResult> {
  const { latestKPIs, previousKPIs, gameState, currentMonth } = ctx;

  let activitiesCreated = 0;
  let recommendationsCreated = 0;

  // ── Monthly P&L Observation ───────────────────────────────────────────────

  const cashDeltaM = previousKPIs
    ? (latestKPIs.cash_balance_aed - previousKPIs.cash_balance_aed) / 1_000_000
    : 0;
  const cashDirection = cashDeltaM >= 0 ? '+' : '';

  await logObservation(
    ctx,
    `Month ${currentMonth} Financial Review`,
    `Revenue: AED ${(latestKPIs.revenue_aed / 1_000_000).toFixed(1)}M | EBITDA: ${(latestKPIs.ebitda_margin * 100).toFixed(1)}% | Gross Margin: ${(latestKPIs.gross_margin * 100).toFixed(1)}% | Cash: AED ${(latestKPIs.cash_balance_aed / 1_000_000).toFixed(1)}M (${cashDirection}${cashDeltaM.toFixed(1)}M MoM)`,
    {
      revenue_aed: latestKPIs.revenue_aed,
      ebitda_margin: latestKPIs.ebitda_margin,
      gross_margin: latestKPIs.gross_margin,
      cash_balance_aed: latestKPIs.cash_balance_aed,
      cash_delta_aed: cashDeltaM * 1_000_000,
    }
  );
  activitiesCreated++;

  // ── Working Capital Analysis ──────────────────────────────────────────────

  const cashConversionCycle =
    latestKPIs.receivable_days + latestKPIs.inventory_days - latestKPIs.payable_days;
  const prevCCC = previousKPIs
    ? previousKPIs.receivable_days + previousKPIs.inventory_days - previousKPIs.payable_days
    : cashConversionCycle;
  const cccWorsening = cashConversionCycle > prevCCC + 5;

  await logObservation(
    ctx,
    'Working Capital Analysis',
    `CCC: ${cashConversionCycle.toFixed(0)} days (Receivables: ${latestKPIs.receivable_days.toFixed(0)} | Inventory: ${latestKPIs.inventory_days.toFixed(0)} | Payables: ${latestKPIs.payable_days.toFixed(0)})`,
    {
      ccc: cashConversionCycle,
      receivable_days: latestKPIs.receivable_days,
      inventory_days: latestKPIs.inventory_days,
      payable_days: latestKPIs.payable_days,
    }
  );
  activitiesCreated++;

  // ── DFM Compliance Check (GCC-specific) ──────────────────────────────────

  if (gameState.dfm_disclosure_pending) {
    await logObservation(
      ctx,
      '⚠️ DFM Disclosure Deadline Approaching',
      `Material event pending disclosure to Dubai Financial Market. Failure to disclose within statutory deadline triggers AED 50,000 fine and potential trading suspension. Disclosure package must include: board resolution, material event description, financial impact quantification.`,
      { dfm_disclosure_pending: true, vat_rate: gameState.vat_rate }
    );
    activitiesCreated++;

    if (ctx.autonomyLevel >= 2) {
      await createRecommendation(ctx, {
        title: 'URGENT: DFM Disclosure Filing Required',
        recommendation: `Mandatory DFM disclosure is overdue or imminent. Prepare and file immediately: (1) Draft material event notice (SCA Form MD-01). (2) Translate to Arabic. (3) Submit via DFM Connect. (4) Issue English investor update simultaneously. Non-compliance = AED 50K fine + suspension risk + reputational damage with institutional investors.`,
        confidence: 0.99,
        reasoning: 'DFM disclosure pending flag active. Legal obligation under UAE Securities Law Article 65.',
      });
      recommendationsCreated++;
    }
  }

  // ── Cash Flow Warning ─────────────────────────────────────────────────────

  const monthsRunway =
    latestKPIs.cash_balance_aed > 0 && latestKPIs.net_profit_aed < 0
      ? latestKPIs.cash_balance_aed / Math.abs(latestKPIs.net_profit_aed)
      : 999;

  if (monthsRunway < 6 && ctx.autonomyLevel >= 2) {
    await createRecommendation(ctx, {
      title: `Cash Runway: ${monthsRunway.toFixed(1)} Months at Current Burn`,
      recommendation: `At current P&L trajectory, cash reserves will be exhausted in ${monthsRunway.toFixed(1)} months. Priority actions: (1) Accelerate receivables collection — negotiate early payment discounts with top 3 customers. (2) Delay non-essential capex. (3) Extend supplier payment terms by 15-30 days. (4) Evaluate revolving credit facility utilization. (5) Consider factoring for A/R if below investment grade.`,
      confidence: 0.90,
      reasoning: `Net cash burn rate of AED ${(Math.abs(latestKPIs.net_profit_aed) / 1_000_000).toFixed(1)}M/month vs AED ${(latestKPIs.cash_balance_aed / 1_000_000).toFixed(1)}M balance.`,
    });
    recommendationsCreated++;
  }

  // ── Margin Compression Warning ────────────────────────────────────────────

  if (previousKPIs) {
    const grossMarginDrop = previousKPIs.gross_margin - latestKPIs.gross_margin;
    if (grossMarginDrop > 0.02 && ctx.autonomyLevel >= 2) {
      await createRecommendation(ctx, {
        title: `Gross Margin Compression: -${(grossMarginDrop * 100).toFixed(1)}pp MoM`,
        recommendation: `Gross margin fell from ${(previousKPIs.gross_margin * 100).toFixed(1)}% to ${(latestKPIs.gross_margin * 100).toFixed(1)}% this month. Root cause analysis needed: (1) COGS increase — commodity input prices up? (2) Price mix — shift to lower-margin SKUs? (3) Promotional depth — trade spend above plan? (4) Wastage/shrinkage — cold chain breach? Recovery plan must be presented to board if below ${(0.35 * 100).toFixed(0)}%.`,
        confidence: 0.88,
        reasoning: `Gross margin compression of ${(grossMarginDrop * 100).toFixed(1)}pp in one month is material and requires management attention.`,
      });
      recommendationsCreated++;
    }
  }

  // ── VAT Rate Reminder (KSA vs UAE) ───────────────────────────────────────

  if (gameState.vat_rate === 0.15 && currentMonth === 1) {
    await logObservation(
      ctx,
      'KSA VAT Rate: 15%',
      'Operating under Saudi Arabia 15% VAT regime. UAE operations on 5% VAT. Ensure invoicing systems and ERP are configured correctly for cross-border transactions.',
      { vat_rate: gameState.vat_rate }
    );
    activitiesCreated++;
  }

  // ── Working Capital Deterioration ─────────────────────────────────────────

  if (cccWorsening && ctx.autonomyLevel >= 2) {
    await createRecommendation(ctx, {
      title: `Working Capital Deteriorating: CCC +${(cashConversionCycle - prevCCC).toFixed(0)} days`,
      recommendation: `Cash Conversion Cycle worsened by ${(cashConversionCycle - prevCCC).toFixed(0)} days this month to ${cashConversionCycle.toFixed(0)} days. Biggest contributor: ${latestKPIs.receivable_days > prevCCC / 3 ? 'slow receivables' : latestKPIs.inventory_days > prevCCC / 3 ? 'inventory build' : 'payable compression'}. Recommend supply chain finance program with top suppliers to extend DPO without damaging relationships.`,
      confidence: 0.80,
      reasoning: `CCC increased by more than 5 days in a single month — indicates structural working capital problem forming.`,
    });
    recommendationsCreated++;
  }

  return {
    agentName: 'nadia',
    success: true,
    activitiesCreated,
    recommendationsCreated,
    actionsExecuted: 0,
    costUsd: 0,
  };
}
