'use client';

/**
 * SimulatorShell — Root layout component for the simulator experience.
 *
 * Composes: SimulatorHeader (top bar) + SimulatorSidebar (left nav) + content slot.
 * Manages shared Realtime state: live KPIs, game state, active events.
 * Passes reactive data down to header and sidebar as props.
 *
 * Used in /app/simulator/[sessionId]/layout.tsx as a Client Component wrapper
 * around the RSC page children.
 */

import { useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Bell } from 'lucide-react';
import { SimulatorHeader } from './SimulatorHeader';
import { SimulatorSidebar } from './SimulatorSidebar';
import {
  subscribeToGameState,
  subscribeToSharePrice,
  subscribeToNotifications,
} from '@/lib/simulator/supabase.client';
import type {
  SimSession,
  SimScenario,
  SimKPISnapshot,
  SimGameState,
  MarketEventSession,
  Notification,
  SimSharePriceHistory,
} from '@/lib/simulator/types';

interface SimulatorShellProps {
  session: SimSession;
  scenario: SimScenario;
  initialKPIs: SimKPISnapshot | null;
  initialGameState: SimGameState | null;
  initialSharePrice: number;
  previousSharePrice: number;
  initialActiveEvents: MarketEventSession[];
  pendingDecisions: number;
  userId: string;
  children: React.ReactNode;
}

export function SimulatorShell({
  session,
  scenario,
  initialKPIs,
  initialGameState,
  initialSharePrice,
  previousSharePrice,
  initialActiveEvents,
  pendingDecisions,
  userId,
  children,
}: SimulatorShellProps) {
  const [kpis, setKPIs] = useState<SimKPISnapshot | null>(initialKPIs);
  const [gameState, setGameState] = useState<SimGameState | null>(initialGameState);
  const [activeEvents] = useState<MarketEventSession[]>(initialActiveEvents);
  const [currentSharePrice, setCurrentSharePrice] = useState(initialSharePrice);
  const [prevSharePrice, setPrevSharePrice] = useState(previousSharePrice);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  // Subscribe to game state (KPIs are embedded in game state updates for simplicity)
  useEffect(() => {
    const unsub = subscribeToGameState(session.id, (updatedState: SimGameState) => {
      setGameState(updatedState);
    });
    return unsub;
  }, [session.id]);

  // Subscribe to share price
  useEffect(() => {
    const unsub = subscribeToSharePrice(session.id, (entry: SimSharePriceHistory) => {
      setPrevSharePrice(currentSharePrice);
      setCurrentSharePrice(entry.price_aed);
    });
    return unsub;
  }, [session.id, currentSharePrice]);

  // Subscribe to notifications
  useEffect(() => {
    const unsub = subscribeToNotifications(userId, (notification: Notification) => {
      setNotifications((prev) => [notification, ...prev].slice(0, 30));
      if (!notification.is_read) setUnreadCount((c) => c + 1);
    });
    return unsub;
  }, [userId]);

  const handleNotificationClick = useCallback(() => {
    setNotificationsOpen(true);
    setUnreadCount(0);
  }, []);

  return (
    <div className="min-h-screen bg-[#08080f] text-white">
      {/* Top bar */}
      <SimulatorHeader
        session={session}
        scenario={scenario}
        initialPrice={currentSharePrice}
        previousPrice={prevSharePrice}
        userId={userId}
        onNotificationClick={handleNotificationClick}
      />

      {/* Left sidebar */}
      <SimulatorSidebar
        sessionId={session.id}
        kpis={kpis}
        gameState={gameState}
        activeEvents={activeEvents}
        pendingDecisions={pendingDecisions}
      />

      {/* Main content area */}
      <main className="pt-16 pl-56 min-h-screen">
        <div className="p-6 max-w-[1400px]">{children}</div>
      </main>

      {/* Notification panel */}
      <AnimatePresence>
        {notificationsOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 bg-black/40"
              onClick={() => setNotificationsOpen(false)}
            />

            {/* Panel */}
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
              className="fixed right-0 top-16 bottom-0 w-80 z-50 bg-[#0a0a15] border-l border-[#1e1e3a] flex flex-col"
            >
              {/* Panel header */}
              <div className="flex items-center justify-between p-4 border-b border-[#1e1e3a]">
                <div className="flex items-center gap-2">
                  <Bell className="w-4 h-4 text-slate-400" />
                  <span className="text-sm font-semibold text-white">Notifications</span>
                </div>
                <button
                  onClick={() => setNotificationsOpen(false)}
                  className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-500 hover:text-white hover:bg-slate-800 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Notification list */}
              <div className="flex-1 overflow-y-auto p-3 space-y-2">
                {notifications.length === 0 ? (
                  <div className="text-center py-12 text-slate-600 text-sm">
                    No notifications yet
                  </div>
                ) : (
                  notifications.map((n) => (
                    <NotificationItem key={n.id} notification={n} />
                  ))
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

function NotificationItem({ notification }: { notification: Notification }) {
  const typeColors: Record<string, string> = {
    agent_alert: 'border-l-red-500',
    decision_required: 'border-l-amber-500',
    month_advanced: 'border-l-blue-500',
    win: 'border-l-emerald-500',
    loss: 'border-l-red-600',
    info: 'border-l-slate-500',
  };

  const borderColor = typeColors[notification.type] ?? 'border-l-slate-500';

  return (
    <div
      className={`rounded-lg border border-[#1e1e3a] border-l-2 ${borderColor} p-3 ${
        !notification.is_read ? 'bg-[#0f0f1a]' : 'bg-transparent opacity-70'
      }`}
    >
      <div className="text-sm font-medium text-white mb-1">{notification.title}</div>
      <div className="text-xs text-slate-400">{notification.body}</div>
      <div className="text-[10px] text-slate-600 mt-1.5">
        {new Date(notification.created_at).toLocaleTimeString()}
      </div>
    </div>
  );
}
