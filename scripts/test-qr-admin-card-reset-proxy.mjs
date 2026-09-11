// Synthetic accounts; execute the actual PHP helpers and POST dispatcher locally.
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync, mkdtempSync, writeFileSync, rmSync, realpathSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
const source=readFileSync(new URL('../brilliant-directories/widgets/ww-qr-bingo-settings.php',import.meta.url),'utf8');
const part=(a,b)=>{const start=source.indexOf(a),end=source.indexOf(b,start);assert(start>=0&&end>start,a);return source.slice(start,end);};
const base=part('    function ww_qrbs_text_length(','    function ww_qrbs_validate_https_url(')+part('    function ww_qrbs_validate_datetime(','    function ww_qrbs_validate_rfc3339_version(');
const helpers=part('    /* WW_QR_ADMIN_CARD_RESET_HELPERS_START */','    /* WW_QR_ADMIN_CARD_RESET_HELPERS_END */');
const handler=part('    /* WW_QR_ADMIN_CARD_RESET_REQUEST_START */','    /* WW_QR_ADMIN_CARD_RESET_REQUEST_END */');
const cutoffs=part('    function ww_qrbs_scan_reset_filter(','    function ww_qrbs_scans_data(');
const b64=s=>Buffer.from(s).toString('base64'), decode=o=>`json_decode(base64_decode('${b64(JSON.stringify(o))}'),true)`;
const load=`eval(stripslashes(base64_decode('${b64(base+helpers)}')));`;
function php(code){const dir=mkdtempSync(join(realpathSync(tmpdir()),'ww-card-reset-'));try{const file=join(dir,'fixture.php');writeFileSync(file,'<?php\n'+code);return JSON.parse(execFileSync(process.execPath,[fileURLToPath(new URL('../node_modules/@php-wasm/cli/php-wasm.js',import.meta.url)),file],{encoding:'utf8',timeout:60000,maxBuffer:4*1024*1024}));}finally{rmSync(dir,{recursive:true,force:true});}}
const scope={csrf_token:'offline-csrf',action:'card_reset_preview',dataset:'scans',event_key:'offline-card-event',couple_id:'90002'};
const valid={...scope,action:'card_reset',expected_generation:'2',preview_token:'a'.repeat(64),scan_preview_token:'b'.repeat(64),request_id:'11111111-1111-4111-8111-111111111111',operator_identity:'Offline Admin',reason:'Couple requested a fresh card'};
const payload={...valid,expected_generation:2,website_scan_reset_at:'2026-09-11T12:00:00Z'};delete payload.csrf_token;delete payload.scan_preview_token;
const preview={ok:true,action:'card_reset_preview',dataset:'scans',event_key:scope.event_key,couple_id:scope.couple_id,expected_generation:2,preview_token:'a'.repeat(64),entry_count:2,can_reset:true,reset_block_reason:'',card_state:{event_key:scope.event_key,couple_id:scope.couple_id,generation:2,scan_reset_after:'2026-09-10T12:00:00Z'}};
const reply={ok:true,action:'card_reset',dataset:'scans',event_key:scope.event_key,couple_id:scope.couple_id,request_id:valid.request_id,from_generation:2,to_generation:3,scan_reset_after:'2026-09-11T12:00:00+00:00',entry_count:2,replayed:false};

