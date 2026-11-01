'use client';

import { useState } from 'react';
import { signIn } from 'next-auth/react';
import Link from 'next/link';
import { Shield, Mail, Lock, AlertTriangle, ArrowLeft } from 'lucide-react';

export default function SignInPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleCredentials = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const callbackUrl = email.includes('ndma') || email.includes('dadip') ? '/government' : '/public';
      const result = await signIn('credentials', {
        email,
        password,
        redirect: false,
      });

      if (result?.error) {
        setError('Invalid email or password. Please try again.');
      } else if (result?.ok) {
        window.location.href = callbackUrl;
      }
    } catch {
      setError('An error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  };



  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative" style={{ background: 'linear-gradient(135deg, #050a18 0%, #0a1230 30%, #0d1535 60%, #050a18 100%)' }}>
      {/* Background glow effects */}
      <div className="absolute top-20 left-1/4 w-72 h-72 bg-cyan-500/5 rounded-full blur-[100px]" />
      <div className="absolute bottom-20 right-1/4 w-96 h-96 bg-blue-500/5 rounded-full blur-[120px]" />

      <div className="max-w-md w-full relative z-10">
        {/* Back link */}
        <Link href="/" className="inline-flex items-center gap-2 text-sm text-slate-400 hover:text-white transition mb-8">
          <ArrowLeft className="w-4 h-4" /> Back to Home
        </Link>

        <div className="glass-card p-8 relative overflow-hidden">
          {/* Decorative gradient blobs */}
          <div className="absolute -top-20 -right-20 w-40 h-40 bg-cyan-500/10 rounded-full blur-3xl" />
          <div className="absolute -bottom-20 -left-20 w-40 h-40 bg-blue-500/10 rounded-full blur-3xl" />

          {/* Header */}
          <div className="flex flex-col items-center mb-8 relative z-10">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center mb-4 shadow-xl shadow-cyan-500/20">
              <Shield className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-2xl font-bold text-white text-center">Sign In to DADIP</h1>
            <p className="text-sm text-slate-400 mt-1">Disaster AI Decision-Intelligence Platform</p>
          </div>

          {/* Error message */}
          {error && (
            <div className="mb-6 p-3 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0" />
              <p className="text-sm text-red-400">{error}</p>
            </div>
          )}

          {/* Credentials Form */}
          <form onSubmit={handleCredentials} className="space-y-4 relative z-10">
            <div>
              <label className="text-xs text-slate-400 block mb-1.5 font-medium">Email Address</label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <input
                  id="signin-email"
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  className="w-full h-12 pl-10 pr-4 rounded-xl bg-white/5 border border-white/10 text-white placeholder:text-slate-600 focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/20 transition-all"
                  placeholder="officer@ndma.gov.in"
                  required
                />
              </div>
            </div>

            <div>
              <label className="text-xs text-slate-400 block mb-1.5 font-medium">Password</label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <input
                  id="signin-password"
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className="w-full h-12 pl-10 pr-4 rounded-xl bg-white/5 border border-white/10 text-white placeholder:text-slate-600 focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/20 transition-all"
                  placeholder="••••••••"
                  required
                />
              </div>
            </div>

            <button
              id="signin-submit"
              type="submit"
              disabled={loading}
              className="w-full py-3.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 text-white font-bold hover:shadow-lg hover:shadow-cyan-500/25 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Signing in...
                </>
              ) : (
                'Sign In'
              )}
            </button>
          </form>



          {/* Demo Credentials */}
          <div className="mt-6 pt-6 border-t border-white/5">
            <p className="text-xs text-slate-500 text-center mb-3">Demo Accounts</p>
            <div className="grid grid-cols-1 gap-2">
              <button
                type="button"
                onClick={() => { setEmail('officer@ndma.gov.in'); setPassword('ndma@2026'); }}
                className="w-full px-3 py-2.5 rounded-lg bg-orange-500/5 border border-orange-500/10 text-xs text-orange-400 hover:bg-orange-500/10 transition flex items-center justify-between"
              >
                <span>🏛️ Government Officer</span>
                <span className="font-mono text-[10px] text-orange-400/60">officer@ndma.gov.in</span>
              </button>
              <button
                type="button"
                onClick={() => { setEmail('admin@dadip.in'); setPassword('admin123'); }}
                className="w-full px-3 py-2.5 rounded-lg bg-purple-500/5 border border-purple-500/10 text-xs text-purple-400 hover:bg-purple-500/10 transition flex items-center justify-between"
              >
                <span>👑 System Admin</span>
                <span className="font-mono text-[10px] text-purple-400/60">admin@dadip.in</span>
              </button>

            </div>
          </div>
        </div>

        {/* Security Note */}
        <p className="text-center text-[10px] text-slate-600 mt-4">
          🔒 Secured with NextAuth.js • JWT Sessions • bcrypt Password Hashing
        </p>
      </div>
    </div>
  );
}
