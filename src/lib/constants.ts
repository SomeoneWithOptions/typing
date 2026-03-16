import type { FreeCorpusTier, Letter, UnlockMetric, UnlockSequence, UnlockTargets } from './types'

export const APP_VERSION = 4
export const LESSON_WORD_COUNT = 25
export const MAX_SESSION_HISTORY = 120
export const RECENT_LETTER_SESSIONS = 10
export const UNLOCK_SAMPLE_TARGET = 40
export const UNLOCK_WPM_TARGET = 24
export const UNLOCK_ACCURACY_TARGET = 95
export const DEFAULT_UNLOCK_TARGETS: UnlockTargets = {
  hits: UNLOCK_SAMPLE_TARGET,
  accuracy: UNLOCK_ACCURACY_TARGET,
  wpm: UNLOCK_WPM_TARGET,
}
export const FREE_CORPUS_TIERS = [200, 1000, 5000, 10000, 25000, 450000] as const satisfies readonly FreeCorpusTier[]
export const DEFAULT_FREE_CORPUS_TIER: FreeCorpusTier = 200
export function formatFreeCorpusTier(tier: FreeCorpusTier) {
  return tier >= 1000 ? `${tier / 1000}k` : `${tier}`
}
export const UNLOCK_TARGET_LIMITS: Record<UnlockMetric, { min: number; max: number; step: number }> = {
  hits: { min: 1, max: 9999, step: 1 },
  accuracy: { min: 10, max: 100, step: 1 },
  wpm: { min: 10, max: 300, step: 1 },
}
export const MASTERY_WPM_TARGET = 40
export const MASTERY_ACCURACY_TARGET = 97
export const LESSON_IDLE_TIMEOUT_MS = 15_000
export const MAX_KEYSTROKE_SESSIONS = 50

export const UNLOCK_SEQUENCE: UnlockSequence = {
  initial: ['e', 'n', 'i', 'a', 'r', 'l'],
  order: ['t', 'o', 's', 'd', 'h', 'u', 'c', 'm', 'f', 'y', 'w', 'g', 'p', 'b', 'v', 'k', 'x', 'j', 'q', 'z'],
}

export const KEYBOARD_ROWS: Letter[][] = [
  ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'],
  ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l'],
  ['z', 'x', 'c', 'v', 'b', 'n', 'm'],
]

export const LEFT_HAND_LETTERS = new Set<Letter>(['q', 'w', 'e', 'r', 't', 'a', 's', 'd', 'f', 'g', 'z', 'x', 'c', 'v', 'b'])

export const ALL_LETTER_SET = new Set<Letter>([...UNLOCK_SEQUENCE.initial, ...UNLOCK_SEQUENCE.order])

export const DEFAULT_FOCUS_LETTER: Letter = 't'

