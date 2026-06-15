/**
 * Al Manar Industries — GCC Business Simulator
 * TypeScript interfaces for all database entities and domain objects
 *
 * Generated from: 001_sim_tables.sql (26-table schema)
 * Multi-tenant: organizations → teams → sessions hierarchy
 */

// ─── Enums ────────────────────────────────────────────────────────────────────

export type OrgPlan = 'free' | 'pro' | 'team' | 'business' | 'enterprise';
export type MemberRole = 'owner' | 'admin' | 'member' | 'viewer';
export type MemberStatus = 'active' | 'invited' | 'suspended';

export type SessionStatus = 'active' | 'paused' | 'completed' | 'abandoned';
export type GameMode = 'turnaround' | 'growth' | 'expansion';
export type Difficulty = 'easy' | 'normal' | 'hard' | 'simulation';

export type DecisionCategory =
  | 'pricing'
  | 'supply_chain'
  | 'marketing'
  | 'hr'
  | 'finance'
  | 'expansion'
  | 'risk'
  | 'governance';

export type DecisionStatus = 'pending' | 'decided' | 'skipped' | 'expired';

export type EventType =
  | 'commodity_shock'
  | 'demand_surge'
  | 'demand_slump'
  | 'competitor_action'
  | 'regulatory'
  | 'geopolitical'
  | 'fx_move'
  | 'esg'
  | 'weather'
  | 'public_health';

export type AgentName =
  | 'tariq'
  | 'zara'
  | 'omar'
  | 'nadia'
  | 'faris'
  | 'leila'
  | 'priya'
  | 'board';

export type AutonomyLevel = 1 | 2 | 3; // 1=Inform, 2=Recommend, 3=Act

export type ActivityType =
  | 'analysis'
  | 'recommendation'
  | 'action_taken'
  | 'alert'
  | 'report';

export type RecommendationStatus = 'pending' | 'accepted' | 'rejected' | 'expired' | 'auto_applied';

export type SOPStatus = 'draft' | 'demand_plan' | 'supply_plan' | 'approved' | 'locked';

export type POStatus = 'draft' | 'submitted' | 'confirmed' | 'in_transit' | 'received' | 'cancelled';

export type ExpansionStatus = 'available' | 'evaluating' | 'approved' | 'in_progress' | 'completed' | 'rejected';

export type NotificationType =
  | 'agent_action'
  | 'market_event'
  | 'decision_due'
  | 'win_condition'
  | 'loss_condition'
  | 'billing'
  | 'system';

export type NotificationPriority = 'low' | 'medium' | 'high' | 'critical';

// ─── Organization & Auth ─────────────────────────────────────────────────────

export interface Organization {
  id: string;
  name: string;
  slug: string;
  plan: OrgPlan;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  subscription_status: string | null;
  credits_remaining: number;
  max_concurrent_sessions: number;
  max_members: number;
  feature_flags: Record<string, boolean>;
  created_at: string;
  updated_at: string;
}

export interface OrganizationMember {
  id: string;
  org_id: string;
  user_id: string;
  role: MemberRole;
  status: MemberStatus;
  invited_by: string | null;
  joined_at: string | null;
  created_at: string;
}

