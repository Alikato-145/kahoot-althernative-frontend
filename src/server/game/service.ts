import { randomUUID } from 'node:crypto'
import { ACTIVE_SESSION_TTL_SECONDS, gameKeys, getRedis } from '../redis'
import { closeQuestion, expireSession, getSnapshot, joinSession, submitAnswer, transitionGameState, verifyHostCapability } from './store'
import type { GameSnapshot, LivePlayer, SubmitAnswerResult } from './types'
import { persistFinalResults, type FinalResultsInput } from '../repositories/game-results'

export type GameServiceEvent =
  | { type: 'question:intro'; sessionId: string; questionId: string; questionIndex: number; body: string; questionImageUrl: string | null; openedAt: number; deadlineAt: number }
  | { type: 'question:open'; sessionId: string; questionId: string; openedAt: number; deadlineAt: number }
  | { type: 'question:reveal'; sessionId: string; questionId: string; correctChoiceId: string; choiceCounts: Record<string, number>; revealImageUrl: string | null; explanation: string | null; openedAt: number; deadlineAt: number }
  | { type: 'score:rank-update'; sessionId: string; playerId: string; correct: boolean; earnedScore: number; totalScore: number; previousRank: number; rank: number }
  | { type: 'leaderboard:update'; sessionId: string; players: LivePlayer[] }
  | { type: 'game:final-results'; sessionId: string; players: LivePlayer[] }

export type FinalResultsRepository = { persistFinalResults(input: FinalResultsInput): Promise<void> }
export type GameServiceOptions = { introDurationMs?: number; answerDurationMs?: number; resultRepository?: FinalResultsRepository }
type Listener = (event: GameServiceEvent) => void

const DEFAULT_TIMING = { introDurationSeconds: 5, answerDurationSeconds: 20, revealDurationSeconds: 4 }

function requireSnapshot(snapshot: GameSnapshot | null, sessionId: string): GameSnapshot {
  if (!snapshot) throw new Error(`Game session not found: ${sessionId}`)
  return snapshot
}

function questionFrom(snapshot: GameSnapshot) {
  const index = snapshot.state.currentQuestionIndex
  if (index === null || !snapshot.quiz.questions[index]) throw new Error('The game has no current question')
  return snapshot.quiz.questions[index]
}

export class GameService {
  private readonly introDurationMs?: number
  private readonly answerDurationMs?: number
  private readonly listeners = new Set<Listener>()
  private readonly timers = new Map<string, ReturnType<typeof setTimeout>>()
  private readonly previousRanks = new Map<string, Map<string, number>>()
  private readonly completedSessions = new Set<string>()
  private readonly resultRepository: FinalResultsRepository
  private readonly immediateRankForTest: boolean

