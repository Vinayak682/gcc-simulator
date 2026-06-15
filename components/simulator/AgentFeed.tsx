'use client';

/**
 * AgentFeed — Real-time agent activity stream.
 *
 * Subscribes to agent_activity_log via Supabase Realtime.
 * Shows: agent avatar, level badge, title, summary, timestamp.
 * Activity types: analysis, recommendation, action_taken, observation, alert.
 * Autonomy level badge: L1 Inform (slate), L2 Recommend (amber), L3 Act (emerald).
 */

import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle, Zap, Eye, CheckCircle, MessageSquare } from 'lucide-react';
import { subscribeToAgentFeed } from '@/lib/simulator/supabase.client';
import type { AgentActivityLog, AgentName } from '@/lib/simulator/types';

const AGENT_CONFIG: Record<
  AgentName,
  { name: string; color: string; bg: string; initial: string }
> = {
  tariq: { name: 'Tariq', color: 'text-amber-400', bg: 'bg-amber-400/10', initial: 'T' },
  zara: { name: 'Zara', color: 'text-purple-400', bg: 'bg-purple-400/10', initial: 'Z' },
  omar: { name: 'Omar', color: 'text-emerald-400', bg: 'bg-emerald-400/10', initial: 'O' },
  nadia: { name: 'Nadia', color: 'text-blue-400', bg: 'bg-blue-400/10', initial: 'N' },
  faris: { name: 'Faris', color: 'text-orange-400', bg: 'bg-orange-400/10', initial: 'F' },
  leila: { name: 'Leila', color: 'text-pink-400', bg: 'bg-pink-400/10', initial: 'L' },
  priya: { name: 'Priya', color: 'text-red-400', bg: 'bg-red-400/10', initial: 'P' },
  board: { name: 'Board', color: 'text-slate-400', bg: 'bg-slate-400/10', initial: 'B' },
};

const ACTIVITY_ICONS = {
  analysis: MessageSquare,
  recommendation: Zap,
  action_taken: CheckCircle,
  observation: Eye,
  alert: AlertTriangle,
};

const ACTIVITY_COLORS = {
  analysis: 'text-blue-400',
  recommendation: 'text-amber-400',
  action_taken: 'text-emerald-400',
  observation: 'text-slate-400',
  alert: 'text-red-400',
};

const LEVEL_CONFIG = {
  1: { label: 'L1', color: 'text-slate-400', bg: 'bg-slate-400/10', desc: 'Inform' },
  2: { label: 'L2', color: 'text-amber-400', bg: 'bg-amber-400/10', desc: 'Recommend' },
  3: { label: 'L3', color: 'text-emerald-400', bg: 'bg-emerald-400/10', desc: 'Act' },
};

function timeAgo(isoStr: string): string {
  const diff = Date.now() - new Date(isoStr).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  return `${Math.floor(m / 60)}h ago`;
}

interface AgentFeedProps {
  sessionId: string;
  initialActivities: AgentActivityLog[];
  maxItems?: number;
}

export function AgentFeed({
  sessionId,
  initialActivities,
  maxItems = 50,
}: AgentFeedProps) {
  const [activities, setActivities] = useState<AgentActivityLog[]>(
    [...initialActivities].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    )
  );
  const [filter, setFilter] = useState<AgentName | 'all'>('all');
  const feedRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const unsub = subscribeToAgentFeed(sessionId, (activity: AgentActivityLog) => {
      setActivities((prev) => [activity, ...prev].slice(0, maxItems));
    });
    return unsub;
  }, [sessionId, maxItems]);

  const filtered =
    filter === 'all'
      ? activities
      : activities.filter((a) => a.agent_name === filter);

  return (
    <div className="flex flex-col h-full">
      {/* Filter tabs */}
      <div className="flex gap-1 flex-wrap mb-3 flex-shrink-0">
        <FilterChip
          label="All"
          active={filter === 'all'}
          onClick={() => setFilter('all')}
        />
        {(Object.keys(AGENT_CONFIG) as AgentName[]).map((name) => (
          <FilterChip
            key={name}
            label={AGENT_CONFIG[name].initial}
            active={filter === name}
            onClick={() => setFilter(filter === name ? 'all' : name)}
            color={AGENT_CONFIG[name].color}
            title={AGENT_CONFIG[name].name}
          />
        ))}
      </div>

      {/* Feed */}
      <div
        ref={feedRef}
        className="flex-1 overflow-y-auto space-y-2 pr-1 scrollbar-thin scrollbar-thumb-slate-800"
      >
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="w-10 h-10 rounded-full bg-slate-800 flex items-center justify-center mb-3">
              <Eye className="w-5 h-5 text-slate-600" />
            </div>
            <p className="text-slate-600 text-sm">
              {filter === 'all'
                ? 'Agents are standing by...'
                : `No activity from ${AGENT_CONFIG[filter as AgentName]?.name} yet`}
            </p>
          </div>
        ) : (
          <AnimatePresence initial={false}>
            {filtered.map((activity) => (
              <ActivityItem key={activity.id} activity={activity} />
            ))}
          </AnimatePresence>
        )}
      </div>
    </div>
  );
}

