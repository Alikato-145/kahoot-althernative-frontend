'use client'

import { FormEvent, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { Quiz, QuizInput } from '@/server/repositories/quizzes'
import { quizApi } from '@/lib/api'
import { QuestionEditor } from './QuestionEditor'

export type EditorQuestion = QuizInput['questions'][number]
export type EditorQuiz = { id?: string; title: string; description: string; coverImageUrl?: string | null; timing?: NonNullable<QuizInput['timing']>; questions: EditorQuestion[] }
export type PendingImage = { questionIndex: number; field: 'questionImageUrl' | 'revealImageUrl'; file: File }

const blankQuestion = (): EditorQuestion => ({ body: '', questionImageUrl: null, revealImageUrl: null, explanation: '', choices: Array.from({ length: 4 }, () => ({ body: '', isCorrect: false })) })
export const emptyQuiz: EditorQuiz = { title: '', description: '', coverImageUrl: null, timing: { introDurationSeconds: 5, answerDurationSeconds: 20, revealDurationSeconds: 4 }, questions: [blankQuestion()] }

export function validateQuizForSubmission(quiz: EditorQuiz): string | null {
  if (!quiz.title.trim()) return 'กรุณากรอกชื่อ Quiz'
  const timing = quiz.timing ?? emptyQuiz.timing!
  if (timing.introDurationSeconds < 1 || timing.introDurationSeconds > 30 || timing.answerDurationSeconds < 5 || timing.answerDurationSeconds > 180 || timing.revealDurationSeconds < 1 || timing.revealDurationSeconds > 60) return 'เวลาเกมอยู่นอกช่วงที่กำหนด'
  if (quiz.questions.length === 0 || quiz.questions.some((question) => question.choices.length !== 4 || question.choices.filter((choice) => choice.isCorrect).length !== 1)) return 'แต่ละข้อมี 4 คำตอบ และต้องเลือกคำตอบที่ถูก 1 ข้อ'
  if (quiz.questions.some((question) => !question.body.trim() || question.choices.some((choice) => !choice.body.trim()))) return 'กรุณากรอกคำถามและคำตอบให้ครบ'
  return null
}

function toEditorQuiz(quiz: Quiz): EditorQuiz { return { id: quiz.id, title: quiz.title, description: quiz.description, coverImageUrl: quiz.coverImageUrl, timing: quiz.timing ?? { introDurationSeconds: 5, answerDurationSeconds: 20, revealDurationSeconds: 4 }, questions: quiz.questions.map(({ body, questionImageUrl, revealImageUrl, explanation, choices }) => ({ body, questionImageUrl, revealImageUrl, explanation: explanation ?? '', choices: choices.map(({ body: choiceBody, isCorrect }) => ({ body: choiceBody, isCorrect })) })) } }

export async function persistPendingImages(quizId: string, quiz: EditorQuiz, pendingImages: Map<string, PendingImage>, uploadImage: (quizId: string, file: File) => Promise<string>): Promise<EditorQuiz> {
  let updated = quiz
  for (const { questionIndex, field, file } of Array.from(pendingImages.values())) {
    const url = await uploadImage(quizId, file)
    updated = { ...updated, questions: updated.questions.map((question, index) => index === questionIndex ? { ...question, [field]: url } : question) }
  }
  return updated
}

export function QuizEditor({ initialQuiz, quizId }: { initialQuiz?: Quiz; quizId?: string }) {
  const router = useRouter()
  const [quiz, setQuiz] = useState<EditorQuiz>(initialQuiz ? toEditorQuiz(initialQuiz) : emptyQuiz)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [createdQuizId, setCreatedQuizId] = useState<string | undefined>()
  const [pendingImages, setPendingImages] = useState<Map<string, PendingImage>>(new Map())
  const uploadQuizId = quizId ?? initialQuiz?.id ?? createdQuizId

  function setPendingImage(questionIndex: number, field: PendingImage['field'], file: File | null) {
    const key = `${questionIndex}:${field}`
    setPendingImages((current) => { const next = new Map(current); if (file) next.set(key, { questionIndex, field, file }); else next.delete(key); return next })
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    const validationError = validateQuizForSubmission(quiz)
    if (validationError) { setError(validationError); return }
    setSaving(true); setError(null)
    try {
      const saved = uploadQuizId ? await quizApi.update(uploadQuizId, quiz) : await quizApi.create(quiz)
      if (!uploadQuizId) setCreatedQuizId(saved.id)
      const quizWithImages = await persistPendingImages(saved.id, quiz, pendingImages, quizApi.uploadImage)
      if (pendingImages.size) await quizApi.update(saved.id, quizWithImages)
      setQuiz(quizWithImages); setPendingImages(new Map())
      router.push(`/host/quizzes/${saved.id}/edit`)
      router.refresh()
    } catch (saveError) { setError(saveError instanceof Error ? saveError.message : 'บันทึก Quiz ไม่สำเร็จ') } finally { setSaving(false) }
  }

  return <form onSubmit={(event) => void submit(event)} className="mx-auto max-w-4xl space-y-6 p-6">
    <div><h1 className="text-3xl font-bold">{quizId ? 'แก้ไข Quiz' : 'สร้าง Quiz ใหม่'}</h1><p className="mt-1 text-slate-600">แต่ละคำถามต้องมี 4 ตัวเลือกและคำตอบที่ถูกต้อง 1 ข้อ</p></div>
    {error && <p role="alert" className="rounded bg-red-100 p-3 text-red-800">{error}</p>}
    <label className="block font-medium">ชื่อ Quiz<input className="mt-1 block w-full rounded border p-2" value={quiz.title} onChange={(event) => setQuiz({ ...quiz, title: event.target.value })} required /></label>
    <label className="block font-medium">รายละเอียด<textarea className="mt-1 block w-full rounded border p-2" value={quiz.description} onChange={(event) => setQuiz({ ...quiz, description: event.target.value })} /></label>
    <fieldset className="rounded-2xl border border-purple-100 bg-purple-50 p-4"><legend className="px-2 text-lg font-black text-purple-950">เวลาเกม</legend><div className="grid gap-4 sm:grid-cols-3">
      <label className="block text-sm font-bold text-purple-950">เตรียมคำถาม (วินาที)<input type="number" min={1} max={30} className="mt-1 block w-full rounded border p-2 text-purple-950" value={(quiz.timing ?? emptyQuiz.timing!).introDurationSeconds} onChange={(event) => setQuiz({ ...quiz, timing: { ...(quiz.timing ?? emptyQuiz.timing!), introDurationSeconds: Number(event.target.value) } })} /></label>
      <label className="block text-sm font-bold text-purple-950">เวลาตอบ (วินาที)<input type="number" min={5} max={180} className="mt-1 block w-full rounded border p-2 text-purple-950" value={(quiz.timing ?? emptyQuiz.timing!).answerDurationSeconds} onChange={(event) => setQuiz({ ...quiz, timing: { ...(quiz.timing ?? emptyQuiz.timing!), answerDurationSeconds: Number(event.target.value) } })} /></label>
      <label className="block text-sm font-bold text-purple-950">เวลาเฉลย (วินาที)<input type="number" min={1} max={60} className="mt-1 block w-full rounded border p-2 text-purple-950" value={(quiz.timing ?? emptyQuiz.timing!).revealDurationSeconds} onChange={(event) => setQuiz({ ...quiz, timing: { ...(quiz.timing ?? emptyQuiz.timing!), revealDurationSeconds: Number(event.target.value) } })} /></label>
    </div></fieldset>
    {!uploadQuizId && <p className="rounded bg-amber-50 p-3 text-amber-900">เลือกรูปได้เลย ระบบจะอัปโหลดให้หลังบันทึก Quiz ครั้งแรก</p>}
    {quiz.questions.map((question, index) => <QuestionEditor key={index} question={question} index={index} quizId={uploadQuizId} onPendingImage={(field, file) => setPendingImage(index, field, file)} onChange={(updated) => setQuiz({ ...quiz, questions: quiz.questions.map((item, current) => current === index ? updated : item) })} onRemove={() => setQuiz({ ...quiz, questions: quiz.questions.filter((_, current) => current !== index) })} />)}
    <button type="button" className="rounded bg-slate-200 px-4 py-2" onClick={() => setQuiz({ ...quiz, questions: [...quiz.questions, blankQuestion()] })}>เพิ่มคำถาม</button>
    <div className="flex gap-3"><button type="submit" disabled={saving} className="rounded bg-purple-700 px-5 py-3 font-bold text-white disabled:opacity-50">{saving ? 'กำลังบันทึก…' : 'บันทึก Quiz'}</button><button type="button" className="rounded border px-5 py-3" onClick={() => router.push('/host')}>ยกเลิก</button></div>
  </form>
}
