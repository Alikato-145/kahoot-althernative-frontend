import mysql, { type Pool, type PoolConnection, type ResultSetHeader, type RowDataPacket } from 'mysql2/promise'
import { loadConfig } from './config'

let pool: Pool | undefined

export function getPool(): Pool {
  pool ??= mysql.createPool({ uri: loadConfig().databaseUrl, connectionLimit: 10 })
  return pool
}

export async function query<T extends RowDataPacket[] | ResultSetHeader>(sql: string, values: unknown[] = []): Promise<T> {
  const [result] = await getPool().query<T>(sql, values)
  return result
}

export async function transaction<T>(work: (connection: PoolConnection) => Promise<T>): Promise<T> {
  const connection = await getPool().getConnection()
  try {
    await connection.beginTransaction()
    const result = await work(connection)
    await connection.commit()
    return result
  } catch (error) {
    await connection.rollback()
    throw error
  } finally {
    connection.release()
  }
}
