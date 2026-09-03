import { randomUUID } from 'node:crypto'
import type { Quiz } from '../repositories/quizzes'
import { ACTIVE_SESSION_TTL_SECONDS, FINAL_SESSION_TTL_SECONDS, gameKeys, getRedis } from '../redis'
import type { AnswerRecord, GamePhase, GameSnapshot, GameState, LivePlayer, QuestionAnswers, Session, SubmitAnswerInput, SubmitAnswerResult } from './types'

type StoredPlayer = { id: string; nickname: string }

const submitAnswerScript = `
local stateValue = redis.call('GET', KEYS[1])
local quizValue = redis.call('GET', KEYS[2])
if not stateValue or not quizValue then return {0, 0} end
local state = cjson.decode(stateValue)
if state.phase ~= 'answering' or not state.deadlineAt then return {0, 0} end
local now = tonumber(ARGV[4])
if now > tonumber(state.deadlineAt) then return {0, 0} end
if redis.call('HEXISTS', KEYS[3], ARGV[1]) == 0 then return {0, 0} end
if redis.call('HEXISTS', KEYS[5], ARGV[1]) == 1 then return {0, 0} end
local quiz = cjson.decode(quizValue)
local index = tonumber(state.currentQuestionIndex)
if not index or not quiz.questions[index + 1] then return {0, 0} end
local question = quiz.questions[index + 1]
if question.id ~= ARGV[2] then return {0, 0} end
local selected
for _, choice in ipairs(question.choices) do
  if choice.id == ARGV[3] then selected = choice break end
end
if not selected then return {0, 0} end
local openedAt = tonumber(state.openedAt) or now
local deadlineMs = math.max(1, tonumber(state.deadlineAt) - openedAt)
local elapsedMs = math.max(0, now - openedAt)
local earnedScore = 0
if selected.isCorrect then
  earnedScore = math.max(0, 1000 - math.floor(1000 * math.min(elapsedMs / deadlineMs, 1) + 0.5))
end
local answer = cjson.encode({choiceId = ARGV[3], earnedScore = earnedScore, elapsedMs = elapsedMs, answeredAt = now})
redis.call('HSET', KEYS[5], ARGV[1], answer)
redis.call('HINCRBY', KEYS[5], 'count:' .. ARGV[3], 1)
redis.call('ZINCRBY', KEYS[4], earnedScore, ARGV[1])
if earnedScore > 0 then redis.call('ZADD', KEYS[6], now, ARGV[1]) end
redis.call('EXPIRE', KEYS[5], tonumber(ARGV[5]))
return {1, earnedScore}
`

const closeQuestionScript = `
local stateValue = redis.call('GET', KEYS[1])
if not stateValue then return 0 end
local state = cjson.decode(stateValue)
if state.phase ~= 'answering' then return 0 end
state.phase = 'reveal'
state.deadlineAt = cjson.null
redis.call('SET', KEYS[1], cjson.encode(state))
return 1
`

const transitionStateScript = `
local stateValue = redis.call('GET', KEYS[1])
if not stateValue then return false end
local state = cjson.decode(stateValue)
if state.phase ~= ARGV[1] then return false end
local patch = cjson.decode(ARGV[2])
for key, value in pairs(patch) do state[key] = value end
redis.call('SET', KEYS[1], cjson.encode(state))
return cjson.encode(state)
`

function parseJson<T>(value: string | null): T | null {
  return value ? JSON.parse(value) as T : null
}

async function sessionKeys(sessionId: string): Promise<string[]> {
  const redis = getRedis()
  let cursor = '0'
  const keys: string[] = []
  do {
    const [nextCursor, found] = await redis.scan(cursor, 'MATCH', gameKeys.sessionPattern(sessionId), 'COUNT', 100)
    cursor = nextCursor
    keys.push(...found)
  } while (cursor !== '0')
  return keys
}

