import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { Buffer } from 'node:buffer';
import ts from 'typescript';
import { appSource, loadAppDeclarations } from './native-app-source-fixture.mjs';
const exports = {};
vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../lib/notification_intent.ts', import.meta.url), 'utf8'), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText, { exports, Date, Promise });
const { createNotificationIntentStore, parseNotificationIntent } = exports;
const now = Date.parse('2026-09-14T12:00:00Z');
const eventId = 'cd127d20-5406-4dfe-9743-2cb3f662a6f1';
const drawId = 'd1cfa1f0-56c6-44af-8c5c-289c390d45d5';
const token = 'app:0123456789abcdef0123456789abcdef';
const payload = (extra={}) => ({ v:1,event_id:eventId,recipient_member_id:'38971',screen:'chat',thread_token:token,
  expires_at:'2026-09-15T12:00:00Z',...extra });
function storageFixture() {
  const values = new Map(), writes=[];
  return {values,writes,getItemAsync:async key=>values.get(key)??null,
    setItemAsync:async(key,value)=>{writes.push(value);values.set(key,value);} };
}

test('strict v1 parser accepts real native aliases, strips PII/URLs and rejects malformed targets/expiry/calendar dates', () => {
  const parsed=parseNotificationIntent(payload({body:'private',url:'https://evil.invalid'}),'r',now);
  assert.equal(parsed.threadToken,token);assert.equal(parsed.recipientMemberId,'38971');assert(!('body' in parsed));assert(!('url' in parsed));
  for(const extra of [{v:2},{event_id:'bad'},{recipient_member_id:38971},{recipient_member_id:'038971'},
    {expires_at:'2026-09-13T00:00:00Z'},{expires_at:'2026-12-01T00:00:00Z'},{expires_at:'2026-09-31T00:00:00Z'},
    {expires_at:'tomorrow'},{expires_at:undefined},{thread_token:'app:https://evil.invalid'},{screen:'scanner'},
    {screen:'draw_result',draw_id:'bad'}]) assert.equal(parseNotificationIntent(payload(extra),'r',now),null,JSON.stringify(extra));
  assert.equal(parseNotificationIntent(payload({screen:'draw_result',draw_id:drawId}),'r',now).drawId,drawId);
  const legacy=parseNotificationIntent({screen:'chat',thread_token:token,recipient_member_id:'123'},'legacy-response',now);
  assert.equal(legacy.threadToken,undefined);assert.equal(legacy.recipientMemberId,null);
});

test('cold signed-out receipt persists; same-account sign-in restores once and durable dedup survives another launch',async()=>{
  const storage=storageFixture();const first=createNotificationIntentStore(storage,()=>now);
  assert.equal(await first.receive(payload(),'response-1'),'saved');
  let calls=0;assert.equal(await first.process(null,()=>true,async()=>{calls++;return 'handled';}),'waiting');assert.equal(calls,0);
  const cold=createNotificationIntentStore(storage,()=>now);
  assert.equal(await cold.process('38971',()=>true,async i=>{calls++;assert.equal(i.threadToken,token);return 'handled';}),'handled');
  assert.equal(await cold.peek(),null);assert.equal(calls,1);
  const again=createNotificationIntentStore(storage,()=>now);
  assert.equal(await again.receive(payload(),'another-os-response'),'duplicate');
  assert.equal(await again.process('38971',()=>true,async()=>{calls++;return 'handled';}),'idle');assert.equal(calls,1);
});

test('wrong account and expired pending records never invoke a destination',async()=>{
  for(const mode of ['wrong','expired']) {
    let clock=now;const store=createNotificationIntentStore(storageFixture(),()=>clock);await store.receive(payload(),'r');
    if(mode==='expired')clock+=2*86400000;
    let calls=0;assert.equal(await store.process(mode==='wrong'?'999':'38971',()=>true,async()=>{calls++;return 'handled';}),mode==='wrong'?'wrong_account':'expired');
    assert.equal(calls,0);assert.equal(await store.peek(),null);
  }
});

