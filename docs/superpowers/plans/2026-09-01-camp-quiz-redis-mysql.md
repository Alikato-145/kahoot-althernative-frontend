# Camp Quiz Redis/MySQL Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Supabase prototype with a Thai Kahoot-inspired camp quiz backed by MySQL, Redis, local media storage, and Socket.IO.

**Architecture:** Next.js remains the web UI and API layer but runs behind a small custom Node server that owns Socket.IO. MySQL persists authored quiz content and final results; Redis owns active room state, quiz cache, score sorted sets, and expiring PIN mappings. Nginx serves HTTPS, WebSocket upgrades, and local uploaded media in production.

**Tech Stack:** Next.js 14, React 18, TypeScript, Socket.IO, Redis/ioredis, MySQL/mysql2, Zod, Vitest, Playwright, Docker Compose, Nginx, systemd.

**Spec:** `docs/superpowers/specs/2026-09-01-camp-quiz-design.md`

## Global Constraints

- The app is Thai-language and optimised for a projected Host screen plus phone-only Player screen.
- A question has exactly four ordered choices; the first-release score is 1,000 decreasing linearly to 0 during the answer deadline.
- MySQL is the durable source of truth; Redis is the authoritative store only while a game is active.
- Client browsers may call REST and Socket.IO only; they never receive database or Redis credentials.
- Question and reveal images are stored below `media/quizzes/<quizId>/` and served as `/media/...` by Nginx.
- Host and Player share one HTTPS domain; real-time traffic must use WSS through the Nginx proxy.
- No account, moderation, anti-cheating, or question types other than four-choice multiple choice are in scope.

---

## File structure

| Path | Responsibility |
| --- | --- |
| `server.ts` | Custom HTTP server, Next request handler, Socket.IO bootstrap |
| `src/server/config.ts` | Validated server environment variables |
| `src/server/db.ts` | MySQL pool and typed query helper |
| `src/server/migrations.ts` | Ordered SQL migration runner |
| `database/migrations/001_initial_schema.sql` | Durable quiz and result tables |
| `src/server/redis.ts` | Redis clients and key builders |
| `src/server/game/types.ts` | Shared live-game DTOs and event payloads |
| `src/server/game/scoring.ts` | Pure scoring and rank-delta calculations |
| `src/server/game/store.ts` | Redis-backed session creation, joins, answers, TTL, persistence snapshot |
| `src/server/game/service.ts` | Phase transitions and MySQL final-result writes |
| `src/server/socket.ts` | Socket.IO event registration and room broadcasts |
| `src/app/api/quizzes/**/route.ts` | Quiz CRUD REST routes |
| `src/app/api/media/route.ts` | Image upload route and local media writer |
| `src/lib/api.ts` | Browser fetch functions and response types |
| `src/lib/socket.ts` | Singleton Socket.IO browser client |
| `src/components/quiz-editor/*` | Host authoring form and four-choice editor |
| `src/components/game/*` | Host/player lobby, question, reveal, ranking, and result views |
| `src/app/host/**` | Host routes |
| `src/app/join/page.tsx`, `src/app/game/[pin]/page.tsx` | Player routes |
| `docker-compose.yml` | Development MySQL and Redis containers |
| `deploy/nginx/camp-quiz.conf` | HTTPS, media, and WebSocket proxy config |
| `deploy/systemd/camp-quiz.service` | Bare-metal Node service definition |
| `docs/operations.md` | Local setup, migrations, production deployment and rehearsal checklist |

## Task 1: Establish the local runtime and test harness

**Files:**
- Create: `docker-compose.yml`, `.env.example`, `vitest.config.ts`, `tests/setup.ts`
- Modify: `package.json`, `.gitignore`, `next.config.mjs`
- Delete: `src/types/supabase.ts`, `supabase/`

**Interfaces:**
- Produces `npm run dev`, `npm run test`, `npm run db:migrate`, and `docker compose up -d` commands used by every later task.
- Produces `DATABASE_URL`, `REDIS_URL`, `MEDIA_ROOT`, `PUBLIC_BASE_URL`, and `PORT` environment variables.

- [ ] **Step 1: Add the initial runtime test**

