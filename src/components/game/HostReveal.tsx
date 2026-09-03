'use client'

import React from 'react'
import type { Question } from '@/server/repositories/quizzes'
import { QuestionMedia } from '@/components/ui/QuestionMedia'
import { TimeBar } from '@/components/ui/TimeBar'

export type HostRevealPayload = {
  correctChoiceId: string
  choiceCounts: Record<string, number>
  revealImageUrl: string | null
  explanation: string | null
  openedAt?: number
  deadlineAt?: number
}

export function HostReveal({ question, reveal }: { question: Question; reveal: HostRevealPayload }) {
  const total = Object.values(reveal.choiceCounts).reduce((sum, count) => sum + count, 0)
  return <section aria-label="เฉลยคำถาม" className="space-y-6 text-center">
    {typeof reveal.openedAt === 'number' && typeof reveal.deadlineAt === 'number' ? <TimeBar openedAt={reveal.openedAt} deadlineAt={reveal.deadlineAt} /> : null}
    <h1 className="text-3xl font-black sm:text-5xl">เฉลย: {question.body}</h1>
    <QuestionMedia src={reveal.revealImageUrl ?? question.revealImageUrl ?? undefined} alt="ภาพเฉลย" className="mx-auto" />
    <div className="grid gap-3 sm:grid-cols-2">
      {question.choices.map((choice, index) => {
        const count = reveal.choiceCounts[choice.id] ?? 0
        const percent = total ? Math.round((count / total) * 100) : 0
        return <article key={choice.id} className={`rounded-xl border-4 p-4 text-left ${choice.id === reveal.correctChoiceId ? 'border-white bg-green-700' : 'border-transparent bg-white/10'}`}>
          <div className="flex justify-between gap-4 font-bold"><span>{index + 1}. {choice.body}</span><span>{count} คน</span></div>
          <div className="mt-3 h-3 overflow-hidden rounded bg-black/25"><div className="h-full rounded bg-white" style={{ width: `${percent}%` }} /></div>
        </article>
      })}
    </div>
    {reveal.explanation ? <p className="mx-auto max-w-4xl whitespace-pre-wrap rounded-2xl bg-white px-6 py-5 text-left text-lg leading-relaxed text-purple-950">{reveal.explanation}</p> : null}
  </section>
}