test('strict PHP request boundary rejects authority injection, foreign scope and unsafe text',()=>{
  const lookup={csrf_token:scope.csrf_token,action:'card_reset_lookup',search:'Alex'};
  const good=[lookup,scope,valid,{...valid,reason:'R'.repeat(500),operator_identity:'A'.repeat(160)}];
  const bad=[{...lookup,search:'A'},{...lookup,search:'a'.repeat(121)},{...lookup,search:'<script>'},{...valid,dataset:'contacts'},{...valid,couple_id:'0'},{...valid,couple_id:'1'.repeat(19)},{...valid,event_key:'bad event'},{...valid,event_key:'x'.repeat(101)},{...valid,expected_generation:'01'},{...valid,expected_generation:'-1'},{...valid,expected_generation:'1e2'},{...valid,expected_generation:'9999999999999999'},{...valid,preview_token:'A'.repeat(64)},{...valid,scan_preview_token:'short'},{...valid,request_id:'bad'},{...valid,reason:'ab'},{...valid,reason:'a\nb'},{...valid,reason:'<b>'},{...valid,reason:'a'.repeat(501)},{...valid,operator_identity:'ab'},{...valid,operator_identity:'<admin>'},{...valid,operator_identity:'a'.repeat(161)},{...valid,verified_couple:'90002'},{...valid,website_scan_lock_held:'true'},{...valid,website_scan_reset_at:'2026-09-11T12:00:00Z'},{...valid,couple_id:['90002']}];
  for(const key of Object.keys(valid)){const row={...valid};delete row[key];bad.push(row);}
  assert(!helpers.includes('\\'),'PHP helpers survive BD backslash stripping');
  const got=php(`${load}$cases=${decode([...good,...bad])};$out=array();foreach($cases as $row){try{$out[]=ww_qrbs_card_reset_request($row);}catch(Exception $e){$out[]=false;}}echo json_encode($out);`);
  assert.deepEqual(got.map(Boolean),[...good.map(()=>true),...bad.map(()=>false)]);
  assert.equal(got[2].expected_generation,2);assert(!('csrf_token'in got[2]));
});

test('PHP validates all preview identities, generation, counts, tokens, and exact success cutoff',()=>{
  const goodPreview=[preview,{...preview,expected_generation:0,entry_count:0,card_state:{...preview.card_state,generation:0,scan_reset_after:null}},{...preview,can_reset:false,reset_block_reason:'An email is still being sent.'}];
  const badPreview=[{...preview,ok:1},{...preview,action:'card_reset'},{...preview,dataset:'entries'},{...preview,event_key:'other-event'},{...preview,couple_id:'90003'},{...preview,expected_generation:'2'},{...preview,expected_generation:-1},{...preview,entry_count:-1},{...preview,entry_count:10001},{...preview,preview_token:'short'},{...preview,can_reset:1},{...preview,reset_block_reason:'blocked'},{...preview,can_reset:false,reset_block_reason:'<unsafe>'},{...preview,card_state:{...preview.card_state,generation:3}},{...preview,card_state:{...preview.card_state,scan_reset_after:'2026-02-30T12:00:00Z'}}];
  for(const key of Object.keys(preview)){const row={...preview};delete row[key];badPreview.push(row);}
  const badReply=[{...reply,ok:1},{...reply,action:'card_reset_preview'},{...reply,dataset:'contacts'},{...reply,event_key:'other-event'},{...reply,couple_id:'90003'},{...reply,request_id:'22222222-2222-4222-8222-222222222222'},{...reply,from_generation:1},{...reply,to_generation:4},{...reply,to_generation:'3'},{...reply,scan_reset_after:'2026-09-11T12:00:01Z'},{...reply,scan_reset_after:'2026-02-30T12:00:00Z'},{...reply,entry_count:-1},{...reply,replayed:1}];
  for(const key of Object.keys(reply)){const row={...reply};delete row[key];badReply.push(row);}
  const got=php(`${load}$previews=${decode([...goodPreview,...badPreview])};$replies=${decode([reply,{...reply,replayed:true},...badReply])};$out=array('previews'=>array(),'replies'=>array());foreach($previews as $row)$out['previews'][]=ww_qrbs_card_reset_preview_valid($row,${decode(scope)});foreach($replies as $row)$out['replies'][]=ww_qrbs_card_reset_success_valid($row,${decode(payload)});echo json_encode($out);`);
  assert.deepEqual(got.previews,[...goodPreview.map(()=>true),...badPreview.map(()=>false)]);assert.deepEqual(got.replies,[true,true,...badReply.map(()=>false)]);
});

