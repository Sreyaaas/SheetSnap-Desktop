'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { Header } from '@/components/Header';
import {
  Activity,
  Sparkles,
  Zap,
  Clock,
  Coins,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  RefreshCw,
  Trash2,
  ArrowLeft,
  Search,
  Layers,
  ChevronDown,
  ChevronUp,
  Info,
  ShieldCheck,
  Calendar,
  BarChart3,
  Flame,
} from 'lucide-react';

interface SummaryStats {
  total_requests: number;
  successful_requests: number;
  failed_requests: number;
  success_rate_pct: number;
  prompt_tokens: number;
  candidate_tokens: number;
  total_tokens: number;
  estimated_cost_usd: number;
  avg_latency_sec: number;
}

interface QuotaStats {
  daily_limit: number;
  today_requests: number;
  today_tokens: number;
  requests_left_today: number;
  daily_pct_used: number;
  minute_limit: number;
  recent_minute_requests: number;
  requests_left_minute: number;
  minute_pct_used: number;
  tier_name: string;
}

interface DailyRecord {
  date: string;
  requests: number;
  tokens: number;
}

interface InvocationRecord {
  id: string;
  timestamp: string;
  model: string;
  status: 'success' | 'error' | string;
  prompt_tokens: number;
  candidate_tokens: number;
  total_tokens: number;
  latency_sec: number;
  tables_extracted: number;
  error_message?: string | null;
}

interface AnalyticsData {
  summary: SummaryStats;
  quota: QuotaStats;
  daily_history?: DailyRecord[];
  recent_invocations: InvocationRecord[];
  gemini_available?: boolean;
  gemini_model?: string;
}

