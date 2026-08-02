/**
 * Tests for the 3-layer share price engine.
 *
 * This is the scoring core of the simulator: it decides whether a player wins,
 * and it feeds the leaderboard. So the tests care about two things above all —
 * that the GCC modifiers are applied exactly once each, and that a player cannot
 * reach a win by any path that skips the mode's stated requirement.
 *
 * Pure functions throughout: no Supabase, no network, no API key.
 */

import { describe, expect, it } from 'vitest';
import {
  buildEventShockSummary,
  calculateSharePrice,
  checkWinLoss,
  getGCCCalendarModifiers,
  hashString,
  priceChangePct,
  priceDirection,
  roundToTick,
  seededGaussian,
  seededRandom,
  type SharePriceInput,
} from './sharePrice';
import type { SimGameState, SimKPISnapshot } from './types';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function kpis(over: Partial<SimKPISnapshot> = {}): SimKPISnapshot {
  return {
    month: 6,
    revenue_aed: 10_000_000,
    ebitda_margin: 0.10,
    receivable_days: 60,
    inventory_days: 90,
    payable_days: 45,
    fill_rate: 0.92,
    market_share_pct: 18,
    cash_balance_aed: 5_000_000,
    ...over,
  } as SimKPISnapshot;
}

function gameState(over: Partial<SimGameState> = {}): SimGameState {
  return {
    ramadan_active: false,
    ramadan_demand_multiplier: 1,
    national_day_boost: false,
    summer_active: false,
    saudization_fine_active: false,
    dfm_disclosure_pending: false,
    ...over,
  } as SimGameState;
}

function input(over: Partial<SharePriceInput> = {}): SharePriceInput {
  return {
    basePrice: 4.0,
    currentKPIs: kpis(),
    previousKPIs: null,
    activeEvents: [],
    gameState: gameState(),
    previousSentiment: 0,
    ...over,
  };
}

/** A flat month: no KPI change, no events, no modifiers, no sentiment. */
function flatInput(over: Partial<SharePriceInput> = {}): SharePriceInput {
  const previous = kpis({ month: 5 });
  return input({ currentKPIs: kpis({ month: 6 }), previousKPIs: previous, ...over });
}

// ─── Composition ──────────────────────────────────────────────────────────────

describe('calculateSharePrice', () => {
  it('holds price near base when nothing changed month over month', () => {
    const out = calculateSharePrice(flatInput());
    // Only sentiment (a bounded random walk) can move it, weighted at 15%.
    expect(out.finalPrice).toBeGreaterThan(3.6);
    expect(out.finalPrice).toBeLessThan(4.4);
  });

  it('reports the base price it was given', () => {
    expect(calculateSharePrice(input({ basePrice: 7.25 })).basePrice).toBe(7.25);
  });

  it('treats a first month with no history as zero fundamentals movement', () => {
    const out = calculateSharePrice(input({ previousKPIs: null }));
    expect(out.kpiDeltas.revenueGrowthMoM).toBe(0);
    expect(out.kpiDeltas.marginDelta).toBe(0);
    expect(out.fundamentalsScore).toBe(50);
  });

  it('rewards revenue growth with a higher price than revenue decline', () => {
    const previous = kpis({ month: 5, revenue_aed: 10_000_000 });
    const grew = calculateSharePrice(
      input({ previousKPIs: previous, currentKPIs: kpis({ revenue_aed: 12_000_000 }) })
    );
    const shrank = calculateSharePrice(
      input({ previousKPIs: previous, currentKPIs: kpis({ revenue_aed: 8_000_000 }) })
    );
    expect(grew.fundamentalsScore).toBeGreaterThan(shrank.fundamentalsScore);
  });

  it('treats falling working capital days as an improvement', () => {
    const previous = kpis({ month: 5, receivable_days: 90, inventory_days: 120 });
    const improved = calculateSharePrice(
      input({ previousKPIs: previous, currentKPIs: kpis({ receivable_days: 60, inventory_days: 90 }) })
    );
    expect(improved.kpiDeltas.workingCapitalDelta).toBeGreaterThan(0);
  });

  it('never returns a price below the DFM floor', () => {
    const out = calculateSharePrice(
      input({
        basePrice: 0.05,
        previousKPIs: kpis({ month: 5, revenue_aed: 50_000_000 }),
        currentKPIs: kpis({ revenue_aed: 1_000 }),
      })
    );
    expect(out.finalPrice).toBeGreaterThanOrEqual(0.10);
  });

  it('never returns a price above 5x base', () => {
    const out = calculateSharePrice(
      input({
        basePrice: 2.0,
        previousKPIs: kpis({ month: 5, revenue_aed: 1_000 }),
        currentKPIs: kpis({ revenue_aed: 50_000_000, fill_rate: 1, market_share_pct: 40 }),
      })
    );
    expect(out.finalPrice).toBeLessThanOrEqual(10.0);
  });

  it('clamps the aggregate event shock to +/-40%', () => {
    const events = Array.from({ length: 12 }, (_, i) => ({
      event_id: `e${i}`,
      expires_month: 9,
      triggered_month: 6,
      sim_market_events: { name: `Event ${i}`, price_impact_pct: -0.20 },
    })) as SharePriceInput['activeEvents'];
    const out = calculateSharePrice(input({ activeEvents: events }));
    expect(out.eventsShock).toBe(-0.40);
  });

  it('returns a price rounded to the DFM tick', () => {
    const out = calculateSharePrice(flatInput());
    expect(out.finalPrice).toBe(roundToTick(out.finalPrice));
  });

  it('keeps sentiment inside its stated bounds', () => {
    for (let i = 0; i < 200; i++) {
      const out = calculateSharePrice(flatInput({ previousSentiment: 0.14 }));
      expect(out.sentimentDrift).toBeLessThanOrEqual(0.15);
      expect(out.sentimentDrift).toBeGreaterThanOrEqual(-0.15);
    }
  });
});

