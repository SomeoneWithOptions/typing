import { LESSON_WORD_COUNT, LEFT_HAND_LETTERS } from './constants'
import { getWeakLetters } from './progression'
import { WORD_CORPUS } from './word-corpus'
import type { GeneratedLesson, Letter, PracticeMode, ProgressState, WordCandidate } from './types'

function shuffleWords(words: string[]) {
  const shuffled = [...words]

  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1))
    const current = shuffled[index]
    shuffled[index] = shuffled[swapIndex]
    shuffled[swapIndex] = current
  }

  return shuffled
}

function hasOnlyLetters(word: string, allowed: Set<Letter>) {
  return [...word].every((character) => allowed.has(character as Letter))
}

function countOccurrences(word: string, letter: Letter) {
  return [...word].filter((character) => character === letter).length
}

function getAlternationScore(word: string) {
  let changes = 0

  for (let index = 1; index < word.length; index += 1) {
    const previous = LEFT_HAND_LETTERS.has(word[index - 1] as Letter)
    const current = LEFT_HAND_LETTERS.has(word[index] as Letter)
    if (previous !== current) {
      changes += 1
    }
  }

  return changes / Math.max(1, word.length - 1)
}

function getRepeatPenalty(word: string) {
  let penalty = 0

  for (let index = 1; index < word.length; index += 1) {
    if (word[index] === word[index - 1]) {
      penalty += 0.35
    }
  }

  return penalty
}

function getAdaptiveTargetLetter(state: ProgressState) {
  return state.unlockedLetters[state.unlockedLetters.length - 1] ?? null
}

function scoreAdaptiveWord(candidate: WordCandidate, trainingLetter: Letter, weakLetters: Letter[]) {
  const frequencyScore = Math.max(0, 1200 - candidate.rank) / 1200
  const trainingLetterScore = countOccurrences(candidate.word, trainingLetter) * 4.4
  const weakLetterScore = weakLetters.reduce((score, letter, index) => {
    const weight = 0.9 - index * 0.25
    return score + countOccurrences(candidate.word, letter) * weight
  }, 0)
  const lengthScore =
    candidate.word.length >= 4
      ? Math.min(candidate.word.length, 8) * 0.2
      : 0.45
  const alternationScore = getAlternationScore(candidate.word)
  const uniqueLetters = new Set(candidate.word).size / candidate.word.length

  return frequencyScore + trainingLetterScore + weakLetterScore + lengthScore + alternationScore + uniqueLetters - getRepeatPenalty(candidate.word)
}

function scoreFocusWord(candidate: WordCandidate, focusLetter: Letter) {
  const frequencyScore = Math.max(0, 1200 - candidate.rank) / 1200
  const targetDensity = countOccurrences(candidate.word, focusLetter) * 2.8
  const lengthScore = candidate.word.length >= 4 && candidate.word.length <= 7 ? 1.2 : 0.6

  return frequencyScore + targetDensity + lengthScore + getAlternationScore(candidate.word) - getRepeatPenalty(candidate.word)
}

function pickLessonWords(candidates: WordCandidate[]) {
  if (candidates.length === 0) {
    return ['learn', 'line', 'near', 'real', 'rain'].flatMap((word) => Array.from({ length: 5 }, () => word)).slice(0, LESSON_WORD_COUNT)
  }

  const ranked = candidates.slice(0, Math.min(60, candidates.length)).map((candidate) => candidate.word)
  const pool = shuffleWords(ranked)
  const words: string[] = []
  let pointer = 0

  while (words.length < LESSON_WORD_COUNT) {
    const nextWord = pool[pointer % pool.length]
    const previous = words[words.length - 1]

    if (nextWord !== previous || pool.length === 1) {
      words.push(nextWord)
    }

    pointer += 1

    if (pointer % pool.length === 0) {
      pool.splice(0, pool.length, ...shuffleWords(ranked))
    }
  }

  return words
}

export function generateLesson(state: ProgressState, mode: PracticeMode, focusLetter: Letter | null): GeneratedLesson {
  const weakLetters = getWeakLetters(state, 3)
  const unlockedSet = new Set(state.unlockedLetters)
  const trainingLetter = getAdaptiveTargetLetter(state)
  const adaptiveSupportLetters = weakLetters.filter((letter) => letter !== trainingLetter)
  const adaptiveCandidates = WORD_CORPUS.filter((candidate) => {
    if (!hasOnlyLetters(candidate.word, unlockedSet)) {
      return false
    }

    return trainingLetter ? candidate.word.includes(trainingLetter) : true
  })
  const adaptivePool = adaptiveCandidates.length > 0
    ? adaptiveCandidates
    : WORD_CORPUS.filter((candidate) => hasOnlyLetters(candidate.word, unlockedSet))
  const scoredCandidates =
    mode === 'focus' && focusLetter
      ? WORD_CORPUS.filter((candidate) => candidate.word.includes(focusLetter))
          .map((candidate) => ({
            ...candidate,
            score: scoreFocusWord(candidate, focusLetter),
          }))
          .sort((left, right) => right.score - left.score)
      : adaptivePool
          .map((candidate) => ({
            ...candidate,
            score: scoreAdaptiveWord(candidate, trainingLetter ?? weakLetters[0], adaptiveSupportLetters),
          }))
          .sort((left, right) => right.score - left.score)

  const words = pickLessonWords(scoredCandidates)
  const targetLetters =
    mode === 'focus' && focusLetter
      ? [focusLetter, ...weakLetters.filter((letter) => letter !== focusLetter)]
      : trainingLetter
        ? [trainingLetter, ...adaptiveSupportLetters]
        : weakLetters

  return {
    id: `${mode}-${focusLetter ?? 'adaptive'}-${Date.now()}`,
    mode,
    focusLetter,
    words,
    text: words.join(' '),
    targetLetters,
  }
}
