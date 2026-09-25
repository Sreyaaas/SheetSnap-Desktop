'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { RedesignHeader as Header } from '@/components/redesign/RedesignHeader';
import {
  FileText,
  Clock,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  RefreshCw,
  Trash2,
  ArrowLeft,
  Search,
  ChevronDown,
  ChevronUp,
  Layers,
  Sparkles,
} from 'lucide-react';

interface SummaryStats {
  total_requests: number;
  session_requests?: number;
  successful_requests: number;
  failed_requests: number;
  success_rate_pct: number;
  prompt_tokens: number;
  candidate_tokens: number;
  total_tokens: number;
  total_tables_extracted?: number;
  estimated_cost_usd: number;
  estimated_cost_inr?: number;
  session_cost_inr?: number;
  session_cost_usd?: number;
  avg_cost_per_doc?: number;
  avg_cost_per_doc_inr?: number;
  avg_tokens_per_doc?: number;
  avg_latency_sec: number;
  currency?: string;
}

interface InvocationRecord {
  id: string;
  session_id?: string;
  document_name?: string;
  timestamp: string;
  model: string;
  status: 'success' | 'error' | string;
  prompt_tokens: number;
  candidate_tokens: number;
  total_tokens: number;
  latency_sec: number;
  cost_inr?: number;
  tables_extracted: number;
  error_message?: string | null;
}

interface AnalyticsData {
  summary: SummaryStats;
  recent_invocations: InvocationRecord[];
  gemini_available?: boolean;
  gemini_model?: string;
}

