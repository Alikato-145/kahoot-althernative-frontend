import { describe, expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'
import { createQuiz, deleteQuiz, getQuiz, listQuizzes, updateQuiz } from '@/server/repositories/quizzes'
import { query } from '@/server/db'

process.env.DATABASE_URL ??= 'mysql://campquiz:campquiz@localhost:3306/camp_quiz'
process.env.REDIS_URL ??= 'redis://localhost:6379'

const questionInput = {
  body: 'ประเทศไทยมีชื่อเรียกอีกชื่อว่าอะไร',
  choices: [
    { body: 'สยาม', isCorrect: true },
    { body: 'ลาว', isCorrect: false },
    { body: 'กัมพูชา', isCorrect: false },
    { body: 'เวียดนาม', isCorrect: false },
  ],
}

describe('quiz repository', () => {
  it('rejects a question without four choices before it writes to MySQL', async () => {
    await expect(createQuiz({
      title: 'ค่าย',
      description: '',
      questions: [{ body: 'คำถาม', choices: questionInput.choices.slice(0, 3) }],
    })).rejects.toThrow('exactly four choices')
  })

  it('persists a question with exactly four ordered choices', async () => {
    const quiz = await createQuiz({
      title: 'ค่าย',
      description: '',
      questions: [questionInput],
    })

    const loaded = await getQuiz(quiz.id)

    expect(loaded?.questions[0]?.choices.map((choice) => choice.position)).toEqual([0, 1, 2, 3])
  })

  it('lists saved quizzes and returns an updated quiz', async () => {
    const created = await createQuiz({ title: 'ก่อนแก้ไข', description: '', questions: [questionInput] })
    const updated = await updateQuiz(created.id, {
      title: 'หลังแก้ไข',
      description: 'รายละเอียดใหม่',
      questions: [{ ...questionInput, body: 'คำถามใหม่' }],
    })

    expect((await listQuizzes()).map((quiz) => quiz.id)).toContain(created.id)
    expect(updated).toMatchObject({ id: created.id, title: 'หลังแก้ไข', description: 'รายละเอียดใหม่' })
    expect(updated.questions[0]?.body).toBe('คำถามใหม่')
  })

  it('does not change a quiz when an update targets a missing quiz', async () => {
    await expect(updateQuiz('00000000-0000-0000-0000-000000000000', {
      title: 'ไม่มี', description: '', questions: [questionInput],
    })).rejects.toThrow('Quiz not found')
  })

  it('rolls back an update when a choice insert fails', async () => {
    const created = await createQuiz({ title: 'ก่อน', description: '', questions: [questionInput] })
    const duplicateChoiceId = randomUUID()

    await expect(updateQuiz(created.id, {
      title: 'หลัง',
      description: '',
      questions: [{
        ...questionInput,
        choices: questionInput.choices.map((choice) => ({ ...choice, id: duplicateChoiceId })),
      }],
    })).rejects.toThrow()

    expect((await getQuiz(created.id))?.title).toBe('ก่อน')
  })

  it('does not replace questions for a quiz with a completed game session', async () => {
    const created = await createQuiz({ title: 'ประวัติ', description: '', questions: [questionInput] })
    await query(
      'INSERT INTO game_sessions (id, quiz_id, pin, status, completed_at) VALUES (?, ?, ?, ?, NOW())',
      [randomUUID(), created.id, String(Math.floor(Math.random() * 1_000_000)).padStart(6, '0'), 'completed'],
    )

    await expect(updateQuiz(created.id, { title: 'แก้ไขไม่ได้', description: '', questions: [questionInput] }))
      .rejects.toThrow('cannot be updated while a game session exists')
    expect((await getQuiz(created.id))?.title).toBe('ประวัติ')
  })

  it('does not replace questions for a quiz with an active game session', async () => {
    const created = await createQuiz({ title: 'กำลังเล่น', description: '', questions: [questionInput] })
    await query(
      'INSERT INTO game_sessions (id, quiz_id, pin, status) VALUES (?, ?, ?, ?)',
      [randomUUID(), created.id, String(Math.floor(Math.random() * 1_000_000)).padStart(6, '0'), 'active'],
    )

    await expect(updateQuiz(created.id, { title: 'แก้ไขไม่ได้', description: '', questions: [questionInput] }))
      .rejects.toThrow('cannot be updated while a game session exists')
    expect((await getQuiz(created.id))?.title).toBe('กำลังเล่น')
  })

  it('refuses to delete a quiz with a persisted game session', async () => {
    const created = await createQuiz({ title: 'เก็บประวัติ', description: '', questions: [questionInput] })
    await query(
      'INSERT INTO game_sessions (id, quiz_id, pin, status) VALUES (?, ?, ?, ?)',
      [randomUUID(), created.id, String(Math.floor(Math.random() * 1_000_000)).padStart(6, '0'), 'active'],
    )

    await expect(deleteQuiz(created.id)).rejects.toThrow('cannot be deleted while a game session exists')
    expect(await getQuiz(created.id)).not.toBeNull()
  })
})
