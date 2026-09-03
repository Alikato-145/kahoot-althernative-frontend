import { z } from 'zod'

const configSchema = z.object({
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),
  MEDIA_ROOT: z.string().min(1).default('./media'),
  PUBLIC_BASE_URL: z.string().url().default('http://localhost:3000'),
  PORT: z.coerce.number().int().positive().default(3000),
})

export type ServerConfig = {
  databaseUrl: string
  redisUrl: string
  mediaRoot: string
  publicBaseUrl: string
  port: number
}

export function loadConfig(input: Record<string, unknown> = process.env): ServerConfig {
  const parsed = configSchema.parse(input)
  return {
    databaseUrl: parsed.DATABASE_URL,
    redisUrl: parsed.REDIS_URL,
    mediaRoot: parsed.MEDIA_ROOT,
    publicBaseUrl: parsed.PUBLIC_BASE_URL,
    port: parsed.PORT,
  }
}