Create `tests/config.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { loadConfig } from '@/server/config'

it('rejects a missing database URL', () => {
  expect(() => loadConfig({ REDIS_URL: 'redis://localhost:6379' })).toThrow('DATABASE_URL')
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test -- tests/config.test.ts`

Expected: FAIL because `src/server/config.ts` and the test command do not exist.

- [ ] **Step 3: Install and configure the runtime dependencies**

Install production packages: `socket.io socket.io-client ioredis mysql2 zod qrcode react-hook-form @hookform/resolvers`.

Install development packages: `tsx vitest @vitest/coverage-v8 @playwright/test`.

Set scripts exactly as follows:

```json
{
  "dev": "tsx watch server.ts",
  "build": "next build",
  "start": "tsx server.ts",
  "test": "vitest run",
  "test:watch": "vitest",
  "db:migrate": "tsx src/server/migrations.ts",
  "e2e": "playwright test"
}
```

Create `docker-compose.yml` with MySQL 8.4 and Redis 7 services, named volumes, ports `3306:3306` and `6379:6379`, and a MySQL healthcheck. Add `.superpowers/`, `media/`, and `.env` to `.gitignore`. Remove the Supabase dependency, source files, migrations, and configuration.

- [ ] **Step 4: Implement validated configuration**

Create `src/server/config.ts` with a `loadConfig(input = process.env)` function using Zod. It must require `DATABASE_URL` and `REDIS_URL`, default `MEDIA_ROOT` to `./media`, default `PUBLIC_BASE_URL` to `http://localhost:3000`, and coerce `PORT` to `3000`.

- [ ] **Step 5: Run the test and typecheck**

