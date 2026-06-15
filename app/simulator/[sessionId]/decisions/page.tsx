/**
 * /app/simulator/[sessionId]/decisions/page.tsx
 *
 * Decisions page — all months' decisions with filter by status.
 * Current month decisions listed first, previous months collapsed.
 */

import { redirect, notFound } from 'next/navigation';
import { createSupabaseServer, requireAuth } from '@/lib/simulator/supabase';
import { DecisionCard } from '@/components/simulator/DecisionCard';
import { CheckCircle2, Clock, List } from 'lucide-react';

export default async function DecisionsPage({
  params,
}: {
  params: { sessionId: string };
}) {
  const supabase = createSupabaseServer();

  try {
    await requireAuth();
  } catch {
    redirect('/auth/login');
  }

  const { sessionId } = params;

  const { data: session } = await supabase
    .from('sim_sessions')
    .select('id, current_month, total_months, status')
    .eq('id', sessionId)
    .single();

  if (!session) notFound();

  // Load all decisions across all months
  const { data: allDecisions } = await supabase
    .from('sim_decisions')
    .select('*')
    .eq('session_id', sessionId)
    .order('month', { ascending: false })
    .order('created_at', { ascending: true });

  const decisions = allDecisions ?? [];
  const pending = decisions.filter((d) => d.status === 'pending' && d.month === session.current_month);
  const decided = decisions.filter((d) => d.status === 'decided');
  const expiredOrSkipped = decisions.filter(
    (d) => d.status === 'skipped' || (d.status === 'pending' && d.month < session.current_month)
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Decisions</h1>
        <p className="text-slate-500 text-sm mt-0.5">
          {pending.length} pending • {decided.length} decided • Month {session.current_month}
        </p>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-3">
        <StatCard
          icon={Clock}
          label="Pending"
          value={pending.length}
          color="text-amber-400"
          bg="bg-amber-400/10"
        />
        <StatCard
          icon={CheckCircle2}
          label="Decided"
          value={decided.length}
          color="text-emerald-400"
          bg="bg-emerald-400/10"
        />
        <StatCard
          icon={List}
          label="Total"
          value={decisions.length}
          color="text-slate-400"
          bg="bg-slate-400/10"
        />
      </div>

      {/* Current month pending */}
      {pending.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-amber-400 mb-3 flex items-center gap-2">
            <Clock className="w-4 h-4" />
            Month {session.current_month} — Awaiting Decision
          </h2>
          <div className="space-y-3">
            {pending.map((d) => (
              <DecisionCard key={d.id} decision={d} sessionId={sessionId} onDecided={() => {}} />
            ))}
          </div>
        </section>
      )}

      {/* Decided decisions */}
      {decided.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-slate-400 mb-3 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            Decided
          </h2>
          <div className="space-y-3">
            {decided.map((d) => (
              <DecisionCard key={d.id} decision={d} sessionId={sessionId} onDecided={() => {}} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  color,
  bg,
}: {
  icon: React.ElementType;
  label: string;
  value: number;
  color: string;
  bg: string;
}) {
  return (
    <div className="rounded-xl border border-[#1e1e3a] bg-[#0d0d1a] p-4 flex items-center gap-3">
      <div className={`p-2 rounded-lg ${bg}`}>
        <Icon className={`w-4 h-4 ${color}`} />
      </div>
      <div>
        <div className={`text-xl font-bold font-mono ${color}`}>{value}</div>
        <div className="text-xs text-slate-500">{label}</div>
      </div>
    </div>
  );
}
