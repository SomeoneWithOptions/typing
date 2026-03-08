import { describe, expect, it } from 'vitest'
import { loadFreeWordsForTier } from './free-corpus'
import { FALLBACK_WORD_CORPUS, PRIMARY_WORD_CORPUS, WORD_CORPUS } from './word-corpus'

describe('word corpus', () => {
  it('keeps likely proper names out of the primary pool', () => {
    const primaryWords = new Set(PRIMARY_WORD_CORPUS.map((candidate) => candidate.word))

    expect(primaryWords.has('alan')).toBe(false)
    expect(primaryWords.has('david')).toBe(false)
    expect(primaryWords.has('michael')).toBe(false)
    expect(primaryWords.has('eileen')).toBe(false)
    expect(primaryWords.has('ella')).toBe(false)
    expect(primaryWords.has('elena')).toBe(false)
    expect(primaryWords.has('lillian')).toBe(false)
    expect(primaryWords.has('lara')).toBe(false)
  })

  it('preserves a larger fallback pool for constrained lessons', () => {
    expect(FALLBACK_WORD_CORPUS.length).toBeGreaterThan(5000)
    expect(WORD_CORPUS.length).toBeGreaterThan(PRIMARY_WORD_CORPUS.length)
  })

  it('normalizes the vendored Monkeytype free corpora into lowercase ascii words', async () => {
    const corpus200 = await loadFreeWordsForTier(200)
    const corpus1k = await loadFreeWordsForTier(1000)
    const corpus5k = await loadFreeWordsForTier(5000)
    const corpus10k = await loadFreeWordsForTier(10000)
    const corpus25k = await loadFreeWordsForTier(25000)
    const corpus450k = await loadFreeWordsForTier(450000)

    expect(corpus200).toHaveLength(200)
    expect(corpus1k).toHaveLength(1000)
    expect(corpus5k.length).toBeGreaterThan(4500)
    expect(corpus10k.length).toBeGreaterThan(9500)
    expect(corpus25k.length).toBeGreaterThan(20000)
    expect(corpus450k.length).toBeGreaterThan(450000)
    expect(corpus450k.every((word) => /^[a-z]+$/.test(word))).toBe(true)
  })
})