Run: `npm run test -- tests/config.test.ts` and `npx tsc --noEmit`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json docker-compose.yml .env.example .gitignore vitest.config.ts tests src/server next.config.mjs
git commit -m "chore: replace Supabase development setup"
```

## Task 2: Create MySQL schema, migrations, and quiz repository

**Files:**
- Create: `database/migrations/001_initial_schema.sql`, `src/server/db.ts`, `src/server/migrations.ts`, `src/server/repositories/quizzes.ts`, `tests/quizzes.repository.test.ts`

**Interfaces:**
- Consumes: `loadConfig().databaseUrl` from Task 1.
- Produces `Quiz`, `Question`, `Choice`, `createQuiz(input)`, `getQuiz(id)`, `listQuizzes()`, and `updateQuiz(id, input)` for API routes and game startup.

- [ ] **Step 1: Write the repository contract test**

```ts
it('persists a question with exactly four ordered choices', async () => {
  const quiz = await createQuiz({ title: 'ค่าย', description: '', questions: [questionInput] })
  const loaded = await getQuiz(quiz.id)
  expect(loaded.questions[0].choices.map((choice) => choice.position)).toEqual([0, 1, 2, 3])
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test -- tests/quizzes.repository.test.ts`

Expected: FAIL because the repository and schema do not exist.

- [ ] **Step 3: Write the migration**

Create tables specified by the design: `quizzes`, `questions`, `choices`, `game_sessions`, `game_players`, and `game_answers`. Use UUID text identifiers generated in application code, foreign keys with `ON DELETE CASCADE`, a unique `(question_id, position)` constraint, and indexes on `questions.quiz_id`, `choices.question_id`, `game_players.session_id`, and `game_answers.session_id`.

- [ ] **Step 4: Implement migration runner and repository**

`migrations.ts` must create a `schema_migrations(filename, executed_at)` table and run every lexically ordered `.sql` file only once. `quizzes.ts` must wrap a quiz create/update in a MySQL transaction and reject any input that is not four choices with exactly one `isCorrect: true`.

Expose this input type:

```ts
export type QuizInput = {
  title: string; description: string; coverImageUrl?: string | null
  questions: Array<{
    id?: string; body: string; questionImageUrl?: string | null
    revealImageUrl?: string | null; explanation?: string | null
    choices: Array<{ id?: string; body: string; isCorrect: boolean }>
  }>
}
```

- [ ] **Step 5: Run migration and repository tests**

Run: `docker compose up -d && npm run db:migrate && npm run test -- tests/quizzes.repository.test.ts`

Expected: PASS with a MySQL-backed quiz containing four choices.

- [ ] **Step 6: Commit**

```bash
git add database src/server tests/quizzes.repository.test.ts
git commit -m "feat: add MySQL quiz persistence"
```

## Task 3: Build Redis live-game store and deterministic scoring

**Files:**
- Create: `src/server/redis.ts`, `src/server/game/types.ts`, `src/server/game/scoring.ts`, `src/server/game/store.ts`, `tests/scoring.test.ts`, `tests/game.store.test.ts`

**Interfaces:**
- Consumes: `Quiz` from Task 2 and `REDIS_URL` from Task 1.
- Produces `createSession(quiz)`, `joinSession(pin, nickname)`, `submitAnswer(input)`, `closeQuestion(sessionId)`, `getSnapshot(sessionId)`, and `expireSession(sessionId)`.

- [ ] **Step 1: Write failing score/rank tests**

```ts
it('awards 1000 then 0 points at the two deadline edges', () => {
  expect(scoreAnswer(true, 0, 20_000)).toBe(1000)
  expect(scoreAnswer(true, 20_000, 20_000)).toBe(0)
  expect(scoreAnswer(false, 1, 20_000)).toBe(0)
})

it('reports a player moving from rank 3 to rank 1', () => {
  expect(rankDelta('p1', ['p2', 'p3', 'p1'], ['p1', 'p2', 'p3'])).toEqual({ previousRank: 3, rank: 1 })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test -- tests/scoring.test.ts tests/game.store.test.ts`

Expected: FAIL because game modules do not exist.

- [ ] **Step 3: Implement the pure scoring contract**

Implement `scoreAnswer(correct, elapsedMs, deadlineMs)` as `Math.max(0, 1000 - Math.round(1000 * Math.min(elapsedMs / deadlineMs, 1)))` for correct answers only. Implement `rankDelta(playerId, previousIds, currentIds)` using one-based array positions.

- [ ] **Step 4: Implement Redis keys and atomic answer submission**

Use the exact `game:*` keys from the design. Store players in a hash, scores in a sorted set, and answers in a per-question hash. `submitAnswer` must use a Redis transaction so a player can insert only one answer for the current question and increment the selected-choice aggregate once. Use a 12-hour TTL for active rooms and a 30-minute TTL after finalisation.

- [ ] **Step 5: Run Redis integration tests**

Run: `npm run test -- tests/scoring.test.ts tests/game.store.test.ts`

Expected: PASS; the store test starts from a clean Redis DB and verifies duplicate answers do not alter score or counts.

- [ ] **Step 6: Commit**

```bash
git add src/server/redis.ts src/server/game tests/scoring.test.ts tests/game.store.test.ts
git commit -m "feat: add Redis live game state"
```

## Task 4: Add custom server, Socket.IO protocol, and phase service

**Files:**
- Create: `server.ts`, `src/server/game/service.ts`, `src/server/socket.ts`, `tests/game.service.test.ts`, `tests/socket.e2e.test.ts`

**Interfaces:**
- Consumes: Task 2 repository and Task 3 store.
- Produces host events `host:start`, `host:next`, `host:reveal`; player events `player:join`, `player:answer`; broadcast events listed in the design.

- [ ] **Step 1: Write failing phase transition tests**

```ts
it('moves lobby to question-intro and broadcasts the current image URL', async () => {
  const event = await service.startGame(sessionId)
  expect(event).toMatchObject({ type: 'question:intro', questionImageUrl: '/media/quizzes/q1/cat.webp' })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test -- tests/game.service.test.ts tests/socket.e2e.test.ts`

Expected: FAIL because no service or Socket.IO server exists.

- [ ] **Step 3: Implement custom server and service**

`server.ts` must create a Node `http.Server`, hand ordinary requests to `next({ dev }).getRequestHandler()`, attach Socket.IO with path `/socket.io`, and listen on `config.port`. The service must own phase transitions exactly as `lobby → question-intro → answering → reveal → score-rank → question-intro|final-results` and schedule the five-second intro and configured answer deadline on the server.

- [ ] **Step 4: Implement Socket.IO events**

`player:join` joins the socket room `game:<sessionId>` and emits a complete current snapshot. `host:start`, `host:reveal`, and `host:next` invoke the service; broadcasts use `io.to(room).emit(eventName, payload)`. On answer close, emit `question:reveal`, then `score:rank-update` for each player, including `earnedScore`, `totalScore`, `previousRank`, and `rank`.

- [ ] **Step 5: Run protocol tests**

Run: `npm run test -- tests/game.service.test.ts tests/socket.e2e.test.ts`

Expected: PASS with one host and two socket clients observing the same phase and rank payload.

- [ ] **Step 6: Commit**

```bash
git add server.ts src/server/game/service.ts src/server/socket.ts tests/game.service.test.ts tests/socket.e2e.test.ts
git commit -m "feat: add Socket.IO game protocol"
```

## Task 5: Implement quiz, session, and media REST APIs

**Files:**
- Create: `src/app/api/quizzes/route.ts`, `src/app/api/quizzes/[id]/route.ts`, `src/app/api/sessions/route.ts`, `src/app/api/media/route.ts`, `src/server/media.ts`, `tests/api/*.test.ts`

**Interfaces:**
- Consumes: Task 2 `QuizInput` repository and Task 3 `createSession`.
- Produces `GET/POST /api/quizzes`, `GET/PUT/DELETE /api/quizzes/:id`, `POST /api/sessions`, and `POST /api/media`.

- [ ] **Step 1: Write API contract tests**

```ts
it('returns a public media URL after a WebP upload', async () => {
  const response = await POST(requestWithFile('image.webp', 'image/webp'))
  expect(await response.json()).toMatchObject({ url: expect.stringMatching(/^\/media\/quizzes\//) })
})

it('rejects a quiz question with three choices', async () => {
  expect((await POST(requestWithThreeChoices())).status).toBe(422)
})
```

- [ ] **Step 2: Run API tests to verify they fail**

Run: `npm run test -- tests/api`

Expected: FAIL because routes and media writer do not exist.

- [ ] **Step 3: Implement REST validation and media storage**

Use Zod to validate the Task 2 input. In the media route use `await request.formData()`, accept only `image/jpeg`, `image/png`, `image/webp`, and `image/gif`, reject files above 8 MB, generate a UUID filename, write under `MEDIA_ROOT/quizzes/<quizId>/`, and return the `/media/quizzes/<quizId>/<filename>` URL. The quiz delete route removes its MySQL rows and calls `removeQuizMedia(quizId)`.

- [ ] **Step 4: Implement room PIN creation**

`POST /api/sessions` accepts `{ quizId }`, loads the quiz, repeatedly creates a zero-padded six-digit PIN until `game:pin:<pin>` is unused, calls `createSession`, and returns `{ sessionId, pin, hostUrl, playerUrl }`.

- [ ] **Step 5: Run API tests**

Run: `npm run test -- tests/api`

Expected: PASS; created session response contains a six-digit PIN and upload response points below `/media/`.

- [ ] **Step 6: Commit**

```bash
git add src/app/api src/server/media.ts tests/api
git commit -m "feat: add quiz session and media APIs"
```

## Task 6: Create the Host dashboard and quiz editor

**Files:**
- Create: `src/app/host/page.tsx`, `src/app/host/quizzes/new/page.tsx`, `src/app/host/quizzes/[id]/edit/page.tsx`, `src/components/quiz-editor/QuizEditor.tsx`, `src/components/quiz-editor/QuestionEditor.tsx`, `src/components/quiz-editor/ImageUpload.tsx`, `src/lib/api.ts`, `tests/quiz-editor.test.tsx`
- Modify: `src/app/host/dashboard/**` (remove obsolete Supabase dashboard)

**Interfaces:**
- Consumes REST routes from Task 5.
- Produces editor submissions that satisfy `QuizInput` and Host navigation to `/host/game/:sessionId`.

- [ ] **Step 1: Write the editor behavior test**

```tsx
it('does not submit until a question has four choices and one correct choice', async () => {
  render(<QuizEditor initialQuiz={emptyQuiz} />)
  await user.click(screen.getByRole('button', { name: 'บันทึก Quiz' }))
  expect(await screen.findByText('แต่ละข้อมี 4 คำตอบ และต้องเลือกคำตอบที่ถูก 1 ข้อ')).toBeVisible()
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test -- tests/quiz-editor.test.tsx`

Expected: FAIL because the editor has not been created.

- [ ] **Step 3: Implement dashboard and editor**

Render existing quizzes with Edit, Duplicate, Delete, and Start actions. The form has title/description fields and repeatable `QuestionEditor` cards. Each card renders body, question image upload, four numbered choice fields, one radio-button correct selector, reveal image upload, and an explanation textarea. Use `ImageUpload` to upload immediately and store the returned URL in the form state.

- [ ] **Step 4: Implement start-game navigation**

On Start call `POST /api/sessions`, then open `/host/game/<sessionId>` in the current tab. Display the PIN and player link only in the game lobby, not in the dashboard.

- [ ] **Step 5: Run editor tests**

Run: `npm run test -- tests/quiz-editor.test.tsx`

Expected: PASS; test covers validation and one uploaded image URL in the submitted payload.

- [ ] **Step 6: Commit**

```bash
git add src/app/host src/components/quiz-editor src/lib/api.ts tests/quiz-editor.test.tsx
git commit -m "feat: add host quiz editor"
```

## Task 7: Implement shared Kahoot-inspired design primitives

**Files:**
- Create: `src/components/ui/AnswerTile.tsx`, `src/components/ui/GameShell.tsx`, `src/components/ui/Timer.tsx`, `src/components/ui/QuestionMedia.tsx`
- Modify: `src/app/globals.css`, `src/app/layout.tsx`
- Test: `tests/question-media.test.tsx`, `tests/answer-tile.test.tsx`

**Interfaces:**
- Produces `<QuestionMedia src alt />`, which both Host and Player render when an image URL is present.
- Produces `<AnswerTile index label onClick disabled />`, mapping indexes 0–3 to triangle/red, diamond/blue, circle/yellow, square/green.

- [ ] **Step 1: Write the image rendering regression test**

```tsx
it('renders the configured question image instead of an empty host area', () => {
  render(<QuestionMedia src="/media/quizzes/q1/cat.webp" alt="เสือชีตาห์" />)
  expect(screen.getByRole('img', { name: 'เสือชีตาห์' })).toHaveAttribute('src', '/media/quizzes/q1/cat.webp')
})
```

- [ ] **Step 2: Run the component tests to verify they fail**

Run: `npm run test -- tests/question-media.test.tsx tests/answer-tile.test.tsx`

Expected: FAIL because shared game components do not exist.

- [ ] **Step 3: Implement visual primitives**

Use the accepted mockup's dark-purple stage, large Thai type, bright answer tiles, and colour-plus-shape mapping. `QuestionMedia` returns `null` for a missing URL, uses `next/image` only after adding an explicit local image configuration, and otherwise uses an accessible responsive `<img>`. `Timer` receives an absolute deadline and derives its display from `Date.now()` so reconnects do not restart the timer.

- [ ] **Step 4: Run component tests**

Run: `npm run test -- tests/question-media.test.tsx tests/answer-tile.test.tsx`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/ui src/app/globals.css src/app/layout.tsx tests/question-media.test.tsx tests/answer-tile.test.tsx
git commit -m "feat: add camp quiz game design system"
```

## Task 8: Build Player join, lobby, and answer flow

**Files:**
- Create: `src/app/join/page.tsx`, `src/app/game/[pin]/page.tsx`, `src/components/game/PlayerGame.tsx`, `src/components/game/PlayerLobby.tsx`, `src/components/game/PlayerQuestion.tsx`, `src/lib/socket.ts`
- Test: `tests/player-game.test.tsx`, `e2e/player-join.spec.ts`

**Interfaces:**
- Consumes `player:join`, `player:answer`, `question:intro`, `question:open`, and `game:state` from Task 4.
- Produces Player connection state stored in `sessionStorage` as `{ pin, playerId, nickname }` for reconnect.

- [ ] **Step 1: Write the join and single-answer tests**

```tsx
it('disables every answer tile after a player submits one answer', async () => {
  render(<PlayerQuestion question={question} phase="answering" />)
  await user.click(screen.getByRole('button', { name: 'สามเหลี่ยม' }))
  expect(screen.getAllByRole('button')).toSatisfyAll((button) => expect(button).toBeDisabled())
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test -- tests/player-game.test.tsx`

Expected: FAIL because Player components do not exist.

- [ ] **Step 3: Implement join and game components**

`/join` validates exactly six digits and nickname length 1–20, then navigates to `/game/<pin>`. `PlayerGame` connects with the stored identity, renders lobby state until `question:intro`, displays an image and question during intro, and enables four `AnswerTile` controls only in `answering`. Submission emits `{ pin, playerId, questionId, choiceId }` and immediately disables all tiles.

- [ ] **Step 4: Add browser flow test**

Create Playwright coverage that enters PIN `842193`, nickname `มานัส`, waits for the lobby, receives a question event from the test socket, taps the triangle, and asserts the wait state appears without page navigation.

- [ ] **Step 5: Run unit and browser tests**

Run: `npm run test -- tests/player-game.test.tsx && npm run e2e -- e2e/player-join.spec.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/app/join src/app/game src/components/game/Player* src/lib/socket.ts tests/player-game.test.tsx e2e/player-join.spec.ts
git commit -m "feat: add player join and answer flow"
```

## Task 9: Build projected Host lobby, live question, and reveal views

**Files:**
- Create: `src/app/host/game/[sessionId]/page.tsx`, `src/components/game/HostGame.tsx`, `src/components/game/HostLobby.tsx`, `src/components/game/HostQuestion.tsx`, `src/components/game/HostReveal.tsx`
- Test: `tests/host-game.test.tsx`, `e2e/host-live-game.spec.ts`

**Interfaces:**
- Consumes Task 4 host controls and Task 7 game primitives.
- Produces Host-controlled `host:start`, `host:reveal`, and `host:next` transitions.

- [ ] **Step 1: Write the Host media/reveal test**

```tsx
it('shows a reveal image and long explanation after question reveal', () => {
  render(<HostReveal reveal={revealPayload} />)
  expect(screen.getByRole('img', { name: 'ภาพเฉลย' })).toBeVisible()
  expect(screen.getByText(longThaiExplanation)).toBeVisible()
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test -- tests/host-game.test.tsx`

Expected: FAIL because Host game views do not exist.

- [ ] **Step 3: Implement Host views**

`HostLobby` renders QR player URL, six-digit PIN, live nicknames, and Start Game. `HostQuestion` displays the question image, a timer based on server deadline, answer count, and post-close distribution bars. `HostReveal` displays correct choice, answer bars, optional reveal image, and long explanation. The next control appears only after the score/rank event was broadcast.

- [ ] **Step 4: Run projected screen test**

Run: `npm run test -- tests/host-game.test.tsx && npm run e2e -- e2e/host-live-game.spec.ts`

Expected: PASS; browser test verifies question and reveal image URLs render on the Host screen.

- [ ] **Step 5: Commit**

```bash
git add src/app/host/game src/components/game/Host* tests/host-game.test.tsx e2e/host-live-game.spec.ts
git commit -m "feat: add host projected game flow"
```

## Task 10: Add animated per-question ranking and final results

**Files:**
- Create: `src/components/game/RankMotion.tsx`, `src/components/game/PlayerScoreRank.tsx`, `src/components/game/FinalLeaderboard.tsx`
- Modify: `src/components/game/PlayerGame.tsx`, `src/server/game/service.ts`
- Test: `tests/rank-motion.test.tsx`, `tests/final-results.test.ts`

**Interfaces:**
- Consumes `score:rank-update` payload from Task 4.
- Produces player rank view containing `earnedScore`, `totalScore`, `previousRank`, and `rank`; persists final rows through Task 2 repository.

- [ ] **Step 1: Write rank movement tests**

```tsx
it('announces an upward move when rank changes from 5 to 2', () => {
  render(<PlayerScoreRank earnedScore={650} totalScore={2200} previousRank={5} rank={2} />)
  expect(screen.getByText('ขึ้น 3 อันดับ')).toBeVisible()
})
```

```ts
it('writes final rank and total score once when the game finishes', async () => {
  await service.finishGame(sessionId)
  expect(await repository.listResults(sessionId)).toContainEqual(expect.objectContaining({ finalRank: 1 }))
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test -- tests/rank-motion.test.tsx tests/final-results.test.ts`

Expected: FAIL because rank and final-result components do not exist.

- [ ] **Step 3: Implement FLIP ranking animation and result persistence**

`RankMotion` records each rendered row's `getBoundingClientRect()` before a new leaderboard prop, then applies `transform: translateY(previousTop - nextTop)` and removes it in `requestAnimationFrame` with a 500 ms `transform` transition. `PlayerScoreRank` displays correct/incorrect, earned score, total score, and Thai movement copy: `ขึ้น N อันดับ`, `ลง N อันดับ`, or `อันดับคงเดิม`.

In `finishGame`, read the sorted set in descending score order, construct durable player and answer rows, write them in one MySQL transaction, emit `game:final-results`, and set post-game Redis expiry to 30 minutes.

- [ ] **Step 4: Run ranking tests**

Run: `npm run test -- tests/rank-motion.test.tsx tests/final-results.test.ts`

Expected: PASS; the result write test remains idempotent when `finishGame` is called twice.

- [ ] **Step 5: Commit**

```bash
git add src/components/game/RankMotion.tsx src/components/game/PlayerScoreRank.tsx src/components/game/FinalLeaderboard.tsx src/components/game/PlayerGame.tsx src/server/game/service.ts tests/rank-motion.test.tsx tests/final-results.test.ts
git commit -m "feat: add animated score ranking and results"
```

## Task 11: Add production configuration and an end-to-end rehearsal guide

**Files:**
- Create: `deploy/nginx/camp-quiz.conf`, `deploy/systemd/camp-quiz.service`, `docs/operations.md`, `e2e/full-game.spec.ts`
- Modify: `.env.example`, `README.md`

**Interfaces:**
- Consumes one public hostname, production environment values, and built Node app.
- Produces repeatable development, deployment, migration, backup, and camp rehearsal instructions.

- [ ] **Step 1: Write a full-game browser test**

```ts
test('host and two players complete one question and receive final ranks', async ({ browser }) => {
  // create host and two phone-sized pages, join both players, start one question,
  // answer from each page, reveal, advance to final results, and assert ranks 1 and 2
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run e2e -- e2e/full-game.spec.ts`

Expected: FAIL until the complete application routes and Socket.IO test fixture exist.

- [ ] **Step 3: Add Nginx and systemd definitions**

Nginx config must redirect HTTP to HTTPS, serve `location /media/ { alias /srv/camp-quiz/media/; }`, proxy `/socket.io/` with `Upgrade` and `Connection "upgrade"` headers, and proxy other requests to `127.0.0.1:3000`. The systemd unit runs `/usr/bin/npm run start` from `/srv/camp-quiz`, loads `/etc/camp-quiz.env`, restarts on failure, and runs as a non-root `campquiz` user.

- [ ] **Step 4: Write operations documentation**

Document exact commands for: copy `.env.example`; `docker compose up -d`; `npm ci`; `npm run db:migrate`; `npm run dev`; production `npm ci --omit=dev`; `npm run build`; systemd enable/restart; Nginx test/reload; Certbot certificate creation; MySQL dump; Redis inspection; and a rehearsal with Host plus at least five phones over the public HTTPS URL.

- [ ] **Step 5: Run the full verification suite**

Run: `npm run test && npm run build && npm run e2e`

Expected: PASS; manual verification confirms HTTPS page load, `wss://` connection, question/reveal images, and visible rank movement on phone widths.

- [ ] **Step 6: Commit**

```bash
git add deploy docs/operations.md e2e/full-game.spec.ts .env.example README.md
git commit -m "docs: add camp quiz deployment guide"
```

## Plan self-review

| Spec requirement | Implemented by |
| --- | --- |
| MySQL authored content and final results | Tasks 2 and 10 |
| Redis cache, session state, PIN, scores, TTL | Task 3 |
| WebSocket lifecycle and events | Task 4 |
| Host editor, four choices, images, explanation | Tasks 5 and 6 |
| Kahoot-style Host and Player UI; Host question-image regression | Tasks 7–9 |
| Per-question score and moving rank animation | Task 10 |
| Docker Compose, bare-metal service, HTTPS/WSS | Tasks 1 and 11 |
| Automated and manual verification | Tasks 1–11, especially 11 |

No requirement from the design is intentionally deferred. The explicit interfaces use the same names across tasks, and the only state transition owner is `src/server/game/service.ts`.
