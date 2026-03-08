import { create } from 'zustand'
import { LESSON_IDLE_TIMEOUT_MS } from './constants'
import { generateLesson } from './lesson-engine'
import {
  createInitialProgressState,
  getUnlockStatus,
  getWeakLetters,
  resetLetterProgress,
  updateProgressFromSession,
} from './progression'
import { getAccuracy, getWpm } from './session-metrics'
import { indexedDbStorage } from './storage'
import type {
  GeneratedLesson,
  Letter,
  PracticeMode,
  ProgressState,
  SessionKeyAttempt,
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
  return generateLesson(
    progress,
    progress.settings.mode,
    progress.settings.mode === 'focus' ? progress.settings.focusLetter : null,
  )
}

function getCurrentLetter(progress: ProgressState, lesson: GeneratedLesson) {
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
  const weakLetters = getWeakLetters(state.progress, 3)
  const nextProgress = updateProgressFromSession(state.progress, nextMetricAttempts, {
    id: crypto.randomUUID(),
    mode: state.progress.settings.mode,
    focusLetter: state.progress.settings.mode === 'focus' ? state.progress.settings.focusLetter : null,
    startedAt: new Date(startedAt).toISOString(),
    endedAt,
    words: state.lesson.words,
    attempts: nextMetricAttempts.length,
    correctChars,
    accuracy: sessionAccuracy,
    wpm: sessionWpm,
    backspaces: state.backspaces,
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
}

export interface TypingStoreActions {
  hydrate: () => Promise<void>
  setMode: (mode: PracticeMode) => void
  setFocusLetter: (focusLetter: Letter) => void
  queueFreshLesson: () => void
  resetCurrentLetter: () => void
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
  }
}

export const useTypingStore = create<TypingStore>((set) => ({
  ...createInitialTypingStoreState(),
  async hydrate() {
    const storedProgress = await indexedDbStorage.load()
    const nextProgress = storedProgress ?? createInitialProgressState()

    set({
      progress: nextProgress,
      ...createLessonState(nextProgress),
      statusMessage: DEFAULT_STATUS_MESSAGE,
      isLoaded: true,
      isSaving: false,
      hasFocus: false,
    })
  },
  setMode(mode) {
    set((state) => {
      const nextProgress: ProgressState = {
        ...state.progress,
        settings: {
          ...state.progress.settings,
          mode,
        },
      }

      return {
        progress: nextProgress,
        statusMessage:
          mode === 'focus' ? `Focus drill: ${nextProgress.settings.focusLetter.toUpperCase()}` : 'Adaptive lesson ready.',
        ...createLessonState(nextProgress),
      }
    })
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
  queueFreshLesson() {
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

      const nextAttempts = state.attempts.slice(0, -1)
      const removedAttempt = state.attempts[state.attempts.length - 1]
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
      const nextLessonStartedAt = nextAttempts.length === 0 ? null : state.lessonStartedAt

      if (removedAttempt.correct) {
        return {
          attempts: nextAttempts,
          metricAttempts: nextMetricAttempts,
          backspaces: state.backspaces + 1,
          currentIndex: Math.max(0, state.currentIndex - 1),
          lessonStartedAt: nextLessonStartedAt,
          lastInputAt: nextAttempts[nextAttempts.length - 1]?.timestamp ?? null,
          statusMessage: 'Last correct key removed.',
        }
      }

      return {
        attempts: nextAttempts,
        metricAttempts: nextMetricAttempts,
        backspaces: state.backspaces + 1,
        lessonStartedAt: nextLessonStartedAt,
        lastInputAt: nextAttempts[nextAttempts.length - 1]?.timestamp ?? null,
        statusMessage: 'Last attempt removed.',
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
