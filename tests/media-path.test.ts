import { describe, expect, it } from 'vitest'
import path from 'node:path'
import { resolvePublicMediaPath } from '@/server/media'

describe('resolvePublicMediaPath', () => {
  const root = 'C:/camp-quiz/media'

  it('maps a public media URL into the configured media directory', () => {
    expect(resolvePublicMediaPath(root, ['quizzes', 'quiz-1', 'image.png'])).toBe(path.resolve(root, 'quizzes', 'quiz-1', 'image.png'))
  })

  it('rejects a path that escapes the media directory', () => {
    expect(resolvePublicMediaPath(root, ['..', 'secrets.env'])).toBeNull()
  })
})
