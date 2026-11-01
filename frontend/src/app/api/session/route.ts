// POST /api/session  { email, password }  -> logs in against the FastAPI backend, stores the JWT in an
//                                            httpOnly cookie, returns the user (never the token).
// DELETE /api/session                     -> logs out.
import { cookies } from 'next/headers';
import { NextRequest } from 'next/server';
import { BACKEND_URL, ROLE_COOKIE, SESSION_COOKIE } from '@/lib/api/config';

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  if (!body?.email || !body?.password) {
    return Response.json({ detail: 'Email and password are required' }, { status: 400 });
  }
  let res: Response;
  try {
    res = await fetch(`${BACKEND_URL}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: body.email, password: body.password }),
      cache: 'no-store',
    });
  } catch {
    return Response.json({ detail: 'Backend unreachable' }, { status: 502 });
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return Response.json({ detail: data.detail || 'Login failed' }, { status: res.status });

  const jar = await cookies();
  const secure = process.env.NODE_ENV === 'production';
  jar.set(SESSION_COOKIE, data.access_token, { httpOnly: true, secure, sameSite: 'lax', path: '/', maxAge: 60 * 60 });
  // Role is not a secret; it only decides which navigation to render. Every request is authorised by the backend.
  jar.set(ROLE_COOKIE, data.user.role, { httpOnly: false, secure, sameSite: 'lax', path: '/', maxAge: 60 * 60 });
  return Response.json({ user: data.user });
}

export async function DELETE() {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
  jar.delete(ROLE_COOKIE);
  return Response.json({ ok: true });
}