async function touchSession(sessionId: string, ttlSeconds = ACTIVE_SESSION_TTL_SECONDS): Promise<void> {
  const redis = getRedis()
  const state = parseJson<GameState>(await redis.get(gameKeys.state(sessionId)))
  const keys = await sessionKeys(sessionId)
  if (state) keys.push(gameKeys.pin(state.pin))
  if (!keys.length) return
  const pipeline = redis.pipeline()
  for (const key of keys) pipeline.expire(key, ttlSeconds)
  await pipeline.exec()
}

export async function createSession(quiz: Quiz, pin = String(Math.floor(Math.random() * 1_000_000)).padStart(6, '0')): Promise<Session> {
  const redis = getRedis()
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const candidatePin = attempt === 0 ? pin : String(Math.floor(Math.random() * 1_000_000)).padStart(6, '0')
    const id = randomUUID()
    const reserved = await redis.set(gameKeys.pin(candidatePin), id, 'EX', ACTIVE_SESSION_TTL_SECONDS, 'NX')
    if (!reserved) continue
    const hostToken = randomUUID()
    const timing = quiz.timing ?? { introDurationSeconds: 5, answerDurationSeconds: 20, revealDurationSeconds: 4 }
    const state: GameState = { sessionId: id, quizId: quiz.id, pin: candidatePin, phase: 'lobby', currentQuestionIndex: null, openedAt: null, deadlineAt: null, timing }
    await redis.multi()
      .set(gameKeys.state(id), JSON.stringify(state), 'EX', ACTIVE_SESSION_TTL_SECONDS)
      .set(gameKeys.quiz(id), JSON.stringify(quiz), 'EX', ACTIVE_SESSION_TTL_SECONDS)
      .set(gameKeys.hostCapability(id), hostToken, 'EX', ACTIVE_SESSION_TTL_SECONDS)
      .exec()
    return { id, pin: candidatePin, hostToken }
  }
  throw new Error('Unable to reserve a unique game PIN')
}

export async function joinSession(pin: string, nickname: string, playerId: string = randomUUID()): Promise<LivePlayer> {
  const redis = getRedis()
  const sessionId = await redis.get(gameKeys.pin(pin))
  if (!sessionId) throw new Error('Game PIN is invalid or expired')
  const state = parseJson<GameState>(await redis.get(gameKeys.state(sessionId)))
  if (!state || state.phase !== 'lobby') throw new Error('Game has already started')
  const player: StoredPlayer = { id: playerId, nickname }
  await redis.multi()
    .hset(gameKeys.players(sessionId), playerId, JSON.stringify(player))
    .zadd(gameKeys.leaderboard(sessionId), 0, playerId)
    .zadd(gameKeys.scoreTimes(sessionId), Date.now(), playerId)
    .exec()
  await touchSession(sessionId)
  return { ...player, score: 0, rank: 0 }
}

export async function verifyHostCapability(sessionId: string, token: string): Promise<boolean> {
  const capability = await getRedis().get(gameKeys.hostCapability(sessionId))
  return capability !== null && capability === token
}

export async function transitionGameState(
  sessionId: string,
  expectedPhase: GamePhase,
  patch: Partial<Pick<GameState, 'phase' | 'currentQuestionIndex' | 'openedAt' | 'deadlineAt'>>,
): Promise<GameState | null> {
  const redis = getRedis()
  const value = await redis.eval(transitionStateScript, 1, gameKeys.state(sessionId), expectedPhase, JSON.stringify(patch)) as string | null
  if (!value) return null
  await touchSession(sessionId)
  return JSON.parse(value) as GameState
}

export async function setGameState(sessionId: string, patch: Partial<Pick<GameState, 'phase' | 'currentQuestionIndex' | 'openedAt' | 'deadlineAt'>>): Promise<GameState> {
  const redis = getRedis()
  const existing = parseJson<GameState>(await redis.get(gameKeys.state(sessionId)))
  if (!existing) throw new Error(`Game session not found: ${sessionId}`)
  const state = { ...existing, ...patch }
  await redis.set(gameKeys.state(sessionId), JSON.stringify(state))
  await touchSession(sessionId)
  return state
}

