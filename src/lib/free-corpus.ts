import type { FreeCorpusTier } from './types'

const FREE_WORD_MATCHER = /^[a-z]+$/

const FREE_CORPUS_PATHS: Record<FreeCorpusTier, string> = {
  200: '/free-corpus/english.json',
  1000: '/free-corpus/english_1k.json',
  5000: '/free-corpus/english_5k.json',
  10000: '/free-corpus/english_10k.json',
  25000: '/free-corpus/english_25k.json',
  450000: '/free-corpus/english_450k.json',
}

const freeCorpusCache = new Map<FreeCorpusTier, string[]>()

function normalizeFreeWords(words: string[]) {
  const normalized: string[] = []
  const seen = new Set<string>()

  for (const rawWord of words) {
    const word = rawWord.trim().toLowerCase()

    if (!FREE_WORD_MATCHER.test(word) || seen.has(word)) {
      continue
    }

    seen.add(word)
    normalized.push(word)
  }

  return normalized
}

async function readFreeCorpusFile(path: string) {
  const requestTarget =
    typeof window === 'undefined'
      ? new URL(`../../public${path}`, import.meta.url)
      : path
  const response = await fetch(requestTarget)

  if (!response.ok) {
    throw new Error(`Failed to load local free corpus: ${path}`)
  }

  return response.text()
}

export function getFreeWordsForTier(tier: FreeCorpusTier) {
  return freeCorpusCache.get(tier) ?? []
}

export function hasFreeWordsForTier(tier: FreeCorpusTier) {
  return freeCorpusCache.has(tier)
}

export async function loadFreeWordsForTier(tier: FreeCorpusTier) {
  const cached = freeCorpusCache.get(tier)
  if (cached) {
    return cached
  }

  const rawJson = await readFreeCorpusFile(FREE_CORPUS_PATHS[tier])
  const payload = JSON.parse(rawJson) as {
    words?: string[]
  }
  const normalized = normalizeFreeWords(payload.words ?? [])

  freeCorpusCache.set(tier, normalized)
  return normalized
}