export interface Team {
  id: string;
  org_id: string;
  name: string;
  description: string | null;
  scenario_id: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface TeamMember {
  id: string;
  team_id: string;
  user_id: string;
  role: MemberRole;
  joined_at: string;
}

// ─── Simulation Scenarios ─────────────────────────────────────────────────────

export interface SimScenario {
  id: string;
  name: string;
  description: string;
  game_mode: GameMode;
  difficulty: Difficulty;
  initial_share_price: number; // AED
  win_target_price: number; // AED
  loss_floor_price: number; // AED
  months_total: number;
  initial_kpis: InitialKPIs;
  gcc_region: string;
  is_template: boolean;
  created_by: string | null;
  created_at: string;
}

export interface InitialKPIs {
  revenue_aed: number;
  ebitda_margin: number;
  gross_margin: number;
  net_working_capital_days: number;
  market_share_pct: number;
  customer_satisfaction: number;
  employee_nps: number;
  fill_rate: number;
  inventory_days: number;
  cash_balance_aed: number;
}

// ─── Sessions ─────────────────────────────────────────────────────────────────

export interface SimSession {
  id: string;
  team_id: string;
  scenario_id: string;
  created_by: string;
  status: SessionStatus;
  current_month: number; // 1-based
  total_months: number;
  started_at: string;
  completed_at: string | null;
  win_achieved: boolean;
  loss_triggered: boolean;
  final_share_price: number | null;
  leaderboard_eligible: boolean;
  player_count: number;
  session_metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

// ─── KPI Snapshots ────────────────────────────────────────────────────────────

export interface SimKPISnapshot {
  id: string;
  session_id: string;
  month: number;
  // Revenue & Profitability
  revenue_aed: number;
  cogs_aed: number;
  gross_profit_aed: number;
  gross_margin: number;
  ebitda_aed: number;
  ebitda_margin: number;
  net_profit_aed: number;
  net_margin: number;
  // Balance Sheet
  cash_balance_aed: number;
  accounts_receivable_aed: number;
  inventory_value_aed: number;
  accounts_payable_aed: number;
  net_working_capital_aed: number;
  // Operational
  fill_rate: number; // 0-1
  inventory_days: number;
  receivable_days: number;
  payable_days: number;
  // Market
  market_share_pct: number; // 0-100
  units_sold: number;
  avg_selling_price_aed: number;
  // People
  headcount: number;
  employee_nps: number; // -100 to 100
  saudization_pct: number | null; // KSA operations
  // Customer
  customer_satisfaction: number; // 0-100
  nps: number; // -100 to 100
  // ESG
  carbon_intensity: number;
  // Share Price Inputs
  fundamentals_score: number; // 0-100
  market_sentiment: number; // -1 to 1
  event_shock_total: number; // cumulative AED impact
  share_price: number; // AED
  created_at: string;
}

// ─── Share Price ──────────────────────────────────────────────────────────────

export interface SimSharePriceHistory {
  id: string;
  session_id: string;
  month: number;
  week: number | null; // null = month-end snapshot
  price_aed: number;
  fundamentals_component: number;
  events_component: number;
  sentiment_component: number;
  // 3-layer formula details
  fundamentals_score: number; // 0-100 normalized
  active_event_ids: string[];
  sentiment_drift: number; // cumulative -1 to 1
  recorded_at: string;
}

/**
 * 3-Layer Share Price Formula:
 *
 * price = base_price
 *   × (1 + fundamentals_delta × 0.60)
 *   × (1 + events_shock × 0.25)
 *   × (1 + sentiment_drift × 0.15)
 *
 * fundamentals_delta = f(revenue growth, margin improvement, working capital, fill rate)
 * events_shock = Σ active_events.price_impact_pct
 * sentiment_drift = bounded random walk [-0.15, +0.15]
 */
export interface SharePriceComponents {
  basePrice: number;
  fundamentalsDelta: number; // -1 to +1
  eventsShock: number; // -1 to +1
  sentimentDrift: number; // -0.15 to +0.15
  finalPrice: number;
  // Breakdown
  fundamentalsScore: number; // 0-100
  activeEvents: MarketEventSnapshot[];
  kpiDeltas: KPIDeltaSet;
}

export interface KPIDeltaSet {
  revenueGrowthMoM: number;
  marginDelta: number;
  workingCapitalDelta: number;
  fillRateDelta: number;
  marketShareDelta: number;
}

export interface MarketEventSnapshot {
  eventId: string;
  name: string;
  priceImpactPct: number;
  turnsRemaining: number;
}

// ─── Game State ───────────────────────────────────────────────────────────────

export interface SimGameState {
  id: string;
  session_id: string;
  month: number;
  // GCC Modifiers (all 0.0-2.0 multipliers)
  ramadan_active: boolean;
  ramadan_demand_multiplier: number;
  summer_active: boolean;
  summer_cold_chain_cost_multiplier: number;
  national_day_boost: boolean;
  // Regulatory
  saudization_fine_active: boolean;
  dfm_disclosure_pending: boolean;
  vat_rate: number; // UAE 5%, KSA 15%
  // Market Dynamics
  competitor_aggression: number; // 0-10
  consumer_confidence: number; // 0-100
  commodity_index: number; // 100 = baseline
  fx_usd_aed: number; // pegged ~3.67 but can float in sim
  // Player decisions this month
  decisions_made: number;
  decisions_available: number;
  // Claude Usage
  claude_calls_this_month: number;
  claude_budget_remaining: number; // credits
  // Turn state
  phase: 'decision' | 'sop_cycle' | 'month_end' | 'event';
  pending_event_ids: string[];
  updated_at: string;
  /** Global autonomy override — overrides per-agent autonomy_level */
  agents_autonomy_level?: AutonomyLevel;
}

// ─── Decisions ────────────────────────────────────────────────────────────────

export interface SimDecision {
  id: string;
  session_id: string;
  month: number;
  category: DecisionCategory;
  title: string;
  description: string;
  context_data: DecisionContext;
  options: DecisionOption[];
  status: DecisionStatus;
  chosen_option_id: string | null;
  decided_by: string | null;
  decided_at: string | null;
  agent_recommendation: string | null; // agent name who recommended
  kpi_impact: KPIImpact | null; // actual realized impact
  created_at: string;
  expires_at: string | null;
}

export interface DecisionOption {
  id: string; // e.g. 'A', 'B', 'C'
  label: string;
  description: string;
  tradeoffs: string[];
  projected_kpi_impact: KPIImpact;
  risk_level: 'low' | 'medium' | 'high';
  gcc_context: string | null; // e.g. "Ramadan timing favors this option"
  agent_notes: Record<AgentName, string>; // per-agent commentary
}

export interface DecisionContext {
  current_kpis: Partial<SimKPISnapshot>;
  active_events: string[];
  gcc_modifiers: Partial<SimGameState>;
  relevant_history: string[];
}

export interface KPIImpact {
  revenue_pct: number;
  margin_delta: number;
  working_capital_delta: number;
  fill_rate_delta: number;
  market_share_delta: number;
  employee_nps_delta: number;
  customer_satisfaction_delta: number;
  cash_impact_aed: number;
  share_price_delta_pct: number; // estimated
  one_time: boolean;
  duration_months: number;
  probability: number; // 0-1 confidence
}

// ─── Market Events ────────────────────────────────────────────────────────────

export interface SimMarketEvent {
  id: string;
  name: string;
  type: EventType;
  description: string;
  trigger_month_range: [number, number]; // [earliest, latest] month to fire
  probability: number; // 0-1
  duration_months: number;
  price_impact_pct: number; // on share price
  kpi_impacts: KPIImpact;
  gcc_specific: boolean;
  scenario_ids: string[]; // null/empty = all scenarios
  flavor_text: string;
  player_options: EventResponseOption[];
  created_at: string;
}

export interface EventResponseOption {
  id: string;
  label: string;
  description: string;
  cost_aed: number;
  kpi_modifier: Partial<KPIImpact>;
}

export interface SimActiveEvent {
  id: string;
  session_id: string;
  event_id: string;
  triggered_month: number;
  expires_month: number;
  is_resolved: boolean;
  player_response_option_id: string | null;
  price_impact_applied: number;
  kpi_impact_applied: KPIImpact | null;
  created_at: string;
  /** Joined market event data when fetched with select('*, sim_market_events(*)') */
  sim_market_events?: SimMarketEvent;
}

/** SimActiveEvent with the parent market event joined in */
export type MarketEventSession = SimActiveEvent & {
  sim_market_events: SimMarketEvent;
};

// ─── Agents ───────────────────────────────────────────────────────────────────

export interface SimAgent {
  id: string;
  name: AgentName;
  display_name: string;
  title: string;
  avatar_emoji: string;
  personality: string;
  domain: string[];
  model: string; // e.g. claude-haiku-4-5-20251001
  autonomy_level: AutonomyLevel;
  is_active: boolean;
  system_prompt_template: string;
  created_at: string;
}

export interface AgentActivityLog {
  id: string;
  session_id: string;
  agent_name: AgentName;
  month: number;
  activity_type: ActivityType;
  title: string;
  summary: string;
  full_content: string | null; // markdown
  metadata: Record<string, unknown>;
  tokens_used: number;
  cost_usd: number;
  created_at: string;
  /** Autonomy level at time of action (denormalized from agent_sessions) */
  autonomy_level?: AutonomyLevel;
}

export interface AgentRecommendation {
  id: string;
  session_id: string;
  agent_name: AgentName;
  month: number;
  decision_id: string | null;
  title: string;
  recommendation: string; // markdown
  recommended_option_id: string | null;
  confidence: number; // 0-1
  reasoning: string;
  status: RecommendationStatus;
  player_feedback: string | null;
  created_at: string;
  expires_at: string | null;
}

export interface AgentAction {
  id: string;
  session_id: string;
  agent_name: AgentName;
  month: number;
  action_type: string;
  description: string;
  kpi_impact: KPIImpact | null;
  cost_aed: number;
  approved_by: string | null; // null = auto-approved (Level 3)
  approved_at: string | null;
  rolled_back: boolean;
  rollback_reason: string | null;
  created_at: string;
}

// ─── Financials ───────────────────────────────────────────────────────────────

export interface SimFinancials {
  id: string;
  session_id: string;
  month: number;
  // P&L
  revenue_aed: number;
  cost_of_goods_aed: number;
  gross_profit_aed: number;
  marketing_spend_aed: number;
  logistics_cost_aed: number;
  headcount_cost_aed: number;
  overhead_aed: number;
  ebitda_aed: number;
  da_aed: number; // depreciation & amortization
  ebit_aed: number;
  interest_expense_aed: number;
  tax_aed: number;
  net_profit_aed: number;
  // Cash Flow
  operating_cf_aed: number;
  investing_cf_aed: number;
  financing_cf_aed: number;
  net_cf_aed: number;
  closing_cash_aed: number;
  // Balance Sheet Highlights
  total_assets_aed: number;
  total_liabilities_aed: number;
  equity_aed: number;
  created_at: string;
}

// ─── Supply Chain ─────────────────────────────────────────────────────────────

export interface SimSKU {
  id: string;
  session_id: string;
  sku_code: string;
  name: string;
  category: string;
  brand: string;
  unit_cost_aed: number;
  selling_price_aed: number;
  min_order_qty: number;
  lead_time_weeks: number;
  shelf_life_months: number | null;
  cold_chain_required: boolean;
  is_active: boolean;
  created_at: string;
}

export interface SimInventory {
  id: string;
  session_id: string;
  sku_id: string;
  month: number;
  opening_qty: number;
  receipts_qty: number;
  sales_qty: number;
  wastage_qty: number;
  closing_qty: number;
  reorder_point: number;
  safety_stock: number;
  days_of_cover: number;
  stockout_occurred: boolean;
  created_at: string;
}

export interface SimSupplier {
  id: string;
  session_id: string;
  name: string;
  country: string;
  lead_time_weeks: number;
  payment_terms_days: number;
  reliability_score: number; // 0-100
  quality_score: number; // 0-100
  esg_score: number; // 0-100
  single_source_risk: boolean;
  annual_spend_aed: number;
  created_at: string;
}

export interface SimPurchaseOrder {
  id: string;
  session_id: string;
  supplier_id: string;
  sku_id: string;
  month_ordered: number;
  month_expected: number;
  qty_ordered: number;
  qty_received: number;
  unit_cost_aed: number;
  total_cost_aed: number;
  status: POStatus;
  delay_months: number;
  created_at: string;
}

// ─── S&OP Cycle ───────────────────────────────────────────────────────────────

export interface SimSOPCycle {
  id: string;
  session_id: string;
  month: number;
  status: SOPStatus;
  // Demand Plan (Faris)
  demand_forecast_units: number;
  demand_confidence: number; // 0-1
  demand_assumptions: string[];
  seasonality_applied: boolean;
  ramadan_adjustment: number;
  // Supply Plan (Omar)
  supply_plan_units: number;
  constrained_capacity: number;
  supplier_risks: string[];
  recommended_safety_stock: number;
  // Financial Reconciliation (Nadia)
  revenue_projection_aed: number;
  cogs_projection_aed: number;
  gross_profit_projection_aed: number;
  working_capital_impact_aed: number;
  // Approval
  approved_by: string | null;
  approved_at: string | null;
  overrides: SOPOverride[];
  // Agent Summaries
  agent_summaries: Record<AgentName, string>;
  created_at: string;
  updated_at: string;
}

export interface SOPOverride {
  field: string;
  original_value: number;
  override_value: number;
  reason: string;
  override_by: string;
  at: string;
}

// ─── Expansion Opportunities ──────────────────────────────────────────────────

export interface SimExpansionOpp {
  id: string;
  name: string;
  country: string;
  city: string | null;
  description: string;
  investment_aed: number;
  payback_months: number;
  revenue_upside_aed: number; // monthly when operational
  risk_level: 'low' | 'medium' | 'high';
  prerequisites: string[]; // KPI gates, e.g. "ebitda_margin > 0.15"
  available_from_month: number;
  category: string;
  gcc_context: string;
  due_diligence_memo_template: string;
}

export interface SimSessionExpansion {
  id: string;
  session_id: string;
  expansion_id: string;
  status: ExpansionStatus;
  initiated_month: number;
  completed_month: number | null;
  actual_investment_aed: number;
  board_memo: string | null; // generated by claude-opus (Mode D)
  approved_by: string | null;
  created_at: string;
  updated_at: string;
}

// ─── Org Chart ────────────────────────────────────────────────────────────────

export interface SimOrgChartNode {
  id: string;
  session_id: string;
  role_title: string;
  department: string;
  level: number; // 0 = CEO
  parent_id: string | null;
  is_vacant: boolean;
  headcount: number;
  avg_salary_aed: number;
  reporting_agent: AgentName | null;
  created_at: string;
}

// ─── Notifications ────────────────────────────────────────────────────────────

export interface Notification {
  id: string;
  org_id: string;
  user_id: string | null; // null = all org members
  session_id: string | null;
  type: NotificationType;
  priority: NotificationPriority;
  title: string;
  body: string;
  action_url: string | null;
  is_read: boolean;
  read_at: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

// ─── Leaderboard ─────────────────────────────────────────────────────────────

export interface LeaderboardEntry {
  id: string;
  session_id: string;
  org_id: string;
  org_name: string;
  scenario_id: string;
  scenario_name: string;
  game_mode: GameMode;
  difficulty: Difficulty;
  final_share_price: number;
  months_taken: number;
  win_achieved: boolean;
  player_names: string[];
  ghost: boolean; // pre-seeded entries for new users
  rank?: number; // computed on query
  created_at: string;
}

// ─── Billing ──────────────────────────────────────────────────────────────────

export interface CreditTransaction {
  id: string;
  org_id: string;
  type: 'purchase' | 'usage' | 'refund' | 'grant';
  amount: number; // positive = added, negative = consumed
  balance_after: number;
  description: string;
  session_id: string | null;
  stripe_payment_intent: string | null;
  created_at: string;
}

// ─── API Response Types ───────────────────────────────────────────────────────

export interface ApiResponse<T> {
  data: T | null;
  error: string | null;
  status: number;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  per_page: number;
  has_more: boolean;
}

// ─── Claude Mode Types ────────────────────────────────────────────────────────

/**
 * Mode A: Streaming advisor (Tariq) — haiku, streaming SSE
 * Mode B: Decision recs — haiku, JSON output, cached per decision
 * Mode C: S&OP narrative — haiku, structured sections
 * Mode D: Expansion memos — opus, long-form investment memo
 */
export type ClaudeMode = 'A' | 'B' | 'C' | 'D';

export interface ClaudeRequest {
  mode: ClaudeMode;
  sessionId: string;
  userId: string;
  orgId: string;
  context: ClaudeContext;
  streaming?: boolean;
}

export interface ClaudeContext {
  currentMonth: number;
  kpis: Partial<SimKPISnapshot>;
  gameState: Partial<SimGameState>;
  activeEvents: MarketEventSnapshot[];
  recentDecisions: Pick<SimDecision, 'title' | 'chosen_option_id' | 'decided_at'>[];
  scenario: Pick<SimScenario, 'game_mode' | 'difficulty' | 'name'>;
  userQuestion?: string; // Mode A
  decisionId?: string; // Mode B
  sopCycleId?: string; // Mode C
  expansionId?: string; // Mode D
}

export interface ClaudeUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  costUsd: number;
  model: string;
  mode: ClaudeMode;
  cached: boolean;
}

// ─── Agent Runner Types ───────────────────────────────────────────────────────

export interface AgentTickPayload {
  sessionId: string;
  month: number;
  triggerSource: 'qstash' | 'manual' | 'month_advance';
  agentsToRun: AgentName[];
}

export interface AgentTickResult {
  sessionId: string;
  month: number;
  agentResults: AgentRunResult[];
  totalCostUsd: number;
  totalTokens: number;
  durationMs: number;
}

export interface AgentRunResult {
  agentName: AgentName;
  success: boolean;
  activitiesCreated: number;
  recommendationsCreated: number;
  actionsExecuted: number;
  costUsd: number;
  error?: string;
}

// ─── Session Creation ─────────────────────────────────────────────────────────

export interface CreateSessionInput {
  teamId: string;
  scenarioId: string;
  playerCount?: number;
  customName?: string;
}

export interface CreateSessionResult {
  session: SimSession;
  initialKPIs: SimKPISnapshot;
  gameState: SimGameState;
  firstDecisions: SimDecision[];
}

// ─── Month Advance ────────────────────────────────────────────────────────────

export interface AdvanceMonthResult {
  previousMonth: number;
  newMonth: number;
  kpiSnapshot: SimKPISnapshot;
  sharePrice: SharePriceComponents;
  newEvents: SimActiveEvent[];
  expiredEvents: string[];
  agentSummaries: Partial<Record<AgentName, string>>;
  sopCycle: SimSOPCycle | null;
  nextDecisions: SimDecision[];
  winTriggered: boolean;
  lossTriggered: boolean;
  leaderboardUpdated: boolean;
}

// ─── GCC Mechanics ───────────────────────────────────────────────────────────

export interface GCCCalendar {
  month: number;
  year: number;
  isRamadan: boolean;
  ramadanWeek: number | null; // 1-4 or null
  isEid: boolean;
  isNationalDay: boolean; // UAE Dec 2-3 or KSA Sept 23
  isSummer: boolean; // Jun-Aug
  isHajSeason: boolean;
  commoditySeasonality: number; // 0.8-1.3 multiplier
  demandSeasonality: number; // 0.7-1.4 multiplier
}

export interface SaudizationRules {
  sectorQuota: number; // required % Saudi nationals (e.g. 0.35)
  currentPct: number;
  finePerViolation: number; // AED per month
  graceMonths: number;
  exemptions: string[];
}

export interface DFMDisclosureRequirement {
  type: 'material_event' | 'quarterly_results' | 'board_decision' | 'expansion';
  deadline_days: number; // from triggering event
  fine_aed: number; // if missed
  description: string;
  triggered_by: string;
}

// ─── Instructor / Demo Types ──────────────────────────────────────────────────

export interface InstructorOverride {
  type: 'inject_event' | 'set_kpi' | 'advance_month' | 'trigger_loss' | 'trigger_win';
  payload: Record<string, unknown>;
  instructor_user_id: string;
  reason: string;
}

export interface SessionReplay {
  session: SimSession;
  kpiHistory: SimKPISnapshot[];
  sharePriceHistory: SimSharePriceHistory[];
  decisions: SimDecision[];
  events: SimActiveEvent[];
  agentActivity: AgentActivityLog[];
  financials: SimFinancials[];
  sopCycles: SimSOPCycle[];
  totalPlayTimeMinutes: number;
  keyMoments: ReplayKeyMoment[];
}

export interface ReplayKeyMoment {
  month: number;
  type: 'big_decision' | 'price_spike' | 'price_crash' | 'event' | 'win' | 'loss';
  title: string;
  description: string;
  sharePriceBefore: number;
  sharePriceAfter: number;
}

// ─── Database Type (for Supabase generic typing) ─────────────────────────────

export type Tables = {
  organizations: Organization;
  organization_members: OrganizationMember;
  teams: Team;
  team_members: TeamMember;
  sim_scenarios: SimScenario;
  sim_sessions: SimSession;
  sim_kpi_snapshots: SimKPISnapshot;
  sim_share_price_history: SimSharePriceHistory;
  sim_game_state: SimGameState;
  sim_decisions: SimDecision;
  sim_market_events: SimMarketEvent;
  sim_active_events: SimActiveEvent;
  sim_agents: SimAgent;
  agent_activity_log: AgentActivityLog;
  agent_recommendations: AgentRecommendation;
  agent_actions: AgentAction;
  sim_financials: SimFinancials;
  sim_skus: SimSKU;
  sim_inventory: SimInventory;
  sim_suppliers: SimSupplier;
  sim_purchase_orders: SimPurchaseOrder;
  sim_sop_cycles: SimSOPCycle;
  sim_expansion_opps: SimExpansionOpp;
  sim_session_expansions: SimSessionExpansion;
  sim_org_chart: SimOrgChartNode;
  notifications: Notification;
  credit_transactions: CreditTransaction;
};
