'use client';

import React from 'react';
import {
  FileText,
  FileImage,
  Plus,
  X,
  Clipboard,
  CheckCircle2,
} from 'lucide-react';
import { DocumentTab } from '@/context/WorkspaceContext';

interface DocumentTabBarProps {
  tabs: DocumentTab[];
  activeTabId: string | null;
  onSelectTab: (tabId: string) => void;
  onCloseTab: (tabId: string) => void;
  onNewTab: () => void;
  onPasteClipboard?: () => void;
}

export const DocumentTabBar: React.FC<DocumentTabBarProps> = ({
  tabs,
  activeTabId,
  onSelectTab,
  onCloseTab,
  onNewTab,
  onPasteClipboard,
}) => {
  if (tabs.length === 0) return null;

  return (
    <div className="w-full bg-zinc-100/90 border-b border-zinc-200 px-3 pt-1.5 flex items-center justify-between gap-3 select-none">
      {/* Scrollable Tabs List */}
      <div
        onWheel={(e) => {
          if (e.deltaY !== 0) e.currentTarget.scrollLeft += e.deltaY;
        }}
        className="flex items-center space-x-1 overflow-x-auto no-scrollbar min-w-0 py-0.5"
      >
        {tabs.map((tab) => {
          const isActive = tab.id === activeTabId;
          const isPdf = tab.file.name.toLowerCase().endsWith('.pdf');
          const tableCount = tab.tables?.length || 0;

          return (
            <div
              key={tab.id}
              onClick={() => onSelectTab(tab.id)}
              className={`group relative flex items-center space-x-2 px-3 py-1.5 rounded-t-md text-xs font-medium cursor-pointer transition-all border-t border-x ${
                isActive
                  ? 'bg-white text-zinc-900 border-zinc-200 border-b-white -mb-[1px] shadow-2xs font-semibold'
                  : 'bg-zinc-200/50 hover:bg-zinc-200/80 text-zinc-600 hover:text-zinc-900 border-transparent'
              }`}
              style={{ maxWidth: '220px' }}
            >
              {/* Document Icon */}
              {isPdf ? (
                <FileText className="w-3.5 h-3.5 text-rose-500 shrink-0" />
              ) : (
                <FileImage className="w-3.5 h-3.5 text-blue-500 shrink-0" />
              )}

              {/* Title */}
              <span className="truncate" title={tab.name}>
                {tab.name}
              </span>

              {/* Table Count Badge */}
              {tableCount > 0 ? (
                <span
                  className="px-1.5 py-0.2 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-mono shrink-0 flex items-center gap-0.5"
                  title={`${tableCount} extracted table${tableCount === 1 ? '' : 's'}`}
                >
                  <CheckCircle2 className="w-2.5 h-2.5 text-emerald-600" />
                  <span>{tableCount}</span>
                </span>
              ) : (
                <span
                  className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0"
                  title="Not extracted yet"
                />
              )}

              {/* Close Tab Button */}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onCloseTab(tab.id);
                }}
                className="opacity-60 hover:opacity-100 hover:bg-zinc-200 text-zinc-500 hover:text-rose-600 rounded p-0.5 transition-colors cursor-pointer shrink-0 ml-1"
                title="Close tab"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          );
        })}

        {/* Add New Tab Button */}
        <button
          type="button"
          onClick={onNewTab}
          className="flex items-center space-x-1 px-2.5 py-1.5 rounded-md text-xs font-medium text-zinc-600 hover:text-zinc-900 hover:bg-zinc-200/70 border border-dashed border-zinc-300 transition-colors shrink-0 cursor-pointer ml-1"
          title="Open new image or PDF in a new tab"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>New Document</span>
        </button>

        {/* Quick Paste Snip Button */}
        {onPasteClipboard && (
          <button
            type="button"
            onClick={onPasteClipboard}
            className="flex items-center space-x-1 px-2 py-1.5 rounded-md text-xs text-zinc-500 hover:text-zinc-900 hover:bg-zinc-200/50 transition-colors shrink-0 cursor-pointer"
            title="Paste snip from clipboard (Ctrl+V) as a new tab"
          >
            <Clipboard className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Paste Snip</span>
          </button>
        )}
      </div>
    </div>
  );
};