const fixture=`
${load}
class RowSet { public $rows; function __construct($rows){$this->rows=$rows;} }
class ResponseSent extends Exception {}
$_SESSION=array();$queries=array();$calls=array();$held=false;$nonce=0;$generation=2;$cutoff='2026-09-10T12:00:00Z';$backendToken=str_repeat('a',64);$entryCount=2;$scans=array(array('vendor_id'=>'99001','scan_date'=>'2026-09-11 10:00:00'),array('vendor_id'=>'99002','scan_date'=>'2026-09-11 10:10:00'));$members=array(array('user_id'=>'90002','first_name'=>'Alex','last_name'=>'Jamie','email'=>'couple@example.test','subscription_id'=>'18','active'=>'2'));$lockBusy=false;$mode='normal';$receipts=array();$resetCalls=0;$mutations=0;$flags=array();$currentScanned=0;$currentTotal=2;$flagFailure=false;$allowReset=true;
function mysql_real_escape_string($s){return str_replace("'","''",$s);}
function mysql_fetch_assoc($result){return count($result->rows)?array_shift($result->rows):false;}
function mysql($db,$sql){global $queries,$held,$members,$scans,$lockBusy,$flags,$currentScanned,$currentTotal,$flagFailure;$queries[]=$sql;
 if(strpos($sql,'SELECT u.user_id,u.first_name')===0)return new RowSet($members);
 if(strpos($sql,'SELECT GET_LOCK(')===0){if(!$lockBusy)$held=true;return new RowSet(array(array('acquired'=>$lockBusy?'0':'1')));}
 if(strpos($sql,'SELECT RELEASE_LOCK(')===0){$held=false;return new RowSet(array(array('released'=>'1')));}
 if(!$held)throw new Exception('Fixture observed SQL outside card lock');
 if(strpos($sql,'SELECT vv.vendor_id,vv.scan_date')===0)return new RowSet($scans);
 if(strpos($sql,'SELECT COUNT(DISTINCT u.user_id)')===0)return new RowSet(array(array('total_vendors'=>(string)$currentTotal)));
 if(strpos($sql,'SELECT COUNT(DISTINCT vv.vendor_id)')===0)return new RowSet(array(array('scanned_count'=>(string)$currentScanned,'completed_at'=>$currentScanned?'2026-09-12 14:00:00':null)));
 if(strpos($sql,'UPDATE users_data SET bingo_completed=')===0){$flags[]=$sql;return !$flagFailure;}
 throw new Exception('Unexpected offline SQL');
}
function ww_qrbs_secure_random_hex($size){global $nonce;return str_pad(dechex(++$nonce),$size*2,'0',STR_PAD_LEFT);}
function ww_qrbs_response_succeeded($r){return isset($r['payload']['ok'])&&$r['payload']['ok']===true&&$r['http_status']===200;}
function ww_qrbs_edge_call($db,$p){global $calls,$held,$generation,$cutoff,$backendToken,$entryCount,$mode,$receipts,$resetCalls,$mutations,$scans,$allowReset;
 if(!$held)throw new Exception('Fixture observed signed call outside card lock');$calls[]=$p;
 if($p['action']==='admin_get')return array('http_status'=>200,'payload'=>array('ok'=>true,'event_config'=>array('event_key'=>'offline-card-event','revision'=>7,'vendor_tag_id'=>30,'history_starts_at'=>'2026-09-01T00:00:00Z','scan_history_starts_at'=>'2026-08-01T00:00:00Z','entry_closes_at'=>'2030-01-01T00:00:00Z')));
 if($p['action']==='card_reset_preview')return array('http_status'=>200,'payload'=>array('ok'=>true,'action'=>'card_reset_preview','dataset'=>'scans','event_key'=>$p['event_key'],'couple_id'=>$p['couple_id'],'expected_generation'=>$generation,'preview_token'=>$backendToken,'entry_count'=>$entryCount,'can_reset'=>$allowReset,'reset_block_reason'=>$allowReset?'':'An email is being sent.','card_state'=>array('event_key'=>$p['event_key'],'couple_id'=>$p['couple_id'],'generation'=>$generation,'scan_reset_after'=>$cutoff)));
 if($p['action']!=='card_reset')throw new Exception('Unexpected offline action');$resetCalls++;
 if(isset($receipts[$p['request_id']])){$r=$receipts[$p['request_id']];$r['replayed']=true;return array('http_status'=>200,'payload'=>$r);}
 if($mode==='timeout_no_commit')return array('http_status'=>503,'payload'=>array('ok'=>false,'error'=>'Retry this same request.'));
 $mutations++;$from=$generation;$generation++;$cutoff=$p['website_scan_reset_at'];$entryCount=0;$scans=array();$backendToken=str_repeat('c',64);
 $r=array('ok'=>true,'action'=>'card_reset','dataset'=>'scans','event_key'=>$p['event_key'],'couple_id'=>$p['couple_id'],'request_id'=>$p['request_id'],'from_generation'=>$from,'to_generation'=>$generation,'scan_reset_after'=>substr($cutoff,0,19).'+00:00','entry_count'=>2,'replayed'=>false);$receipts[$p['request_id']]=$r;
 if($mode==='timeout_commit')return array('http_status'=>503,'payload'=>array('ok'=>false,'error'=>'Retry this same request.'));
 if($mode==='malformed_commit')$r['couple_id']='90003';return array('http_status'=>200,'payload'=>$r);
}
function ww_qrbs_data_json($body,$status){global $lastResponse,$held;if($held)throw new Exception('Response sent before lock release');$lastResponse=array('status'=>$status,'body'=>$body);throw new ResponseSent();}
function dispatch($post,$origin='https://ww2.managemydirectory.com') {global $lastResponse;$_POST=$post;$_SERVER=array('HTTP_HOST'=>'ww2.managemydirectory.com','HTTP_ORIGIN'=>$origin);$ww_qrbs_post_action=$post['action'];$ww_qrbs_database='offline';try{eval(stripslashes(base64_decode('${b64(handler)}')));}catch(ResponseSent $sent){}return $lastResponse;}
function preview_request(){return ${decode(scope)};}
function reset_request($p){$r=${decode(valid)};$r['expected_generation']=(string)$p['body']['expected_generation'];$r['preview_token']=$p['body']['preview_token'];$r['scan_preview_token']=$p['body']['scan_preview_token'];return $r;}
`;

