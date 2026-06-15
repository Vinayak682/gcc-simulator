/**
 * POST /api/agents/tick
 * QStash webhook endpoint — runs agent tick for active sessions.
 *
 * Called by Upstash QStash every 60 seconds for each active session.
 * Verifies QStash signature before running.
 * Also supports manual trigger from instructor panel.
 *
 * QStash config (set in Upstash console):
 *   URL: https://your-app.vercel.app/api/agents/tick
 *   Schedule: every 60 seconds
 *   Body: {"sessionId": "...", "month": N, "agentsToRun": [...]}
 */

import { NextRequest, NextResponse } from 'next/server';
import { Receiver } from '@upstash/qstash';
import { runAgentTick } from '@/lib/agents/runner';
import type { AgentTickPayload, AgentName } from '@/lib/simulator/types';
import { createSupabaseAdmin } from '@/lib/simulator/supabase';

const receiver = new Receiver({
  currentSigningKey: process.env.QSTASH_CURRENT_SIGNING_KEY!,
  nextSigningKey: process.env.QSTASH_NEXT_SIGNING_KEY!,
});

export async function POST(req: NextRequest) {
  const body = await req.text();

  // ── Verify QStash signature ───────────────────────────────────────────────
  // In development: skip verification if no QStash keys set
  if (process.env.QSTASH_CURRENT_SIGNING_KEY) {
    try {
      const isValid = await receiver.verify({
        signature: req.headers.get('Upstash-Signature') ?? '',
        body,
      });

      if (!isValid) {
        return NextResponse.json({ error: 'Invalid QStash signature' }, { status: 401 });
      }
    } catch {
      // Allow manual triggers in development
      if (process.env.NODE_ENV !== 'development') {
        return NextResponse.json({ error: 'Signature verification failed' }, { status: 401 });
      }
    }
  }

  let payload: AgentTickPayload;
  try {
    payload = JSON.parse(body);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { sessionId, month, agentsToRun } = payload;

  if (!sessionId) {
    // If no sessionId, run tick for ALL active sessions (batch mode)
    return await runBatchTick(month, agentsToRun);
  }

  // ── Single session tick ───────────────────────────────────────────────────
  try {
    const result = await runAgentTick({
      sessionId,
      month: month ?? 1,
      triggerSource: 'qstash',
      agentsToRun: agentsToRun ?? ['tariq', 'zara', 'omar', 'nadia', 'faris', 'leila', 'priya', 'board'],
    });

    return NextResponse.json({
      success: true,
      sessionId,
      month,
      agentsRun: result.agentResults.length,
      successCount: result.agentResults.filter((r) => r.success).length,
      totalCostUsd: result.totalCostUsd,
      durationMs: result.durationMs,
    });
  } catch (err: any) {
    console.error(`Agent tick error for session ${sessionId}:`, err);
    return NextResponse.json(
      { error: err.message, sessionId },
      { status: 500 }
    );
  }
}

async function runBatchTick(month?: number, agentsToRun?: AgentName[]) {
  const admin = createSupabaseAdmin();

  // Get all active sessions
  const { data: activeSessions } = await admin
    .from('sim_sessions')
    .select('id, current_month')
    .eq('status', 'active')
    .limit(50); // Process up to 50 active sessions per tick

  if (!activeSessions || activeSessions.length === 0) {
    return NextResponse.json({ success: true, message: 'No active sessions', processed: 0 });
  }

  // Run ticks in parallel (max 10 concurrent)
  const BATCH_SIZE = 10;
  const results = [];

  for (let i = 0; i < activeSessions.length; i += BATCH_SIZE) {
    const batch = activeSessions.slice(i, i + BATCH_SIZE);
    const batchResults = await Promise.allSettled(
      batch.map((s: { id: string; current_month: number }) =>
        runAgentTick({
          sessionId: s.id,
          month: month ?? s.current_month,
          triggerSource: 'qstash',
          agentsToRun: agentsToRun ?? ['tariq', 'zara', 'omar', 'nadia', 'faris', 'leila', 'priya', 'board'],
        })
      )
    );
    results.push(...batchResults);
  }

  const successCount = results.filter((r) => r.status === 'fulfilled').length;
  const failCount = results.filter((r) => r.status === 'rejected').length;

  return NextResponse.json({
    success: true,
    processed: activeSessions.length,
    succeeded: successCount,
    failed: failCount,
  });
}
