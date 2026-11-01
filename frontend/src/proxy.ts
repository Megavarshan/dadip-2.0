// Route protection (Next.js 16 "proxy", formerly middleware). Only checks that a session exists; every API call is
// still authorised by the FastAPI backend, which is the source of truth for roles.
import { NextRequest, NextResponse } from 'next/server';

export function proxy(request: NextRequest) {
  if (!request.cookies.get('dadip_session')) {
    const url = new URL('/login', request.url);
    url.searchParams.set('next', request.nextUrl.pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = { matcher: ['/command/:path*'] };