test('actual POST binds fresh couple proof and scan preview, locks before reads, and refreshes only target completion',()=>{
  assert(source.indexOf("$ww_qrbs_request_path !== '/admin/go.php'")<source.indexOf('function ww_qrbs_card_reset_request'));
  assert(source.indexOf('hash_equals($ww_qrbs_csrf, $ww_qrbs_submitted_csrf)')<source.indexOf('/* WW_QR_ADMIN_CARD_RESET_REQUEST_START */'));
  const got=php(fixture+`$lookup=dispatch(array('csrf_token'=>'offline-csrf','action'=>'card_reset_lookup','search'=>'Alex'));$p=dispatch(preview_request());$r=dispatch(reset_request($p));$again=dispatch(reset_request($p));echo json_encode(array('lookup'=>$lookup,'preview'=>$p,'result'=>$r,'again'=>$again,'calls'=>$calls,'queries'=>$queries,'resetCalls'=>$resetCalls,'mutations'=>$mutations,'flags'=>$flags));`);
  assert.equal(got.lookup.status,200);assert.deepEqual(got.lookup.body.members,[{couple_id:'90002',name:'Alex Jamie',email:'couple@example.test'}]);
  assert.equal(got.preview.body.scan_count,2);assert.equal(got.result.status,200);assert.equal(got.result.body.scan_count,2);assert.equal(got.again.body.replayed,true);assert.equal(got.resetCalls,1);assert.equal(got.mutations,1);
  const signed=got.calls.find(x=>x.action==='card_reset');assert.deepEqual(signed.verified_couple,{id:'90002',subscription_id:'18',active:'2'});assert.equal(signed.website_scan_lock_held,true);assert.match(signed.website_scan_reset_at,/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);assert(!('scan_preview_token'in signed));assert(!('csrf_token'in signed));
  assert.equal(got.flags.length,2);for(const sql of got.flags){assert.match(sql,/bingo_completed=0,bingo_completion_date=NULL WHERE user_id='90002'$/);}
  const lock=got.queries.find(x=>x.startsWith('SELECT GET_LOCK'));assert.match(lock,/'ww_qr_card:[a-f0-9]{48}',5/);assert.equal(got.queries.filter(x=>x.startsWith('SELECT GET_LOCK')).length,got.queries.filter(x=>x.startsWith('SELECT RELEASE_LOCK')).length);
});

