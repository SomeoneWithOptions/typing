import {
  APP_VERSION,
  DEFAULT_FREE_CORPUS_TIER,
  DEFAULT_UNLOCK_TARGETS,
  DEFAULT_FOCUS_LETTER,
  FREE_CORPUS_TIERS,
  MASTERY_ACCURACY_TARGET,
  MASTERY_WPM_TARGET,
  MAX_KEYSTROKE_SESSIONS,
  MAX_SESSION_HISTORY,
  RECENT_LETTER_SESSIONS,
  UNLOCK_SAMPLE_TARGET,
  UNLOCK_TARGET_LIMITS,
  UNLOCK_SEQUENCE,
} from './constants'
import { ALPHABET } from './types'
import type {
  FreeCorpusTier,
  Letter,
  LetterSessionStats,
  LetterStats,
  PracticeMode,
  ProgressState,
  SessionKeyAttempt,
  SessionRecord,
  UnlockMetric,
  UnlockStatus,
  UnlockTargets,
} from './types'

function clamp(value: number, min = 0, max = 1) {
  return Math.min(Math.max(value, min), max)
}

export function clampUnlockTarget(metric: UnlockMetric, value: number) {
  const { min, max, step } = UNLOCK_TARGET_LIMITS[metric]
  const normalized = Number.isFinite(value) ? value : DEFAULT_UNLOCK_TARGETS[metric]
  const stepped = min + Math.round((normalized - min) / step) * step
  return Math.min(max, Math.max(min, stepped))
}

export function isFreeCorpusTier(value: number): value is FreeCorpusTier {
  return FREE_CORPUS_TIERS.includes(value as FreeCorpusTier)
}

export function normalizeFreeCorpusTier(value?: number | null): FreeCorpusTier {
  return value && isFreeCorpusTier(value) ? value : DEFAULT_FREE_CORPUS_TIER
}

