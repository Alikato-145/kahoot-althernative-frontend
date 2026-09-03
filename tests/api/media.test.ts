import { afterEach, describe, expect, it } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

let mediaRoot: string | undefined

afterEach(async () => { if (mediaRoot) await rm(mediaRoot, { recursive: true, force: true }); mediaRoot = undefined })

describe('media API route', () => {
  it('returns a public media URL after a WebP upload', async () => {
    mediaRoot = await mkdtemp(path.join(tmpdir(), 'camp-quiz-media-'))
    process.env.MEDIA_ROOT = mediaRoot
    const { POST } = await import('@/app/api/media/route')
    const form = new FormData()
    form.set('quizId', '00000000-0000-4000-8000-000000000001')
    form.set('file', new File(['image'], 'image.webp', { type: 'image/webp' }))
    const response = await POST(new Request('http://localhost/api/media', { method: 'POST', body: form }))
    expect(response.status).toBe(201)
    expect(await response.json()).toMatchObject({ url: expect.stringMatching(/^\/media\/quizzes\/00000000-0000-4000-8000-000000000001\//) })
  })

  it('rejects a non-image upload', async () => {
    const { POST } = await import('@/app/api/media/route')
    const form = new FormData()
    form.set('quizId', '00000000-0000-4000-8000-000000000001')
    form.set('file', new File(['not an image'], 'notes.txt', { type: 'text/plain' }))
    expect((await POST(new Request('http://localhost/api/media', { method: 'POST', body: form }))).status).toBe(422)
  })
})
