'use client';

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
  useMemo,
} from 'react';
import {
  saveWorkspaceSession,
  loadWorkspaceSession,
  clearWorkspaceSession,
} from '@/lib/workspace-storage';

export interface TableItem {
  id: number | string;
  title: string;
  box?: [number, number, number, number];
  box_norm?: [number, number, number, number];
  headers: string[];
  rows: string[][];
  quality?: {
    score: number;
    is_complex: boolean;
    sparsity?: number;
    avg_confidence?: number;
    message?: string;
  };
}

export interface QualityInfo {
  score: number;
  is_complex: boolean;
  total_tables: number;
  message?: string;
  diverted_from_local?: boolean;
}

export interface DocumentTab {
  id: string;
  name: string;
  file: File;
  tables: TableItem[];
  customBoxes: Array<[number, number, number, number]>;
  activeTableIndex: number;
  isMerged: boolean;
  originalTables: TableItem[] | null;
  qualityInfo: QualityInfo | null;
  createdAt: number;
}

interface WorkspaceContextType {
  // Multi-tab collection
  tabs: DocumentTab[];
  activeTabId: string | null;
  activeTab: DocumentTab | null;

  // Active tab convenience getters
  file: File | null;
  tables: TableItem[];
  activeTableIndex: number;
  customBoxes: Array<[number, number, number, number]>;
  isMerged: boolean;
  originalTables: TableItem[] | null;
  qualityInfo: QualityInfo | null;

  // Global state
  loading: boolean;
  exporting: boolean;
  error: string | null;
  successMessage: string | null;
  geminiAvailable: boolean;
  geminiModel: string;

  // Tab management actions
  addDocumentTab: (file: File) => string;
  closeDocumentTab: (tabId: string) => void;
  selectDocumentTab: (tabId: string) => void;
  closeAllTabs: () => void;

  // Active tab mutators
  setCustomBoxes: (boxes: Array<[number, number, number, number]> | ((prev: Array<[number, number, number, number]>) => Array<[number, number, number, number]>)) => void;
  setTables: (tables: TableItem[] | ((prev: TableItem[]) => TableItem[])) => void;
  setActiveTableIndex: (index: number | ((prev: number) => number)) => void;
  setError: React.Dispatch<React.SetStateAction<string | null>>;
  setSuccessMessage: React.Dispatch<React.SetStateAction<string | null>>;

  // Workflow actions
  handleFileSelect: (selectedFile: File | null) => void;
  handleExtract: () => Promise<void>;
  handleExport: () => Promise<void>;
  handleCombinedExport: () => Promise<void>;
  handleGridChange: (newHeaders: string[], newRows: string[][]) => void;
  handleMergeTables: () => void;
  handleUnmergeTables: () => void;
  handlePastedBlob: (blob: Blob, prefix?: string) => void;
  handlePasteFromClipboard: () => Promise<void>;
}

const WorkspaceContext = createContext<WorkspaceContextType | null>(null);

