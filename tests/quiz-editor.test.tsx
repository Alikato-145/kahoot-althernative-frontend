import { describe, expect, it } from 'vitest'
import { emptyQuiz, persistPendingImages, validateQuizForSubmission } from '@/components/quiz-editor/QuizEditor'
import { canUploadImages } from '@/components/quiz-editor/ImageUpload'
import { toHostGamePath } from '@/lib/api'

describe('QuizEditor submission contract', () => {
  it('does not submit until a question has four choices and one correct choice', () => {
    expect(validateQuizForSubmission({ ...emptyQuiz, title: 'ค่าย' })).toBe('แต่ละข้อมี 4 คำตอบ และต้องเลือกคำตอบที่ถูก 1 ข้อ')
  })

  it('keeps an uploaded image URL in the submitted payload', () => {
    const quiz = {
      title: 'ค่าย', description: '', questions: [{
        body: 'คำถาม', questionImageUrl: '/media/quizzes/q1/question.webp', revealImageUrl: null, explanation: '',
        choices: [
          { body: 'ก', isCorrect: true }, { body: 'ข', isCorrect: false },
          { body: 'ค', isCorrect: false }, { body: 'ง', isCorrect: false },
        ],
      }],
    }
    expect(validateQuizForSubmission(quiz)).toBeNull()
    expect(quiz.questions[0].questionImageUrl).toBe('/media/quizzes/q1/question.webp')
  })

  it('uses a durable quiz ID only for immediate media uploads', () => {
    expect(emptyQuiz.id).toBeUndefined()
    expect(canUploadImages(emptyQuiz.id)).toBe(false)
    expect(canUploadImages('8d3a0f50-fcb4-4ac4-8bf2-eab80d043da8')).toBe(true)
  })

  it('uploads images selected before first save and includes their URLs in the follow-up update', async () => {
    const quiz = {
      title: 'ค่าย', description: '', questions: [{
        body: 'คำถาม', questionImageUrl: null, revealImageUrl: null, explanation: '',
        choices: [{ body: 'ก', isCorrect: true }, { body: 'ข', isCorrect: false }, { body: 'ค', isCorrect: false }, { body: 'ง', isCorrect: false }],
      }],
    }
    const pending = new Map([['0:questionImageUrl', { questionIndex: 0, field: 'questionImageUrl' as const, file: {} as File }]])
    const upload = async (quizId: string, file: File) => {
      expect(quizId).toBe('quiz-1'); expect(file).toBe(pending.get('0:questionImageUrl')?.file)
      return '/media/quizzes/quiz-1/question.webp'
    }

    await expect(persistPendingImages('quiz-1', quiz, pending, upload)).resolves.toMatchObject({
      questions: [{ questionImageUrl: '/media/quizzes/quiz-1/question.webp' }],
    })
  })

  it('preserves the host capability when navigating to a new game', () => {
    expect(toHostGamePath('https://quiz.example/host/game/session-1?hostToken=capability')).toBe('/host/game/session-1?hostToken=capability')
  })
})
