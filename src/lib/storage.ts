import { openDB } from 'idb'
import type { DBSchema } from 'idb'
import { hydratingProgressState } from './progression'
import type { ProgressState, StorageAdapter } from './types'

const DB_NAME = 'typing-trainer'
const STORE_NAME = 'app-state'
const PROGRESS_KEY = 'progress'

interface TrainerDb extends DBSchema {
  [STORE_NAME]: {
    key: string
    value: ProgressState
  }
}

const dbPromise = openDB<TrainerDb>(DB_NAME, 1, {
  upgrade(database) {
    if (!database.objectStoreNames.contains(STORE_NAME)) {
      database.createObjectStore(STORE_NAME)
    }
  },
})

export const indexedDbStorage: StorageAdapter = {
  async load() {
    const db = await dbPromise
    const stored = await db.get(STORE_NAME, PROGRESS_KEY)
    return hydratingProgressState(stored ?? null)
  },
  async save(progress) {
    const db = await dbPromise
    await db.put(STORE_NAME, progress, PROGRESS_KEY)
  },
  async reset() {
    const db = await dbPromise
    await db.delete(STORE_NAME, PROGRESS_KEY)
  },
}
