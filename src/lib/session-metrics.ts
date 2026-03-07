export function getAccuracy(correctChars: number, totalAttempts: number) {
  if (totalAttempts === 0) {
    return 100
  }

  return (correctChars / totalAttempts) * 100
}

export function getWpm(correctChars: number, elapsedMs: number) {
  if (correctChars === 0 || elapsedMs <= 0) {
    return 0
  }

  return (correctChars / 5) * (60000 / elapsedMs)
}
