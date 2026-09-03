import type { Server, Socket } from 'socket.io'
import { z } from 'zod'
import { GameService, type GameServiceEvent } from './game/service'

const roomFor = (sessionId: string) => `game:${sessionId}`
const playerJoinSchema = z.object({ pin: z.string().regex(/^\d{6}$/, 'PIN must contain exactly six digits'), nickname: z.string().trim().min(1, 'Nickname is required').max(20, 'Nickname must be 20 characters or fewer'), playerToken: z.string().optional() })
export function parsePlayerJoin(input: unknown) { return playerJoinSchema.parse(input) }

function payload(event: GameServiceEvent): Omit<GameServiceEvent, 'sessionId' | 'type'> {
  const { sessionId: _, type: __, ...rest } = event
  return rest
}

function emitError(socket: Socket, error: unknown): void {
  socket.emit('game:error', { message: error instanceof Error ? error.message : 'Game request failed' })
}

export function registerGameSocketHandlers(io: Server, service = new GameService()): GameService {
  service.subscribe((event) => io.to(roomFor(event.sessionId)).emit(event.type, payload(event)))
  io.on('connection', (socket) => {
    socket.on('player:join', async (input: unknown) => {
      try {
        const { pin, nickname, playerToken } = parsePlayerJoin(input)
        const joined = await service.joinPlayer(pin, nickname, playerToken)
        socket.data.playerId = joined.player.id
        socket.data.playerSessionId = joined.sessionId
        socket.join(roomFor(joined.sessionId))
        socket.emit('room:joined', { sessionId: joined.sessionId, player: joined.player, playerToken: joined.playerToken })
        socket.emit('game:state', joined.snapshot)
        io.to(roomFor(joined.sessionId)).emit('lobby:players', joined.snapshot.players)
        await service.reschedule(joined.sessionId)
      } catch (error) { emitError(socket, error) }
    })

    socket.on('player:answer', async ({ questionId, choiceId }: { questionId: string; choiceId: string }) => {
      try {
        const sessionId = socket.data.playerSessionId as string | undefined
        const playerId = socket.data.playerId as string | undefined
        if (!sessionId || !playerId) throw new Error('Join a game before answering')
        const result = await service.submitPlayerAnswer(sessionId, playerId, questionId, choiceId)
        if (result.accepted) {
          socket.emit('answer:accepted', result)
          const snapshot = await service.getSnapshot(sessionId)
          const answerCount = snapshot ? Object.keys(snapshot.answers[questionId]?.playerAnswers ?? {}).length : 0
          io.to(roomFor(sessionId)).emit('question:answer-progress', { questionId, answerCount })
        }
        else socket.emit('game:error', { message: 'Answer was not accepted' })
      } catch (error) { emitError(socket, error) }
    })

    socket.on('host:join', async ({ sessionId, hostToken }: { sessionId: string; hostToken: string }) => {
      try {
        if (!await service.verifyHost(sessionId, hostToken)) throw new Error('Host capability is invalid')
        socket.data.hostSessionId = sessionId
        socket.join(roomFor(sessionId))
        const snapshot = await service.getSnapshot(sessionId)
        if (!snapshot) throw new Error('Game session not found')
        socket.emit('room:joined', { sessionId, role: 'host' })
        socket.emit('game:state', snapshot)
        await service.reschedule(sessionId)
      } catch (error) { emitError(socket, error) }
    })

    const host = (method: 'startGame' | 'revealQuestion' | 'nextQuestion') => async () => {
      try {
        const sessionId = socket.data.hostSessionId as string | undefined
        if (!sessionId) throw new Error('Host capability is required before controlling a game')
        await service[method](sessionId)
      } catch (error) { emitError(socket, error) }
    }
    socket.on('host:start', host('startGame'))
    socket.on('host:reveal', host('revealQuestion'))
    socket.on('host:next', host('nextQuestion'))
  })
  return service
}
