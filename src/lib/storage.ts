import { openDB } from 'idb'
import type { DBSchema, IDBPDatabase } from 'idb'
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

let dbPromise: Promise<IDBPDatabase<TrainerDb>> | null = null
let memoryProgress: ProgressState | null = null

function hasIndexedDb() {
  return typeof indexedDB !== 'undefined'
}

function getDbPromise(): Promise<IDBPDatabase<TrainerDb>> {
  if (!dbPromise) {
    dbPromise = openDB<TrainerDb>(DB_NAME, 1, {
      upgrade(database) {
        if (!database.objectStoreNames.contains(STORE_NAME)) {
          database.createObjectStore(STORE_NAME)
        }
      },
    })
  }

  return dbPromise
}

export const indexedDbStorage: StorageAdapter = {
  async load() {
    if (!hasIndexedDb()) {
      return hydratingProgressState(memoryProgress)
    }

    const db = await getDbPromise()
    const stored = await db.get(STORE_NAME, PROGRESS_KEY)
    return hydratingProgressState(stored ?? null)
  },
  async save(progress) {
    if (!hasIndexedDb()) {
      memoryProgress = progress
      return
    }

    const db = await getDbPromise()
    await db.put(STORE_NAME, progress, PROGRESS_KEY)
  },
  async reset() {
    if (!hasIndexedDb()) {
      memoryProgress = null
      return
    }

    const db = await getDbPromise()
    await db.delete(STORE_NAME, PROGRESS_KEY)
  },
}
