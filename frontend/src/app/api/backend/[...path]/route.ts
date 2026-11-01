// Backend-for-frontend proxy: /api/backend/<path> -> FastAPI /api/v1/<path>, adding the session token from the
// httpOnly cookie. The browser never handles the token and no CORS configuration is needed.
import { cookies } from 'next/headers';
import { NextRequest } from 'next/server';
import { BACKEND_URL, SESSION_COOKIE } from '@/lib/api/config';

const SAFE_SEGMENT = /^[A-Za-z0-9_.-]+$/;

async function forward(request: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  if (!path.length || !path.every((p) => SAFE_SEGMENT.test(p) && p !== '..')) {
    return Response.json({ detail: 'Invalid path' }, { status: 400 });
  }
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const init: RequestInit = { method: request.method, headers, cache: 'no-store' };
  if (!['GET', 'HEAD'].includes(request.method)) {
    headers['Content-Type'] = 'application/json';
    init.body = await request.text();
  }
  // Pass the client address on so the backend rate-limits per citizen, not per proxy. The backend only trusts
  // it when this shared secret matches (or the proxy's address is configured as trusted).
  const forwardedFor = request.headers.get('x-forwarded-for');
  if (forwardedFor) headers['X-Forwarded-For'] = forwardedFor;
  if (process.env.DADIP_PROXY_SECRET) headers['X-DADIP-Proxy-Auth'] = process.env.DADIP_PROXY_SECRET;
  try {
    const res = await fetch(`${BACKEND_URL}/api/v1/${path.join('/')}${request.nextUrl.search}`, init);
    return new Response(res.body, { status: res.status, headers: { 'Content-Type': res.headers.get('Content-Type') || 'application/json' } });
  } catch {
    return Response.json({ detail: 'Backend unreachable' }, { status: 502 });
  }
}

export { forward as GET, forward as POST, forward as PATCH, forward as DELETE };
