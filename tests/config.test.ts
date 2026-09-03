import { expect, it } from 'vitest'
import { loadConfig } from '@/server/config'

it('rejects a missing database URL', () => {
  expect(() => loadConfig({ REDIS_URL: 'redis://localhost:6379' })).toThrow('DATABASE_URL')
})

it('rejects a missing Redis URL', () => {
  expect(() => loadConfig({ DATABASE_URL: 'mysql://localhost/db' })).toThrow('REDIS_URL')
})

it('applies runtime defaults and coerces the port', () => {
  expect(loadConfig({ DATABASE_URL: 'mysql://localhost/db', REDIS_URL: 'redis://localhost:6379', PORT: '4310' })).toMatchObject({
    mediaRoot: './media',
    publicBaseUrl: 'http://localhost:3000',
    port: 4310,
  })
})
