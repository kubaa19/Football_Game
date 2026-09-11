# FootQuiz — Testing & Verification

This document records tests that have actually been executed for FootQuiz. It is intended to be extended as subsequent backend and frontend stages are completed.

## Test environment

- Initial test date: 2026-09-10; Stage 4 manual results reported on 2026-09-11.
- Environment: development / MVP
- Database: development Supabase project
- Production was not used.
- Manual API tests were executed from the browser against the local Next.js application (`localhost:3000`) connected to the development database.
- Secrets, anonymous cookie values and owner hashes are intentionally not recorded here.

## 1. Quiz attempts database migration

The `quiz_attempts` migration was applied to the development Supabase database.

The migration introduced the server-side quiz-attempt model, including `quiz_attempts`, `quiz_attempt_answers`, the `quiz_results.attempt_id` relationship, and the RPCs used to record answers and finish attempts.

### Automated SQL verification

`supabase/tests/quiz_attempts.sql` was executed against the development database and completed without an error.

Verified by this test suite include:

- attempt constraints and foreign keys;
- anonymous owner-hash validation;
- answer index validation;
- challenge membership and question order;
- first-answer immutability;
- idempotent replay of the same answer;
- timeout handling (`selected_index = -1`);
- result calculation from persisted answers;
- result ordering according to the challenge question order;
- completion retry behavior;
- relevant RLS and privilege restrictions.

The test runs inside a transaction. Because a real daily challenge already existed in the development database, the test temporarily moved its date, created its own fixture challenge, and ended with `ROLLBACK`.

Post-test verification confirmed:

- the original daily challenge was restored with its original date and question order;
- fixture questions remaining: `0`;
- fixture attempts remaining: `0`;
- fixture results remaining: `0`.

### Not yet verified at database level

The following tests remain deliberately deferred until a suitable local PostgreSQL/Supabase environment is available:

- real two-session concurrency scenarios documented in `supabase/tests/quiz_attempts-concurrency.md`;
- injected failure between result insertion and attempt completion to independently prove rollback/atomicity under forced failure.

These scenarios are **not considered tested**.

## 2. `POST /api/quiz/attempt/start`

Manual runtime verification was performed against the local Next.js application and development Supabase database.

### First start — PASS

A POST request with no query parameters and no body was sent from the browser.

Observed:

- HTTP `201`;
- `resumed: false`;
- `state: "in_progress"`;
- `answers: []`;
- `completedAt: null`;
- `result: null`;
- response contained the expected daily challenge;
- `questionIds` contained all 5 challenge questions in the correct order;
- `nextQuestionId` pointed to the first question.

### Resume with the same anonymous cookie — PASS

The same request was sent again from the same browser context.

Observed:

- HTTP `200`;
- `resumed: true`;
- the same `attemptId` was returned;
- the same `startedAt` was returned;
- challenge and question order were unchanged;
- `answers` remained empty;
- `nextQuestionId` still pointed to the first unanswered question.

This confirms the basic start/resume path for an existing anonymous browser identity.

## 3. `POST /api/quiz/answer`

Manual runtime verification was performed using the attempt created above. Answers were persisted to the development database through `record_quiz_attempt_answer`.

### First correct answer — PASS

The first challenge question was answered with its correct option.

Observed:

- HTTP `200`;
- `correct: true`;
- expected `correctIndex`;
- explanation returned as a string;
- `replayed: false`.

### Identical retry — PASS

The exact same answer was submitted again for the already answered question.

Observed:

- HTTP `200`;
- the same feedback was returned;
- `correct: true`;
- `replayed: true`.

This confirms idempotent replay of the same persisted answer.

### Attempt to change an already recorded answer — PASS

A different option was then submitted for the same question.

Observed:

- HTTP `409`;
- public error code `ANSWER_ALREADY_RECORDED`.

The previously accepted answer was not replaced. This confirms the intended first-answer immutability behavior in the tested flow.

### Question outside the challenge — PASS

A valid UUID that was not one of the current challenge question IDs was submitted.

Observed:

- HTTP `403`;
- public error code `QUESTION_NOT_IN_CHALLENGE`.

No answer was recorded for this request.

### Incorrect answer on the next question — PASS

The next challenge question was answered with an incorrect option.

Observed:

- HTTP `200`;
- `correct: false`;
- `correctIndex` matched the authoritative question data;
- explanation returned as a string;
- `replayed: false`.

### Timeout — PASS

The next challenge question was submitted with `selectedIndex: -1`.

Observed:

- HTTP `200`;
- `correct: false`;
- expected `correctIndex`;
- explanation returned as a string;
- `replayed: false`.

This confirms the API/RPC timeout representation used by the current design.

## 4. Runtime scenarios still not verified

The following scenarios have not yet been manually/runtime tested and must not be treated as confirmed:

