import { describe, expect, it } from 'vitest'
import { UNLOCK_ACCURACY_TARGET, UNLOCK_SAMPLE_TARGET } from './constants'
import {
  canUnlockNextLetter,
  createInitialProgressState,
  getLetterWpm,
  getUnlockStatus,
  hydratingProgressState,
  updateProgressFromSession,
} from './progression'
import type { SessionKeyAttempt } from './types'

describe('progression', () => {
  it('unlocks at the lowest achievable accuracy above the 95 percent gate', () => {
    const state = createInitialProgressState('2026-03-07T00:00:00.000Z')

    for (const letter of state.unlockedLetters) {
      state.letterStats[letter] = {
        ...state.letterStats[letter],
        attempts: UNLOCK_SAMPLE_TARGET + 2,
        correctHits: UNLOCK_SAMPLE_TARGET,
        totalCorrectMs: 4000,
        smoothedMs: 300,
      }
    }

    expect((UNLOCK_SAMPLE_TARGET / (UNLOCK_SAMPLE_TARGET + 2)) * 100).toBeGreaterThanOrEqual(UNLOCK_ACCURACY_TARGET)
    expect(canUnlockNextLetter(state)).toBe(true)
  })

  it('unlocks one letter at a time when all current letters meet the threshold', () => {
    const state = createInitialProgressState('2026-03-07T00:00:00.000Z')

    for (const letter of state.unlockedLetters) {
      state.letterStats[letter] = {
        ...state.letterStats[letter],
        attempts: UNLOCK_SAMPLE_TARGET,
        correctHits: UNLOCK_SAMPLE_TARGET,
        totalCorrectMs: 4000,
        smoothedMs: 300,
      }
    }

    expect(canUnlockNextLetter(state)).toBe(true)

    const attempts: SessionKeyAttempt[] = [
      {
        expected: 'e',
        actual: 'e',
        correct: true,
        deltaMs: 280,
        index: 0,
        timestamp: Date.now(),
      },
    ]

    const nextState = updateProgressFromSession(state, attempts, {
      id: 'session-1',
      mode: 'adaptive',
      focusLetter: null,
      startedAt: '2026-03-07T00:00:00.000Z',
      endedAt: '2026-03-07T00:01:00.000Z',
      words: ['learn'],
      attempts: 1,
      correctChars: 1,
      accuracy: 100,
      wpm: 48,
      backspaces: 0,
      weakLetters: ['e', 'n', 'i'],
    })

    expect(nextState.unlockedLetters).toContain('t')
    expect(nextState.nextUnlockLetter).toBe('o')
  })

  it('derives stable accuracy and speed metrics from letter stats', () => {
    const state = createInitialProgressState()
    const stats = {
      ...state.letterStats.e,
      attempts: UNLOCK_SAMPLE_TARGET,
      correctHits: UNLOCK_SAMPLE_TARGET - 1,
      smoothedMs: 320,
    }

    expect((stats.correctHits / stats.attempts) * 100).toBeGreaterThanOrEqual(UNLOCK_ACCURACY_TARGET)
    expect(getLetterWpm(stats)).toBeGreaterThan(24)
  })

  it('reports the exact blocking letter and value for each unlock metric', () => {
    const state = createInitialProgressState('2026-03-07T00:00:00.000Z')

    for (const letter of state.unlockedLetters) {
      state.letterStats[letter] = {
        ...state.letterStats[letter],
        attempts: UNLOCK_SAMPLE_TARGET,
        correctHits: UNLOCK_SAMPLE_TARGET,
        totalCorrectMs: 4000,
        smoothedMs: 300,
      }
    }

    state.letterStats.a = {
      ...state.letterStats.a,
      attempts: 40,
      correctHits: 39,
      totalCorrectMs: 4000,
      smoothedMs: 300,
    }

    state.letterStats.e = {
      ...state.letterStats.e,
      attempts: 42,
      correctHits: 40,
      totalCorrectMs: 4000,
      smoothedMs: 300,
    }

    state.letterStats.i = {
      ...state.letterStats.i,
      attempts: 40,
      correctHits: 40,
      totalCorrectMs: 0,
      smoothedMs: 520,
    }

    const unlockStatus = getUnlockStatus(state)

    expect(unlockStatus.sampleLetter).toBe('a')
    expect(unlockStatus.sampleHits).toBe(39)
    expect(unlockStatus.sampleProgress).toBe(39 / 40)
    expect(unlockStatus.accuracyLetter).toBe('e')
    expect(unlockStatus.accuracyValue).toBeCloseTo((40 / 42) * 100)
    expect(unlockStatus.speedLetter).toBe('i')
    expect(unlockStatus.speedWpm).toBeCloseTo(12000 / 520)
  })

  it('uses custom unlock targets when calculating unlock readiness and progress', () => {
    const state = createInitialProgressState('2026-03-07T00:00:00.000Z')
    state.settings.unlockTargets = {
      hits: 20,
      accuracy: 90,
      wpm: 18,
    }

    for (const letter of state.unlockedLetters) {
      state.letterStats[letter] = {
        ...state.letterStats[letter],
        attempts: 20,
        correctHits: 20,
        totalCorrectMs: 5_600,
        smoothedMs: 420,
      }
    }

    state.letterStats.e = {
      ...state.letterStats.e,
      attempts: 22,
      correctHits: 20,
      totalCorrectMs: 5_600,
      smoothedMs: 420,
    }

    const unlockStatus = getUnlockStatus(state)

    expect(canUnlockNextLetter(state)).toBe(true)
    expect(unlockStatus.sampleProgress).toBe(1)
    expect(unlockStatus.accuracyLetter).toBe('e')
    expect(unlockStatus.accuracyProgress).toBe(1)
    expect(unlockStatus.speedProgress).toBe(1)
  })

  it('hydrates missing or invalid unlock targets with safe defaults and limits', () => {
    const legacyState = createInitialProgressState('2026-03-07T00:00:00.000Z')
    legacyState.settings = {
      mode: 'focus',
      focusLetter: 'q',
      unlockTargets: undefined as never,
    }

    const hydratedLegacy = hydratingProgressState(legacyState)
    expect(hydratedLegacy.settings.unlockTargets).toEqual({
      hits: 40,
      accuracy: 95,
      wpm: 24,
    })

    const invalidState = createInitialProgressState('2026-03-07T00:00:00.000Z')
    invalidState.settings.unlockTargets = {
      hits: 10_003,
      accuracy: 102,
      wpm: 301,
    }

    const hydratedInvalid = hydratingProgressState(invalidState)
    expect(hydratedInvalid.settings.unlockTargets).toEqual({
      hits: 9999,
      accuracy: 100,
      wpm: 300,
    })
  })

  it('applies custom unlock targets to sessions completed in focus mode', () => {
    const state = createInitialProgressState('2026-03-07T00:00:00.000Z')
    state.settings.mode = 'focus'
    state.settings.focusLetter = 'e'
    state.settings.unlockTargets = {
      hits: 10,
      accuracy: 80,
      wpm: 12,
    }

    for (const letter of state.unlockedLetters) {
      state.letterStats[letter] = {
        ...state.letterStats[letter],
        attempts: 10,
        correctHits: 10,
        totalCorrectMs: 5_000,
        smoothedMs: 500,
      }
    }

    const attempts: SessionKeyAttempt[] = [
      {
        expected: 'e',
        actual: 'e',
        correct: true,
        deltaMs: 280,
        index: 0,
        timestamp: Date.now(),
      },
    ]

    const nextState = updateProgressFromSession(state, attempts, {
      id: 'focus-session-1',
      mode: 'focus',
      focusLetter: 'e',
      startedAt: '2026-03-07T00:00:00.000Z',
      endedAt: '2026-03-07T00:01:00.000Z',
      words: ['e'],
      attempts: 1,
      correctChars: 1,
      accuracy: 100,
      wpm: 48,
      backspaces: 0,
      weakLetters: ['e', 'n', 'i'],
    })

    expect(nextState.unlockedLetters).toContain('t')
    expect(nextState.nextUnlockLetter).toBe('o')
  })
})