test('real handler rejects changed scan digests, changed backend proof, blocked and expired previews',()=>{
  const got=php(fixture+`$out=array();$p=dispatch(preview_request());$r=reset_request($p);$scans[]=array('vendor_id'=>'99003','scan_date'=>'2026-09-11 10:20:00');$out[]=dispatch($r);$p2=dispatch(preview_request());$out[]=dispatch($r);$r2=reset_request($p2);$backendToken=str_repeat('d',64);$out[]=dispatch($r2);$p3=dispatch(preview_request());$allowReset=false;$out[]=dispatch(reset_request($p3));$allowReset=true;$p4=dispatch(preview_request());$_SESSION['ww_qr_card_reset_previews'][$p4['body']['scan_preview_token']]['created_at']=time()-901;$out[]=dispatch(reset_request($p4));echo json_encode(array('out'=>$out,'resetCalls'=>$resetCalls,'tokens'=>array($p['body']['scan_preview_token'],$p2['body']['scan_preview_token'])));`);
  assert.deepEqual(got.out.map(x=>x.status),[409,409,409,409,409]);assert.equal(got.resetCalls,0);assert.notEqual(...got.tokens);
});

test('unknown committed reset retries exact UUID and frozen cutoff after generation advances, preserving a newly completed card',()=>{
  const got=php(fixture+`$p=dispatch(preview_request());$r=reset_request($p);$mode='timeout_commit';$first=dispatch($r);$changed=$r;$changed['reason']='Changed reason';$reject=dispatch($changed);$mode='normal';$currentScanned=2;$scans=array(array('vendor_id'=>'99001','scan_date'=>'2026-09-12 14:00:00'),array('vendor_id'=>'99002','scan_date'=>'2026-09-12 14:00:00'));$second=dispatch($r);echo json_encode(array('first'=>$first,'reject'=>$reject,'second'=>$second,'calls'=>$calls,'mutations'=>$mutations,'flags'=>$flags));`);
  assert.equal(got.first.status,503);assert.equal(got.reject.status,409);assert.equal(got.second.status,200);assert.equal(got.second.body.replayed,true);assert.equal(got.mutations,1);
  const signed=got.calls.filter(x=>x.action==='card_reset');assert.equal(signed.length,2);assert.deepEqual(signed[0],signed[1]);assert.match(got.flags[0],/bingo_completed=1,bingo_completion_date='2026-09-12 14:00:00' WHERE user_id='90002'$/);
});

test('uncommitted timeout refuses later changed scans; malformed success can be retried without a second reset',()=>{
  const got=php(fixture+`$p=dispatch(preview_request());$r=reset_request($p);$mode='timeout_no_commit';$first=dispatch($r);$scans[]=array('vendor_id'=>'99003','scan_date'=>'2026-09-11 11:00:00');$second=dispatch($r);$p2=dispatch(preview_request());$r2=reset_request($p2);$mode='malformed_commit';$third=dispatch($r2);$mode='normal';$fourth=dispatch($r2);echo json_encode(array('out'=>array($first,$second,$third,$fourth),'mutations'=>$mutations,'resetCalls'=>$resetCalls));`);
  assert.deepEqual(got.out.map(x=>x.status),[503,409,503,200]);assert.equal(got.out[3].body.replayed,true);assert.equal(got.mutations,1);assert.equal(got.resetCalls,3);
});

test('real dispatcher fails closed on origin, client authority, couple plan/status, wrong account and busy lock',()=>{
  const got=php(fixture+`$out=array();$out[]=dispatch(preview_request(),'https://attacker.invalid');$bad=preview_request();$bad['website_scan_lock_held']='true';$out[]=dispatch($bad);$members[0]['subscription_id']='2';$out[]=dispatch(preview_request());$members[0]['subscription_id']='18';$members[0]['active']='1';$out[]=dispatch(preview_request());$members[0]['active']='2';$members[0]['user_id']='90003';$out[]=dispatch(preview_request());$members[0]['user_id']='90002';$lockBusy=true;$out[]=dispatch(preview_request());$lockBusy=false;$members[0]['subscription_id']='4';$out[]=dispatch(preview_request());echo json_encode(array('out'=>$out,'calls'=>$calls,'resetCalls'=>$resetCalls));`);
  assert.deepEqual(got.out.map(x=>x.status),[400,400,400,400,400,503,200]);assert.equal(got.resetCalls,0);assert.equal(got.calls[0].verified_couple.subscription_id,'4');
});

