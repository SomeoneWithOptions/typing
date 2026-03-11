import { create } from 'zustand'
import { formatFreeCorpusTier, LESSON_IDLE_TIMEOUT_MS, MAX_SESSION_HISTORY } from './constants'
import { hasFreeWordsForTier, loadFreeWordsForTier } from './free-corpus'
import { generateFreeLesson, generateLesson } from './lesson-engine'
import {
  clampUnlockTarget,
  createInitialProgressState,
  getRemainingUnlocks,
  getUnlockStatus,
  getWeakLetters,
  resetLetterProgress,
  updateProgressFromSession,
} from './progression'
import { getAccuracy, getWpm } from './session-metrics'
import { indexedDbStorage } from './storage'
import type {
  FreeCorpusTier,
  GeneratedLesson,
  Letter,
  PracticeMode,
  ProgressState,
  SessionKeyAttempt,
  UnlockMetric,
} from './types'

const DEFAULT_STATUS_MESSAGE = 'Press into the practice area and start typing.'

function hasUnresolvedIncorrectAttempt(attempts: SessionKeyAttempt[], index: number) {
  return attempts.some((attempt) => attempt.index === index && !attempt.correct)
}

function shouldCountMetricAttempt(attempt: SessionKeyAttempt, attempts: SessionKeyAttempt[]) {
  if (attempt.correct) {
    return true
  }

  if (attempt.expected === ' ') {
    return false
  }

  return !hasUnresolvedIncorrectAttempt(attempts, attempt.index)
}

function createLesson(progress: ProgressState) {
  if (progress.settings.mode === 'free' && !hasFreeWordsForTier(progress.settings.freeTier)) {
    const words = Array.from({ length: 5 }, () => 'loading').flatMap((word) => Array.from({ length: 5 }, () => word))

    return {
      id: `free-loading-${progress.settings.freeTier}-${Date.now()}`,
      mode: 'free',
      focusLetter: null,
      freeTier: progress.settings.freeTier,
      words,
      text: words.join(' '),
      targetLetters: [],
    } as GeneratedLesson
  }

  return generateLesson(
    progress,
    progress.settings.mode,
    progress.settings.mode === 'focus' ? progress.settings.focusLetter : null,
    progress.settings.mode === 'free' ? progress.settings.freeTier : null,
  )
}

async function ensureFreeLessonReady(
  progress: ProgressState,
  set: (partial:
    | TypingStore
    | Partial<TypingStore>
    | ((state: TypingStore) => TypingStore | Partial<TypingStore>),
  ) => void,
) {
  if (progress.settings.mode !== 'free') {
    return
  }

  const freeTier = progress.settings.freeTier
  await loadFreeWordsForTier(freeTier)

  set((state) => {
    if (state.progress.settings.mode !== 'free' || state.progress.settings.freeTier !== freeTier) {
      return {}
    }

    return {
      lesson: generateFreeLesson(freeTier),
      currentIndex: 0,
      attempts: [],
      metricAttempts: [],
      backspaces: 0,
      lessonStartedAt: null,
      lastInputAt: null,
      clock: Date.now(),
      backspacedErrorIndices: new Set<number>(),
      statusMessage: `Free practice: English ${formatFreeCorpusTier(freeTier)} ready.`,
    }
  })
}

function getCurrentLetter(progress: ProgressState, lesson: GeneratedLesson) {
  if (progress.settings.mode === 'free') {
    return null
  }

  return lesson.targetLetters[0] ?? (progress.settings.mode === 'focus' ? progress.settings.focusLetter : getUnlockStatus(progress).bottleneckLetter)
}

function createLessonState(progress: ProgressState, timestamp = Date.now()) {
  return {
    lesson: createLesson(progress),
    currentIndex: 0,
    attempts: [],
    metricAttempts: [],
    backspaces: 0,
    lessonStartedAt: null,
    lastInputAt: null,
    clock: timestamp,
    backspacedErrorIndices: new Set<number>(),
  }
}

function resetCurrentLessonState(timestamp = Date.now()) {
  return {
    currentIndex: 0,
    attempts: [],
    metricAttempts: [],
    backspaces: 0,
    lessonStartedAt: null,
    lastInputAt: null,
    clock: timestamp,
    backspacedErrorIndices: new Set<number>(),
  }
}

