/**
 * Al Manar Industries — GCC Business Simulator
 * 3-Layer Share Price Engine
 *
 * Formula:
 *   price = base × (1 + fundamentals_delta × 0.60)
 *           × (1 + events_shock × 0.25)
 *           × (1 + sentiment_drift × 0.15)
 *
 * Layer 1 — Fundamentals (60%): driven by KPI improvements vs prior month
 * Layer 2 — Market Events (25%): active event shocks (commodity, FX, competitor)
 * Layer 3 — Sentiment (15%): bounded random walk simulating market mood
 *
 * GCC Modifiers are applied as multipliers on top of Layer 1.
 */

import type {
  SimKPISnapshot,
  SimGameState,
  SimActiveEvent,
  SimMarketEvent,
  SharePriceComponents,
  KPIDeltaSet,
  MarketEventSnapshot,
} from './types';

// ─── Constants ────────────────────────────────────────────────────────────────

const WEIGHTS = {
  FUNDAMENTALS: 0.60,
  EVENTS: 0.25,
  SENTIMENT: 0.15,
} as const;

/** KPI weights within the fundamentals score */
const KPI_WEIGHTS = {
  revenueGrowth: 0.30,
  marginDelta: 0.25,
  workingCapital: 0.20,
  fillRate: 0.15,
  marketShare: 0.10,
} as const;

/** Sentiment random walk bounds */
const SENTIMENT_MAX = 0.15;
const SENTIMENT_MIN = -0.15;
const SENTIMENT_VOLATILITY = 0.03; // per month std dev

/** GCC seasonal multipliers on fundamentals score */
const GCC_MULTIPLIERS = {
  ramadan: 1.08,      // DFM often rallies during Ramadan (positive sentiment)
  eid: 1.05,          // Post-Eid bounce
  nationalDay: 1.04,  // UAE/KSA national day = patriotic buying
  summer: 0.96,       // Jul-Aug trading volumes drop, modest drag
  saudizationFine: 0.97, // regulatory overhang discount
  dfmDisclosure: 0.985,  // pending disclosure = uncertainty discount
} as const;

/** Circuit breakers */
const PRICE_FLOOR_AED = 0.10; // DFM delisting threshold
const PRICE_CEILING_MULTIPLIER = 5.0; // max 5× from base (prevent runaway)

// ─── Main Calculator ──────────────────────────────────────────────────────────

export interface SharePriceInput {
  basePrice: number;
  currentKPIs: SimKPISnapshot;
  previousKPIs: SimKPISnapshot | null;
  activeEvents: (SimActiveEvent & { sim_market_events: SimMarketEvent })[];
  gameState: SimGameState;
  previousSentiment: number; // last month's sentiment drift
}

export function calculateSharePrice(input: SharePriceInput): SharePriceComponents {
  const {
    basePrice,
    currentKPIs,
    previousKPIs,
    activeEvents,
    gameState,
    previousSentiment,
  } = input;

  // ── Layer 1: Fundamentals ──────────────────────────────────────────────────
  const kpiDeltas = computeKPIDeltas(currentKPIs, previousKPIs);
  const fundamentalsScore = computeFundamentalsScore(kpiDeltas);
  const gccMultiplier = computeGCCMultiplier(gameState);
  const fundamentalsDelta = ((fundamentalsScore - 50) / 50) * gccMultiplier; // normalize to -1..+1

  // ── Layer 2: Event Shocks ──────────────────────────────────────────────────
  const activeEventSnapshots = activeEvents.map((ae) => ({
    eventId: ae.event_id,
    name: ae.sim_market_events.name,
    priceImpactPct: ae.sim_market_events.price_impact_pct,
    turnsRemaining: ae.expires_month - currentKPIs.month,
  }));

  const eventsShock = activeEventSnapshots.reduce(
    (sum, e) => sum + e.priceImpactPct,
    0
  );
  const eventsShockClamped = clamp(eventsShock, -0.40, 0.40);

  // ── Layer 3: Sentiment ─────────────────────────────────────────────────────
  const sentimentDrift = computeSentimentDrift(previousSentiment, fundamentalsDelta);

  // ── Compose Final Price ────────────────────────────────────────────────────
  const rawPrice =
    basePrice *
    (1 + fundamentalsDelta * WEIGHTS.FUNDAMENTALS) *
    (1 + eventsShockClamped * WEIGHTS.EVENTS) *
    (1 + sentimentDrift * WEIGHTS.SENTIMENT);

  const finalPrice = clamp(
    rawPrice,
    PRICE_FLOOR_AED,
    basePrice * PRICE_CEILING_MULTIPLIER
  );

  return {
    basePrice,
    fundamentalsDelta,
    eventsShock: eventsShockClamped,
    sentimentDrift,
    finalPrice: roundToTick(finalPrice),
    fundamentalsScore,
    activeEvents: activeEventSnapshots,
    kpiDeltas,
  };
}

