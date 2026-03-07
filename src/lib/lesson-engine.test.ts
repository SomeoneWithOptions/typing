import { describe, expect, it } from 'vitest'
import { generateLesson } from './lesson-engine'
import { createInitialProgressState } from './progression'
import type { Letter } from './types'

describe('generateLesson', () => {
  it('uses only the initial unlocked letters in adaptive mode', () => {
    const state = createInitialProgressState()
    const lesson = generateLesson(state, 'adaptive', null)
    const allowed = new Set(state.unlockedLetters)

    expect(lesson.words).toHaveLength(25)
    expect(lesson.words.every((word) => [...word].every((letter) => allowed.has(letter as Letter)))).toBe(true)
  })

  it('keeps the requested focus letter in every focus lesson word', () => {
    const state = createInitialProgressState()
    const lesson = generateLesson(state, 'focus', 'q')

    expect(lesson.words).toHaveLength(25)
    expect(lesson.words.every((word) => word.includes('q'))).toBe(true)
  })
})
