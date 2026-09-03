import type { Quiz, QuizInput } from '@/server/repositories/quizzes'

type SessionResponse = { sessionId: string; pin: string; hostUrl: string; playerUrl: string }

export function toHostGamePath(hostUrl: string): string {
  const url = new URL(hostUrl)
  return `${url.pathname}${url.search}`
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init)
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { error?: string } | null
    throw new Error(body?.error ?? 'เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง')
  }
  return response.status === 204 ? undefined as T : response.json() as Promise<T>
}

export const quizApi = {
  list: () => request<Quiz[]>('/api/quizzes'),
  get: (id: string) => request<Quiz>(`/api/quizzes/${encodeURIComponent(id)}`),
  create: (input: QuizInput) => request<Quiz>('/api/quizzes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) }),
  update: (id: string, input: QuizInput) => request<Quiz>(`/api/quizzes/${encodeURIComponent(id)}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) }),
  remove: (id: string) => request<void>(`/api/quizzes/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  start: (quizId: string) => request<SessionResponse>('/api/sessions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ quizId }) }),
  uploadImage: async (quizId: string, file: File): Promise<string> => {
    const form = new FormData()
    form.set('quizId', quizId)
    form.set('file', file)
    return (await request<{ url: string }>('/api/media', { method: 'POST', body: form })).url
  },
}
