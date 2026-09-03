export function scoreAnswer(correct: boolean, elapsedMs: number, deadlineMs: number): number {
  if (!correct || deadlineMs <= 0) return 0
  return Math.max(0, 1000 - Math.round(1000 * Math.min(elapsedMs / deadlineMs, 1)))
}

export function rankDelta(playerId: string, previousIds: string[], currentIds: string[]): {
  previousRank: number | null
  rank: number | null
} {
  const previousPosition = previousIds.indexOf(playerId)
  const position = currentIds.indexOf(playerId)
  return {
    previousRank: previousPosition === -1 ? null : previousPosition + 1,
    rank: position === -1 ? null : position + 1,
  }
}