export async function submitAnswer(input: SubmitAnswerInput): Promise<SubmitAnswerResult> {
  const redis = getRedis()
  const sessionId = await redis.get(gameKeys.pin(input.pin))
  if (!sessionId) throw new Error('Game PIN is invalid or expired')
  const answerKey = gameKeys.answers(sessionId, input.questionId)
  const result = await redis.eval(submitAnswerScript, 6,
    gameKeys.state(sessionId), gameKeys.quiz(sessionId), gameKeys.players(sessionId), gameKeys.leaderboard(sessionId), answerKey, gameKeys.scoreTimes(sessionId),
    input.playerId, input.questionId, input.choiceId, String(Date.now()), String(ACTIVE_SESSION_TTL_SECONDS),
  ) as [number, number]
  if (Number(result[0]) !== 1) return { accepted: false }
  await touchSession(sessionId)
  return { accepted: true, earnedScore: Number(result[1]) }
}

export async function closeQuestion(sessionId: string): Promise<{ closed: boolean; snapshot: GameSnapshot | null }> {
  const redis = getRedis()
  const closed = Number(await redis.eval(closeQuestionScript, 1, gameKeys.state(sessionId))) === 1
  if (!closed) return { closed: false, snapshot: await getSnapshot(sessionId) }
  await touchSession(sessionId)
  return { closed: true, snapshot: await getSnapshot(sessionId) }
}

export async function getSnapshot(sessionId: string): Promise<GameSnapshot | null> {
  const redis = getRedis()
  const [stateValue, quizValue, playerHash] = await Promise.all([
    redis.get(gameKeys.state(sessionId)), redis.get(gameKeys.quiz(sessionId)), redis.hgetall(gameKeys.players(sessionId)),
  ])
  const state = parseJson<GameState>(stateValue)
  const quiz = parseJson<Quiz>(quizValue)
  if (!state || !quiz) return null
  const players = await Promise.all(Object.values(playerHash).map(async (value) => {
    const player = parseJson<StoredPlayer>(value)!
    const [score, scoreReachedAt] = await Promise.all([
      redis.zscore(gameKeys.leaderboard(sessionId), player.id), redis.zscore(gameKeys.scoreTimes(sessionId), player.id),
    ])
    return { ...player, score: Number(score ?? 0), scoreReachedAt: Number(scoreReachedAt ?? Number.MAX_SAFE_INTEGER) }
  }))
  players.sort((left, right) => right.score - left.score || left.scoreReachedAt - right.scoreReachedAt || left.id.localeCompare(right.id))
  const answers: Record<string, QuestionAnswers> = {}
  for (const question of quiz.questions) {
    const values = await redis.hgetall(gameKeys.answers(sessionId, question.id))
    const playerAnswers: Record<string, AnswerRecord> = {}
    const choiceCounts: Record<string, number> = Object.fromEntries(question.choices.map((choice) => [choice.id, Number(values[`count:${choice.id}`] ?? 0)]))
    for (const [field, value] of Object.entries(values)) if (!field.startsWith('count:')) playerAnswers[field] = JSON.parse(value) as AnswerRecord
    answers[question.id] = { playerAnswers, choiceCounts }
  }
  return { state, quiz, timing: state.timing ?? quiz.timing ?? { introDurationSeconds: 5, answerDurationSeconds: 20, revealDurationSeconds: 4 }, players: players.map(({ scoreReachedAt: _, ...player }, index) => ({ ...player, rank: index + 1 })), answers }
}

export async function expireSession(sessionId: string): Promise<void> {
  await touchSession(sessionId, FINAL_SESSION_TTL_SECONDS)
}

export type { GamePhase }
