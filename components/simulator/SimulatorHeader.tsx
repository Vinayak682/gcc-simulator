'use client';

/**
 * SimulatorHeader — Top bar with live share price ticker, month counter,
 * win condition progress, and notifications bell.
 *
 * Uses Supabase Realtime to receive share price pushes without polling.
 */

import { useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Bell, TrendingUp, TrendingDown, Minus, Calendar, Target, LogOut } from 'lucide-react';
import { subscribeToSharePrice, subscribeToNotifications } from '@/lib/simulator/supabase.client';
import { formatPrice, priceChangePct, priceDirection } from '@/lib/simulator/sharePrice';
import type { SimSharePriceHistory, Notification, SimSession, SimScenario } from '@/lib/simulator/types';

interface SimulatorHeaderProps {
  session: SimSession;
  scenario: SimScenario;
  initialPrice: number;
  previousPrice: number;
  userId: string;
  onNotificationClick: () => void;
}

export function SimulatorHeader({
  session,
  scenario,
  initialPrice,
  previousPrice,
  userId,
  onNotificationClick,
}: SimulatorHeaderProps) {
  const [currentPrice, setCurrentPrice] = useState(initialPrice);
  const [prevPrice, setPrevPrice] = useState(previousPrice);
  const [priceJustChanged, setPriceJustChanged] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifications, setNotifications] = useState<Notification[]>([]);

  // Subscribe to live share price updates
  useEffect(() => {
    const unsubscribe = subscribeToSharePrice(session.id, (entry: SimSharePriceHistory) => {
      setPrevPrice(currentPrice);
      setCurrentPrice(entry.price_aed);
      setPriceJustChanged(true);
      setTimeout(() => setPriceJustChanged(false), 3000);
    });
    return unsubscribe;
  }, [session.id, currentPrice]);

  // Subscribe to notifications
  useEffect(() => {
    const unsubscribe = subscribeToNotifications(userId, (notification: Notification) => {
      setNotifications((prev) => [notification, ...prev].slice(0, 20));
      if (!notification.is_read) {
        setUnreadCount((prev) => prev + 1);
      }
    });
    return unsubscribe;
  }, [userId]);

  const direction = priceDirection(currentPrice, prevPrice);
  const changePct = priceChangePct(currentPrice, prevPrice);
  const winProgress = Math.min(
    100,
    ((currentPrice - scenario.initial_share_price) /
      (scenario.win_target_price - scenario.initial_share_price)) *
      100
  );

  const PriceIcon =
    direction === 'up' ? TrendingUp : direction === 'down' ? TrendingDown : Minus;
  const priceColor =
    direction === 'up'
      ? 'text-emerald-400'
      : direction === 'down'
      ? 'text-red-400'
      : 'text-slate-400';

  return (
    <header className="fixed top-0 left-0 right-0 z-50 h-16 bg-[#0f0f1a] border-b border-[#1e1e3a] flex items-center px-6 gap-6">
      {/* Brand */}
      <div className="flex items-center gap-3 min-w-0 flex-shrink-0">
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#f59e0b] to-[#d97706] flex items-center justify-center text-sm font-bold text-black">
          AL
        </div>
        <span className="text-white font-semibold text-sm hidden md:block truncate max-w-[160px]">
          Al Manar Industries
        </span>
      </div>

      {/* Month Counter */}
      <div className="flex items-center gap-2 text-slate-400 text-sm flex-shrink-0">
        <Calendar className="w-4 h-4" />
        <span className="font-mono">
          Month{' '}
          <span className="text-white font-bold">{session.current_month}</span>
          <span className="text-slate-600"> / {session.total_months}</span>
        </span>
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Live Share Price Ticker */}
      <div className="flex items-center gap-3 flex-shrink-0">
        <div className="text-xs text-slate-500 font-mono hidden sm:block">DFM: ALMAN</div>
        <AnimatePresence mode="wait">
          <motion.div
            key={currentPrice}
            initial={{ opacity: 0, y: priceJustChanged ? (direction === 'up' ? 8 : -8) : 0 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: direction === 'up' ? -8 : 8 }}
            transition={{ duration: 0.3 }}
            className="flex items-center gap-2"
          >
            <PriceIcon className={`w-4 h-4 ${priceColor}`} />
            <span className={`font-mono font-bold text-lg ${priceColor}`}>
              {formatPrice(currentPrice)}
            </span>
            {prevPrice !== currentPrice && (
              <span className={`text-xs font-mono ${priceColor}`}>
                {changePct > 0 ? '+' : ''}
                {changePct.toFixed(2)}%
              </span>
            )}
          </motion.div>
        </AnimatePresence>

        {/* Price flash overlay */}
        <AnimatePresence>
          {priceJustChanged && (
            <motion.div
              initial={{ opacity: 0.4 }}
              animate={{ opacity: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 2 }}
              className={`absolute inset-0 pointer-events-none ${
                direction === 'up' ? 'bg-emerald-500/5' : 'bg-red-500/5'
              }`}
            />
          )}
        </AnimatePresence>
      </div>

      {/* Win Progress */}
      <div className="hidden lg:flex items-center gap-2 flex-shrink-0">
        <Target className="w-4 h-4 text-amber-400" />
        <div className="flex flex-col gap-0.5">
          <div className="text-xs text-slate-500">
            Target: {formatPrice(scenario.win_target_price)}
          </div>
          <div className="w-24 h-1.5 bg-slate-800 rounded-full overflow-hidden">
            <motion.div
              className="h-full rounded-full bg-gradient-to-r from-amber-500 to-amber-400"
              initial={{ width: 0 }}
              animate={{ width: `${Math.max(0, winProgress)}%` }}
              transition={{ duration: 0.8, ease: 'easeOut' }}
            />
          </div>
        </div>
        <span className="text-xs font-mono text-slate-400">{Math.max(0, winProgress).toFixed(0)}%</span>
      </div>

      {/* Notifications */}
      <button
        onClick={onNotificationClick}
        className="relative flex items-center justify-center w-9 h-9 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors flex-shrink-0"
      >
        <Bell className="w-4 h-4" />
        {unreadCount > 0 && (
          <motion.span
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center"
          >
            {unreadCount > 9 ? '9+' : unreadCount}
          </motion.span>
        )}
      </button>
    </header>
  );
}
