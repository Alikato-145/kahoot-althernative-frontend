import { expect, test } from '@playwright/test'

const lobby = {
  state: { sessionId: 'session-1', quizId: 'quiz-1', pin: '842193', phase: 'lobby', currentQuestionIndex: null, openedAt: null, deadlineAt: null },
  players: [{ id: 'player-1', nickname: 'มานัส', score: 0, rank: 1 }], answers: {},
  quiz: { id: 'quiz-1', title: 'ค่ายวิทย์', description: '', coverImageUrl: null, questions: [{ id: 'question-1', position: 0, body: 'รูปทรงใดมีสามด้าน?', questionImageUrl: '/question.webp', revealImageUrl: '/answer.webp', explanation: 'สามเหลี่ยมมีสามด้านเสมอ', choices: [
    { id: 'choice-1', position: 0, body: 'สามเหลี่ยม', isCorrect: true }, { id: 'choice-2', position: 1, body: 'สี่เหลี่ยม', isCorrect: false }, { id: 'choice-3', position: 2, body: 'วงกลม', isCorrect: false }, { id: 'choice-4', position: 3, body: 'ห้าเหลี่ยม', isCorrect: false },
  ] }] },
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript((snapshot) => {
    const listeners: Record<string, (payload: any) => void> = {}
    const socket = {
      connected: true,
      on(event: string, listener: (payload: any) => void) { listeners[event] = listener; return socket },
      off(event: string) { delete listeners[event]; return socket },
      emit(event: string) {
        if (event === 'host:join') queueMicrotask(() => listeners['game:state']?.(snapshot))
        if (event === 'host:start') queueMicrotask(() => { listeners['question:intro']?.({ questionId: 'question-1' }); listeners['question:open']?.({ questionId: 'question-1', deadlineAt: Date.now() + 20_000 }) })
        if (event === 'host:reveal') queueMicrotask(() => { listeners['question:reveal']?.({ questionId: 'question-1', correctChoiceId: 'choice-1', choiceCounts: { 'choice-1': 1 }, revealImageUrl: '/answer.webp', explanation: 'สามเหลี่ยมมีสามด้านเสมอ' }); listeners['leaderboard:update']?.(snapshot.players) })
        return socket
      },
    }
    ;(window as any).__campQuizSocketFactory = () => socket
    ;(window as any).__campQuizHostFixture = {
      answerProgress: (answerCount: number) => listeners['question:answer-progress']?.({ questionId: 'question-1', answerCount }),
    }
  }, lobby)
})

test('Host screen renders question and reveal media through the live controls', async ({ page }) => {
  await page.goto('/host/game/session-1?hostToken=host-capability')
  await expect(page.getByText('842193', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'เริ่มเกม' }).click()
  await expect(page.getByRole('img', { name: 'รูปทรงใดมีสามด้าน?' })).toHaveAttribute('src', '/question.webp')
  await expect(page.getByLabel(/เหลือเวลา/)).toBeVisible()
  await page.evaluate(() => (window as any).__campQuizHostFixture.answerProgress(1))
  await expect(page.getByText('ตอบแล้ว 1 คน')).toBeVisible()
  await page.getByRole('button', { name: /ปิดรับคำตอบ/ }).click()
  await expect(page.getByRole('img', { name: 'ภาพเฉลย' })).toHaveAttribute('src', '/answer.webp')
  await expect(page.getByText('สามเหลี่ยมมีสามด้านเสมอ')).toBeVisible()
  await expect(page.getByRole('button', { name: 'ข้อต่อไป' })).toBeVisible()
})
