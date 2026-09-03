import { expect, test, type Page } from '@playwright/test'

const quiz = {
  id: 'quiz-1', title: 'รอบซ้อมค่าย', description: '', coverImageUrl: null,
  questions: [{ id: 'question-1', position: 0, body: 'สัตว์ชนิดใดบินได้?', questionImageUrl: '/question.webp', revealImageUrl: '/reveal.webp', explanation: 'นกมีปีกและบินได้', choices: [
    { id: 'choice-1', position: 0, body: 'นก', isCorrect: true }, { id: 'choice-2', position: 1, body: 'ปลา', isCorrect: false }, { id: 'choice-3', position: 2, body: 'แมว', isCorrect: false }, { id: 'choice-4', position: 3, body: 'ช้าง', isCorrect: false },
  ] }],
}

function snapshot(players: Array<{ id: string; nickname: string; score: number; rank: number }>) {
  return { state: { sessionId: 'session-1', quizId: quiz.id, pin: '842193', phase: 'lobby', currentQuestionIndex: null, openedAt: null, deadlineAt: null }, players, answers: {}, quiz }
}

async function installSocketFixture(page: Page, playerToken?: string) {
  await page.addInitScript(({ initial, token }) => {
    const listeners: Record<string, (payload: any) => void> = {}
    const socket = {
      connected: true,
      on(event: string, listener: (payload: any) => void) { listeners[event] = listener; return socket },
      off(event: string) { delete listeners[event]; return socket },
      emit(event: string) {
        if (event === 'host:join') queueMicrotask(() => listeners['game:state']?.(initial))
        if (event === 'player:join') queueMicrotask(() => { listeners['room:joined']?.({ playerToken: token, player: { id: token } }); listeners['game:state']?.(initial) })
        return socket
      },
    }
    ;(window as any).__campQuizSocketFactory = () => socket
    ;(window as any).__fullGameFixture = {
      intro: () => listeners['question:intro']?.({ questionId: 'question-1' }),
      open: () => listeners['question:open']?.({ questionId: 'question-1', deadlineAt: Date.now() + 20_000 }),
      rank: (payload: any) => listeners['score:rank-update']?.(payload),
      final: (players: any) => listeners['game:final-results']?.({ players }),
    }
  }, { initial: snapshot([{ id: 'player-1', nickname: 'เอ', score: 0, rank: 1 }, { id: 'player-2', nickname: 'บี', score: 0, rank: 2 }]), token: playerToken })
}

test('host and two players complete one question and receive final ranks', async ({ browser }) => {
  const hostContext = await browser.newContext()
  const phoneOneContext = await browser.newContext({ viewport: { width: 390, height: 844 } })
  const phoneTwoContext = await browser.newContext({ viewport: { width: 390, height: 844 } })
  const host = await hostContext.newPage(), phoneOne = await phoneOneContext.newPage(), phoneTwo = await phoneTwoContext.newPage()
  await Promise.all([installSocketFixture(host), installSocketFixture(phoneOne, 'player-1'), installSocketFixture(phoneTwo, 'player-2')])

  await host.goto('/host/game/session-1?hostToken=host-capability')
  await Promise.all([phoneOne.goto('/join'), phoneTwo.goto('/join')])
  await phoneOne.getByLabel('Game PIN').fill('842193'); await phoneOne.getByLabel('ชื่อเล่น').fill('เอ')
  await phoneTwo.getByLabel('Game PIN').fill('842193'); await phoneTwo.getByLabel('ชื่อเล่น').fill('บี')
  await Promise.all([phoneOne.getByRole('button', { name: 'เข้าร่วม' }).click(), phoneTwo.getByRole('button', { name: 'เข้าร่วม' }).click()])
  await expect(phoneOne).toHaveURL(/\/game\/842193$/); await expect(phoneTwo).toHaveURL(/\/game\/842193$/)

  await Promise.all([host, phoneOne, phoneTwo].map((page) => page.evaluate(() => (window as any).__fullGameFixture.intro())))
  await Promise.all([host, phoneOne, phoneTwo].map((page) => page.evaluate(() => (window as any).__fullGameFixture.open())))
  await phoneOne.getByRole('button', { name: 'นก' }).click()
  await phoneTwo.getByRole('button', { name: 'ปลา' }).click()

  const ranked = [{ id: 'player-1', nickname: 'เอ', score: 1000, rank: 1 }, { id: 'player-2', nickname: 'บี', score: 0, rank: 2 }]
  await host.evaluate((players) => (window as any).__fullGameFixture.final(players), ranked)
  await Promise.all([
    phoneOne.evaluate(() => (window as any).__fullGameFixture.rank({ playerId: 'player-1', correct: true, earnedScore: 1000, totalScore: 1000, previousRank: 1, rank: 1 })),
    phoneTwo.evaluate(() => (window as any).__fullGameFixture.rank({ playerId: 'player-2', correct: false, earnedScore: 0, totalScore: 0, previousRank: 2, rank: 2 })),
  ])
  await expect(phoneOne.getByText('อันดับคงเดิม')).toBeVisible()
  await expect(phoneTwo.getByText('อันดับคงเดิม')).toBeVisible()
  await Promise.all([phoneOne, phoneTwo].map((page) => page.evaluate((players) => (window as any).__fullGameFixture.final(players), ranked)))
  await expect(host.getByText('อันดับสุดท้าย')).toBeVisible()
  await expect(phoneOne.getByText('เอ')).toBeVisible()
  await expect(phoneTwo.getByText('บี')).toBeVisible()
  await hostContext.close(); await phoneOneContext.close(); await phoneTwoContext.close()
})
