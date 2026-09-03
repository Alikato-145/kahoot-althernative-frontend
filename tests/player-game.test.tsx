import { describe, expect, it, vi } from 'vitest'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { PlayerQuestion } from '@/components/game/PlayerQuestion'
import { QuestionIntro } from '@/components/game/QuestionIntro'
import { createAnswerSubmission, joinPayloadFromStorage } from '@/components/game/PlayerGame'
import { PlayerReveal } from '@/components/game/PlayerReveal'

const question = {
  id: 'question-1',
  position: 0,
  body: 'รูปทรงใดมีสามด้าน?',
  questionImageUrl: '/media/triangle.webp',
  revealImageUrl: null,
  explanation: null,
  choices: [
    { id: 'choice-1', position: 0, body: 'สามเหลี่ยม', isCorrect: true },
    { id: 'choice-2', position: 1, body: 'สี่เหลี่ยมข้าวหลามตัด', isCorrect: false },
    { id: 'choice-3', position: 2, body: 'วงกลม', isCorrect: false },
    { id: 'choice-4', position: 3, body: 'สี่เหลี่ยมจัตุรัส', isCorrect: false },
  ],
}

describe('PlayerQuestion', () => {
  it('shows the configured reveal countdown and correct answer on player devices', () => {
    const markup = renderToStaticMarkup(<PlayerReveal question={question} correctChoiceId="choice-1" revealImageUrl="/media/reveal.webp" explanation="สามด้าน" openedAt={1_000} deadlineAt={5_000} />)
    expect(markup).toContain('เฉลยคำถาม')
    expect(markup).toContain('สามเหลี่ยม')
    expect(markup).toContain('role="timer"')
  })
  it('hides question content and its image during the pre-question intro', () => {
    const markup = renderToStaticMarkup(<QuestionIntro />)

    expect(markup).toContain('เตรียมตัว')
    expect(markup).not.toContain('<img')
    expect(markup).not.toContain(question.body)
  })
  it('renders the four enabled answer tiles while a question is accepting answers', () => {
    const markup = renderToStaticMarkup(<PlayerQuestion question={question} phase="answering" onAnswer={vi.fn()} />)

    expect(markup).toContain('aria-label="สามเหลี่ยม"')
    expect(markup).not.toContain('disabled')
  })

  it('disables every answer tile after a player submits one answer', () => {
    const markup = renderToStaticMarkup(<PlayerQuestion question={question} phase="answering" onAnswer={vi.fn()} submitted />)

    expect((markup.match(/disabled/g) ?? [])).toHaveLength(4)
  })

  it('emits one answer payload and marks the tiles disabled after a click', () => {
    const emit = vi.fn()
    const submit = createAnswerSubmission({ pin: '842193', playerId: 'player-token', nickname: 'มานัส' }, 'question-1', emit)

    expect(submit('choice-1')).toBe(true)
    expect(emit).toHaveBeenCalledWith('player:answer', { pin: '842193', playerId: 'player-token', questionId: 'question-1', choiceId: 'choice-1' })
    expect(submit('choice-2')).toBe(false)
    expect(renderToStaticMarkup(<PlayerQuestion question={question} phase="answering" onAnswer={submit} submitted={submit.submitted} />).match(/disabled/g)).toHaveLength(4)
  })

  it('reads the newest stored token for every reconnect join payload', () => {
    let stored = JSON.stringify({ pin: '842193', playerId: 'old-token', nickname: 'มานัส' })
    expect(joinPayloadFromStorage('842193', () => stored)).toEqual({ pin: '842193', nickname: 'มานัส', playerToken: 'old-token' })

    stored = JSON.stringify({ pin: '842193', playerId: 'fresh-token', nickname: 'มานัส' })
    expect(joinPayloadFromStorage('842193', () => stored)).toEqual({ pin: '842193', nickname: 'มานัส', playerToken: 'fresh-token' })
  })
})
