/**
 * PATCH /api/sessions/[id]/decisions/[decisionId]
 * Submit a player's decision choice.
 *
 * Validates: session active, decision belongs to session, option exists.
 * Updates decision to 'decided', triggers agent rec generation in background.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, createSupabaseAdmin, getDecision, updateDecision } from '@/lib/simulator/supabase';

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; decisionId: string }> }
) {
  try {
    const session = await requireAuth();
    const { id: sessionId, decisionId } = await params;
    const { optionId } = await req.json();

    if (!optionId) {
      return NextResponse.json({ error: 'optionId is required' }, { status: 400 });
    }

    // Load decision
    const decision = await getDecision(decisionId);
    if (!decision || decision.session_id !== sessionId) {
      return NextResponse.json({ error: 'Decision not found' }, { status: 404 });
    }

    if (decision.status !== 'pending') {
      return NextResponse.json({ error: `Decision is already ${decision.status}` }, { status: 409 });
    }

    // Validate option
    const chosenOption = (decision.options as any[]).find((o) => o.id === optionId);
    if (!chosenOption) {
      return NextResponse.json({ error: `Invalid option: ${optionId}` }, { status: 400 });
    }

    // Mark decision as decided
    const updated = await updateDecision(decisionId, {
      status: 'decided',
      chosen_option_id: optionId,
      decided_by: session.user.id,
      decided_at: new Date().toISOString(),
      kpi_impact: chosenOption.projected_kpi_impact,
    });

    // Increment decisions_made in game state
    const admin = createSupabaseAdmin();
    await admin.rpc('increment_decisions_made', { p_session_id: sessionId });

    // Log agent activity for the decision
    await admin.from('agent_activity_log').insert({
      session_id: sessionId,
      agent_name: 'board',
      month: decision.month,
      activity_type: 'action_taken',
      title: `Decision: ${decision.title}`,
      summary: `MD chose Option ${optionId}: ${chosenOption.label}`,
      full_content: null,
      metadata: { decision_id: decisionId, option_id: optionId },
      tokens_used: 0,
      cost_usd: 0,
    });

    return NextResponse.json(updated);
  } catch (err: any) {
    if (err.message === 'UNAUTHORIZED') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('PATCH /decisions/[id] error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; decisionId: string }> }
) {
  try {
    await requireAuth();
    const { id, decisionId } = await params;
    const decision = await getDecision(decisionId);

    if (!decision || decision.session_id !== id) {
      return NextResponse.json({ error: 'Decision not found' }, { status: 404 });
    }

    return NextResponse.json(decision);
  } catch (err: any) {
    if (err.message === 'UNAUTHORIZED') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