- missing anonymous cookie on `/api/quiz/answer`;
- malformed anonymous cookie;
- foreign, missing or `null` Origin where applicable;
- invalid JSON and invalid request shapes;
- extra request fields and query parameters;
- `QUESTION_OUT_OF_ORDER` runtime response;
- attempt owned by another anonymous identity on /api/quiz/answer (finish protection is verified in Stage 4);
- `ATTEMPT_COMPLETED` behavior;
- `ATTEMPT_EXPIRED` behavior;
- simultaneous/concurrent requests from separate sessions;
- forced rollback/atomicity failure scenario;

## 5. Current checkpoint

At this checkpoint, the following are verified in the development environment:

- the quiz-attempt migration and main SQL test suite execute successfully;
- a browser can create an anonymous quiz attempt;
- the same browser identity resumes the same attempt;
- answers can be persisted server-side through the answer RPC;
- identical answer retries are idempotent;
- an accepted answer cannot be changed through the tested API flow;
- questions outside the challenge are rejected;
- correct, incorrect and timeout answers produce the expected feedback.

The frontend is now integrated with the `attemptId` answer contract and server-persisted resume flow. Result finalization was still pending at this checkpoint; see section 8 for completed Stage 4 verification.


## 6. Stage 3 — frontend integration with quiz attempts

### Automated verification — PASS

After the frontend integration was implemented:

- full TypeScript typecheck — **PASS**;
- `npm.cmd run build` — **PASS**;
- local test script — **28/28 PASS**;
- `git diff --check` — **PASS**.

The local tests used mocks and did not perform HTTP requests or Supabase mutations. They covered resume validation, shared in-flight attempt start, answer/replay contract, error handling, and rendering of both attempt summary states.

Exactly five application files were changed in this stage:

- `src/app/quiz/page.tsx`;
- `src/components/QuestionScreen.tsx`;
- `src/components/SummaryScreen.tsx`;
- `src/services/quizService.ts`;
- `src/types/quizAttempt.ts`.

No SQL, RPC, result endpoint or `saveQuizResult` changes were part of Stage 3.

### Manual browser verification — PASS

The following browser flows were manually confirmed:

- normal answer → feedback → “Next” transition;
- after two persisted answers, F5 resumed at question 3;
- F5 while feedback for question 3 was visible resumed at question 4, the first unanswered question;
- after all five answers, the summary rendered correctly in `ready_to_finish`;
- the attempts summary did not expose the legacy “Repeat” action or use the legacy result-save flow.

This confirms the tested frontend path uses server-persisted attempt answers as the source of truth for resume. This stage intentionally does **not** call `finish_quiz_attempt`, so `ready_to_finish` must not be interpreted as `completed`.

## 7. Checkpoint after Stage 3

Verified at this checkpoint:

- anonymous attempt start/resume works;
- answers are persisted server-side before feedback;
- accepted answers are immutable in the tested API flow;
- identical retries are idempotent;
- the frontend sends `attemptId` with answers;
- server-persisted answers are the source of truth for browser resume;
- refresh after persisted answers resumes at the first unanswered question;
- legacy local completion data no longer controls active quiz progress;
- the five-answer flow reaches `ready_to_finish` without calling the old result-save flow.

Pending at the Stage 3 checkpoint (historical; Stage 4 completion is recorded in section 8):

- product integration of `finish_quiz_attempt`;
- transition from `ready_to_finish` to `completed`;
- completed-attempt resume through the final product flow;
- manual coverage of remaining cookie/Origin/network/concurrency edge cases;
- isolated concurrency and injected-failure atomicity tests.

## 8. Stage 4 - quiz-attempt finalization

**The basic Stage 4 / quiz-attempt finalization flow is complete and manually verified.** The manual results below were reported by the project owner; this documentation update did not rerun HTTP requests or SQL.

### Implementation

- Added `POST /api/quiz/attempt/finish`; the JSON request contains exactly `{ attemptId, username }`.
- Username is required, trimmed, and limited to 20 Unicode code points.
- The endpoint requires a valid same-origin Origin, using the configured trusted origin policy.
- Finish uses the existing anonymous identity from the HttpOnly cookie. It neither creates nor refreshes the identity/cookie; the owner hash is derived exclusively on the server.
- Its only database call is the `finish_quiz_attempt` RPC.
- The database calculates score, totalQuestions and answersPattern from persisted answers; these values are not accepted from the client.
- PostgreSQL atomically inserts the result and updates `completed_at`. A retry of a completed attempt returns the existing quiz_result idempotently.
- In `ready_to_finish`, the frontend offers a username form and result-save action. This state does not itself mean completed.
- After confirmed finish, the frontend synchronizes through `/api/quiz/attempt/start`. Finish does not return or synthesize completedAt; the complete state and timestamp come from resume.
- A failed resync after confirmed finish preserves the saved result and offers synchronization retry, without restoring the finalization form.
- `completed` displays the server result without a form or Repeat action.
- `footquiz_username` remains only a UX preference; localStorage is not authoritative for results or progress.
- Legacy `/api/quiz/result` and `/quiz/result` remain reachable, but the current Daily Quiz attempts flow does not use them. Cleanup/decommission is a separate future step.

