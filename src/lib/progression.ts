import {
  APP_VERSION,
  DEFAULT_FOCUS_LETTER,
  MASTERY_ACCURACY_TARGET,
  MASTERY_WPM_TARGET,
  MAX_SESSION_HISTORY,
  UNLOCK_ACCURACY_TARGET,
  UNLOCK_SAMPLE_TARGET,
  UNLOCK_SEQUENCE,
  UNLOCK_WPM_TARGET,
} from './constants'
import { ALPHABET } from './types'
import type {
  Letter,
  LetterStats,
  PracticeMode,
  ProgressState,
  SessionKeyAttempt,
  SessionRecord,
  UnlockStatus,
} from './types'

function clamp(value: number, min = 0, max = 1) {
  return Math.min(Math.max(value, min), max)
}

function getLowestMetric<T extends number>(
  letters: Letter[],
  getValue: (letter: Letter) => T,
  target: number,
) {
  if (letters.length === 0) {
    return {
      letter: null,
      value: 0,
      progress: 1,
    }
  }

  return letters.reduce<{ letter: Letter; value: T; progress: number }>((lowest, letter) => {
    const value = getValue(letter)
    const progress = clamp(value / target)

    if (
      progress < lowest.progress ||
      (progress === lowest.progress && value < lowest.value) ||
      (progress === lowest.progress && value === lowest.value && letter.localeCompare(lowest.letter) < 0)
    ) {
      return { letter, value, progress }
    }

    return lowest
  }, (() => {
    const firstLetter = letters[0]
    const value = getValue(firstLetter)
    return {
      letter: firstLetter,
      value,
      progress: clamp(value / target),
    }
  })())
}

export function isLetter(value: string): value is Letter {
  return ALPHABET.includes(value as Letter)
}

export function msToWpm(ms: number | null) {
  if (!ms || ms <= 0) {
    return 0
  }

  return 12000 / ms
}

export function getLetterAccuracy(stats: LetterStats) {
  if (stats.attempts === 0) {
    return 0
  }

  return (stats.correctHits / stats.attempts) * 100
}

export function getLetterWpm(stats: LetterStats) {
  return msToWpm(stats.smoothedMs)
}

export function createLetterStats(letter: Letter, unlocked = false, timestamp = new Date().toISOString()): LetterStats {
  return {
    letter,
    attempts: 0,
    correctHits: 0,
    totalCorrectMs: 0,
    smoothedMs: null,
    fastestWpm: 0,
    lastPracticedAt: null,
    unlockedAt: unlocked ? timestamp : null,
    masteredAt: null,
  }
}

export function createInitialProgressState(timestamp = new Date().toISOString()): ProgressState {
  const unlockedSet = new Set(UNLOCK_SEQUENCE.initial)
  const letterStats = Object.fromEntries(
    ALPHABET.map((letter) => [letter, createLetterStats(letter, unlockedSet.has(letter), timestamp)]),
  ) as Record<Letter, LetterStats>

  return {
    version: APP_VERSION,
    unlockedLetters: [...UNLOCK_SEQUENCE.initial],
    nextUnlockLetter: UNLOCK_SEQUENCE.order[0],
    letterStats,
    sessions: [],
    settings: {
      mode: 'adaptive',
      focusLetter: DEFAULT_FOCUS_LETTER,
    },
  }
}

export function resetLetterProgress(state: ProgressState, letter: Letter, timestamp = new Date().toISOString()): ProgressState {
  const baseStats = createLetterStats(letter, state.unlockedLetters.includes(letter), timestamp)
  const previousStats = state.letterStats[letter]

  return {
    ...state,
    letterStats: {
      ...state.letterStats,
      [letter]: {
        ...baseStats,
        unlockedAt: previousStats.unlockedAt ?? baseStats.unlockedAt,
      },
    },
  }
}

export function hydratingProgressState(input: ProgressState | null): ProgressState {
  if (!input) {
    return createInitialProgressState()
  }

  const base = createInitialProgressState()
  const unlockedLetters = input.unlockedLetters.filter(isLetter)
  const unlockedSet = new Set(unlockedLetters)

  const letterStats = Object.fromEntries(
    ALPHABET.map((letter) => {
      const saved = input.letterStats[letter]
      return [
        letter,
        saved
          ? {
              ...base.letterStats[letter],
              ...saved,
              letter,
              unlockedAt: saved.unlockedAt ?? (unlockedSet.has(letter) ? base.letterStats[letter].unlockedAt : null),
            }
          : {
              ...base.letterStats[letter],
              unlockedAt: unlockedSet.has(letter) ? base.letterStats[letter].unlockedAt : null,
            },
      ]
    }),
  ) as Record<Letter, LetterStats>

  const nextUnlockLetter =
    input.nextUnlockLetter && isLetter(input.nextUnlockLetter) ? input.nextUnlockLetter : getRemainingUnlocks(unlockedLetters)[0] ?? null

  const mode: PracticeMode = input.settings?.mode === 'focus' ? 'focus' : 'adaptive'

  return {
    ...base,
    ...input,
    unlockedLetters,
    nextUnlockLetter,
    letterStats,
    settings: {
      ...base.settings,
      ...input.settings,
      focusLetter:
        input.settings && isLetter(input.settings.focusLetter) ? input.settings.focusLetter : DEFAULT_FOCUS_LETTER,
      mode,
    },
    sessions: input.sessions.slice(0, MAX_SESSION_HISTORY),
  }
}

export function getRemainingUnlocks(unlockedLetters: Letter[]) {
  const unlocked = new Set(unlockedLetters)
  return UNLOCK_SEQUENCE.order.filter((letter) => !unlocked.has(letter))
}

