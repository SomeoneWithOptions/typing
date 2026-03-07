import { describe, expect, it } from 'vitest'
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
})
