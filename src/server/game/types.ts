import type { Quiz, QuizTiming } from '../repositories/quizzes'

export type GamePhase = 'lobby' | 'question-intro' | 'answering' | 'reveal' | 'score-rank' | 'final-results'

export type GameState = {
  sessionId: string
  quizId: string
  pin: string
  phase: GamePhase
  currentQuestionIndex: number | null
  openedAt: number | null
  deadlineAt: number | null
  timing: QuizTiming
}

export type LivePlayer = { id: string; nickname: string; score: number; rank: number }
export type AnswerRecord = { choiceId: string; earnedScore: number; elapsedMs: number; answeredAt: number }
export type QuestionAnswers = { playerAnswers: Record<string, AnswerRecord>; choiceCounts: Record<string, number> }
export type GameSnapshot = { state: GameState; quiz: Quiz; timing: QuizTiming; players: LivePlayer[]; answers: Record<string, QuestionAnswers> }
export type Session = { id: string; pin: string; hostToken: string }
export type SubmitAnswerInput = { pin: string; playerId: string; questionId: string; choiceId: string }
export type SubmitAnswerResult = { accepted: true; earnedScore: number } | { accepted: false }