export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const [tabs, setTabs] = useState<DocumentTab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);

  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // AI Engine status
  const [geminiAvailable, setGeminiAvailable] = useState(true);
  const [geminiModel, setGeminiModel] = useState('Gemini 3.6 Flash');

  const API_URL = process.env.NEXT_PUBLIC_API_URL || '/api';
  const hasHydratedRef = useRef(false);

  // Active tab resolution
  const activeTab = useMemo(() => {
    if (!activeTabId) return tabs[0] || null;
    return tabs.find((t) => t.id === activeTabId) || tabs[0] || null;
  }, [activeTabId, tabs]);

  // Convenience getters from active tab
  const file = activeTab?.file || null;
  const tables = useMemo(() => activeTab?.tables || [], [activeTab?.tables]);
  const activeTableIndex = activeTab?.activeTableIndex || 0;
  const customBoxes = useMemo(() => activeTab?.customBoxes || [], [activeTab?.customBoxes]);
  const isMerged = !!activeTab?.isMerged;
  const originalTables = activeTab?.originalTables || null;
  const qualityInfo = activeTab?.qualityInfo || null;

  // Restore saved session from IndexedDB on initial mount
  useEffect(() => {
    let isMounted = true;
    (async () => {
      try {
        const saved = await loadWorkspaceSession();
        if (isMounted && saved && saved.tabs && saved.tabs.length > 0) {
          setTabs(saved.tabs);
          setActiveTabId(saved.activeTabId || saved.tabs[0].id);
        }
      } catch (err) {
        console.warn('Could not restore previous workspace session:', err);
      } finally {
        hasHydratedRef.current = true;
      }
    })();

    return () => {
      isMounted = false;
    };
  }, []);

  // Persist session to IndexedDB whenever tabs change
  useEffect(() => {
    if (!hasHydratedRef.current) return;

    if (tabs.length === 0) {
      clearWorkspaceSession();
      return;
    }

    const timer = setTimeout(() => {
      saveWorkspaceSession({
        tabs,
        activeTabId,
      });
    }, 400);

    return () => clearTimeout(timer);
  }, [tabs, activeTabId]);

  // Backend status polling
  useEffect(() => {
    const checkBackendStatus = async () => {
      try {
        const res = await fetch(`${API_URL}/status`);
        if (res.ok) {
          const data = await res.json();
          if (typeof data.gemini_available === 'boolean') {
            setGeminiAvailable(data.gemini_available);
          }
          if (data.gemini_model) {
            setGeminiModel(data.gemini_model);
          }
        }
      } catch {
        // Backend offline or unreachable
      }
    };
    checkBackendStatus();
    const interval = setInterval(checkBackendStatus, 15000);
    return () => clearInterval(interval);
  }, [API_URL]);

  // Tab Operations
  const addDocumentTab = useCallback((newFile: File): string => {
    if (newFile.size > 10 * 1024 * 1024) {
      setError(`File size (${(newFile.size / (1024 * 1024)).toFixed(1)} MB) exceeds 10 MB maximum.`);
      return '';
    }

    const newId = 'doc-' + Date.now() + '-' + Math.random().toString(36).substring(2, 7);
    const newTab: DocumentTab = {
      id: newId,
      name: newFile.name || `Document ${tabs.length + 1}`,
      file: newFile,
      tables: [],
      customBoxes: [],
      activeTableIndex: 0,
      isMerged: false,
      originalTables: null,
      qualityInfo: null,
      createdAt: Date.now(),
    };

    setTabs((prev) => [...prev, newTab]);
    setActiveTabId(newId);
    setError(null);
    setSuccessMessage(`Opened "${newFile.name}" in new tab.`);
    return newId;
  }, [tabs.length]);

  const closeDocumentTab = useCallback((tabId: string) => {
    setTabs((prev) => {
      const idx = prev.findIndex((t) => t.id === tabId);
      if (idx === -1) return prev;
      const nextTabs = prev.filter((t) => t.id !== tabId);

      // If closing active tab, switch to neighbor
      if (activeTabId === tabId) {
        if (nextTabs.length === 0) {
          setActiveTabId(null);
        } else {
          const newIdx = Math.min(idx, nextTabs.length - 1);
          setActiveTabId(nextTabs[newIdx].id);
        }
      }
      return nextTabs;
    });
  }, [activeTabId]);

  const selectDocumentTab = useCallback((tabId: string) => {
    setActiveTabId(tabId);
    setError(null);
    setSuccessMessage(null);
  }, []);

  const closeAllTabs = useCallback(() => {
    setTabs([]);
    setActiveTabId(null);
    clearWorkspaceSession();
    setError(null);
    setSuccessMessage(null);
  }, []);

  const handleFileSelect = useCallback(
    (selectedFile: File | null) => {
      if (!selectedFile) {
        if (activeTabId) {
          closeDocumentTab(activeTabId);
        }
        return;
      }
      addDocumentTab(selectedFile);
    },
    [activeTabId, addDocumentTab, closeDocumentTab]
  );

  const updateActiveTab = useCallback(
    (updater: (tab: DocumentTab) => DocumentTab) => {
      if (!activeTabId) return;
      setTabs((prev) =>
        prev.map((t) => (t.id === activeTabId ? updater(t) : t))
      );
    },
    [activeTabId]
  );

  const setCustomBoxes = useCallback(
    (boxesOrFn: Array<[number, number, number, number]> | ((prev: Array<[number, number, number, number]>) => Array<[number, number, number, number]>)) => {
      updateActiveTab((tab) => {
        const nextBoxes = typeof boxesOrFn === 'function' ? boxesOrFn(tab.customBoxes) : boxesOrFn;
        return { ...tab, customBoxes: nextBoxes };
      });
    },
    [updateActiveTab]
  );

  const setTables = useCallback(
    (tablesOrFn: TableItem[] | ((prev: TableItem[]) => TableItem[])) => {
      updateActiveTab((tab) => {
        const nextTables = typeof tablesOrFn === 'function' ? tablesOrFn(tab.tables) : tablesOrFn;
        return { ...tab, tables: nextTables };
      });
    },
    [updateActiveTab]
  );

  const setActiveTableIndex = useCallback(
    (indexOrFn: number | ((prev: number) => number)) => {
      updateActiveTab((tab) => {
        const nextIdx = typeof indexOrFn === 'function' ? indexOrFn(tab.activeTableIndex) : indexOrFn;
        return { ...tab, activeTableIndex: nextIdx };
      });
    },
    [updateActiveTab]
  );

  const handlePastedBlob = useCallback(
    (blob: Blob, prefix = 'Screen_Snip') => {
      const timeStr = new Date().toTimeString().split(' ')[0].replace(/:/g, '-');
      const ext = blob.type.split('/')[1] || 'png';
      const pastedFile = new File([blob], `${prefix}_${timeStr}.${ext}`, {
        type: blob.type || 'image/png',
      });
      addDocumentTab(pastedFile);
    },
    [addDocumentTab]
  );

  const handlePasteFromClipboard = useCallback(async () => {
    try {
      if (!navigator.clipboard?.read) {
        setError('Direct clipboard read restricted. Please press Ctrl+V to paste your snip directly.');
        return;
      }
      const items = await navigator.clipboard.read();
      for (const item of items) {
        const imageType = item.types.find((t) => t.startsWith('image/'));
        if (imageType) {
          const blob = await item.getType(imageType);
          handlePastedBlob(blob, 'Snip');
          return;
        }
      }
      setError('No image found in clipboard. Snip an area with Win+Shift+S, then click Paste or press Ctrl+V.');
    } catch {
      setError('Clipboard permission required or unavailable. Please press Ctrl+V to paste directly.');
    }
  }, [handlePastedBlob]);

  // Extract tables for current active document
  const handleExtract = useCallback(async () => {
    if (!activeTab || !activeTab.file) return;
    setLoading(true);
    setError(null);
    setSuccessMessage(null);

    const formData = new FormData();
    formData.append('image', activeTab.file);

    if (activeTab.customBoxes.length > 0) {
      formData.append('crop_boxes', JSON.stringify(activeTab.customBoxes));
    }

    try {
      let sessionId: string | undefined;
      if (typeof window !== 'undefined') {
        sessionId = window.sessionStorage.getItem('sheetsnap_session_id') || undefined;
        if (!sessionId) {
          sessionId = 'sess_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 6);
          window.sessionStorage.setItem('sheetsnap_session_id', sessionId);
        }
      }

      const res = await fetch(`${API_URL}/extract`, {
        method: 'POST',
        headers: sessionId ? { 'x-session-id': sessionId } : {},
        body: formData,
      });

      if (!res.ok) {
        let errMsg = `Extraction failed (HTTP ${res.status})`;
        try {
          const errJson = await res.json();
          errMsg = errJson.detail || errMsg;
        } catch {
          // fallback
        }
        throw new Error(errMsg);
      }

      const data = await res.json();
      const extractedTables = data.tables || [];

      if (!extractedTables || extractedTables.length === 0) {
        throw new Error('No structured tables were discovered in the document.');
      }

      updateActiveTab((tab) => ({
        ...tab,
        tables: extractedTables,
        activeTableIndex: 0,
        isMerged: false,
        originalTables: null,
        qualityInfo: data.quality || null,
      }));

      let msg = `Discovered ${extractedTables.length} table${
        extractedTables.length === 1 ? '' : 's'
      } in "${activeTab.name}".`;

      if (data.page_notice) {
        msg += ` (${data.page_notice})`;
      }

      setSuccessMessage(msg);
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : 'An unexpected error occurred during table extraction.'
      );
    } finally {
      setLoading(false);
    }
  }, [API_URL, activeTab, geminiModel, updateActiveTab]);

  // Single tab export (current document)
  const handleExport = useCallback(async () => {
    if (!activeTab || activeTab.tables.length === 0) return;
    setExporting(true);
    setError(null);

    try {
      const exportPayload = {
        fileName: activeTab.file.name,
        tables: activeTab.tables.map((t) => ({
          title: t.title || 'Table',
          headers: t.headers,
          rows: t.rows,
        })),
      };

      const res = await fetch(`${API_URL}/export`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(exportPayload),
      });

      if (!res.ok) {
        throw new Error(`Export failed with HTTP ${res.status}`);
      }

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const baseName = activeTab.file.name.replace(/\.[^/.]+$/, '') || 'SheetSnap_Export';
      const dateStr = new Date().toISOString().split('T')[0];
      a.download = `${baseName}_${dateStr}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to generate Excel download.');
    } finally {
      setExporting(false);
    }
  }, [API_URL, activeTab]);

  // Combined export: All tabs exported into 1 single Excel file with multiple sheets (Excel tabs)
  const handleCombinedExport = useCallback(async () => {
    const tabsWithTables = tabs.filter((t) => t.tables && t.tables.length > 0);
    if (tabsWithTables.length === 0) {
      setError('None of your open tabs have extracted tables to export.');
      return;
    }

    setExporting(true);
    setError(null);

    try {
      const sheetsPayload = tabsWithTables.flatMap((t, idx) => {
        const docBaseName = t.name.replace(/\.[^/.]+$/, '').trim() || `Doc ${idx + 1}`;
        if (t.tables.length === 1) {
          return [
            {
              sheetName: `${t.tables[0].title || 'Table'} - ${docBaseName}`,
              tables: [
                {
                  title: t.tables[0].title || 'Table',
                  headers: t.tables[0].headers,
                  rows: t.tables[0].rows,
                },
              ],
            },
          ];
        }

        // Multiple tables in document: each table gets its own sheet tab formatted as "[Table Title] - [Doc Name]"
        return t.tables.map((table, tblIdx) => ({
          sheetName: `${table.title || `Table ${tblIdx + 1}`} - ${docBaseName}`,
          tables: [
            {
              title: table.title || `Table ${tblIdx + 1}`,
              headers: table.headers,
              rows: table.rows,
            },
          ],
        }));
      });

      const res = await fetch(`${API_URL}/export`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sheets: sheetsPayload }),
      });

      if (!res.ok) {
        throw new Error(`Combined export failed with HTTP ${res.status}`);
      }

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const dateStr = new Date().toISOString().split('T')[0];
      a.download = `SheetSnap_Combined_${tabsWithTables.length}_Sheets_${dateStr}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      setSuccessMessage(
        `Successfully exported ${tabsWithTables.length} document sheet${
          tabsWithTables.length === 1 ? '' : 's'
        } into a single Excel workbook!`
      );
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to generate combined Excel workbook.');
    } finally {
      setExporting(false);
    }
  }, [API_URL, tabs]);

  const handleGridChange = useCallback(
    (newHeaders: string[], newRows: string[][]) => {
      updateActiveTab((tab) => {
        if (tab.tables.length === 0) {
          return {
            ...tab,
            tables: [
              {
                id: 1,
                title: 'Table 1',
                headers: newHeaders,
                rows: newRows,
              },
            ],
          };
        }

        const updated = tab.tables.map((tbl, idx) => {
          if (idx === tab.activeTableIndex) {
            return {
              ...tbl,
              headers: newHeaders,
              rows: newRows,
            };
          }
          return tbl;
        });

        return { ...tab, tables: updated };
      });
    },
    [updateActiveTab]
  );

  const handleMergeTables = useCallback(() => {
    updateActiveTab((tab) => {
      if (tab.tables.length <= 1) return tab;

      const maxCols = Math.max(
        ...tab.tables.map((t) =>
          Math.max(t.headers.length, ...t.rows.map((r) => r.length), 1)
        )
      );

      const firstHeaders = tab.tables[0].headers;
      const sameHeaders = tab.tables.every(
        (t) =>
          t.headers.length === firstHeaders.length &&
          t.headers.every(
            (h, i) => h.trim().toLowerCase() === firstHeaders[i].trim().toLowerCase()
          )
      );

      let mergedHeaders: string[] = [];
      const mergedRows: string[][] = [];

      if (sameHeaders && firstHeaders.length > 0) {
        mergedHeaders = [...firstHeaders];
        while (mergedHeaders.length < maxCols) {
          mergedHeaders.push(`Col ${mergedHeaders.length + 1}`);
        }

        tab.tables.forEach((tbl, tIdx) => {
          if (tIdx > 0) {
            mergedRows.push(new Array(maxCols).fill(''));
          }

          tbl.rows.forEach((row) => {
            const padded = [...row];
            while (padded.length < maxCols) padded.push('');
            mergedRows.push(padded.slice(0, maxCols));
          });
        });
      } else {
        mergedHeaders = [...tab.tables[0].headers];
        while (mergedHeaders.length < maxCols) {
          mergedHeaders.push(`Col ${mergedHeaders.length + 1}`);
        }

        tab.tables.forEach((tbl, tIdx) => {
          if (tIdx > 0) {
            mergedRows.push(new Array(maxCols).fill(''));

            const labelRow = new Array(maxCols).fill('');
            labelRow[0] = `--- ${tbl.title || `Table ${tIdx + 1}`} ---`;
            mergedRows.push(labelRow);

            if (tbl.headers && tbl.headers.length > 0) {
              const hRow = [...tbl.headers];
              while (hRow.length < maxCols) hRow.push('');
              mergedRows.push(hRow.slice(0, maxCols));
            }
          }

          tbl.rows.forEach((row) => {
            const padded = [...row];
            while (padded.length < maxCols) padded.push('');
            mergedRows.push(padded.slice(0, maxCols));
          });
        });
      }

      const mergedItem: TableItem = {
        id: 'merged-all',
        title: `Combined (${tab.tables.length} Tables)`,
        headers: mergedHeaders,
        rows: mergedRows,
      };

      setSuccessMessage(
        `Stacked ${tab.tables.length} tables vertically into 1 unified sheet with clean spacing.`
      );

      return {
        ...tab,
        originalTables: tab.tables,
        tables: [mergedItem],
        activeTableIndex: 0,
        isMerged: true,
      };
    });
  }, [updateActiveTab]);

  const handleUnmergeTables = useCallback(() => {
    updateActiveTab((tab) => {
      if (tab.originalTables && tab.originalTables.length > 0) {
        setSuccessMessage(`Separated back into ${tab.originalTables.length} individual tables.`);
        return {
          ...tab,
          tables: tab.originalTables,
          activeTableIndex: 0,
          isMerged: false,
          originalTables: null,
        };
      }
      return tab;
    });
  }, [updateActiveTab]);

  const value = useMemo(
    () => ({
      tabs,
      activeTabId,
      activeTab,
      file,
      tables,
      activeTableIndex,
      customBoxes,
      isMerged,
      originalTables,
      qualityInfo,
      loading,
      exporting,
      error,
      successMessage,
      geminiAvailable,
      geminiModel,
      addDocumentTab,
      closeDocumentTab,
      selectDocumentTab,
      closeAllTabs,
      setCustomBoxes,
      setTables,
      setActiveTableIndex,
      setError,
      setSuccessMessage,
      handleFileSelect,
      handleExtract,
      handleExport,
      handleCombinedExport,
      handleGridChange,
      handleMergeTables,
      handleUnmergeTables,
      handlePastedBlob,
      handlePasteFromClipboard,
    }),
    [
      tabs,
      activeTabId,
      activeTab,
      file,
      tables,
      activeTableIndex,
      customBoxes,
      isMerged,
      originalTables,
      qualityInfo,
      loading,
      exporting,
      error,
      successMessage,
      geminiAvailable,
      geminiModel,
      addDocumentTab,
      closeDocumentTab,
      selectDocumentTab,
      closeAllTabs,
      setCustomBoxes,
      setTables,
      setActiveTableIndex,
      setError,
      setSuccessMessage,
      handleFileSelect,
      handleExtract,
      handleExport,
      handleCombinedExport,
      handleGridChange,
      handleMergeTables,
      handleUnmergeTables,
      handlePastedBlob,
      handlePasteFromClipboard,
    ]
  );

  return (
    <WorkspaceContext.Provider value={value}>
      {children}
    </WorkspaceContext.Provider>
  );
}

export function useWorkspace() {
  const context = useContext(WorkspaceContext);
  if (!context) {
    throw new Error('useWorkspace must be used within a WorkspaceProvider');
  }
  return context;
}
