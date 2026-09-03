# Quiz timing settings design

## Goal

Let a Host configure one timing policy for every question in a Quiz: pre-question intro, answer time, and reveal time. A started room snapshots that policy so later editor changes cannot alter a live game.

## Data model

`quizzes` gains three non-null integer columns in seconds:

- `intro_duration_seconds` — 1–30; default 5
- `answer_duration_seconds` — 5–180; default 20
- `reveal_duration_seconds` — 1–60; default 4

The Quiz API exposes these as `timing`. Existing rows receive defaults through a forward migration. When a session is created, its Redis state stores a validated `timing` snapshot alongside the quiz snapshot.

## Host editor

The create/edit Quiz screen has a “เวลาเกม” group with three labelled numeric inputs, descriptions, and the default values. Submission validates client-side and API-side before any write.

## Runtime flow

`GameService` reads session timing, rather than module constants, for every question:

1. intro phase uses `introDurationSeconds` and shows a server-synced time bar;
2. answer phase uses `answerDurationSeconds`;
3. reveal phase remains visible for `revealDurationSeconds`, then emits/enters rankings.

Socket deadline payloads remain absolute timestamps. Reconnect reads the session snapshot, so no client resets timing. Quiz updates after a room starts do not change the snapshot.

## Validation and tests

Zod validation enforces the three ranges. Tests cover defaults for old Quiz rows, API/editor validation, session snapshot isolation, and service scheduling for all three durations.
