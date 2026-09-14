import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const root=new URL('../',import.meta.url);
const read=name=>readFileSync(new URL(name,root),'utf8');
const compile=code=>ts.transpileModule(code,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
const appToken='app:0123456789abcdef0123456789abcdef',bdToken='0123456789abcdef0123456789abcdef';
const chatSource=read('supabase/functions/bd-chat-sync/index.ts');
const ast=ts.createSourceFile('chat.ts',chatSource,ts.ScriptTarget.Latest,true);
const resolver=ast.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='resolveNotificationChatTarget').getText(ast);
const serve=ast.statements.find(n=>ts.isExpressionStatement(n)&&ts.isCallExpression(n.expression)&&n.expression.expression.getText(ast)==='Deno.serve').expression.arguments[0].getText(ast);
function chatFixture(options={}) {
 const calls=[];const g={Request,Response,Error,console:{info(){},error(){}},corsHeaders:{},
  jsonResponse:(body,status=200)=>new Response(JSON.stringify(body),{status}),
  resetRateLimitFlag(){},loadSharedRateLimit:async()=>{},wasRateLimited:()=>false,
  getSessionUser:async()=>options.unauthorized?null:{user_id:'38971'},bdFetchUserById:async()=>({user_id:'38971',email:'synthetic@example.invalid'}),
  assertActiveChatMember:async()=>{},loadMemberEmailVerification:async()=>({email_confirmation_required:false}),participantTokens:()=>['owned-session'],
  isAppThread:t=>t.startsWith('app:'),
  getAppThread:async(t,id)=>{calls.push(['app',t,id]);if(options.dbFailure)throw Error('dependency unavailable');if(options.foreign)throw Error('Conversation was not found for this account.');return {bd_thread_token:options.alias===false?'':bdToken};},
  mirrorThreadByToken:async t=>options.missing?null:{thread_token:t,owned:!options.foreignAlias&&!options.foreign},threadMatchesUser:t=>t.owned,
  refreshMirrorIfStale:async()=>false,markMirrorThreadRead:async()=>false,markAppRead:async()=>{},rateLimitedNow:()=>false,
  buildChatPayload:async(_u,_s,selected)=>{calls.push(['payload',selected]);const token=options.wrongSelection?'different-owned-thread':selected;return [{ok:true,selected_thread_token:token,threads:[{token}],sync_debug:{member_id:'38971',bd_threads:1,app_threads:0}},false];},
  shortError:e=>String(e),CHAT_PERMISSION_ENDPOINTS:[],
 };
 for(const name of ['MemberEmailVerificationUnavailableError','BdRateLimitError','ChatPolicyError','ChatMemberBlockedError','ObjectionableChatContentError','ChatImageSharingDisabledError'])g[name]=class extends Error{};
 const context=vm.createContext(g);vm.runInContext(compile(`${resolver}\nglobalThis.resolve=resolveNotificationChatTarget;globalThis.handler=${serve};`),context);
 return {calls,g,resolve:context.resolve,request:async(body={})=>{const r=await context.handler(new Request('https://offline.invalid',{method:'POST',body:JSON.stringify({action:'read',native_session:{user_id:'38971',token:'synthetic'},thread_token:appToken,notification_target:true,...body})}));return {status:r.status,body:await r.json()};}};
}

