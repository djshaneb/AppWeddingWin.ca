import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import { appSource,loadAppDeclarations } from './native-app-source-fixture.mjs';
const session={user_id:'38971',token:'synthetic-session'};
const token=x=>`ExponentPushToken[${x}]`;
const storageKey='push',rolloverKey='rollover';
function fixture(options={}) {
 const calls=[],store=new Map(options.store??[]),keys=[],ref=current=>({current});let release,entered;
 const held=options.hold?new Promise(r=>release=r):Promise.resolve();const started=new Promise(r=>entered=r);
 let holdUsed=false;const g={useCallback:fn=>fn,Platform:{OS:'ios'},__DEV__:false,Constants:{easConfig:{projectId:'synthetic-project'}},
  nativeBridgeSessionRef:ref({...session}),nativeSessionGenerationRef:ref(1),logoutInFlightRef:ref(false),
  pushRegistrationKeyRef:ref(options.registered?'38971:synthetic-session':''),pushRegistrationGenerationRef:ref(0),
  pushRegistrationPromisesRef:ref(new Map()),pushRegistrationSerialRef:ref(Promise.resolve()),expoPushTokenRef:ref(options.previous??''),
  PUSH_TOKEN_SESSION_KEY:storageKey,PENDING_PUSH_ROLLOVER_KEY:rolloverKey,APP_BACKEND_URL:'https://offline.invalid',APP_BACKEND_PUBLISHABLE_KEY:'offline',
  SecureStore:{getItemAsync:async k=>store.get(k)??null,setItemAsync:async(k,v)=>store.set(k,v),deleteItemAsync:async k=>store.delete(k)},
  Notifications:{getPermissionsAsync:async()=>({status:options.permission??'granted'}),requestPermissionsAsync:async()=>({status:options.permission??'granted'}),
   getExpoPushTokenAsync:async opts=>{keys.push(opts);return {data:token(opts?.devicePushToken?.data??options.next??'B')};}},
  fetchAppJsonWithTimeout:async(_u,init)=>{const body=JSON.parse(init.body);calls.push(body);if(options.hold&&!holdUsed){holdUsed=true;entered();await held;}
   if(options.fail?.(body,calls.length))throw Error('ambiguous network result');return {response:{ok:true},data:{ok:true}};},
  savePendingPushUnregister:async raw=>store.set('pending-unregister',raw),deletePendingPushUnregisterIfCurrent:async raw=>{if(store.get('pending-unregister')===raw)store.delete('pending-unregister');},
  AbortController,setTimeout,clearTimeout,
  fetch:async(_u,init)=>{calls.push(JSON.parse(init.body));return {ok:true,json:async()=>({ok:true})};},
 };
 const api=loadAppDeclarations(['parsePendingPushRollover','registerPushNotifications','unregisterPushNotifications'],g);
 return {api,g,calls,store,keys,started,release:()=>release?.()};
}

test('actual registration skips successful unchanged session; force rollover registers current native token and retires exact old Expo token atomically',async()=>{
 const f=fixture({registered:true,previous:token('A')});await f.api.registerPushNotifications(session);assert.equal(f.calls.length,0);
 await f.api.registerPushNotifications(session,{force:true,devicePushToken:{type:'ios',data:'B'}});
 assert.equal(f.calls.length,1);assert.equal(f.calls[0].expo_push_token,token('B'));assert.equal(f.calls[0].previous_expo_push_token,token('A'));
 assert.equal(f.keys[0].devicePushToken.data,'B');assert.equal(f.store.has(rolloverKey),false);
 assert.equal(f.g.pushRegistrationKeyRef.current,'38971:synthetic-session');
});

test('actual concurrent rollover waits for initial registration and keeps newer token rather than coalescing it away',async()=>{
 const f=fixture({hold:true,next:'A'});const first=f.api.registerPushNotifications(session);await f.started;
 const second=f.api.registerPushNotifications(session,{force:true,devicePushToken:{type:'ios',data:'B'}});f.release();await Promise.all([first,second]);
 assert.deepEqual(f.calls.map(c=>c.expo_push_token),[token('A'),token('B')]);assert.equal(f.calls[1].previous_expo_push_token,token('A'));
});

