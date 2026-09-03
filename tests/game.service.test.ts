import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import type { Quiz } from '@/server/repositories/quizzes'
import { closeRedis, getRedis } from '@/server/redis'
import { createSession, joinSession } from '@/server/game/store'
import { GameService } from '@/server/game/service'

const quiz: Quiz = {
  id: 'quiz-service', title: 'ค่าย', description: '', coverImageUrl: null,
  questions: [{
    id: 'q1', position: 0, body: 'แมว?', questionImageUrl: '/media/quizzes/q1/cat.webp', revealImageUrl: '/media/quizzes/q1/reveal.webp', explanation: 'เพราะเป็นแมว',
    choices: [
      { id: 'a', position: 0, body: 'แมว', isCorrect: true },
      { id: 'b', position: 1, body: 'หมา', isCorrect: false },
      { id: 'c', position: 2, body: 'นก', isCorrect: false },
      { id: 'd', position: 3, body: 'ปลา', isCorrect: false },
    ],
  }],
}

describe('GameService', () => {
  beforeEach(async () => { await getRedis().flushdb() })
  afterAll(async () => { await closeRedis() })

  it('moves lobby to question-intro and includes the current image URL', async () => {
    const session = await createSession(quiz, '111111')
    const service = new GameService({ introDurationMs: 60_000 })

    await expect(service.startGame(session.id)).resolves.toMatchObject({
      type: 'question:intro', questionImageUrl: '/media/quizzes/q1/cat.webp',
    })
  })

  it('allows only one concurrent lobby-to-intro transition and persists the intro deadline', async () => {
    const session = await createSession(quiz, '121212')
    const service = new GameService({ introDurationMs: 60_000 })
    const results = await Promise.allSettled([service.startGame(session.id), service.startGame(session.id)])

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1)
    expect((await service.getSnapshot(session.id))?.state).toMatchObject({ phase: 'question-intro', deadlineAt: expect.any(Number) })
  })

  it('moves through opening, reveal, ranking, and final results', async () => {
    const session = await createSession(quiz, '222222')
    const first = await joinSession(session.pin, 'หนึ่ง', 'first')
    const second = await joinSession(session.pin, 'สอง', 'second')
    const service = new GameService({ introDurationMs: 60_000, answerDurationMs: 60_000 })

    await service.startGame(session.id)
    const opened = await service.openQuestion(session.id)
    expect(opened).toMatchObject({ type: 'question:open', deadlineAt: expect.any(Number) })
    await service.submitPlayerAnswer(session.id, first.id, 'q1', 'a')
    await service.submitPlayerAnswer(session.id, second.id, 'q1', 'b')

    const closed = await service.revealQuestion(session.id)
    expect(closed.events.map((event) => event.type)).toEqual(['question:reveal', 'score:rank-update', 'score:rank-update', 'leaderboard:update'])
    expect(closed.events[1]).toMatchObject({ playerId: 'first', totalScore: expect.any(Number), previousRank: 1, rank: 1 })
    expect((await service.getSnapshot(session.id))?.state.phase).toBe('score-rank')
    const reconnectedService = new GameService()
    expect((await reconnectedService.getSnapshot(session.id))?.players).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: first.id, rank: 1 }),
      expect.objectContaining({ id: second.id, rank: 2 }),
    ]))
    await expect(service.nextQuestion(session.id)).resolves.toMatchObject({ type: 'game:final-results' })
  })
})