test('actual authenticated chat handler returns exact requested app alias and selected owned website token',async()=>{
 const f=chatFixture();const result=await f.request();assert.equal(result.status,200);assert.deepEqual(result.body.notification_target,{requested_thread_token:appToken,resolved_thread_token:bdToken});assert.equal(result.body.selected_thread_token,bdToken);
});
test('actual handler rejects unauthenticated, foreign, missing, malformed and fallback selections without choosing another conversation',async()=>{
 for(const [options,status]of [[{unauthorized:true},401],[{foreign:true},404],[{missing:true,alias:false,foreign:true},404],[{wrongSelection:true},404]]){const f=chatFixture(options);assert.equal((await f.request()).status,status);if(options.unauthorized)assert.equal(f.calls.length,0);}
 assert.equal((await chatFixture().request({thread_token:'https://evil.invalid'})).status,404);
 assert.equal((await chatFixture({missing:true}).request({thread_token:bdToken})).status,404);
});
test('actual resolver preserves own unmirrored app thread; never follows foreign alias; dependency failure remains retriable',async()=>{
 for(const options of [{alias:false},{foreignAlias:true}])assert.equal(await chatFixture(options).resolve(appToken,'38971',['owned-session']),appToken);
 const result=await chatFixture({dbFailure:true}).request();assert.equal(result.status,500);assert.equal(result.body.ok,false);
});
test('ordinary chat list/read behavior does not receive notification alias authority',async()=>{
 const result=await chatFixture().request({notification_target:false});assert.equal(result.status,200);assert.equal(result.body.notification_target,undefined);
});

function registerFixture(options={}) {
 let handler;const calls=[];const admin={rpc:async(name,args)=>{calls.push({name,args});return {error:options.rpcError?{message:'transaction failed'}:null};},from:table=>{const call={table,filters:[]};calls.push(call);const builder={update:value=>{call.update=value;return builder;},eq:(k,v)=>{call.filters.push([k,v]);return builder;},then:resolve=>Promise.resolve({error:null}).then(resolve)};return builder;}};
 const source=read('supabase/functions/bd-register-push-token/index.ts');const file=ts.createSourceFile('register.ts',source,ts.ScriptTarget.Latest,true);
 const code=file.statements.filter(n=>!ts.isImportDeclaration(n)).map(n=>n.getText(file)).join('\n');
 vm.runInNewContext(compile(code),{Request,Response,Error,Date,createClient:()=>admin,Deno:{env:{get:()=> 'offline'},serve:fn=>handler=fn},nativeSessionMatchesCachedBdIdentity:async()=>!options.expired,
 fetch:async()=>new Response(JSON.stringify({status:'success',message:{user_id:options.foreign?'999':'38971'}}),{status:200})});
 return {calls,request:async(body={})=>{const r=await handler(new Request('https://offline.invalid',{method:'POST',body:JSON.stringify({native_session:{user_id:'38971',token:'synthetic-session'},expo_push_token:'ExponentPushToken[B]',previous_expo_push_token:'ExponentPushToken[A]',platform:'ios',...body})}));return {status:r.status,body:await r.json()};}};
}
test('actual registration handler delegates current and exact prior token to one authenticated atomic RPC',async()=>{
 const f=registerFixture();assert.equal((await f.request()).status,200);assert.deepEqual(JSON.parse(JSON.stringify(f.calls)),[{name:'register_weddingwin_push_token',args:{p_member_id:'38971',p_member_token:'synthetic-session',p_expo_push_token:'ExponentPushToken[B]',p_platform:'ios',p_previous_expo_push_token:'ExponentPushToken[A]'}}]);
});
test('registration auth/token validation and failed transaction never report success or mutate a guessed token row',async()=>{
 for(const options of [{expired:true},{foreign:true}]){const f=registerFixture(options);assert.equal((await f.request()).status,401);assert.equal(f.calls.length,0);}
 for(const body of [{previous_expo_push_token:'invalid'},{expo_push_token:`ExponentPushToken[${'x'.repeat(300)}]`}]){const f=registerFixture();assert.equal((await f.request(body)).status,400);assert.equal(f.calls.length,0);}
 const failed=await registerFixture({rpcError:true}).request();assert.equal(failed.status,500);assert.equal(failed.body.ok,false);
});
test('unregister still fences the exact token, account and session independently of BD member lookup',async()=>{
 const f=registerFixture({foreign:true});assert.equal((await f.request({action:'unregister'})).status,200);assert.equal(f.calls[0].table,'app_push_tokens');assert.deepEqual(f.calls[0].filters,[['expo_push_token','ExponentPushToken[B]'],['bd_member_id','38971'],['bd_member_token','synthetic-session']]);
});
