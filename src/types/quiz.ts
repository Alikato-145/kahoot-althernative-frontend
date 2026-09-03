export type QuizTiming = { introDurationSeconds: number; answerDurationSeconds: number; revealDurationSeconds: number }
export const defaultQuizTiming: QuizTiming = { introDurationSeconds: 5, answerDurationSeconds: 20, revealDurationSeconds: 4 }
export type Choice = { id: string; position: number; body: string; isCorrect: boolean }
export type Question = { id: string; position: number; body: string; questionImageUrl: string | null; revealImageUrl: string | null; explanation: string | null; choices: Choice[] }
export type Quiz = { id: string; title: string; description: string; coverImageUrl: string | null; timing?: QuizTiming; questions: Question[] }
export type QuizInput = { title: string; description: string; coverImageUrl?: string | null; timing?: QuizTiming; questions: Array<{ id?: string; body: string; questionImageUrl?: string | null; revealImageUrl?: string | null; explanation?: string | null; choices: Array<{ id?: string; body: string; isCorrect: boolean }> }> }
