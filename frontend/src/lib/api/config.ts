// Server-only configuration. The FastAPI base URL is never exposed to the browser: the browser talks to this
// Next.js app, which forwards to the backend with the session token taken from an httpOnly cookie.
export const BACKEND_URL = (process.env.DADIP_API_URL || 'http://localhost:8000').replace(/\/$/, '');
export const SESSION_COOKIE = 'dadip_session';
export const ROLE_COOKIE = 'dadip_role';
