# GCC Business Simulator

**by [NayakLabs](https://github.com/Vinayak682)**

> Step into the boardroom. Run a Dubai-listed FMCG company. Eight AI agents watch every move you make.

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
