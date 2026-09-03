'use client'

import React, { useEffect, useMemo, useState } from 'react'
import type { GameSnapshot, LivePlayer } from '@/server/game/types'
import type { Question } from '@/server/repositories/quizzes'
import { getGameSocket } from '@/lib/socket'
import { GameShell } from '@/components/ui/GameShell'
import { HostLobby } from './HostLobby'
import { HostQuestion } from './HostQuestion'
import { HostReveal, type HostRevealPayload } from './HostReveal'
import { RankMotion } from './RankMotion'
import { FinalLeaderboard } from './FinalLeaderboard'
import { QuestionIntro } from './QuestionIntro'

type RevealEvent = HostRevealPayload & { questionId: string }
export type HostQuestionState = { questionId: string | null; openedAt: number | null; deadlineAt: number | null; answerCount: number }
export type HostQuestionEvent =
  | { type: 'question:open'; questionId: string; openedAt: number; deadlineAt: number }
  | { type: 'question:answer-progress'; questionId: string; answerCount: number }

export function hostTiming(event: { openedAt?: unknown; deadlineAt?: unknown }, durationMs: number, now = Date.now()): { openedAt: number; deadlineAt: number } {
  return typeof event.openedAt === 'number' && typeof event.deadlineAt === 'number' && event.deadlineAt > event.openedAt
    ? { openedAt: event.openedAt, deadlineAt: event.deadlineAt }
    : { openedAt: now, deadlineAt: now + durationMs }
}

/** Applies the only two safe live question updates received by the projected Host. */
export function applyHostQuestionEvent(current: HostQuestionState, event: HostQuestionEvent): HostQuestionState {
  if (event.questionId !== current.questionId) return current
  if (event.type === 'question:open') return { ...current, openedAt: event.openedAt, deadlineAt: event.deadlineAt }
  return { ...current, answerCount: event.answerCount }
}
export function applyHostRankUpdate(players: LivePlayer[], update: { playerId: string; totalScore: number; rank: number }): LivePlayer[] {
  return players.map((player) => player.id === update.playerId ? { ...player, score: update.totalScore, rank: update.rank } : player)
    .sort((left, right) => left.rank - right.rank || right.score - left.score || left.id.localeCompare(right.id))
}
export function leaderboardPlayers(payload: { players: LivePlayer[] }): LivePlayer[] { return payload.players }
export function HostScoreboard({ players, final }: { players: LivePlayer[]; final: boolean }) {
  if (final) return <FinalLeaderboard players={players} />
  return <section aria-label="คะแนนรอบนี้" className="mx-auto flex w-full max-w-3xl flex-col gap-5 py-8 text-center text-white"><h2 className="text-4xl font-black">ตารางคะแนนรอบนี้</h2><RankMotion players={players} /></section>
}
export function playerJoinUrl(pin: string, origin: string): string { return `${origin.replace(/\/$/, '')}/join?pin=${encodeURIComponent(pin)}` }