// ─── KPI Delta Computation ────────────────────────────────────────────────────

function computeKPIDeltas(
  current: SimKPISnapshot,
  previous: SimKPISnapshot | null
): KPIDeltaSet {
  if (!previous) {
    return {
      revenueGrowthMoM: 0,
      marginDelta: 0,
      workingCapitalDelta: 0,
      fillRateDelta: 0,
      marketShareDelta: 0,
    };
  }

  const revenueGrowthMoM =
    previous.revenue_aed > 0
      ? (current.revenue_aed - previous.revenue_aed) / previous.revenue_aed
      : 0;

  const marginDelta = current.ebitda_margin - previous.ebitda_margin;

  // Working capital: lower days = better (flip sign)
  const prevWC = previous.receivable_days + previous.inventory_days - previous.payable_days;
  const currWC = current.receivable_days + current.inventory_days - current.payable_days;
  const workingCapitalDelta = -(currWC - prevWC) / 100; // normalized

  const fillRateDelta = current.fill_rate - previous.fill_rate;
  const marketShareDelta = (current.market_share_pct - previous.market_share_pct) / 100;

  return {
    revenueGrowthMoM: clamp(revenueGrowthMoM, -0.30, 0.30),
    marginDelta: clamp(marginDelta, -0.20, 0.20),
    workingCapitalDelta: clamp(workingCapitalDelta, -0.20, 0.20),
    fillRateDelta: clamp(fillRateDelta, -0.30, 0.30),
    marketShareDelta: clamp(marketShareDelta, -0.10, 0.10),
  };
}

function computeFundamentalsScore(deltas: KPIDeltaSet): number {
  // Each delta is in range [-0.30, +0.30] approximately
  // Normalize to 0-100 score where 50 = no change
  const score =
    50 +
    (deltas.revenueGrowthMoM * KPI_WEIGHTS.revenueGrowth +
      deltas.marginDelta * KPI_WEIGHTS.marginDelta +
      deltas.workingCapitalDelta * KPI_WEIGHTS.workingCapital +
      deltas.fillRateDelta * KPI_WEIGHTS.fillRate +
      deltas.marketShareDelta * KPI_WEIGHTS.marketShare) *
      100;

  return clamp(score, 0, 100);
}

// ─── GCC Modifier ─────────────────────────────────────────────────────────────

function computeGCCMultiplier(gameState: SimGameState): number {
  let multiplier = 1.0;

  if (gameState.ramadan_active) {
    multiplier *= GCC_MULTIPLIERS.ramadan;
    // Extra amplification: Ramadan boosts consumer goods specifically
    multiplier *= gameState.ramadan_demand_multiplier > 1
      ? 1 + (gameState.ramadan_demand_multiplier - 1) * 0.5
      : 1;
  }

  if (gameState.national_day_boost) {
    multiplier *= GCC_MULTIPLIERS.nationalDay;
  }

  if (gameState.summer_active) {
    multiplier *= GCC_MULTIPLIERS.summer;
    // Cold chain companies get extra drag in summer
    multiplier *= GCC_MULTIPLIERS.summer;
  }

  if (gameState.saudization_fine_active) {
    multiplier *= GCC_MULTIPLIERS.saudizationFine;
  }

  if (gameState.dfm_disclosure_pending) {
    multiplier *= GCC_MULTIPLIERS.dfmDisclosure;
  }

  return multiplier;
}

// ─── Sentiment Drift ──────────────────────────────────────────────────────────

