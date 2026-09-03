import { notFound } from 'next/navigation'
import { getQuiz } from '@/server/repositories/quizzes'
import { QuizEditor } from '@/components/quiz-editor/QuizEditor'

export default async function EditQuizPage({ params }: { params: { id: string } }) {
  const quiz = await getQuiz(params.id)
  if (!quiz) notFound()
  return <QuizEditor initialQuiz={quiz} quizId={quiz.id} />
}
