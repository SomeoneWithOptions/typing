import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  UNLOCK_ACCURACY_TARGET,
  UNLOCK_SAMPLE_TARGET,
  UNLOCK_WPM_TARGET,
} from './constants'
import { createInitialProgressState } from './progression'
import type { GeneratedLesson, SessionKeyAttempt } from './types'

const loadMock = vi.fn()
const resetMock = vi.fn()

vi.mock('./storage', () => ({
  indexedDbStorage: {
    load: loadMock,
    save: vi.fn(),
    reset: resetMock,
  },
}))

async function loadStoreModule() {
  const storeModule = await import('./store')
  storeModule.useTypingStore.setState(storeModule.createInitialTypingStoreState())
  return storeModule
}

beforeEach(() => {
  vi.restoreAllMocks()
  vi.clearAllMocks()
})

describe('typing store', () => {
  it('hydrates saved progress and seeds a fresh lesson', async () => {
    const savedProgress = createInitialProgressState()
    savedProgress.settings.mode = 'focus'
    savedProgress.settings.focusLetter = 'q'
    loadMock.mockResolvedValue(savedProgress)

    const { useTypingStore } = await loadStoreModule()
    await useTypingStore.getState().hydrate()

    const state = useTypingStore.getState()

    expect(loadMock).toHaveBeenCalledTimes(1)
    expect(state.isLoaded).toBe(true)
    expect(state.progress.settings.mode).toBe('focus')
    expect(state.progress.settings.focusLetter).toBe('q')
    expect(state.lesson.mode).toBe('focus')
    expect(state.lesson.focusLetter).toBe('q')
    expect(state.currentIndex).toBe(0)
    expect(state.attempts).toEqual([])
  })

  it('regenerates lessons and status when mode or focus changes', async () => {
    const { useTypingStore } = await loadStoreModule()

    useTypingStore.getState().setMode('focus')
    let state = useTypingStore.getState()
    expect(state.progress.settings.mode).toBe('focus')
    expect(state.statusMessage).toBe('Focus drill: T')
    expect(state.lesson.mode).toBe('focus')
    expect(state.lesson.focusLetter).toBe('t')

    useTypingStore.getState().setFocusLetter('q')
    state = useTypingStore.getState()
    expect(state.progress.settings.focusLetter).toBe('q')
    expect(state.statusMessage).toBe('Focus drill: Q')
    expect(state.lesson.mode).toBe('focus')
    expect(state.lesson.focusLetter).toBe('q')
    expect(state.currentIndex).toBe(0)
    expect(state.attempts).toEqual([])
  })

  it('records correct and incorrect typed keys with the expected cursor movement', async () => {
    const nowSpy = vi.spyOn(Date, 'now')
    nowSpy.mockReturnValue(1000)

    const { useTypingStore } = await loadStoreModule()
    useTypingStore.setState({
      isLoaded: true,
      lessonStartedAt: Date.now(),
      clock: Date.now(),
      lastInputAt: null,
    })

    const correctKey = useTypingStore.getState().lesson.text[0]
    useTypingStore.getState().handleTypedKey(correctKey)

    let state = useTypingStore.getState()
    expect(state.attempts).toHaveLength(1)
    expect(state.attempts[0]).toMatchObject({ expected: correctKey, actual: correctKey, correct: true })
    expect(state.currentIndex).toBe(1)
    expect(state.statusMessage).toBe('Keep a steady pace.')

    nowSpy.mockReturnValue(1400)
    const expectedKey = state.lesson.text[state.currentIndex]
    const wrongKey = expectedKey === 'a' ? 'b' : 'a'
    useTypingStore.getState().handleTypedKey(wrongKey)

    state = useTypingStore.getState()
    expect(state.attempts).toHaveLength(2)
    expect(state.attempts[1]).toMatchObject({ expected: expectedKey, actual: wrongKey, correct: false })
    expect(state.currentIndex).toBe(1)
    expect(state.statusMessage).toBe(`Retry ${expectedKey === ' ' ? 'space' : expectedKey.toUpperCase()}.`)
  })

  it('backspace removes incorrect attempts before rewinding correct ones', async () => {
    const nowSpy = vi.spyOn(Date, 'now')
    nowSpy.mockReturnValue(2000)

    const { useTypingStore } = await loadStoreModule()
    useTypingStore.setState({
      isLoaded: true,
      lessonStartedAt: Date.now(),
      clock: Date.now(),
      lastInputAt: null,
    })

    const firstKey = useTypingStore.getState().lesson.text[0]
    useTypingStore.getState().handleTypedKey(firstKey)

    nowSpy.mockReturnValue(2400)
    const secondExpected = useTypingStore.getState().lesson.text[1]
    const wrongKey = secondExpected === 'a' ? 'b' : 'a'
    useTypingStore.getState().handleTypedKey(wrongKey)

    useTypingStore.getState().handleBackspace()
    let state = useTypingStore.getState()
    expect(state.attempts).toHaveLength(1)
    expect(state.currentIndex).toBe(1)
    expect(state.statusMessage).toBe('Last attempt removed.')

    useTypingStore.getState().handleBackspace()
    state = useTypingStore.getState()
    expect(state.attempts).toEqual([])
    expect(state.currentIndex).toBe(0)
    expect(state.backspaces).toBe(2)
    expect(state.statusMessage).toBe('Last correct key removed.')
  })

  it('completes a lesson and unlocks the next letter when thresholds are met', async () => {
    const { useTypingStore } = await loadStoreModule()
    const progress = createInitialProgressState()

    for (const letter of progress.unlockedLetters) {
      progress.letterStats[letter] = {
        ...progress.letterStats[letter],
        attempts: UNLOCK_SAMPLE_TARGET,
        correctHits: UNLOCK_SAMPLE_TARGET,
        totalCorrectMs: (12000 / UNLOCK_WPM_TARGET) * UNLOCK_SAMPLE_TARGET,
        smoothedMs: 12000 / UNLOCK_WPM_TARGET,
        fastestWpm: UNLOCK_WPM_TARGET,
      }
    }

    const lesson: GeneratedLesson = {
      id: 'unlock-test',
      mode: 'adaptive',
      focusLetter: null,
      words: ['e'],
      text: 'e',
      targetLetters: ['e'],
    }
    const attempts: SessionKeyAttempt[] = [
      {
        expected: 'e',
        actual: 'e',
        correct: true,
        deltaMs: 500,
        index: 0,
        timestamp: 1000,
      },
    ]

    useTypingStore.setState({
      progress,
      lesson,
      lessonStartedAt: 0,
      currentIndex: 0,
      attempts: [],
      backspaces: 2,
      statusMessage: 'Testing',
      isLoaded: true,
    })

    useTypingStore.getState().completeLesson(attempts, 1000)
    const state = useTypingStore.getState()

    expect(state.progress.unlockedLetters).toContain('t')
    expect(state.progress.sessions[0]?.unlockedAfterSession).toContain('t')
    expect(state.statusMessage).toBe('T unlocked.')
    expect(state.currentIndex).toBe(0)
    expect(state.attempts).toEqual([])
  })

  it('keeps corrected mistakes in session accuracy and unlock checks', async () => {
    const { useTypingStore } = await loadStoreModule()
    const progress = createInitialProgressState()

    for (const letter of progress.unlockedLetters) {
      progress.letterStats[letter] = {
        ...progress.letterStats[letter],
        attempts: UNLOCK_SAMPLE_TARGET,
        correctHits: Math.round(UNLOCK_SAMPLE_TARGET * (UNLOCK_ACCURACY_TARGET / 100)),
        totalCorrectMs: (12000 / UNLOCK_WPM_TARGET) * UNLOCK_SAMPLE_TARGET,
        smoothedMs: 12000 / UNLOCK_WPM_TARGET,
        fastestWpm: UNLOCK_WPM_TARGET,
      }
    }

    const lesson: GeneratedLesson = {
      id: 'accuracy-test',
      mode: 'adaptive',
      focusLetter: null,
      words: ['e'],
      text: 'e',
      targetLetters: ['e'],
    }
    const incorrectAttempt: SessionKeyAttempt = {
      expected: 'e',
      actual: 'a',
      correct: false,
      deltaMs: 500,
      index: 0,
      timestamp: 1000,
    }
    const correctedAttempt: SessionKeyAttempt = {
      expected: 'e',
      actual: 'e',
      correct: true,
      deltaMs: 500,
      index: 0,
      timestamp: 1500,
    }

    useTypingStore.setState({
      progress,
      lesson,
      lessonStartedAt: 0,
      currentIndex: 0,
      attempts: [correctedAttempt],
      metricAttempts: [incorrectAttempt, correctedAttempt],
      backspaces: 1,
      statusMessage: 'Testing',
      isLoaded: true,
    })

    useTypingStore.getState().completeLesson([correctedAttempt], 1500, [incorrectAttempt, correctedAttempt])
    const state = useTypingStore.getState()

    expect(state.progress.unlockedLetters).not.toContain('t')
    expect(state.progress.sessions[0]?.accuracy).toBe(50)
    expect(state.progress.letterStats.e.attempts).toBe(UNLOCK_SAMPLE_TARGET + 2)
    expect(state.progress.letterStats.e.correctHits).toBe(Math.round(UNLOCK_SAMPLE_TARGET * (UNLOCK_ACCURACY_TARGET / 100)) + 1)
    expect(state.statusMessage).toBe('Lesson complete. New set ready.')
  })

  it('resets progress back to the starter state after clearing storage', async () => {
    resetMock.mockResolvedValue(undefined)

    const { useTypingStore } = await loadStoreModule()
    useTypingStore.setState({
      progress: {
        ...createInitialProgressState(),
        settings: {
          mode: 'focus',
          focusLetter: 'q',
        },
      },
      statusMessage: 'Custom',
      isLoaded: true,
      currentIndex: 3,
      backspaces: 4,
    })

    await useTypingStore.getState().resetProgress()
    const state = useTypingStore.getState()

    expect(resetMock).toHaveBeenCalledTimes(1)
    expect(state.progress.settings.mode).toBe('adaptive')
    expect(state.progress.settings.focusLetter).toBe('t')
    expect(state.currentIndex).toBe(0)
    expect(state.backspaces).toBe(0)
    expect(state.statusMessage).toBe('Progress reset. Starter lesson ready.')
  })
})
