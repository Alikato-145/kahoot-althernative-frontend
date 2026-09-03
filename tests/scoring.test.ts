import { describe, expect, it } from 'vitest'
import { rankDelta, scoreAnswer } from '@/server/game/scoring'

describe('live-game scoring', () => {
  it('awards 1000 then 0 points at the two deadline edges', () => {
    expect(scoreAnswer(true, 0, 20_000)).toBe(1000)
    expect(scoreAnswer(true, 20_000, 20_000)).toBe(0)
    expect(scoreAnswer(false, 1, 20_000)).toBe(0)
  })

  it('reports a player moving from rank 3 to rank 1', () => {
    expect(rankDelta('p1', ['p2', 'p3', 'p1'], ['p1', 'p2', 'p3']))
      .toEqual({ previousRank: 3, rank: 1 })
  })
})