function createCompletedLessonState(
  state: TypingStoreState,
  nextMetricAttempts: SessionKeyAttempt[],
  finishedAt: number,
  startedAtOverride?: number,
) {
  const endedAt = new Date(finishedAt).toISOString()
  const startedAt = startedAtOverride ?? state.lessonStartedAt ?? finishedAt
  const correctChars = state.lesson.text.length
  const sessionWpm = getWpm(correctChars, Math.max(1, finishedAt - startedAt))
  const sessionAccuracy = getAccuracy(correctChars, nextMetricAttempts.length)
  const sessionRecord = {
    id: crypto.randomUUID(),
    mode: state.progress.settings.mode,
    focusLetter: state.progress.settings.mode === 'focus' ? state.progress.settings.focusLetter : null,
    targetLetter: state.lesson.targetLetters[0] ?? null,
    freeTier: state.progress.settings.mode === 'free' ? state.progress.settings.freeTier : null,
    startedAt: new Date(startedAt).toISOString(),
    endedAt,
    words: state.lesson.words,
    attempts: nextMetricAttempts.length,
    correctChars,
    accuracy: sessionAccuracy,
    wpm: sessionWpm,
    backspaces: state.backspaces,
    weakLetters: getWeakLetters(state.progress, 3),
  }

  if (state.progress.settings.mode === 'free') {
    const nextProgress: ProgressState = {
      ...state.progress,
      sessions: [
        {
          ...sessionRecord,
          unlockedAfterSession: [...state.progress.unlockedLetters],
        },
        ...state.progress.sessions,
      ].slice(0, MAX_SESSION_HISTORY),
    }

    return {
      progress: nextProgress,
      statusMessage: `Free practice: English ${formatFreeCorpusTier(state.progress.settings.freeTier)} ready.`,
      ...createLessonState(nextProgress, finishedAt),
    }
  }

  const weakLetters = getWeakLetters(state.progress, 3)
  const nextProgress = updateProgressFromSession(state.progress, nextMetricAttempts, {
    ...sessionRecord,
    freeTier: null,
    weakLetters,
  })
  const newUnlock = nextProgress.unlockedLetters.find((letter) => !state.progress.unlockedLetters.includes(letter))

  return {
    progress: nextProgress,
    statusMessage: newUnlock ? `${newUnlock.toUpperCase()} unlocked.` : 'Lesson complete. New set ready.',
    ...createLessonState(nextProgress, finishedAt),
  }
}

export interface TypingStoreState {
  progress: ProgressState
  lesson: GeneratedLesson
  currentIndex: number
  attempts: SessionKeyAttempt[]
  metricAttempts: SessionKeyAttempt[]
  backspaces: number
  lessonStartedAt: number | null
  lastInputAt: number | null
  clock: number
  statusMessage: string
  isLoaded: boolean
  isSaving: boolean
  hasFocus: boolean
  backspacedErrorIndices: Set<number>
}

export interface TypingStoreActions {
  hydrate: () => Promise<void>
  setMode: (mode: PracticeMode) => Promise<void>
  setFocusLetter: (focusLetter: Letter) => void
  setFreeTier: (freeTier: FreeCorpusTier) => Promise<void>
  setUnlockTarget: (metric: UnlockMetric, value: number) => void
  queueFreshLesson: () => Promise<void>
  resetCurrentLetter: () => void
  toggleLetterLock: (letter: Letter) => void
  handleTypedKey: (key: string) => void
  handleBackspace: () => void
  completeLesson: (nextAttempts: SessionKeyAttempt[], finishedAt: number, nextMetricAttempts?: SessionKeyAttempt[]) => void
  resetProgress: () => Promise<void>
  tickClock: () => void
  setHasFocus: (value: boolean) => void
}

type TypingStore = TypingStoreState & TypingStoreActions

export function createInitialTypingStoreState(): TypingStoreState {
  const progress = createInitialProgressState()

  return {
    progress,
    ...createLessonState(progress),
    statusMessage: DEFAULT_STATUS_MESSAGE,
    isLoaded: false,
    isSaving: false,
    hasFocus: false,
    backspacedErrorIndices: new Set<number>(),
  }
}