export default function UsageStatsPage() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'success' | 'error'>('all');
  const [expandedInvocationId, setExpandedInvocationId] = useState<string | null>(null);
  const [showResetModal, setShowResetModal] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<Date>(new Date());

  const API_URL = process.env.NEXT_PUBLIC_API_URL || '/api';

  const fetchAnalytics = useCallback(async (isManual = false) => {
    if (isManual) setRefreshing(true);
    try {
      let sid: string | null = null;
      if (typeof window !== 'undefined') {
        sid = window.sessionStorage.getItem('sheetsnap_session_id');
      }
      const url = sid ? `${API_URL}/analytics?session_id=${encodeURIComponent(sid)}` : `${API_URL}/analytics`;
      const res = await fetch(url, {
        headers: sid ? { 'x-session-id': sid } : {},
      });
      if (!res.ok) {
        throw new Error(`Failed to fetch usage metrics (HTTP ${res.status})`);
      }
      const json: AnalyticsData = await res.json();
      setData(json);
      setError(null);
      setLastRefreshedAt(new Date());
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Backend connection unavailable';
      setError(msg);
    } finally {
      if (isManual) setRefreshing(false);
    }
  }, [API_URL]);

  useEffect(() => {
    let ignore = false;
    async function loadInitial() {
      try {
        let sid: string | null = null;
        if (typeof window !== 'undefined') {
          sid = window.sessionStorage.getItem('sheetsnap_session_id');
        }
        const url = sid ? `${API_URL}/analytics?session_id=${encodeURIComponent(sid)}` : `${API_URL}/analytics`;
        const res = await fetch(url, {
          headers: sid ? { 'x-session-id': sid } : {},
        });
        if (!res.ok) return;
        const json: AnalyticsData = await res.json();
        if (!ignore) {
          setData(json);
          setError(null);
          setLastRefreshedAt(new Date());
        }
      } catch {
        // Handled in subsequent polling
      }
    }
    loadInitial();
    return () => {
      ignore = true;
    };
  }, [API_URL]);

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
      alert(err instanceof Error ? err.message : 'Failed to reset usage data');
    } finally {
      setResetting(false);
    }
  };

  const filteredInvocations = (data?.recent_invocations || []).filter((inv) => {
    const docName = inv.document_name || 'Document Analysis';
    const matchesSearch =
      docName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      inv.model.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (inv.error_message && inv.error_message.toLowerCase().includes(searchQuery.toLowerCase())) ||
      inv.id.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesStatus =
      statusFilter === 'all' ? true : inv.status === statusFilter;

    return matchesSearch && matchesStatus;
  });

  const summary = data?.summary;

  // Derive current session cost & count
  const currentSessionId = typeof window !== 'undefined' ? window.sessionStorage.getItem('sheetsnap_session_id') : null;
  const sessionInvocations = (data?.recent_invocations || []).filter((inv) => {
    if (currentSessionId && inv.session_id) {
      return inv.session_id === currentSessionId;
    }
    const todayStr = new Date().toISOString().split('T')[0];
    return inv.timestamp.startsWith(todayStr);
  });

  const sessionCostInr = summary?.session_cost_inr !== undefined
    ? summary.session_cost_inr
    : sessionInvocations.reduce((acc, curr) => acc + (curr.cost_inr || 0), 0);

  const sessionRequestsCount = summary?.session_requests !== undefined && summary.session_requests > 0
    ? summary.session_requests
    : sessionInvocations.length;

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

  return (
    <div className="min-h-screen bg-[#fafafc] text-zinc-950 flex flex-col antialiased selection:bg-zinc-900 selection:text-white">
      <Header
        geminiAvailable={data?.gemini_available ?? false}
        modelName={(data?.gemini_model || 'Gemini Flash').replace('gemini-', 'Gemini ')}
        activeTab="stats"
      />

      <main className="max-w-6xl w-full mx-auto px-4 sm:px-6 py-8 sm:py-10 flex-1 space-y-6">
        {/* Top Breadcrumb & Control Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-200/80 pb-6">
          <div>
            <div className="flex items-center space-x-2 text-xs text-zinc-500 mb-1.5 font-medium">
              <Link
                href="/"
                className="flex items-center space-x-1 hover:text-zinc-900 transition-colors"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Workspace</span>
              </Link>
              <span>/</span>
              <span className="text-zinc-800">Usage & Costs</span>
            </div>
            <div className="flex items-center space-x-3">
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-zinc-950 font-sans">
                Usage & Costs
              </h1>
              {data?.gemini_available ? (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200/80">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                  Active Telemetry
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                  <span className="h-1.5 w-1.5 rounded-full bg-amber-500"></span>
                  API Key Required
                </span>
              )}
            </div>
            <p className="text-xs sm:text-sm text-zinc-500 mt-1 max-w-xl">
              Real-time tracking of document extractions, processing latency, token usage, and live API costs.
            </p>
          </div>

          {/* Action Toolbar */}
          <div className="flex items-center flex-wrap gap-2.5">
            {/* Auto-refresh toggle */}
            <button
              onClick={() => setAutoRefresh(!autoRefresh)}
              className={`flex items-center space-x-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                autoRefresh
                  ? 'bg-zinc-100 text-zinc-900 border-zinc-300 hover:bg-zinc-200'
                  : 'bg-white text-zinc-600 border-zinc-200 hover:bg-zinc-50'
              }`}
              title={autoRefresh ? 'Auto-refresh active (every 6s)' : 'Auto-refresh paused'}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${autoRefresh ? 'bg-emerald-500' : 'bg-zinc-400'}`}></span>
              <span>{autoRefresh ? 'Live Updating' : 'Paused'}</span>
            </button>

            {/* Manual Refresh Button */}
            <button
              onClick={() => fetchAnalytics(true)}
              disabled={refreshing}
              className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-white border border-zinc-200/90 text-zinc-700 text-xs font-medium hover:bg-zinc-50 active:scale-98 transition-all shadow-2xs disabled:opacity-60 cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin text-zinc-600' : 'text-zinc-500'}`} />
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
              <p className="mt-0.5 text-rose-600">{error}. Ensure your GEMINI_API_KEY is configured in your environment.</p>
            </div>
          </div>
        )}

        {/* 4 Focused KPI Cards (Total Requests, Total Cost Till Now, Current Session Cost, Processing Time) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* 1. Total Requests */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            className="p-5 rounded-2xl bg-white border border-zinc-200/80 shadow-xs flex flex-col justify-between hover:border-zinc-300 transition-colors"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">
                Total Requests
              </span>
              <div className="p-2 rounded-xl bg-blue-50 text-blue-600">
                <Layers className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-3">
              <div className="flex items-baseline space-x-2">
                <span className="text-3xl font-extrabold tracking-tight text-zinc-950 font-sans">
                  {formatNumber(summary?.total_requests)}
                </span>
                <span className="text-xs font-medium text-zinc-500">calls</span>
              </div>
              <div className="mt-3 flex items-center justify-between text-xs pt-3 border-t border-zinc-100 text-zinc-500">
                <span className="font-medium text-zinc-700">
                  {sessionRequestsCount} this session
                </span>
                <span className="text-emerald-600 font-medium">
                  {formatNumber(summary?.successful_requests)} Ok
                </span>
              </div>
            </div>
          </motion.div>

          {/* 2. Total Cost Till Now (All-Time INR) */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.05 }}
            className="p-5 rounded-2xl bg-white border border-zinc-200/80 shadow-xs flex flex-col justify-between hover:border-zinc-300 transition-colors"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">
                Total Cost Till Now
              </span>
              <div className="p-2 rounded-xl bg-emerald-50 text-emerald-700 font-bold text-sm w-8 h-8 flex items-center justify-center">
                ₹
              </div>
            </div>
            <div className="mt-3">
              <div className="flex items-baseline space-x-1.5">
                <span className="text-3xl font-extrabold tracking-tight text-zinc-950 font-sans">
                  ₹{((summary?.estimated_cost_inr ?? 0)).toFixed(2)}
                </span>
                <span className="text-xs font-medium text-zinc-500">INR</span>
              </div>
              <div className="mt-3 flex items-center justify-between text-xs pt-3 border-t border-zinc-100 text-zinc-500">
                <span>All-time spend</span>
                <span className="font-mono text-zinc-600">
                  ${(summary?.estimated_cost_usd ?? 0).toFixed(4)} USD
                </span>
              </div>
            </div>
          </motion.div>

          {/* 3. Current Session Cost (INR) */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.1 }}
            className="p-5 rounded-2xl bg-white border border-zinc-200/80 shadow-xs flex flex-col justify-between hover:border-zinc-300 transition-colors"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">
                Current Session Cost
              </span>
              <div className="p-2 rounded-xl bg-amber-50 text-amber-700">
                <Sparkles className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-3">
              <div className="flex items-baseline space-x-1.5">
                <span className="text-3xl font-extrabold tracking-tight text-zinc-950 font-sans">
                  ₹{sessionCostInr.toFixed(2)}
                </span>
                <span className="text-xs font-medium text-zinc-500">INR</span>
              </div>
              <div className="mt-3 flex items-center justify-between text-xs pt-3 border-t border-zinc-100 text-zinc-500">
                <span>Active session</span>
                <span className="font-mono text-emerald-700 bg-emerald-50 border border-emerald-200/60 px-1.5 py-0.5 rounded text-[11px] font-medium">
                  {sessionRequestsCount} req
                </span>
              </div>
            </div>
          </motion.div>

          {/* 4. Average Time Taken */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.15 }}
            className="p-5 rounded-2xl bg-white border border-zinc-200/80 shadow-xs flex flex-col justify-between hover:border-zinc-300 transition-colors"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">
                Time Taken (Avg)
              </span>
              <div className="p-2 rounded-xl bg-indigo-50 text-indigo-600">
                <Clock className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-3">
              <div className="flex items-baseline space-x-2">
                <span className="text-3xl font-extrabold tracking-tight text-zinc-950 font-sans">
                  {summary?.avg_latency_sec ? summary.avg_latency_sec.toFixed(2) : '0.00'}s
                </span>
                <span className="text-xs font-medium text-zinc-500">per document</span>
              </div>
              <div className="mt-3 flex items-center justify-between text-xs pt-3 border-t border-zinc-100 text-zinc-500">
                <span>Extraction speed</span>
                <span className="text-zinc-700 font-medium font-mono text-[11px]">
                  ~{formatNumber(summary?.avg_tokens_per_doc)} tok/doc
                </span>
              </div>
            </div>
          </motion.div>
        </div>

        {/* Requests Audit Table: "what it was, time taken, tokens, and cost incurred" */}
        <div className="p-6 rounded-2xl bg-white border border-zinc-200/80 shadow-xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-zinc-950">Document Requests & Itemized Costs</h2>
              <p className="text-xs text-zinc-500 mt-0.5">
                Exact log of processed documents, execution duration, tokens consumed, and the cost incurred per request.
              </p>
            </div>

            {/* Filter Controls */}
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Search document name..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-8 pr-3 py-1.5 rounded-lg border border-zinc-200 text-xs text-zinc-800 placeholder:text-zinc-400 bg-zinc-50/50 focus:bg-white focus:border-zinc-400 focus:outline-hidden transition-all w-52"
                />
              </div>

              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as 'all' | 'success' | 'error')}
                className="px-2.5 py-1.5 rounded-lg border border-zinc-200 text-xs text-zinc-700 bg-zinc-50/50 focus:bg-white focus:outline-hidden cursor-pointer"
              >
                <option value="all">All Status</option>
                <option value="success">Completed</option>
                <option value="error">Failed</option>
              </select>
            </div>
          </div>

          {/* Table Container */}
          <div className="overflow-x-auto border border-zinc-200/70 rounded-xl">
            <table className="w-full text-left text-xs">
              <thead className="bg-zinc-50/80 border-b border-zinc-200/80 text-zinc-600 font-semibold">
                <tr>
                  <th className="py-2.5 px-3">Document / Request</th>
                  <th className="py-2.5 px-3 text-right">Time Taken</th>
                  <th className="py-2.5 px-3 text-right">Tokens Used</th>
                  <th className="py-2.5 px-3 text-right">Cost Incurred</th>
                  <th className="py-2.5 px-3 text-center">Status</th>
                  <th className="py-2.5 px-3 text-right">When</th>
                  <th className="py-2.5 px-3 text-center">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 text-zinc-700">
                {filteredInvocations.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-zinc-400">
                      <div className="flex flex-col items-center justify-center space-y-1.5">
                        <FileText className="w-6 h-6 text-zinc-300" />
                        <span className="font-medium text-zinc-500">
                          {searchQuery || statusFilter !== 'all'
                            ? 'No requests match your filter criteria.'
                            : 'No document requests recorded yet. Upload a document in Workspace to begin.'}
                        </span>
                      </div>
                    </td>
                  </tr>
                ) : (
                  filteredInvocations.map((inv) => {
                    const isExpanded = expandedInvocationId === inv.id;
                    const isSuccess = inv.status === 'success';
                    const callCostInr = inv.cost_inr !== undefined
                      ? inv.cost_inr
                      : (((inv.prompt_tokens * 0.075 + inv.candidate_tokens * 0.3) / 1_000_000) * 86.5);

                    const displayName = inv.document_name || 'Document Analysis';

                    return (
                      <React.Fragment key={inv.id}>
                        <tr className="hover:bg-zinc-50/70 transition-colors">
                          {/* Document Name ("What it was") */}
                          <td className="py-2.5 px-3 whitespace-nowrap">
                            <div className="flex items-center space-x-2.5">
                              <div className="p-1.5 rounded-md bg-zinc-100 text-zinc-600 shrink-0">
                                <FileText className="w-3.5 h-3.5" />
                              </div>
                              <div className="flex flex-col min-w-0">
                                <span className="font-medium text-zinc-900 truncate max-w-[240px] sm:max-w-xs" title={displayName}>
                                  {displayName}
                                </span>
                                <span className="text-[10px] text-zinc-400">
                                  {inv.tables_extracted || 0} table{inv.tables_extracted === 1 ? '' : 's'} extracted
                                </span>
                              </div>
                            </div>
                          </td>

                          {/* Time Taken */}
                          <td className="py-2.5 px-3 text-right font-mono text-zinc-700 whitespace-nowrap">
                            {inv.latency_sec ? `${inv.latency_sec}s` : '—'}
                          </td>

                          {/* Tokens */}
                          <td className="py-2.5 px-3 text-right font-mono text-zinc-700 whitespace-nowrap" title={`${formatNumber(inv.prompt_tokens)} in / ${formatNumber(inv.candidate_tokens)} out`}>
                            {formatNumber(inv.total_tokens)}
                          </td>

                          {/* Cost Incurred */}
                          <td className="py-2.5 px-3 text-right font-mono font-medium text-zinc-900 whitespace-nowrap">
                            {callCostInr < 0.01 ? '< ₹0.01' : `₹${callCostInr.toFixed(3)}`}
                          </td>

                          {/* Status */}
                          <td className="py-2.5 px-3 text-center whitespace-nowrap">
                            {isSuccess ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200/60">
                                <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                                Completed
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-rose-50 text-rose-700 border border-rose-200/60">
                                <XCircle className="w-3 h-3 text-rose-500" />
                                Failed
                              </span>
                            )}
                          </td>

                          {/* Timestamp */}
                          <td className="py-2.5 px-3 text-right whitespace-nowrap text-zinc-500 text-[11px]">
                            {formatRelativeTime(inv.timestamp)}
                          </td>

                          {/* Error or Details toggle */}
                          <td className="py-2.5 px-3 text-center whitespace-nowrap">
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
                            <td colSpan={7} className="p-3 text-xs text-rose-800 font-mono border-t border-rose-100">
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
            <span>Showing {filteredInvocations.length} of {data?.recent_invocations.length || 0} recorded requests</span>
            <span>Last updated: {lastRefreshedAt.toLocaleTimeString()}</span>
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
                  <h3 className="text-base font-semibold text-zinc-950">Reset Usage History?</h3>
                  <p className="text-xs text-zinc-500">This action will clear all local tracking data.</p>
                </div>
              </div>

              <p className="text-xs text-zinc-600 leading-relaxed">
                Resetting will clear the total request count, token usage metrics, and the recent request history log.
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
