// ============================================================
// Middleware — Route protection using NextAuth
// ============================================================

export { auth as proxy } from '@/lib/auth';

export const config = {
  matcher: [
    // Protect government routes
    '/government/:path*',
    // Protect admin API routes
    '/api/admin/:path*',
    // Protect mutation API routes (not GET-only public ones)
    '/api/events/:path*',
    '/api/incidents/:path*',
    '/api/alerts/:path*',
    '/api/pipeline/:path*',
    '/api/upload/:path*',
  ],
};
