import React from 'react'
import { TimeBar } from '@/components/ui/TimeBar'

/** Neutral transition screen: question text and media stay hidden until answering opens. */
export function QuestionIntro({ openedAt, deadlineAt }: { openedAt?: number | null; deadlineAt?: number | null }) {
  return <section aria-label="กำลังเตรียมคำถาม" className="flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center">
    <p className="text-2xl font-black sm:text-4xl">เตรียมตัว…</p>
    <p className="text-lg text-purple-200">คำถามกำลังจะเริ่ม</p>
    {openedAt && deadlineAt ? <TimeBar openedAt={openedAt} deadlineAt={deadlineAt} /> : null}
  </section>
}
