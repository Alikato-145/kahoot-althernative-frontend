import { randomUUID } from 'node:crypto'
import { transaction } from '../db'

export type PersistedAnswer = { playerId: string; questionId: string; choiceId: string; score: number; answeredAt: number }
export type FinalResultPlayer = { id: string; nickname: string; finalScore: number; finalRank: number }
export type FinalResultsInput = { sessionId: string; quizId: string; pin: string; players: FinalResultPlayer[]; answers: PersistedAnswer[] }

/** Replaces the final projection in one transaction, making retries safe after a process restart. */
export async function persistFinalResults(input: FinalResultsInput): Promise<void> {
  await transaction(async (connection) => {
    await connection.execute(
      `INSERT INTO game_sessions (id, quiz_id, pin, status, started_at, completed_at)
       VALUES (?, ?, ?, 'completed', NOW(), NOW())
       ON DUPLICATE KEY UPDATE status = 'completed', completed_at = COALESCE(completed_at, NOW())`,
      [input.sessionId, input.quizId, input.pin],
    )
    for (const player of input.players) {
      await connection.execute(
        `INSERT INTO game_players (id, session_id, nickname, final_score, final_rank)
         VALUES (?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE nickname = VALUES(nickname), final_score = VALUES(final_score), final_rank = VALUES(final_rank)`,
        [player.id, input.sessionId, player.nickname, player.finalScore, player.finalRank],
      )
    }
    await connection.execute('DELETE FROM game_answers WHERE session_id = ?', [input.sessionId])
    for (const answer of input.answers) {
      await connection.execute(
        'INSERT INTO game_answers (id, session_id, player_id, question_id, choice_id, score, answered_at) VALUES (?, ?, ?, ?, ?, ?, FROM_UNIXTIME(? / 1000))',
        [randomUUID(), input.sessionId, answer.playerId, answer.questionId, answer.choiceId, answer.score, answer.answeredAt],
      )
    }
  })
}
