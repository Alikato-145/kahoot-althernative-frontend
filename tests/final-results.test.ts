import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Quiz } from '@/server/repositories/quizzes'
import { closeRedis, getRedis } from '@/server/redis'
import { createSession, joinSession } from '@/server/game/store'
import { GameService, type FinalResultsRepository } from '@/server/game/service'

const quiz: Quiz = {
  id: 'quiz-final-results', title: 'ค่าย', description: '', coverImageUrl: null,
  questions: [{ id: 'q1', position: 0, body: 'แมว?', questionImageUrl: null, revealImageUrl: null, explanation: null, choices: [
    { id: 'a', position: 0, body: 'แมว', isCorrect: true }, { id: 'b', position: 1, body: 'หมา', isCorrect: false },
    { id: 'c', position: 2, body: 'นก', isCorrect: false }, { id: 'd', position: 3, body: 'ปลา', isCorrect: false },
  ] }],
}

describe('final game results', () => {
  beforeEach(async () => { await getRedis().flushdb() })
  afterAll(async () => { await closeRedis() })

  it('writes final rank and total score once when the game finishes', async () => {
    const persistFinalResults = vi.fn<FinalResultsRepository['persistFinalResults']>().mockResolvedValue(undefined)
    const session = await createSession(quiz, '555555')
    const player = await joinSession(session.pin, 'หนึ่ง', 'player-one')
    const service = new GameService({ introDurationMs: 60_000, answerDurationMs: 60_000, resultRepository: { persistFinalResults } })

    await service.startGame(session.id)
    await service.openQuestion(session.id)
    await service.submitPlayerAnswer(session.id, player.id, 'q1', 'a')
    await service.revealQuestion(session.id)
    await service.finishGame(session.id)
    await service.finishGame(session.id)

    expect(persistFinalResults).toHaveBeenCalledTimes(1)
    expect(persistFinalResults).toHaveBeenCalledWith(expect.objectContaining({
      sessionId: session.id,
      quizId: quiz.id,
      players: [expect.objectContaining({ id: player.id, finalRank: 1, finalScore: expect.any(Number) })],
    }))
  })
})
