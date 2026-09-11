# FootQuiz — Testing & Verification

This document records tests that have actually been executed for FootQuiz. It is intended to be extended as subsequent backend and frontend stages are completed.

## Test environment

- Initial test date: 2026-09-10.
- Stage 4–5.1 manual results: 2026-09-11.
- Environment: development / MVP.
- Database: development Supabase project.
- Production was not used.
- Manual API tests were executed from the browser against the local Next.js application (`localhost:3000`) connected to the development database.
- Secrets, anonymous cookie values and owner hashes are intentionally not recorded here.

---

## 1. Quiz attempts database migration

The `quiz_attempts` migration was applied to the development Supabase database.

The migration introduced:

- `quiz_attempts`,
- `quiz_attempt_answers`,
- `quiz_results.attempt_id`,
- RPC `record_quiz_attempt_answer`,
- RPC `finish_quiz_attempt`.

### Automated SQL verification — PASS

`supabase/tests/quiz_attempts.sql` was executed against the development database and completed without an error.

Verified by this test suite:

- attempt constraints and foreign keys,
- anonymous owner-hash validation,
- answer index validation,
- challenge membership and question order,
- first-answer immutability,
- idempotent replay of the same answer,
- timeout handling (`selected_index = -1`),
- result calculation from persisted answers,
- result ordering according to challenge question order,
- completion retry behavior,
- relevant RLS and privilege restrictions.

The test runs inside a transaction. Because a real daily challenge already existed in the development database, the test temporarily moved its date, created fixture data and ended with `ROLLBACK`.

Post-test verification confirmed:

- original daily challenge restored with original date and question order,
- fixture questions remaining: `0`,
- fixture attempts remaining: `0`,
- fixture results remaining: `0`.

### Deferred database-level verification

The following remain deliberately unverified:

- real two-session concurrency scenarios from `supabase/tests/quiz_attempts-concurrency.md`,
- injected failure between result insertion and attempt completion to independently prove rollback/atomicity under forced failure.

These scenarios are **not considered tested**.

---

## 2. `POST /api/quiz/attempt/start`

Manual runtime verification was performed against the local Next.js application and development Supabase database.

### First start — PASS

Observed:

- HTTP `201`,
- `resumed: false`,
- `state: "in_progress"`,
- `answers: []`,
- `completedAt: null`,
- `result: null`,
- expected daily challenge returned,
- all 5 challenge question IDs returned in correct order,
- `nextQuestionId` pointed to the first question.

### Resume with same anonymous cookie — PASS

Observed:

- HTTP `200`,
- `resumed: true`,
- same `attemptId`,
- same `startedAt`,
- same challenge and question order,
- `answers` unchanged,
- `nextQuestionId` pointed to the first unanswered question.

This confirms the basic start/resume path for an existing anonymous browser identity.

---

## 3. `POST /api/quiz/answer`

Manual runtime verification was performed using a real attempt. Answers were persisted through `record_quiz_attempt_answer`.

### First correct answer — PASS

Observed:

- HTTP `200`,
- `correct: true`,
- expected `correctIndex`,
- explanation returned,
- `replayed: false`.

### Identical retry — PASS

Observed:

- HTTP `200`,
- same feedback,
- `correct: true`,
- `replayed: true`.

### Attempt to change recorded answer — PASS

Observed:

- HTTP `409`,
- `error.code: ANSWER_ALREADY_RECORDED`.

The previously accepted answer was not replaced.

### Question outside challenge — PASS

Observed:

- HTTP `403`,
- `error.code: QUESTION_NOT_IN_CHALLENGE`.

No answer was recorded.

### Incorrect answer — PASS

Observed:

- HTTP `200`,
- `correct: false`,
- expected `correctIndex`,
- explanation returned,
- `replayed: false`.

### Timeout — PASS

Request used `selectedIndex: -1`.

Observed:

- HTTP `200`,
- `correct: false`,
- expected `correctIndex`,
- explanation returned,
- `replayed: false`.

This confirms the current timeout representation.

---

## 4. Runtime scenarios still not fully verified

The following answer/start edge cases must not be treated as manually confirmed unless separately tested later:

- malformed anonymous cookie,
- foreign, missing or `null` Origin where applicable,
- invalid JSON and invalid request shapes,
- extra request fields and query parameters,
- `QUESTION_OUT_OF_ORDER`,
- foreign anonymous identity on `/api/quiz/answer`,
- `ATTEMPT_COMPLETED` on answer,
- `ATTEMPT_EXPIRED` on answer,
- simultaneous/concurrent requests from separate sessions,
- forced rollback/atomicity failure scenario.

Missing anonymous cookie protection **is confirmed for finish** in Stage 4 below.

