import { describe, expect, it } from 'vitest'
import { UNLOCK_ACCURACY_TARGET, UNLOCK_SAMPLE_TARGET } from './constants'
import { canUnlockNextLetter, createInitialProgressState, getLetterWpm, updateProgressFromSession } from './progression'
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
})
