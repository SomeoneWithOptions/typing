import { LESSON_WORD_COUNT, LEFT_HAND_LETTERS } from './constants'
import { getFreeWordsForTier } from './free-corpus'
import { getWeakLetters } from './progression'
import { FALLBACK_WORD_CORPUS, PRIMARY_WORD_CORPUS } from './word-corpus'
import type { FreeCorpusTier, GeneratedLesson, Letter, PracticeMode, ProgressState, WordCandidate } from './types'

const MIN_PREFERRED_WORD_LENGTH = 4
const MAX_SHORT_WORDS_PER_LESSON = 3
const MIN_PRIMARY_VARIETY = 12

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
    candidate.word.length >= MIN_PREFERRED_WORD_LENGTH
      ? 0.8 + Math.min(candidate.word.length - MIN_PREFERRED_WORD_LENGTH, 4) * 0.28
      : -0.35
  const alternationScore = getAlternationScore(candidate.word)
  const uniqueLetters = new Set(candidate.word).size / candidate.word.length

  return frequencyScore + trainingLetterScore + weakLetterScore + lengthScore + alternationScore + uniqueLetters - getRepeatPenalty(candidate.word)
}

function scoreFocusWord(candidate: WordCandidate, focusLetter: Letter) {
  const frequencyScore = Math.max(0, 1200 - candidate.rank) / 1200
  const targetDensity = countOccurrences(candidate.word, focusLetter) * 2.8
  const lengthScore =
    candidate.word.length >= MIN_PREFERRED_WORD_LENGTH
      ? 0.9 + Math.min(candidate.word.length - MIN_PREFERRED_WORD_LENGTH, 4) * 0.24
      : -0.25

  return frequencyScore + targetDensity + lengthScore + getAlternationScore(candidate.word) - getRepeatPenalty(candidate.word)
}

function scoreFreeWord(word: string, rank: number) {
  const frequencyScore = Math.max(0, 450000 - rank) / 450000
  const lengthScore =
    word.length >= MIN_PREFERRED_WORD_LENGTH
      ? 1 + Math.min(word.length - MIN_PREFERRED_WORD_LENGTH, 4) * 0.18
      : -0.2
  const uniqueLetters = new Set(word).size / word.length

  return frequencyScore + lengthScore + getAlternationScore(word) + uniqueLetters - getRepeatPenalty(word)
}

function fillLessonSlots(pool: string[], count: number) {
  if (pool.length === 0 || count <= 0) {
    return []
  }

  const shuffled = shuffleWords(pool)
  const words: string[] = []
  let pointer = 0

  while (words.length < count) {
    const nextWord = shuffled[pointer % shuffled.length]
    const previous = words[words.length - 1]

    if (nextWord !== previous || shuffled.length === 1) {
      words.push(nextWord)
    }

    pointer += 1

    if (pointer % shuffled.length === 0) {
      shuffled.splice(0, shuffled.length, ...shuffleWords(pool))
    }
  }

  return words
}

function matchesFocusCandidate(candidate: WordCandidate, focusLetter: Letter) {
  return candidate.word.includes(focusLetter)
}

function matchesAdaptiveCandidate(candidate: WordCandidate, unlockedSet: Set<Letter>, trainingLetter: Letter | null) {
  if (!hasOnlyLetters(candidate.word, unlockedSet)) {
    return false
  }

  return trainingLetter ? candidate.word.includes(trainingLetter) : true
}

function getCandidatePool(
  mode: PracticeMode,
  focusLetter: Letter | null,
  unlockedSet: Set<Letter>,
  trainingLetter: Letter | null,
) {
  const matchesCandidate = (candidate: WordCandidate) =>
    mode === 'focus' && focusLetter
      ? matchesFocusCandidate(candidate, focusLetter)
      : matchesAdaptiveCandidate(candidate, unlockedSet, trainingLetter)

  const primaryCandidates = PRIMARY_WORD_CORPUS.filter(matchesCandidate)

  if (primaryCandidates.length >= MIN_PRIMARY_VARIETY) {
    return primaryCandidates
  }

  const fallbackCandidates = FALLBACK_WORD_CORPUS.filter(matchesCandidate)
  return [...primaryCandidates, ...fallbackCandidates]
}

function pickLessonWords(rankedWords: string[]) {
  if (rankedWords.length === 0) {
    return ['learn', 'line', 'near', 'real', 'rain'].flatMap((word) => Array.from({ length: 5 }, () => word)).slice(0, LESSON_WORD_COUNT)
  }

  const poolSize = Math.min(rankedWords.length, Math.max(320, LESSON_WORD_COUNT * 10))
  const ranked = rankedWords.slice(0, poolSize)
  const longWords = [...new Set(ranked.filter((word) => word.length >= MIN_PREFERRED_WORD_LENGTH))]
  const shortWords = [...new Set(ranked.filter((word) => word.length < MIN_PREFERRED_WORD_LENGTH))]
  const shortWordCount = Math.min(MAX_SHORT_WORDS_PER_LESSON, shortWords.length)
  const longWordCount = Math.max(0, LESSON_WORD_COUNT - shortWordCount)

  return [...fillLessonSlots(longWords, longWordCount), ...fillLessonSlots(shortWords, shortWordCount)]
}

export function generateFreeLesson(freeTier: FreeCorpusTier): GeneratedLesson {
  const rankedWords = getFreeWordsForTier(freeTier)
    .map((word, index) => ({
      word,
      score: scoreFreeWord(word, index + 1),
    }))
    .sort((left, right) => right.score - left.score)
    .map((candidate) => candidate.word)
  const words = pickLessonWords(rankedWords)

  return {
    id: `free-${freeTier}-${Date.now()}`,
    mode: 'free',
    focusLetter: null,
    freeTier,
    words,
    text: words.join(' '),
    targetLetters: [],
  }
}

export function generateLesson(
  state: ProgressState,
  mode: PracticeMode,
  focusLetter: Letter | null,
  freeTier: FreeCorpusTier | null,
): GeneratedLesson {
  if (mode === 'free' && freeTier) {
    return generateFreeLesson(freeTier)
  }

  const weakLetters = getWeakLetters(state, 3)
  const unlockedSet = new Set(state.unlockedLetters)
  const trainingLetter = getAdaptiveTargetLetter(state)
  const adaptiveSupportLetters = weakLetters.filter((letter) => letter !== trainingLetter)
  const adaptivePool = getCandidatePool(mode, focusLetter, unlockedSet, trainingLetter)
  const scoredCandidates =
    mode === 'focus' && focusLetter
      ? adaptivePool
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

  const words = pickLessonWords(scoredCandidates.map((candidate) => candidate.word))
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
    freeTier: null,
    words,
    text: words.join(' '),
    targetLetters,
  }
}
