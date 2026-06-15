/**
 * /app/simulator/[sessionId]/leaderboard/page.tsx
 *
 * Leaderboard RSC — shows top sessions by final share price for the same scenario.
 */

import { notFound, redirect } from 'next/navigation';
import { createSupabaseServer, requireAuth } from '@/lib/simulator/supabase';
import { Trophy, Medal, TrendingUp } from 'lucide-react';

export default async function LeaderboardPage({
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
    .select('id, scenario_id, sim_scenarios(name, game_mode)')
    .eq('id', sessionId)
    .single();

  if (!session) notFound();

  // Get leaderboard for this scenario
  const { data: entries } = await supabase
    .from('sim_leaderboard')
    .select(`
      *,
      sim_sessions (
        id,
        teams (name, organizations(name))
      )
    `)
    .eq('scenario_id', session.scenario_id)
    .order('final_share_price', { ascending: false })
    .limit(25);

  const leaderboard = entries ?? [];
  const myRank = leaderboard.findIndex((e) => e.session_id === sessionId) + 1;

  const MEDALS = ['🥇', '🥈', '🥉'];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Leaderboard</h1>
        <p className="text-slate-500 text-sm mt-0.5">
          {(session.sim_scenarios as any).name} •{' '}
          <span className="capitalize">{(session.sim_scenarios as any).game_mode}</span> Mode
        </p>
      </div>

      {myRank > 0 && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 flex items-center gap-3">
          <Trophy className="w-5 h-5 text-amber-400" />
          <div>
            <div className="text-sm font-semibold text-white">Your Position</div>
            <div className="text-amber-400 font-mono font-bold text-lg">
              #{myRank} of {leaderboard.length}
            </div>
          </div>
        </div>
      )}

      {leaderboard.length === 0 ? (
        <div className="rounded-xl border border-[#1e1e3a] bg-[#0d0d1a] p-12 text-center">
          <Trophy className="w-10 h-10 text-slate-700 mx-auto mb-3" />
          <p className="text-slate-500">No completed sessions yet.</p>
          <p className="text-slate-700 text-sm mt-1">
            Be the first to finish!
          </p>
        </div>
      ) : (
        <div className="rounded-xl border border-[#1e1e3a] bg-[#0d0d1a] overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-[#1e1e3a]">
                <th className="text-left text-xs text-slate-500 px-4 py-3 w-12">#</th>
                <th className="text-left text-xs text-slate-500 px-4 py-3">Team</th>
                <th className="text-right text-xs text-slate-500 px-4 py-3">Final Price</th>
                <th className="text-right text-xs text-slate-500 px-4 py-3 hidden md:table-cell">
                  EBITDA Margin
                </th>
                <th className="text-right text-xs text-slate-500 px-4 py-3 hidden md:table-cell">
                  Market Share
                </th>
                <th className="text-right text-xs text-slate-500 px-4 py-3">Outcome</th>
              </tr>
            </thead>
            <tbody>
              {leaderboard.map((entry, i) => {
                const isMe = entry.session_id === sessionId;
                const rank = i + 1;

                return (
                  <tr
                    key={entry.id}
                    className={`border-b border-[#1e1e3a] last:border-0 ${
                      isMe ? 'bg-amber-500/5' : 'hover:bg-slate-800/30'
                    } transition-colors`}
                  >
                    <td className="px-4 py-3">
                      <span className="text-sm font-bold">
                        {rank <= 3 ? MEDALS[rank - 1] : (
                          <span className="text-slate-500 font-mono">{rank}</span>
                        )}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-sm font-medium text-white">
                        {(entry.sim_sessions as any)?.teams?.name ?? 'Unknown Team'}
                        {isMe && (
                          <span className="ml-2 text-[10px] bg-amber-500/20 text-amber-400 px-1.5 py-0.5 rounded-full">
                            You
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-slate-600">
                        {(entry.sim_sessions as any)?.teams?.organizations?.name}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className="font-mono font-bold text-sm text-white">
                        AED {entry.final_share_price.toFixed(2)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right hidden md:table-cell">
                      <span className="font-mono text-sm text-slate-300">
                        {entry.final_ebitda_margin != null
                          ? `${(entry.final_ebitda_margin * 100).toFixed(1)}%`
                          : '—'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right hidden md:table-cell">
                      <span className="font-mono text-sm text-slate-300">
                        {entry.final_market_share != null
                          ? `${entry.final_market_share.toFixed(1)}%`
                          : '—'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span
                        className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                          entry.outcome === 'win'
                            ? 'bg-emerald-500/10 text-emerald-400'
                            : entry.outcome === 'loss'
                            ? 'bg-red-500/10 text-red-400'
                            : 'bg-blue-500/10 text-blue-400'
                        }`}
                      >
                        {entry.outcome?.toUpperCase() ?? 'IN PROGRESS'}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