test('transient failure and account retirement retain retry; explicit unavailable completes without replay',async()=>{
  const store=createNotificationIntentStore(storageFixture(),()=>now);await store.receive(payload(),'r');
  assert.equal(await store.process('38971',()=>true,async()=>{throw Error('offline');}),'retry');assert(await store.peek());
  let current=true,release;const hold=new Promise(r=>release=r);
  const pending=store.process('38971',()=>current,async()=>{await hold;return 'handled';});await Promise.resolve();current=false;release();
  assert.equal(await pending,'retry');assert(await store.peek());
  assert.equal(await store.process('38971',()=>true,async()=> 'unavailable'),'unavailable');assert.equal(await store.peek(),null);
});

test('concurrent processing is serialized and a newer notification is not cleared by older completion',async()=>{
  const store=createNotificationIntentStore(storageFixture(),()=>now);await store.receive(payload(),'r');
  let release,entered;const started=new Promise(r=>entered=r),hold=new Promise(r=>release=r);let count=0;
  const one=store.process('38971',()=>true,async()=>{count++;entered();await hold;return 'handled';});await started;
  const duplicate=store.process('38971',()=>true,async()=>{count++;return 'handled';});release();await Promise.all([one,duplicate]);assert.equal(count,1);
  await store.receive(payload({event_id:'a12bc123-5406-4dfe-9743-2cb3f662a6f1'}),'r2');
  let release2,entered2;const started2=new Promise(r=>entered2=r),hold2=new Promise(r=>release2=r);
  const old=store.process('38971',()=>true,async()=>{entered2();await hold2;return 'handled';});await started2;
  await store.receive(payload({event_id:'b12bc123-5406-4dfe-9743-2cb3f662a6f1'}),'r3');release2();await old;
  assert.equal((await store.peek()).id,'event:b12bc123-5406-4dfe-9743-2cb3f662a6f1');
});

test('encrypted persistence fails closed and maximum stored record stays under two KiB',async()=>{
  const failed=createNotificationIntentStore({getItemAsync:async()=>null,setItemAsync:async()=>{throw Error('locked');}},()=>now);
  await assert.rejects(failed.receive(payload(),'r'));assert.equal(await failed.peek(),null);
  const storage=storageFixture(),store=createNotificationIntentStore(storage,()=>now);
  for(let n=0;n<12;n++){await store.receive({screen:'chat'},String(n).padStart(128,'x'));await store.process('38971',()=>true,async()=> 'handled');}
  await store.receive(payload({thread_token:'t'.repeat(128),recipient_member_id:'9'.repeat(20)}),'r');
  assert(storage.writes.every(raw=>Buffer.byteLength(raw,'utf8')<2048));
  assert.equal(JSON.parse(storage.writes.at(-1)).handled.length,6);
});

