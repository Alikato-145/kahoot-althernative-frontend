import { describe, expect, it } from 'vitest'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { QuestionMedia } from '@/components/ui/QuestionMedia'

describe('QuestionMedia', () => {
  it('renders the configured question image instead of an empty host area', () => {
    const markup = renderToStaticMarkup(<QuestionMedia src="/media/quizzes/q1/cat.webp" alt="เสือชีตาห์" />)
    expect(markup).toContain('role="img"')
    expect(markup).toContain('src="/media/quizzes/q1/cat.webp"')
    expect(markup).toContain('alt="เสือชีตาห์"')
  })

  it('renders no media when the question has no image URL', () => {
    expect(renderToStaticMarkup(<QuestionMedia alt="คำถาม" />)).toBe('')
  })
})
