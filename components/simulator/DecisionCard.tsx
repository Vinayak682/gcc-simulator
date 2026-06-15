'use client';

/**
 * DecisionCard — The core interaction element of the simulator.
 *
 * Front face: Decision title, category badge, context, agent recommendation dots.
 * Back face (card flip on click): All 3 options with KPI impact visualization.
 *
 * Uses Framer Motion card-flip animation (Y-axis 180° rotation).
 * Submits via /api/sessions/[id]/decisions/[decisionId] PATCH.
 */

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Briefcase,
  TrendingUp,
  AlertTriangle,
  ChevronRight,
  CheckCircle2,
  Users,
  ShoppingCart,
  DollarSign,
  Globe,
  Shield,
  Loader2,
} from 'lucide-react';
import type { SimDecision, DecisionOption, AgentName } from '@/lib/simulator/types';

const CATEGORY_CONFIG = {
  pricing: { icon: DollarSign, color: 'text-amber-400', bg: 'bg-amber-400/10', label: 'Pricing' },
  supply_chain: { icon: ShoppingCart, color: 'text-blue-400', bg: 'bg-blue-400/10', label: 'Supply Chain' },
  marketing: { icon: TrendingUp, color: 'text-purple-400', bg: 'bg-purple-400/10', label: 'Marketing' },
  hr: { icon: Users, color: 'text-pink-400', bg: 'bg-pink-400/10', label: 'People' },
  finance: { icon: DollarSign, color: 'text-emerald-400', bg: 'bg-emerald-400/10', label: 'Finance' },
  expansion: { icon: Globe, color: 'text-cyan-400', bg: 'bg-cyan-400/10', label: 'Expansion' },
  risk: { icon: Shield, color: 'text-red-400', bg: 'bg-red-400/10', label: 'Risk' },
  governance: { icon: Briefcase, color: 'text-slate-400', bg: 'bg-slate-400/10', label: 'Governance' },
} as const;

const AGENT_COLORS: Record<AgentName, string> = {
  tariq: '#f59e0b',
  zara: '#a78bfa',
  omar: '#34d399',
  nadia: '#60a5fa',
  faris: '#fb923c',
  leila: '#f472b6',
  priya: '#f87171',
  board: '#94a3b8',
};

interface DecisionCardProps {
  decision: SimDecision;
  sessionId: string;
  onDecided: (decisionId: string, optionId: string) => void;
  agentRecommendations?: { agentName: AgentName; optionId: string }[];
}

