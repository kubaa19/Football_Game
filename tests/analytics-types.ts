import { track } from '../src/lib/analytics';
// Compile-only contract checks; never called and emits no events.
function analyticsTypeContract() {
  void track('quiz_completed', { challenge_date: '2040-01-01', score: 2, total_questions: 5 });
  // @ts-expect-error Removed event.
  void track('result_saved', {});
  // @ts-expect-error Forbidden extra property.
  void track('quiz_started', { challenge_date: '2040-01-01', resumed: false, username: 'private' });
  // @ts-expect-error Invalid question position.
  void track('question_answered', { challenge_date: '2040-01-01', question_number: 6, correct: false, timed_out: true });
  // @ts-expect-error No leaderboard properties.
  void track('leaderboard_viewed', { anonymous_token_hash: 'private' });
}
void analyticsTypeContract;
