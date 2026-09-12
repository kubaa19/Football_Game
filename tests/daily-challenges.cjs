// Run: node tests/daily-challenges.cjs. No network/SQL; RPC persistence is mocked.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const swc = require('next/dist/build/swc');
const { NextRequest } = require('next/server');
let passed = 0;
async function test(name, fn) { await fn(); passed++; console.log('PASS:', name); }
async function compile(file, mocks) {
 const { code } = await swc.transform(fs.readFileSync(file,'utf8'), { filename:file,
  jsc:{parser:{syntax:'typescript',tsx:file.endsWith('tsx')},transform:{react:{runtime:'classic'}},target:'es2020'},module:{type:'commonjs'} });
 const mod={exports:{}}; new Function('require','module','exports',code)(id => id==='server-only' ? {} : mocks[id] ?? require(id),mod,mod.exports); return mod.exports;
}
const id=n=>`a1000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const ids=[1,2,3,4,5].map(id), owner='a'.repeat(64), RealDate=Date;
let now='2040-01-01T12:00:00Z';
class Clock extends RealDate { constructor(...args){super(...(args.length?args:[now]));} static now(){return new RealDate(now).getTime();} }
let state;
function reset(extra={}) { now='2040-01-01T12:00:00Z'; state={exists:true,reads:0,rpcs:[],inserts:0,answers:[],result:null,attempt:null,...extra}; }
const questions=ids.map(id=>({id,category:'world_cup',difficulty:1,question:'Test',options:['A','B','C','D'],tags:['test'],correct_index:1,explanation:'private'}));
const db={
 from(table){ let insert=false; const q={select(){return q;},eq(){return q;},in(){return q;},insert(){insert=true;return q;},
  maybeSingle:async()=>run(),single:async()=>run(),then:(ok,bad)=>Promise.resolve().then(run).then(ok,bad)};
  function run(){
   if(table==='daily_challenges') { state.reads++; if(state.reads===1 && state.readError)return {error:{message:'private'}};
    if(state.reads===2 && state.midnightRead)now='2040-01-02T00:00:00Z';
    return {data:state.exists?{id:id(10),date:'2040-01-01',question_ids:state.ids??ids}:null,error:null}; }
   if(table==='questions')return {data:state.questions??questions,error:null};
   if(table==='quiz_attempts'){if(insert){state.inserts++;state.attempt={id:id(20),started_at:'2040-01-01T12:00:00Z',completed_at:null};}return {data:state.attempt,error:null};}
   if(table==='quiz_attempt_answers')return {data:state.answers,error:null};
   if(table==='quiz_results')return {data:state.result,error:null};
   throw Error('Unexpected table '+table);
  }return q;
 },
 async rpc(name,args){state.rpcs.push([name,args]);
  if(name==='ensure_daily_challenge'){
   if(state.transport)throw Error('private transport');
   if(state.rpcError)return {data:null,error:state.rpcError};
   if(!state.stillMissing)state.exists=true;
   if(state.midnight)now='2040-01-02T00:00:00Z';
   return {data:state.payload??{challengeId:id(10),challengeDate:'2040-01-01',questionIds:ids,created:true,correct_index:3,explanation:'private'},error:null};
  }
  if(name==='record_quiz_attempt_answer'){
   const prior=state.answers.find(a=>a.question_id===args.p_question_id);
   if(!prior)state.answers.push({question_id:args.p_question_id,selected_index:args.p_selected_index,is_correct:args.p_selected_index===1});
   return {data:{questionId:args.p_question_id,selectedIndex:args.p_selected_index,correct:args.p_selected_index===1,correctIndex:1,explanation:'Feedback',replayed:!!prior},error:null};
  }
  if(name==='finish_quiz_attempt'){
   const replayed=!!state.result;
   state.result??={id:id(30),attempt_id:id(20),username:args.p_username,score:2,total_questions:5,answers_pattern:'10010',played_at:'2040-01-01'};
   state.attempt.completed_at='2040-01-01T12:01:00Z';return {data:{success:true,result:state.result,replayed},error:null};
  }throw Error('Unexpected RPC');
 }
};
(async()=>{
 await swc.loadBindings(); global.Date=Clock;
 process.env.APP_ORIGIN='https://footquiz.test';process.env.NEXT_PUBLIC_SUPABASE_URL='https://unused.test';process.env.SUPABASE_SECRET_KEY='mock';
 const admin={createSupabaseAdmin:()=>db};
 const helper=await compile('src/server/ensureDailyChallenge.ts',{'./supabaseAdmin':admin});
 const start=await compile('src/server/startQuizAttempt.ts',{'./supabaseAdmin':admin,'./ensureDailyChallenge':helper});
 const identity={readAnonymousIdentity:()=>({ownerHash:owner}),getOrCreateAnonymousIdentity:()=>({ownerHash:owner,setCookie(){}})};
 const routes={};
 for(const [key,path] of Object.entries({start:'attempt/start',answer:'answer',finish:'attempt/finish'}))routes[key]=await compile(`src/app/api/quiz/${path}/route.ts`,{
  '@/server/startQuizAttempt':start,'@/server/supabaseAdmin':admin,'@/server/anonymousIdentity':identity});
 const request=(path,body)=>new NextRequest(`https://footquiz.test/api/quiz/${path}`,{method:'POST',headers:{Origin:'https://footquiz.test',...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
 const reject=async(code)=>{await assert.rejects(start.startQuizAttempt(owner),e=>e.code===code);assert.equal(state.inserts,0);};
 await test('existing: no publisher',async()=>{reset();assert.equal((await start.startQuizAttempt(owner)).state,'in_progress');assert.equal(state.rpcs.length,0);});
 await test('missing: exactly one publisher, reread, create',async()=>{reset({exists:false});await start.startQuizAttempt(owner);assert.equal(state.reads,2);assert.equal(state.rpcs.length,1);assert.equal(state.inserts,1);assert.deepEqual(state.rpcs[0],['ensure_daily_challenge',{p_date:'2040-01-01'}]);});
 await test('insufficient: public 503, no attempt',async()=>{reset({exists:false,rpcError:{code:'P0001',message:'INSUFFICIENT_ELIGIBLE_QUESTIONS'}});const r=await routes.start.POST(request('attempt/start'));assert.equal(r.status,503);assert.deepEqual(await r.json(),{error:{code:'DAILY_CHALLENGE_UNAVAILABLE'}});assert.equal(state.inserts,0);});
 await test('invalid challenge mapped',async()=>{reset({exists:false,rpcError:{code:'P0001',message:'DAILY_CHALLENGE_INVALID'}});await reject('DAILY_CHALLENGE_INVALID');});
 for(const mode of ['transport','database'])await test(mode+' failure: no attempt',async()=>{reset({exists:false,...(mode==='transport'?{transport:true}:{rpcError:{code:'XX000',message:'private'}})});await reject('ATTEMPT_START_UNAVAILABLE');});
 await test('initial SELECT error: no publisher',async()=>{reset({readError:true});await reject('ATTEMPT_START_UNAVAILABLE');assert.equal(state.rpcs.length,0);});
 await test('second SELECT missing',async()=>{reset({exists:false,stillMissing:true});await reject('DAILY_CHALLENGE_UNAVAILABLE');});
 for(const mode of ['midnight','midnightRead'])await test('UTC boundary '+mode,async()=>{reset({exists:false,[mode]:true});await reject('DAILY_CHALLENGE_CHANGED');});
 await test('helper whitelists metadata',async()=>{reset();assert.deepEqual(Object.keys(await helper.ensureDailyChallenge('2040-01-01')).sort(),['challengeDate','challengeId','created','questionIds']);});
 for(const payload of [{}, {challengeId:id(10),challengeDate:'2040-01-01',created:true,questionIds:[ids[0],...ids.slice(0,4)]}])await test('bad metadata rejected',async()=>{reset({exists:false,payload});await reject('DAILY_CHALLENGE_INVALID');});
 await test('invalid input date never calls RPC',async()=>{reset();await assert.rejects(helper.ensureDailyChallenge('2040-02-31'));assert.equal(state.rpcs.length,0);});
 const daily=await compile('src/app/api/quiz/daily/route.ts',{'@supabase/supabase-js':{createClient:()=>db}});
 await test('daily read-only safe ordered five',async()=>{reset({questions:[...questions].reverse()});const r=await daily.GET(),rows=await r.json();assert.equal(r.status,200);assert.deepEqual(rows.map(q=>q.id),ids);assert.deepEqual(Object.keys(rows[0]).sort(),['category','difficulty','id','options','question','tags']);assert.equal(state.rpcs.length,0);assert.equal(state.inserts,0);});
 for(const n of [4,6])await test('daily rejects '+n+' IDs',async()=>{reset({ids:Array.from({length:n},(_,i)=>id(i+1))});assert.equal((await daily.GET()).status,500);assert.equal(state.rpcs.length,0);});
 await test('daily missing remains 404, no publisher',async()=>{reset({exists:false});assert.equal((await daily.GET()).status,404);assert.equal(state.rpcs.length,0);});
 await test('daily incomplete rows rejected',async()=>{reset({questions:questions.slice(0,4)});assert.equal((await daily.GET()).status,500);});
 await test('start-answer-finish-resume via real handlers, mocked DB/identity',async()=>{
  reset({exists:false});let r=await routes.start.POST(request('attempt/start'));assert.equal(r.status,201);
  const choices=[1,0,-1,1,-1];for(let i=0;i<5;i++){r=await routes.answer.POST(request('answer',{attemptId:id(20),questionId:ids[i],selectedIndex:choices[i]}));assert.equal(r.status,200);}
  r=await routes.start.POST(request('attempt/start'));assert.equal((await r.json()).state,'ready_to_finish');
  r=await routes.finish.POST(request('attempt/finish',{attemptId:id(20),username:'Test'}));assert.equal(r.status,200);assert.equal((await r.json()).result.answersPattern,'10010');
  r=await routes.finish.POST(request('attempt/finish',{attemptId:id(20),username:'Test'}));assert.equal((await r.json()).replayed,true);
  r=await routes.start.POST(request('attempt/start'));const done=await r.json();assert.equal(done.state,'completed');assert.equal(done.result.score,2);assert.equal(state.rpcs.filter(([n])=>n==='ensure_daily_challenge').length,1);
 });
 // Actual page error branch with hooks mocked; not an end-to-end browser test.
 const service=await compile('src/services/quizService.ts',{});let values=[],cursor=0,effect;
 const React={createElement:(type,props,...children)=>({type,props,children}),useState:initial=>{const i=cursor++;if(!(i in values))values[i]=initial;return [values[i],v=>values[i]=v];},useRef:v=>({current:v}),useCallback:f=>f,useEffect:f=>{effect=f;}};
 const Page=(await compile('src/app/quiz/page.tsx',{'@/lib/quizAnalytics':{quizViewed(){},quizStarted(){},quizCompleted(){}},react:React,'lucide-react':{},'@/components/QuestionScreen':()=>null,'@/components/SummaryScreen':()=>null,'@/services/quizService':{...service,startDailyAttempt:async()=>{throw new service.QuizApiError('DAILY_CHALLENGE_UNAVAILABLE');}}})).default;
 await test('UI unavailable message',async()=>{Page();effect();await new Promise(r=>setImmediate(r));cursor=0;assert.ok(JSON.stringify(Page()).includes('Dzisiejszy quiz jest chwilowo'));});
 console.log(`PASS: ${passed} tests; no HTTP or SQL executed. RPC rules/identity mocked.`);
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>{global.Date=RealDate;});
