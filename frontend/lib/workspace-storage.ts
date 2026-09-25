import { DocumentTab } from '@/context/WorkspaceContext';

const DB_NAME = 'SheetSnapDB';
const DB_VERSION = 2;
const STORE_NAME = 'workspace_session';
const SESSION_KEY = 'current_session';

export interface WorkspaceSessionData {
  tabs: DocumentTab[];
  activeTabId: string | null;
  updatedAt: number;
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      return reject(new Error('IndexedDB not supported or available.'));
    }

    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'key' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

const SESSION_MARKER_KEY = 'sheetsnap_active_tab_session';
const MAX_SESSION_INACTIVITY_MS = 2 * 60 * 60 * 1000; // 2 hours TTL

export async function saveWorkspaceSession(data: Omit<WorkspaceSessionData, 'updatedAt'>): Promise<void> {
  try {
    if (typeof window !== 'undefined' && window.sessionStorage) {
      if (!window.sessionStorage.getItem(SESSION_MARKER_KEY)) {
        window.sessionStorage.setItem(SESSION_MARKER_KEY, Date.now().toString());
      }
    }

    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);

      const record = {
        key: SESSION_KEY,
        tabs: data.tabs,
        activeTabId: data.activeTabId,
        updatedAt: Date.now(),
      };

      const request = store.put(record);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } catch (err) {
    console.warn('[WorkspaceStorage] Failed to save session:', err);
  }
}

export async function loadWorkspaceSession(): Promise<WorkspaceSessionData | null> {
  if (typeof window === 'undefined') return null;

  // Session Boundary: sessionStorage only survives page refreshes and in-tab navigation.
  // If the browser was closed overnight or opened in a new tab/window, sessionStorage is empty.
  const hasActiveTabSession = Boolean(window.sessionStorage?.getItem(SESSION_MARKER_KEY));

  if (!hasActiveTabSession) {
    // Fresh browser launch -> purge stale tabs from previous days and start clean
    await clearWorkspaceSession();
    try {
      window.sessionStorage?.setItem(SESSION_MARKER_KEY, Date.now().toString());
    } catch {}
    return null;
  }

  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const request = store.get(SESSION_KEY);

      request.onsuccess = () => {
        const result = request.result;
        if (!result) {
          resolve(null);
          return;
        }

        // Inactivity Guard: Expire if left untouched for over 2 hours (e.g. computer slept overnight)
        if (result.updatedAt && Date.now() - result.updatedAt > MAX_SESSION_INACTIVITY_MS) {
          clearWorkspaceSession();
          resolve(null);
          return;
        }

        // Support backward compatibility if previous schema was single file
        if (result.tabs && Array.isArray(result.tabs)) {
          resolve({
            tabs: result.tabs,
            activeTabId: result.activeTabId || (result.tabs[0]?.id ?? null),
            updatedAt: result.updatedAt || 0,
          });
          return;
        }

        if (result.file) {
          const tabId = 'doc-migrated-' + Date.now();
          resolve({
            tabs: [
              {
                id: tabId,
                name: result.file.name || 'Document 1',
                file: result.file,
                tables: result.tables || [],
                customBoxes: result.customBoxes || [],
                activeTableIndex: result.activeTableIndex || 0,
                isMerged: !!result.isMerged,
                originalTables: result.originalTables || null,
                qualityInfo: result.qualityInfo || null,
                createdAt: Date.now(),
              },
            ],
            activeTabId: tabId,
            updatedAt: result.updatedAt || 0,
          });
          return;
        }

        resolve(null);
      };

      request.onerror = () => reject(request.error);
    });
  } catch (err) {
    console.warn('[WorkspaceStorage] Failed to load session:', err);
    return null;
  }
}

export async function clearWorkspaceSession(): Promise<void> {
  try {
    if (typeof window !== 'undefined' && window.sessionStorage) {
      window.sessionStorage.removeItem(SESSION_MARKER_KEY);
    }
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const request = store.delete(SESSION_KEY);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } catch (err) {
    console.warn('[WorkspaceStorage] Failed to clear session:', err);
  }
}