test('ambiguous B←A registration is durably retried before a later C←B rollover',async()=>{
 const f=fixture({previous:token('A'),fail:(_body,n)=>n===1});
 await f.api.registerPushNotifications(session,{force:true,devicePushToken:{type:'ios',data:'B'}});
 assert.equal(JSON.parse(f.store.get(rolloverKey)).previous_expo_push_token,token('A'));assert.equal(f.g.pushRegistrationKeyRef.current,'');
 await f.api.registerPushNotifications(session,{force:true,devicePushToken:{type:'ios',data:'C'}});
 assert.deepEqual(f.calls.map(c=>[c.expo_push_token,c.previous_expo_push_token]),[[token('B'),token('A')],[token('B'),token('A')],[token('C'),token('B')]]);
 assert.equal(f.store.has(rolloverKey),false);
});

test('actual late registration after sign-out is undone and never restores local registered state',async()=>{
 const f=fixture({hold:true,previous:token('A')});const pending=f.api.registerPushNotifications(session,{force:true});await f.started;
 f.g.nativeSessionGenerationRef.current++;f.g.nativeBridgeSessionRef.current=null;f.g.logoutInFlightRef.current=true;f.release();await pending;
 assert.equal(f.calls.at(-1).action,'unregister');assert.equal(f.calls.at(-1).expo_push_token,token('B'));assert.equal(f.g.pushRegistrationKeyRef.current,'');
});

test('actual logout unregisters both sides of pending rollover with exact session and preserves foreign-session retry record',async()=>{
 const pending={native_session:session,expo_push_token:token('B'),previous_expo_push_token:token('A')};
 const f=fixture({store:[[rolloverKey,JSON.stringify(pending)]],previous:token('B')});
 assert.equal(await f.api.unregisterPushNotifications(session,token('B')),true);
 assert.deepEqual(f.calls.map(c=>c.expo_push_token),[token('B'),token('A')]);assert(f.calls.every(c=>c.native_session.token===session.token));assert(!f.store.has(rolloverKey));
 const other=fixture({store:[[rolloverKey,JSON.stringify({...pending,native_session:{...session,user_id:'999'}})]],previous:token('C')});
 await other.api.unregisterPushNotifications(session,token('C'));assert.deepEqual(other.calls.map(c=>c.expo_push_token),[token('C')]);assert(other.store.has(rolloverKey));
});

test('permission rejection and stale incoming account produce no token registration request',async()=>{
 const denied=fixture({permission:'denied'});await denied.api.registerPushNotifications(session,{force:true});assert.equal(denied.calls.length,0);
 const wrong=fixture();await wrong.api.registerPushNotifications({...session,user_id:'999'},{force:true});assert.equal(wrong.calls.length,0);
});

test('real Expo push token listener passes device token to serialized registration and removes subscription on cleanup',()=>{
 const ast=ts.createSourceFile('index.tsx',appSource,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);let effect;
 function visit(n){if(ts.isCallExpression(n)&&n.expression.getText(ast)==='useEffect'&&n.arguments[0]?.getText(ast).includes('Notifications.addPushTokenListener'))effect=n.arguments[0].getText(ast);ts.forEachChild(n,visit);}visit(ast);assert(effect);
 let listener,removed=false;const calls=[],g={Platform:{OS:'ios'},nativeBridgeSessionRef:{current:session},logoutInFlightRef:{current:false},pushRegistrationKeyRef:{current:'registered'},registerPushNotifications:(...args)=>calls.push(args),Notifications:{addPushTokenListener:fn=>{listener=fn;return {remove:()=>removed=true};}}};
 const context=vm.createContext(g);vm.runInContext(ts.transpileModule(`globalThis.effect=${effect}`,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,context);
 const cleanup=context.effect();listener({type:'ios',data:'native-roll'});assert.equal(calls.length,1);assert.equal(calls[0][1].force,true);assert.equal(calls[0][1].devicePushToken.data,'native-roll');
 g.logoutInFlightRef.current=true;listener({type:'ios',data:'retired'});assert.equal(calls.length,1);cleanup();assert.equal(removed,true);
});