/**
 * Bounded random walk for market sentiment.
 * Mean-reverts toward zero when at extremes.
 * Influenced by fundamentals direction (positive momentum reinforces drift).
 */
function computeSentimentDrift(previous: number, fundamentalsDelta: number): number {
  // Random shock component
  const shock = gaussianRandom(0, SENTIMENT_VOLATILITY);

  // Mean-reversion pull toward zero (stronger at extremes)
  const meanReversion = -previous * 0.20;

  // Fundamentals momentum (positive fundamentals = slight positive sentiment)
  const momentumBias = fundamentalsDelta * 0.05;

  const newSentiment = previous + shock + meanReversion + momentumBias;

  return clamp(newSentiment, SENTIMENT_MIN, SENTIMENT_MAX);
}

// ─── Event Impact Application ─────────────────────────────────────────────────

/** Apply event shocks to share price data stored in DB */
export function buildEventShockSummary(
  activeEvents: (SimActiveEvent & { sim_market_events: SimMarketEvent })[]
): { totalShockPct: number; byEvent: MarketEventSnapshot[] } {
  const byEvent: MarketEventSnapshot[] = activeEvents.map((ae) => ({
    eventId: ae.event_id,
    name: ae.sim_market_events.name,
    priceImpactPct: ae.sim_market_events.price_impact_pct,
    turnsRemaining: ae.expires_month - ae.triggered_month,
  }));

  const totalShockPct = byEvent.reduce((sum, e) => sum + e.priceImpactPct, 0);

  return { totalShockPct: clamp(totalShockPct, -0.40, 0.40), byEvent };
}

// ─── Win / Loss Check ─────────────────────────────────────────────────────────

export interface WinLossStatus {
  won: boolean;
  lost: boolean;
  winReason: string | null;
  lossReason: string | null;
}

export function checkWinLoss(params: {
  currentPrice: number;
  winTarget: number;
  lossFloor: number;
  currentMonth: number;
  totalMonths: number;
  currentKPIs: SimKPISnapshot;
  gameMode: string;
}): WinLossStatus {
  const { currentPrice, winTarget, lossFloor, currentMonth, totalMonths, currentKPIs, gameMode } = params;

  // Loss conditions (circuit breakers)
  if (currentPrice <= lossFloor) {
    return {
      won: false,
      lost: true,
      winReason: null,
      lossReason: `Share price collapsed to AED ${currentPrice.toFixed(2)} — below DFM floor of AED ${lossFloor.toFixed(2)}`,
    };
  }

  if (currentKPIs.cash_balance_aed <= 0) {
    return {
      won: false,
      lost: true,
      winReason: null,
      lossReason: 'Company ran out of cash — technical insolvency triggered',
    };
  }

  if (currentKPIs.fill_rate < 0.50 && currentMonth >= 3) {
    return {
      won: false,
      lost: true,
      winReason: null,
      lossReason: `Fill rate collapsed to ${(currentKPIs.fill_rate * 100).toFixed(0)}% — retail boycott triggered`,
    };
  }

  // Win conditions
  if (gameMode === 'turnaround') {
    if (currentPrice >= winTarget && currentKPIs.ebitda_margin >= 0.12) {
      return {
        won: true,
        lost: false,
        winReason: `Turnaround complete! Share price AED ${currentPrice.toFixed(2)} (target AED ${winTarget.toFixed(2)}) with EBITDA margin ${(currentKPIs.ebitda_margin * 100).toFixed(1)}%`,
        lossReason: null,
      };
    }
  }

  if (gameMode === 'growth') {
    if (currentPrice >= winTarget && currentKPIs.market_share_pct >= 22) {
      return {
        won: true,
        lost: false,
        winReason: `Growth target achieved! AED ${currentPrice.toFixed(2)} share price with ${currentKPIs.market_share_pct.toFixed(1)}% market share`,
        lossReason: null,
      };
    }
  }

  if (gameMode === 'expansion') {
    if (currentPrice >= winTarget && currentMonth >= totalMonths) {
      return {
        won: true,
        lost: false,
        winReason: `Expansion mandate fulfilled! Completed ${totalMonths} months at AED ${currentPrice.toFixed(2)}`,
        lossReason: null,
      };
    }
  }

  // End-of-game without hitting win condition
  if (currentMonth >= totalMonths) {
    const didWin = currentPrice >= winTarget;
    return {
      won: didWin,
      lost: !didWin,
      winReason: didWin ? `Game complete — final price AED ${currentPrice.toFixed(2)} exceeded target` : null,
      lossReason: !didWin
        ? `Game over — final price AED ${currentPrice.toFixed(2)} below target AED ${winTarget.toFixed(2)}`
        : null,
    };
  }

  return { won: false, lost: false, winReason: null, lossReason: null };
}

