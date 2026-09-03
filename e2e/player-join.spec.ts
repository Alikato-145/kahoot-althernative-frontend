import { expect, test } from '@playwright/test'

const lobby = {
  state: { sessionId: 'session-1', quizId: 'quiz-1', pin: '842193', phase: 'lobby', currentQuestionIndex: null, openedAt: null, deadlineAt: null },
  players: [{ id: 'player-1', nickname: 'มานัส', score: 0, rank: 1 }], answers: {},
  quiz: { id: 'quiz-1', title: 'ค่าย', description: '', coverImageUrl: null, questions: [{ id: 'question-1', position: 0, body: 'รูปทรงใดมีสามด้าน?', questionImageUrl: '/triangle.webp', revealImageUrl: null, explanation: null, choices: [
    { id: 'choice-1', position: 0, body: 'สามเหลี่ยม', isCorrect: true }, { id: 'choice-2', position: 1, body: 'สี่เหลี่ยมข้าวหลามตัด', isCorrect: false }, { id: 'choice-3', position: 2, body: 'วงกลม', isCorrect: false }, { id: 'choice-4', position: 3, body: 'สี่เหลี่ยมจัตุรัส', isCorrect: false },
  ] }] },
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript((snapshot) => {
    const listeners: Record<string, (payload: any) => void> = {}
    const answers: unknown[] = []
    const socket = {
      connected: true,
      on(event: string, listener: (payload: any) => void) { listeners[event] = listener; return socket },
      off(event: string) { delete listeners[event]; return socket },
      emit(event: string, payload: any) {
        if (event === 'player:join') queueMicrotask(() => { listeners['room:joined']?.({ playerToken: 'player-token' }); listeners['game:state']?.(snapshot) })
        if (event === 'player:answer') answers.push(payload)
        return socket
      },
    }
    ;(window as any).__campQuizSocketFactory = () => socket
    ;(window as any).__campQuizSocketFixture = {
      openQuestion: () => { listeners['question:intro']?.({ questionId: 'question-1' }); listeners['question:open']?.({ questionId: 'question-1' }) },
      answers,
    }
  }, lobby)
})

test('joins, receives a question, and submits exactly one answer without navigating', async ({ page }) => {
  await page.goto('/join')
  await page.getByLabel('Game PIN').fill('842193')
  await page.getByLabel('ชื่อเล่น').fill('มานัส')
  await page.getByRole('button', { name: 'เข้าร่วม' }).click()
  await expect(page).toHaveURL(/\/game\/842193$/)
  await expect(page.getByText(/รอผู้จัดเริ่มเกม/)).toBeVisible()

  await page.evaluate(() => (window as any).__campQuizSocketFixture.openQuestion())
  await expect(page.getByRole('button', { name: 'สามเหลี่ยม' })).toBeEnabled()
  await page.getByRole('button', { name: 'สามเหลี่ยม' }).click()
  await expect(page.getByText(/ส่งคำตอบแล้ว/)).toBeVisible()
  await expect(page.getByRole('button')).toHaveCount(4)
  for (const button of await page.getByRole('button').all()) await expect(button).toBeDisabled()
  await expect(page).toHaveURL(/\/game\/842193$/)
  await expect.poll(() => page.evaluate(() => (window as any).__campQuizSocketFixture.answers)).toEqual([{ pin: '842193', playerId: 'player-token', questionId: 'question-1', choiceId: 'choice-1' }])
})