export function getWeakLetters(state: ProgressState, count = 3) {
  return [...state.unlockedLetters]
    .sort((left, right) => getLetterWeakness(state.letterStats[right]) - getLetterWeakness(state.letterStats[left]) || left.localeCompare(right))
    .slice(0, count)
}

export function getUnlockStatus(state: ProgressState): UnlockStatus {
  const unlockedLetters = state.unlockedLetters
  const bottleneckLetter =
    unlockedLetters.length > 0
      ? [...unlockedLetters].sort((a, b) => getLetterWeakness(state.letterStats[b]) - getLetterWeakness(state.letterStats[a]))[0]
      : null
  const sampleStatus = getLowestMetric(unlockedLetters, (letter) => state.letterStats[letter].correctHits, UNLOCK_SAMPLE_TARGET)
  const accuracyStatus = getLowestMetric(unlockedLetters, (letter) => getLetterAccuracy(state.letterStats[letter]), UNLOCK_ACCURACY_TARGET)
  const speedStatus = getLowestMetric(unlockedLetters, (letter) => getLetterWpm(state.letterStats[letter]), UNLOCK_WPM_TARGET)

  if (!state.nextUnlockLetter) {
    return {
      nextLetter: null,
      bottleneckLetter,
      sampleLetter: sampleStatus.letter,
      sampleHits: sampleStatus.value,
      sampleProgress: 1,
      accuracyLetter: accuracyStatus.letter,
      accuracyValue: accuracyStatus.value,
      accuracyProgress: 1,
      speedLetter: speedStatus.letter,
      speedWpm: speedStatus.value,
      speedProgress: 1,
    }
  }

  return {
    nextLetter: state.nextUnlockLetter,
    bottleneckLetter,
    sampleLetter: sampleStatus.letter,
    sampleHits: sampleStatus.value,
    sampleProgress: sampleStatus.progress,
    accuracyLetter: accuracyStatus.letter,
    accuracyValue: accuracyStatus.value,
    accuracyProgress: accuracyStatus.progress,
    speedLetter: speedStatus.letter,
    speedWpm: speedStatus.value,
    speedProgress: speedStatus.progress,
  }
}

export function updateProgressFromSession(
  state: ProgressState,
  attempts: SessionKeyAttempt[],
  session: Omit<SessionRecord, 'unlockedAfterSession'>,
) {
  const nextState: ProgressState = {
    ...state,
    unlockedLetters: [...state.unlockedLetters],
    letterStats: { ...state.letterStats },
    sessions: [...state.sessions],
  }
  const now = session.endedAt

  for (const attempt of attempts) {
    if (!isLetter(attempt.expected)) {
      continue
    }

    const current = nextState.letterStats[attempt.expected]
    const updated: LetterStats = {
      ...current,
      attempts: current.attempts + 1,
      lastPracticedAt: now,
    }

    if (attempt.correct) {
      const effectiveDelta = Math.min(Math.max(attempt.deltaMs, 80), 1800)
      updated.correctHits = current.correctHits + 1
      updated.totalCorrectMs = current.totalCorrectMs + effectiveDelta
      updated.smoothedMs =
        current.smoothedMs === null ? effectiveDelta : Math.round(current.smoothedMs * 0.78 + effectiveDelta * 0.22)
      updated.fastestWpm = Math.max(current.fastestWpm, msToWpm(effectiveDelta))
    }

    if (
      !updated.masteredAt &&
      updated.correctHits >= UNLOCK_SAMPLE_TARGET &&
      getLetterAccuracy(updated) >= MASTERY_ACCURACY_TARGET &&
      getLetterWpm(updated) >= MASTERY_WPM_TARGET
    ) {
      updated.masteredAt = now
    }

    nextState.letterStats[attempt.expected] = updated
  }

  if (canUnlockNextLetter(nextState) && nextState.nextUnlockLetter) {
    nextState.unlockedLetters = [...nextState.unlockedLetters, nextState.nextUnlockLetter]
    nextState.letterStats[nextState.nextUnlockLetter] = {
      ...nextState.letterStats[nextState.nextUnlockLetter],
      unlockedAt: now,
    }
    nextState.nextUnlockLetter = getRemainingUnlocks(nextState.unlockedLetters)[0] ?? null
  }

  nextState.sessions = [
    {
      ...session,
      unlockedAfterSession: [...nextState.unlockedLetters],
    },
    ...nextState.sessions,
  ].slice(0, MAX_SESSION_HISTORY)

  return nextState
}

export function canUnlockNextLetter(state: ProgressState) {
  if (!state.nextUnlockLetter) {
    return false
  }

  return state.unlockedLetters.every((letter) => {
    const stats = state.letterStats[letter]
    return (
      stats.correctHits >= UNLOCK_SAMPLE_TARGET &&
      getLetterAccuracy(stats) >= UNLOCK_ACCURACY_TARGET &&
      getLetterWpm(stats) >= UNLOCK_WPM_TARGET
    )
  })
}

function getLetterWeakness(stats: LetterStats) {
  const sampleGap = Math.max(0, UNLOCK_SAMPLE_TARGET - stats.correctHits) / UNLOCK_SAMPLE_TARGET
  const speedGap = Math.max(0, MASTERY_WPM_TARGET - getLetterWpm(stats)) / MASTERY_WPM_TARGET
  const accuracyGap = Math.max(0, MASTERY_ACCURACY_TARGET - getLetterAccuracy(stats)) / MASTERY_ACCURACY_TARGET
  return sampleGap * 0.5 + speedGap * 0.9 + accuracyGap * 1.2
}
