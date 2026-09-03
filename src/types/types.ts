/** Temporary legacy page contracts; live pages are replaced by the MySQL/Socket.IO tasks. */
export const legacyBackend = {} as any

export type Participant = { id: string; game_id: string; nickname: string; user_id: string; created_at: string }

export type Choice = { id: string; question_id: string; body: string; is_correct: boolean; created_at: string }

export type Question = { id: string; quiz_set_id: string; body: string; image_url: string | null; order: number; created_at: string } & {
  choices: Choice[]
}

export type QuizSet = { id: string; name: string; description: string | null; created_at: string } & {
  questions: Question[]
}

export type Answer = { id: string; participant_id: string; question_id: string; choice_id: string | null; score: number; created_at: string }

export type Game = { id: string; quiz_set_id: string; host_user_id: string | null; current_question_sequence: number; is_answer_revealed: boolean; phase: string; created_at: string }

export type GameResult = { game_id: string | null; nickname: string | null; participant_id: string | null; total_score: number | null }
