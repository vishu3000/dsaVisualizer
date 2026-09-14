// Remembering which folder is the repository.
//
// A page cannot see the filesystem; it can only be handed a folder by the user.
// That handle is structured-cloneable, so keeping it in IndexedDB turns "pick
// the repo every time" into "pick it once, then confirm access per session".

export type PermissionMode = { mode: 'readwrite' }

export type RepoHandle = {
  name: string
  getDirectoryHandle(name: string, options?: { create?: boolean }): Promise<RepoHandle>
  getFileHandle(name: string, options?: { create?: boolean }): Promise<{
    createWritable(): Promise<{ write(data: string): Promise<void>; close(): Promise<void> }>
  }>
  queryPermission?(options: PermissionMode): Promise<PermissionState>
  requestPermission?(options: PermissionMode): Promise<PermissionState>
}

const DB_NAME = 'dsa-visualizer'
const STORE = 'handles'
const KEY = 'repo-root'

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1)
    request.onupgradeneeded = () => request.result.createObjectStore(STORE)
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

function transact<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>) {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const request = run(db.transaction(STORE, mode).objectStore(STORE))
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => reject(request.error)
      }),
  )
}

export async function rememberRoot(handle: RepoHandle): Promise<void> {
  try {
    await transact('readwrite', (store) => store.put(handle, KEY))
  } catch {
    // Not fatal: the user is simply asked again next time.
  }
}

export async function recallRoot(): Promise<RepoHandle | null> {
  try {
    return (await transact<RepoHandle | undefined>('readonly', (store) => store.get(KEY))) ?? null
  } catch {
    return null
  }
}

export async function forgetRoot(): Promise<void> {
  try {
    await transact('readwrite', (store) => store.delete(KEY))
  } catch {
    // Ignore.
  }
}

/**
 * Chrome drops write permission between sessions, so a remembered handle still
 * needs confirming — but that is a one-click prompt rather than re-picking the
 * folder, and within a session it is usually already granted.
 */
export async function ensureWritable(handle: RepoHandle): Promise<boolean> {
  if (!handle.queryPermission || !handle.requestPermission) return true
  if ((await handle.queryPermission({ mode: 'readwrite' })) === 'granted') return true
  return (await handle.requestPermission({ mode: 'readwrite' })) === 'granted'
}
