import { beforeEach, describe, expect, it, vi } from 'vitest'

const dependencies = vi.hoisted(() => ({ getQuiz: vi.fn(), createSession: vi.fn() }))
vi.mock('@/server/repositories/quizzes', () => ({ getQuiz: dependencies.getQuiz }))
vi.mock('@/server/game/store', () => ({ createSession: dependencies.createSession }))

describe('session API route', () => {
  beforeEach(() => vi.clearAllMocks())

  it('creates a six digit session PIN and capability-bearing host URL', async () => {
    dependencies.getQuiz.mockResolvedValue({ id: '00000000-0000-4000-8000-000000000001', title: 'ค่าย', questions: [] })
    dependencies.createSession.mockResolvedValue({ id: 'session-1', pin: '042193', hostToken: 'host-secret' })
    process.env.PUBLIC_BASE_URL = 'https://quiz.example'
    const { POST } = await import('@/app/api/sessions/route')
    const response = await POST(new Request('http://localhost/api/sessions', { method: 'POST', body: JSON.stringify({ quizId: '00000000-0000-4000-8000-000000000001' }), headers: { 'content-type': 'application/json' } }))
    expect(response.status).toBe(201)
    expect(await response.json()).toEqual({
      sessionId: 'session-1', pin: '042193',
      hostUrl: 'https://quiz.example/host/game/session-1?hostToken=host-secret', playerUrl: 'https://quiz.example/game/042193',
    })
  })

  it('returns 404 when the requested quiz does not exist', async () => {
    dependencies.getQuiz.mockResolvedValue(null)
    const { POST } = await import('@/app/api/sessions/route')
    const response = await POST(new Request('http://localhost/api/sessions', {
      method: 'POST', body: JSON.stringify({ quizId: '00000000-0000-4000-8000-000000000099' }), headers: { 'content-type': 'application/json' },
    }))
    expect(response.status).toBe(404)
  })
})
