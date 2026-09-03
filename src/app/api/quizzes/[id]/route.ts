import { NextResponse } from 'next/server'
import { deleteQuiz, getQuiz, updateQuiz } from '@/server/repositories/quizzes'
import { removeQuizMedia } from '@/server/media'
import { quizInputSchema } from '@/server/quiz-validation'
import { z } from 'zod'

type Context = { params: { id: string } }

export async function GET(_: Request, { params }: Context): Promise<NextResponse> {
  const quiz = await getQuiz(params.id)
  return quiz ? NextResponse.json(quiz) : NextResponse.json({ error: 'Quiz not found' }, { status: 404 })
}

export async function PUT(request: Request, { params }: Context): Promise<NextResponse> {
  try {
    const quiz = await updateQuiz(params.id, quizInputSchema.parse(await request.json()))
    return NextResponse.json(quiz)
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: 'Invalid quiz', details: error.flatten() }, { status: 422 })
    if (error instanceof Error && error.message.startsWith('Quiz not found:')) return NextResponse.json({ error: 'Quiz not found' }, { status: 404 })
    if (error instanceof Error && error.message.startsWith('Quiz cannot be updated while a game session exists:')) {
      return NextResponse.json({ error: 'Quiz has persisted game sessions and cannot be updated' }, { status: 409 })
    }
    throw error
  }
}

export async function DELETE(_: Request, { params }: Context): Promise<NextResponse> {
  try {
    const deleted = await deleteQuiz(params.id)
    if (!deleted) return NextResponse.json({ error: 'Quiz not found' }, { status: 404 })
    await removeQuizMedia(params.id)
    return new NextResponse(null, { status: 204 })
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('Quiz cannot be deleted while a game session exists:')) {
      return NextResponse.json({ error: 'Quiz has persisted game sessions and cannot be deleted' }, { status: 409 })
    }
    throw error
  }
}