const result={draw_id:drawId,event_key:'event',viewer_role:'couple',vendor_id:'39081',vendor_name:'Cedar & Light',prize_title:'Portrait session',prize_description:'One portrait session',prize_approx_value_cad:100,claim_instructions:'Contact the vendor as stated in your winner email.',official_rules_url:'https://www.weddingwin.ca/about-terms',drawn_at:'2026-09-14T00:00:00Z',notice_sent_at:'2026-09-14T01:00:00Z',apple_non_sponsor_disclaimer:'Apple is not a sponsor.'};
function routingFixture(options={}) {
  const writes=[],requests=[];const ref=current=>({current});let release;const hold=options.hold?new Promise(r=>release=r):Promise.resolve();
  const globals={useCallback:fn=>fn,hasNativeTokenSession:s=>!!s?.token,memberAccountRole:m=>m.role,
    nativeBridgeSessionRef:ref({user_id:'38971',token:'synthetic-session'}),nativeMemberRef:ref({user_id:'38971',role:options.role??'couple'}),
    nativeSessionGenerationRef:ref(1),notificationRouteGenerationRef:ref(1),logoutInFlightRef:ref(false),pendingAppLogoutRef:ref(false),accountDeletionIsInFlight:()=>false,
    selectedChatThreadTokenRef:ref(''),beginNavigationIntent:async()=>1,
    QR_BINGO_SYNC_FUNCTION_URL:'https://offline.invalid',APP_BACKEND_PUBLISHABLE_KEY:'offline',
    fetchQrBingoJsonWithTimeout:async(url,init)=>{requests.push(JSON.parse(init.body));await hold;return {response:{ok:(options.status??200)===200,status:options.status??200},data:{ok:true,result:options.result??result}};},
    syncNativeChat:async(action,opts)=>{requests.push({action,opts});await hold;opts.onNotificationResponse(options.status??200,{});return options.chatNull?null:{selected_thread_token:options.resolvedToken??token,notification_target:{requested_thread_token:token,resolved_thread_token:options.resolvedToken??token},threads:[{token:options.resolvedToken??token}]};},
  };
  for(const key of ['setSelectedChatThreadToken','dismissAnyKeyboard','hideWebsiteBrowser','setNotificationDrawResult','setShowNativeQrScanner','setNativeChatThreadOpen','setNativeChatOpenRequestId','setShowNativeChat','openVendorDrawSettings'])globals[key]=(...args)=>writes.push([key,...args]);
  const api=loadAppDeclarations(['isNotificationDrawResult','routeNotificationIntent'],globals);
  return {api,globals,writes,requests,release:()=>release?.()};
}

test('actual native route opens authenticated exact chat and supported alias; legacy opens own inbox only',async()=>{
  for(const alias of [token,'0123456789abcdef0123456789abcdef']) {
    const f=routingFixture({resolvedToken:alias});assert.equal(await f.api.routeNotificationIntent(parseNotificationIntent(payload(),'r',now)),'handled');
    assert.equal(f.requests[0].action,'read');assert.equal(f.requests[0].opts.threadToken,token);assert(f.writes.some(x=>x[0]==='setNativeChatThreadOpen'&&x[1]));
  }
  const f=routingFixture();assert.equal(await f.api.routeNotificationIntent(parseNotificationIntent({screen:'chat',thread_token:token},'old',now)),'handled');assert.equal(f.requests[0].action,'list');
});