// ─── GCC Calendar ─────────────────────────────────────────────────────────────

/**
 * Returns active GCC modifiers for a given simulation month.
 * Month 1 = January of sim start year (configurable in scenario).
 * We use a fixed Islamic calendar approximation for the sim.
 */
export function getGCCCalendarModifiers(
  month: number,
  startYear: number = 2024
): {
  isRamadan: boolean;
  ramadanDemandMultiplier: number;
  isSummer: boolean;
  summerColdChainMultiplier: number;
  isNationalDay: boolean;
  calendarMonth: number; // 1-12
} {
  // Calculate actual calendar month (1-12) from sim month
  const calendarMonth = ((month - 1) % 12) + 1;

  // Ramadan shifts ~11 days/year. Approximate for 2024-2026:
  // 2024: March-April (months 3-4)
  // 2025: March (month 3)
  // 2026: February-March (months 2-3)
  const simYear = startYear + Math.floor((month - 1) / 12);
  let ramadanMonths: number[] = [];

  if (simYear === 2024) ramadanMonths = [3, 4];
  else if (simYear === 2025) ramadanMonths = [3];
  else if (simYear === 2026) ramadanMonths = [2, 3];
  else ramadanMonths = [3]; // default

  const isRamadan = ramadanMonths.includes(calendarMonth);
  const isSummer = [6, 7, 8].includes(calendarMonth);
  const isNationalDay = calendarMonth === 12; // UAE Dec 2-3 approximated to Dec

  return {
    isRamadan,
    ramadanDemandMultiplier: isRamadan ? 1.35 : 1.0, // 35% demand surge for FMCG
    isSummer,
    summerColdChainMultiplier: isSummer ? 1.18 : 1.0, // 18% extra cold chain cost
    isNationalDay,
    calendarMonth,
  };
}

// ─── Price Formatting ─────────────────────────────────────────────────────────

/** Round to DFM tick size (AED 0.01) */
export function roundToTick(price: number): number {
  return Math.round(price * 100) / 100;
}

/** Format price for display */
export function formatPrice(price: number): string {
  return `AED ${price.toFixed(2)}`;
}

/** Compute price change percentage */
export function priceChangePct(current: number, previous: number): number {
  if (previous === 0) return 0;
  return ((current - previous) / previous) * 100;
}

/** Compute price change direction for UI */
export function priceDirection(current: number, previous: number): 'up' | 'down' | 'flat' {
  const pct = priceChangePct(current, previous);
  if (pct > 0.01) return 'up';
  if (pct < -0.01) return 'down';
  return 'flat';
}

// ─── Utilities ────────────────────────────────────────────────────────────────

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/**
 * Box-Muller transform for Gaussian random numbers.
 * Used for sentiment volatility — more realistic than uniform noise.
 */
function gaussianRandom(mean: number, stdDev: number): number {
  let u = 0;
  let v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  const num = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
  return num * stdDev + mean;
}

// ─── Seeded Random (for deterministic replays) ────────────────────────────────

/**
 * Linear congruential generator for deterministic sentiment in replays.
 * seed = session_id hash + month number
 */
export function seededRandom(seed: number): number {
  const a = 1664525;
  const c = 1013904223;
  const m = Math.pow(2, 32);
  return ((a * seed + c) % m) / m;
}

export function seededGaussian(seed: number, mean: number, stdDev: number): number {
  const u1 = seededRandom(seed);
  const u2 = seededRandom(seed * 7919 + 1);
  const num = Math.sqrt(-2.0 * Math.log(u1 + 0.0001)) * Math.cos(2.0 * Math.PI * u2);
  return num * stdDev + mean;
}

/** Hash a string to a stable number for seeding */
export function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // 32-bit int
  }
  return Math.abs(hash);
}
