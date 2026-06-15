/**
 * POST /api/onboard
 *
 * Called immediately after signup (when email confirm is disabled) to seed:
 *   organizations → organization_members → teams → team_members
 *
 * Also called after email confirmation callback to handle the deferred seed.
 * Idempotent — safe to call multiple times.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

export async function POST(req: NextRequest) {
  try {
    // Auth: extract user from Bearer token
    const authHeader = req.headers.get('authorization') ?? '';
    const token = authHeader.replace('Bearer ', '').trim();

    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(token);
    if (userError || !user) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    const userId = user.id;
    const { orgName } = await req.json().catch(() => ({}));
    const resolvedOrgName = (orgName as string)?.trim() || user.email?.split('@')[0] || 'My Team';

    // Check if user already has an org (idempotency)
    const { data: existingMembership } = await supabaseAdmin
      .from('organization_members')
      .select('org_id')
      .eq('user_id', userId)
      .eq('status', 'active')
      .limit(1)
      .single();

    if (existingMembership) {
      // Already seeded — return existing org
      const { data: existingTeam } = await supabaseAdmin
        .from('teams')
        .select('id')
        .eq('org_id', existingMembership.org_id)
        .limit(1)
        .single();

      return NextResponse.json({
        seeded: false,
        org_id: existingMembership.org_id,
        team_id: existingTeam?.id,
      });
    }

    // 1. Create organization
    const slug = resolvedOrgName
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '-')
      .replace(/-+/g, '-')
      .slice(0, 50) + '-' + Math.random().toString(36).slice(2, 6);

    const { data: org, error: orgError } = await supabaseAdmin
      .from('organizations')
      .insert({
        name: resolvedOrgName,
        slug,
        plan: 'free',
        agent_ops_limit: 20,
        seats_limit: 1,
      })
      .select('id')
      .single();

    if (orgError || !org) {
      console.error('org insert error:', orgError);
      return NextResponse.json({ error: 'Failed to create organization' }, { status: 500 });
    }

    // 2. Add user as org owner
    const { error: memberError } = await supabaseAdmin
      .from('organization_members')
      .insert({
        org_id: org.id,
        user_id: userId,
        role: 'owner',
        status: 'active',
      });

    if (memberError) {
      console.error('org member insert error:', memberError);
      return NextResponse.json({ error: 'Failed to add org member' }, { status: 500 });
    }

    // 3. Create default team
    const { data: team, error: teamError } = await supabaseAdmin
      .from('teams')
      .insert({
        org_id: org.id,
        name: `${resolvedOrgName} — Command`,
        created_by: userId,
        is_competitive: false,
      })
      .select('id')
      .single();

    if (teamError || !team) {
      console.error('team insert error:', teamError);
      return NextResponse.json({ error: 'Failed to create team' }, { status: 500 });
    }

    // 4. Add user to team as CEO
    const { error: teamMemberError } = await supabaseAdmin
      .from('team_members')
      .insert({
        team_id: team.id,
        user_id: userId,
        sim_role: 'ceo',
      });

    if (teamMemberError) {
      console.error('team member insert error:', teamMemberError);
      return NextResponse.json({ error: 'Failed to add team member' }, { status: 500 });
    }

    return NextResponse.json({
      seeded: true,
      org_id: org.id,
      team_id: team.id,
    });
  } catch (err) {
    console.error('onboard error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
