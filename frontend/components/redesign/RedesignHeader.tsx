'use client';

import React from 'react';
import Link from 'next/link';
import { Layers, BarChart3, ShieldCheck, Sparkles, ExternalLink, Cpu } from 'lucide-react';

interface RedesignHeaderProps {
  geminiAvailable?: boolean;
  modelName?: string;
}

export const RedesignHeader: React.FC<RedesignHeaderProps> = ({
  geminiAvailable = false,
  modelName = 'Gemini Flash',
}) => {
  return (
    <header className="w-full h-12 bg-white border-b border-zinc-200 sticky top-0 z-40 select-none">
      <div className="h-full px-4 flex items-center justify-between gap-4">
        {/* Brand & Workspace Mode */}
        <div className="flex items-center space-x-3 shrink-0">
          <div className="h-7 w-7 rounded-md bg-zinc-900 flex items-center justify-center text-white">
            <Layers className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="flex items-center space-x-2">
            <span className="text-xs font-bold tracking-tight text-zinc-900">
              SheetSnap by Zamil
            </span>
            <span className="text-[10px] font-mono font-medium px-1.5 py-0.5 rounded bg-zinc-100 text-zinc-600 border border-zinc-200">
              Desktop Pro
            </span>
          </div>
        </div>

        {/* Center Navigation Switcher */}
        <nav className="flex items-center gap-1 text-xs font-medium">
          <Link
            href="/redesign"
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-md bg-zinc-100 text-zinc-900 font-semibold border border-zinc-200/80"
          >
            <Layers className="w-3.5 h-3.5 text-zinc-700" />
            <span>Workspace</span>
          </Link>

          <Link
            href="/"
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-md text-zinc-500 hover:text-zinc-900 hover:bg-zinc-50 transition-colors"
            title="Switch to the original interface"
          >
            <span>Original UI</span>
            <ExternalLink className="w-3 h-3 text-zinc-400" />
          </Link>

          <Link
            href="/stats"
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-md text-zinc-500 hover:text-zinc-900 hover:bg-zinc-50 transition-colors"
          >
            <BarChart3 className="w-3.5 h-3.5 text-zinc-500" />
            <span>AI Telemetry</span>
          </Link>
        </nav>

        {/* Right Status Indicator */}
        <div className="flex items-center space-x-2 text-xs shrink-0">
          {geminiAvailable ? (
            <div className="flex items-center space-x-1.5 px-2 py-0.5 rounded bg-purple-50 border border-purple-200 text-purple-700 text-[11px] font-medium font-mono">
              <Sparkles className="w-3 h-3 text-purple-600" />
              <span>{modelName}</span>
            </div>
          ) : (
            <div className="flex items-center space-x-1.5 px-2 py-0.5 rounded bg-zinc-100 border border-zinc-200 text-zinc-700 text-[11px] font-medium">
              <ShieldCheck className="w-3 h-3 text-emerald-600" />
              <span>Offline OCR</span>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
