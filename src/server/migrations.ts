import 'dotenv/config'
import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { RowDataPacket } from 'mysql2'
import { getPool, transaction } from './db'

const migrationDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../database/migrations')

type MigrationExecutor = {
  query(sql: string, values?: unknown[]): Promise<unknown>
}

type MigrationTransaction = <T>(work: (connection: MigrationExecutor) => Promise<T>) => Promise<T>

export type MigrationOptions = {
  pool?: MigrationExecutor
  runInTransaction?: MigrationTransaction
}

export function splitSqlStatements(sql: string): string[] {
  const statements: string[] = []
  let statement = ''
  let quote: "'" | '"' | '`' | undefined
  let lineComment = false
  let blockComment = false

  for (let index = 0; index < sql.length; index += 1) {
    const character = sql[index]
    const nextCharacter = sql[index + 1]

    if (lineComment) {
      statement += character
      if (character === '\n') lineComment = false
      continue
    }

    if (blockComment) {
      statement += character
      if (character === '*' && nextCharacter === '/') {
        statement += nextCharacter
        index += 1
        blockComment = false
      }
      continue
    }

    if (quote) {
      statement += character
      if (character === '\\' && nextCharacter) {
        statement += nextCharacter
        index += 1
      } else if (character === quote) {
        if (nextCharacter === quote) {
          statement += nextCharacter
          index += 1
        } else {
          quote = undefined
        }
      }
      continue
    }

    if (character === '-' && nextCharacter === '-') {
      statement += character + nextCharacter
      index += 1
      lineComment = true
      continue
    }

    if (character === '/' && nextCharacter === '*') {
      statement += character + nextCharacter
      index += 1
      blockComment = true
      continue
    }

    if (character === "'" || character === '"' || character === '`') {
      quote = character
      statement += character
    } else if (character === ';') {
      const trimmed = statement.trim()
      if (trimmed) statements.push(trimmed)
      statement = ''
    } else {
      statement += character
    }
  }

  const trimmed = statement.trim()
  if (trimmed) statements.push(trimmed)
  return statements
}

export async function runMigrations(options: MigrationOptions = {}): Promise<string[]> {
  const pool = options.pool ?? getPool()
  const runInTransaction: MigrationTransaction = options.runInTransaction ?? (async (work) => transaction(work))
  await pool.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    filename VARCHAR(255) PRIMARY KEY,
    executed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`)

  const files = (await readdir(migrationDirectory)).filter((file) => file.endsWith('.sql')).sort()
  const [rows] = await pool.query('SELECT filename FROM schema_migrations') as [Array<RowDataPacket & { filename: string }>]
  const executed = new Set(rows.map((row) => row.filename))
  const applied: string[] = []

  for (const filename of files) {
    if (executed.has(filename)) continue
    const sql = await readFile(path.join(migrationDirectory, filename), 'utf8')
    await runInTransaction(async (connection) => {
      for (const statement of splitSqlStatements(sql)) {
        await connection.query(statement)
      }
      await connection.query('INSERT INTO schema_migrations (filename) VALUES (?)', [filename])
    })
    applied.push(filename)
  }
  return applied
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runMigrations()
    .then((applied) => console.log(applied.length ? `Applied migrations: ${applied.join(', ')}` : 'No migrations to run.'))
    .then(() => getPool().end())
    .catch(async (error) => {
      console.error(error)
      await getPool().end()
      process.exitCode = 1
    })
}