function ActivityItem({ activity }: { activity: AgentActivityLog }) {
  const [expanded, setExpanded] = useState(false);
  const agent = AGENT_CONFIG[activity.agent_name as AgentName];
  const ActivityIcon =
    ACTIVITY_ICONS[activity.activity_type as keyof typeof ACTIVITY_ICONS] ?? Eye;
  const activityColor =
    ACTIVITY_COLORS[activity.activity_type as keyof typeof ACTIVITY_COLORS] ?? 'text-slate-400';
  const levelCfg = LEVEL_CONFIG[activity.autonomy_level as 1 | 2 | 3] ?? LEVEL_CONFIG[1];

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="rounded-lg border border-[#1e1e3a] bg-[#0d0d1a] p-3 cursor-pointer hover:border-[#2a2a5a] transition-colors"
      onClick={() => activity.full_content && setExpanded(!expanded)}
    >
      <div className="flex items-start gap-3">
        {/* Agent avatar */}
        <div
          className={`w-7 h-7 rounded-lg ${agent?.bg ?? 'bg-slate-800'} flex items-center justify-center text-xs font-bold flex-shrink-0 ${agent?.color ?? 'text-slate-400'}`}
        >
          {agent?.initial ?? '?'}
        </div>

        <div className="flex-1 min-w-0">
          {/* Row 1: name + activity type + level + time */}
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className={`text-xs font-semibold ${agent?.color ?? 'text-slate-400'}`}>
              {agent?.name ?? activity.agent_name}
            </span>

            <div className="flex items-center gap-1">
              <ActivityIcon className={`w-3 h-3 ${activityColor}`} />
              <span className={`text-[10px] ${activityColor} capitalize`}>
                {activity.activity_type.replace('_', ' ')}
              </span>
            </div>

            {activity.autonomy_level && (
              <span
                className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${levelCfg.bg} ${levelCfg.color}`}
              >
                {levelCfg.label}
              </span>
            )}

            <span className="text-[10px] text-slate-600 ml-auto">
              {timeAgo(activity.created_at)}
            </span>
          </div>

          {/* Title */}
          <div className="text-xs font-medium text-white mb-0.5 truncate">
            {activity.title}
          </div>

          {/* Summary */}
          <div className={`text-xs text-slate-500 ${expanded ? '' : 'line-clamp-2'}`}>
            {activity.summary}
          </div>

          {/* Expanded full content */}
          <AnimatePresence>
            {expanded && activity.full_content && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="mt-2 text-xs text-slate-400 border-t border-[#1e1e3a] pt-2 whitespace-pre-wrap"
              >
                {activity.full_content}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Month badge */}
          <div className="mt-1 text-[10px] text-slate-600">Month {activity.month}</div>
        </div>
      </div>
    </motion.div>
  );
}

function FilterChip({
  label,
  active,
  onClick,
  color,
  title,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  color?: string;
  title?: string;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`px-2 py-1 rounded-md text-xs font-medium transition-all ${
        active
          ? `bg-amber-500/20 text-amber-400 border border-amber-500/30`
          : 'bg-slate-800 text-slate-500 border border-transparent hover:text-slate-300'
      }`}
    >
      {label}
    </button>
  );
}
