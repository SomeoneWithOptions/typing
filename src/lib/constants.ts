import type { Letter, UnlockSequence } from './types'

export const APP_VERSION = 1
export const LESSON_WORD_COUNT = 25
export const MAX_SESSION_HISTORY = 120
export const UNLOCK_SAMPLE_TARGET = 40
export const UNLOCK_WPM_TARGET = 24
export const UNLOCK_ACCURACY_TARGET = 95
export const MASTERY_WPM_TARGET = 40
export const MASTERY_ACCURACY_TARGET = 97

export const UNLOCK_SEQUENCE: UnlockSequence = {
  initial: ['e', 'n', 'i', 'a', 'r', 'l'],
  order: ['t', 'o', 's', 'd', 'h', 'u', 'c', 'm', 'f', 'y', 'w', 'g', 'p', 'b', 'v', 'k', 'x', 'j', 'q', 'z'],
}

export const KEYBOARD_ROWS: Letter[][] = [
  ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'],
  ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l'],
  ['z', 'x', 'c', 'v', 'b', 'n', 'm'],
]

export const LEFT_HAND_LETTERS = new Set<Letter>(['q', 'w', 'e', 'r', 't', 'a', 's', 'd', 'f', 'g', 'z', 'x', 'c', 'v', 'b'])

export const ALL_LETTER_SET = new Set<Letter>([...UNLOCK_SEQUENCE.initial, ...UNLOCK_SEQUENCE.order])

export const DEFAULT_FOCUS_LETTER: Letter = 't'
