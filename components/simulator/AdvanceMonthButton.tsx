'use client';

/**
 * AdvanceMonthButton — Triggers the advance-month game loop.
 *
 * Calls POST /api/sessions/[id]/advance-month.
 * Shows loading spinner during the ~2s server compute.
 * Disabled if: pending decisions remain, game over, or already at final month.
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronRight, Loader2, AlertTriangle, Trophy, Lock } from 'lucide-react';

interface AdvanceMonthButtonProps {
  sessionId: string;
  currentMonth: number;
  totalMonths: number;
  pendingDecisionsCount: number;
  sessionStatus: string;
}

export function AdvanceMonthButton({
  sessionId,
  currentMonth,
  totalMonths,
  pendingDecisionsCount,
  sessionStatus,
}: AdvanceMonthButtonProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isGameOver = sessionStatus === 'won' || sessionStatus === 'lost';
  const isFinalMonth = currentMonth >= totalMonths;
  const hasPending = pendingDecisionsCount > 0;
  const isDisabled = loading || isGameOver || isFinalMonth || hasPending;

  const handleAdvance = async () => {
    if (isDisabled) return;
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/sessions/${sessionId}/advance-month`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? 'Failed to advance month');
      }

      const result = await res.json();

      // Show win/loss modal if triggered
      if (result.winTriggered || result.lossTriggered) {
        // The game state update will propagate via Realtime
        // Just refresh to show updated state
      }

      router.refresh();
    } catch (err: any) {
      setError(err.message);
      setLoading(false);
    }
  };

  const getButtonContent = () => {
    if (loading) {
      return (
        <span className="flex items-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin" />
          Simulating Month {currentMonth + 1}...
        </span>
      );
    }
    if (isGameOver) {
      return (
        <span className="flex items-center gap-2">
          <Trophy className="w-4 h-4" />
          {sessionStatus === 'won' ? 'You Won!' : 'Game Over'}
        </span>
      );
    }
    if (isFinalMonth) {
      return (
        <span className="flex items-center gap-2">
          <Trophy className="w-4 h-4" />
          Final Month Reached
        </span>
      );
    }
    if (hasPending) {
      return (
        <span className="flex items-center gap-2">
          <Lock className="w-4 h-4" />
          {pendingDecisionsCount} Decision{pendingDecisionsCount > 1 ? 's' : ''} Pending
        </span>
      );
    }
    return (
      <span className="flex items-center gap-2">
        Advance to Month {currentMonth + 1}
        <ChevronRight className="w-4 h-4" />
      </span>
    );
  };

  return (
    <div className="flex flex-col items-end gap-2">
      <motion.button
        whileTap={isDisabled ? {} : { scale: 0.97 }}
        onClick={handleAdvance}
        disabled={isDisabled}
        className={`px-5 py-2.5 rounded-lg font-semibold text-sm transition-all ${
          isDisabled
            ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
            : 'bg-gradient-to-r from-amber-500 to-amber-400 hover:from-amber-400 hover:to-amber-300 text-black shadow-lg shadow-amber-500/20'
        }`}
      >
        {getButtonContent()}
      </motion.button>

      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="flex items-center gap-1.5 text-xs text-red-400"
          >
            <AlertTriangle className="w-3 h-3" />
            {error}
          </motion.div>
        )}
      </AnimatePresence>

      {hasPending && !loading && (
        <p className="text-[10px] text-amber-500/70">
          Make all {pendingDecisionsCount} decision{pendingDecisionsCount > 1 ? 's' : ''} to advance
        </p>
      )}
    </div>
  );
}