  constructor(options: GameServiceOptions = {}) {
    this.introDurationMs = options.introDurationMs
    this.answerDurationMs = options.answerDurationMs
    this.immediateRankForTest = options.introDurationMs !== undefined || options.answerDurationMs !== undefined
    this.resultRepository = options.resultRepository ?? { persistFinalResults }
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  async getSnapshot(sessionId: string): Promise<GameSnapshot | null> { return getSnapshot(sessionId) }

  async sessionIdForPin(pin: string): Promise<string | null> { return getRedis().get(gameKeys.pin(pin)) }

  async joinPlayer(pin: string, nickname: string, playerToken?: string): Promise<{ sessionId: string; player: LivePlayer; snapshot: GameSnapshot; playerToken: string }> {
    const sessionId = await this.sessionIdForPin(pin)
    if (!sessionId) throw new Error('Game PIN is invalid or expired')
    const current = requireSnapshot(await getSnapshot(sessionId), sessionId)
    if (playerToken) {
      const playerId = await getRedis().get(gameKeys.playerCapability(sessionId, playerToken))
      const player = playerId ? current.players.find((candidate) => candidate.id === playerId) : undefined
      if (player) {
        await getRedis().expire(gameKeys.playerCapability(sessionId, playerToken), ACTIVE_SESSION_TTL_SECONDS)
        return { sessionId, player, snapshot: current, playerToken }
      }
    }
    const player = await joinSession(pin, nickname)
    const snapshot = requireSnapshot(await getSnapshot(sessionId), sessionId)
    const newPlayerToken = randomUUID()
    await getRedis().set(gameKeys.playerCapability(sessionId, newPlayerToken), player.id, 'EX', ACTIVE_SESSION_TTL_SECONDS)
    return { sessionId, player, snapshot, playerToken: newPlayerToken }
  }

  async verifyHost(sessionId: string, hostToken: string): Promise<boolean> { return verifyHostCapability(sessionId, hostToken) }

  async submitPlayerAnswer(sessionId: string, playerId: string, questionId: string, choiceId: string): Promise<SubmitAnswerResult> {
    const snapshot = requireSnapshot(await getSnapshot(sessionId), sessionId)
    return submitAnswer({ pin: snapshot.state.pin, playerId, questionId, choiceId })
  }

  async startGame(sessionId: string): Promise<GameServiceEvent> {
    const snapshot = requireSnapshot(await getSnapshot(sessionId), sessionId)
    if (!snapshot.quiz.questions.length) throw new Error('Game needs at least one question')
    const openedAt = Date.now()
    const timing = snapshot.timing ?? snapshot.quiz.timing ?? DEFAULT_TIMING
    const deadlineAt = openedAt + (this.introDurationMs ?? timing.introDurationSeconds * 1_000)
    const state = await transitionGameState(sessionId, 'lobby', { phase: 'question-intro', currentQuestionIndex: 0, openedAt, deadlineAt })
    if (!state) throw new Error('Game can only start from the lobby')
    return this.publishIntro(sessionId)
  }

  async openQuestion(sessionId: string): Promise<GameServiceEvent> {
    const snapshot = requireSnapshot(await getSnapshot(sessionId), sessionId)
    const question = questionFrom(snapshot)
    const openedAt = Date.now()
    const timing = snapshot.timing ?? snapshot.quiz.timing ?? DEFAULT_TIMING
    const deadlineAt = openedAt + (this.answerDurationMs ?? timing.answerDurationSeconds * 1_000)
    const state = await transitionGameState(sessionId, 'question-intro', { phase: 'answering', openedAt, deadlineAt })
    if (!state) throw new Error('Question can only open after its introduction')
    this.previousRanks.set(sessionId, new Map(snapshot.players.map((player) => [player.id, player.rank])))
    const event: GameServiceEvent = { type: 'question:open', sessionId, questionId: question.id, openedAt, deadlineAt }
    this.publish(event)
    this.schedule(sessionId, Math.max(0, deadlineAt - Date.now()), () => this.revealQuestion(sessionId))
    return event
  }

  async revealQuestion(sessionId: string): Promise<{ events: GameServiceEvent[] }> {
    const beforeClose = requireSnapshot(await getSnapshot(sessionId), sessionId)
    const question = questionFrom(beforeClose)
    const result = await closeQuestion(sessionId)
    if (!result.closed) throw new Error('Question can only be revealed while accepting answers')
    const snapshot = requireSnapshot(result.snapshot, sessionId)
    const answers = snapshot.answers[question.id]
    const correctChoice = question.choices.find((choice) => choice.isCorrect)
    if (!correctChoice) throw new Error(`Question ${question.id} has no correct choice`)
    const revealOpenedAt = Date.now()
    const revealDeadlineAt = revealOpenedAt + (beforeClose.timing ?? beforeClose.quiz.timing ?? DEFAULT_TIMING).revealDurationSeconds * 1_000
    const reveal: GameServiceEvent = {
      type: 'question:reveal', sessionId, questionId: question.id, correctChoiceId: correctChoice.id,
      choiceCounts: answers?.choiceCounts ?? {}, revealImageUrl: question.revealImageUrl, explanation: question.explanation, openedAt: revealOpenedAt, deadlineAt: revealDeadlineAt,
    }
    this.publish(reveal)
    const revealState = await transitionGameState(sessionId, 'reveal', { openedAt: revealOpenedAt, deadlineAt: revealDeadlineAt })
    if (!revealState) throw new Error('Question reveal was superseded')
    this.schedule(sessionId, Math.max(0, revealDeadlineAt - Date.now()), () => this.publishRankings(sessionId, question.id))
    if (this.immediateRankForTest) {
      const ranked = await this.publishRankings(sessionId, question.id)
      return { events: [reveal, ...ranked] }
    }
    return { events: [reveal] }
  }

  private async publishRankings(sessionId: string, questionId: string, previousRanks?: Map<string, number>): Promise<GameServiceEvent[]> {
    const snapshot = requireSnapshot(await getSnapshot(sessionId), sessionId)
    const question = snapshot.quiz.questions.find((candidate) => candidate.id === questionId)
    if (!question) return []
    const answers = snapshot.answers[question.id]
    const prior = previousRanks ?? this.previousRanks.get(sessionId) ?? new Map(snapshot.players.map((player, index) => [player.id, index + 1]))
    const rankEvents: GameServiceEvent[] = snapshot.players.map((player, index) => ({
      type: 'score:rank-update', sessionId, playerId: player.id,
      correct: (answers?.playerAnswers[player.id]?.earnedScore ?? 0) > 0, earnedScore: answers?.playerAnswers[player.id]?.earnedScore ?? 0,
      totalScore: player.score, previousRank: prior.get(player.id) ?? index + 1, rank: index + 1,
    }))
    for (const event of rankEvents) this.publish(event)
    const rankedState = await transitionGameState(sessionId, 'reveal', { phase: 'score-rank', openedAt: null, deadlineAt: null })
    if (!rankedState) throw new Error('Question reveal was superseded')
    const leaderboard: GameServiceEvent = { type: 'leaderboard:update', sessionId, players: snapshot.players }
    this.publish(leaderboard)
    return [...rankEvents, leaderboard]
  }

  async nextQuestion(sessionId: string): Promise<GameServiceEvent> {
    const snapshot = requireSnapshot(await getSnapshot(sessionId), sessionId)
    const nextIndex = (snapshot.state.currentQuestionIndex ?? -1) + 1
    if (nextIndex >= snapshot.quiz.questions.length) {
      return this.finishGame(sessionId)
    }
    const openedAt = Date.now()
    const timing = snapshot.timing ?? snapshot.quiz.timing ?? DEFAULT_TIMING
    const deadlineAt = openedAt + (this.introDurationMs ?? timing.introDurationSeconds * 1_000)
    const state = await transitionGameState(sessionId, 'score-rank', { phase: 'question-intro', currentQuestionIndex: nextIndex, openedAt, deadlineAt })
    if (!state) throw new Error('The host can only advance after rankings are shown')
    return this.publishIntro(sessionId)
  }

  async finishGame(sessionId: string): Promise<GameServiceEvent> {
    let snapshot = requireSnapshot(await getSnapshot(sessionId), sessionId)
    if (snapshot.state.phase === 'score-rank') {
      const state = await transitionGameState(sessionId, 'score-rank', { phase: 'final-results', openedAt: null, deadlineAt: null })
      if (!state) throw new Error('The host can only advance after rankings are shown')
      snapshot = requireSnapshot(await getSnapshot(sessionId), sessionId)
    } else if (snapshot.state.phase !== 'final-results') {
      throw new Error('The host can only finish after rankings are shown')
    }
    const answers = snapshot.quiz.questions.flatMap((question) => Object.entries(snapshot.answers[question.id]?.playerAnswers ?? {}).map(([playerId, answer]) => ({
      playerId, questionId: question.id, choiceId: answer.choiceId, score: answer.earnedScore, answeredAt: answer.answeredAt,
    })))
    if (!this.completedSessions.has(sessionId)) {
      await this.resultRepository.persistFinalResults({
        sessionId, quizId: snapshot.state.quizId, pin: snapshot.state.pin,
        players: snapshot.players.map((player) => ({ id: player.id, nickname: player.nickname, finalScore: player.score, finalRank: player.rank })), answers,
      })
      this.completedSessions.add(sessionId)
    }
    await expireSession(sessionId)
    const event: GameServiceEvent = { type: 'game:final-results', sessionId, players: snapshot.players }
    this.publish(event)
    return event
  }

  private async publishIntro(sessionId: string): Promise<GameServiceEvent> {
    const snapshot = requireSnapshot(await getSnapshot(sessionId), sessionId)
    const question = questionFrom(snapshot)
    const event: GameServiceEvent = { type: 'question:intro', sessionId, questionId: question.id, questionIndex: question.position, body: question.body, questionImageUrl: question.questionImageUrl, openedAt: snapshot.state.openedAt ?? Date.now(), deadlineAt: snapshot.state.deadlineAt ?? Date.now() }
    this.publish(event)
    this.schedule(sessionId, Math.max(0, (snapshot.state.deadlineAt ?? Date.now()) - Date.now()), () => this.openQuestion(sessionId))
    return event
  }

  private publish(event: GameServiceEvent): void { for (const listener of Array.from(this.listeners)) listener(event) }

  private schedule(sessionId: string, delayMs: number, callback: () => Promise<unknown>): void {
    const existing = this.timers.get(sessionId)
    if (existing) clearTimeout(existing)
    const timer = setTimeout(() => { this.timers.delete(sessionId); void callback().catch(() => undefined) }, delayMs)
    timer.unref?.()
    this.timers.set(sessionId, timer)
  }

  async reschedule(sessionId: string): Promise<void> {
    const snapshot = await getSnapshot(sessionId)
    if (!snapshot || !snapshot.state.deadlineAt) return
    if (snapshot.state.phase === 'question-intro') {
      this.schedule(sessionId, Math.max(0, snapshot.state.deadlineAt - Date.now()), () => this.openQuestion(sessionId))
    } else if (snapshot.state.phase === 'answering') {
      this.schedule(sessionId, Math.max(0, snapshot.state.deadlineAt - Date.now()), () => this.revealQuestion(sessionId))
    } else if (snapshot.state.phase === 'reveal') {
      this.schedule(sessionId, Math.max(0, snapshot.state.deadlineAt - Date.now()), () => this.publishRankings(sessionId, questionFrom(snapshot).id))
    }
  }

  async restoreTimers(): Promise<void> {
    const redis = getRedis()
    let cursor = '0'
    do {
      const [next, keys] = await redis.scan(cursor, 'MATCH', 'game:*:state', 'COUNT', 100)
      cursor = next
      await Promise.all(keys.map((key) => this.reschedule(key.split(':')[1])))
    } while (cursor !== '0')
  }
}