// ─── GCC modifiers ────────────────────────────────────────────────────────────

describe('GCC modifiers', () => {
  /** Fundamentals must be non-zero for a multiplier to be observable. */
  function withGrowth(state: Partial<SimGameState>) {
    return calculateSharePrice(
      input({
        previousKPIs: kpis({ month: 5, revenue_aed: 10_000_000 }),
        currentKPIs: kpis({ revenue_aed: 11_000_000 }),
        gameState: gameState(state),
      })
    );
  }

  it('Ramadan lifts the fundamentals contribution', () => {
    const base = withGrowth({});
    const ramadan = withGrowth({ ramadan_active: true });
    expect(ramadan.fundamentalsDelta).toBeGreaterThan(base.fundamentalsDelta);
  });

  it('a Saudization fine discounts the fundamentals contribution', () => {
    const base = withGrowth({});
    const fined = withGrowth({ saudization_fine_active: true });
    expect(fined.fundamentalsDelta).toBeLessThan(base.fundamentalsDelta);
  });

  it('applies the summer drag exactly once', () => {
    // Summer is a 0.96 multiplier. Applying it twice would yield 0.9216, which
    // is a materially different penalty and is not what the constant declares.
    const base = withGrowth({});
    const summer = withGrowth({ summer_active: true });
    const ratio = summer.fundamentalsDelta / base.fundamentalsDelta;
    expect(ratio).toBeCloseTo(0.96, 4);
  });

  it('each modifier is independent and multiplicative', () => {
    const base = withGrowth({});
    const both = withGrowth({ saudization_fine_active: true, dfm_disclosure_pending: true });
    const expected = base.fundamentalsDelta * 0.97 * 0.985;
    expect(both.fundamentalsDelta).toBeCloseTo(expected, 5);
  });
});

// ─── Event shock summary ──────────────────────────────────────────────────────

describe('buildEventShockSummary', () => {
  const events = [
    {
      event_id: 'red-sea',
      triggered_month: 4,
      expires_month: 10,
      sim_market_events: { name: 'Red Sea disruption', price_impact_pct: -0.12 },
    },
  ] as SharePriceInput['activeEvents'];

  it('sums the impacts', () => {
    expect(buildEventShockSummary(events, 6).totalShockPct).toBeCloseTo(-0.12, 5);
  });

  it('clamps the total to +/-40%', () => {
    const many = Array.from({ length: 10 }, (_, i) => ({
      event_id: `e${i}`,
      triggered_month: 1,
      expires_month: 5,
      sim_market_events: { name: 'x', price_impact_pct: 0.2 },
    })) as SharePriceInput['activeEvents'];
    expect(buildEventShockSummary(many, 3).totalShockPct).toBe(0.40);
  });

  it('reports turnsRemaining consistently with the price calculator', () => {
    // The calculator computes expires_month - current month. This summary must
    // mean the same thing by the same name, or the two disagree about an event
    // that is about to expire versus one that has just started.
    const currentMonth = 8;
    const fromCalculator = calculateSharePrice(
      input({ activeEvents: events, currentKPIs: kpis({ month: currentMonth }) })
    ).activeEvents[0].turnsRemaining;
    const fromSummary = buildEventShockSummary(events, currentMonth).byEvent[0].turnsRemaining;
    expect(fromSummary).toBe(fromCalculator);
  });
});

