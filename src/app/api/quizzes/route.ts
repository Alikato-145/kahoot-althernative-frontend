import { NextResponse } from 'next/server'
import { createQuiz, listQuizzes, type QuizInput } from '@/server/repositories/quizzes'
import { quizInputSchema } from '@/server/quiz-validation'
import { z } from 'zod'

async function parseQuiz(request: Request): Promise<QuizInput | NextResponse> {
  try {
    return quizInputSchema.parse(await request.json())
  } catch (error) {
    return NextResponse.json({ error: 'Invalid quiz', details: error instanceof z.ZodError ? error.flatten() : undefined }, { status: 422 })
  }
}

export async function GET(): Promise<NextResponse> {
  return NextResponse.json(await listQuizzes())
}

export async function POST(request: Request): Promise<NextResponse> {
  const input = await parseQuiz(request)
  if (input instanceof NextResponse) return input
  return NextResponse.json(await createQuiz(input), { status: 201 })
}