export function HostGame({ sessionId, hostToken }: { sessionId: string; hostToken: string }) {
  const [snapshot, setSnapshot] = useState<GameSnapshot | null>(null)
  const [phase, setPhase] = useState<GameSnapshot['state']['phase']>('lobby')
  const [questionId, setQuestionId] = useState<string | null>(null)
  const [questionState, setQuestionState] = useState<HostQuestionState>({ questionId: null, openedAt: null, deadlineAt: null, answerCount: 0 })
  const [reveal, setReveal] = useState<RevealEvent | null>(null)
  const [players, setPlayers] = useState<LivePlayer[]>([])
  const [rankBroadcast, setRankBroadcast] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const socket = getGameSocket()
    const join = () => socket.emit('host:join', { sessionId, hostToken })
    const onState = (next: GameSnapshot) => { setSnapshot(next); setPlayers(next.players); setPhase(next.state.phase); const index = next.state.currentQuestionIndex; const id = index === null ? null : next.quiz.questions[index]?.id ?? null; setQuestionId(id); setQuestionState({ questionId: id, openedAt: next.state.openedAt, deadlineAt: next.state.deadlineAt, answerCount: id ? Object.keys(next.answers[id]?.playerAnswers ?? {}).length : 0 }); setRankBroadcast(next.state.phase === 'score-rank') }
    const onLobby = (next: LivePlayer[]) => setPlayers(next)
    const onIntro = (event: { questionId: string; openedAt?: number; deadlineAt?: number }) => { const timing = hostTiming(event, 5_000); setQuestionId(event.questionId); setQuestionState({ questionId: event.questionId, ...timing, answerCount: 0 }); setPhase('question-intro'); setReveal(null); setRankBroadcast(false) }
    const onOpen = (event: { questionId: string; openedAt?: number; deadlineAt?: number }) => { const timing = hostTiming(event, 20_000); setQuestionId(event.questionId); setQuestionState((current) => applyHostQuestionEvent(current.questionId === event.questionId ? current : { questionId: event.questionId, openedAt: null, deadlineAt: null, answerCount: 0 }, { type: 'question:open', questionId: event.questionId, ...timing })); setPhase('answering') }
    const onAnswerProgress = (event: Extract<HostQuestionEvent, { type: 'question:answer-progress' }>) => setQuestionState((current) => applyHostQuestionEvent(current, event))
    const onReveal = (next: RevealEvent) => { setQuestionId(next.questionId); setReveal(next); setPhase('reveal') }
    const onRank = (next: { playerId: string; totalScore: number; rank: number }) => setPlayers((current) => applyHostRankUpdate(current, next))
    const onRanks = (next: { players: LivePlayer[] }) => { setPlayers(leaderboardPlayers(next)); setPhase('score-rank'); setRankBroadcast(true) }
    const onFinal = ({ players: next }: { players: LivePlayer[] }) => { setPlayers(next); setPhase('final-results'); setRankBroadcast(false) }
    const onError = ({ message }: { message: string }) => setError(message)
    socket.on('connect', join).on('game:state', onState).on('lobby:players', onLobby).on('question:intro', onIntro).on('question:open', onOpen).on('question:answer-progress', onAnswerProgress).on('question:reveal', onReveal).on('score:rank-update', onRank).on('leaderboard:update', onRanks).on('game:final-results', onFinal).on('game:error', onError)
    if (socket.connected) join()
    return () => { socket.off('connect', join).off('game:state', onState).off('lobby:players', onLobby).off('question:intro', onIntro).off('question:open', onOpen).off('question:answer-progress', onAnswerProgress).off('question:reveal', onReveal).off('score:rank-update', onRank).off('leaderboard:update', onRanks).off('game:final-results', onFinal).off('game:error', onError) }
  }, [hostToken, sessionId])

  const question = useMemo<Question | undefined>(() => snapshot?.quiz.questions.find((candidate) => candidate.id === questionId), [snapshot, questionId])
  if (error) return <GameShell><p role="alert">{error}</p></GameShell>
  if (!snapshot) return <GameShell><p role="status">กำลังเชื่อมต่อหน้าจอผู้จัดเกม…</p></GameShell>
  const playerUrl = playerJoinUrl(snapshot.state.pin, typeof window === 'undefined' ? '' : window.location.origin)
  const controls = phase === 'lobby' ? undefined : phase === 'answering' ? <button className="rounded-xl bg-white px-6 py-3 text-xl font-black text-purple-950" type="button" onClick={() => getGameSocket().emit('host:reveal')}>ปิดรับคำตอบ / ดูเฉลย</button> : rankBroadcast ? <button className="rounded-xl bg-white px-6 py-3 text-xl font-black text-purple-950" type="button" onClick={() => getGameSocket().emit('host:next')}>ข้อต่อไป</button> : undefined
  return <GameShell header={<div className="flex items-center justify-between gap-4"><span className="font-black">{snapshot.quiz.title}</span>{controls}</div>}>
    {phase === 'lobby' ? <HostLobby pin={snapshot.state.pin} playerUrl={playerUrl} players={players} onStart={() => getGameSocket().emit('host:start')} /> : phase === 'question-intro' ? <QuestionIntro openedAt={questionState.openedAt} deadlineAt={questionState.deadlineAt} /> : phase === 'final-results' ? <HostScoreboard players={players} final /> : phase === 'score-rank' ? <HostScoreboard players={players} final={false} /> : question && phase === 'reveal' && reveal ? <HostReveal question={question} reveal={reveal} /> : question ? <HostQuestion question={question} openedAt={questionState.openedAt} deadlineAt={questionState.deadlineAt} answerCount={questionState.answerCount} /> : <p role="status">กำลังรอคำถาม…</p>}
  </GameShell>
}
