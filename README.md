# GCC Business Simulator

**by [NayakLabs](https://github.com/Vinayak682)**

> Step into the boardroom. Run a Dubai-listed FMCG company. Eight AI agents watch every move you make.

**Problem.** Business simulators usually score you on a single number that moves for reasons you cannot inspect. That makes them unfalsifiable: you cannot tell a good decision from a lucky month, and a leaderboard built on it ranks noise alongside skill.

**Approach.** The share price is a documented three-layer function — fundamentals 60%, event shocks 25%, sentiment 15% — computed from month-over-month KPI deltas with GCC seasonality applied as explicit named multipliers (Ramadan 1.08, summer 0.96, Saudization overhang 0.97). Every layer is a pure function of the prior state, and the sentiment walk is seeded from the session id, so the same session and month always produce the same price. Circuit breakers hold the price inside the DFM floor and 5x base.

**Result.** 42 tests over the scoring engine, green on Node 20 and 22 with a clean `tsc --noEmit`. Reproducible scoring means the leaderboard compares decisions rather than dice.

---

## What the tests caught

The engine was written before the tests. Writing them found four defects, all invisible while playing:

**The summer drag was applied twice.** `multiplier *= GCC_MULTIPLIERS.summer` appeared twice in a row under a comment about cold-chain companies — but with no sector check, so *every* company took 0.96 x 0.96 = 0.9216 instead of 0.96. The cold-chain effect is a cost, already carried by `summer_cold_chain_cost_multiplier`, and it reaches the price through EBITDA margin; multiplying here double-counted it, with the wrong sign.

**Running the clock out bypassed the win requirements.** Each mode gates its win on a second condition beyond share price — 12% EBITDA margin in turnaround, 22% market share in growth. The end-of-game branch tested price alone, so a player who hit the price target and missed the harder gate was awarded the win for simply reaching the final month. Both checks now go through one `meetsModeRequirement` function so they cannot drift apart again.

**Scoring was not reproducible.** `seededRandom`, `seededGaussian`, and `hashString` were written and exported for "deterministic replays" — and never called. The sentiment walk used `Math.random()`, so two players making identical decisions got different share prices. Now seeded from session id plus month, and the API route passes it.

**`buildEventShockSummary` reported the wrong number.** Its `turnsRemaining` was `expires_month - triggered_month` — the event's total duration — so an event about to expire and one that had just fired reported the same value, and it disagreed with the identically-named field from `calculateSharePrice`.

Also corrected: `.env.example` documented `ANTHROPIC_API_KEY`, but `lib/simulator/claude.ts` reads `GOOGLE_AI_API_KEY`. Following the old setup produced an app whose AI endpoints silently returned fallbacks.

> **Naming note.** `lib/simulator/claude.ts` calls Google Gemini (`gemini-2.0-flash` / `gemini-1.5-pro`), and `@anthropic-ai/sdk` is a declared dependency that is never imported. The filename is left as-is because renaming it touches imports across the app — but the provider is Gemini, not Claude.

---

## Tests

```bash
npm install
npm test            # 42 tests, no Supabase and no AI key needed
npm run type-check
```

The suite covers `lib/simulator/sharePrice.ts` only — deliberately, because that is the file that decides outcomes. Everything it touches is a pure function, so the tests need no database, no API key, and no browser.

---

## What This Is

A high-fidelity business simulation set in the GCC — built for founders, operators, and strategists who want to stress-test decisions without burning real capital.

You play as MD/CEO of **Al Manar Industries**, a fictional Dubai-listed FMCG company. Every month you advance, eight autonomous AI agents — each with a distinct domain and personality — analyse your KPIs, flag risks, and push back on your decisions. The share price moves in real time based on three compounding layers: operational performance, sentiment, and market events.

This is not a game. It's a simulator.

---

## AI Agents

| Agent | Role | Personality |
|-------|------|-------------|
| **Tariq** | Chief Strategy Officer | Direct. Never agrees by default. |
| **Zara** | CMO | Consumer trends, brand equity, GCC cultural nuance |
| **Omar** | Head of Supply Chain | Fill rates, lead times, supplier risk |
| **Nadia** | CFO | Cash flow, EBITDA, DFM compliance |
| **Faris** | Head of Planning | Demand forecasts, Ramadan seasonality |
| **Leila** | Commercial Director | Distribution deals, trade terms, channel mix |
| **Priya** | Chief Risk Officer | Regulatory exposure, ESG, scenario planning |
| **Board** | Board of Directors | Governance, shareholder value, disclosure |

---

## GCC Authenticity

- 🌙 **Ramadan demand cycles** — surge in certain categories, compressed working hours
- ☀️ **Gulf summer** — cold chain costs spike, buying offices slow
- 🏛️ **DFM compliance** — disclosure deadlines, material event filings
- 🇸🇦 **Saudization / Emiratization** — Nitaqat fine risk, workforce quota pressure
- 💱 **USD/AED peg dynamics** — commodity import cost sensitivity

---

## Tech Stack

| Layer | Choice |
|-------|--------|
| Framework | Next.js 15 (App Router) |
| Database | Supabase (PostgreSQL + Auth + Realtime) |
| AI | Google Gemini (free tier — `gemini-2.0-flash` + `gemini-1.5-pro`) |
| Styling | Tailwind CSS |
| Hosting | Vercel (recommended) |

---

## Quick Start

```bash
# 1. Clone
git clone https://github.com/Vinayak682/gcc-simulator.git
cd gcc-simulator

# 2. Install
npm install

# 3. Environment
cp .env.example .env.local
# Fill in: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, GOOGLE_AI_API_KEY

# 4. Database — run this SQL on your Supabase project
# scripts/sql/001_sim_tables.sql

# 5. Run
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## Environment Variables

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
GOOGLE_AI_API_KEY=your_gemini_key        # free at aistudio.google.com
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

Get a free Gemini API key at [aistudio.google.com](https://aistudio.google.com) — no credit card required.

---

## Project Structure

```
app/
├── auth/           Login, signup, callback
├── dashboard/      Session list, auto-org seeding
├── sessions/new/   Scenario picker
├── simulator/      Main simulation shell + sub-pages
└── api/
    ├── advisor/    Tariq streaming SSE endpoint
    ├── agents/     Agent tick (QStash or manual)
    ├── onboard/    Org + team seeding
    └── sessions/   Session CRUD + advance-month loop

lib/
├── agents/         8 agent modules + runner
└── simulator/      Types, Supabase client, Gemini (claude.ts), share price, events
```

---

## Deploying to Vercel

```bash
vercel deploy
```

Set the same env vars in Vercel dashboard → Settings → Environment Variables.

---

## Built by NayakLabs

NayakLabs ships products that make complex systems legible.  
This is the first one.

---

*MIT License*
