# Camp Quiz design

## Purpose and scope

Build a Thai-language, Kahoot-inspired live quiz for a camp. A host projects a large screen while participants join and answer with their phones. The first release supports exactly four answer choices per question and prioritizes fast, playful group play over account management or anti-cheating controls.

Included:

- Host dashboard to create, edit, and launch quizzes.
- Question images, answer-reveal images, and explanations of any practical length.
- Six-digit room PIN, QR-code joining, a live lobby, timed questions, answer distribution, reveal, per-question score and rank motion, and a final leaderboard.
- MySQL persistence, Redis-backed live game state/cache, and WebSocket synchronization.
- Docker Compose for local development; a bare-metal Linux deployment behind Nginx and HTTPS.

Excluded from this release:

- Accounts, roles, access control, anti-cheating measures, content moderation, and multi-choice question types beyond four choices.
- A managed cloud backend such as Supabase.

## Architecture

The application becomes a single Node.js service with a Next.js UI, REST endpoints for persistent quiz editing and media upload, and Socket.IO for real-time play. Browsers connect only to this application; they never connect to Redis or MySQL directly.

```text
Host browser + player browsers
        | HTTPS / WSS
Nginx reverse proxy
        |
Next.js + Node game service (REST + Socket.IO)
        |                    |
      Redis                MySQL
  live room state         durable quiz and results
```

Nginx also serves uploaded media from a local `media/` directory. It terminates HTTPS and forwards both normal HTTP requests and WebSocket upgrades to the Node service.

## Persistent data in MySQL

MySQL is the source of truth for authored content and completed game history.

| Entity | Key fields |
| --- | --- |
| `quizzes` | id, title, description, cover_image_url, timestamps |
| `questions` | id, quiz_id, position, body, question_image_url, reveal_image_url, explanation |
| `choices` | id, question_id, position, body, is_correct |
| `game_sessions` | id, quiz_id, pin, status, started_at, completed_at |
| `game_players` | id, session_id, nickname, final_score, final_rank |
| `game_answers` | id, session_id, player_id, question_id, choice_id, score, answered_at |

Each question has exactly four ordered `choices`. `question_image_url`, `reveal_image_url`, and `explanation` are optional, so a text-only question still works.

## Redis live state and cache

When a host starts a session, the service reads the selected quiz from MySQL and writes a compact game snapshot into Redis. During live play, all reads and writes for room state use Redis first.

Suggested keys:

- `game:pin:<pin>` → session id
- `game:<sessionId>:state` → phase, current question, deadline, player count
- `game:<sessionId>:quiz` → cached quiz snapshot, including question and reveal media URLs
- `game:<sessionId>:players` → player metadata and current scores
- `game:<sessionId>:leaderboard` → Redis sorted set of scores
- `game:<sessionId>:answers:<questionId>` → one selected answer per player and aggregate counts

All session keys receive a TTL and are refreshed while the game is active. When the final leaderboard is shown, the service persists final players and answers to MySQL, then lets the Redis keys expire after a short grace period for reconnecting players.

## Live game phases and events

The authoritative game state is owned by the Node service. Host actions request a state transition; the service validates the current phase, updates Redis, and broadcasts the resulting event to the Socket.IO room.

```text
lobby
  -> question-intro (question and image; five-second lead-in)
  -> answering (four coloured, shaped answer buttons; fixed deadline)
  -> reveal (correct answer, answer distribution, reveal image, explanation)
  -> score-rank (per-question score and animated movement in leaderboard)
  -> question-intro | final-results
```

Key Socket.IO events:

- `room:joined`, `lobby:players`, `game:state`
- `question:intro`, `question:open`, `answer:accepted`
- `question:reveal`, `score:rank-update`, `leaderboard:update`
- `game:final-results`, `game:error`

