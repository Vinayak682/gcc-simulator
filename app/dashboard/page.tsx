/**
 * /app/dashboard/page.tsx
 *
 * Dashboard RSC — lists the user's active simulation sessions.
 * Auto-seeds org + team if the user has none (handles login without email confirm).
 */

import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createSupabaseServer, requireAuth, createSupabaseAdmin } from '@/lib/simulator/supabase';
import { Plus, Play, Trophy, ArrowRight } from 'lucide-react';

async function seedOrgForUser(userId: string, email: string) {
  const admin = createSupabaseAdmin();
  const orgName = email.split('@')[0] || 'My Team';
  const slug =
    orgName.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').slice(0, 50) +
    '-' +
    Math.random().toString(36).slice(2, 6);

  const { data: org } = await admin
    .from('organizations')
    .insert({ name: orgName, slug, plan: 'free', agent_ops_limit: 20, seats_limit: 1 })
    .select('id')
    .single();

  if (!org) return null;

  await admin.from('organization_members').insert({
    org_id: org.id, user_id: userId, role: 'owner', status: 'active',
  });

  const { data: team } = await admin
    .from('teams')
    .insert({ org_id: org.id, name: `${orgName} — Command`, created_by: userId, is_competitive: false })
    .select('id')
    .single();

  if (!team) return null;

  await admin.from('team_members').insert({ team_id: team.id, user_id: userId, sim_role: 'ceo' });

  return team.id;
}