// ─── Win / loss ───────────────────────────────────────────────────────────────

describe('checkWinLoss', () => {
  const base = {
    currentPrice: 6.0,
    winTarget: 6.0,
    lossFloor: 1.0,
    currentMonth: 6,
    totalMonths: 24,
    currentKPIs: kpis(),
    gameMode: 'turnaround',
  };

  it('is neither won nor lost mid-game with healthy numbers', () => {
    const out = checkWinLoss({ ...base, currentPrice: 4.0 });
    expect(out.won).toBe(false);
    expect(out.lost).toBe(false);
  });

  it('loses when the price hits the floor', () => {
    const out = checkWinLoss({ ...base, currentPrice: 0.9 });
    expect(out.lost).toBe(true);
    expect(out.lossReason).toMatch(/floor/i);
  });

  it('loses on insolvency regardless of price', () => {
    const out = checkWinLoss({
      ...base,
      currentPrice: 9.0,
      currentKPIs: kpis({ cash_balance_aed: 0 }),
    });
    expect(out.lost).toBe(true);
    expect(out.lossReason).toMatch(/cash/i);
  });

  it('loses on a fill-rate collapse, but not before month 3', () => {
    const collapsed = kpis({ fill_rate: 0.3 });
    expect(checkWinLoss({ ...base, currentMonth: 2, currentKPIs: collapsed }).lost).toBe(false);
    expect(checkWinLoss({ ...base, currentMonth: 4, currentKPIs: collapsed }).lost).toBe(true);
  });

  it('wins a turnaround only with both price and margin', () => {
    const marginMet = checkWinLoss({ ...base, currentKPIs: kpis({ ebitda_margin: 0.13 }) });
    expect(marginMet.won).toBe(true);
    const marginMissed = checkWinLoss({ ...base, currentKPIs: kpis({ ebitda_margin: 0.05 }) });
    expect(marginMissed.won).toBe(false);
  });

  it('does not let the final month bypass the turnaround margin gate', () => {
    // Hitting the price target without the margin is not a turnaround. Running
    // the clock out must not convert that into a win, or the mode's stated
    // requirement is decorative.
    const out = checkWinLoss({
      ...base,
      currentMonth: 24,
      totalMonths: 24,
      currentPrice: 6.5,
      currentKPIs: kpis({ ebitda_margin: 0.04 }),
    });
    expect(out.won).toBe(false);
    expect(out.lost).toBe(true);
  });

  it('does not let the final month bypass the growth market-share gate', () => {
    const out = checkWinLoss({
      ...base,
      gameMode: 'growth',
      currentMonth: 24,
      totalMonths: 24,
      currentPrice: 6.5,
      currentKPIs: kpis({ market_share_pct: 11 }),
    });
    expect(out.won).toBe(false);
  });

  it('wins growth mode on price plus market share', () => {
    const out = checkWinLoss({
      ...base,
      gameMode: 'growth',
      currentKPIs: kpis({ market_share_pct: 23 }),
    });
    expect(out.won).toBe(true);
  });

  it('wins expansion mode only once the full term is served', () => {
    const early = checkWinLoss({ ...base, gameMode: 'expansion', currentMonth: 10 });
    expect(early.won).toBe(false);
    const full = checkWinLoss({
      ...base,
      gameMode: 'expansion',
      currentMonth: 24,
      totalMonths: 24,
    });
    expect(full.won).toBe(true);
  });

  it('always gives a reason with a verdict', () => {
    const lost = checkWinLoss({ ...base, currentPrice: 0.5 });
    expect(lost.lossReason).toBeTruthy();
    const won = checkWinLoss({ ...base, currentKPIs: kpis({ ebitda_margin: 0.2 }) });
    expect(won.winReason).toBeTruthy();
  });

  it('never reports won and lost at the same time', () => {
    const cases = [
      { currentPrice: 0.5 },
      { currentPrice: 9.0, currentKPIs: kpis({ ebitda_margin: 0.2 }) },
      { currentMonth: 24, totalMonths: 24 },
      { currentKPIs: kpis({ cash_balance_aed: -1 }) },
    ];
    for (const over of cases) {
      const out = checkWinLoss({ ...base, ...over });
      expect(out.won && out.lost).toBe(false);
    }
  });
});

// ─── GCC calendar ─────────────────────────────────────────────────────────────

