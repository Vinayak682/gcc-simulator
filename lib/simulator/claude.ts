/**
 * Al Manar Industries — GCC Business Simulator
 * AI Client — Google Gemini (free tier)
 *
 * Mode A: Streaming advisor (Tariq) — SSE, user-triggered only
 * Mode B: Decision recommendations — JSON output, cached per decision
 * Mode C: S&OP narrative — structured sections per agent
 * Mode D: Expansion board memos — long-form investment memo
 *
 * Models:
 * - Modes A/B/C: gemini-2.0-flash (free, fast)
 * - Mode D:      gemini-1.5-pro   (free, smarter for long-form)
 *
 * Get a free API key at: https://aistudio.google.com
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import type {
  ClaudeContext,
  DecisionOption,
  AgentName,
  SimSOPCycle,
  SimExpansionOpp,
  SimKPISnapshot,
} from './types';

// ─── Client ───────────────────────────────────────────────────────────────────

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY ?? '');

const MODELS = {
  FLASH: 'gemini-2.0-flash',
  PRO: 'gemini-1.5-pro',
} as const;

const MAX_TOKENS = {
  A: 1024,
  B: 2048,
  C: 3072,
  D: 8192,
} as const;

// ─── Mode A: Streaming Advisor (Tariq) ───────────────────────────────────────

export interface TariqStreamInput {
  userQuestion: string;
  context: ClaudeContext;
  conversationHistory: { role: 'user' | 'assistant'; content: string }[];
}

export async function streamTariqAdvisor(
  input: TariqStreamInput
): Promise<ReadableStream<Uint8Array>> {
  const { userQuestion, context, conversationHistory } = input;
  const systemPrompt = buildTariqSystemPrompt(context);
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        const model = genAI.getGenerativeModel({
          model: MODELS.FLASH,
          systemInstruction: systemPrompt,
          generationConfig: { maxOutputTokens: MAX_TOKENS.A },
        });

        // Build Gemini chat history (excludes the latest user message)
        const history = conversationHistory.slice(-10).map((m) => ({
          role: m.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: m.content }],
        }));

        const chat = model.startChat({ history });
        const result = await chat.sendMessageStream(userQuestion);

        for await (const chunk of result.stream) {
          const text = chunk.text();
          if (text) {
            const data = `data: ${JSON.stringify({ text })}\n\n`;
            controller.enqueue(encoder.encode(data));
          }
        }

        controller.enqueue(encoder.encode('data: [DONE]\n\n'));
        controller.close();
      } catch (err) {
        const errorData = `data: ${JSON.stringify({ error: String(err) })}\n\n`;
        controller.enqueue(encoder.encode(errorData));
        controller.close();
      }
    },
  });

  return stream;
}

function buildTariqSystemPrompt(ctx: ClaudeContext): string {
  return `You are Tariq Al-Rashidi, Chief Strategy Officer of Al Manar Industries, a Dubai-listed FMCG company.
You speak to the Managing Director (the player) with direct, pragmatic GCC boardroom language.
No filler. No Western management clichés. Think Dubai World Trade Centre boardroom.

CURRENT SITUATION (Month ${ctx.currentMonth}):
- Share Price: AED ${ctx.kpis.share_price?.toFixed(2) ?? 'N/A'}
- Revenue: AED ${((ctx.kpis.revenue_aed ?? 0) / 1_000_000).toFixed(1)}M
- EBITDA Margin: ${((ctx.kpis.ebitda_margin ?? 0) * 100).toFixed(1)}%
- Market Share: ${(ctx.kpis.market_share_pct ?? 0).toFixed(1)}%
- Fill Rate: ${((ctx.kpis.fill_rate ?? 0) * 100).toFixed(0)}%
- Game Mode: ${ctx.scenario.game_mode} (${ctx.scenario.difficulty})

ACTIVE MARKET CONDITIONS:
${ctx.activeEvents.map((e) => `• ${e.name} (${(e.priceImpactPct * 100 > 0 ? '+' : '') + (e.priceImpactPct * 100).toFixed(1)}% price impact, ${e.turnsRemaining} months remaining)`).join('\n') || '• No active shocks'}

GCC CONTEXT:
${ctx.gameState.ramadan_active ? '• 🌙 RAMADAN ACTIVE — demand surge, shorter hours, employee sensitivities' : ''}
${ctx.gameState.summer_active ? '• ☀️ SUMMER — cold chain costs elevated, regional buying offices slow' : ''}
${ctx.gameState.saudization_fine_active ? '• ⚠️ SAUDIZATION FINE RISK — Nitaqat quota breach' : ''}
${ctx.gameState.dfm_disclosure_pending ? '• 📋 DFM DISCLOSURE PENDING — material event must be filed within deadline' : ''}

Respond in 2-4 sentences maximum unless the MD asks for a detailed analysis.
Be direct. Identify risks the MD might be missing. Never agree by default.
When citing data, use the numbers above — never fabricate.`;
}

// ─── Mode B: Decision Recommendations (JSON) ─────────────────────────────────

export interface DecisionRecInput {
  decisionTitle: string;
  decisionDescription: string;
  options: DecisionOption[];
  context: ClaudeContext;
  agentName: AgentName;
}

export interface DecisionRecOutput {
  recommendedOptionId: string;
  confidence: number;
  reasoning: string;
  keyRisk: string;
  gccNote: string | null;
}

export async function generateDecisionRec(
  input: DecisionRecInput
): Promise<DecisionRecOutput> {
  const { decisionTitle, decisionDescription, options, context, agentName } = input;

  const agentPersonas: Record<AgentName, string> = {
    tariq: 'Chief Strategy Officer — thinks in competitive moats and long-term positioning',
    zara: 'Chief Marketing Officer — thinks in consumer trends, brand equity, GCC cultural nuance',
    omar: 'Head of Supply Chain — thinks in fill rates, supplier risk, lead times',
    nadia: 'CFO — thinks in cash flow, EBITDA, working capital, DFM compliance',
    faris: 'Head of Planning — thinks in demand forecasts, inventory optimization, seasonality',
    leila: 'Commercial Director — thinks in distribution deals, trade terms, channel mix',
    priya: 'Chief Risk Officer — thinks in scenario planning, regulatory exposure, ESG',
    board: 'Board of Directors — thinks in governance, shareholder value, disclosure obligations',
  };

  const optionsSummary = options
    .map(
      (o) =>
        `Option ${o.id}: ${o.label}\n  ${o.description}\n  Risk: ${o.risk_level}\n  Est. share price impact: ${o.projected_kpi_impact.share_price_delta_pct > 0 ? '+' : ''}${(o.projected_kpi_impact.share_price_delta_pct * 100).toFixed(1)}%`
    )
    .join('\n\n');

  const prompt = `You are ${agentName.charAt(0).toUpperCase() + agentName.slice(1)} Al Manar, ${agentPersonas[agentName]}.

DECISION: ${decisionTitle}
${decisionDescription}

CURRENT METRICS (Month ${context.currentMonth}):
- Share Price: AED ${context.kpis.share_price?.toFixed(2)}
- EBITDA Margin: ${((context.kpis.ebitda_margin ?? 0) * 100).toFixed(1)}%
- Cash Balance: AED ${((context.kpis.cash_balance_aed ?? 0) / 1_000_000).toFixed(1)}M
- Fill Rate: ${((context.kpis.fill_rate ?? 0) * 100).toFixed(0)}%

OPTIONS:
${optionsSummary}

Respond ONLY with valid JSON matching this schema (no markdown, no explanation):
{
  "recommendedOptionId": "<A|B|C>",
  "confidence": <0.0-1.0>,
  "reasoning": "<2-3 sentences from your domain perspective>",
  "keyRisk": "<the single biggest risk with your recommendation>",
  "gccNote": "<GCC-specific consideration or null>"
}`;

  try {
    const model = genAI.getGenerativeModel({
      model: MODELS.FLASH,
      generationConfig: {
        maxOutputTokens: MAX_TOKENS.B,
        responseMimeType: 'application/json',
      },
    });

    const result = await model.generateContent(prompt);
    const text = result.response.text();
    return JSON.parse(text.trim()) as DecisionRecOutput;
  } catch {
    return {
      recommendedOptionId: options[0]?.id ?? 'A',
      confidence: 0.5,
      reasoning: 'Analysis incomplete — defaulting to lowest-risk option.',
      keyRisk: 'Insufficient data for full analysis.',
      gccNote: null,
    };
  }
}

// ─── Mode C: S&OP Narrative ───────────────────────────────────────────────────

export interface SOPNarrativeInput {
  sopCycle: Partial<SimSOPCycle>;
  context: ClaudeContext;
  agentName: 'faris' | 'omar' | 'nadia';
}

export interface SOPNarrativeOutput {
  summary: string;
  keyAssumptions: string[];
  risks: string[];
  recommendations: string[];
  gcccSensitivities: string[];
}

export async function generateSOPNarrative(
  input: SOPNarrativeInput
): Promise<SOPNarrativeOutput> {
  const { sopCycle, context, agentName } = input;

  const agentFocus: Record<string, string> = {
    faris: `Focus on demand forecast accuracy, seasonality adjustments, and Ramadan/summer uplift calculations.`,
    omar: `Focus on supply constraints, supplier reliability risks, lead time buffers, and cold chain capacity.`,
    nadia: `Focus on working capital implications, cash flow timing, gross margin impact, and DFM reporting requirements.`,
  };

  const prompt = `You are the ${agentName} agent for Al Manar Industries S&OP review, Month ${context.currentMonth}.

${agentFocus[agentName]}

S&OP DATA:
- Demand Forecast: ${sopCycle.demand_forecast_units?.toLocaleString() ?? 'TBD'} units
- Demand Confidence: ${((sopCycle.demand_confidence ?? 0) * 100).toFixed(0)}%
- Supply Plan: ${sopCycle.supply_plan_units?.toLocaleString() ?? 'TBD'} units
- Revenue Projection: AED ${((sopCycle.revenue_projection_aed ?? 0) / 1_000_000).toFixed(1)}M
- Ramadan Adjustment: ${(sopCycle.ramadan_adjustment ?? 0) > 0 ? '+' : ''}${((sopCycle.ramadan_adjustment ?? 0) * 100).toFixed(0)}%

CONTEXT:
- Current Fill Rate: ${((context.kpis.fill_rate ?? 0) * 100).toFixed(0)}%
- Inventory Days: ${context.kpis.inventory_days?.toFixed(0) ?? 'N/A'}
${context.gameState.ramadan_active ? '- RAMADAN ACTIVE this month' : ''}
${context.gameState.summer_active ? '- SUMMER — demand for cold beverages elevated' : ''}

Respond ONLY with valid JSON (no markdown):
{
  "summary": "<2-3 sentence assessment>",
  "keyAssumptions": ["<assumption 1>", "<assumption 2>", "<assumption 3>"],
  "risks": ["<risk 1>", "<risk 2>"],
  "recommendations": ["<action 1>", "<action 2>"],
  "gcccSensitivities": ["<GCC factor 1>", "<GCC factor 2>"]
}`;

  try {
    const model = genAI.getGenerativeModel({
      model: MODELS.FLASH,
      generationConfig: {
        maxOutputTokens: MAX_TOKENS.C,
        responseMimeType: 'application/json',
      },
    });

    const result = await model.generateContent(prompt);
    return JSON.parse(result.response.text().trim()) as SOPNarrativeOutput;
  } catch {
    return {
      summary: 'S&OP analysis processing — review data inputs.',
      keyAssumptions: ['Baseline demand maintained', 'No supply disruptions', 'FX stable'],
      risks: ['Data confidence low', 'Seasonality not fully modeled'],
      recommendations: ['Increase safety stock', 'Confirm supplier confirmations'],
      gcccSensitivities: ['Ramadan timing may shift demand curve'],
    };
  }
}

// ─── Mode D: Expansion Board Memo ────────────────────────────────────────────

export interface ExpansionMemoInput {
  expansion: SimExpansionOpp;
  currentKPIs: SimKPISnapshot;
  context: ClaudeContext;
}

export interface ExpansionMemoOutput {
  executiveSummary: string;
  marketOpportunity: string;
  financialAnalysis: string;
  riskAssessment: string;
  gccContext: string;
  boardRecommendation: string;
  approvalConditions: string[];
  investmentThesis: string;
}

export async function generateExpansionMemo(
  input: ExpansionMemoInput
): Promise<ExpansionMemoOutput> {
  const { expansion, currentKPIs, context } = input;

  const prompt = `You are the Board of Directors of Al Manar Industries, a Dubai-listed FMCG company at AED ${currentKPIs.share_price?.toFixed(2)} per share.

Prepare a formal investment committee memo. Write at the level of a McKinsey partner presenting to a GCC sovereign fund board.

EXPANSION OPPORTUNITY: ${expansion.name}
Country: ${expansion.country} ${expansion.city ? `(${expansion.city})` : ''}
Description: ${expansion.description}
Required Investment: AED ${(expansion.investment_aed / 1_000_000).toFixed(1)}M
Expected Payback: ${expansion.payback_months} months
Monthly Revenue Upside: AED ${(expansion.revenue_upside_aed / 1_000_000).toFixed(2)}M
Risk Level: ${expansion.risk_level.toUpperCase()}
GCC Context: ${expansion.gcc_context}

COMPANY STATE (Month ${context.currentMonth}):
- Revenue (annualized): AED ${((currentKPIs.revenue_aed * 12) / 1_000_000).toFixed(0)}M
- EBITDA Margin: ${(currentKPIs.ebitda_margin * 100).toFixed(1)}%
- Cash Balance: AED ${(currentKPIs.cash_balance_aed / 1_000_000).toFixed(1)}M
- Market Share (UAE): ${currentKPIs.market_share_pct.toFixed(1)}%
- Fill Rate: ${(currentKPIs.fill_rate * 100).toFixed(0)}%

Be specific with numbers. Cite GCC market dynamics. Identify UAE boardroom risks (FX, regulatory, Emiratization/Saudization, geopolitical, supply chain).

Respond ONLY with valid JSON (no markdown):
{
  "executiveSummary": "<3-4 sentence overview>",
  "marketOpportunity": "<market sizing, competitive landscape, strategic fit>",
  "financialAnalysis": "<IRR estimate, payback analysis, cash flow timing, sensitivity>",
  "riskAssessment": "<top 3 risks with mitigation strategies>",
  "gccContext": "<regional dynamics specific to this market entry>",
  "boardRecommendation": "<APPROVE / CONDITIONAL APPROVE / DECLINE with rationale>",
  "approvalConditions": ["<condition 1>", "<condition 2>", "<condition 3>"],
  "investmentThesis": "<the one-paragraph bull case for approval>"
}`;

  try {
    const model = genAI.getGenerativeModel({
      model: MODELS.PRO,
      generationConfig: {
        maxOutputTokens: MAX_TOKENS.D,
        responseMimeType: 'application/json',
      },
    });

    const result = await model.generateContent(prompt);
    return JSON.parse(result.response.text().trim()) as ExpansionMemoOutput;
  } catch {
    return {
      executiveSummary: 'Board analysis in progress. Please retry.',
      marketOpportunity: 'Market analysis pending.',
      financialAnalysis: 'Financial modeling required.',
      riskAssessment: 'Risk assessment incomplete.',
      gccContext: expansion.gcc_context,
      boardRecommendation: 'CONDITIONAL APPROVE — pending full analysis',
      approvalConditions: ['Complete due diligence', 'Confirm funding availability', 'Legal review'],
      investmentThesis: 'Strategic expansion consistent with growth mandate.',
    };
  }
}

// ─── Usage Tracking ───────────────────────────────────────────────────────────

export function estimateCost(_mode: 'A' | 'B' | 'C' | 'D', _i: number, _o: number): number {
  return 0; // Gemini free tier — no cost tracking needed
}

export function usdToCredits(costUsd: number): number {
  return Math.ceil(costUsd * 1000);
}
