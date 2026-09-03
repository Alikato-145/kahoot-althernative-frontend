import { describe, expect, it } from 'vitest'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { PlayerScoreRank } from '@/components/game/PlayerScoreRank'
import { RankMotion, rankMotionTransform } from '@/components/game/RankMotion'

describe('PlayerScoreRank', () => {
  it('announces an upward move when rank changes from 5 to 2', () => {
    const markup = renderToStaticMarkup(<PlayerScoreRank earnedScore={650} totalScore={2200} previousRank={5} rank={2} />)

    expect(markup).toContain('ขึ้น 3 อันดับ')
    expect(markup).toContain('650')
    expect(markup).toContain('2,200')
  })

  it('describes a downward move and a rank that did not change', () => {
    expect(renderToStaticMarkup(<PlayerScoreRank earnedScore={0} totalScore={900} previousRank={2} rank={4} />)).toContain('ลง 2 อันดับ')
    expect(renderToStaticMarkup(<PlayerScoreRank earnedScore={0} totalScore={900} previousRank={3} rank={3} />)).toContain('อันดับคงเดิม')
  })
})

describe('rankMotionTransform', () => {
  it('moves a newly rendered row from its previous vertical position', () => {
    expect(rankMotionTransform(520, 120)).toBe('translateY(400px)')
  })
})

describe('RankMotion', () => {
  it('keeps a long leaderboard vertically scrollable', () => {
    const markup = renderToStaticMarkup(<RankMotion players={[{ id: 'one', nickname: 'หนึ่ง', score: 100, rank: 1 }]} />)
    expect(markup).toContain('overflow-y-auto')
  })
})
