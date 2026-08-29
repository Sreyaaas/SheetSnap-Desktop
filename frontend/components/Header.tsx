'use client';

import React from 'react';
import { Table2, ShieldCheck } from 'lucide-react';

export const Header: React.FC = () => {
  return (
    <header className="w-full border-b border-slate-200/80 bg-white/80 backdrop-blur-md sticky top-0 z-40 transition-all">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
        {/* Brand & Title */}
        <div className="flex items-center space-x-3.5">
          <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-slate-900 via-slate-800 to-slate-950 flex items-center justify-center text-white shadow-sm ring-1 ring-slate-900/10 transition-transform hover:scale-105">
            <Table2 className="w-5 h-5 text-emerald-400" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h1 className="text-base font-semibold tracking-tight text-slate-900">
                Zaamil Offshore
              </h1>
              <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium bg-slate-100 text-slate-600 border border-slate-200/60">
                Desktop
              </span>
            </div>
            <p className="text-xs text-slate-500 hidden sm:block">
              Offline Document Table Extraction & Excel Export
            </p>
          </div>
        </div>

        {/* Right Status Badge */}
        <div className="flex items-center space-x-2.5">
          <div className="flex items-center space-x-1.5 px-3 py-1 bg-emerald-50/80 border border-emerald-200/80 text-emerald-700 rounded-full text-xs font-medium shadow-xs">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
            <span className="tracking-tight">100% Offline & Private</span>
          </div>
        </div>
      </div>
    </header>
  );
};