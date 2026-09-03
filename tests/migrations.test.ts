import { describe, expect, it } from 'vitest'
import { runMigrations, splitSqlStatements } from '@/server/migrations'

process.env.DATABASE_URL ??= 'mysql://campquiz:campquiz@localhost:3306/camp_quiz'
process.env.REDIS_URL ??= 'redis://localhost:6379'

describe('migration SQL parsing', () => {
  it('keeps semicolons inside quoted SQL text and returns executable statements', () => {
    expect(splitSqlStatements("CREATE TABLE example (body TEXT); INSERT INTO example VALUES ('a; b');")).toEqual([
      'CREATE TABLE example (body TEXT)',
      "INSERT INTO example VALUES ('a; b')",
    ])
  })

  it('does not split on a semicolon inside SQL comments', () => {
    expect(splitSqlStatements('-- semicolon; in comment\nCREATE TABLE example (id INT); /* another; comment */ INSERT INTO example VALUES (1);')).toEqual([
      '-- semicolon; in comment\nCREATE TABLE example (id INT)',
      '/* another; comment */ INSERT INTO example VALUES (1)',
    ])
  })
})

describe('migration runner', () => {
  it('does not rerun an applied migration', async () => {
    const executed = new Set<string>()
    const connection = {
      query: async (sql: string, values: unknown[] = []) => {
        if (sql.startsWith('INSERT INTO schema_migrations')) executed.add(String(values[0]))
        return [[]]
      },
    }
    const pool = {
      query: async (sql: string) => {
        if (sql.startsWith('SELECT filename')) return [Array.from(executed).map((filename) => ({ filename }))]
        return [[]]
      },
    }
    const runInTransaction = async <T>(work: (executor: typeof connection) => Promise<T>) => work(connection)

    await expect(runMigrations({ pool, runInTransaction })).resolves.toEqual(['001_initial_schema.sql', '002_allow_reused_game_pins.sql'])
    await expect(runMigrations({ pool, runInTransaction })).resolves.toEqual([])
  })
})
