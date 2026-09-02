'use client';

import React from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { Sparkles, Shield, Layers, Cpu, BarChart3 } from 'lucide-react';

interface HeaderProps {
  geminiAvailable?: boolean;
  modelName?: string;
  mode?: 'auto' | 'ai' | 'local';
  activeTab?: 'studio' | 'stats';
}

export const Header: React.FC<HeaderProps> = ({
  geminiAvailable = false,
  modelName = 'Gemini Flash',
  mode = 'auto',
  activeTab = 'studio',
}) => {
  return (
    <motion.header
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      className="w-full border-b border-zinc-200/80 bg-white/75 backdrop-blur-xl sticky top-0 z-40"
    >
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-2">
        {/* Brand & Logo */}
        <div className="flex items-center space-x-3 shrink-0">
          <Link href="/" className="flex items-center space-x-3 group">
            <motion.div
              whileHover={{ scale: 1.05, rotate: 2 }}
              whileTap={{ scale: 0.95 }}
              className="h-8 w-8 rounded-lg bg-zinc-950 flex items-center justify-center text-white shadow-xs group-hover:bg-zinc-800 transition-colors"
            >
              <Layers className="w-4 h-4 text-emerald-400" />
            </motion.div>

            <div className="flex items-center space-x-2">
              <span className="text-sm font-semibold tracking-tight text-zinc-950 font-sans">
                SheetSnap by Zamil
              </span>
              <span className="text-[10px] font-mono font-medium px-1.5 py-0.5 rounded bg-zinc-100 text-zinc-600 border border-zinc-200/80">
                Desktop
              </span>
            </div>
          </Link>
        </div>

        {/* Central Navigation Tabs */}
        <nav className="flex items-center p-1 rounded-xl bg-zinc-100/90 border border-zinc-200/80 text-xs font-medium">
          <Link
            href="/"
            className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg transition-all ${activeTab === 'studio'
              ? 'bg-white text-zinc-900 shadow-xs font-semibold'
              : 'text-zinc-600 hover:text-zinc-900 hover:bg-white/50'
              }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Studio</span>
          </Link>

          <Link
            href="/stats"
            className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg transition-all ${activeTab === 'stats'
              ? 'bg-white text-purple-950 shadow-xs font-semibold'
              : 'text-zinc-600 hover:text-zinc-900 hover:bg-white/50'
              }`}
          >
            <BarChart3 className={`w-3.5 h-3.5 ${activeTab === 'stats' ? 'text-purple-600' : 'text-zinc-500'}`} />
            <span>AI Telemetry & Stats</span>
            <span className="flex h-1.5 w-1.5 rounded-full bg-purple-500"></span>
          </Link>
        </nav>

        {/* Right Status Pill */}
        <div className="flex items-center space-x-2.5 text-xs shrink-0">
          <div className="hidden md:flex items-center space-x-1.5 text-zinc-500 font-medium">
            <Cpu className="w-3.5 h-3.5 text-zinc-400" />
            <span>Local Engine</span>
          </div>

          {geminiAvailable ? (
            <div className="flex items-center space-x-1.5 px-2.5 py-1 rounded-full bg-purple-50/90 border border-purple-200/80 text-purple-700 text-[11px] font-medium shadow-2xs">
              <span className="relative flex h-1.5 w-1.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-purple-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-purple-500"></span>
              </span>
              <Sparkles className="w-3 h-3 text-purple-600" />
              <span className="tracking-tight hidden sm:inline">{modelName} AI Ready</span>
              <span className="tracking-tight sm:hidden">AI Ready</span>
            </div>
          ) : (
            <div className="flex items-center space-x-1.5 px-2.5 py-1 rounded-full bg-zinc-100/90 border border-zinc-200/70 text-zinc-700 text-[11px] font-medium shadow-2xs">
              <span className="relative flex h-1.5 w-1.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500"></span>
              </span>
              <Shield className="w-3 h-3 text-emerald-600" />
              <span className="tracking-tight">100% Offline & Private</span>
            </div>
          )}
        </div>
      </div>
    </motion.header>
  );
};