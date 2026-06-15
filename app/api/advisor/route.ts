/**
 * POST /api/advisor
 * Streaming Tariq advisor — Mode A Claude call.
 *
 * Rate limited: 10 calls/user/hour via Upstash Redis.
 * Each call costs ~1 credit (= $0.001). Checked against org credits.
 * Returns SSE stream: data: {"text": "..."}\n\n ... data: [DONE]\n\n
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/simulator/supabase';
import { getSessionWithContext, consumeCredits, logAgentActivity } from '@/lib/simulator/supabase';
import { streamTariqAdvisor } from '@/lib/simulator/claude';
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

// Upstash rate limiter — 10 requests per hour per user
let ratelimit: Ratelimit | null = null;

function getRateLimiter() {
  if (!ratelimit && process.env.UPSTASH_REDIS_REST_URL) {
    ratelimit = new Ratelimit({
      redis: Redis.fromEnv(),
      limiter: Ratelimit.slidingWindow(10, '1h'),
      analytics: true,
      prefix: 'advisor',
    });
  }
  return ratelimit;
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireAuth();
    const userId = session.user.id;

    const body = await req.json();
    const { sessionId, question, history = [] } = body;

    if (!sessionId || !question) {
      return NextResponse.json({ error: 'sessionId and question are required' }, { status: 400 });
    }

    // ── Rate limit check ─────────────────────────────────────────────────────
    const limiter = getRateLimiter();
    if (limiter) {
      const { success, remaining } = await limiter.limit(userId);
      if (!success) {
        return NextResponse.json(
          { error: `Rate limit exceeded. Try again in an hour. (${remaining} remaining)` },
          { status: 429 }
        );
      }
    }

    // ── Load session context ──────────────────────────────────────────────────
    const ctx = await getSessionWithContext(sessionId);
    if (!ctx) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    if (ctx.session.status !== 'active') {
      return NextResponse.json({ error: 'Session is not active' }, { status: 409 });
    }

    // ── Credit check ──────────────────────────────────────────────────────────
    const { data: teamOrg } = await (await import('@/lib/simulator/supabase'))
      .createSupabaseAdmin()
      .from('teams')
      .select('org_id')
      .eq('id', ctx.session.team_id)
      .single();

    const orgId = teamOrg?.org_id;
    if (orgId) {
      const hasCredits = await consumeCredits(
        orgId,
        2, // 2 credits per advisor call (~$0.002 cost buffer)
        `Tariq advisor — Session ${sessionId} Month ${ctx.session.current_month}`,
        sessionId
      );

      if (!hasCredits) {
        return NextResponse.json(
          { error: 'Insufficient credits. Upgrade plan or purchase more credits.' },
          { status: 402 }
        );
      }
    }

    // ── Build Claude context ──────────────────────────────────────────────────
    const claudeCtx = {
      currentMonth: ctx.session.current_month,
      kpis: ctx.latestKPIs ?? {},
      gameState: ctx.gameState ?? {},
      activeEvents: (ctx.activeEvents ?? []).map((ae) => ({
        eventId: ae.event_id,
        name: ae.sim_market_events.name,
        priceImpactPct: ae.sim_market_events.price_impact_pct,
        turnsRemaining: ae.expires_month - ctx.session.current_month,
      })),
      recentDecisions: [],
      scenario: {
        game_mode: ctx.session.sim_scenarios.game_mode,
        difficulty: ctx.session.sim_scenarios.difficulty,
        name: ctx.session.sim_scenarios.name,
      },
      userQuestion: question,
    };

    // ── Stream response ───────────────────────────────────────────────────────
    const stream = await streamTariqAdvisor({
      userQuestion: question,
      context: claudeCtx,
      conversationHistory: history.slice(-10),
    });

    // Log activity asynchronously (don't block stream)
    logAgentActivity({
      session_id: sessionId,
      agent_name: 'tariq',
      month: ctx.session.current_month,
      activity_type: 'analysis',
      title: 'Advisor consultation',
      summary: question.slice(0, 120),
      full_content: null,
      metadata: { mode: 'A', streaming: true },
      tokens_used: 0,
      cost_usd: 0.002,
    }).catch(console.error);

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no', // Vercel/nginx: disable response buffering
      },
    });
  } catch (err: any) {
    if (err.message === 'UNAUTHORIZED') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('POST /api/advisor error:', err);
    return NextResponse.json({ error: err.message ?? 'Internal server error' }, { status: 500 });
  }
}