describe('getGCCCalendarModifiers', () => {
  it('flags Ramadan in March 2025', () => {
    // Sim month 15 with startYear 2024 = March 2025.
    const out = getGCCCalendarModifiers(15, 2024);
    expect(out.calendarMonth).toBe(3);
    expect(out.isRamadan).toBe(true);
    expect(out.ramadanDemandMultiplier).toBeCloseTo(1.35, 5);
  });

  it('flags summer for June through August', () => {
    for (const month of [6, 7, 8]) {
      expect(getGCCCalendarModifiers(month, 2024).isSummer).toBe(true);
    }
    expect(getGCCCalendarModifiers(5, 2024).isSummer).toBe(false);
    expect(getGCCCalendarModifiers(9, 2024).isSummer).toBe(false);
  });

  it('applies a cold-chain premium only in summer', () => {
    expect(getGCCCalendarModifiers(7, 2024).summerColdChainMultiplier).toBeCloseTo(1.18, 5);
    expect(getGCCCalendarModifiers(2, 2024).summerColdChainMultiplier).toBe(1.0);
  });

  it('wraps the calendar month across simulated years', () => {
    expect(getGCCCalendarModifiers(1, 2024).calendarMonth).toBe(1);
    expect(getGCCCalendarModifiers(13, 2024).calendarMonth).toBe(1);
    expect(getGCCCalendarModifiers(25, 2024).calendarMonth).toBe(1);
  });

  it('moves Ramadan earlier in later years, as the Hijri calendar does', () => {
    // 2024 Ramadan began 11 March, 2026 on 18 February — the drift is ~11 days a
    // year, so a monthly sim should show it reaching February by 2026.
    const y2024 = [...Array(12)].map((_, i) => getGCCCalendarModifiers(i + 1, 2024));
    const y2026 = [...Array(12)].map((_, i) => getGCCCalendarModifiers(i + 25, 2024));
    const first = (a: ReturnType<typeof getGCCCalendarModifiers>[]) =>
      a.findIndex((m) => m.isRamadan) + 1;
    expect(first(y2026)).toBeLessThan(first(y2024));
  });
});

// ─── Formatting and helpers ───────────────────────────────────────────────────

describe('price helpers', () => {
  it('rounds to the tick', () => {
    expect(roundToTick(4.126)).toBe(4.13);
    expect(roundToTick(4.124)).toBe(4.12);
  });

  it('computes percentage change', () => {
    expect(priceChangePct(11, 10)).toBeCloseTo(10, 5);
    expect(priceChangePct(9, 10)).toBeCloseTo(-10, 5);
  });

  it('treats a zero previous price as no change rather than dividing by zero', () => {
    expect(priceChangePct(5, 0)).toBe(0);
    expect(Number.isFinite(priceChangePct(5, 0))).toBe(true);
  });

  it('reports direction with a dead band', () => {
    expect(priceDirection(10.5, 10)).toBe('up');
    expect(priceDirection(9.5, 10)).toBe('down');
    expect(priceDirection(10, 10)).toBe('flat');
  });
});

// ─── Determinism ──────────────────────────────────────────────────────────────

describe('seeded randomness', () => {
  it('seededRandom is reproducible and in range', () => {
    expect(seededRandom(42)).toBe(seededRandom(42));
    const v = seededRandom(12345);
    expect(v).toBeGreaterThanOrEqual(0);
    expect(v).toBeLessThan(1);
  });

  it('seededGaussian is reproducible', () => {
    expect(seededGaussian(7, 0, 0.03)).toBe(seededGaussian(7, 0, 0.03));
  });

  it('seededGaussian returns a finite number', () => {
    for (const seed of [0, 1, 999, 123456]) {
      expect(Number.isFinite(seededGaussian(seed, 0, 0.03))).toBe(true);
    }
  });

  it('hashString is stable and non-negative', () => {
    expect(hashString('session-abc')).toBe(hashString('session-abc'));
    expect(hashString('session-abc')).toBeGreaterThanOrEqual(0);
    expect(hashString('a')).not.toBe(hashString('b'));
  });

  it('the same session and month always produce the same price', () => {
    // A leaderboard ranks players against each other, so an identical month must
    // score identically. With an unseeded sentiment walk it does not, and two
    // players making the same decisions get different share prices.
    const shared = { sessionId: 'session-abc', month: 7 };
    const first = calculateSharePrice(flatInput(shared));
    const second = calculateSharePrice(flatInput(shared));
    expect(second.sentimentDrift).toBe(first.sentimentDrift);
    expect(second.finalPrice).toBe(first.finalPrice);
  });
});
