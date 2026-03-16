import { MAX_KEYSTROKE_SESSIONS } from './constants'
import { isLetter } from './progression'
import type { Letter, SessionRecord } from './types'

export interface KeyConfusion {
  actual: string
  count: number
}

export interface KeyErrorStats {
  letter: Letter
  totalAttempts: number
  errors: number
  errorRate: number
  confusions: KeyConfusion[]
}

export type HeatmapData = Record<Letter, KeyErrorStats>

const MIN_SESSIONS_FOR_HEATMAP = 3

export function computeHeatmapData(sessions: SessionRecord[]): {
  data: HeatmapData | null
  sessionCount: number
  maxErrorRate: number
} {
  const eligible = sessions
    .slice(0, MAX_KEYSTROKE_SESSIONS)
    .filter((s) => s.keystrokes && s.keystrokes.length > 0)

  if (eligible.length < MIN_SESSIONS_FOR_HEATMAP) {
    return { data: null, sessionCount: eligible.length, maxErrorRate: 0 }
  }

  const letterMap = new Map<
    Letter,
    { totalAttempts: number; errors: number; confusionMap: Map<string, number> }
  >()

  for (const session of eligible) {
    if (!session.keystrokes) continue

    for (const attempt of session.keystrokes) {
      if (!isLetter(attempt.expected)) continue

      const letter = attempt.expected
      let entry = letterMap.get(letter)

      if (!entry) {
        entry = { totalAttempts: 0, errors: 0, confusionMap: new Map() }
        letterMap.set(letter, entry)
      }

      entry.totalAttempts += 1

      if (!attempt.correct) {
        entry.errors += 1
        const prev = entry.confusionMap.get(attempt.actual) ?? 0
        entry.confusionMap.set(attempt.actual, prev + 1)
      }
    }
  }

  let maxErrorRate = 0
  const data = {} as HeatmapData

  for (const [letter, entry] of letterMap) {
    const errorRate = entry.totalAttempts > 0 ? (entry.errors / entry.totalAttempts) * 100 : 0

    const confusions: KeyConfusion[] = Array.from(entry.confusionMap.entries())
      .map(([actual, count]) => ({ actual, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5)

    if (errorRate > maxErrorRate) {
      maxErrorRate = errorRate
    }

    data[letter] = {
      letter,
      totalAttempts: entry.totalAttempts,
      errors: entry.errors,
      errorRate,
      confusions,
    }
  }

  return { data, sessionCount: eligible.length, maxErrorRate }
}
