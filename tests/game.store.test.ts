import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import type { Quiz } from '@/server/repositories/quizzes'
import { ACTIVE_SESSION_TTL_SECONDS, FINAL_SESSION_TTL_SECONDS, closeRedis, gameKeys, getRedis } from '@/server/redis'
import { closeQuestion, createSession, expireSession, getSnapshot, joinSession, setGameState, submitAnswer } from '@/server/game/store'

process.env.REDIS_URL ??= 'redis://localhost:6379'

const quiz: Quiz = {
  id: 'quiz-1', title: 'ค่าย', description: '', coverImageUrl: null,
  questions: [{
    id: 'question-1', position: 0, body: 'คำถาม', questionImageUrl: null, revealImageUrl: null, explanation: null,
    choices: [
      { id: 'choice-correct', position: 0, body: 'ถูก', isCorrect: true },
      { id: 'choice-2', position: 1, body: 'สอง', isCorrect: false },
      { id: 'choice-3', position: 2, body: 'สาม', isCorrect: false },
      { id: 'choice-4', position: 3, body: 'สี่', isCorrect: false },
    ],
  }],
}

describe('Redis game store', () => {
  beforeEach(async () => {
    await getRedis().flushdb()
  })

  afterAll(async () => {
    await closeRedis()
  })

  it('keeps one answer and one aggregate count when a player submits twice', async () => {
    const session = await createSession(quiz, '123456')
    const player = await joinSession('123456', 'มานัส')
    await setGameState(session.id, { phase: 'answering', currentQuestionIndex: 0, deadlineAt: Date.now() + 20_000 })

    const first = await submitAnswer({ pin: '123456', playerId: player.id, questionId: 'question-1', choiceId: 'choice-correct' })
    const duplicate = await submitAnswer({ pin: '123456', playerId: player.id, questionId: 'question-1', choiceId: 'choice-2' })
    const snapshot = await getSnapshot(session.id)

    if (!first.accepted) throw new Error('The first answer should be accepted')
    expect(first.accepted).toBe(true)
    expect(first.earnedScore).toBeGreaterThan(0)
    expect(duplicate).toEqual({ accepted: false })
    expect(snapshot?.answers['question-1']).toMatchObject({ choiceCounts: { 'choice-correct': 1, 'choice-2': 0 } })
    expect(snapshot?.players[0]).toMatchObject({ id: player.id, score: first.earnedScore })
  })

  it('accepts exactly one concurrent answer from the same player', async () => {
    const session = await createSession(quiz, '234567')
    const player = await joinSession('234567', 'มานัส')
    await setGameState(session.id, { phase: 'answering', currentQuestionIndex: 0, deadlineAt: Date.now() + 20_000 })

    const results = await Promise.all(Array.from({ length: 12 }, () => submitAnswer({
      pin: '234567', playerId: player.id, questionId: 'question-1', choiceId: 'choice-correct',
    })))
    const snapshot = await getSnapshot(session.id)

    expect(results.filter((result) => result.accepted)).toHaveLength(1)
    expect(snapshot?.answers['question-1']?.choiceCounts['choice-correct']).toBe(1)
  })

  it('rejects an answer submitted after the question is closed', async () => {
    const session = await createSession(quiz, '345678')
    const player = await joinSession('345678', 'มานัส')
    await setGameState(session.id, { phase: 'answering', currentQuestionIndex: 0, deadlineAt: Date.now() + 20_000 })
    await closeQuestion(session.id)

    await expect(submitAnswer({ pin: '345678', playerId: player.id, questionId: 'question-1', choiceId: 'choice-correct' }))
      .resolves.toEqual({ accepted: false })
  })

  it('orders a concurrent close and submission without a partial answer write', async () => {
    const session = await createSession(quiz, '401234')
    const player = await joinSession('401234', 'มานัส')
    await setGameState(session.id, { phase: 'answering', currentQuestionIndex: 0, deadlineAt: Date.now() + 20_000 })

    const [, answer] = await Promise.all([
      closeQuestion(session.id),
      submitAnswer({ pin: '401234', playerId: player.id, questionId: 'question-1', choiceId: 'choice-correct' }),
    ])
    const snapshot = await getSnapshot(session.id)
    const count = snapshot?.answers['question-1']?.choiceCounts['choice-correct'] ?? 0

    expect(snapshot?.state.phase).toBe('reveal')
    expect(count).toBe(answer.accepted ? 1 : 0)
  })

  it('keeps an earlier score-reached timestamp ahead of a later tied score', async () => {
    const session = await createSession(quiz, '456789')
    const earlier = await joinSession('456789', 'คนแรก', 'z-player')
    const later = await joinSession('456789', 'คนหลัง', 'a-player')
    await setGameState(session.id, { phase: 'answering', currentQuestionIndex: 0, openedAt: Date.now(), deadlineAt: Date.now() + 20_000 })

    await submitAnswer({ pin: '456789', playerId: earlier.id, questionId: 'question-1', choiceId: 'choice-correct' })
    await new Promise((resolve) => setTimeout(resolve, 5))
    await submitAnswer({ pin: '456789', playerId: later.id, questionId: 'question-1', choiceId: 'choice-correct' })

    expect((await getSnapshot(session.id))?.players.map((player) => player.id)).toEqual([earlier.id, later.id])
  })

  it('reserves a PIN without overwriting the existing live session', async () => {
    const first = await createSession(quiz, '567890')
    const second = await createSession(quiz, '567890')

    expect(await getRedis().get(gameKeys.pin('567890'))).toBe(first.id)
    expect(second.pin).not.toBe(first.pin)
  })

  it('sets every active key to 12 hours and every final key to 30 minutes', async () => {
    const session = await createSession(quiz, '654321')
    const player = await joinSession('654321', 'มานัส')
    await setGameState(session.id, { phase: 'answering', currentQuestionIndex: 0, deadlineAt: Date.now() + 20_000 })
    await submitAnswer({ pin: '654321', playerId: player.id, questionId: 'question-1', choiceId: 'choice-correct' })
    const keys = [...await getRedis().keys(`game:${session.id}:*`), gameKeys.pin(session.pin)]

    expect(keys.length).toBeGreaterThanOrEqual(5)
    for (const key of keys) expect(await getRedis().ttl(key)).toBeGreaterThan(ACTIVE_SESSION_TTL_SECONDS - 5)

    await expireSession(session.id)
    for (const key of keys) {
      const ttl = await getRedis().ttl(key)
      expect(ttl).toBeLessThanOrEqual(FINAL_SESSION_TTL_SECONDS)
      expect(ttl).toBeGreaterThan(FINAL_SESSION_TTL_SECONDS - 5)
    }
  })
})
