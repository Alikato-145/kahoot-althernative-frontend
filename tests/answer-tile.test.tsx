import { describe, expect, it, vi } from 'vitest'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { AnswerTile } from '@/components/ui/AnswerTile'

describe('AnswerTile', () => {
  it('maps each answer index to its Kahoot colour and shape', () => {
    const expected = [
      ['answer-tile--red', 'answer-shape--triangle'],
      ['answer-tile--blue', 'answer-shape--diamond'],
      ['answer-tile--yellow', 'answer-shape--circle'],
      ['answer-tile--green', 'answer-shape--square'],
    ]
    expected.forEach(([colour, shape], index) => {
      const markup = renderToStaticMarkup(<AnswerTile index={index} label="คำตอบ" onClick={vi.fn()} />)
      expect(markup).toContain(colour)
      expect(markup).toContain(shape)
      expect(markup).toContain('คำตอบ')
    })
  })

  it('passes disabled state to the answer button', () => {
    const markup = renderToStaticMarkup(<AnswerTile index={0} label="สามเหลี่ยม" onClick={vi.fn()} disabled />)
    expect(markup).toContain('disabled')
    expect(markup).toContain('aria-label="สามเหลี่ยม"')
  })
})
