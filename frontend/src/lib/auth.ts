// ============================================================
// NextAuth.js v5 — Authentication Configuration
// ============================================================

import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';

import bcrypt from 'bcryptjs';
import { getSupabase } from '@/lib/db';
import type { DbUser } from '@/lib/db';

declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
      role: 'public' | 'government' | 'admin';
    };
  }

  interface User {
    role?: 'public' | 'government' | 'admin';
  }
}

declare module 'next-auth' {
  interface JWT {
    role?: 'public' | 'government' | 'admin';
    sub?: string;
  }
}

export const { handlers, signIn, signOut, auth } = NextAuth({
  pages: {
    signIn: '/auth/signin',
    error: '/auth/signin',
  },
  session: {
    strategy: 'jwt',
    maxAge: 7 * 24 * 60 * 60, // 7 days
  },
  providers: [
    // ---------- Credential Provider ----------
    Credentials({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          return null;
        }

        const email = credentials.email as string;
        const password = credentials.password as string;

        // Fallback: allow demo login
        if (email === 'officer@ndma.gov.in' && password === 'ndma@2026') {
          return {
            id: 'demo-gov',
            name: 'NDMA Emergency Officer',
            email: 'officer@ndma.gov.in',
            role: 'government' as const,
          };
        }
        if (email === 'admin@dadip.in' && password === 'admin123') {
          return {
            id: 'demo-admin',
            name: 'DADIP Admin',
            email: 'admin@dadip.in',
            role: 'admin' as const,
          };
        }

        try {
          const db = getSupabase();
          const { data: user, error } = await db
            .from('users')
            .select('*')
            .eq('email', email)
            .single();

          if (error || !user) {
            console.log('Auth: User not found:', email);
            return null;
          }

          const dbUser = user as DbUser;

          if (!dbUser.password_hash) {
            console.log('Auth: User has no password (OAuth-only account)');
            return null;
          }

          const isValid = await bcrypt.compare(password, dbUser.password_hash);
          if (!isValid) {
            console.log('Auth: Invalid password for:', email);
            return null;
          }

          return {
            id: dbUser.id,
            name: dbUser.name,
            email: dbUser.email,
            image: dbUser.avatar_url,
            role: dbUser.role,
          };
        } catch (err) {
          console.error('Auth error:', err);
          return null;
        }
      },
    }),
  ],

  callbacks: {
    // Attach role to JWT token
    async jwt({ token, user }) {
      if (user) {
        token.role = (user as { role?: string }).role as 'public' | 'government' | 'admin' || 'public';
        token.sub = user.id;
      }
      return token;
    },

    // Expose role in session
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.sub || '';
        session.user.role = (token.role as 'public' | 'government' | 'admin') || 'public';
      }
      return session;
    },

    // Authorization check
    async authorized({ auth: session, request }) {
      const { pathname } = request.nextUrl;

      // Government routes require government or admin role
      if (pathname.startsWith('/government')) {
        if (!session?.user) return false;
        const role = session.user.role;
        return role === 'government' || role === 'admin';
      }

      // Admin API routes require admin role
      if (pathname.startsWith('/api/admin')) {
        if (!session?.user) return false;
        return session.user.role === 'admin';
      }

      return true;
    },
  },
});
