// Local mocks only: node tests/leaderboard.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const swc = require('next/dist/build/swc');
let checks = 0;
const check = (value) => { assert.ok(value); checks++; };
async function compile(file, mocks = {}) {
  const { code } = await swc.transform(fs.readFileSync(file, 'utf8'), {
    filename: file, jsc: { parser: { syntax: 'typescript', tsx: file.endsWith('tsx') },
      transform: { react: { runtime: 'classic' } }, target: 'es2020' }, module: { type: 'commonjs' },
  });
  const mod = { exports: {} };
  new Function('require', 'module', 'exports', code)(id => mocks[id] ?? require(id), mod, mod.exports);
  return mod.exports;
}
(async () => {
  await swc.loadBindings();
  let dbError = null, rows = Array.from({ length: 12 }, (_, i) => ({ id: String(i), username: 'Kuba2', score: 3,
    total_questions: 5, attempt_id: i ? null : 'private', user_id: 'private', answers_pattern: '10001' }));
  let calls = [];
  const db = { from(table) { calls.push(['from', table]); return this; },
    select(fields) { calls.push(['select', fields]); return this; },
    eq(...args) { calls.push(['eq', ...args]); return this; },
    order(...args) { calls.push(['order', ...args]); return this; },
    async limit(n) { calls.push(['limit', n]); return { data: rows.slice(0, n), error: dbError }; } };
  const route = await compile('src/app/api/quiz/leaderboard/route.ts', {
    '@/server/supabaseAdmin': { createSupabaseAdmin: () => db },
  });
  let response = await route.GET(), body = await response.json();
  check(response.status === 200 && body.leaderboard.length === 10);
  assert.deepEqual(body.leaderboard[0], { id: '0', username: 'Kuba2', score: 3, totalQuestions: 5 }); checks++;
  check(response.headers.get('cache-control') === 'no-store');
  assert.deepEqual(calls, [['from', 'quiz_results'], ['select', 'id, username, score, total_questions'],
    ['eq', 'played_at', new Date().toISOString().slice(0,10)], ['order', 'score', { ascending: false }],
    ['order', 'time_taken', { ascending: true }], ['limit', 10]]); checks++;
  check(!JSON.stringify(body).match(/attempt_id|user_id|answers_pattern|time_taken|played_at/));
  rows = []; response = await route.GET(); check(response.status === 200 && (await response.json()).leaderboard.length === 0);
  dbError = { message: 'private database error' }; response = await route.GET();
  check(response.status === 500); assert.deepEqual(await response.json(), { error: { code: 'LEADERBOARD_UNAVAILABLE' } }); checks++;
  const service = await compile('src/services/quizService.ts');
  const originalFetch = global.fetch;
  try {
    global.fetch = async (url, options) => { check(url === '/api/quiz/leaderboard' && options.cache === 'no-store');
      return Response.json({ leaderboard: [{ id: '1', username: 'Kuba2', score: 3, totalQuestions: 5 }] }); };
    check((await service.getTodayLeaderboard())[0].totalQuestions === 5);
    global.fetch = async () => Response.json({ error: { code: 'LEADERBOARD_UNAVAILABLE' } }, { status: 500 });
    await assert.rejects(service.getTodayLeaderboard(), /LEADERBOARD_UNAVAILABLE/); checks++;
  } finally { global.fetch = originalFetch; }
  // Drive the actual component hooks with a mocked service; no DOM/network required.
  let states = [], cursor = 0, effect, fail = false, entries = [], count = 0;
  const react = { createElement: (type, props, ...children) => ({ type, props: props ?? {}, children }),
    useState(initial) { const i = cursor++; if (!(i in states)) states[i] = initial;
      return [states[i], value => { states[i] = value; }]; },
    useRef: value => ({current:value}), useCallback: fn => fn, useEffect: (fn,deps) => { if(deps.length === 1) effect = fn; } };
  const Page = (await compile('src/app/page.tsx', { react, '@/lib/quizAnalytics': {leaderboardViewed(){}}, '@/lib/analyticsState': {captureAttribution(){}},
    '@/services/quizService': { getTodayLeaderboard: async () => { count++; if (fail) throw Error('unavailable'); return entries; } },
    'next/link': () => null, 'lucide-react': {} })).default;
  const render = () => { cursor = 0; return Page(); };
  const text = tree => JSON.stringify(tree);
  const settle = () => new Promise(resolve => setImmediate(resolve));
  render(); effect(); await settle(); check(text(render()).includes('pierwszy'));
  fail = true; effect(); await settle(); let tree = render();
  check(text(tree).includes('role') && !text(tree).includes('pierwszy'));
  const findButton = node => {
    if (!node || typeof node !== 'object') return null;
    if (node.type === 'button' && node.props.onClick) return node;
    for (const child of (Array.isArray(node) ? node : node.children ?? [])) { const found = findButton(child); if (found) return found; }
    return null;
  };
  fail = false; entries = [{ id: '1', username: 'Kuba2', score: 3, totalQuestions: 5 }];
  const before = count; findButton(tree).props.onClick(); await settle(); tree = render();
  check(count === before + 1 && text(tree).includes('Kuba2') && !text(tree).includes('role'));
  check(!fs.readFileSync('src/services/quizService.ts','utf8').includes("from('quiz_results')"));
  check(!fs.readFileSync('src/services/quizService.ts','utf8').includes('@/lib/supabase'));
  console.log(`PASS: ${checks} leaderboard regression checks (mocked, no HTTP/SQL)`);
})().catch(error => { console.error(error); process.exitCode = 1; });
