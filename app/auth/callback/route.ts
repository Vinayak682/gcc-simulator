/**
 * /app/auth/callback/route.ts
 *
 * Supabase email confirmation callback.
 * Exchanges the code for a session, seeds org/team if first login, then redirects to /dashboard.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export async function GET(req: NextRequest) {
  const { searchParams, origin } = new URL(req.url);
  const code = searchParams.get('code');
  const next = searchParams.get('next') ?? '/dashboard';

  if (!code) {
    return NextResponse.redirect(`${origin}/auth/login?error=missing_code`);
  }

  const cookieStore = cookies() as any;
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () =>
          typeof cookieStore.getAll === 'function' ? cookieStore.getAll() : [],
        setAll: (cookiesToSet: { name: string; value: string; options?: object }[]) => {
          cookiesToSet.forEach(({ name, value, options }) => {
            if (typeof cookieStore.set === 'function') {
              cookieStore.set(name, value, options);
            }
          });
        },
      },
    }
  );

  const { data, error } = await supabase.auth.exchangeCodeForSession(code);

  if (error || !data.session) {
    console.error('auth callback error:', error);
    return NextResponse.redirect(`${origin}/auth/login?error=callback_failed`);
  }

  // Seed org/team for new users (idempotent)
  const orgName = data.user?.user_metadata?.org_name as string | undefined;
  try {
    await fetch(`${origin}/api/onboard`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${data.session.access_token}`,
      },
      body: JSON.stringify({ orgName }),
    });
  } catch {
    // Non-fatal
  }

  return NextResponse.redirect(`${origin}${next}`);
}