export default async function DashboardPage() {
  const supabase = createSupabaseServer();

  let authSession;
  try {
    authSession = await requireAuth();
  } catch {
    redirect('/auth/login');
  }

  const userId = authSession.user.id;
  const userEmail = authSession.user.email ?? '';

  // Get teams the user belongs to
  const { data: memberships } = await supabase
    .from('team_members')
    .select(`
      sim_role,
      teams (
        id,
        name,
        org_id,
        organizations (name, credits_remaining, subscription_tier),
        sim_sessions (
          id,
          status,
          current_month,
          total_months,
          created_at,
          sim_scenarios (name, game_mode, difficulty, initial_share_price, win_target_price)
        )
      )
    `)
    .eq('user_id', userId);

  let teams = ((memberships ?? []).map((m: any) => m.teams).filter(Boolean)) as any[];

  // Auto-seed if user has no team (e.g. signed in via login without going through signup flow)
  if (teams.length === 0) {
    await seedOrgForUser(userId, userEmail);
    // Re-query after seeding
    const { data: refreshed } = await supabase
      .from('team_members')
      .select(`
        sim_role,
        teams (
          id,
          name,
          org_id,
          organizations (name, credits_remaining, subscription_tier),
          sim_sessions (
            id,
            status,
            current_month,
            total_months,
            created_at,
            sim_scenarios (name, game_mode, difficulty, initial_share_price, win_target_price)
          )
        )
      `)
      .eq('user_id', userId);
    teams = ((refreshed ?? []).map((m: any) => m.teams).filter(Boolean)) as any[];
  }

  // Flatten all sessions
  const allSessions = teams.flatMap((team: any) =>
    (team.sim_sessions ?? []).map((s: any) => ({
      ...s,
      teamName: team.name,
      orgName: team.organizations?.name,
      teamId: team.id,
    }))
  );

  const activeSessions = allSessions.filter((s: any) => s.status === 'active');
  const completedSessions = allSessions.filter((s: any) =>
    ['won', 'lost', 'completed'].includes(s.status)
  );

  const org = teams[0]?.organizations as any;
  const primaryTeamId = teams[0]?.id;

  return (
    <div className="min-h-screen bg-[#08080f] text-white">
      {/* Nav */}
      <nav className="fixed top-0 left-0 right-0 z-50 h-16 bg-[#08080f]/80 backdrop-blur border-b border-[#1e1e3a] flex items-center justify-between px-6">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-500 to-amber-600 flex items-center justify-center font-bold text-black text-sm">
            AL
          </div>
          <span className="font-semibold text-white">Al Manar Industries</span>
        </div>
        <div className="flex items-center gap-4 text-sm text-slate-400">
          {org && (
            <span>
              Credits:{' '}
              <span className="text-amber-400 font-mono font-bold">
                {org.credits_remaining?.toLocaleString() ?? 0}
              </span>
            </span>
          )}
          <span className="capitalize text-slate-600">{org?.subscription_tier ?? 'Free'}</span>
        </div>
      </nav>

      <div className="pt-24 pb-16 px-6 max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-white">Your Simulations</h1>
            <p className="text-slate-500 text-sm mt-0.5">
              {activeSessions.length} active • {completedSessions.length} completed
            </p>
          </div>

          {primaryTeamId && (
            <Link
              href={`/sessions/new?teamId=${primaryTeamId}`}
              className="flex items-center gap-2 bg-amber-500 hover:bg-amber-400 text-black font-semibold px-4 py-2.5 rounded-lg transition-colors text-sm"
            >
              <Plus className="w-4 h-4" />
              New Simulation
            </Link>
          )}
        </div>

        {/* Active Sessions */}
        {activeSessions.length > 0 && (
          <section className="mb-8">
            <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-2">
              <Play className="w-4 h-4 text-emerald-400" />
              Active Simulations
            </h2>
            <div className="grid gap-3">
              {activeSessions.map((session: any) => (
                <SessionCard key={session.id} session={session} />
              ))}
            </div>
          </section>
        )}

        {/* Empty state */}
        {allSessions.length === 0 && primaryTeamId && (
          <div className="rounded-xl border border-[#1e1e3a] bg-[#0d0d1a] p-16 text-center">
            <div className="w-16 h-16 rounded-2xl bg-amber-500/10 flex items-center justify-center mx-auto mb-4">
              <Play className="w-8 h-8 text-amber-400" />
            </div>
            <h2 className="text-xl font-bold text-white mb-2">Start Your First Simulation</h2>
            <p className="text-slate-500 mb-6 max-w-sm mx-auto">
              Choose a scenario and step into the boardroom as MD/CEO of Al Manar Industries.
            </p>
            <Link
              href={`/sessions/new?teamId=${primaryTeamId}`}
              className="inline-flex items-center gap-2 bg-amber-500 hover:bg-amber-400 text-black font-bold px-6 py-3 rounded-xl transition-colors"
            >
              <Plus className="w-4 h-4" />
              Launch Simulation
            </Link>
          </div>
        )}

        {/* Completed Sessions */}
        {completedSessions.length > 0 && (
          <section>
            <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-2">
              <Trophy className="w-4 h-4 text-amber-400" />
              Completed
            </h2>
            <div className="grid gap-3">
              {completedSessions.map((session: any) => (
                <SessionCard key={session.id} session={session} completed />
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

function SessionCard({ session, completed = false }: { session: any; completed?: boolean }) {
  const scenario = session.sim_scenarios;
  const progress = Math.round((session.current_month / session.total_months) * 100);

  return (
    <Link
      href={`/simulator/${session.id}/overview`}
      className="block rounded-xl border border-[#1e1e3a] bg-[#0d0d1a] p-5 hover:border-[#2a2a5a] transition-all group"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1.5">
            <h3 className="font-semibold text-white truncate">{scenario?.name}</h3>
            <span
              className={`text-[10px] font-bold capitalize px-2 py-0.5 rounded-full ${
                session.status === 'active'
                  ? 'bg-emerald-500/10 text-emerald-400'
                  : session.status === 'won'
                  ? 'bg-amber-500/10 text-amber-400'
                  : 'bg-red-500/10 text-red-400'
              }`}
            >
              {session.status}
            </span>
          </div>

          <div className="flex items-center gap-3 text-xs text-slate-500 mb-3">
            <span>{session.teamName}</span>
            <span>•</span>
            <span className="capitalize">{scenario?.game_mode?.replace('_', ' ')}</span>
            <span>•</span>
            <span className="capitalize">{scenario?.difficulty}</span>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex-1 h-1.5 bg-slate-800 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${
                  session.status === 'won' ? 'bg-amber-500' : 'bg-amber-500'
                }`}
                style={{ width: `${progress}%` }}
              />
            </div>
            <span className="text-xs font-mono text-slate-500 flex-shrink-0">
              Month {session.current_month}/{session.total_months}
            </span>
          </div>
        </div>

        <ArrowRight className="w-4 h-4 text-slate-600 group-hover:text-white transition-colors flex-shrink-0 mt-1" />
      </div>
    </Link>
  );
}