---

## 5. Stage 3 checkpoint — frontend integration with quiz attempts

### Automated verification — PASS

After frontend integration:

- full TypeScript typecheck — **PASS**,
- `npm.cmd run build` — **PASS**,
- local mocked test script — **28/28 PASS**,
- `git diff --check` — **PASS**.

The local tests used mocks and did not perform HTTP requests or Supabase mutations.

Covered:

- resume validation,
- shared in-flight attempt start,
- answer/replay contract,
- error handling,
- rendering attempt summary states.

### Manual browser verification — PASS

Confirmed:

- normal answer → feedback → next transition,
- after two persisted answers, F5 resumed at question 3,
- F5 during question 3 feedback resumed at question 4,
- all five answers led to `ready_to_finish`,
- attempts summary did not expose legacy “Repeat” behavior.

This confirmed that persisted server answers, not localStorage, control resume.

---

## 6. Stage 4 — quiz-attempt finalization

**Status: COMPLETE AND MANUALLY VERIFIED**

### Implementation verified

- `POST /api/quiz/attempt/finish` accepts exactly `{ attemptId, username }`.
- Username is required, trimmed and limited to 20 Unicode code points.
- Same-origin Origin validation is enforced.
- Finish uses existing anonymous identity and does not create or refresh it.
- Owner hash is derived server-side.
- The only database call is `finish_quiz_attempt`.
- Database calculates `score`, `totalQuestions` and `answersPattern`.
- Client does not provide authoritative result values.
- PostgreSQL atomically inserts result and updates `completed_at`.
- Retry of completed attempt returns existing result.
- `completed` state renders server result.
- `footquiz_username` remains only a UX preference.

### Automated verification — PASS

- full TypeScript typecheck — **PASS**,
- `npm.cmd run build` — **PASS**,
- **53 mocked tests — PASS**,
- `git diff --check` — **PASS**.

### Manual Stage 4 verification — PASS

#### Happy path

A completed attempt was saved with username `Kuba`.

UI confirmed the saved result.

#### Completed resume

After F5:

- completed screen remained visible,
- result was restored from server state.

#### Idempotent finish retry

Attempt:

`e4d286e7-0a40-4122-b63a-916943c23a85`

Retry returned:

- HTTP `200`,
- `replayed: true`,
- result ID `fc5569a6-a82e-4714-a157-061d7128478f`,
- score `2`,
- total questions `5`,
- pattern `10001`,
- username `Kuba`.

#### No duplicate `quiz_result`

SQL lookup by the attempt ID returned exactly **1 record**.

This confirms sequential retry behavior, not real two-session concurrency.

#### Incomplete attempt protection

Attempt:

`03730f15-8465-4ce4-ab16-4429e792a4f9`

Observed:

- HTTP `409`,
- `ATTEMPT_INCOMPLETE`.

#### Foreign owner protection

Finish from a different browser identity returned:

- HTTP `403`,
- `ATTEMPT_FORBIDDEN`.

#### Missing anonymous cookie

Finish with `credentials: omit` returned:

- HTTP `401`,
- `ANONYMOUS_IDENTITY_REQUIRED`.

### Deferred

Still not considered verified:

- real two-session DB concurrency,
- forced failure/rollback between INSERT result and UPDATE `completed_at`,
- broader Origin/malformed-cookie/network matrix.

Accepted MVP limitations:

- cookie reset/incognito bypass,
- client-side timer,
- UTC day boundary behavior.

---

## 7. Stage 5 — legacy result decommission

**Status: COMPLETE AND MANUALLY VERIFIED**

Removed from application code:

- `/api/quiz/result`,
- `/quiz/result`,
- `saveQuizResult`,
- legacy request types,
- legacy SummaryScreen branches.

The sole supported application result flow is now:

```text
Daily Quiz
→ persisted attempt answers
→ POST /api/quiz/attempt/finish
→ finish_quiz_attempt
→ quiz_results
```

Historical rows with `attempt_id = NULL` remain supported.

### Automated verification — PASS

- full TypeScript typecheck — **PASS**,
- `npm.cmd run build` — **PASS**,
- neither legacy route appears in build route list,
- **13 mocked regression checks — PASS**,
- application source contains no active references to:
  - `saveQuizResult`,
  - `QuizResultRequest`,
  - `QuizAnswer`,
  - `/api/quiz/result`,
  - `/quiz/result`,
- no direct application INSERT into `quiz_results`,
- `git diff --check` — **PASS**.

The first build encountered stale generated `.next/dev/types/validator.ts` references to removed routes. Removing that generated artifact resolved the issue; no config change was required.

### Manual Stage 5 verification — PASS

A full quiz was completed and finalized through the attempts flow.