export const useTypingStore = create<TypingStore>((set) => ({
  ...createInitialTypingStoreState(),
  async hydrate() {
    const storedProgress = await indexedDbStorage.load()
    const nextProgress = storedProgress ?? createInitialProgressState()

    if (nextProgress.settings.mode === 'free') {
      await loadFreeWordsForTier(nextProgress.settings.freeTier)
    }

    set({
      progress: nextProgress,
      ...createLessonState(nextProgress),
      statusMessage: DEFAULT_STATUS_MESSAGE,
      isLoaded: true,
      isSaving: false,
      hasFocus: false,
    })
  },
  async setMode(mode) {
    const nextProgress = (() => {
      const state = useTypingStore.getState()
      const nextProgress: ProgressState = {
        ...state.progress,
        settings: {
          ...state.progress.settings,
          mode,
        },
      }

      set({
        progress: nextProgress,
        statusMessage:
          mode === 'focus'
            ? `Focus drill: ${nextProgress.settings.focusLetter.toUpperCase()}`
            : mode === 'free'
              ? `Loading English ${formatFreeCorpusTier(nextProgress.settings.freeTier)}...`
              : 'Adaptive lesson ready.',
        ...createLessonState(nextProgress),
      })

      return nextProgress
    })()

    if (mode === 'free') {
      await ensureFreeLessonReady(nextProgress, set)
    }
  },
  setFocusLetter(focusLetter) {
    set((state) => {
      const nextProgress: ProgressState = {
        ...state.progress,
        settings: {
          ...state.progress.settings,
          focusLetter,
        },
      }

      return {
        progress: nextProgress,
        statusMessage:
          nextProgress.settings.mode === 'focus' ? `Focus drill: ${focusLetter.toUpperCase()}` : 'Adaptive lesson ready.',
        ...createLessonState(nextProgress),
      }
    })
  },
  async setFreeTier(freeTier) {
    const nextProgress = (() => {
      const state = useTypingStore.getState()
      const nextProgress: ProgressState = {
        ...state.progress,
        settings: {
          ...state.progress.settings,
          freeTier,
        },
      }

      if (state.progress.settings.mode !== 'free') {
        set({
          progress: nextProgress,
        })
        return nextProgress
      }

      set({
        progress: nextProgress,
        statusMessage: `Loading English ${formatFreeCorpusTier(freeTier)}...`,
        ...createLessonState(nextProgress),
      })

      return nextProgress
    })()

    if (nextProgress.settings.mode === 'free') {
      await ensureFreeLessonReady(nextProgress, set)
    }
  },
  setUnlockTarget(metric, value) {
    set((state) => ({
      progress: {
        ...state.progress,
        settings: {
          ...state.progress.settings,
          unlockTargets: {
            ...state.progress.settings.unlockTargets,
            [metric]: clampUnlockTarget(metric, value),
          },
        },
      },
    }))
  },
  async queueFreshLesson() {
    const progress = useTypingStore.getState().progress

    if (progress.settings.mode === 'free') {
      set({
        statusMessage: `Loading English ${formatFreeCorpusTier(progress.settings.freeTier)}...`,
      })
      await ensureFreeLessonReady(progress, set)
      return
    }

    set((state) => createLessonState(state.progress))
  },
  resetCurrentLetter() {
    set((state) => {
      const currentLetter = getCurrentLetter(state.progress, state.lesson)
      if (!currentLetter) {
        return {}
      }

      const nextProgress = resetLetterProgress(state.progress, currentLetter)

      return {
        progress: nextProgress,
        statusMessage: `${currentLetter.toUpperCase()} reset.`,
        ...createLessonState(nextProgress),
      }
    })
  },
  toggleLetterLock(letter) {
    set((state) => {
      const isUnlocked = state.progress.unlockedLetters.includes(letter)
      const now = new Date().toISOString()
      let nextUnlockedLetters: Letter[]

      if (isUnlocked) {
        nextUnlockedLetters = state.progress.unlockedLetters.filter((l) => l !== letter)
      } else {
        nextUnlockedLetters = [...state.progress.unlockedLetters, letter]
      }

      const nextUnlockLetter = getRemainingUnlocks(nextUnlockedLetters)[0] ?? null

      const nextProgress: ProgressState = {
        ...state.progress,
        unlockedLetters: nextUnlockedLetters,
        nextUnlockLetter,
        letterStats: {
          ...state.progress.letterStats,
          [letter]: {
            ...state.progress.letterStats[letter],
            unlockedAt: isUnlocked ? null : (state.progress.letterStats[letter].unlockedAt ?? now),
          },
        },
      }

      return {
        progress: nextProgress,
        statusMessage: `${letter.toUpperCase()} ${isUnlocked ? 'locked' : 'unlocked'}.`,
        ...createLessonState(nextProgress),
      }
    })
  },
  handleTypedKey(key) {
    set((state) => {
      const expected = state.lesson.text[state.currentIndex]
      if (!expected) {
        return {}
      }

      const timestamp = Date.now()
      const lessonStartedAt = state.lessonStartedAt ?? timestamp
      const previousInputAt = state.lastInputAt ?? lessonStartedAt
      const deltaMs = Math.min(Math.max(timestamp - previousInputAt, 80), 2400)
      const attempt: SessionKeyAttempt = {
        expected,
        actual: key,
        correct: key === expected,
        deltaMs,
        index: state.currentIndex,
        timestamp,
      }
      const nextAttempts = [...state.attempts, attempt]
      const nextMetricAttempts = shouldCountMetricAttempt(attempt, state.attempts)
        ? [...state.metricAttempts, attempt]
        : state.metricAttempts

      if (!attempt.correct) {
        return {
          attempts: nextAttempts,
          metricAttempts: nextMetricAttempts,
          lessonStartedAt,
          lastInputAt: timestamp,
          statusMessage: `Retry ${expected === ' ' ? 'space' : expected.toUpperCase()}.`,
        }
      }

      const nextIndex = state.currentIndex + 1
      if (nextIndex === state.lesson.text.length) {
        return createCompletedLessonState(state, nextMetricAttempts, timestamp, lessonStartedAt)
      }

      return {
        attempts: nextAttempts,
        metricAttempts: nextMetricAttempts,
        currentIndex: nextIndex,
        lessonStartedAt,
        lastInputAt: timestamp,
        statusMessage: 'Keep a steady pace.',
      }
    })
  },
  handleBackspace() {
    set((state) => {
      if (state.attempts.length === 0) {
        return {
          backspaces: state.backspaces + 1,
        }
      }

      const removedAttempt = state.attempts[state.attempts.length - 1]
      const nextAttempts = state.attempts.slice(0, -1)
      let metricIndex = -1

      if (removedAttempt.correct) {
        for (let index = state.metricAttempts.length - 1; index >= 0; index -= 1) {
          if (state.metricAttempts[index].timestamp === removedAttempt.timestamp) {
            metricIndex = index
            break
          }
        }
      }

      const nextMetricAttempts =
        metricIndex === -1
          ? state.metricAttempts
          : state.metricAttempts.filter((_, index) => index !== metricIndex)

      // When backspacing, we remove all attempts for the current character position
      // so the red error indicator is cleared and the user can start fresh.
      const removedIndex = removedAttempt.index
      const hadError = state.attempts.some((a) => a.index === removedIndex && !a.correct)
      const nextBackspacedErrorIndices = new Set(state.backspacedErrorIndices)
      
      if (hadError) {
        nextBackspacedErrorIndices.add(removedIndex)
      }

      const finalAttempts = nextAttempts.filter((a) => a.index !== removedIndex)
      const nextLessonStartedAt = finalAttempts.length === 0 ? null : state.lessonStartedAt

      if (removedAttempt.correct) {
        return {
          attempts: finalAttempts,
          metricAttempts: nextMetricAttempts,
          backspaces: state.backspaces + 1,
          currentIndex: Math.max(0, state.currentIndex - 1),
          lessonStartedAt: nextLessonStartedAt,
          lastInputAt: finalAttempts[finalAttempts.length - 1]?.timestamp ?? null,
          statusMessage: 'Last correct key removed.',
          backspacedErrorIndices: nextBackspacedErrorIndices,
        }
      }

      return {
        attempts: finalAttempts,
        metricAttempts: nextMetricAttempts,
        backspaces: state.backspaces + 1,
        lessonStartedAt: nextLessonStartedAt,
        lastInputAt: finalAttempts[finalAttempts.length - 1]?.timestamp ?? null,
        statusMessage: 'Last attempt removed.',
        backspacedErrorIndices: nextBackspacedErrorIndices,
      }
    })
  },
  completeLesson(nextAttempts, finishedAt, nextMetricAttempts) {
    set((state) => createCompletedLessonState(state, nextMetricAttempts ?? nextAttempts, finishedAt))
  },
  async resetProgress() {
    await indexedDbStorage.reset()
    const nextProgress = createInitialProgressState()

    set((state) => ({
      progress: nextProgress,
      ...createLessonState(nextProgress),
      statusMessage: 'Progress reset. Starter lesson ready.',
      isLoaded: state.isLoaded,
      isSaving: false,
      hasFocus: false,
    }))
  },
  tickClock() {
    set((state) => {
      const timestamp = Date.now()

      if (
        state.lastInputAt !== null &&
        timestamp - state.lastInputAt >= LESSON_IDLE_TIMEOUT_MS
      ) {
        return {
          ...resetCurrentLessonState(timestamp),
          statusMessage: 'Lesson reset after 15 seconds of inactivity.',
        }
      }

      return {
        clock: timestamp,
      }
    })
  },
  setHasFocus(value) {
    set({
      hasFocus: value,
    })
  },
}))

export function setTypingStoreSaving(isSaving: boolean) {
  useTypingStore.setState({
    isSaving,
  })
}