test('completion persistence failure returns retryable error and retries only the derived flags',()=>{
  const got=php(fixture+`$p=dispatch(preview_request());$r=reset_request($p);$flagFailure=true;$a=dispatch($r);$flagFailure=false;$b=dispatch($r);echo json_encode(array('out'=>array($a,$b),'resetCalls'=>$resetCalls,'mutations'=>$mutations,'flags'=>$flags));`);
  assert.deepEqual(got.out.map(x=>x.status),[503,200]);assert.equal(got.out[1].body.replayed,true);assert.equal(got.resetCalls,1);assert.equal(got.mutations,1);assert.equal(got.flags.length,2);
});

test('scan cutoff list fails closed and filters only identified couples at or before their cutoff',()=>{
  const result={http_status:200,payload:{ok:true,action:'card_reset_cutoffs',event_key:scope.event_key,rows:[{couple_id:'90002',generation:3,scan_reset_after:'2026-09-11T12:00:00+00:00'}],has_more:false}};
  const cases=[result,{...result,payload:{...result.payload,rows:[]}},...[
    {action:'other'}, {event_key:'other'}, {has_more:true}, {rows:[result.payload.rows[0],result.payload.rows[0]]},
    {rows:[{...result.payload.rows[0],couple_id:'0'}]}, {rows:[{...result.payload.rows[0],generation:0}]},
    {rows:[{...result.payload.rows[0],generation:'3'}]}, {rows:[{...result.payload.rows[0],scan_reset_after:'2026-02-30T12:00:00Z'}]}, {rows:Array(10001).fill(result.payload.rows[0])},
  ].map(patch=>({...result,payload:{...result.payload,...patch}})),{http_status:503,payload:{ok:false}}];
  const missing={...result,payload:{...result.payload}};delete missing.payload.has_more;cases.push(missing);
  const got=php(`${load}eval(stripslashes(base64_decode('${b64(cutoffs)}')));date_default_timezone_set('America/Toronto');function mysql_real_escape_string($s){return $s;}function ww_qrbs_response_succeeded($r){return $r['http_status']===200&&$r['payload']['ok']===true;}function ww_qrbs_edge_call($db,$p){global $fake;return $fake;}$out=array();$cases=${decode(cases)};foreach($cases as $fake){try{$out[]=ww_qrbs_scan_reset_filter('offline','offline-card-event');}catch(Exception $e){$out[]=false;}}echo json_encode($out);`);
  assert.equal(got[0]," AND NOT ((vv.user_id='90002' AND vv.scan_date <= '2026-09-11 08:00:00'))");assert.equal(got[1],'');assert.deepEqual(got.slice(2),cases.slice(2).map(()=>false));
});


test('bounded session previews evict safe stale selections but retain uncertain reset receipts',()=>{
  const got=php(fixture+`$p=dispatch(preview_request());$r=reset_request($p);$mode='timeout_no_commit';$a=dispatch($r);for($i=0;$i<25;$i++)$latest=dispatch(preview_request());$protected=isset($_SESSION['ww_qr_card_reset_previews'][$r['scan_preview_token']]);$size=count($_SESSION['ww_qr_card_reset_previews']);$b=dispatch($r);$saved=$_SESSION['ww_qr_card_reset_previews'][$r['scan_preview_token']];$_SESSION['ww_qr_card_reset_previews']=array();for($i=0;$i<20;$i++)$_SESSION['ww_qr_card_reset_previews'][str_pad(dechex($i+100),64,'0',STR_PAD_LEFT)]=$saved;$blocked=dispatch(preview_request());echo json_encode(array('protected'=>$protected,'size'=>$size,'latest'=>$latest,'retry'=>$b,'blocked'=>$blocked,'remaining'=>count($_SESSION['ww_qr_card_reset_previews'])));`);
  assert.equal(got.protected,true);assert.equal(got.size,20);assert.equal(got.latest.status,200);assert.equal(got.retry.status,503);assert.match(got.retry.body.error,/Retry this same request/);assert.equal(got.blocked.status,503);assert.match(got.blocked.body.error,/Finish an earlier reset/);assert.equal(got.remaining,20);
});
