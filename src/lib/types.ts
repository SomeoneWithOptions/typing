export const ALPHABET = [
  'a',
  'b',
  'c',
  'd',
  'e',
  'f',
  'g',
  'h',
  'i',
  'j',
  'k',
  'l',
  'm',
  'n',
  'o',
  'p',
  'q',
  'r',
  's',
  't',
  'u',
  'v',
  'w',
  'x',
  'y',
  'z',
] as const

export type Letter = (typeof ALPHABET)[number]
export type PracticeMode = 'adaptive' | 'focus' | 'free'
export type FreeCorpusTier = 200 | 1000 | 5000 | 10000 | 25000 | 450000
export type UnlockMetric = 'hits' | 'accuracy' | 'wpm'

export interface UnlockTargets {
  hits: number
  accuracy: number
  wpm: number
}

export interface LetterStats {
  letter: Letter
  attempts: number
  correctHits: number
  totalCorrectMs: number
  smoothedMs: number | null
  fastestWpm: number
  lastPracticedAt: string | null
  unlockedAt: string | null
  masteredAt: string | null
}

export interface SessionKeyAttempt {
  expected: string
  actual: string
  correct: boolean
  deltaMs: number
  index: number
  timestamp: number
}

export interface SessionRecord {
  id: string
  mode: PracticeMode
  focusLetter: Letter | null
  freeTier: FreeCorpusTier | null
  startedAt: string
  endedAt: string
  words: string[]
  attempts: number
  correctChars: number
  accuracy: number
  wpm: number
  backspaces: number
  weakLetters: Letter[]
  unlockedAfterSession: Letter[]
}

export interface GeneratedLesson {
  id: string
  mode: PracticeMode
  focusLetter: Letter | null
  freeTier: FreeCorpusTier | null
  words: string[]
  text: string
  targetLetters: Letter[]
}

export interface WordCandidate {
  word: string
  rank: number
}

export interface ProgressState {
  version: number
  unlockedLetters: Letter[]
  nextUnlockLetter: Letter | null
  letterStats: Record<Letter, LetterStats>
  sessions: SessionRecord[]
  settings: {
    mode: PracticeMode
    focusLetter: Letter
    freeTier: FreeCorpusTier
    unlockTargets: UnlockTargets
  }
}

export interface UnlockSequence {
  initial: Letter[]
  order: Letter[]
}

export interface UnlockStatus {
  nextLetter: Letter | null
  bottleneckLetter: Letter | null
  sampleLetter: Letter | null
  sampleHits: number
  sampleProgress: number
  accuracyLetter: Letter | null
  accuracyValue: number
  accuracyProgress: number
  speedLetter: Letter | null
  speedWpm: number
  speedProgress: number
}

export interface StorageAdapter {
  load(): Promise<ProgressState | null>
  save(progress: ProgressState): Promise<void>
  reset(): Promise<void>
}
