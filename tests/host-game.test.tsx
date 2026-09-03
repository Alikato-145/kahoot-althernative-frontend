import { describe, expect, it } from 'vitest'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { HostReveal } from '@/components/game/HostReveal'
import { applyHostQuestionEvent, applyHostRankUpdate, hostTiming, leaderboardPlayers, HostScoreboard } from '@/components/game/HostGame'

const longThaiExplanation = 'เพราะโลกโคจรรอบดวงอาทิตย์และหมุนรอบตัวเองอย่างต่อเนื่อง จึงเกิดกลางวันและกลางคืน'

describe('HostReveal', () => {
  it('shows a reveal image and long explanation after question reveal', () => {
    const markup = renderToStaticMarkup(
      <HostReveal
        question={{
          id: 'question-1', position: 0, body: 'โลกหมุนรอบอะไร?', questionImageUrl: null,
          revealImageUrl: '/media/quizzes/q1/answer.webp', explanation: longThaiExplanation,
          choices: [
            { id: 'c1', position: 0, body: 'ดวงอาทิตย์', isCorrect: true },
            { id: 'c2', position: 1, body: 'ดวงจันทร์', isCorrect: false },
            { id: 'c3', position: 2, body: 'ดาวอังคาร', isCorrect: false },
            { id: 'c4', position: 3, body: 'ดาวพฤหัสบดี', isCorrect: false },
          ],
        }}
        reveal={{ correctChoiceId: 'c1', choiceCounts: { c1: 4, c2: 1, c3: 0, c4: 0 }, revealImageUrl: '/media/quizzes/q1/answer.webp', explanation: longThaiExplanation }}
      />,
    )

    expect(markup).toContain('alt="ภาพเฉลย"')
    expect(markup).toContain(longThaiExplanation)
  })
})

describe('live Host question state', () => {
  it('falls back to a visible countdown when a legacy socket event lacks timing fields', () => {
    expect(hostTiming({}, 5_000, 1_000)).toEqual({ openedAt: 1_000, deadlineAt: 6_000 })
  })
  it('retains the server answer deadline received after the lobby snapshot', () => {
    const view = applyHostQuestionEvent({ questionId: 'question-1', openedAt: null, deadlineAt: null, answerCount: 0 }, { type: 'question:open', questionId: 'question-1', openedAt: 1_724_999_980_000, deadlineAt: 1_725_000_000_000 })

    expect(view).toEqual({ questionId: 'question-1', openedAt: 1_724_999_980_000, deadlineAt: 1_725_000_000_000, answerCount: 0 })
  })

  it('updates only the aggregate answer count for the active question', () => {
    const view = applyHostQuestionEvent({ questionId: 'question-1', openedAt: 1_724_999_980_000, deadlineAt: 1_725_000_000_000, answerCount: 0 }, { type: 'question:answer-progress', questionId: 'question-1', answerCount: 3 })

    expect(view.answerCount).toBe(3)
    expect(view).not.toHaveProperty('choiceId')
  })
})

describe('projected Host rankings', () => {
  it('extracts players from the leaderboard socket payload before rendering', () => {
    const players = leaderboardPlayers({ players: [{ id: 'one', nickname: 'หนึ่ง', score: 300, rank: 1 }] })
    expect(players).toHaveLength(1)
    expect(players[0].nickname).toBe('หนึ่ง')
  })

  it('updates the projected ordering from a score:rank-update and renders the animated leaderboard', () => {
    const players = applyHostRankUpdate([
      { id: 'one', nickname: 'หนึ่ง', score: 300, rank: 1 },
      { id: 'two', nickname: 'สอง', score: 200, rank: 2 },
    ], { playerId: 'two', totalScore: 900, rank: 1 })

    expect(players.map((player) => player.id)).toEqual(['two', 'one'])
    const markup = renderToStaticMarkup(<HostScoreboard players={players} final={false} />)
    expect(markup).toContain('ตารางคะแนนรอบนี้')
    expect(markup).toContain('#1 สอง')
    expect(markup).toContain('aria-label="ตารางคะแนน"')
  })

  it('renders final standings from game:final-results instead of the reveal screen', () => {
    const markup = renderToStaticMarkup(<HostScoreboard players={[{ id: 'one', nickname: 'หนึ่ง', score: 1200, rank: 1 }]} final />)
    expect(markup).toContain('อันดับสุดท้าย')
  })
})
