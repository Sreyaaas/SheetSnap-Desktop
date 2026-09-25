'use client';

import React, { useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { motion } from 'framer-motion';
import {
  Layers,
  Lock,
  Eye,
  EyeOff,
  ArrowRight,
  ShieldCheck,
  AlertTriangle,
  RefreshCw,
} from 'lucide-react';

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectPath = searchParams.get('redirect') || '/';

  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password.trim() || loading) return;

    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: password.trim() }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.detail || data.error || 'Authentication failed');
      }

      // Success: Navigate to intended workspace destination
      router.push(redirectPath);
      router.refresh();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Invalid access passcode';
      setError(msg);
      setLoading(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: 'easeOut' }}
      className="w-full max-w-sm p-8 bg-white border border-zinc-200/90 rounded-2xl shadow-xl space-y-6"
    >
      {/* Brand Icon & Heading */}
      <div className="text-center space-y-2.5">
        <div className="inline-flex items-center justify-center h-12 w-12 rounded-xl bg-zinc-900 text-white shadow-xs mx-auto">
          <Layers className="w-6 h-6 text-emerald-400" />
        </div>
        <div className="space-y-1">
          <div className="flex items-center justify-center space-x-2">
            <span className="text-base font-bold tracking-tight text-zinc-900">
              SheetSnap
            </span>
            <span className="text-[10px] font-mono font-medium px-1.5 py-0.5 rounded bg-zinc-100 text-zinc-600 border border-zinc-200">
              Pearl Gulf
            </span>
          </div>
          <h1 className="text-xl font-bold tracking-tight text-zinc-950 font-sans">
            Enterprise Workspace
          </h1>
          <p className="text-xs text-zinc-500 leading-relaxed max-w-xs mx-auto">
            Restricted environment. Enter the security passcode to access document studio and extraction engines.
          </p>
        </div>
      </div>

      {/* Error Alert Banner */}
      {error && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-start space-x-2"
        >
          <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
          <div className="leading-tight">
            <span className="font-semibold">Access Denied: </span>
            <span>{error}</span>
          </div>
        </motion.div>
      )}

      {/* Passcode Form */}
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-1.5">
          <label
            htmlFor="passcode"
            className="block text-xs font-semibold text-zinc-700"
          >
            Access Passcode
          </label>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-zinc-400">
              <Lock className="w-4 h-4" />
            </div>
            <input
              id="passcode"
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              autoFocus
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter access passcode..."
              className="w-full pl-9 pr-10 py-2.5 bg-zinc-50/60 border border-zinc-200 rounded-xl text-xs text-zinc-900 placeholder:text-zinc-400 focus:bg-white focus:outline-hidden focus:border-zinc-900 focus:ring-2 focus:ring-zinc-900/10 transition-all font-mono"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute inset-y-0 right-0 pr-3 flex items-center text-zinc-400 hover:text-zinc-700 transition-colors cursor-pointer"
              title={showPassword ? 'Hide passcode' : 'Show passcode'}
            >
              {showPassword ? (
                <EyeOff className="w-4 h-4" />
              ) : (
                <Eye className="w-4 h-4" />
              )}
            </button>
          </div>
        </div>

        <button
          type="submit"
          disabled={loading || !password.trim()}
          className="w-full h-10 rounded-xl bg-zinc-900 hover:bg-zinc-800 active:scale-98 text-white text-xs font-semibold flex items-center justify-center space-x-2 transition-all shadow-xs disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
        >
          {loading ? (
            <>
              <RefreshCw className="w-3.5 h-3.5 animate-spin text-zinc-300" />
              <span>Verifying authorization...</span>
            </>
          ) : (
            <>
              <span>Unlock Workspace</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </>
          )}
        </button>
      </form>

      {/* Security Assurance Footer */}
      <div className="pt-2 border-t border-zinc-100 flex items-center justify-center space-x-1.5 text-[11px] text-zinc-400">
        <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
        <span>HMAC-SHA256 Encrypted • Brute-Force Shield Active</span>
      </div>
    </motion.div>
  );
}

export default function LoginPage() {
  return (
    <div className="min-h-screen bg-[#fafafc] flex items-center justify-center p-4 selection:bg-zinc-900 selection:text-white">
      <Suspense
        fallback={
          <div className="w-full max-w-sm p-8 bg-white border border-zinc-200 rounded-2xl shadow-xl flex items-center justify-center">
            <RefreshCw className="w-5 h-5 animate-spin text-zinc-400" />
          </div>
        }
      >
        <LoginForm />
      </Suspense>
    </div>
  );
}
