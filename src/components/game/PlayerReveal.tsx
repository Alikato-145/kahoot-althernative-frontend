import React from 'react'
import type { Question } from '@/server/repositories/quizzes'
import { QuestionMedia } from '@/components/ui/QuestionMedia'
import { TimeBar } from '@/components/ui/TimeBar'

export function PlayerReveal({ question, correctChoiceId, revealImageUrl, explanation, openedAt, deadlineAt }: { question: Question; correctChoiceId: string; revealImageUrl?: string | null; explanation?: string | null; openedAt: number; deadlineAt: number }) {
  const correct = question.choices.find((choice) => choice.id === correctChoiceId)
  return <section aria-label="เฉลยคำถาม" className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center gap-5 p-6 text-center text-white">
    <TimeBar openedAt={openedAt} deadlineAt={deadlineAt} />
    <h1 className="text-3xl font-black">เฉลยคำถาม</h1>
    <QuestionMedia src={revealImageUrl ?? question.revealImageUrl ?? undefined} alt="ภาพเฉลย" className="mx-auto" />
    <p className="rounded-2xl bg-green-600 px-5 py-4 text-2xl font-black">คำตอบที่ถูก: {correct?.body ?? '—'}</p>
    {explanation ? <p className="rounded-2xl bg-white px-5 py-4 text-left text-lg font-medium text-purple-950">{explanation}</p> : null}
    <p className="text-lg font-bold">กำลังคำนวณคะแนน…</p>
  </section>
}