At the end of an answering window, the service calculates answer scores, updates the Redis sorted set, computes each player's previous and new rank, and emits `score:rank-update`. The payload includes `earnedScore`, `totalScore`, `previousRank`, and `rank`. The player UI uses this data to animate rank rows using a FLIP-style position transition; it does not infer ranks locally.

The first-release scoring rule is 1,000 points for a correct answer submitted immediately after the answer buttons open, linearly decreasing to 0 at the configured deadline; an incorrect or missing answer receives 0. Ties use the earlier total-score timestamp as a stable tiebreaker. The Host advances manually from the score/rank phase to the next question after participants have seen their movement.

## User interface

### Host

- `/host`: quiz dashboard with create, edit, duplicate, and start actions.
- `/host/quizzes/new` and `/host/quizzes/:id/edit`: quiz editor with title, description, questions, four choices, correct-choice selector, image upload fields, reveal image, and long explanation.
- `/host/game/:sessionId`: projected lobby, live game screen, reveal screen, score/rank screen, and final leaderboard.

The projected game screen follows the accepted mockup: dark purple stage, highly legible large Thai text, bright answer colours paired with shapes, a prominent game PIN, and visible question imagery. The host question component renders its image whenever `question_image_url` exists; this directly replaces the currently missing host-side image behavior.

### Player

- `/join`: enter a six-digit PIN and nickname.
- `/game/:pin`: waiting lobby, question screen, four large answer buttons, reveal, per-question score/rank animation, and final position.

The player always uses a phone-first layout. Answer labels are not required on the initial button view: the stable colour-and-shape mapping lets players answer quickly while the main screen shows answer text. Accessibility labels still name every answer.

## Media upload

The Host editor uploads images to the Node service. The service validates image type and practical size limits, saves files under `media/quizzes/<quizId>/`, and stores generated URLs in MySQL. Nginx exposes those URLs under `/media/` over HTTPS. Removing or replacing a question image removes its old local media file during normal editing.

## Development and production operations

### Development

`docker-compose.yml` starts MySQL and Redis with named development volumes. The Node application runs locally with environment variables for database and Redis URLs, the media directory, and its public base URL.

### Production

The bare-metal Linux host runs MySQL, Redis, and a Node systemd service. Nginx obtains and renews a Let's Encrypt certificate for the configured domain, serves `/media/`, proxies regular traffic to Next.js, and preserves WebSocket upgrade headers for Socket.IO. The application uses the single public domain for HTTPS and WSS.

## Error handling and recovery

- Invalid or expired PINs show a concise join error and never create a player.
- Joining after the lobby has closed shows that the game is already underway.
- A player reconnecting with the same browser session receives the latest Redis state and current rank.
- Upload failure leaves the editor draft unchanged and displays a retryable error.
- If a host reloads the projected screen, it reconnects to the session and reloads current state from Redis.
- If a question has no image or reveal image, the layout closes the empty media area without a broken-image placeholder.

## Verification

- Unit-test score calculation, rank deltas, fixed four-choice validation, Redis TTL handling, and session phase transitions.
- Integration-test REST quiz editing and media upload against Docker Compose MySQL and Redis.
- Socket integration-test a Host and multiple players: lobby join, question start, submissions, reveal, rank broadcast, next question, final persistence.
- Browser-test the mobile answer flow, host image rendering, long explanation layout, reconnect flow, and rank animation at mobile and projector widths.
- Run a manual LAN rehearsal with several phones before camp use, then repeat through the public HTTPS domain.

## Acceptance criteria

- A host can author a quiz entirely from the browser, with four choices per question and optional question/reveal images and long explanations.
- A participant can scan a QR code or enter a PIN on a phone, join with a nickname, and see state changes without refresh.
- The host's projected screen always renders configured question imagery and reveal imagery.
- Each question produces an answer distribution, explanation, per-player earned score, and a visible animated rank transition.
- Final scores and ranks persist in MySQL after a game ends.
- The development stack starts with Docker Compose; the production service works through a single HTTPS domain and secure WebSocket connection.
