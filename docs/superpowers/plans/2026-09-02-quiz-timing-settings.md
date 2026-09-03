# Quiz Timing Settings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let Hosts configure one intro, answer, and reveal duration for every question in a Quiz, snapshot it into each live room, and drive the server-synced time bars from it.

**Architecture:** MySQL persists a validated `QuizTiming` value; a session copies it into Redis state when created. `GameService` reads only session timing, schedules intro/answer/reveal phases from those values, and emits absolute timestamps. The Host editor owns the three controls and both Host/Player time bars render the existing socket timing payloads.

**Tech Stack:** Next.js 14, React, TypeScript, Zod, MySQL migrations/mysql2, Redis, Socket.IO, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-02-quiz-timing-settings-design.md`

## Global Constraints

- Intro duration: integer 1–30 seconds; default 5.
- Answer duration: integer 5–180 seconds; default 20.
- Reveal duration: integer 1–60 seconds; default 4.
- A session must snapshot its Quiz timing; editing a Quiz must not alter an active session.
- Socket deadlines are absolute milliseconds since Unix epoch.

---

### Task 1: Persist and validate Quiz timing

**Files:**
- Create: `database/migrations/003_quiz_timing.sql`
- Modify: `src/server/migrations.ts`, `src/server/repositories/quizzes.ts`, `src/server/quiz-validation.ts`
- Test: `tests/quiz-timing.test.ts`

**Interfaces:**
- Produces `QuizTiming = { introDurationSeconds: number; answerDurationSeconds: number; revealDurationSeconds: number }`.
- `Quiz` and `QuizInput` expose `timing: QuizTiming`.

- [ ] **Step 1: Write failing validation/default tests**

```ts
it('accepts timing in the configured ranges and rejects an answer duration over 180 seconds', () => {
  expect(quizInputSchema.parse(validQuiz).timing).toEqual({ introDurationSeconds: 5, answerDurationSeconds: 20, revealDurationSeconds: 4 })
  expect(() => quizInputSchema.parse({ ...validQuiz, timing: { introDurationSeconds: 5, answerDurationSeconds: 181, revealDurationSeconds: 4 } })).toThrow()
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx.cmd vitest run tests/quiz-timing.test.ts`

Expected: FAIL because `timing` is absent from the Quiz contract.

- [ ] **Step 3: Add migration, repository mapping, and Zod defaults**

```sql
ALTER TABLE quizzes
  ADD COLUMN intro_duration_seconds INT NOT NULL DEFAULT 5,
  ADD COLUMN answer_duration_seconds INT NOT NULL DEFAULT 20,
  ADD COLUMN reveal_duration_seconds INT NOT NULL DEFAULT 4;
```

```ts
export const defaultQuizTiming = { introDurationSeconds: 5, answerDurationSeconds: 20, revealDurationSeconds: 4 }
const timingSchema = z.object({
  introDurationSeconds: z.number().int().min(1).max(30),
  answerDurationSeconds: z.number().int().min(5).max(180),
  revealDurationSeconds: z.number().int().min(1).max(60),
}).default(defaultQuizTiming)
```

Select/write the three database columns with each Quiz and map them to/from `timing`.

- [ ] **Step 4: Run focused verification**

Run: `npx.cmd vitest run tests/quiz-timing.test.ts tests/quiz-editor.test.tsx; npx.cmd tsc --noEmit`

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add database/migrations/003_quiz_timing.sql src/server/migrations.ts src/server/repositories/quizzes.ts src/server/quiz-validation.ts tests/quiz-timing.test.ts
git commit -m "feat: persist quiz timing settings"
```

### Task 2: Add Host timing controls and snapshot session timing

**Files:**
- Modify: `src/components/quiz-editor/QuizEditor.tsx`, `src/server/game/types.ts`, `src/server/game/store.ts`, `src/server/game/service.ts`
- Test: `tests/quiz-editor.test.tsx`, `tests/game.service.test.ts`

**Interfaces:**
- Consumes `Quiz.timing` from Task 1.
- Produces `GameSnapshot.timing: QuizTiming` and schedules all phases from it.

- [ ] **Step 1: Write failing editor/session tests**

```tsx
it('submits the three Host timing fields with a new Quiz', () => {
  expect(validateQuizForSubmission({ ...validEditorQuiz, timing: { introDurationSeconds: 7, answerDurationSeconds: 45, revealDurationSeconds: 8 } })).toBeNull()
})
```

```ts
it('uses the session timing rather than a later edited Quiz timing', async () => {
  const started = await service.startGame(sessionId)
  expect(started).toMatchObject({ type: 'question:intro', deadlineAt: expect.any(Number) })
  expect((await service.getSnapshot(sessionId))?.timing.answerDurationSeconds).toBe(45)
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx.cmd vitest run tests/quiz-editor.test.tsx tests/game.service.test.ts`

Expected: FAIL because editor state and game snapshots have no timing property.

- [ ] **Step 3: Implement controls, snapshot, and scheduling**

Render three labelled `<input type="number">` elements in a “เวลาเกม” group and update `EditorQuiz.timing`. Store `timing` in Redis session creation. Replace `GameService` module duration constants with `snapshot.timing` values:

```ts
const introDeadline = Date.now() + snapshot.timing.introDurationSeconds * 1_000
const answerDeadline = Date.now() + snapshot.timing.answerDurationSeconds * 1_000
const revealDeadline = Date.now() + snapshot.timing.revealDurationSeconds * 1_000
```

Schedule the leaderboard transition after the reveal deadline and include its timing in the state/event contract.

- [ ] **Step 4: Run focused verification**

Run: `npx.cmd vitest run tests/quiz-editor.test.tsx tests/game.service.test.ts tests/time-bar.test.tsx; npx.cmd tsc --noEmit`

Expected: PASS; if MySQL/Redis integration is unavailable, record the concrete service error and retain unit coverage.

- [ ] **Step 5: Commit**

```powershell
git add src/components/quiz-editor/QuizEditor.tsx src/server/game/types.ts src/server/game/store.ts src/server/game/service.ts tests/quiz-editor.test.tsx tests/game.service.test.ts
git commit -m "feat: configure session game timings"
```

### Task 3: Drive reveal and score timing from the session snapshot

**Files:**
- Modify: `src/components/game/HostGame.tsx`, `src/components/game/PlayerGame.tsx`, `src/components/game/QuestionIntro.tsx`, `src/components/ui/TimeBar.tsx`
- Test: `tests/host-game.test.tsx`, `tests/player-game.test.tsx`, `tests/time-bar.test.tsx`

**Interfaces:**
- Consumes timing payloads from Task 2.
- Produces matching intro/answer/reveal timing views for Host and Player.

- [ ] **Step 1: Write failing view tests**

```tsx
it('renders the configured intro deadline in the Host pre-question view', () => {
  const markup = renderToStaticMarkup(<QuestionIntro openedAt={1_000} deadlineAt={8_000} />)
  expect(markup).toContain('role="timer"')
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx.cmd vitest run tests/host-game.test.tsx tests/player-game.test.tsx tests/time-bar.test.tsx`

Expected: FAIL until session timing payloads are connected to every phase.

- [ ] **Step 3: Remove fixed client duration fallbacks for current sessions**

Use timing from snapshot/event whenever available. Keep legacy fallback only for an old event missing timing. Render the reveal view until the server signals the score-rank transition; do not use a hard-coded four-second client timeout.

- [ ] **Step 4: Run focused verification**

Run: `npx.cmd vitest run tests/host-game.test.tsx tests/player-game.test.tsx tests/time-bar.test.tsx; npx.cmd tsc --noEmit; git diff --check`

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add src/components/game/HostGame.tsx src/components/game/PlayerGame.tsx src/components/game/QuestionIntro.tsx src/components/ui/TimeBar.tsx tests/host-game.test.tsx tests/player-game.test.tsx tests/time-bar.test.tsx
git commit -m "feat: sync game views with configured timings"
```