export default function AIStatsPage() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'success' | 'error'>('all');
  const [expandedInvocationId, setExpandedInvocationId] = useState<string | null>(null);
  const [showResetModal, setShowResetModal] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<Date>(new Date());

  const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000';

  const fetchAnalytics = useCallback(async (isManual = false) => {
    if (isManual) setRefreshing(true);
    try {
      const res = await fetch(`${API_URL}/analytics`);
      if (!res.ok) {
        throw new Error(`Failed to fetch AI telemetry (HTTP ${res.status})`);
      }
      const json: AnalyticsData = await res.json();
      setData(json);
      setError(null);
      setLastRefreshedAt(new Date());
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Backend connection unavailable';
      setError(msg);
    } finally {
      setLoading(false);
      if (isManual) setRefreshing(false);
    }
  }, [API_URL]);

  useEffect(() => {
    fetchAnalytics(false);
  }, [fetchAnalytics]);

  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(() => {
      fetchAnalytics(false);
    }, 6000);
    return () => clearInterval(interval);
  }, [autoRefresh, fetchAnalytics]);

  const handleResetTelemetry = async () => {
    setResetting(true);
    try {
      const res = await fetch(`${API_URL}/analytics/reset`, {
        method: 'POST',
      });
      if (!res.ok) {
        throw new Error(`Reset failed (HTTP ${res.status})`);
      }
      setShowResetModal(false);
      await fetchAnalytics(true);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to reset telemetry');
    } finally {
      setResetting(false);
    }
  };

  const filteredInvocations = (data?.recent_invocations || []).filter((inv) => {
    const matchesSearch =
      inv.model.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (inv.error_message && inv.error_message.toLowerCase().includes(searchQuery.toLowerCase())) ||
      inv.id.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesStatus =
      statusFilter === 'all' ? true : inv.status === statusFilter;

    return matchesSearch && matchesStatus;
  });

  const summary = data?.summary;
  const quota = data?.quota;

  const formatNumber = (num?: number) => {
    if (num === undefined || num === null) return '0';
    return num.toLocaleString();
  };

  const formatRelativeTime = (isoString: string) => {
    try {
      const date = new Date(isoString);
      const now = new Date();
      const diffSec = Math.floor((now.getTime() - date.getTime()) / 1000);
      if (diffSec < 10) return 'just now';
      if (diffSec < 60) return `${diffSec}s ago`;
      const diffMin = Math.floor(diffSec / 60);
      if (diffMin < 60) return `${diffMin}m ago`;
      const diffHr = Math.floor(diffMin / 60);
      if (diffHr < 24) return `${diffHr}h ago`;
      return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    } catch {
      return isoString;
    }
  };

  // Compute daily chart max token / request values
  const dailyHistory = data?.daily_history || [];
  const maxDailyRequests = Math.max(...dailyHistory.map((d) => d.requests), 5);

  return (
    <div className="min-h-screen bg-[#fafafc] text-zinc-950 flex flex-col antialiased selection:bg-zinc-900 selection:text-white">
      <Header
        geminiAvailable={data?.gemini_available ?? false}
        modelName={(data?.gemini_model || 'Gemini Flash').replace('gemini-', 'Gemini ')}
        activeTab="stats"
      />

      <main className="max-w-6xl w-full mx-auto px-4 sm:px-6 py-8 sm:py-10 flex-1 space-y-8">
        {/* Top Breadcrumb & Control Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-200/80 pb-6">
          <div>
            <div className="flex items-center space-x-2 text-xs text-zinc-500 mb-1.5 font-medium">
              <Link
                href="/"
                className="flex items-center space-x-1 hover:text-zinc-900 transition-colors"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Document Studio</span>
              </Link>
              <span>/</span>
              <span className="text-zinc-800">Telemetry & Analytics</span>
            </div>
            <div className="flex items-center space-x-3">
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-zinc-950 font-sans">
                AI Usage & Quota Stats
              </h1>
              {data?.gemini_available ? (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200/80">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                  Active Telemetry
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-zinc-100 text-zinc-600 border border-zinc-200">
                  <span className="h-1.5 w-1.5 rounded-full bg-zinc-400"></span>
                  Local OCR Primary
                </span>
              )}
            </div>
            <p className="text-xs sm:text-sm text-zinc-500 mt-1 max-w-xl">
              Live token consumption, Google Gemini API request limits, rate quota velocity, and per-call latency telemetry.
            </p>
          </div>

          {/* Action Toolbar */}
          <div className="flex items-center flex-wrap gap-2.5">
            {/* Auto-refresh toggle */}
            <button
              onClick={() => setAutoRefresh(!autoRefresh)}
              className={`flex items-center space-x-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                autoRefresh
                  ? 'bg-purple-50 text-purple-700 border-purple-200 hover:bg-purple-100/70'
                  : 'bg-white text-zinc-600 border-zinc-200 hover:bg-zinc-50'
              }`}
              title={autoRefresh ? 'Auto-refresh active (every 6s)' : 'Auto-refresh paused'}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${autoRefresh ? 'bg-purple-500 animate-ping' : 'bg-zinc-400'}`}></span>
              <span>{autoRefresh ? 'Live Polling' : 'Polling Paused'}</span>
            </button>

            {/* Manual Refresh Button */}
            <button
              onClick={() => fetchAnalytics(true)}
              disabled={refreshing}
              className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-white border border-zinc-200/90 text-zinc-700 text-xs font-medium hover:bg-zinc-50 active:scale-98 transition-all shadow-2xs disabled:opacity-60 cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin text-purple-600' : 'text-zinc-500'}`} />
              <span>Refresh</span>
            </button>

            {/* Reset Data Button */}
            <button
              onClick={() => setShowResetModal(true)}
              className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-white border border-rose-200/80 text-rose-700 text-xs font-medium hover:bg-rose-50/70 active:scale-98 transition-all shadow-2xs cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5 text-rose-500" />
              <span>Reset</span>
            </button>
          </div>
        </div>

        {/* Backend Error Banner if any */}
        {error && (
          <div className="p-4 rounded-xl bg-rose-50/80 border border-rose-200 text-rose-800 text-xs flex items-start space-x-2.5">
            <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">Unable to sync with telemetry backend</p>
              <p className="mt-0.5 text-rose-600">{error}. Ensure the SheetSnap backend is running at {API_URL}.</p>
            </div>
          </div>
        )}

        {/* 6 Primary KPI Summary Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {/* 1. Requests Made & Success Rate */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            className="p-5 rounded-2xl bg-white border border-zinc-200/80 shadow-xs flex flex-col justify-between hover:border-zinc-300 transition-colors"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">
                Total API Requests
              </span>
              <div className="p-2 rounded-xl bg-blue-50 text-blue-600">
                <Activity className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-3">
              <div className="flex items-baseline space-x-2">
                <span className="text-3xl font-extrabold tracking-tight text-zinc-950 font-sans">
                  {formatNumber(summary?.total_requests)}
                </span>
                <span className="text-xs font-medium text-zinc-500">invocations</span>
              </div>
              <div className="mt-3 flex items-center justify-between text-xs pt-3 border-t border-zinc-100">
                <div className="flex items-center space-x-1.5 text-emerald-600 font-medium">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>{formatNumber(summary?.successful_requests)} Ok</span>
                </div>
                <div className="flex items-center space-x-1.5 text-rose-600 font-medium">
                  <XCircle className="w-3.5 h-3.5" />
                  <span>{formatNumber(summary?.failed_requests)} Failed</span>
                </div>
                <span className="px-2 py-0.5 rounded bg-zinc-100 text-zinc-700 font-mono font-medium">
                  {summary?.success_rate_pct ?? 100}%
                </span>
              </div>
            </div>
          </motion.div>

          {/* 2. Tokens Consumed */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.05 }}
            className="p-5 rounded-2xl bg-white border border-zinc-200/80 shadow-xs flex flex-col justify-between hover:border-zinc-300 transition-colors"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">
                Total Tokens Used
              </span>
              <div className="p-2 rounded-xl bg-purple-50 text-purple-600">
                <Sparkles className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-3">
              <div className="flex items-baseline space-x-2">
                <span className="text-3xl font-extrabold tracking-tight text-zinc-950 font-sans">
                  {formatNumber(summary?.total_tokens)}
                </span>
                <span className="text-xs font-medium text-zinc-500">tokens</span>
              </div>
              <div className="mt-3 flex items-center justify-between text-xs pt-3 border-t border-zinc-100 text-zinc-600">
                <div title="Image payload & extraction prompt tokens">
                  <span className="text-zinc-400">Prompt: </span>
                  <span className="font-mono font-medium text-zinc-800">{formatNumber(summary?.prompt_tokens)}</span>
                </div>
                <div title="JSON table response tokens">
                  <span className="text-zinc-400">Output: </span>
                  <span className="font-mono font-medium text-zinc-800">{formatNumber(summary?.candidate_tokens)}</span>
                </div>
              </div>
            </div>
          </motion.div>

          {/* 3. Daily Quota Remaining */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.1 }}
            className="p-5 rounded-2xl bg-white border border-zinc-200/80 shadow-xs flex flex-col justify-between hover:border-zinc-300 transition-colors"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">
                Daily Requests Left
              </span>
              <div className="p-2 rounded-xl bg-emerald-50 text-emerald-600">
                <Zap className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-3">
              <div className="flex items-baseline space-x-2">
                <span className="text-3xl font-extrabold tracking-tight text-zinc-950 font-sans">
                  {formatNumber(quota?.requests_left_today)}
                </span>
                <span className="text-xs font-medium text-zinc-500">
                  / {formatNumber(quota?.daily_limit)} max
                </span>
              </div>
              <div className="mt-3 space-y-1.5 pt-3 border-t border-zinc-100">
                <div className="flex items-center justify-between text-[11px] text-zinc-500">
                  <span>Today&apos;s usage: {formatNumber(quota?.today_requests)} reqs</span>
                  <span className="font-semibold text-zinc-700">{quota?.daily_pct_used ?? 0}%</span>
                </div>
                <div className="h-1.5 w-full rounded-full bg-zinc-100 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${
                      (quota?.daily_pct_used ?? 0) > 85
                        ? 'bg-rose-500'
                        : (quota?.daily_pct_used ?? 0) > 50
                        ? 'bg-amber-500'
                        : 'bg-emerald-500'
                    }`}
                    style={{ width: `${Math.min(100, quota?.daily_pct_used || 0)}%` }}
                  ></div>
                </div>
              </div>
            </div>
          </motion.div>

          {/* 4. Minute Rate Limit (RPM) */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.15 }}
            className="p-5 rounded-2xl bg-white border border-zinc-200/80 shadow-xs flex flex-col justify-between hover:border-zinc-300 transition-colors"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">
                Burst Rate (RPM)
              </span>
              <div className="p-2 rounded-xl bg-amber-50 text-amber-600">
                <Flame className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-3">
              <div className="flex items-baseline space-x-2">
                <span className="text-3xl font-extrabold tracking-tight text-zinc-950 font-sans">
                  {formatNumber(quota?.requests_left_minute)}
                </span>
                <span className="text-xs font-medium text-zinc-500">
                  / {quota?.minute_limit ?? 15} left (60s)
                </span>
              </div>
              <div className="mt-3 space-y-1.5 pt-3 border-t border-zinc-100">
                <div className="flex items-center justify-between text-[11px] text-zinc-500">
                  <span>Rolling window: {quota?.recent_minute_requests ?? 0} used</span>
                  <span className="font-semibold text-zinc-700">{quota?.minute_pct_used ?? 0}%</span>
                </div>
                <div className="h-1.5 w-full rounded-full bg-zinc-100 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${
                      (quota?.minute_pct_used ?? 0) > 80
                        ? 'bg-rose-500'
                        : (quota?.minute_pct_used ?? 0) > 40
                        ? 'bg-amber-500'
                        : 'bg-emerald-500'
                    }`}
                    style={{ width: `${Math.min(100, quota?.minute_pct_used || 0)}%` }}
                  ></div>
                </div>
              </div>
            </div>
          </motion.div>

          {/* 5. Estimated API Cost */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.2 }}
            className="p-5 rounded-2xl bg-white border border-zinc-200/80 shadow-xs flex flex-col justify-between hover:border-zinc-300 transition-colors"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">
                Estimated Cost
              </span>
              <div className="p-2 rounded-xl bg-emerald-50 text-emerald-600">
                <Coins className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-3">
              <div className="flex items-baseline space-x-2">
                <span className="text-3xl font-extrabold tracking-tight text-zinc-950 font-sans">
                  ${(summary?.estimated_cost_usd ?? 0).toFixed(4)}
                </span>
                <span className="text-xs font-medium text-zinc-500">USD</span>
              </div>
              <div className="mt-3 flex items-center justify-between text-xs pt-3 border-t border-zinc-100 text-zinc-500">
                <span>Free Tier Baseline</span>
                <span className="font-mono text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded text-[11px] font-medium">
                  $0.00 Incurred
                </span>
              </div>
            </div>
          </motion.div>

          {/* 6. Average Latency */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.25 }}
            className="p-5 rounded-2xl bg-white border border-zinc-200/80 shadow-xs flex flex-col justify-between hover:border-zinc-300 transition-colors"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">
                Avg Response Latency
              </span>
              <div className="p-2 rounded-xl bg-indigo-50 text-indigo-600">
                <Clock className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-3">
              <div className="flex items-baseline space-x-2">
                <span className="text-3xl font-extrabold tracking-tight text-zinc-950 font-sans">
                  {summary?.avg_latency_sec ? summary.avg_latency_sec.toFixed(2) : '0.00'}
                </span>
                <span className="text-xs font-medium text-zinc-500">seconds / call</span>
              </div>
              <div className="mt-3 flex items-center justify-between text-xs pt-3 border-t border-zinc-100 text-zinc-500">
                <span>Target SLA</span>
                <span className="text-zinc-700 font-medium">&lt; 3.5s VLM</span>
              </div>
            </div>
          </motion.div>
        </div>

        {/* Mid-tier Grid: Daily Usage Trends & Quota Rules */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Daily Usage History Chart */}
          <div className="lg:col-span-2 p-6 rounded-2xl bg-white border border-zinc-200/80 shadow-xs">
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center space-x-2.5">
                <BarChart3 className="w-4 h-4 text-purple-600" />
                <h2 className="text-sm font-semibold text-zinc-950">Daily Activity & Request Velocity</h2>
              </div>
              <span className="text-xs text-zinc-400 font-medium">Recent 14 Days</span>
            </div>

            {dailyHistory.length === 0 ? (
              <div className="h-44 flex flex-col items-center justify-center text-center p-4 border border-dashed border-zinc-200 rounded-xl">
                <Calendar className="w-8 h-8 text-zinc-300 mb-2" />
                <p className="text-xs font-medium text-zinc-600">No daily history recorded yet</p>
                <p className="text-[11px] text-zinc-400 mt-0.5">
                  Process documents in AI mode to generate daily activity timelines.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="h-44 flex items-end gap-2 pt-6 pb-2 px-2 border-b border-zinc-100">
                  {dailyHistory.map((d) => {
                    const heightPct = Math.max(8, Math.round((d.requests / maxDailyRequests) * 100));
                    return (
                      <div key={d.date} className="flex-1 flex flex-col items-center group relative h-full justify-end">
                        {/* Tooltip on hover */}
                        <div className="absolute -top-12 z-20 hidden group-hover:flex flex-col items-center pointer-events-none bg-zinc-900 text-white text-[10px] px-2 py-1 rounded shadow-lg whitespace-nowrap">
                          <span className="font-semibold">{d.date}</span>
                          <span>{d.requests} requests ({d.tokens.toLocaleString()} tokens)</span>
                        </div>
                        {/* Bar */}
                        <div
                          style={{ height: `${heightPct}%` }}
                          className="w-full max-w-[28px] rounded-t-md bg-purple-500/80 group-hover:bg-purple-600 transition-all cursor-pointer"
                        ></div>
                        <span className="text-[9px] text-zinc-400 mt-1 truncate w-full text-center">
                          {d.date.slice(5)}
                        </span>
                      </div>
                    );
                  })}
                </div>
                <div className="flex items-center justify-between text-xs text-zinc-500 px-1">
                  <span>Today: <strong className="text-zinc-800">{quota?.today_requests ?? 0}</strong> requests</span>
                  <span>Tokens today: <strong className="text-zinc-800">{formatNumber(quota?.today_tokens)}</strong></span>
                </div>
              </div>
            )}
          </div>

          {/* Quota & Tier Reference Card */}
          <div className="p-6 rounded-2xl bg-white border border-zinc-200/80 shadow-xs flex flex-col justify-between">
            <div>
              <div className="flex items-center space-x-2.5 mb-4">
                <ShieldCheck className="w-4 h-4 text-emerald-600" />
                <h2 className="text-sm font-semibold text-zinc-950">API Tier & Quotas</h2>
              </div>
              <p className="text-xs text-zinc-600 leading-relaxed">
                SheetSnap connects directly to your Google Gemini Developer project. Your limits automatically reset daily at <strong>00:00 UTC</strong>.
              </p>

              <div className="mt-4 space-y-3">
                <div className="p-3 rounded-xl bg-zinc-50 border border-zinc-100 flex items-center justify-between text-xs">
                  <span className="text-zinc-500">Tier Profile</span>
                  <span className="font-medium text-zinc-800">{quota?.tier_name || 'Gemini Free Tier'}</span>
                </div>

                <div className="p-3 rounded-xl bg-zinc-50 border border-zinc-100 flex items-center justify-between text-xs">
                  <span className="text-zinc-500">Daily Limit (RPD)</span>
                  <span className="font-mono font-medium text-zinc-800">{formatNumber(quota?.daily_limit)} calls/day</span>
                </div>

                <div className="p-3 rounded-xl bg-zinc-50 border border-zinc-100 flex items-center justify-between text-xs">
                  <span className="text-zinc-500">Rate Limit (RPM)</span>
                  <span className="font-mono font-medium text-zinc-800">{quota?.minute_limit ?? 15} calls/min</span>
                </div>

                <div className="p-3 rounded-xl bg-zinc-50 border border-zinc-100 flex items-center justify-between text-xs">
                  <span className="text-zinc-500">Active Model</span>
                  <span className="font-mono text-[11px] font-medium text-purple-700 bg-purple-50 px-1.5 py-0.5 rounded border border-purple-200/70">
                    {data?.gemini_model || 'gemini-3.6-flash'}
                  </span>
                </div>
              </div>
            </div>

            <div className="mt-4 pt-4 border-t border-zinc-100 flex items-center space-x-2 text-[11px] text-zinc-400">
              <Info className="w-3.5 h-3.5 shrink-0" />
              <span>Telemetry data is stored strictly on your local machine.</span>
            </div>
          </div>
        </div>

        {/* Recent Invocations Audit Log Table */}
        <div className="p-6 rounded-2xl bg-white border border-zinc-200/80 shadow-xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-zinc-950">Recent Invocations Audit Log</h2>
              <p className="text-xs text-zinc-500 mt-0.5">
                Detailed record of the last {data?.recent_invocations.length || 0} Gemini table extractions.
              </p>
            </div>

            {/* Filter Controls */}
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Filter calls or errors..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-8 pr-3 py-1.5 rounded-lg border border-zinc-200 text-xs text-zinc-800 placeholder:text-zinc-400 bg-zinc-50/50 focus:bg-white focus:border-zinc-400 focus:outline-hidden transition-all w-48"
                />
              </div>

              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as 'all' | 'success' | 'error')}
                className="px-2.5 py-1.5 rounded-lg border border-zinc-200 text-xs text-zinc-700 bg-zinc-50/50 focus:bg-white focus:outline-hidden cursor-pointer"
              >
                <option value="all">All Status</option>
                <option value="success">Success Only</option>
                <option value="error">Failed Only</option>
              </select>
            </div>
          </div>

          {/* Table Container */}
          <div className="overflow-x-auto border border-zinc-200/70 rounded-xl">
            <table className="w-full text-left text-xs">
              <thead className="bg-zinc-50/80 border-b border-zinc-200/80 text-zinc-600 font-semibold">
                <tr>
                  <th className="py-2.5 px-3">Time</th>
                  <th className="py-2.5 px-3">Status</th>
                  <th className="py-2.5 px-3">Model</th>
                  <th className="py-2.5 px-3 text-right">Prompt</th>
                  <th className="py-2.5 px-3 text-right">Output</th>
                  <th className="py-2.5 px-3 text-right">Total Tokens</th>
                  <th className="py-2.5 px-3 text-right">Latency</th>
                  <th className="py-2.5 px-3 text-center">Tables</th>
                  <th className="py-2.5 px-3 text-center">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 text-zinc-700">
                {filteredInvocations.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-8 text-center text-zinc-400">
                      {searchQuery || statusFilter !== 'all'
                        ? 'No calls match your filter criteria.'
                        : 'No AI invocations recorded yet. Upload a document in Studio to get started.'}
                    </td>
                  </tr>
                ) : (
                  filteredInvocations.map((inv) => {
                    const isExpanded = expandedInvocationId === inv.id;
                    const isSuccess = inv.status === 'success';

                    return (
                      <React.Fragment key={inv.id}>
                        <tr className="hover:bg-zinc-50/70 transition-colors">
                          <td className="py-2.5 px-3 whitespace-nowrap text-zinc-500 font-mono text-[11px]">
                            {formatRelativeTime(inv.timestamp)}
                          </td>
                          <td className="py-2.5 px-3 whitespace-nowrap">
                            {isSuccess ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200/60">
                                <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                                Success
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-rose-50 text-rose-700 border border-rose-200/60">
                                <XCircle className="w-3 h-3 text-rose-500" />
                                Error
                              </span>
                            )}
                          </td>
                          <td className="py-2.5 px-3 font-mono text-[11px] text-zinc-800">
                            {inv.model}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono text-zinc-600">
                            {formatNumber(inv.prompt_tokens)}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono text-zinc-600">
                            {formatNumber(inv.candidate_tokens)}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono font-semibold text-zinc-900">
                            {formatNumber(inv.total_tokens)}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono text-zinc-600">
                            {inv.latency_sec ? `${inv.latency_sec}s` : '—'}
                          </td>
                          <td className="py-2.5 px-3 text-center">
                            <span className="px-1.5 py-0.5 rounded bg-zinc-100 text-zinc-700 font-mono text-[11px]">
                              {inv.tables_extracted || 0}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-center">
                            {inv.error_message ? (
                              <button
                                onClick={() => setExpandedInvocationId(isExpanded ? null : inv.id)}
                                className="p-1 rounded hover:bg-zinc-100 text-zinc-500 transition-colors cursor-pointer"
                                title="Toggle error details"
                              >
                                {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5 text-rose-500" />}
                              </button>
                            ) : (
                              <span className="text-zinc-300">—</span>
                            )}
                          </td>
                        </tr>

                        {/* Error Message Expansion Row */}
                        {isExpanded && inv.error_message && (
                          <tr className="bg-rose-50/50">
                            <td colSpan={9} className="p-3 text-xs text-rose-800 font-mono border-t border-rose-100">
                              <div className="flex items-start space-x-2">
                                <AlertTriangle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
                                <div className="space-y-1">
                                  <p className="font-semibold">Error Diagnostic:</p>
                                  <p className="text-[11px] text-rose-700 whitespace-pre-wrap">{inv.error_message}</p>
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between text-[11px] text-zinc-400 pt-2">
            <span>Showing {filteredInvocations.length} of {data?.recent_invocations.length || 0} recorded invocations</span>
            <span>Last refreshed: {lastRefreshedAt.toLocaleTimeString()}</span>
          </div>
        </div>
      </main>

      {/* Confirmation Modal for Resetting Telemetry */}
      <AnimatePresence>
        {showResetModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-950/40 backdrop-blur-xs">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-md p-6 rounded-2xl bg-white border border-zinc-200 shadow-xl space-y-4"
            >
              <div className="flex items-center space-x-3">
                <div className="p-2.5 rounded-xl bg-rose-100 text-rose-600">
                  <Trash2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-semibold text-zinc-950">Reset AI Telemetry?</h3>
                  <p className="text-xs text-zinc-500">This action will clear all local tracking data.</p>
                </div>
              </div>

              <p className="text-xs text-zinc-600 leading-relaxed">
                Resetting will clear the total request count, token usage metrics, daily history, and the recent invocation audit log.
                This cannot be undone.
              </p>

              <div className="flex items-center justify-end space-x-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setShowResetModal(false)}
                  disabled={resetting}
                  className="px-3.5 py-2 rounded-xl border border-zinc-200 text-xs font-medium text-zinc-700 hover:bg-zinc-50 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleResetTelemetry}
                  disabled={resetting}
                  className="px-3.5 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-xs font-medium text-white transition-colors flex items-center space-x-1.5 shadow-xs disabled:opacity-60 cursor-pointer"
                >
                  {resetting && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                  <span>Confirm Reset</span>
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