export function normalizeUnlockTargets(targets?: Partial<UnlockTargets> | null): UnlockTargets {
  return {
    hits: clampUnlockTarget('hits', targets?.hits ?? DEFAULT_UNLOCK_TARGETS.hits),
    accuracy: clampUnlockTarget('accuracy', targets?.accuracy ?? DEFAULT_UNLOCK_TARGETS.accuracy),
    wpm: clampUnlockTarget('wpm', targets?.wpm ?? DEFAULT_UNLOCK_TARGETS.wpm),
  }
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

function getRecentLetterSessions(stats: LetterStats) {
  return stats.recentSessions.length > 0 ? stats.recentSessions : []
}

function getRecentAttempts(stats: LetterStats) {
  const sessions = getRecentLetterSessions(stats)
  return sessions.length > 0 ? sessions.reduce((sum, session) => sum + session.attempts, 0) : stats.attempts
}

function getRecentCorrectHits(stats: LetterStats) {
  const sessions = getRecentLetterSessions(stats)
  return sessions.length > 0 ? sessions.reduce((sum, session) => sum + session.correctHits, 0) : stats.correctHits
}

function getRecentAccuracyAverage(stats: LetterStats) {
  const sessions = getRecentLetterSessions(stats)

  if (sessions.length === 0) {
    const attempts = stats.attempts === 0 ? getRecentAttempts(stats) : stats.attempts
    return attempts === 0 ? 0 : (stats.correctHits / attempts) * 100
  }

  return sessions.reduce((sum, session) => {
    if (typeof session.accuracy === 'number' && Number.isFinite(session.accuracy)) {
      return sum + session.accuracy
    }

    if (session.attempts === 0) {
      return sum
    }

    return sum + (session.correctHits / session.attempts) * 100
  }, 0) / sessions.length
}

function getRecentWpmAverage(stats: LetterStats) {
  const sessions = getRecentLetterSessions(stats)

  if (sessions.length === 0) {
    return msToWpm(stats.smoothedMs)
  }

  return sessions.reduce((sum, session) => {
    if (typeof session.wpm === 'number' && Number.isFinite(session.wpm)) {
      return sum + session.wpm
    }

    if (session.correctHits === 0 || session.totalCorrectMs <= 0) {
      return sum
    }

    return sum + msToWpm(session.totalCorrectMs / session.correctHits)
  }, 0) / sessions.length
}

function getActiveUnlockLetter(state: ProgressState) {
  if (state.settings.mode === 'focus') {
    return state.settings.focusLetter
  }

  if (state.settings.mode === 'adaptive') {
    return state.unlockedLetters[state.unlockedLetters.length - 1] ?? null
  }

  return null
}

function getSessionTargetLetter(
  state: ProgressState,
  session: Omit<SessionRecord, 'unlockedAfterSession'>,
) {
  if (session.targetLetter && isLetter(session.targetLetter)) {
    return session.targetLetter
  }

  if (session.mode === 'focus' && session.focusLetter && isLetter(session.focusLetter)) {
    return session.focusLetter
  }

  if (session.mode === 'adaptive') {
    return getActiveUnlockLetter(state)
  }

  return null
}

function isValidRecentLetterSession(value: unknown): value is LetterSessionStats {
  if (!value || typeof value !== 'object') {
    return false
  }

  const candidate = value as Partial<LetterSessionStats>
  return (
    typeof candidate.endedAt === 'string' &&
    typeof candidate.attempts === 'number' &&
    Number.isFinite(candidate.attempts) &&
    typeof candidate.correctHits === 'number' &&
    Number.isFinite(candidate.correctHits) &&
    typeof candidate.totalCorrectMs === 'number' &&
    Number.isFinite(candidate.totalCorrectMs) &&
    (typeof candidate.accuracy === 'undefined' || (typeof candidate.accuracy === 'number' && Number.isFinite(candidate.accuracy))) &&
    (typeof candidate.wpm === 'undefined' || (typeof candidate.wpm === 'number' && Number.isFinite(candidate.wpm)))
  )
}

function normalizeRecentLetterSessions(value: unknown) {
  if (!Array.isArray(value)) {
    return []
  }

  return value.filter(isValidRecentLetterSession).slice(-RECENT_LETTER_SESSIONS)
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
  return getRecentAccuracyAverage(stats)
}

export function getLetterWpm(stats: LetterStats) {
  return getRecentWpmAverage(stats)
}

export function getLetterHits(stats: LetterStats) {
  return getRecentCorrectHits(stats)
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
    recentSessions: [],
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
      freeTier: DEFAULT_FREE_CORPUS_TIER,
      unlockTargets: normalizeUnlockTargets(),
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
              recentSessions: normalizeRecentLetterSessions(saved.recentSessions),
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

  const mode: PracticeMode =
    input.settings?.mode === 'focus' || input.settings?.mode === 'free' ? input.settings.mode : 'adaptive'
  const unlockTargets = normalizeUnlockTargets(input.settings?.unlockTargets)
  const freeTier = normalizeFreeCorpusTier(input.settings?.freeTier)
  const sessions = input.sessions.slice(0, MAX_SESSION_HISTORY).map((session, index) => ({
    ...session,
    focusLetter: session.mode === 'focus' && session.focusLetter && isLetter(session.focusLetter) ? session.focusLetter : null,
    targetLetter: session.mode !== 'free' && session.targetLetter && isLetter(session.targetLetter) ? session.targetLetter : null,
    freeTier: session.mode === 'free' ? normalizeFreeCorpusTier(session.freeTier) : null,
    keystrokes: index < MAX_KEYSTROKE_SESSIONS ? session.keystrokes : undefined,
  }))

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
      freeTier,
      mode,
      unlockTargets,
    },
    sessions,
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
  const activeLetter = getActiveUnlockLetter(state)
  const { hits, accuracy, wpm } = state.settings.unlockTargets
  const trackedLetters = activeLetter ? [activeLetter] : []
  const sampleStatus = getLowestMetric(trackedLetters, (letter) => getRecentCorrectHits(state.letterStats[letter]), hits)
  const accuracyStatus = getLowestMetric(trackedLetters, (letter) => getLetterAccuracy(state.letterStats[letter]), accuracy)
  const speedStatus = getLowestMetric(trackedLetters, (letter) => getLetterWpm(state.letterStats[letter]), wpm)

  if (!state.nextUnlockLetter) {
    return {
      nextLetter: null,
      bottleneckLetter: activeLetter,
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
    bottleneckLetter: activeLetter,
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
      getRecentCorrectHits(updated) >= UNLOCK_SAMPLE_TARGET &&
      getLetterAccuracy(updated) >= MASTERY_ACCURACY_TARGET &&
      getLetterWpm(updated) >= MASTERY_WPM_TARGET
    ) {
      updated.masteredAt = now
    }

    nextState.letterStats[attempt.expected] = updated
  }

  const targetLetter = getSessionTargetLetter(state, session)

  if (targetLetter) {
    const current = nextState.letterStats[targetLetter]
    const correctHits = attempts.filter((attempt) => attempt.correct && attempt.expected === targetLetter).length

    const recentStats: LetterSessionStats = {
      endedAt: now,
      attempts: session.attempts,
      correctHits,
      totalCorrectMs: 0,
      accuracy: session.accuracy,
      wpm: session.wpm,
    }

    nextState.letterStats[targetLetter] = {
      ...current,
      recentSessions: [...current.recentSessions, recentStats].slice(-RECENT_LETTER_SESSIONS),
    }

    const updatedTargetStats = nextState.letterStats[targetLetter]
    if (
      !updatedTargetStats.masteredAt &&
      getRecentCorrectHits(updatedTargetStats) >= UNLOCK_SAMPLE_TARGET &&
      getLetterAccuracy(updatedTargetStats) >= MASTERY_ACCURACY_TARGET &&
      getLetterWpm(updatedTargetStats) >= MASTERY_WPM_TARGET
    ) {
      nextState.letterStats[targetLetter] = {
        ...updatedTargetStats,
        masteredAt: now,
      }
    }
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
  const activeLetter = getActiveUnlockLetter(state)

  if (!state.nextUnlockLetter || !activeLetter) {
    return false
  }

  const { hits, accuracy, wpm } = state.settings.unlockTargets
  const stats = state.letterStats[activeLetter]

  return (
    getRecentCorrectHits(stats) >= hits &&
    getLetterAccuracy(stats) >= accuracy &&
    getLetterWpm(stats) >= wpm
  )
}

function getLetterWeakness(stats: LetterStats) {
  const sampleGap = Math.max(0, UNLOCK_SAMPLE_TARGET - getRecentCorrectHits(stats)) / UNLOCK_SAMPLE_TARGET
  const speedGap = Math.max(0, MASTERY_WPM_TARGET - getLetterWpm(stats)) / MASTERY_WPM_TARGET
  const accuracyGap = Math.max(0, MASTERY_ACCURACY_TARGET - getLetterAccuracy(stats)) / MASTERY_ACCURACY_TARGET
  return sampleGap * 0.5 + speedGap * 0.9 + accuracyGap * 1.2
}
