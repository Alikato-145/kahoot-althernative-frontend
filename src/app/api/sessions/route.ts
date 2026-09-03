import { NextResponse } from 'next/server'
import { z } from 'zod'
import { loadConfig } from '@/server/config'
import { createSession } from '@/server/game/store'
import { getQuiz } from '@/server/repositories/quizzes'

const sessionInputSchema = z.object({ quizId: z.string().uuid() })

export async function POST(request: Request): Promise<NextResponse> {
  let input: z.infer<typeof sessionInputSchema>
  try { input = sessionInputSchema.parse(await request.json()) } catch { return NextResponse.json({ error: 'Invalid session request' }, { status: 422 }) }
  const quiz = await getQuiz(input.quizId)
  if (!quiz) return NextResponse.json({ error: 'Quiz not found' }, { status: 404 })
  const pin = String(Math.floor(Math.random() * 1_000_000)).padStart(6, '0')
  const session = await createSession(quiz, pin)
  const baseUrl = loadConfig().publicBaseUrl.replace(/\/$/, '')
  return NextResponse.json({
    sessionId: session.id, pin: session.pin,
    hostUrl: `${baseUrl}/host/game/${encodeURIComponent(session.id)}?hostToken=${encodeURIComponent(session.hostToken)}`,
    playerUrl: `${baseUrl}/game/${encodeURIComponent(session.pin)}`,
  }, { status: 201 })
}