Observed:

- result saved successfully,
- username: `Kuba2`,
- score: `3/5`.

#### Completed refresh — PASS

F5 after completion restored the completed result state correctly.

#### Removed legacy endpoint `/api/quiz/result` — PASS

POST request returned:

- HTTP `404`.

No legacy result save occurred.

#### Removed legacy endpoint `/quiz/result` — PASS

POST request returned:

- HTTP `404`.

No legacy result save occurred.

#### Finish retry after Stage 5 — PASS

Attempt:

`6f1d177e-7d7f-4c72-9755-e8040d537d4e`

Observed:

- HTTP `200`,
- `replayed: true`,
- result ID `647085ea-d162-4762-bfba-b8e5ab03255f`,
- score `3`,
- total questions `5`,
- answers pattern `01110`,
- username `Kuba2`.

This confirms that removing the legacy flow did not break idempotent finalization.

### Scope boundary

Stage 5 guarantees the result-write architecture at **application-code level**.

It does not prove that every direct database write is impossible.

`service_role` still has privileges required by the current `SECURITY INVOKER` RPC design. DB-level hardening remains a later security stage.

---

## 8. Stage 5.1 — server-side leaderboard

**Status: COMPLETE AND MANUALLY VERIFIED**

Leaderboard reads were moved from the browser to:

`GET /api/quiz/leaderboard`

The endpoint:

- uses server-side Supabase access,
- filters by current UTC date,
- returns TOP 10,
- exposes only:
  - `id`,
  - `username`,
  - `score`,
  - `totalQuestions`,
- maps historical `username = NULL` to `Anonim`,
- uses `Cache-Control: no-store`,
- returns a safe generic error contract on DB failure.

Frontend now:

- calls the backend endpoint,
- no longer SELECTs `quiz_results` directly,
- has separate loading / empty / error states,
- exposes retry on error.

### Automated verification — PASS

`tests/leaderboard.cjs` and related regression checks confirmed:

- TOP 10 query behavior,
- safe public mapping,
- response field whitelist,
- empty leaderboard behavior,
- DB error behavior,
- UI states,
- retry behavior.

Overall Stage 5.1 verification:

- **16 regression checks — PASS**,
- TypeScript typecheck — **PASS**,
- `npm.cmd run build` — **PASS**,
- endpoint registered in build,
- `git diff --check` — **PASS**.

### Manual Stage 5.1 verification — PASS

Homepage displayed:

`Kuba2 — 3/5`

Network request:

`GET /api/quiz/leaderboard`

Observed:

- HTTP `200`,
- response contained the finalized result,
- returned public object contained only:
  - `id`,
  - `username`,
  - `score`,
  - `totalQuestions`.

Observed result:

- result ID `647085ea-d162-4762-bfba-b8e5ab03255f`,
- username `Kuba2`,
- score `3`,
- total questions `5`.

This confirms the frontend ranking path works through the server endpoint and does not require direct browser access to `quiz_results`.

### Security boundary

Moving leaderboard reads server-side does **not** prove that old remote Supabase grants/RLS no longer expose `quiz_results`.

That remains part of the dedicated security hardening stage.

---

## 9. Daily challenge availability — manual finding

On 2026-09-11, `/api/quiz/attempt/start` initially returned:

`404 DAILY_CHALLENGE_NOT_FOUND`

This was not a regression in attempts/finalization.

Cause:

- `daily_challenges` had a row for 2026-09-10,
- no row existed for 2026-09-11,
- daily challenge publication is not yet automated.

For development testing, today's challenge was manually created in Supabase by copying the previous day's `question_ids`.

After that:

- `/quiz` loaded successfully,
- attempts flow worked normally.

This finding directly motivated **Stage 6 — Automatic Daily Challenge**.

---

## 10. Current verified checkpoint

At the end of Stage 5.1, the following are verified in the development environment:

- quiz-attempt migration is applied,
- anonymous start/resume works,
- answers persist before feedback,
- first accepted answer is immutable,
- identical answer retry is idempotent,
- timeout `-1` works,
- completed result is calculated server-side,
- finish is idempotent,
- completed attempts resume after refresh,
- legacy result endpoints are removed and return 404,
- application result creation uses only attempts flow,
- leaderboard is served through backend API,
- frontend no longer directly reads `quiz_results`,
- historical results remain compatible.

Not yet verified / deliberately deferred:

- real two-session concurrency,
- injected DB failure between result insert and completion update,
- full Origin/cookie/network edge matrix,
- complete remote RLS/grants audit,
- production deployment behavior,
- automatic daily challenge generation.

The next implementation stage is:

**Stage 6 — Automatic Daily Challenge**

Current roadmap: `ROADMAP.md`.
