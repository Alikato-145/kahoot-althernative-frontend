import { createServer } from 'node:http'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { io as client, type Socket } from 'socket.io-client'
import { Server } from 'socket.io'
import type { Quiz } from '@/server/repositories/quizzes'
import { closeRedis, getRedis } from '@/server/redis'
import { createSession } from '@/server/game/store'
import { GameService } from '@/server/game/service'
import { registerGameSocketHandlers } from '@/server/socket'

const quiz: Quiz = { id: 'socket-quiz', title: 'ค่าย', description: '', coverImageUrl: null, questions: [{ id: 'socket-q', position: 0, body: 'คำถาม', questionImageUrl: '/media/q.webp', revealImageUrl: null, explanation: null, choices: [
  { id: 'a', position: 0, body: 'A', isCorrect: true }, { id: 'b', position: 1, body: 'B', isCorrect: false }, { id: 'c', position: 2, body: 'C', isCorrect: false }, { id: 'd', position: 3, body: 'D', isCorrect: false },
] }] }

function once(socket: Socket, event: string): Promise<any> {
  return new Promise((resolve) => socket.once(event, resolve))
}

describe('Socket.IO game protocol', () => {
  let httpServer: ReturnType<typeof createServer>
  let io: Server
  let address: string
  const sockets: Socket[] = []

  beforeEach(async () => {
    await getRedis().flushdb()
    httpServer = createServer()
    io = new Server(httpServer, { path: '/socket.io' })
    registerGameSocketHandlers(io, new GameService({ introDurationMs: 5, answerDurationMs: 60_000 }))
    await new Promise<void>((resolve) => httpServer.listen(0, '127.0.0.1', resolve))
    const port = (httpServer.address() as import('node:net').AddressInfo).port
    address = `http://127.0.0.1:${port}`
  })

  afterAll(async () => { await closeRedis() })

  it('synchronizes a host and two players, including rank payloads', async () => {
    const session = await createSession(quiz, '333333')
    const host = client(address, { path: '/socket.io', forceNew: true })
    const first = client(address, { path: '/socket.io', forceNew: true })
    const second = client(address, { path: '/socket.io', forceNew: true })
    sockets.push(host, first, second)
    await Promise.all(sockets.map((socket) => once(socket, 'connect')))

    const firstJoined = once(first, 'room:joined')
    first.emit('player:join', { pin: session.pin, nickname: 'หนึ่ง', playerId: 'first' })
    const firstRoom = await firstJoined
    const secondJoined = once(second, 'room:joined')
    second.emit('player:join', { pin: session.pin, nickname: 'สอง', playerId: 'second' })
    await secondJoined

    const firstIntro = once(first, 'question:intro')
    const secondIntro = once(second, 'question:intro')
    const open = once(first, 'question:open')
    const hostJoined = once(host, 'room:joined')
    host.emit('host:join', { sessionId: session.id, hostToken: session.hostToken })
    await hostJoined
    host.emit('host:start', {})
    expect(await firstIntro).toMatchObject({ questionImageUrl: '/media/q.webp' })
    expect(await secondIntro).toMatchObject({ questionImageUrl: '/media/q.webp' })
    await open
    const answerProgress = once(host, 'question:answer-progress')
    const firstAccepted = once(first, 'answer:accepted')
    first.emit('player:answer', { pin: session.pin, playerId: 'second', questionId: 'socket-q', choiceId: 'a' })
    await firstAccepted
    expect(await answerProgress).toEqual({ questionId: 'socket-q', answerCount: 1 })
    const secondAccepted = once(second, 'answer:accepted')
    second.emit('player:answer', { pin: session.pin, playerId: 'first', questionId: 'socket-q', choiceId: 'b' })
    await secondAccepted
    const rank = once(first, 'score:rank-update')
    host.emit('host:reveal', {})
    expect(await rank).toMatchObject({ playerId: firstRoom.player.id, previousRank: 1, rank: 1, totalScore: expect.any(Number) })

    first.disconnect()
    const reconnect = client(address, { path: '/socket.io', forceNew: true })
    sockets.push(reconnect)
    await once(reconnect, 'connect')
    const rejoined = once(reconnect, 'room:joined')
    const recoveredState = once(reconnect, 'game:state')
    reconnect.emit('player:join', { pin: session.pin, nickname: 'ignored', playerToken: firstRoom.playerToken })
    expect((await rejoined).player.id).toBe(firstRoom.player.id)
    expect(await recoveredState).toMatchObject({ players: expect.arrayContaining([expect.objectContaining({ id: firstRoom.player.id, rank: 1 })]) })

    for (const socket of sockets.splice(0)) socket.disconnect()
    await new Promise<void>((resolve) => io.close(() => httpServer.close(() => resolve())))
  })

  it('rejects host controls until the socket presents the session capability', async () => {
    const session = await createSession(quiz, '444444')
    const host = client(address, { path: '/socket.io', forceNew: true })
    sockets.push(host)
    await once(host, 'connect')
    const rejected = once(host, 'game:error')
    host.emit('host:start', { sessionId: session.id })
    expect(await rejected).toMatchObject({ message: expect.stringMatching(/host/i) })
    expect((await new GameService().getSnapshot(session.id))?.state.phase).toBe('lobby')
    host.disconnect()
    await new Promise<void>((resolve) => io.close(() => httpServer.close(() => resolve())))
  })

  it('rejects malformed player PINs and nicknames before joining the game service', async () => {
    const socket = client(address, { path: '/socket.io', forceNew: true })
    sockets.push(socket)
    await once(socket, 'connect')

    const invalidPin = once(socket, 'game:error')
    socket.emit('player:join', { pin: '123', nickname: 'มานัส' })
    expect(await invalidPin).toMatchObject({ message: expect.stringMatching(/PIN/i) })

    const invalidNickname = once(socket, 'game:error')
    socket.emit('player:join', { pin: '842193', nickname: ' ' })
    expect(await invalidNickname).toMatchObject({ message: expect.stringMatching(/nickname/i) })
    socket.disconnect()
    await new Promise<void>((resolve) => io.close(() => httpServer.close(() => resolve())))
  })
})
