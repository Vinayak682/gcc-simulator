/**
 * Al Manar Industries — GCC Business Simulator
 * Supabase Browser Client + Realtime Subscriptions
 *
 * Use ONLY in Client Components ('use client').
 * For server-side queries use lib/simulator/supabase.ts.
 */

'use client';

import { createBrowserClient as _createBrowserClient } from '@supabase/ssr';
import type { RealtimeChannel } from '@supabase/supabase-js';
import type {
  SimSharePriceHistory,
  SimGameState,
  AgentActivityLog,
  AgentRecommendation,
  Notification,
} from './types';

// ─── Singleton Browser Client ─────────────────────────────────────────────────

let _client: ReturnType<typeof _createBrowserClient> | null = null;

export function getSupabaseClient() {
  if (!_client) {
    _client = _createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
  }
  return _client;
}

/** Factory wrapper — matches the name imported by login/signup pages */
export function createBrowserClient() {
  return getSupabaseClient();
}

// ─── Realtime: Share Price Ticker ─────────────────────────────────────────────

/**
 * Subscribe to live share price updates for a session.
 * Used in SimulatorHeader for the ticker widget.
 *
 * @returns cleanup function to call on unmount
 */
export function subscribeToSharePrice(
  sessionId: string,
  onUpdate: (entry: SimSharePriceHistory) => void
): () => void {
  const supabase = getSupabaseClient();

  const channel: RealtimeChannel = supabase
    .channel(`share_price:${sessionId}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'sim_share_price_history',
        filter: `session_id=eq.${sessionId}`,
      },
      (payload) => {
        onUpdate(payload.new as SimSharePriceHistory);
      }
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}

// ─── Realtime: Game State ─────────────────────────────────────────────────────

/**
 * Subscribe to game state changes (month advance, phase transitions).
 * Used to sync multi-player sessions.
 */
export function subscribeToGameState(
  sessionId: string,
  onUpdate: (state: SimGameState) => void
): () => void {
  const supabase = getSupabaseClient();

  const channel: RealtimeChannel = supabase
    .channel(`game_state:${sessionId}`)
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'sim_game_state',
        filter: `session_id=eq.${sessionId}`,
      },
      (payload) => {
        onUpdate(payload.new as SimGameState);
      }
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}

// ─── Realtime: Agent Activity Feed ───────────────────────────────────────────

/**
 * Subscribe to new agent activity entries.
 * Used in AgentFeed component to show live agent updates.
 */
export function subscribeToAgentFeed(
  sessionId: string,
  onActivity: (activity: AgentActivityLog) => void
): () => void {
  const supabase = getSupabaseClient();

  const channel: RealtimeChannel = supabase
    .channel(`agent_feed:${sessionId}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'agent_activity_log',
        filter: `session_id=eq.${sessionId}`,
      },
      (payload) => {
        onActivity(payload.new as AgentActivityLog);
      }
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}

// ─── Realtime: Agent Recommendations ─────────────────────────────────────────

/**
 * Subscribe to new/updated agent recommendations.
 * Shows as notification dots on decision cards.
 */
export function subscribeToRecommendations(
  sessionId: string,
  onRecommendation: (rec: AgentRecommendation) => void
): () => void {
  const supabase = getSupabaseClient();

  const channel: RealtimeChannel = supabase
    .channel(`recommendations:${sessionId}`)
    .on(
      'postgres_changes',
      {
        event: '*', // INSERT and UPDATE
        schema: 'public',
        table: 'agent_recommendations',
        filter: `session_id=eq.${sessionId}`,
      },
      (payload) => {
        onRecommendation(payload.new as AgentRecommendation);
      }
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}

// ─── Realtime: Notifications ──────────────────────────────────────────────────

/**
 * Subscribe to user notifications (win/loss, market events, agent alerts).
 */
export function subscribeToNotifications(
  userId: string,
  onNotification: (notification: Notification) => void
): () => void {
  const supabase = getSupabaseClient();

  const channel: RealtimeChannel = supabase
    .channel(`notifications:${userId}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'notifications',
        filter: `user_id=eq.${userId}`,
      },
      (payload) => {
        onNotification(payload.new as Notification);
      }
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}

// ─── Composite Hook Data Fetchers (client-side only) ─────────────────────────

/** Fetch the last N share price points for chart rendering */
export async function fetchSharePriceHistory(
  sessionId: string,
  limit = 60
): Promise<SimSharePriceHistory[]> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('sim_share_price_history')
    .select('*')
    .eq('session_id', sessionId)
    .order('recorded_at', { ascending: true })
    .limit(limit);

  if (error) throw error;
  return (data ?? []) as SimSharePriceHistory[];
}

/** Mark a notification as read */
export async function markNotificationRead(notificationId: string): Promise<void> {
  const supabase = getSupabaseClient();
  await supabase
    .from('notifications')
    .update({ is_read: true, read_at: new Date().toISOString() })
    .eq('id', notificationId);
}

/** Get current auth user on client */
export async function getClientUser() {
  const supabase = getSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}
