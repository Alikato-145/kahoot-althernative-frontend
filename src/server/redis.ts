import Redis from 'ioredis'
import { loadConfig } from './config'

export const ACTIVE_SESSION_TTL_SECONDS = 12 * 60 * 60
export const FINAL_SESSION_TTL_SECONDS = 30 * 60

export const gameKeys = {
  pin: (pin: string) => `game:pin:${pin}`,
  state: (sessionId: string) => `game:${sessionId}:state`,
  quiz: (sessionId: string) => `game:${sessionId}:quiz`,
  players: (sessionId: string) => `game:${sessionId}:players`,
  leaderboard: (sessionId: string) => `game:${sessionId}:leaderboard`,
  scoreTimes: (sessionId: string) => `game:${sessionId}:score-times`,
  hostCapability: (sessionId: string) => `game:${sessionId}:host-capability`,
  playerCapability: (sessionId: string, token: string) => `game:${sessionId}:player-capability:${token}`,
  answers: (sessionId: string, questionId: string) => `game:${sessionId}:answers:${questionId}`,
  sessionPattern: (sessionId: string) => `game:${sessionId}:*`,
}

let redis: Redis | undefined

export function getRedis(): Redis {
  redis ??= new Redis(loadConfig().redisUrl, { maxRetriesPerRequest: null })
  return redis
}

export async function closeRedis(): Promise<void> {
  if (!redis) return
  const client = redis
  redis = undefined
  await client.quit()
}
