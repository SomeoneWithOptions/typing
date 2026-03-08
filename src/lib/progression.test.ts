import { describe, expect, it } from 'vitest'
import { RECENT_LETTER_SESSIONS, UNLOCK_ACCURACY_TARGET, UNLOCK_SAMPLE_TARGET } from './constants'
import {
  canUnlockNextLetter,
  createInitialProgressState,
  getLetterAccuracy,
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
    state.letterStats.l = {
      ...state.letterStats.l,
      recentSessions: [
        {
          endedAt: '2026-03-07T00:00:00.000Z',
          attempts: UNLOCK_SAMPLE_TARGET,
          correctHits: UNLOCK_SAMPLE_TARGET,
          totalCorrectMs: 0,
          accuracy: 100,
          wpm: 48,
        },
      ],
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
      freeTier: null,
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

  it('prefers recent per-letter sessions over lifetime aggregates for accuracy and speed', () => {
    const state = createInitialProgressState()
    const stats = {
      ...state.letterStats.e,
      attempts: 100,
      correctHits: 40,
      totalCorrectMs: 20_000,
      smoothedMs: 500,
      recentSessions: [
        {
          endedAt: '2026-03-07T00:01:00.000Z',
          attempts: 12,
          correctHits: 12,
          totalCorrectMs: 2_400,
        },
      ],
    }

    expect(getLetterAccuracy(stats)).toBe(100)
    expect(getLetterWpm(stats)).toBeCloseTo(60)
  })

  it('averages session wpm values across the last targeted sessions for a letter', () => {
    const state = createInitialProgressState()
    const stats = {
      ...state.letterStats.e,
      recentSessions: [
        {
          endedAt: '2026-03-07T00:01:00.000Z',
          attempts: 30,
          correctHits: 15,
          totalCorrectMs: 0,
          accuracy: 93.33,
          wpm: 53,
        },
        {
          endedAt: '2026-03-07T00:02:00.000Z',
          attempts: 30,
          correctHits: 15,
          totalCorrectMs: 0,
          accuracy: 96.31,
          wpm: 60,
        },
      ],
    }

    expect(getLetterWpm(stats)).toBeCloseTo(56.5)
    expect(getLetterAccuracy(stats)).toBeCloseTo((93.33 + 96.31) / 2)
  })

  it('reports unlock metrics for the active target letter', () => {
    const state = createInitialProgressState('2026-03-07T00:00:00.000Z')
    state.letterStats.l = {
      ...state.letterStats.l,
      recentSessions: [
        {
          endedAt: '2026-03-07T00:01:00.000Z',
          attempts: 42,
          correctHits: 39,
          totalCorrectMs: 0,
          accuracy: 92,
          wpm: 47,
        },
      ],
    }

    const unlockStatus = getUnlockStatus(state)

    expect(unlockStatus.sampleLetter).toBe('l')
    expect(unlockStatus.sampleHits).toBe(39)
    expect(unlockStatus.sampleProgress).toBe(39 / 40)
    expect(unlockStatus.accuracyLetter).toBe('l')
    expect(unlockStatus.accuracyValue).toBe(92)
    expect(unlockStatus.speedLetter).toBe('l')
    expect(unlockStatus.speedWpm).toBe(47)
  })

  it('uses custom unlock targets for the active target letter only', () => {
    const state = createInitialProgressState('2026-03-07T00:00:00.000Z')
    state.settings.unlockTargets = {
      hits: 20,
      accuracy: 90,
      wpm: 18,
    }

    state.letterStats.l = {
      ...state.letterStats.l,
      recentSessions: [
        {
          endedAt: '2026-03-07T00:01:00.000Z',
          attempts: 24,
          correctHits: 20,
          totalCorrectMs: 0,
          accuracy: 91,
          wpm: 21,
        },
      ],
    }

    const unlockStatus = getUnlockStatus(state)

    expect(canUnlockNextLetter(state)).toBe(true)
    expect(unlockStatus.sampleProgress).toBe(1)
    expect(unlockStatus.accuracyLetter).toBe('l')
    expect(unlockStatus.accuracyProgress).toBe(1)
    expect(unlockStatus.speedProgress).toBe(1)
  })

  it('hydrates missing or invalid unlock targets with safe defaults and limits', () => {
    const legacyState = createInitialProgressState('2026-03-07T00:00:00.000Z')
    legacyState.settings = {
      mode: 'focus',
      focusLetter: 'q',
      freeTier: 200,
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

  it('hydrates missing free tier values to the 200-word default', () => {
    const legacyState = createInitialProgressState('2026-03-07T00:00:00.000Z')
    legacyState.settings = {
      ...legacyState.settings,
      mode: 'free',
      freeTier: undefined as never,
    }

    const hydratedLegacy = hydratingProgressState(legacyState)

    expect(hydratedLegacy.settings.mode).toBe('free')
    expect(hydratedLegacy.settings.freeTier).toBe(200)
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
    state.letterStats.e = {
      ...state.letterStats.e,
      recentSessions: [
        {
          endedAt: '2026-03-07T00:00:00.000Z',
          attempts: 10,
          correctHits: 10,
          totalCorrectMs: 0,
          accuracy: 100,
          wpm: 48,
        },
      ],
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
      freeTier: null,
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

  it('stores only the last 10 recent sessions for the session target letter', () => {
    let state = createInitialProgressState('2026-03-07T00:00:00.000Z')

    for (let index = 0; index < RECENT_LETTER_SESSIONS + 2; index += 1) {
      state = updateProgressFromSession(state, [
        {
          expected: 'e',
          actual: 'e',
          correct: true,
          deltaMs: 300 + index,
          index: 0,
          timestamp: index + 1,
        },
      ], {
        id: `session-${index}`,
        mode: 'adaptive',
        focusLetter: null,
        freeTier: null,
        startedAt: `2026-03-07T00:${String(index).padStart(2, '0')}:00.000Z`,
        endedAt: `2026-03-07T00:${String(index).padStart(2, '0')}:30.000Z`,
        words: ['e'],
        attempts: 1,
        correctChars: 1,
        accuracy: 100,
        wpm: 40,
        backspaces: 0,
        weakLetters: ['e', 'n', 'i'],
        targetLetter: 'e',
      })
    }

    expect(state.letterStats.e.recentSessions).toHaveLength(RECENT_LETTER_SESSIONS)
    expect(state.letterStats.e.recentSessions[0]?.endedAt).toBe('2026-03-07T00:02:30.000Z')
    expect(state.letterStats.e.recentSessions[state.letterStats.e.recentSessions.length - 1]?.endedAt).toBe('2026-03-07T00:11:30.000Z')
  })
})
