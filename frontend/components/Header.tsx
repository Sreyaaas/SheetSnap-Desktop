'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { Sparkles, Shield, Layers, Cpu } from 'lucide-react';

export const Header: React.FC = () => {
  return (
    <motion.header
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      className="w-full border-b border-zinc-200/80 bg-white/70 backdrop-blur-xl sticky top-0 z-40"
    >
      <div className="max-w-5xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
        {/* Brand & Logo */}
        <div className="flex items-center space-x-3">
          <motion.div
            whileHover={{ scale: 1.05, rotate: 2 }}
            whileTap={{ scale: 0.95 }}
            className="h-8 w-8 rounded-lg bg-zinc-950 flex items-center justify-center text-white shadow-xs"
          >
            <Layers className="w-4 h-4 text-emerald-400" />
          </motion.div>

          <div className="flex items-center space-x-2">
            <span className="text-sm font-semibold tracking-tight text-zinc-950 font-sans">
              SheetSnap
            </span>
            <span className="text-[10px] font-mono font-medium px-1.5 py-0.5 rounded bg-zinc-100 text-zinc-600 border border-zinc-200/80">
              Desktop
            </span>
          </div>
        </div>

        {/* Right Status Pill */}
        <div className="flex items-center space-x-3 text-xs">
          <div className="hidden sm:flex items-center space-x-1.5 text-zinc-500 font-medium">
            <Cpu className="w-3.5 h-3.5 text-zinc-400" />
            <span>Local CPU Engine</span>
          </div>

          <div className="flex items-center space-x-1.5 px-2.5 py-1 rounded-full bg-zinc-100/90 border border-zinc-200/70 text-zinc-700 text-[11px] font-medium shadow-2xs">
            <span className="relative flex h-1.5 w-1.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500"></span>
            </span>
            <Shield className="w-3 h-3 text-emerald-600" />
            <span className="tracking-tight">100% Offline & Private</span>
          </div>
        </div>
      </div>
    </motion.header>
  );
};