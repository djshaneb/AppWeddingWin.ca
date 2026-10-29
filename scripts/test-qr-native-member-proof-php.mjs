// Actual widget 329 controller and SQL proof helpers; all data/network are local fakes.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const source = readFileSync(new URL('../brilliant-directories/widgets/329-app-email-change-verification.php', import.meta.url), 'utf8');
const from = source.indexOf('    function ww_ev_json(');
const to = source.indexOf('    function ww_ev_send(', from);
assert(from > 0 && to > from);
// Capture HTTP termination only; no proof, signature, SQL, or verification logic is replaced.
const adapted = source.slice(0, from) + `    function ww_ev_json($body,$status) { throw new OfflineReply($body,$status); }\n` + source.slice(to);
const guard = `
const fs=require('node:fs'), net=require('node:net');
let attempts=0; function deny(){attempts++;throw new Error('Offline network forbidden');}
globalThis.fetch=deny;
for(const n of ['node:http','node:https']){const m=require(n);m.request=deny;m.get=deny;}
net.connect=deny;net.createConnection=deny;net.Socket.prototype.connect=deny;
net.Server.prototype.listen=function(port,host,cb){if(port!==0||host!=='127.0.0.1')return deny();this.address=()=>({address:'127.0.0.1',family:'IPv4',port:9});this.close=cb=>{if(cb)process.nextTick(cb);return this;};process.nextTick(()=>{this.emit('listening');if(cb)cb.call(this);});return this;};
require('node:tls').connect=deny;require('node:dgram').createSocket=deny;
for(const m of [require('node:dns'),require('node:dns').promises])for(const k of Object.keys(m))if(k==='lookup'||k.startsWith('resolve'))m[k]=deny;
require('node:module').syncBuiltinESMExports();
process.on('exit',()=>fs.writeFileSync(process.env.WW_OFFLINE_NETWORK_REPORT,JSON.stringify({attempts})));
`;
const php = `<?php
error_reporting(E_ALL); ini_set('display_errors','1'); date_default_timezone_set('UTC');
class OfflineReply extends Error { public $body; public $status; function __construct($body,$status){$this->body=$body;$this->status=$status;} }
class OfflineRows { public $rows; function __construct($rows){$this->rows=$rows;} }
function mysql_fetch_assoc($rows){return count($rows->rows)?array_shift($rows->rows):false;}
function mysql_real_escape_string($value){return addslashes((string)$value);}
function ww_aecv_secrets(){return array('offline-native-proof-secret-0123456789');}
$source=base64_decode('${Buffer.from(adapted).toString('base64')}');
$w=array('database'=>'offline');$members=array();$private=array();$meta=array();$queries=array();$fail='';$checks=0;
function check($ok,$label){global $checks;if(!$ok)throw new Error($label);$checks++;}
function reset_fixture(){global $members,$private,$meta,$queries,$fail;
  $members=array('42'=>array('user_id'=>'42','active'=>'2','subscription_id'=>'18','first_name'=>'Alex','last_name'=>'Taylor',
    'email'=>'CURRENT@example.invalid','phone_number'=>'5551234567','phone'=>'','wedding_date'=>'2027-09-01',
    'password'=>'private-password','token'=>'private-token','cookie'=>'private-cookie'));
  $private=array();$meta=array();$queries=array();$fail='';
}
function mysql($db,$sql){global $members,$private,$meta,$queries,$fail;
  $queries[]=$sql;
  if(strpos($sql,'SELECT ')!==0)throw new Error('Unexpected SQL mutation');
  if($fail!==''&&strpos($sql,$fail)!==false)return false;
  if(preg_match("/FROM users_data WHERE user_id='([0-9]+)'/",$sql,$m))return new OfflineRows(isset($members[$m[1]])?array($members[$m[1]]):array());
  if(preg_match("/FROM ww_email_verification_state WHERE user_id='([0-9]+)'/",$sql,$m))return new OfflineRows(isset($private[$m[1]])?array($private[$m[1]]):array());
  if(preg_match("/FROM users_meta .*database_id='([0-9]+)' AND .key.='([^']+)'/",$sql,$m))return new OfflineRows(isset($meta[$m[1]])&&array_key_exists($m[2],$meta[$m[1]])?array(array('value'=>$meta[$m[1]][$m[2]])):array());
  throw new Error('Unexpected SQL query');
}
function call_route($overrides=array(),$signAction='qr_bingo_member_v1') {
  global $source,$w;
  $id='42';$expires=(string)(time()+60);$nonce=str_repeat('a',32);
  $payload=$signAction==='status_app'?'status_app|'.$id.'|'.$expires:$signAction.'|'.$id.'|'.$expires.'|'.$nonce;
  $_POST=array_merge(array('ww_email_change_action'=>'qr_bingo_member_v1','user_id'=>$id,'expires'=>$expires,'nonce'=>$nonce,
    'signature'=>hash_hmac('sha256',$payload,ww_aecv_secrets()[0])),$overrides);
  $_SERVER=array('REQUEST_METHOD'=>'POST');$_GET=array();$_COOKIE=array();
  ob_start();
  try {eval('?>'.$source);}catch(OfflineReply $reply){ob_end_clean();return array('status'=>$reply->status,'body'=>$reply->body);}
  ob_end_clean();throw new Error('Route did not return JSON');
}
reset_fixture();
$r=call_route();check($r['status']===200,'valid proof rejected');
check($r['body']['purpose']==='qr_bingo_member_v1'&&$r['body']['version']===1,'purpose/version');
check($r['body']['member']['email']==='current@example.invalid','canonical current email');
check(count($r['body']['member'])===9&&!isset($r['body']['member']['token']),'private fields excluded');
check(strpos(json_encode($r),'private-password')===false&&strpos(json_encode($r),'private-token')===false,'no credential leak');
check($r['body']['nonce']===str_repeat('a',32)&&$r['body']['expires']===$_POST['expires'],'exact request binding');
check($r['body']['verification']['email_verification_status']==='none','unconfirmed ordinary account unchanged');
$meta['42']['wedding_date']='2027-10-12';$r=call_route();check($r['body']['member']['wedding_date']==='2027-10-12','metadata date precedence');
$meta['42']['wedding_date']='';$r=call_route();check($r['body']['member']['wedding_date']==='','explicit blank date precedence');
foreach(array('4','18','17') as $plan){$members['42']['subscription_id']=$plan;$r=call_route();check($r['status']===200&&$r['body']['member']['subscription_id']===$plan,'current plan preserved');}
$members['42']['active']='1';$r=call_route();check($r['status']===200&&$r['body']['member']['active']==='1','private vendor routing proof retained');
foreach(array('4','18') as $plan){$members['42']['subscription_id']=$plan;$r=call_route();check($r['status']===503,'pending couple denied');}
$members['42']['subscription_id']='17';$members['42']['active']='0';check(call_route()['status']===503,'inactive vendor denied');
reset_fixture();
foreach(array('0','1','3','') as $active){$members['42']['active']=$active;check(call_route()['status']===503,'fresh inactive member denied');}
reset_fixture();unset($members['42']);check(call_route()['status']===503,'deleted member denied immediately');
reset_fixture();$members['42']['user_id']='43';check(call_route()['status']===503,'wrong SQL identity denied');
foreach(array('0','18x','-1','',array('18')) as $plan){reset_fixture();$members['42']['subscription_id']=$plan;check(call_route()['status']===503,'invalid role denied');}
reset_fixture();$members['42']['first_name']=str_repeat('x',501);check(call_route()['status']===503,'oversized field denied');
reset_fixture();$members['42']['email']='invalid';check(call_route()['status']===503,'invalid canonical email denied');
reset_fixture();$members['42']['phone']='555'.chr(0);check(call_route()['status']===503,'NUL field denied');
reset_fixture();$fail='FROM users_data';check(call_route()['status']===503,'member SQL outage closed');
reset_fixture();$fail='FROM users_meta';check(call_route()['status']===503,'metadata SQL outage closed');
reset_fixture();$fail='FROM ww_email_verification_state';check(call_route()['status']===503,'verification SQL outage closed');
reset_fixture();
foreach(array('pending','expired') as $state){
  $private['42']=array('verification_required'=>'1','pending_email'=>'next@example.invalid','requested_at'=>gmdate('Y-m-d H:i:s',time()-($state==='pending'?60:86401)),'confirmed_email'=>null,'confirmed_at'=>null);
  $r=call_route();check($r['status']===200&&$r['body']['verification']['email_verification_status']===$state,'valid email change state retained');
  check($r['body']['member']['email']==='current@example.invalid','pending email did not replace canonical email');
}
reset_fixture();$private['42']=array('verification_required'=>'0','pending_email'=>null,'requested_at'=>null,'confirmed_email'=>'current@example.invalid','confirmed_at'=>gmdate('Y-m-d H:i:s'));
check(call_route()['body']['verification']['email_verification_status']==='confirmed','confirmed proof retained');
foreach(array(
 array('nonce'=>str_repeat('b',32)),array('nonce'=>''),array('nonce'=>array('a')),
 array('signature'=>str_repeat('0',64)),array('signature'=>''),array('user_id'=>'43'),
 array('expires'=>(string)(time()-1)),array('expires'=>(string)(time()+61))
) as $override){reset_fixture();$r=call_route($override);check($r['status']===401,'tampered signature binding accepted');check(count($queries)===0,'unauthenticated request reached SQL');}
reset_fixture();$r=call_route(array(),'status_app');check($r['status']===401&&count($queries)===0,'chat signature cannot request QR member data');
reset_fixture();$r=call_route(array('ww_email_change_action'=>'status_app'),'status_app');
check($r['status']===200&&$r['body']['current_email']==='current@example.invalid','chat status_app still succeeds');
check(!isset($r['body']['member'])&&!isset($r['body']['nonce']),'chat response shape unchanged');
$expiry=(string)(time()+300);$sig=hash_hmac('sha256','status_app|42|'.$expiry,ww_aecv_secrets()[0]);
check(ww_ev_signed_request('status_app','42','',$expiry,$sig),'chat 300-second TTL unchanged');
$expiry=(string)(time()+600);$sig=hash_hmac('sha256','42|new@example.invalid|'.$expiry,ww_aecv_secrets()[0]);
check(ww_ev_signed_request('request_app','42','new@example.invalid',$expiry,$sig),'email-change 600-second signature unchanged');
$expiry=(string)(time()+61);$sig=hash_hmac('sha256','qr_bingo_member_v1|42|'.$expiry.'|'.str_repeat('a',32),ww_aecv_secrets()[0]);
check(!ww_ev_signed_request('qr_bingo_member_v1','42','',$expiry,$sig,str_repeat('a',32)),'QR proof cannot exceed60seconds even correctly signed');
echo json_encode(array('passed'=>true,'assertions'=>$checks,'production_writes'=>0));
`;
const directory = mkdtempSync(join(realpathSync(tmpdir()), 'ww-native-proof-php-'));
try {
  const fixture = join(directory, 'fixture.php'), guardPath = join(directory, 'guard.cjs'), network = join(directory, 'network.json');
  writeFileSync(fixture, php); writeFileSync(guardPath, guard);
  const cli = fileURLToPath(new URL('../node_modules/@php-wasm/cli/php-wasm.js', import.meta.url));
  const stdout = execFileSync(process.execPath, ['--require', guardPath, cli,
    '-d', 'disable_functions=curl_init,curl_exec,fsockopen,pfsockopen,stream_socket_client,socket_connect,mail,exec,shell_exec,system,passthru,popen,proc_open',
    '-d', 'allow_url_fopen=0', '-d', 'allow_url_include=0', fixture],
    { encoding: 'utf8', timeout: 60000, env: { PATH: process.env.PATH, HOME: directory, TMPDIR: directory, WW_OFFLINE_NETWORK_REPORT: network } });
  let result; try { result = JSON.parse(stdout); } catch { throw new Error(stdout.slice(-4000)); }
  assert.equal(result.passed, true);
  assert.equal(JSON.parse(readFileSync(network, 'utf8')).attempts, 0);
  console.log(JSON.stringify({ ...result, network_attempts: 0 }));
} finally { rmSync(directory, { force: true, recursive: true }); }
