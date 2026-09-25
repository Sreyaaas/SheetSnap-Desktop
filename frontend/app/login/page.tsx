'use client';

import React, { useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { motion } from 'framer-motion';
import { Layers, Eye, EyeOff, RefreshCw } from 'lucide-react';

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
        throw new Error(data.detail || data.error || 'Incorrect password');
      }

      router.push(redirectPath);
      router.refresh();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Incorrect password';
      setError(msg);
      setLoading(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: 'easeOut' }}
      className="w-full max-w-[340px] p-6 sm:p-7 bg-white border border-zinc-200/80 rounded-xl shadow-xs space-y-5"
    >
      {/* Brand Header */}
      <div className="flex flex-col items-center text-center space-y-2">
        <div className="h-10 w-10 rounded-lg bg-zinc-900 text-white flex items-center justify-center shadow-2xs">
          <Layers className="w-5 h-5 text-emerald-400" />
        </div>
        <div className="space-y-0.5">
          <h1 className="text-base font-semibold text-zinc-900 tracking-tight">
            SheetSnap
          </h1>
          <p className="text-xs text-zinc-500">
            Enter your password to continue
          </p>
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div className="p-2.5 rounded-lg bg-rose-50 border border-rose-200/80 text-rose-700 text-xs text-center font-medium">
          {error}
        </div>
      )}

      {/* Form */}
      <form onSubmit={handleSubmit} className="space-y-3.5">
        <div className="relative">
          <input
            id="password"
            type={showPassword ? 'text' : 'password'}
            autoComplete="current-password"
            autoFocus
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            className="w-full px-3 pr-9 py-2 bg-zinc-50/50 hover:bg-zinc-50 focus:bg-white border border-zinc-200 rounded-lg text-xs text-zinc-900 placeholder:text-zinc-400 focus:outline-hidden focus:border-zinc-900 focus:ring-1 focus:ring-zinc-900 transition-colors"
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute inset-y-0 right-0 pr-2.5 flex items-center text-zinc-400 hover:text-zinc-600 transition-colors cursor-pointer"
            title={showPassword ? 'Hide password' : 'Show password'}
          >
            {showPassword ? (
              <EyeOff className="w-3.5 h-3.5" />
            ) : (
              <Eye className="w-3.5 h-3.5" />
            )}
          </button>
        </div>

        <button
          type="submit"
          disabled={loading || !password.trim()}
          className="w-full h-9 rounded-lg bg-zinc-900 hover:bg-zinc-800 active:scale-[0.99] text-white text-xs font-medium flex items-center justify-center space-x-1.5 transition-all disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
        >
          {loading ? (
            <RefreshCw className="w-3.5 h-3.5 animate-spin text-zinc-300" />
          ) : (
            <span>Continue</span>
          )}
        </button>
      </form>
    </motion.div>
  );
}

export default function LoginPage() {
  return (
    <div className="min-h-screen bg-zinc-50 flex items-center justify-center p-4 selection:bg-zinc-900 selection:text-white">
      <Suspense
        fallback={
          <div className="w-full max-w-[340px] p-6 bg-white border border-zinc-200/80 rounded-xl shadow-xs flex items-center justify-center">
            <RefreshCw className="w-4 h-4 animate-spin text-zinc-400" />
          </div>
        }
      >
        <LoginForm />
      </Suspense>
    </div>
  );
}
