// Local mocks only: no HTTP, SQL or real Umami.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const swc = require('next/dist/build/swc');
const { randomUUID } = require('node:crypto');
async function compile(file, mocks = {}) {
 const {code} = await swc.transform(fs.readFileSync(file,'utf8'), {
  filename:file, jsc:{parser:{syntax:'typescript',tsx:file.endsWith('tsx')},target:'es2020',
  transform:{react:{runtime:'classic'}}},module:{type:'commonjs'}});
 const mod={exports:{}};
 new Function('require','module','exports',code)(id=>mocks[id]??require(id),mod,mod.exports);
 return mod.exports;
}
const storage = () => { const data=new Map(); return {
 getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,String(v)),removeItem:k=>data.delete(k),data
}; };
(async()=>{
 await swc.loadBindings();
 const local=storage(), session=storage();
 global.window={localStorage:local,sessionStorage:session,crypto:{randomUUID},
  location:{hostname:'localhost',href:'http://localhost/'},dispatchEvent(){}};
 process.env.NEXT_PUBLIC_UMAMI_WEBSITE_ID='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
 const identity=await compile('src/lib/analyticsIdentity.ts');
 const state=await compile('src/lib/analyticsState.ts',{'./analyticsIdentity':identity});
 const analytics=await compile('src/lib/analytics.ts',{'./analyticsIdentity':identity,'./analyticsState':state});
 const keys=identity.ANALYTICS_KEYS;
 let calls=[],count=0;
 const provider={async identify(id){calls.push(['identify',id]);},async track(data){calls.push(['track',data]);}};
 async function test(name,fn){await fn();count++;console.log('PASS:',name);}
 await test('unknown: no ID or events',async()=>{
  assert.equal(identity.getAnalyticsIdentity(),null);
  await analytics.initializeAnalytics(provider);await analytics.track('leaderboard_viewed',{});
  assert.equal(calls.length,0);assert.equal(local.getItem(keys.identity),null);
 });
 await test('accepted: UUID and stable reinitialization',async()=>{
  identity.setAnalyticsConsent('accepted');const id=identity.getAnalyticsIdentity();
  assert.match(id,/^[a-f0-9-]{36}$/);assert.equal(identity.getAnalyticsIdentity(),id);
  await analytics.initializeAnalytics(provider);await analytics.initializeAnalytics(provider);
  assert.equal(calls[0][1],id);assert.equal(calls[1][1],id);
 });
 await test('identify precedes track and safe complete payload',async()=>{
  calls=[];await analytics.initializeAnalytics(provider);
  await analytics.track('quiz_started',{challenge_date:'2040-01-01',resumed:false,username:'SECRET',options:['SECRET']});
  assert.deepEqual(calls.map(c=>c[0]),['identify','track']);
  const p=calls[1][1];
  assert.deepEqual(Object.keys(p).sort(),['data','hostname','id','name','url','website']);
  assert.deepEqual(p.data,{challenge_date:'2040-01-01',resumed:false});
  assert.ok(!JSON.stringify(p).includes('SECRET'));
 });
 await test('all event whitelists and invalid inputs',async()=>{
  calls=[];
  for(const [name,p] of [['quiz_viewed',{}],['leaderboard_viewed',{}],
   ['question_answered',{challenge_date:'2040-01-01',question_number:1,correct:false,timed_out:true}],
   ['quiz_completed',{challenge_date:'2040-01-01',score:2,total_questions:5}]]){
    await analytics.track(name,{...p,anonymous_token_hash:'SECRET',selectedIndex:1,correctIndex:2,explanation:'SECRET',answers_pattern:'SECRET'});
  }
  assert.equal(calls.length,4);assert.ok(!JSON.stringify(calls).includes('SECRET'));
  for(const [name,p] of [['result_saved',{}],['quiz_completed',{challenge_date:'2040-01-01',score:6,total_questions:5}],
   ['quiz_started',{challenge_date:'2040-02-31',resumed:false}],
   ['question_answered',{challenge_date:'2040-01-01',question_number:1,correct:true,timed_out:true}]]){
    await analytics.track(name,p);
  }
  assert.equal(calls.length,4);
 });
 await test('identify payload excludes default fields',async()=>{
  const p=analytics.sanitizeUmamiPayload('identify',{id:identity.getAnalyticsIdentity(),url:'/secret?token=SECRET',data:{username:'SECRET'},referrer:'SECRET'});
  assert.deepEqual(Object.keys(p).sort(),['hostname','id','url','website']);
  assert.equal(p.url,'/');
 });
 await test('provider exceptions never escape',async()=>{
  await analytics.initializeAnalytics({async identify(){throw Error('provider');},async track(){throw Error('provider');}});
  await analytics.track('leaderboard_viewed',{});
  await analytics.initializeAnalytics({async identify(){},async track(){throw Error('provider');}});
  await analytics.track('leaderboard_viewed',{});
 });
 await test('withdrawal removes only analytics data and suppresses events',async()=>{
  local.setItem('footquiz_username','Kuba');local.setItem('unrelated','keep');
  for(const s of [local,session])for(const k of [keys.attribution,keys.dedup])s.setItem(k,'x');
  identity.setAnalyticsConsent('rejected');calls=[];
  await analytics.track('leaderboard_viewed',{});
  assert.equal(calls.length,0);assert.equal(identity.getAnalyticsIdentity(),null);
  for(const s of [local,session])for(const k of [keys.identity,keys.attribution,keys.dedup])assert.equal(s.getItem(k),null);
  assert.equal(local.getItem('footquiz_username'),'Kuba');assert.equal(local.getItem('unrelated'),'keep');
  assert.equal(local.getItem(keys.consent),'rejected');
  assert.equal(analytics.sanitizeUmamiPayload('identify',{id:'x'}),null);
 });
 await test('invalid ID regenerated',async()=>{
  identity.setAnalyticsConsent('accepted');local.setItem(keys.identity,'invalid');
  assert.notEqual(identity.getAnalyticsIdentity(),'invalid');
  assert.match(identity.getAnalyticsIdentity(),/^[a-f0-9-]{36}$/);
 });
 await test('storage unavailable fails closed',async()=>{
  window.localStorage={getItem(){throw Error('storage');},setItem(){throw Error('storage');},removeItem(){throw Error('storage');}};
  assert.equal(identity.getAnalyticsIdentity(),null);identity.setAnalyticsConsent('accepted');
  await analytics.initializeAnalytics(provider);await analytics.track('leaderboard_viewed',{});
  window.localStorage=local;identity.setAnalyticsConsent('accepted');
 });
 await test('ID write failure does not produce memory-only identity',async()=>{
  local.removeItem(keys.identity);const set=local.setItem;local.setItem=()=>{throw Error('quota');};
  assert.equal(identity.getAnalyticsIdentity(),null);local.setItem=set;
 });
 await test('pending identify cannot activate after withdrawal',async()=>{
  identity.setAnalyticsConsent('accepted');let finish;
  const pending=analytics.initializeAnalytics({identify:()=>new Promise(r=>finish=r),track:provider.track});
  identity.setAnalyticsConsent('rejected');finish();await pending;calls=[];
  await analytics.track('leaderboard_viewed',{});assert.equal(calls.length,0);
 });
 await test('no track before identify readiness',async()=>{
  identity.setAnalyticsConsent('accepted');let finish;calls=[];
  const pending=analytics.initializeAnalytics({identify:()=>new Promise(r=>finish=r),track:provider.track});
  await analytics.track('leaderboard_viewed',{});assert.equal(calls.length,0);
  finish();await pending;await analytics.track('leaderboard_viewed',{});assert.equal(calls.length,1);
 });
 // Exercise consent component effect with a script loader mock.
 await test('component loads script only after acceptance, with automatic tracking disabled',async()=>{
  identity.setAnalyticsConsent('rejected');let effect,appended=[];
  window.addEventListener=()=>{};window.removeEventListener=()=>{};
  global.document={createElement:()=>({dataset:{}}),head:{appendChild:s=>appended.push(s)}};
  process.env.NEXT_PUBLIC_UMAMI_SCRIPT_URL='https://example.invalid/script.js';
  const React={createElement:()=>null,useState:v=>[v,()=>{}],useEffect:fn=>{effect=fn;}};
  const component=await compile('src/components/AnalyticsProvider.tsx',{
   react:React,'@/lib/analyticsState':state,'@/lib/analytics':analytics,'@/lib/analyticsIdentity':identity});
  component.default();let cleanup=effect();assert.equal(appended.length,0);cleanup();
  identity.setAnalyticsConsent('accepted');component.default();cleanup=effect();
  assert.equal(appended.length,1);assert.equal(appended[0].dataset.autoTrack,'false');
  assert.equal(appended[0].dataset.beforeSend,'footquizAnalyticsBeforeSend');
  identity.setAnalyticsConsent('rejected');window.umami=provider;appended[0].onload();
  await new Promise(r=>setImmediate(r));assert.equal(analytics.sanitizeUmamiPayload('event',{}),null);cleanup();
 });
 
 const events=await compile('src/lib/quizAnalytics.ts',{'./analytics':analytics,'./analyticsState':state});
 const settle=()=>new Promise(r=>setImmediate(r));
 const resetAnalytics=async()=>{ identity.setAnalyticsConsent('rejected');analytics.stopAnalytics();identity.setAnalyticsConsent('accepted');await analytics.initializeAnalytics(provider);calls=[];window.location.href='http://localhost/'; };
 const emitted=()=>calls.filter(c=>c[0]==='track').map(c=>c[1]);
 await test('views: same mount/Strict Mode one event; new navigation another',async()=>{
  await resetAnalytics();events.quizViewed('mount1');events.quizViewed('mount1');await settle();
  assert.equal(emitted().length,1);events.quizViewed('mount2');await settle();assert.equal(emitted().length,2);
 });
 await test('start new/partial once across adapter reinitialization; terminal states excluded',async()=>{
  await resetAnalytics();const a={attemptId:'a',challengeDate:'2040-01-01',state:'in_progress',nextQuestionId:'q',resumed:false};
  events.quizStarted(a);events.quizStarted({...a,resumed:true});await settle();
  await analytics.initializeAnalytics(provider);events.quizStarted({...a,resumed:true});
  events.quizStarted({...a,attemptId:'b',resumed:true});
  events.quizStarted({...a,attemptId:'c',state:'completed'});events.quizStarted({...a,attemptId:'d',state:'ready_to_finish',nextQuestionId:null});
  await settle();assert.equal(emitted().length,2);
 });
 await test('answer correct/wrong/timeout/replay-first and fifth answer does not complete',async()=>{
  await resetAnalytics();
  for(const [n,correct,timeout] of [[1,true,false],[2,false,false],[3,false,true],[5,true,false]]){
   events.questionAnswered('a','2040-01-01',n,correct,timeout);events.questionAnswered('a','2040-01-01',n,correct,timeout);
  }
  await settle();assert.equal(emitted().length,4);assert.ok(emitted().every(e=>e.name==='question_answered'));
  assert.equal(emitted()[2].data.timed_out,true);
 });
 await test('finish replay first confirmation then deduplicated',async()=>{
  await resetAnalytics();const confirmation={attemptId:'a',replayed:true,result:{playedAt:'2040-01-01',score:2,totalQuestions:5}};
  events.quizCompleted(confirmation);events.quizCompleted(confirmation);await settle();
  assert.equal(emitted().length,1);assert.equal(emitted()[0].name,'quiz_completed');
 });
 await test('UTM whitelist, new touch, navigation preservation, no UTM on answers',async()=>{
  await resetAnalytics();window.location.href='http://localhost/?utm_source=forum&utm_medium=organic&utm_campaign=launch&utm_content=link&token=SECRET';
  state.captureAttribution();window.location.href='http://localhost/quiz';events.quizViewed('utm');
  events.quizStarted({attemptId:'utm',challengeDate:'2040-01-01',resumed:false,state:'in_progress',nextQuestionId:'q'});
  events.questionAnswered('utm','2040-01-01',1,false,true);
  events.quizCompleted({attemptId:'utm',result:{playedAt:'2040-01-01',score:0,totalQuestions:5}});
  await settle();assert.equal(emitted()[0].data.utm_source,'forum');assert.equal(emitted()[1].data.utm_campaign,'launch');
  assert.ok(!('utm_source' in emitted()[2].data));assert.equal(emitted()[3].data.utm_medium,'organic');
  assert.ok(!JSON.stringify(emitted()).includes('SECRET'));
  window.location.href='http://localhost/?utm_source=new&utm_campaign='+ 'x'.repeat(81)+'&utm_medium=email@example.com';
  state.captureAttribution();assert.deepEqual(state.readAttribution(),{utm_source:'new'});
  identity.setAnalyticsConsent('rejected');state.captureAttribution();assert.equal(session.getItem(keys.attribution),null);
 });
 await test('bounded dedup and storage failure suppress telemetry',async()=>{
  await resetAnalytics();for(let i=0;i<600;i++)state.claimAnalyticsEvent('key'+i);
  assert.equal(JSON.parse(local.getItem(keys.dedup)).keys.length,512);
  const write=local.setItem;local.setItem=()=>{throw Error('quota');};
  events.quizViewed('blocked');await settle();assert.equal(emitted().length,0);local.setItem=write;
 });
 await test('queued consented events wait for readiness in order and are not retried on provider error',async()=>{
  await resetAnalytics();analytics.stopAnalytics();calls=[];
  events.quizViewed('queue');events.quizViewed('queue');assert.equal(emitted().length,0);
  await analytics.initializeAnalytics(provider);await settle();assert.equal(emitted().length,1);
  await analytics.initializeAnalytics({identify:provider.identify,track:async()=>{throw Error('offline');}});
  events.quizViewed('error');events.quizViewed('error');await settle();
  await analytics.initializeAnalytics(provider);events.quizViewed('error');await settle();assert.equal(emitted().length,1);
 });
 await test('withdrawal drops queued events including reject/reaccept',async()=>{
  await resetAnalytics();analytics.stopAnalytics();events.quizViewed('drop');
  identity.setAnalyticsConsent('rejected');analytics.stopAnalytics();identity.setAnalyticsConsent('accepted');
  await analytics.initializeAnalytics(provider);await settle();assert.equal(emitted().length,0);
 });
 // Small hook harness: execute actual components, service promises mocked.
 function harness(){
  const slots=[];let cursor=0,effects=[];
  const equal=(a,b)=>a&&b&&a.length===b.length&&a.every((v,i)=>Object.is(v,b[i]));
  const React={createElement:(type,props,...children)=>({type,props:props??{},children}),
   useState(initial){const i=cursor++;if(!(i in slots))slots[i]=initial;return [slots[i],v=>{slots[i]=typeof v==='function'?v(slots[i]):v;}];},
   useRef(initial){const i=cursor++;return slots[i]??=( {current:initial} );},
   useCallback(fn,deps){const i=cursor++;if(!slots[i]||!equal(slots[i].deps,deps))slots[i]={fn,deps};return slots[i].fn;},
   useEffect(fn,deps){const i=cursor++;if(!slots[i]||!equal(slots[i].deps,deps)){slots[i]={fn,deps};effects.push(fn);}}
  };
  return {React,render(Component,props){cursor=0;effects=[];const tree=Component(props);return {tree,effects:[...effects]};}};
 }
 function find(tree,predicate){
  if(!tree||typeof tree!=='object')return null;if(predicate(tree))return tree;
  for(const c of (Array.isArray(tree)?tree:tree.children??[])){const hit=find(c,predicate);if(hit)return hit;}
  return null;
 }
 const service=await compile('src/services/quizService.ts');

 // Use the real start service, resume validator, page and queue; only network/provider are mocked.
 await test('confirmed start before provider ready: gameplay proceeds, queue sends once after identify',async()=>{
  for(const resumed of [false,true]){
   identity.setAnalyticsConsent('rejected');analytics.stopAnalytics();
   identity.setAnalyticsConsent('accepted');calls=[];
   let releaseIdentify;
   const initializing=analytics.initializeAnalytics({
    identify:()=>new Promise(resolve=>{releaseIdentify=resolve;}),
    track:provider.track,
   });
   const ids=Array.from({length:5},()=>randomUUID());
   const attempt={attemptId:randomUUID(),challengeId:randomUUID(),challengeDate:'2040-01-01',
    resumed,startedAt:'2040-01-01T10:00:00Z',completedAt:null,state:'in_progress',
    questionIds:ids,answers:resumed?[{questionId:ids[0],selectedIndex:0,correct:true}]:[],
    nextQuestionId:ids[resumed?1:0],result:null};
   const daily=ids.map(id=>({id,category:'world_cup',difficulty:1,question:'Fixture',
    options:['A','B','C','D'],tags:['test']}));
   const originalFetch=global.fetch;
   global.fetch=async url=>{
    assert.ok(['/api/quiz/attempt/start','/api/quiz/daily'].includes(url));
    return {ok:true,json:async()=>url.endsWith('/start')?attempt:daily};
   };
   try {
    const h=harness();
    const Page=(await compile('src/app/quiz/page.tsx',{react:h.React,'lucide-react':{},
     '@/lib/quizAnalytics':events,'@/components/QuestionScreen':'Question',
     '@/components/SummaryScreen':'Summary','@/services/quizService':service})).default;
    const render=h.render(Page);const cleanups=render.effects.map(fn=>fn());
    cleanups.forEach(cleanup=>cleanup?.());render.effects.forEach(fn=>fn()); // Strict Mode
    await settle();
    assert.ok(find(h.render(Page).tree,node=>node.type==='Question'),'gameplay does not await identify');
    assert.equal(emitted().length,0);
    assert.ok(JSON.parse(local.getItem(keys.dedup)).keys.includes('start:'+attempt.attemptId));
    releaseIdentify();await initializing;await settle();
    events.quizStarted(service.validateAttemptResume(attempt,daily).attempt);
    await analytics.initializeAnalytics(provider);await settle();
    const starts=emitted().filter(event=>event.name==='quiz_started');
    assert.equal(starts.length,1);
    assert.deepEqual(starts[0].data,{challenge_date:'2040-01-01',resumed});
    assert.ok(!JSON.stringify(starts).includes(attempt.attemptId));
    assert.ok(!JSON.stringify(starts).includes('attemptId'));
   } finally {global.fetch=originalFetch;}
  }
 });

 const model={attemptId:'integration',challengeDate:'2040-01-01',state:'in_progress',nextQuestionId:'q',resumed:false,answers:[],questionIds:['q'],result:null};
 async function pageHarness(initial,finish){
  const h=harness();let current=initial,failStart=false;
  const mocks={...service,startDailyAttempt:async()=>{if(failStart)throw Error('resync');return current;},getDailyQuestions:async()=>[{id:'q',options:['a','b','c','d']}],
   validateAttemptResume:(attempt,questions)=>({attempt,questions}),finishQuizAttempt:finish};
  const Page=(await compile('src/app/quiz/page.tsx',{react:h.React,'lucide-react':{},'@/lib/quizAnalytics':events,
   '@/components/QuestionScreen':'Question','@/components/SummaryScreen':'Summary','@/services/quizService':mocks})).default;
  const first=h.render(Page);first.effects.forEach(f=>f());await settle();
  return {h,Page,first,setFail:()=>{failStart=true;},render:()=>h.render(Page)};
 }
 await test('real quiz page Strict effects + new/terminal resume triggers',async()=>{
  for(const stateName of ['in_progress','ready_to_finish','completed']){
   await resetAnalytics();const p=await pageHarness({...model,state:stateName,nextQuestionId:stateName==='in_progress'?'q':null},async()=>{});
   p.first.effects.forEach(f=>f());await settle();p.render();await settle();
   assert.equal(emitted().filter(e=>e.name==='quiz_viewed').length,1);
   assert.equal(emitted().filter(e=>e.name==='quiz_started').length,stateName==='in_progress'?1:0);
   assert.equal(emitted().filter(e=>e.name==='quiz_completed').length,0);
  }
 });
 await test('real page finish success survives resync failure; replay dedup; error does not emit',async()=>{
  await resetAnalytics();let fail=true;
  const confirmation={attemptId:model.attemptId,replayed:true,result:{playedAt:'2040-01-01',score:2,totalQuestions:5,username:'SECRET',answersPattern:'10001'}};
  const p=await pageHarness({...model,state:'ready_to_finish',nextQuestionId:null},async()=>{if(fail)throw new service.QuizApiError('NETWORK_ERROR');return confirmation;});
  let summary=find(p.render().tree,t=>t.type==='Summary');
  await summary.props.onFinish('name');await settle();assert.equal(emitted().filter(e=>e.name==='quiz_completed').length,0);
  fail=false;p.setFail();summary=find(p.render().tree,t=>t.type==='Summary');
  await summary.props.onFinish('name');await settle();
  assert.equal(emitted().filter(e=>e.name==='quiz_completed').length,1);
  assert.ok(find(p.render().tree,t=>t.type==='Summary').props.finishConfirmed);
  assert.ok(!JSON.stringify(emitted()).includes('SECRET'));
 });
 await test('real QuestionScreen error then replay-first records once',async()=>{
  await resetAnalytics();const h=harness();let fail=true,recorded=0;
  const Q=(await compile('src/components/QuestionScreen.tsx',{react:h.React,'lucide-react':{},'@/lib/quizAnalytics':events,
   '@/services/quizService':{...service,recordAttemptAnswer:async()=>{if(fail)throw new service.QuizApiError('NETWORK_ERROR');return {correct:true,replayed:true,correctIndex:0,explanation:'SECRET'};}}})).default;
  const props={attemptId:'question',challengeDate:'2040-01-01',question:{id:'SECRET',category:'world_cup',difficulty:1,question:'secret text',options:['A','B','C','D']},questionNumber:1,totalQuestions:5,onRecorded:()=>recorded++,onNext(){},onSynchronize(){}};
  let r=h.render(Q,props); // Only mount effect; do not run the real timer.
  r.effects[0]();let button=find(r.tree,t=>t.type==='button'&&t.props.onClick);
  button.props.onClick();await settle();assert.equal(emitted().length,0);
  fail=false;r=h.render(Q,props);
  button=find(r.tree,t=>t.type==='button'&&JSON.stringify(t.children).includes('Pon'));
  assert.ok(button);button.props.onClick();await settle();assert.equal(recorded,1);assert.equal(emitted().length,1);
 });
 await test('real leaderboard success/empty/error/retry and repeat effects',async()=>{
  for(const mode of ['empty','rows','error']){
   await resetAnalytics();const h=harness();let fail=mode==='error';
   const Page=(await compile('src/app/page.tsx',{react:h.React,'next/link':'Link','lucide-react':{},'@/lib/quizAnalytics':events,'@/lib/analyticsState':state,
    '@/services/quizService':{getTodayLeaderboard:async()=>{if(fail)throw Error('db');return mode==='rows'?[{id:'x',username:'SECRET',score:1,totalQuestions:5}]:[];}}})).default;
   let r=h.render(Page);r.effects.forEach(f=>f());await settle();r=h.render(Page);r.effects.forEach(f=>f());r.effects.forEach(f=>f());await settle();
   assert.equal(emitted().length,mode==='error'?0:1);
   if(fail){fail=false;find(r.tree,t=>t.type==='button').props.onClick();await settle();r=h.render(Page);r.effects.forEach(f=>f());await settle();assert.equal(emitted().length,1);}
  }
 });

console.log('PASS:',count,'analytics tests (mocked).');
})().catch(e=>{console.error(e);process.exitCode=1;});