export function DecisionCard({
  decision,
  sessionId,
  onDecided,
  agentRecommendations = [],
}: DecisionCardProps) {
  const [isFlipped, setIsFlipped] = useState(false);
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [decided, setDecided] = useState(decision.status === 'decided');
  const [chosenOption, setChosenOption] = useState(decision.chosen_option_id);

  const catConfig = CATEGORY_CONFIG[decision.category] ?? CATEGORY_CONFIG.governance;
  const CatIcon = catConfig.icon;

  const handleSubmit = async (optionId: string) => {
    if (submitting || decided) return;
    setSubmitting(true);

    try {
      const res = await fetch(
        `/api/sessions/${sessionId}/decisions/${decision.id}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ optionId }),
        }
      );

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? 'Failed to submit decision');
      }

      setDecided(true);
      setChosenOption(optionId);
      onDecided(decision.id, optionId);
    } catch (err) {
      console.error('Decision submit error:', err);
      setSubmitting(false);
    }
  };

  return (
    <div
      className="relative w-full"
      style={{ perspective: '1000px', minHeight: isFlipped ? '420px' : '200px' }}
    >
      <motion.div
        className="relative w-full"
        style={{ transformStyle: 'preserve-3d' }}
        animate={{ rotateY: isFlipped ? 180 : 0 }}
        transition={{ duration: 0.5, ease: [0.23, 1, 0.32, 1] }}
      >
        {/* ── FRONT FACE ─────────────────────────────────────────────────── */}
        <div
          className="absolute inset-0 w-full"
          style={{ backfaceVisibility: 'hidden' }}
        >
          <div
            className={`rounded-xl border transition-all ${
              decided
                ? 'border-emerald-500/30 bg-emerald-500/5'
                : 'border-[#1e1e3a] bg-[#0f0f1a] hover:border-[#2a2a5a] cursor-pointer'
            } p-5`}
            onClick={() => !decided && !isFlipped && setIsFlipped(true)}
          >
            {/* Header row */}
            <div className="flex items-start justify-between gap-3 mb-3">
              <div className="flex items-center gap-2">
                <div className={`p-1.5 rounded-lg ${catConfig.bg}`}>
                  <CatIcon className={`w-3.5 h-3.5 ${catConfig.color}`} />
                </div>
                <span className={`text-xs font-medium ${catConfig.color}`}>
                  {catConfig.label}
                </span>
              </div>

              {/* Agent recommendation dots */}
              {agentRecommendations.length > 0 && (
                <div className="flex items-center gap-1">
                  <span className="text-xs text-slate-600 mr-1">AI:</span>
                  {agentRecommendations.map(({ agentName }) => (
                    <div
                      key={agentName}
                      className="w-2 h-2 rounded-full"
                      style={{ backgroundColor: AGENT_COLORS[agentName] }}
                      title={`${agentName} has a recommendation`}
                    />
                  ))}
                </div>
              )}

              {decided && (
                <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
              )}
            </div>

            {/* Title */}
            <h3 className={`font-semibold mb-1.5 ${decided ? 'text-slate-400' : 'text-white'}`}>
              {decision.title}
            </h3>
            <p className="text-sm text-slate-500 line-clamp-2">{decision.description}</p>

            {/* GCC context if present */}
            {!decided && (
              <div className="mt-3 flex items-center justify-between">
                <div className="text-xs text-slate-600">
                  {(decision.options as DecisionOption[]).length} options available
                </div>
                <div className="flex items-center gap-1 text-xs text-amber-400">
                  <span>Review options</span>
                  <ChevronRight className="w-3 h-3" />
                </div>
              </div>
            )}

            {decided && chosenOption && (
              <div className="mt-3 text-xs text-emerald-400 font-medium">
                ✓ Option {chosenOption} selected
              </div>
            )}
          </div>
        </div>

        {/* ── BACK FACE ──────────────────────────────────────────────────── */}
        <div
          className="w-full"
          style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}
        >
          <div className="rounded-xl border border-[#1e1e3a] bg-[#0d0d1a] p-5">
            {/* Back header */}
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-white font-semibold text-sm">{decision.title}</h3>
              <button
                onClick={() => setIsFlipped(false)}
                className="text-xs text-slate-500 hover:text-slate-300 transition-colors"
              >
                ← Back
              </button>
            </div>

            {/* Options */}
            <div className="space-y-3">
              {(decision.options as DecisionOption[]).map((option) => {
                const agentRecs = agentRecommendations.filter(
                  (r) => r.optionId === option.id
                );
                const isChosen = chosenOption === option.id;
                const isSelected = selectedOption === option.id;

                return (
                  <motion.div
                    key={option.id}
                    initial={{ opacity: 0, x: 10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.1 }}
                    className={`rounded-lg border p-4 cursor-pointer transition-all ${
                      isChosen
                        ? 'border-emerald-500/50 bg-emerald-500/5'
                        : isSelected
                        ? 'border-amber-500/50 bg-amber-500/5'
                        : 'border-[#1e1e3a] hover:border-[#2a2a5a]'
                    }`}
                    onClick={() =>
                      !decided && !submitting && setSelectedOption(option.id)
                    }
                  >
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="flex items-center gap-2">
                        {/* Option letter badge */}
                        <div
                          className={`w-6 h-6 rounded-md flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                            isChosen
                              ? 'bg-emerald-500 text-white'
                              : isSelected
                              ? 'bg-amber-500 text-black'
                              : 'bg-slate-800 text-slate-400'
                          }`}
                        >
                          {option.id}
                        </div>
                        <span
                          className={`font-medium text-sm ${
                            isChosen ? 'text-emerald-300' : 'text-white'
                          }`}
                        >
                          {option.label}
                        </span>
                      </div>

                      {/* Agent recommendation dots for this option */}
                      {agentRecs.length > 0 && (
                        <div className="flex items-center gap-1 flex-shrink-0">
                          {agentRecs.map(({ agentName }) => (
                            <div
                              key={agentName}
                              className="w-2 h-2 rounded-full"
                              style={{ backgroundColor: AGENT_COLORS[agentName] }}
                              title={`${agentName} recommends this`}
                            />
                          ))}
                        </div>
                      )}
                    </div>

                    <p className="text-xs text-slate-400 mb-3">{option.description}</p>

                    {/* KPI impact preview */}
                    <div className="grid grid-cols-3 gap-2">
                      <KPIImpactBadge
                        label="Revenue"
                        value={option.projected_kpi_impact.revenue_pct * 100}
                        format="pct"
                      />
                      <KPIImpactBadge
                        label="Margin"
                        value={option.projected_kpi_impact.margin_delta * 100}
                        format="pp"
                      />
                      <KPIImpactBadge
                        label="Share Px"
                        value={option.projected_kpi_impact.share_price_delta_pct * 100}
                        format="pct"
                      />
                    </div>

                    {/* Risk badge */}
                    <div className="mt-2 flex items-center gap-2">
                      <span
                        className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                          option.risk_level === 'high'
                            ? 'bg-red-500/10 text-red-400'
                            : option.risk_level === 'medium'
                            ? 'bg-amber-500/10 text-amber-400'
                            : 'bg-emerald-500/10 text-emerald-400'
                        }`}
                      >
                        {option.risk_level.toUpperCase()} RISK
                      </span>
                      {option.gcc_context && (
                        <span className="text-[10px] text-amber-400 truncate">
                          🌙 {option.gcc_context}
                        </span>
                      )}
                    </div>
                  </motion.div>
                );
              })}
            </div>

            {/* Confirm button */}
            {!decided && (
              <div className="mt-4">
                <button
                  disabled={!selectedOption || submitting}
                  onClick={() => selectedOption && handleSubmit(selectedOption)}
                  className={`w-full py-2.5 rounded-lg font-semibold text-sm transition-all ${
                    selectedOption && !submitting
                      ? 'bg-amber-500 hover:bg-amber-400 text-black'
                      : 'bg-slate-800 text-slate-600 cursor-not-allowed'
                  }`}
                >
                  {submitting ? (
                    <span className="flex items-center justify-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Applying decision...
                    </span>
                  ) : selectedOption ? (
                    `Confirm Option ${selectedOption}`
                  ) : (
                    'Select an option above'
                  )}
                </button>
              </div>
            )}
          </div>
        </div>
      </motion.div>
    </div>
  );
}

function KPIImpactBadge({
  label,
  value,
  format,
}: {
  label: string;
  value: number;
  format: 'pct' | 'pp';
}) {
  const isPositive = value > 0.01;
  const isNegative = value < -0.01;
  const formattedValue = `${isPositive ? '+' : ''}${value.toFixed(1)}${format === 'pct' ? '%' : 'pp'}`;

  return (
    <div className="text-center">
      <div className="text-[10px] text-slate-600 mb-0.5">{label}</div>
      <div
        className={`text-xs font-mono font-bold ${
          isPositive ? 'text-emerald-400' : isNegative ? 'text-red-400' : 'text-slate-500'
        }`}
      >
        {formattedValue}
      </div>
    </div>
  );
}
