'use client';

import React from 'react';
import Link from 'next/link';
import { Layers, BarChart3, ShieldCheck, Sparkles } from 'lucide-react';

interface RedesignHeaderProps {
  geminiAvailable?: boolean;
  modelName?: string;
  activeTab?: 'workspace' | 'stats';
}

export const RedesignHeader: React.FC<RedesignHeaderProps> = ({
  geminiAvailable = true,
  modelName = 'Gemini 3.6 Flash',
  activeTab = 'workspace',
}) => {
  return (
    <header className="w-full h-12 bg-white border-b border-zinc-200 sticky top-0 z-40 select-none">
      <div className="h-full px-4 flex items-center justify-between gap-4">
        {/* Brand & Workspace Mode */}
        <div className="flex items-center space-x-3 shrink-0">
          <Link href="/" className="flex items-center space-x-3 group">
            <div className="h-7 w-7 rounded-md bg-zinc-900 flex items-center justify-center text-white">
              <Layers className="w-4 h-4 text-emerald-400" />
            </div>
            <div className="flex items-center space-x-2">
              <span className="text-xs font-bold tracking-tight text-zinc-900">
                SheetSnap
              </span>
              <span className="text-[10px] font-mono font-medium px-1.5 py-0.5 rounded bg-zinc-100 text-zinc-600 border border-zinc-200">
                AI Pro
              </span>
            </div>
          </Link>
        </div>

        {/* Center Navigation Switcher */}
        <nav className="flex items-center gap-1 text-xs font-medium">
          <Link
            href="/"
            className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-md transition-colors ${
              activeTab === 'workspace'
                ? 'bg-zinc-100 text-zinc-900 font-semibold border border-zinc-200/80'
                : 'text-zinc-500 hover:text-zinc-900 hover:bg-zinc-50'
            }`}
          >
            <Layers className="w-3.5 h-3.5 text-zinc-700" />
            <span>Workspace</span>
          </Link>

          <Link
            href="/stats"
            className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-md transition-colors ${
              activeTab === 'stats'
                ? 'bg-zinc-100 text-zinc-900 font-semibold border border-zinc-200/80'
                : 'text-zinc-500 hover:text-zinc-900 hover:bg-zinc-50'
            }`}
          >
            <BarChart3 className="w-3.5 h-3.5 text-zinc-500" />
            <span>AI Telemetry</span>
          </Link>
        </nav>

        {/* Right Status Indicator */}
        <div className="flex items-center space-x-2 text-xs shrink-0">
          {geminiAvailable ? (
            <div className="flex items-center space-x-1.5 px-2.5 py-1 rounded-md bg-purple-50 border border-purple-200 text-purple-700 text-[11px] font-medium font-mono shadow-2xs">
              <Sparkles className="w-3 h-3 text-purple-600" />
              <span>{modelName}</span>
            </div>
          ) : (
            <div className="flex items-center space-x-1.5 px-2.5 py-1 rounded-md bg-amber-50 border border-amber-200 text-amber-700 text-[11px] font-medium shadow-2xs">
              <ShieldCheck className="w-3 h-3 text-amber-600" />
              <span>API Key Required</span>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
