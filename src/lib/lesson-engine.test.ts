import { describe, expect, it } from 'vitest'
import { generateLesson } from './lesson-engine'
import { createInitialProgressState } from './progression'
import type { Letter } from './types'

describe('generateLesson', () => {
  it('uses only the initial unlocked letters in adaptive mode', () => {
    const state = createInitialProgressState()
    const lesson = generateLesson(state, 'adaptive', null)
    const allowed = new Set(state.unlockedLetters)
    const latestUnlocked = state.unlockedLetters[state.unlockedLetters.length - 1]

    expect(lesson.words).toHaveLength(25)
    expect(lesson.words.every((word) => [...word].every((letter) => allowed.has(letter as Letter)))).toBe(true)
    expect(lesson.words.every((word) => word.includes(latestUnlocked))).toBe(true)
    expect(lesson.targetLetters[0]).toBe(latestUnlocked)
  })

  it('centers adaptive lessons on the latest unlocked letter when newer letters are available', () => {
    const state = createInitialProgressState()
    state.unlockedLetters = [...state.unlockedLetters, 't', 'o']

    const lesson = generateLesson(state, 'adaptive', null)
    const allowed = new Set(state.unlockedLetters)

    expect(lesson.words).toHaveLength(25)
    expect(lesson.words.every((word) => [...word].every((letter) => allowed.has(letter as Letter)))).toBe(true)
    expect(lesson.words.every((word) => word.includes('o'))).toBe(true)
    expect(lesson.targetLetters[0]).toBe('o')
  })

  it('keeps the requested focus letter in every focus lesson word', () => {
    const state = createInitialProgressState()
    const lesson = generateLesson(state, 'focus', 'q')

    expect(lesson.words).toHaveLength(25)
    expect(lesson.words.every((word) => word.includes('q'))).toBe(true)
  })
})
