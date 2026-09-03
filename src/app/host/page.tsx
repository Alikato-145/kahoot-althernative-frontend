'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { Quiz } from '@/server/repositories/quizzes'
import { quizApi, toHostGamePath } from '@/lib/api'

export default function HostDashboard() {
  const router = useRouter()
  const [quizzes, setQuizzes] = useState<Quiz[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  async function load() { try { setLoading(true); setQuizzes(await quizApi.list()) } catch (loadError) { setError(loadError instanceof Error ? loadError.message : 'โหลด Quiz ไม่สำเร็จ') } finally { setLoading(false) } }
  useEffect(() => { void load() }, [])
  async function duplicate(quiz: Quiz) { try { const created = await quizApi.create({ title: `${quiz.title} (สำเนา)`, description: quiz.description, coverImageUrl: quiz.coverImageUrl, timing: quiz.timing, questions: quiz.questions.map(({ body, questionImageUrl, revealImageUrl, explanation, choices }) => ({ body, questionImageUrl, revealImageUrl, explanation, choices: choices.map(({ body: choiceBody, isCorrect }) => ({ body: choiceBody, isCorrect })) })) }); router.push(`/host/quizzes/${created.id}/edit`) } catch (actionError) { setError(actionError instanceof Error ? actionError.message : 'ทำสำเนาไม่สำเร็จ') } }
  async function remove(quiz: Quiz) { if (!window.confirm(`ลบ Quiz “${quiz.title}” หรือไม่?`)) return; try { await quizApi.remove(quiz.id); await load() } catch (actionError) { setError(actionError instanceof Error ? actionError.message : 'ลบ Quiz ไม่สำเร็จ') } }
  async function start(quiz: Quiz) { try { const session = await quizApi.start(quiz.id); router.push(toHostGamePath(session.hostUrl)) } catch (actionError) { setError(actionError instanceof Error ? actionError.message : 'เริ่มเกมไม่สำเร็จ') } }

  return <main className="mx-auto min-h-screen max-w-5xl p-6"><div className="flex items-center justify-between gap-4"><div><h1 className="text-3xl font-bold">Quiz ของฉัน</h1><p className="text-slate-600">สร้าง แก้ไข และเริ่มเกมค่าย</p></div><Link href="/host/quizzes/new" className="rounded bg-purple-700 px-4 py-3 font-bold text-white">สร้าง Quiz ใหม่</Link></div>{error && <p role="alert" className="mt-5 rounded bg-red-100 p-3 text-red-800">{error}</p>}{loading ? <p className="mt-8" role="status">กำลังโหลด…</p> : quizzes.length === 0 ? <p className="mt-8 rounded border border-dashed p-8 text-center">ยังไม่มี Quiz เริ่มสร้าง Quiz แรกของคุณได้เลย</p> : <ul className="mt-6 space-y-3">{quizzes.map((quiz) => <li key={quiz.id} className="flex flex-wrap items-center justify-between gap-3 rounded border p-4"><div><h2 className="font-bold">{quiz.title}</h2><p className="text-sm text-slate-600">{quiz.questions.length} คำถาม</p></div><div className="flex flex-wrap gap-2"><Link className="rounded border px-3 py-2" href={`/host/quizzes/${quiz.id}/edit`}>แก้ไข</Link><button className="rounded border px-3 py-2" onClick={() => void duplicate(quiz)}>ทำสำเนา</button><button className="rounded border px-3 py-2 text-red-700" onClick={() => void remove(quiz)}>ลบ</button><button className="rounded bg-purple-700 px-3 py-2 font-bold text-white" onClick={() => void start(quiz)}>เริ่มเกม</button></div></li>)}</ul>}</main>
}
