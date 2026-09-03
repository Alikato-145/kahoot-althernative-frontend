import { randomUUID } from 'node:crypto'
import type { ResultSetHeader, RowDataPacket } from 'mysql2'
import { query, transaction } from '../db'
import { quizInputSchema } from '../quiz-validation'

export type QuizTiming = { introDurationSeconds: number; answerDurationSeconds: number; revealDurationSeconds: number }
export const defaultQuizTiming: QuizTiming = { introDurationSeconds: 5, answerDurationSeconds: 20, revealDurationSeconds: 4 }
export type Choice = { id: string; position: number; body: string; isCorrect: boolean }
export type Question = { id: string; position: number; body: string; questionImageUrl: string | null; revealImageUrl: string | null; explanation: string | null; choices: Choice[] }
export type Quiz = { id: string; title: string; description: string; coverImageUrl: string | null; timing?: QuizTiming; questions: Question[] }
export type QuizInput = {
  title: string; description: string; coverImageUrl?: string | null
  timing?: QuizTiming
  questions: Array<{
    id?: string; body: string; questionImageUrl?: string | null; revealImageUrl?: string | null; explanation?: string | null
    choices: Array<{ id?: string; body: string; isCorrect: boolean }>
  }>
}

type QuizRow = RowDataPacket & { id: string; title: string; description: string; cover_image_url: string | null; intro_duration_seconds: number; answer_duration_seconds: number; reveal_duration_seconds: number }
type QuestionRow = RowDataPacket & { id: string; position: number; body: string; question_image_url: string | null; reveal_image_url: string | null; explanation: string | null }
type ChoiceRow = RowDataPacket & { id: string; question_id: string; position: number; body: string; is_correct: number }

function assertValidQuizInput(input: QuizInput): void {
  quizInputSchema.parse(input)
  for (const question of input.questions) {
    if (question.choices.length !== 4 || question.choices.filter((choice) => choice.isCorrect).length !== 1) {
      throw new Error('Each question must have exactly four choices with exactly one correct choice')
    }
  }
}

function toQuiz(row: QuizRow, questions: QuestionRow[], choices: ChoiceRow[]): Quiz {
  return { id: row.id, title: row.title, description: row.description, coverImageUrl: row.cover_image_url, timing: { introDurationSeconds: row.intro_duration_seconds ?? 5, answerDurationSeconds: row.answer_duration_seconds ?? 20, revealDurationSeconds: row.reveal_duration_seconds ?? 4 }, questions: questions.map((question) => ({
    id: question.id, position: question.position, body: question.body, questionImageUrl: question.question_image_url,
    revealImageUrl: question.reveal_image_url, explanation: question.explanation,
    choices: choices.filter((choice) => choice.question_id === question.id).map((choice) => ({ id: choice.id, position: choice.position, body: choice.body, isCorrect: Boolean(choice.is_correct) })),
  })) }
}

export async function getQuiz(id: string): Promise<Quiz | null> {
  const quizzes = await query<QuizRow[]>('SELECT id, title, description, cover_image_url, intro_duration_seconds, answer_duration_seconds, reveal_duration_seconds FROM quizzes WHERE id = ?', [id])
  const quiz = quizzes[0]
  if (!quiz) return null
  const questions = await query<QuestionRow[]>('SELECT id, position, body, question_image_url, reveal_image_url, explanation FROM questions WHERE quiz_id = ? ORDER BY position', [id])
  const choices = questions.length === 0 ? [] : await query<ChoiceRow[]>(
    `SELECT id, question_id, position, body, is_correct FROM choices WHERE question_id IN (${questions.map(() => '?').join(', ')}) ORDER BY question_id, position`,
    questions.map((question) => question.id),
  )
  return toQuiz(quiz, questions, choices)
}

export async function listQuizzes(): Promise<Quiz[]> {
  const rows = await query<Array<RowDataPacket & { id: string }>>('SELECT id FROM quizzes ORDER BY created_at DESC')
  const quizzes = await Promise.all(rows.map((row) => getQuiz(row.id)))
  return quizzes.filter((quiz): quiz is Quiz => quiz !== null)
}

async function writeQuiz(id: string, input: QuizInput, isUpdate: boolean): Promise<Quiz> {
  assertValidQuizInput(input)
  await transaction(async (connection) => {
    if (isUpdate) {
      const [sessions] = await connection.execute<RowDataPacket[]>(
        'SELECT 1 FROM game_sessions WHERE quiz_id = ? LIMIT 1 FOR UPDATE',
        [id],
      )
      if (sessions.length > 0) {
        throw new Error(`Quiz cannot be updated while a game session exists: ${id}`)
      }
      const [result] = await connection.execute<ResultSetHeader>('UPDATE quizzes SET title = ?, description = ?, cover_image_url = ?, intro_duration_seconds = ?, answer_duration_seconds = ?, reveal_duration_seconds = ? WHERE id = ?', [input.title, input.description, input.coverImageUrl ?? null, input.timing?.introDurationSeconds ?? 5, input.timing?.answerDurationSeconds ?? 20, input.timing?.revealDurationSeconds ?? 4, id])
      if (result.affectedRows === 0) throw new Error(`Quiz not found: ${id}`)
      await connection.execute('DELETE FROM questions WHERE quiz_id = ?', [id])
    } else {
      await connection.execute('INSERT INTO quizzes (id, title, description, cover_image_url, intro_duration_seconds, answer_duration_seconds, reveal_duration_seconds) VALUES (?, ?, ?, ?, ?, ?, ?)', [id, input.title, input.description, input.coverImageUrl ?? null, input.timing?.introDurationSeconds ?? 5, input.timing?.answerDurationSeconds ?? 20, input.timing?.revealDurationSeconds ?? 4])
    }
    for (let questionPosition = 0; questionPosition < input.questions.length; questionPosition += 1) {
      const question = input.questions[questionPosition]
      const questionId = question.id ?? randomUUID()
      await connection.execute('INSERT INTO questions (id, quiz_id, position, body, question_image_url, reveal_image_url, explanation) VALUES (?, ?, ?, ?, ?, ?, ?)', [questionId, id, questionPosition, question.body, question.questionImageUrl ?? null, question.revealImageUrl ?? null, question.explanation ?? null])
      for (let choicePosition = 0; choicePosition < question.choices.length; choicePosition += 1) {
        const choice = question.choices[choicePosition]
        await connection.execute('INSERT INTO choices (id, question_id, position, body, is_correct) VALUES (?, ?, ?, ?, ?)', [choice.id ?? randomUUID(), questionId, choicePosition, choice.body, choice.isCorrect])
      }
    }
  })
  const quiz = await getQuiz(id)
  if (!quiz) throw new Error(`Quiz not found after write: ${id}`)
  return quiz
}

export function createQuiz(input: QuizInput): Promise<Quiz> { return writeQuiz(randomUUID(), input, false) }
export function updateQuiz(id: string, input: QuizInput): Promise<Quiz> { return writeQuiz(id, input, true) }

export async function deleteQuiz(id: string): Promise<boolean> {
  return transaction(async (connection) => {
    const [sessions] = await connection.execute<RowDataPacket[]>(
      'SELECT 1 FROM game_sessions WHERE quiz_id = ? LIMIT 1 FOR UPDATE', [id],
    )
    if (sessions.length > 0) throw new Error(`Quiz cannot be deleted while a game session exists: ${id}`)
    const [result] = await connection.execute<ResultSetHeader>('DELETE FROM quizzes WHERE id = ?', [id])
    return result.affectedRows > 0
  })
}
