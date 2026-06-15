-- ============================================================
-- Al Manar CEO Simulator — Complete Database Migration
-- Run in Supabase SQL Editor or via: supabase db push
-- ============================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- TIER 0: TENANCY & AUTH
-- ============================================================

CREATE TABLE IF NOT EXISTS organizations (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                   TEXT NOT NULL,
  slug                   TEXT UNIQUE NOT NULL,
  plan                   TEXT DEFAULT 'free' CHECK (plan IN ('free','pro','team','business','enterprise')),
  stripe_customer_id     TEXT,
  stripe_subscription_id TEXT,
  subscription_status    TEXT DEFAULT 'active' CHECK (subscription_status IN ('active','trialing','past_due','canceled','incomplete')),
  agent_ops_used         INT DEFAULT 0,
  agent_ops_limit        INT DEFAULT 20,
  seats_used             INT DEFAULT 0,
  seats_limit            INT DEFAULT 1,
  custom_logo_url        TEXT,
  sso_domain             TEXT,
  created_at             TIMESTAMPTZ DEFAULT now(),
  updated_at             TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS organization_members (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role        TEXT DEFAULT 'member' CHECK (role IN ('owner','admin','member','billing','instructor')),
  invited_by  UUID REFERENCES auth.users(id),
  invited_at  TIMESTAMPTZ,
  joined_at   TIMESTAMPTZ DEFAULT now(),
  status      TEXT DEFAULT 'active' CHECK (status IN ('pending','active','suspended')),
  UNIQUE(org_id, user_id)
);

CREATE TABLE IF NOT EXISTS teams (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id         UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name           TEXT NOT NULL,
  description    TEXT,
  created_by     UUID REFERENCES auth.users(id),
  is_competitive BOOLEAN DEFAULT false,
  scenario_id    UUID, -- FK added after sim_scenarios table
  created_at     TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS team_members (
  id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id   UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  user_id   UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  sim_role  TEXT DEFAULT 'ceo' CHECK (sim_role IN ('ceo','cfo','coo','cmo','csco','observer')),
  joined_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(team_id, user_id)
);

-- ============================================================
-- TIER 1: SCENARIOS & SESSIONS
-- ============================================================

CREATE TABLE IF NOT EXISTS sim_scenarios (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        UUID REFERENCES organizations(id),
  name          TEXT NOT NULL,
  description   TEXT,
  is_template   BOOLEAN DEFAULT false,
  game_mode     TEXT DEFAULT 'turnaround' CHECK (game_mode IN ('turnaround','growth','expansion','custom')),
  company_name  TEXT DEFAULT 'Al Manar Industries LLC',
  company_ticker TEXT DEFAULT 'ALMI',
  start_price   NUMERIC(10,2) DEFAULT 15.00,
  start_revenue NUMERIC(15,2) DEFAULT 2800000000,
  start_month   INT DEFAULT 1,
  max_months    INT DEFAULT 12,
  win_condition JSONB DEFAULT '{"type":"price_target","target":18.00}',
  lose_condition JSONB DEFAULT '{"type":"circuit_breaker","floor":4.50}',
  difficulty    TEXT DEFAULT 'medium' CHECK (difficulty IN ('easy','medium','hard','expert')),
  region        TEXT DEFAULT 'gcc',
  industry      TEXT DEFAULT 'fmcg_dairy',
  custom_events JSONB,
  is_public     BOOLEAN DEFAULT false,
  created_at    TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sim_sessions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id         UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  org_id          UUID NOT NULL REFERENCES organizations(id),
  scenario_id     UUID REFERENCES sim_scenarios(id),
  status          TEXT DEFAULT 'active' CHECK (status IN ('active','paused','completed','abandoned')),
  current_month   INT DEFAULT 1,
  current_year    INT DEFAULT 2025,
  is_game_over    BOOLEAN DEFAULT false,
  game_over_reason TEXT,
  win_achieved    BOOLEAN DEFAULT false,
  final_score     INT,
  agent_ops_used  INT DEFAULT 0,
  agents_config   JSONB DEFAULT '{}',
  created_at      TIMESTAMPTZ DEFAULT now(),
  completed_at    TIMESTAMPTZ
);

-- Add FK from teams to sim_scenarios
ALTER TABLE teams ADD CONSTRAINT teams_scenario_id_fkey
  FOREIGN KEY (scenario_id) REFERENCES sim_scenarios(id);

-- ============================================================
-- TIER 2: GAME STATE & FINANCIALS
-- ============================================================

CREATE TABLE IF NOT EXISTS sim_game_state (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id                UUID NOT NULL REFERENCES sim_sessions(id) ON DELETE CASCADE,
  month                     INT NOT NULL,
  year                      INT NOT NULL,
  share_price               NUMERIC(10,2),
  health_score              NUMERIC(5,2),
  sentiment_score           NUMERIC(5,2) DEFAULT 50,
  circuit_breaker_triggered BOOLEAN DEFAULT false,
  sop_signed_off            BOOLEAN DEFAULT false,
  decisions_pending         INT DEFAULT 0,
  decisions_resolved        INT DEFAULT 0,
  UNIQUE(session_id, month, year)
);

CREATE TABLE IF NOT EXISTS sim_share_price_history (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id         UUID NOT NULL REFERENCES sim_sessions(id) ON DELETE CASCADE,
  month              INT NOT NULL,
  year               INT NOT NULL,
  price              NUMERIC(10,2) NOT NULL,
  eps                NUMERIC(6,3),
  pe_ratio           NUMERIC(5,2),
  health_score       NUMERIC(5,2),
  event_modifier     NUMERIC(5,2) DEFAULT 0,
  sentiment_modifier NUMERIC(5,2) DEFAULT 0,
  created_at         TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sim_kpi_snapshots (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id             UUID NOT NULL REFERENCES sim_sessions(id) ON DELETE CASCADE,
  month                  INT NOT NULL,
  year                   INT NOT NULL,
  net_revenue            NUMERIC(15,2),
  net_revenue_growth_pct NUMERIC(6,2),
  gross_margin_pct       NUMERIC(6,2),
  ebitda_margin_pct      NUMERIC(6,2),
  otif_pct               NUMERIC(6,2),
  forecast_accuracy_pct  NUMERIC(6,2),
  market_share_uae       NUMERIC(6,2),
  inventory_turnover     NUMERIC(6,2),
  employee_engagement    NUMERIC(6,2),
  cash_balance           NUMERIC(15,2),
  working_capital_days   INT,
  rag_status             TEXT DEFAULT 'green' CHECK (rag_status IN ('green','amber','red')),
  UNIQUE(session_id, month, year)
);

CREATE TABLE IF NOT EXISTS sim_financials (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id        UUID NOT NULL REFERENCES sim_sessions(id) ON DELETE CASCADE,
  month             INT NOT NULL,
  year              INT NOT NULL,
  revenue           NUMERIC(15,2),
  cogs              NUMERIC(15,2),
  gross_profit      NUMERIC(15,2),
  gross_margin_pct  NUMERIC(6,2),
  opex              NUMERIC(15,2),
  ebitda            NUMERIC(15,2),
  ebitda_margin_pct NUMERIC(6,2),
  depreciation      NUMERIC(12,2),
  ebit              NUMERIC(15,2),
  interest          NUMERIC(12,2),
  pbt               NUMERIC(15,2),
  tax               NUMERIC(12,2),
  net_income        NUMERIC(15,2),
  eps               NUMERIC(6,3),
  cash              NUMERIC(15,2),
  receivables_days  INT,
  payables_days     INT,
  inventory_value   NUMERIC(15,2),
  total_debt        NUMERIC(15,2),
  operating_cf      NUMERIC(15,2),
  capex             NUMERIC(12,2),
  free_cash_flow    NUMERIC(15,2),
  vat_reclaim       NUMERIC(12,2) DEFAULT 0,
  UNIQUE(session_id, month, year)
);

-- ============================================================
-- TIER 3: SUPPLY CHAIN
-- ============================================================

CREATE TABLE IF NOT EXISTS sim_skus (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id          UUID NOT NULL REFERENCES sim_sessions(id) ON DELETE CASCADE,
  sku_code            TEXT NOT NULL,
  name_en             TEXT NOT NULL,
  name_ar             TEXT,
  category            TEXT CHECK (category IN ('dairy','juice','food','beverage','bakery')),
  subcategory         TEXT,
  price_aed           NUMERIC(10,2),
  cost_aed            NUMERIC(10,2),
  margin_pct          NUMERIC(6,2),
  abc_class           TEXT CHECK (abc_class IN ('A','B','C')),
  shelf_life_days     INT,
  requires_cold_chain BOOLEAN DEFAULT false,
  halal_cert_status   TEXT DEFAULT 'certified' CHECK (halal_cert_status IN ('certified','pending','expired')),
  active              BOOLEAN DEFAULT true,
  UNIQUE(session_id, sku_code)
);

CREATE TABLE IF NOT EXISTS sim_demand_forecast (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id     UUID NOT NULL REFERENCES sim_sessions(id) ON DELETE CASCADE,
  sku_id         UUID NOT NULL REFERENCES sim_skus(id) ON DELETE CASCADE,
  month          INT NOT NULL,
  year           INT NOT NULL,
  channel        TEXT CHECK (channel IN ('modern_trade','traditional','horeca','ecommerce','export')),
  region         TEXT CHECK (region IN ('uae','saudi','kuwait','bahrain','qatar','oman')),
  forecast_qty   INT,
  actual_qty     INT,
  variance_pct   NUMERIC(6,2),
  is_adjusted    BOOLEAN DEFAULT false,
  adjusted_by    TEXT DEFAULT 'system' CHECK (adjusted_by IN ('user','faris_agent','system')),
  confidence_pct NUMERIC(5,2) DEFAULT 80
);

CREATE TABLE IF NOT EXISTS sim_production_plan (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id    UUID NOT NULL REFERENCES sim_sessions(id) ON DELETE CASCADE,
  facility      TEXT NOT NULL,
  month         INT NOT NULL,
  year          INT NOT NULL,
  planned_units INT,
  actual_units  INT,
  capacity_pct  NUMERIC(5,2),
  oee_pct       NUMERIC(5,2),
  overtime_cost NUMERIC(12,2) DEFAULT 0,
  downtime_hours NUMERIC(6,2) DEFAULT 0,
  downtime_reason TEXT,
  UNIQUE(session_id, facility, month, year)
);

CREATE TABLE IF NOT EXISTS sim_inventory (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id     UUID NOT NULL REFERENCES sim_sessions(id) ON DELETE CASCADE,
  sku_id         UUID NOT NULL REFERENCES sim_skus(id),
  warehouse      TEXT NOT NULL,
  month          INT NOT NULL,
  year           INT NOT NULL,
  opening_qty    INT DEFAULT 0,
  receipts_qty   INT DEFAULT 0,
  dispatched_qty INT DEFAULT 0,
  closing_qty    INT DEFAULT 0,
  days_on_hand   NUMERIC(6,2),
  safety_stock_qty INT,
  reorder_point  INT,
  stockout_flag  BOOLEAN DEFAULT false,
  stockout_days  INT DEFAULT 0
);

CREATE TABLE IF NOT EXISTS sim_suppliers (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id          UUID NOT NULL REFERENCES sim_sessions(id) ON DELETE CASCADE,
  name                TEXT NOT NULL,
  country             TEXT,
  category            TEXT CHECK (category IN ('raw_milk','packaging','flavoring','cold_chain','contract_manufacturing','ingredients')),
  reliability_pct     NUMERIC(5,2) DEFAULT 90,
  otif_pct            NUMERIC(5,2) DEFAULT 92,
  lead_time_days      INT DEFAULT 14,
  contract_value_aed  NUMERIC(15,2),
  contract_expiry     DATE,
  concentration_pct   NUMERIC(5,2),
  risk_rating         TEXT DEFAULT 'medium' CHECK (risk_rating IN ('low','medium','high','critical')),
  last_audit_date     DATE,
  notes               TEXT
);

CREATE TABLE IF NOT EXISTS sim_purchase_orders (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id    UUID NOT NULL REFERENCES sim_sessions(id) ON DELETE CASCADE,
  supplier_id   UUID NOT NULL REFERENCES sim_suppliers(id),
  sku_id        UUID REFERENCES sim_skus(id),
  po_number     TEXT,
  status        TEXT DEFAULT 'draft' CHECK (status IN ('draft','submitted','confirmed','transit','received','delayed','cancelled')),
  qty           INT,
  value_aed     NUMERIC(12,2),
  order_date    DATE,
  expected_date DATE,
  actual_date   DATE,
  delay_days    INT DEFAULT 0,
  delay_reason  TEXT,
  expedited     BOOLEAN DEFAULT false,
  expedite_cost NUMERIC(10,2) DEFAULT 0,
  created_by    TEXT DEFAULT 'user' CHECK (created_by IN ('user','omar_agent','system'))
);

CREATE TABLE IF NOT EXISTS sim_dispatch_schedule (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id     UUID NOT NULL REFERENCES sim_sessions(id) ON DELETE CASCADE,
  route          TEXT NOT NULL,
  origin         TEXT,
  destination    TEXT,
  month          INT NOT NULL,
  year           INT NOT NULL,
  orders_count   INT,
  value_aed      NUMERIC(12,2),
  dispatch_date  DATE,
  delivery_date  DATE,
  otif_flag      BOOLEAN DEFAULT true,
  delay_reason   TEXT,
  transport_mode TEXT CHECK (transport_mode IN ('road','sea','air','rail')),
  cost_aed       NUMERIC(10,2)
);

-- ============================================================
-- TIER 4: DECISIONS, ORG, EVENTS
-- ============================================================

CREATE TABLE IF NOT EXISTS sim_decisions_log (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id            UUID NOT NULL REFERENCES sim_sessions(id) ON DELETE CASCADE,
  month                 INT NOT NULL,
  year                  INT NOT NULL,
  category              TEXT CHECK (category IN ('supply','finance','commercial','hr','expansion','risk','regulatory')),
  title                 TEXT NOT NULL,
  scenario              TEXT,
  options               JSONB NOT NULL,
  player_choice         INT,
  decided_by            UUID REFERENCES auth.users(id),
  decided_by_role       TEXT,
  claude_rec            JSONB,
  followed_rec          BOOLEAN,
  kpi_impact            JSONB,
  consequence_revealed  BOOLEAN DEFAULT false,
  created_at            TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sim_org_chart (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id       UUID REFERENCES sim_sessions(id) ON DELETE CASCADE,
  person_name      TEXT NOT NULL,
  title            TEXT,
  department       TEXT,
  level            INT CHECK (level BETWEEN 0 AND 4),
  reports_to       UUID REFERENCES sim_org_chart(id),
  engagement_score INT DEFAULT 75 CHECK (engagement_score BETWEEN 0 AND 100),
  tenure_months    INT,
  flight_risk      BOOLEAN DEFAULT false,
  avatar_seed      TEXT
);

CREATE TABLE IF NOT EXISTS sim_market_events (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scenario_id              UUID REFERENCES sim_scenarios(id),
  name                     TEXT NOT NULL,
  description              TEXT,
  trigger_month            INT,
  trigger_month_min        INT,
  trigger_month_max        INT,
  category                 TEXT CHECK (category IN ('demand','supply','regulatory','competitor','macro','internal')),
  severity                 TEXT DEFAULT 'medium' CHECK (severity IN ('low','medium','high','crisis')),
  pe_modifier              NUMERIC(4,2) DEFAULT 0,
  kpi_impacts              JSONB DEFAULT '{}',
  duration_months          INT DEFAULT 1,
  player_response_options  JSONB,
  is_conditional           BOOLEAN DEFAULT false,
  condition                JSONB
);

CREATE TABLE IF NOT EXISTS sim_session_events (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id       UUID NOT NULL REFERENCES sim_sessions(id) ON DELETE CASCADE,
  event_id         UUID NOT NULL REFERENCES sim_market_events(id),
  fired_month      INT,
  remaining_months INT DEFAULT 1,
  player_responded BOOLEAN DEFAULT false,
  player_response  INT,
  is_active        BOOLEAN DEFAULT true
);

CREATE TABLE IF NOT EXISTS sim_sop_cycles (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id       UUID NOT NULL REFERENCES sim_sessions(id) ON DELETE CASCADE,
  month            INT NOT NULL,
  year             INT NOT NULL,
  demand_review_at TIMESTAMPTZ,
  demand_summary   TEXT,
  supply_review_at TIMESTAMPTZ,
  supply_summary   TEXT,
  gap_amount_aed   NUMERIC(15,2),
  gap_units        INT,
  gap_resolution   TEXT,
  gap_summary      TEXT,
  exec_signoff_at  TIMESTAMPTZ,
  exec_summary     TEXT,
  is_complete      BOOLEAN DEFAULT false,
  signed_off_by    UUID REFERENCES auth.users(id),
  faris_flagged    JSONB,
  UNIQUE(session_id, month, year)
);

CREATE TABLE IF NOT EXISTS sim_expansion_opps (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scenario_id         UUID REFERENCES sim_scenarios(id),
  key                 TEXT NOT NULL,
  name                TEXT,
  description         TEXT,
  market              TEXT,
  investment_aed      NUMERIC(15,2),
  payback_months      INT,
  npv_aed             NUMERIC(15,2),
  irr_pct             NUMERIC(5,2),
  risks               JSONB,
  saudization_impact  BOOLEAN DEFAULT false,
  halal_cert_needed   BOOLEAN DEFAULT false,
  min_month           INT DEFAULT 3,
  unlocks_after       TEXT,
  UNIQUE(key)
);

CREATE TABLE IF NOT EXISTS sim_session_expansions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id      UUID NOT NULL REFERENCES sim_sessions(id) ON DELETE CASCADE,
  expansion_id    UUID NOT NULL REFERENCES sim_expansion_opps(id),
  status          TEXT DEFAULT 'available' CHECK (status IN ('available','analyzing','approved','rejected','active')),
  analyzed_at     TIMESTAMPTZ,
  decided_at      TIMESTAMPTZ,
  decided_by      UUID REFERENCES auth.users(id),
  memo_content    TEXT,
  UNIQUE(session_id, expansion_id)
);

-- ============================================================
-- TIER 5: AGENTIC LAYER
-- ============================================================

CREATE TABLE IF NOT EXISTS agents (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key            TEXT UNIQUE NOT NULL,
  name           TEXT NOT NULL,
  title          TEXT,
  persona_prompt TEXT,
  model          TEXT DEFAULT 'claude-haiku-4-5-20251001',
  is_active      BOOLEAN DEFAULT true,
  min_plan       TEXT DEFAULT 'free'
);

CREATE TABLE IF NOT EXISTS agent_sessions (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id     UUID NOT NULL REFERENCES sim_sessions(id) ON DELETE CASCADE,
  agent_key      TEXT NOT NULL REFERENCES agents(key),
  is_enabled     BOOLEAN DEFAULT true,
  autonomy_level INT DEFAULT 1 CHECK (autonomy_level IN (1,2,3)),
  last_run_at    TIMESTAMPTZ,
  ops_used       INT DEFAULT 0,
  UNIQUE(session_id, agent_key)
);

CREATE TABLE IF NOT EXISTS agent_activity_log (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id    UUID NOT NULL REFERENCES sim_sessions(id) ON DELETE CASCADE,
  agent_key     TEXT NOT NULL,
  activity_type TEXT NOT NULL CHECK (activity_type IN ('inform','recommend','act','error')),
  title         TEXT NOT NULL,
  content       TEXT,
  data          JSONB,
  is_read       BOOLEAN DEFAULT false,
  is_dismissed  BOOLEAN DEFAULT false,
  created_at    TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS agent_recommendations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id      UUID NOT NULL REFERENCES sim_sessions(id) ON DELETE CASCADE,
  activity_id     UUID REFERENCES agent_activity_log(id),
  agent_key       TEXT NOT NULL,
  title           TEXT NOT NULL,
  recommendation  TEXT,
  reasoning       TEXT,
  proposed_action JSONB,
  status          TEXT DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','deferred','expired','executed')),
  decided_by      UUID REFERENCES auth.users(id),
  decided_at      TIMESTAMPTZ,
  expires_at      TIMESTAMPTZ DEFAULT (now() + INTERVAL '24 hours'),
  kpi_impact      JSONB,
  created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS agent_actions (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id          UUID NOT NULL REFERENCES sim_sessions(id) ON DELETE CASCADE,
  recommendation_id   UUID REFERENCES agent_recommendations(id),
  agent_key           TEXT NOT NULL,
  action_type         TEXT NOT NULL,
  action_data         JSONB,
  executed_at         TIMESTAMPTZ DEFAULT now(),
  can_undo            BOOLEAN DEFAULT true,
  undo_deadline       TIMESTAMPTZ DEFAULT (now() + INTERVAL '30 seconds'),
  was_undone          BOOLEAN DEFAULT false,
  undone_by           UUID REFERENCES auth.users(id),
  kpi_impact_actual   JSONB
);

-- ============================================================
-- TIER 6: PLATFORM / SAAS
-- ============================================================

CREATE TABLE IF NOT EXISTS leaderboard (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id   UUID REFERENCES sim_sessions(id),
  org_id       UUID REFERENCES organizations(id),
  team_name    TEXT,
  game_mode    TEXT,
  scenario_id  UUID REFERENCES sim_scenarios(id),
  final_score  INT,
  final_price  NUMERIC(10,2),
  months_played INT,
  win_achieved BOOLEAN,
  share_token  UUID DEFAULT gen_random_uuid(),
  is_public    BOOLEAN DEFAULT true,
  completed_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS notifications (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id  UUID REFERENCES sim_sessions(id),
  type        TEXT CHECK (type IN ('agent_alert','decision_required','month_ready','game_over','team_invite','billing')),
  title       TEXT NOT NULL,
  body        TEXT,
  action_url  TEXT,
  is_read     BOOLEAN DEFAULT false,
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS usage_events (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      UUID NOT NULL REFERENCES organizations(id),
  user_id     UUID REFERENCES auth.users(id),
  session_id  UUID REFERENCES sim_sessions(id),
  event_type  TEXT NOT NULL,
  agent_key   TEXT,
  ops_count   INT DEFAULT 1,
  model_used  TEXT,
  tokens_in   INT,
  tokens_out  INT,
  cost_usd    NUMERIC(8,4),
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS audit_log (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        UUID REFERENCES organizations(id),
  user_id       UUID REFERENCES auth.users(id),
  action        TEXT NOT NULL,
  resource_type TEXT,
  resource_id   UUID,
  metadata      JSONB,
  ip_address    INET,
  created_at    TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- INDEXES (performance)
-- ============================================================

CREATE INDEX idx_sim_sessions_team ON sim_sessions(team_id);
CREATE INDEX idx_sim_sessions_org ON sim_sessions(org_id);
CREATE INDEX idx_sim_sessions_status ON sim_sessions(status);
CREATE INDEX idx_sim_kpi_session_month ON sim_kpi_snapshots(session_id, month, year);
CREATE INDEX idx_sim_price_session ON sim_share_price_history(session_id, created_at DESC);
CREATE INDEX idx_sim_decisions_session ON sim_decisions_log(session_id, month);
CREATE INDEX idx_sim_inventory_session ON sim_inventory(session_id, month, year);
CREATE INDEX idx_sim_demand_session ON sim_demand_forecast(session_id, month, year);
CREATE INDEX idx_sim_pos_session ON sim_purchase_orders(session_id, status);
CREATE INDEX idx_agent_log_session ON agent_activity_log(session_id, created_at DESC);
CREATE INDEX idx_agent_rec_session ON agent_recommendations(session_id, status);
CREATE INDEX idx_notifications_user ON notifications(user_id, is_read, created_at DESC);
CREATE INDEX idx_leaderboard_public ON leaderboard(is_public, final_score DESC);
CREATE INDEX idx_org_members_user ON organization_members(user_id);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

-- Helper function to get current user's org_ids
CREATE OR REPLACE FUNCTION get_my_org_ids()
RETURNS SETOF UUID LANGUAGE sql STABLE AS $$
  SELECT org_id FROM organization_members WHERE user_id = auth.uid() AND status = 'active';
$$;

-- Helper: get session_ids accessible to current user
CREATE OR REPLACE FUNCTION get_my_session_ids()
RETURNS SETOF UUID LANGUAGE sql STABLE AS $$
  SELECT s.id FROM sim_sessions s
  JOIN teams t ON t.id = s.team_id
  WHERE t.org_id IN (SELECT get_my_org_ids())
     OR t.id IN (SELECT team_id FROM team_members WHERE user_id = auth.uid());
$$;

-- Organizations
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members can view their org" ON organizations FOR SELECT
  USING (id IN (SELECT get_my_org_ids()));
CREATE POLICY "Owners can update their org" ON organizations FOR UPDATE
  USING (id IN (SELECT org_id FROM organization_members WHERE user_id = auth.uid() AND role IN ('owner','admin')));

-- Organization Members
ALTER TABLE organization_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members can view org members" ON organization_members FOR SELECT
  USING (org_id IN (SELECT get_my_org_ids()));
CREATE POLICY "Admins can manage members" ON organization_members FOR ALL
  USING (org_id IN (SELECT org_id FROM organization_members WHERE user_id = auth.uid() AND role IN ('owner','admin')));

-- Teams
ALTER TABLE teams ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Org members can view teams" ON teams FOR SELECT
  USING (org_id IN (SELECT get_my_org_ids()));
CREATE POLICY "Admins can manage teams" ON teams FOR ALL
  USING (org_id IN (SELECT org_id FROM organization_members WHERE user_id = auth.uid() AND role IN ('owner','admin','instructor')));

-- Sim Sessions
ALTER TABLE sim_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Team members can view sessions" ON sim_sessions FOR SELECT
  USING (id IN (SELECT get_my_session_ids()));
CREATE POLICY "Team members can update sessions" ON sim_sessions FOR UPDATE
  USING (id IN (SELECT get_my_session_ids()));
CREATE POLICY "Admins can insert sessions" ON sim_sessions FOR INSERT
  WITH CHECK (org_id IN (SELECT get_my_org_ids()));

-- Apply session-scoped RLS to all game tables
DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'sim_game_state','sim_share_price_history','sim_kpi_snapshots',
    'sim_financials','sim_skus','sim_demand_forecast','sim_production_plan',
    'sim_inventory','sim_suppliers','sim_purchase_orders','sim_dispatch_schedule',
    'sim_decisions_log','sim_sop_cycles','sim_session_events','sim_session_expansions',
    'agent_sessions','agent_activity_log','agent_recommendations','agent_actions'
  ]
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY "Users access own sessions data" ON %I FOR ALL
       USING (session_id IN (SELECT get_my_session_ids()))',
      t
    );
  END LOOP;
END $$;

-- Org chart: public read for global templates, session-scoped otherwise
ALTER TABLE sim_org_chart ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Org chart access" ON sim_org_chart FOR SELECT
  USING (session_id IS NULL OR session_id IN (SELECT get_my_session_ids()));

-- Static tables (global scenarios, events, expansion opps) — public read
ALTER TABLE sim_scenarios ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public scenarios readable by all" ON sim_scenarios FOR SELECT
  USING (is_public = true OR org_id IN (SELECT get_my_org_ids()) OR org_id IS NULL);
CREATE POLICY "Org can manage their scenarios" ON sim_scenarios FOR ALL
  USING (org_id IN (SELECT org_id FROM organization_members WHERE user_id = auth.uid() AND role IN ('owner','admin')));

ALTER TABLE sim_market_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Events readable" ON sim_market_events FOR SELECT USING (true);

ALTER TABLE sim_expansion_opps ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Expansion opps readable" ON sim_expansion_opps FOR SELECT USING (true);

ALTER TABLE agents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Agents readable by all" ON agents FOR SELECT USING (true);

-- Notifications: user's own only
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users see own notifications" ON notifications FOR ALL
  USING (user_id = auth.uid());

-- Leaderboard: public entries visible to all, private to org
ALTER TABLE leaderboard ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public leaderboard visible" ON leaderboard FOR SELECT
  USING (is_public = true OR org_id IN (SELECT get_my_org_ids()));

-- ============================================================
-- REALTIME SUBSCRIPTIONS
-- ============================================================
ALTER PUBLICATION supabase_realtime ADD TABLE sim_share_price_history;
ALTER PUBLICATION supabase_realtime ADD TABLE sim_game_state;
ALTER PUBLICATION supabase_realtime ADD TABLE agent_activity_log;
ALTER PUBLICATION supabase_realtime ADD TABLE agent_recommendations;
ALTER PUBLICATION supabase_realtime ADD TABLE notifications;

-- ============================================================
-- SEED: AGENTS
-- ============================================================
INSERT INTO agents (key, name, title, model, min_plan) VALUES
  ('tariq', 'Tariq Al Rashidi', 'Chief Strategy Advisor',           'claude-haiku-4-5-20251001', 'free'),
  ('zara',  'Zara Al Mansouri', 'Head of Market Intelligence',      'claude-haiku-4-5-20251001', 'free'),
  ('omar',  'Omar Bin Rashid',  'VP Supply Chain Operations',       'claude-haiku-4-5-20251001', 'pro'),
  ('nadia', 'Nadia Al Zahra',   'Chief Financial Officer',          'claude-haiku-4-5-20251001', 'pro'),
  ('faris', 'Faris Al Tamimi',  'Chief Supply Chain Officer',       'claude-haiku-4-5-20251001', 'pro'),
  ('leila', 'Leila Mansouri',   'Chief Marketing & Commercial Officer', 'claude-haiku-4-5-20251001', 'team'),
  ('priya', 'Priya Nair',       'VP Risk & Compliance',             'claude-haiku-4-5-20251001', 'team'),
  ('board', 'Board Secretariat','Governance & Investor Relations',  'claude-opus-4-8',            'business')
ON CONFLICT (key) DO NOTHING;

-- ============================================================
-- SEED: DEFAULT SCENARIO
-- ============================================================
INSERT INTO sim_scenarios (
  id, name, description, is_template, game_mode, is_public,
  start_price, max_months, difficulty,
  win_condition, lose_condition
) VALUES (
  'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  'Turnaround — Al Manar FY2025',
  'You have inherited Al Manar Industries at a critical inflection point. Share price has fallen 38% from IPO. The board has given you 12 months to restore investor confidence.',
  true, 'turnaround', true,
  9.20, 12, 'hard',
  '{"type":"price_target","target":18.00,"description":"Reach AED 18.00 share price"}',
  '{"type":"circuit_breaker","floor":4.50,"description":"DFM circuit breaker triggers below AED 4.50"}'
),
(
  'b2c3d4e5-f6a7-8901-bcde-f01234567891',
  'Growth Mode — FY2025',
  'Healthy operations with ambitious growth targets. Scale revenue from AED 2.8B to AED 3.5B while protecting EBITDA margin above 14%.',
  true, 'growth', true,
  15.00, 24, 'medium',
  '{"type":"revenue_target","target":3500000000,"margin_floor":14.0}',
  '{"type":"price_floor","floor":9.00}'
),
(
  'c3d4e5f6-a7b8-9012-cdef-012345678902',
  'GCC Expansion — FY2025-2027',
  'Dominate the Gulf. Successful UAE operations provide a launchpad. Enter 2 new GCC markets while maintaining DFM listing above AED 15.00.',
  true, 'expansion', true,
  15.00, 36, 'expert',
  '{"type":"expansion_count","target":2,"min_price":15.00}',
  '{"type":"price_floor","floor":7.50}'
)
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- SEED: MARKET EVENTS (20 scripted events)
-- ============================================================
INSERT INTO sim_market_events (name, description, trigger_month, category, severity, pe_modifier, kpi_impacts, duration_months) VALUES
  ('Global Dairy Commodity Spike',
   'International raw milk prices rose 18% due to supply disruption in New Zealand and EU quota changes. Your COGS pressure begins immediately.',
   1, 'supply', 'high', -1.5,
   '{"gross_margin_pct": -2.1, "otif_pct": -0.5}', 3),

  ('DFM Analyst Upgrade',
   'Emirates NBD Capital upgrades Al Manar from Hold to Overweight. Price target raised to AED 18.00. Institutional buying expected.',
   2, 'macro', 'medium', 3.0,
   '{"market_share_uae": 0.3}', 1),

  ('Ramadan Season Begins',
   'Ramadan has commenced. Dairy and juice demand surges across all channels. Modern trade buyers expect 40% volume uplift. Cold chain under pressure.',
   3, 'demand', 'high', 2.0,
   '{"net_revenue_growth_pct": 4.5, "otif_pct": -2.0, "forecast_accuracy_pct": -3.0}', 2),

  ('Saudi Competitor Price War',
   'Almarai launches aggressive promotional pricing across UAE modern trade — 15% discount on dairy staples. Your market share is under direct attack.',
   4, 'competitor', 'high', -2.0,
   '{"market_share_uae": -1.2, "gross_margin_pct": -0.8}', 3),

  ('UAE Food Safety Authority Audit',
   'FSAI conducted unannounced audit. Two SKUs failed temperature compliance during distribution. Product recall notice issued for batch #2247.',
   5, 'regulatory', 'crisis', -3.0,
   '{"otif_pct": -4.0, "employee_engagement": -5.0, "gross_margin_pct": -1.5}', 2),

  ('Summer Heat — Cold Chain Incident',
   'Record June temperatures (48°C) caused cold chain excursion on Dubai-Riyadh route. 3 trucks of dairy product condemned. Insurance claim filed.',
   6, 'supply', 'high', -1.5,
   '{"otif_pct": -3.0, "gross_margin_pct": -1.2, "inventory_turnover": -0.5}', 1),

  ('Sovereign Wealth Fund Stake',
   'Mubadala Investment Company acquired 3.2% stake in Al Manar Industries via DFM open market. Strong signal of institutional confidence.',
   7, 'macro', 'medium', 4.0,
   '{"employee_engagement": 4.0}', 2),

  ('Raw Milk Shortage — FMD Scare',
   'Foot and Mouth Disease outbreak in supplier region. Your primary raw milk co-op has suspended deliveries. 14-day supply gap risk.',
   8, 'supply', 'crisis', -2.5,
   '{"gross_margin_pct": -3.5, "otif_pct": -5.0, "inventory_turnover": -1.0}', 2),

  ('CFO Departure Announced',
   'Nadia Al Zahra has accepted an offer from a NEOM-linked entity. Her departure in 60 days creates a leadership gap in finance.',
   9, 'internal', 'high', -2.0,
   '{"employee_engagement": -8.0}', 2),

  ('Emirates NBD SME Report Feature',
   'Al Manar featured as anchor case study in Emirates NBD Gulf Business Excellence Report. Brand awareness +12% among B2B buyers.',
   10, 'macro', 'low', 1.5,
   '{"market_share_uae": 0.5, "employee_engagement": 3.0}', 1),

  ('Eid Al Adha Volume Surge',
   'Eid Al Adha drives fresh dairy demand +28%. HoReCa and hypermarket channels requesting emergency top-ups. Logistics under strain.',
   11, 'demand', 'medium', 1.5,
   '{"net_revenue_growth_pct": 2.5, "otif_pct": -1.5}', 1),

  ('DFM Disclosure Requirement Triggered',
   'OTIF dropped below 90% — crossing DFM material disclosure threshold. Legal team requires same-day filing or faces regulatory fine.',
   5, 'regulatory', 'high', -2.0,
   '{"gross_margin_pct": -0.5}', 1),

  ('Saudi Vision 2030 F&B Initiative',
   'Saudi Ministry of Industry announced preferential treatment for GCC-origin FMCG companies in government procurement. AED 240M opportunity.',
   6, 'macro', 'medium', 2.0,
   '{"market_share_uae": 0.2}', 3),

  ('Packaging Cost Inflation',
   'PET resin and aluminum prices up 22% globally due to energy costs. Packaging represents 18% of your COGS.',
   7, 'supply', 'medium', -1.0,
   '{"gross_margin_pct": -1.8}', 3),

  ('New Entrant: Private Label Threat',
   'LuLu Hypermarket launches own-brand dairy range priced 20% below Al Manar. Traditional trade customers switching.',
   8, 'competitor', 'medium', -1.5,
   '{"market_share_uae": -0.8, "net_revenue_growth_pct": -1.5}', 3),

  ('Halal Certification Renewal Delay',
   'ESMA halal re-certification for 6 SKUs is delayed 8 weeks. Saudi Arabia shelf clearance required pending renewal.',
   9, 'regulatory', 'high', -1.5,
   '{"otif_pct": -2.5, "net_revenue_growth_pct": -1.2}', 2),

  ('Positive Earnings Surprise',
   'Q3 net income beat analyst consensus by 12%. EPS of AED 0.74 vs expected AED 0.66. DFM trades up 4% on the news.',
   9, 'macro', 'medium', 3.5,
   '{"employee_engagement": 5.0}', 1),

  ('Suez Canal Disruption',
   'Red Sea shipping disruption adds 14 days to import lead times. Packaging and ingredient shipments from Europe severely delayed.',
   10, 'supply', 'high', -1.5,
   '{"otif_pct": -3.5, "inventory_turnover": -0.8}', 2),

  ('Ramadan 2026 Pre-Build Window',
   'Forward-looking retailers issuing Ramadan 2026 orders 10 weeks early. Early commitment required — forecast accuracy critical.',
   11, 'demand', 'medium', 1.0,
   '{"forecast_accuracy_pct": -2.0}', 2),

  ('Year-End Investor Day',
   'Annual investor day scheduled. Share price performance on this day will reflect full-year execution quality and management credibility.',
   12, 'macro', 'high', 0,
   '{}', 1)
ON CONFLICT DO NOTHING;

-- ============================================================
-- SEED: EXPANSION OPPORTUNITIES (8)
-- ============================================================
INSERT INTO sim_expansion_opps (key, name, description, market, investment_aed, payback_months, npv_aed, irr_pct, risks, saudization_impact, halal_cert_needed, min_month) VALUES
  ('egypt_entry',
   'Egypt Market Entry',
   'Establish greenfield distribution in Egypt via exclusive distributor partnership. 18M target consumers in Cairo/Alexandria corridor.',
   'egypt', 45000000, 28, 62000000, 22.5,
   '["Currency devaluation risk (EGP)","Regulatory approval 6-9 months","Logistics cost premium 18%"]',
   false, true, 4),

  ('saudi_jv',
   'Saudi Arabia Joint Venture',
   'Acquire 20% stake in Al Othaim Food Processing as JV partner. Access to SAR 1.2B Saudi Modern Trade footprint.',
   'saudi', 120000000, 36, 195000000, 18.2,
   '["Saudization quota 35% applies","JV partner integration risk","Valuation premium 2.8x EV/EBITDA"]',
   true, false, 6),

  ('icc_sponsorship',
   'ICC Cricket World Cup 2026 Sponsorship',
   'Title sponsorship of ICC tournament broadcast rights across MENA. Reaches 55M South Asian expat demographic in GCC.',
   'uae', 8000000, 18, 11000000, 31.0,
   '["Brand awareness unproven in dairy category","Competitor ambush marketing risk"]',
   false, false, 2),

  ('bahrain_acquisition',
   'Bahrain Dairy Brand Acquisition',
   'Full acquisition of Bahrain Dairy Co. (BDC) — local brand with 34% Bahraini market share. AED 65M enterprise value.',
   'bahrain', 65000000, 42, 45000000, 14.8,
   '["BDC infrastructure aging — AED 12M capex needed","Cultural integration risk","Bahrain regulatory approval"]',
   false, true, 8),

  ('kuwait_horeca',
   'Kuwait HoReCa Exclusive Contract',
   '3-year exclusive supply agreement with Kuwait Hotels Association covering 180+ properties. AED 22M annual contract value.',
   'kuwait', 12000000, 14, 38000000, 41.5,
   '["Dedicated cold chain investment required","Contract renewal risk Year 3","Margin compression vs retail"]',
   false, false, 3),

  ('jordan_ecommerce',
   'Jordan E-Commerce Launch',
   'Asset-light digital-first entry into Jordan via partnership with Talabat and Careem Now. AED 5M initial investment.',
   'jordan', 5000000, 20, 8500000, 28.0,
   '["Unproven market — no brand recognition","E-commerce logistics infrastructure immature","Currency risk JOD"]',
   false, true, 3),

  ('qatar_hospitality',
   'Qatar Post-World Cup Hospitality Contracts',
   'Secure long-term supply agreements with FIFA Legacy venues and Qatar hospitality sector. AED 35M annual opportunity.',
   'qatar', 18000000, 22, 52000000, 29.5,
   '["Intense competition from European dairy brands","Price sensitivity in luxury hospitality","Regulatory approval QFSA"]',
   false, true, 5),

  ('uae_private_label',
   'UAE Private Label Manufacturing',
   'Supply Carrefour UAE and Spinneys with private label dairy range. 8% lower margin vs branded but guaranteed volume uplift 35%.',
   'uae', 25000000, 16, 31000000, 24.5,
   '["Brand equity dilution risk","Carrefour contract terms onerous","Capacity utilization conflict with branded"]',
   false, false, 2)
ON CONFLICT (key) DO NOTHING;

-- Done!
COMMENT ON SCHEMA public IS 'Al Manar CEO Simulator — SaaS Agentic Platform v1.0';