### Automated verification - PASS

- Full TypeScript typecheck - **PASS**.
- `npm.cmd run build` - **PASS**.
- **53 mocked tests - PASS**.
- `git diff --check` - **PASS**.

The mocked tests cover request/identity validation, RPC error mapping, safe result mapping, retry payload preservation, duplicate-submit protection, and retaining confirmed results after resync/localStorage failures. They do not prove real database concurrency or forced rollback behavior.

### Manual Stage 4 tests - PASS

#### 1. Happy path finalization - PASS

- The completed attempt was saved with username `Kuba`.
- The UI displayed confirmation that the result was saved.

#### 2. Completed resume - PASS

- F5 after finalization kept the user on the completed result screen.
- The result was restored from server state.

#### 3. Idempotent finish retry - PASS

Attempt ID: `e4d286e7-0a40-4122-b63a-916943c23a85`.

A repeated POST to `/api/quiz/attempt/finish` returned:

- HTTP `200`;
- `replayed: true`;
- result ID: `fc5569a6-a82e-4714-a157-061d7128478f`;
- score: `2`;
- totalQuestions: `5`;
- answersPattern: `10001`;
- username: `Kuba`.

#### 4. No duplicate quiz_result - PASS

An SQL lookup by attempt_id `e4d286e7-0a40-4122-b63a-916943c23a85` returned exactly **1 record**. This confirms the tested sequential retry, not two-session concurrency.

#### 5. Incomplete attempt protection - PASS

Attempt ID: `03730f15-8465-4ce4-ab16-4429e792a4f9`.

Finish before all questions were answered returned:

- HTTP `409`;
- `error.code: ATTEMPT_INCOMPLETE`.

#### 6. Foreign owner protection - PASS

Finish from Edge for an attempt belonging to the anonymous Chrome identity returned:

- HTTP `403`;
- `error.code: ATTEMPT_FORBIDDEN`.

#### 7. Missing anonymous cookie - PASS

POST finish with `credentials: omit` returned:

- HTTP `401`;
- `error.code: ANONYMOUS_IDENTITY_REQUIRED`.

### Known / deferred

The basic finalization flow is verified; the following are not marked complete:

- Real two-session DB concurrency tests.
- Forced failure/rollback between INSERT quiz_results and UPDATE completed_at. Procedures remain in `supabase/tests/quiz_attempts-concurrency.md`.
- Cookie reset/incognito bypass remains an accepted MVP limitation.
- The timer remains client-side and resets on refresh for an unresolved question.
- UTC day boundaries remain a known limitation: start targets today's challenge; an open attempt from a previous UTC day cannot be finalized.
- Cleanup/decommission of the legacy result routes is deferred.

The remaining Origin, malformed-cookie and network edge cases are not promoted to manually verified by these seven tests.

## 9. Stage 5 - legacy result decommission

Legacy /api/quiz/result and /quiz/result Route Handlers, server/client saveQuizResult, legacy request types and SummaryScreen branches have been removed. SummaryScreen now supports attempts only.

The sole supported application write path is Daily Quiz → persisted attempt answers → POST /api/quiz/attempt/finish → finish_quiz_attempt → quiz_results with attempt_id. Stage 3/4 descriptions above are historical checkpoints; their statements that legacy routes remained reachable no longer describe the Stage 5 code.

### Scope and database boundary

No SQL, migrations, schema, SQL tests or historical data were changed. Historical rows with attempt_id=NULL remain supported. service_role retains INSERT and finish_quiz_attempt remains SECURITY INVOKER; Stage 5 does not prohibit every direct database INSERT. DB-level hardening is deferred.

### Automated verification

- Full TypeScript typecheck - **PASS**.
- npm.cmd run build - **PASS**; neither legacy result route appears in the build route list.
- Local regression script with mocked dependencies - **13 checks PASS**: finish/replay, identical retry, confirmed finish with failed resync/storage, completed resume, SummaryScreen visibility/sharing and unchanged ranking reads including historical rows.
- Application source search - no legacy route, save function or request-type references; only finish RPC creates quiz_results.
- git diff --check - **PASS**.

The repository has no persisted application test runner/script; regression checks ran in memory using the existing Next.js compiler and mocks, with no network or SQL. The first build encountered stale generated .next/dev/types/validator.ts imports of removed routes; that generated file was removed and the build passed. No configuration change was required. No manual Stage 5 tests are claimed as PASS.

### Manual verification - pending

- Complete the quiz, finalize, then refresh the completed result.
- Retry finish: same result, no duplicate.
- POST old valid payloads to both removed routes: expected 404 after deploying the new build, no result insertion.
- Browser Network uses only attempt/finish for result creation.
- Ranking still shows historical and new results; NULL attempt_id rows are untouched.
- Admin opens normally; summary sharing, nickname and identical retry still work.
- Real two-session concurrency and forced rollback remain deferred, not covered by removing routes.