test('actual native route fetches read-only couple result without scanner window; vendor opens focused Winners request',async()=>{
  const f=routingFixture();const intent=parseNotificationIntent(payload({screen:'draw_result',draw_id:drawId}),'r',now);
  assert.equal(await f.api.routeNotificationIntent(intent),'handled');
  assert.deepEqual(f.requests[0],{action:'draw_result_get',native_session:{user_id:'38971',token:'synthetic-session'},draw_id:drawId});
  assert(f.writes.some(x=>x[0]==='setNotificationDrawResult'&&x[1].prize_description===result.prize_description));
  const vendor=routingFixture({role:'vendor',result:{...result,viewer_role:'vendor'}});
  assert.equal(await vendor.api.routeNotificationIntent({...intent,screen:'vendor_draw_result'}),'handled');
  assert(vendor.writes.some(x=>x[0]==='openVendorDrawSettings'&&x[1]===drawId));
  assert.match(appSource,/setVendorRaffleWizardStep\(vendorDrawFocusId \? 4/);
});

test('actual native route rejects mismatched result/account, handles permanent missing, retains transient and ignores account switch',async()=>{
  const intent=parseNotificationIntent(payload({screen:'draw_result',draw_id:drawId}),'r',now);
  for(const status of [400,403,404,410])assert.equal(await routingFixture({status}).api.routeNotificationIntent(intent),'unavailable');
  for(const status of [401,429,503])assert.equal(await routingFixture({status}).api.routeNotificationIntent(intent),'retry');
  assert.equal(await routingFixture({result:{...result,draw_id:'foreign'}}).api.routeNotificationIntent(intent),'retry');
  const wrong=routingFixture();assert.equal(await wrong.api.routeNotificationIntent({...intent,recipientMemberId:'999'}),'unavailable');assert.equal(wrong.requests.length,0);
  const stale=routingFixture({hold:true});const pending=stale.api.routeNotificationIntent(intent);stale.globals.nativeSessionGenerationRef.current++;stale.release();assert.equal(await pending,'retry');assert.equal(stale.writes.length,0);
});

test('OS last-response clearing never clears a newer notification',()=>{
  let clears=0;const response={notification:{request:{identifier:'os-id',content:{data:{event_id:eventId}}}}};
  const api=loadAppDeclarations(['clearNotificationResponseIfMatching'],{Notifications:{getLastNotificationResponse:()=>response,clearLastNotificationResponse:()=>clears++}});
  api.clearNotificationResponseIfMatching('event:foreign');assert.equal(clears,0);api.clearNotificationResponseIfMatching(`event:${eventId}`);assert.equal(clears,1);
});

test('actual pending-notification callback requests sign-in once, resumes after sign-in, and clears only handled response',async()=>{
 const storage=storageFixture(),store=createNotificationIntentStore(storage,()=>now),writes=[],ref=current=>({current});
 await store.receive(payload(),'cold-start');
 const g={useCallback:fn=>fn,nativeBridgeSessionRef:ref(null),nativeMemberRef:ref(null),nativeSessionGenerationRef:ref(1),notificationRouteGenerationRef:ref(1),logoutInFlightRef:ref(false),
  accountDeletionIsInFlight:()=>false,hasNativeTokenSession:s=>!!s?.user_id&&!!s?.token,notificationIntentStoreRef:ref(store),notificationSignInRequestRef:ref(''),
  hideWebsiteBrowser:()=>writes.push(['hide']),setExpiredSessionLoginRequest:v=>writes.push(['signin',v]),setNotificationRetryVisible:v=>writes.push(['retry',v]),
  clearNotificationResponseIfMatching:v=>writes.push(['clear',v]),Alert:{alert:(...args)=>writes.push(['alert',...args])},routeNotificationIntent:async intent=>{writes.push(['route',intent.id]);return 'handled';},Date};
 const api=loadAppDeclarations(['processPendingNotification'],g);await api.processPendingNotification();await api.processPendingNotification();
 assert.equal(writes.filter(x=>x[0]==='signin').length,1);assert.equal(writes.filter(x=>x[0]==='route').length,0);assert(await store.peek());
 g.nativeBridgeSessionRef.current={user_id:'38971',token:'synthetic'};g.nativeMemberRef.current={user_id:'38971'};g.nativeSessionGenerationRef.current++;
 await api.processPendingNotification();assert.equal(writes.filter(x=>x[0]==='route').length,1);assert.equal(writes.filter(x=>x[0]==='clear').length,1);assert.equal(await store.peek(),null);
});

test('actual receive effect never clears a newer OS response while an older duplicate is persisting',async()=>{
 const ast=ts.createSourceFile('index.tsx',appSource,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);let effect;
 function visit(n){if(ts.isCallExpression(n)&&n.expression.getText(ast)==='useEffect'&&n.arguments[0]?.getText(ast).includes('notificationIntentStoreRef.current!.receive'))effect=n.arguments[0].getText(ast);ts.forEachChild(n,visit);}visit(ast);assert(effect);
 for(const outcome of ['duplicate','invalid']) {
  let resolve,clears=0;const pending=new Promise(r=>resolve=r);const response={actionIdentifier:'default',notification:{request:{identifier:'old',content:{data:payload()}}}};let current=response;
  const g={Platform:{OS:'ios'},lastNotificationResponse:response,notificationRouteGenerationRef:{current:0},notificationIntentStoreRef:{current:{receive:()=>pending}},
   Notifications:{DEFAULT_ACTION_IDENTIFIER:'default',getLastNotificationResponse:()=>current,clearLastNotificationResponse:()=>clears++},setNotificationRetryVisible(){},setNotificationIntentRevision(){}};
  const context=vm.createContext(g);vm.runInContext(ts.transpileModule(`globalThis.effect=${effect}`,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,context);
  context.effect();current={notification:{request:{identifier:'new'}}};resolve(outcome);await pending;await Promise.resolve();assert.equal(clears,0);
 }
});

test('actual polling alert callback uses one OS push cue, retains denied-permission fallback, and never sounds old backlog or stale account',async()=>{
 for(const [platform,registered,permission,expected]of [['ios',true,'granted',0],['android',true,'granted',0],['ios',true,'denied',1],['ios',false,'granted',1],['web',true,'granted',1]]) {
  let plays=0;const ref=current=>({current});const g={useCallback:fn=>fn,chatUnreadSnapshotRef:ref(null),nativeSessionGenerationRef:ref(1),nativeBridgeSessionRef:ref({user_id:'38971',token:'synthetic'}),logoutInFlightRef:ref(false),nativeChatThreadOpenRef:ref(false),
   Platform:{OS:platform},pushRegistrationKeyRef:ref(registered?'38971:synthetic':''),Notifications:{getPermissionsAsync:async()=>({status:permission})},playChatNotificationCue:()=>plays++};
  const api=loadAppDeclarations(['updateChatUnreadAlert'],g);api.updateChatUnreadAlert(20);await Promise.resolve();assert.equal(plays,0,'existing backlog is baseline');
  api.updateChatUnreadAlert(21);await new Promise(setImmediate);assert.equal(plays,expected,`${platform}/${registered}/${permission}`);api.updateChatUnreadAlert(21);api.updateChatUnreadAlert(22,true);await Promise.resolve();assert.equal(plays,expected);
 }
 let release,plays=0;const wait=new Promise(r=>release=r),g={useCallback:fn=>fn,chatUnreadSnapshotRef:{current:0},nativeSessionGenerationRef:{current:1},nativeBridgeSessionRef:{current:{user_id:'38971',token:'synthetic'}},logoutInFlightRef:{current:false},nativeChatThreadOpenRef:{current:false},Platform:{OS:'ios'},pushRegistrationKeyRef:{current:'38971:synthetic'},Notifications:{getPermissionsAsync:()=>wait},playChatNotificationCue:()=>plays++};
 loadAppDeclarations(['updateChatUnreadAlert'],g).updateChatUnreadAlert(1);g.nativeSessionGenerationRef.current++;release({status:'denied'});await wait;await Promise.resolve();await Promise.resolve();assert.equal(plays,0);
 assert.match(appSource,/updateChatUnreadAlert\(Number.isFinite\(unreadCount\)/);assert.match(appSource,/updateChatUnreadAlert\(unreadCount, nativeChatThreadOpenRef.current\)/);
 assert.match(appSource,/const handleNativeQrScan[\s\S]*?playChatNotificationCue\(\)/,'scan feedback remains audible');
});

test('valid JSON with an invalid encrypted-state shape recovers without preventing a new notification',async()=>{
 for(const raw of ['null','[]','false','"invalid"','{"version":1,"pending":{"id":"event:invalid"}}']) {
  const values=new Map([['weddingwin.notificationIntent.v1',raw]]);const store=createNotificationIntentStore({getItemAsync:async k=>values.get(k)??null,setItemAsync:async(k,v)=>values.set(k,v)},()=>now);
  assert.equal(await store.peek(),null);assert.equal(await store.receive(payload(),'new'),'saved');assert.equal((await store.peek()).id,`event:${eventId}`);
 }
});
