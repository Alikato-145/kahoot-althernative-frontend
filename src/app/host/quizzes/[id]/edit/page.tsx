'use client'
import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { QuizEditor } from '@/components/quiz-editor/QuizEditor'
import { quizApi } from '@/lib/api'
import type { Quiz } from '@/types/quiz'

export default function EditQuizPage() {
  const params = useParams<{ id: string }>()
  const [quiz, setQuiz] = useState<Quiz | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => { void quizApi.get(params.id).then(setQuiz).catch((e) => setError(e instanceof Error ? e.message : 'โหลด Quiz ไม่สำเร็จ')) }, [params.id])
  if (error) return <p role="alert" className="p-6 text-red-700">{error}</p>
  if (!quiz) return <p role="status" className="p-6">กำลังโหลด…</p>
  return <QuizEditor initialQuiz={quiz} quizId={quiz.id} />
}
