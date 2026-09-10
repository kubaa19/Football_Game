# FootQuiz — Testing & Verification

This document records tests that have actually been executed for FootQuiz. It is intended to be extended as subsequent backend and frontend stages are completed.

## Test environment

- Test date: 2026-09-10
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
- attempt owned by another anonymous identity;
- `ATTEMPT_COMPLETED` behavior;
- `ATTEMPT_EXPIRED` behavior;
- simultaneous/concurrent requests from separate sessions;
- forced rollback/atomicity failure scenario;
- completed-attempt resume response;
- server-side finalization through `finish_quiz_attempt` in the product flow.

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

The frontend is now integrated with the `attemptId` answer contract and server-persisted resume flow. Result finalization through `finish_quiz_attempt` remains a separate future stage.


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

Still pending:

- product integration of `finish_quiz_attempt`;
- transition from `ready_to_finish` to `completed`;
- completed-attempt resume through the final product flow;
- manual coverage of remaining cookie/Origin/network/concurrency edge cases;
- isolated concurrency and injected-failure atomicity tests.
