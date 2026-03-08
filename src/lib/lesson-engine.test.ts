import { describe, expect, it } from 'vitest'
import { loadFreeWordsForTier } from './free-corpus'
import { generateLesson } from './lesson-engine'
import { createInitialProgressState } from './progression'
import type { Letter } from './types'

describe('generateLesson', () => {
  it('uses only the initial unlocked letters in adaptive mode', () => {
    const state = createInitialProgressState()
    const lesson = generateLesson(state, 'adaptive', null, null)
    const allowed = new Set(state.unlockedLetters)
    const latestUnlocked = state.unlockedLetters[state.unlockedLetters.length - 1]

    expect(lesson.words).toHaveLength(25)
    expect(lesson.words.every((word) => [...word].every((letter) => allowed.has(letter as Letter)))).toBe(true)
    expect(lesson.words.every((word) => word.includes(latestUnlocked))).toBe(true)
    expect(lesson.targetLetters[0]).toBe(latestUnlocked)
    expect(lesson.words.filter((word) => word.length === 3).length).toBeLessThanOrEqual(3)
  })

  it('centers adaptive lessons on the latest unlocked letter when newer letters are available', () => {
    const state = createInitialProgressState()
    state.unlockedLetters = [...state.unlockedLetters, 't', 'o']

    const lesson = generateLesson(state, 'adaptive', null, null)
    const allowed = new Set(state.unlockedLetters)

    expect(lesson.words).toHaveLength(25)
    expect(lesson.words.every((word) => [...word].every((letter) => allowed.has(letter as Letter)))).toBe(true)
    expect(lesson.words.every((word) => word.includes('o'))).toBe(true)
    expect(lesson.targetLetters[0]).toBe('o')
  })

  it('keeps the requested focus letter in every focus lesson word', () => {
    const state = createInitialProgressState()
    const lesson = generateLesson(state, 'focus', 'q', null)

    expect(lesson.words).toHaveLength(25)
    expect(lesson.words.every((word) => word.includes('q'))).toBe(true)
  })

  it('builds free lessons from the selected Monkeytype tier with all letters available', async () => {
    const state = createInitialProgressState()
    const freeTierWords = new Set(await loadFreeWordsForTier(200))
    const lesson = generateLesson(state, 'free', null, 200)
    const unlocked = new Set(state.unlockedLetters)

    expect(lesson.words).toHaveLength(25)
    expect(lesson.freeTier).toBe(200)
    expect(lesson.targetLetters).toEqual([])
    expect(lesson.words.every((word) => freeTierWords.has(word))).toBe(true)
    expect(lesson.words.some((word) => [...word].some((letter) => !unlocked.has(letter as Letter)))).toBe(true)
  })
})
