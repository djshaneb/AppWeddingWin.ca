import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync, mkdtempSync, writeFileSync, rmSync, realpathSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const source = readFileSync(new URL('../brilliant-directories/widgets/ww-qr-bingo-settings.php', import.meta.url), 'utf8');
const section = (start, end) => {
  const a = source.indexOf(start), b = source.indexOf(end, a);
  assert(a >= 0 && b > a, start);
  return source.slice(a, b);
};
const base = section('    function ww_qrbs_text_length(', '    function ww_qrbs_validate_https_url(');
const helpers = section('    /* WW_QR_ADMIN_DRAW_RESET_HELPERS_START */', '    /* WW_QR_ADMIN_DRAW_RESET_HELPERS_END */');
const handler = section('    /* WW_QR_ADMIN_DRAW_RESET_REQUEST_START */', '    /* WW_QR_ADMIN_DRAW_RESET_REQUEST_END */');
const b64 = value => Buffer.from(value).toString('base64');
function php(code) {
  const dir = mkdtempSync(join(realpathSync(tmpdir()), 'ww-draw-reset-'));
  try {
    const file = join(dir, 'fixture.php');
    writeFileSync(file, '<?php\n' + code);
    return JSON.parse(execFileSync(process.execPath, [fileURLToPath(new URL('../node_modules/@php-wasm/cli/php-wasm.js', import.meta.url)), file], { encoding: 'utf8', timeout:60000, maxBuffer:2*1024*1024 }));
  } finally { rmSync(dir, {recursive:true,force:true}); }
}
const valid = {csrf_token:'offline-csrf',action:'draw_reset',dataset:'winners',event_key:'offline-test',vendor_id:'990001',draw_id:'11111111-1111-4111-8111-111111111111',expected_generation:'0',request_id:'22222222-2222-4222-8222-222222222222',operator_identity:'Offline admin',reason:'Vendor requested a fresh draw'};
const payload = {...valid, expected_generation:0}; delete payload.csrf_token;
const reply = {ok:true,action:'draw_reset',dataset:'winners',event_key:valid.event_key,vendor_id:valid.vendor_id,draw_id:valid.draw_id,request_id:valid.request_id,from_generation:0,to_generation:1,replayed:false};

test('PHP reset input rejects malformed identities, unsafe text and extra authority fields', () => {
  const good = [valid,{...valid,expected_generation:'2'}, {...valid,reason:'R'.repeat(500)}];
  const bad = [
    {...valid,action:'send_email'}, {...valid,dataset:'entries'}, {...valid,event_key:'bad event'}, {...valid,vendor_id:'0'}, {...valid,vendor_id:['990001']},
    {...valid,draw_id:'not-a-uuid'}, {...valid,request_id:'bad'}, {...valid,expected_generation:'-1'}, {...valid,expected_generation:'1e2'}, {...valid,expected_generation:'01'}, {...valid,expected_generation:'9007199254740992'},
    {...valid,operator_identity:'a'}, {...valid,operator_identity:'<Admin>'}, {...valid,reason:'a'}, {...valid,reason:'R'.repeat(501)}, {...valid,reason:'first\nsecond'}, {...valid,reason:'<script>'}, {...valid,admin:'1'}, {...valid,verified_couple:'990001'},
  ];
  for (const key of Object.keys(valid)) { const missing={...valid}; delete missing[key]; bad.push(missing); }
  assert(!helpers.includes('\\'), 'PHP survives BD backslash stripping');
  const got=php(`eval(stripslashes(base64_decode('${b64(base+helpers)}')));$cases=json_decode(base64_decode('${b64(JSON.stringify([...good,...bad]))}'),true);$out=array();foreach($cases as $case){try{$out[]=ww_qrbs_draw_reset_request($case);}catch(Exception $e){$out[]=false;}}echo json_encode($out);`);
  assert.deepEqual(got[0],payload);
  assert.deepEqual(got.map(Boolean), [...good.map(()=>true),...bad.map(()=>false)]);
});

test('PHP verifies exact reset reply and accepts an idempotent replay', () => {
  const bad = [{...reply,ok:1},{...reply,action:'contact_remove'},{...reply,dataset:'entries'},{...reply,event_key:'other-event'},{...reply,vendor_id:'990002'},{...reply,draw_id:valid.request_id},{...reply,request_id:valid.draw_id},{...reply,from_generation:1},{...reply,to_generation:2},{...reply,to_generation:'1'},{...reply,replayed:1}];
  for(const key of Object.keys(reply)){const missing={...reply};delete missing[key];bad.push(missing);}
  const replies=[reply,{...reply,replayed:true},...bad];
  const got=php(`eval(stripslashes(base64_decode('${b64(base+helpers)}')));$payload=json_decode(base64_decode('${b64(JSON.stringify(payload))}'),true);$cases=json_decode(base64_decode('${b64(JSON.stringify(replies))}'),true);$out=array();foreach($cases as $case)$out[]=ww_qrbs_draw_reset_response($case,$payload);echo json_encode($out);`);
  assert.deepEqual(got,[true,true,...bad.map(()=>false)]);
});

test('reset POST uses authenticated route and CSRF before the signed proxy', () => {
  assert(source.indexOf("$ww_qrbs_request_path !== '/admin/go.php'") < source.indexOf('function ww_qrbs_draw_reset_request'));
  assert(source.indexOf('hash_equals($ww_qrbs_csrf, $ww_qrbs_submitted_csrf)') < source.indexOf('/* WW_QR_ADMIN_DRAW_RESET_REQUEST_START */'));
  assert(handler.includes("$origin !== 'https://' . $host"));
  assert(handler.includes('ww_qrbs_edge_call($ww_qrbs_database, $payload)'));
  const inputs=[{host:'ww2.managemydirectory.com',origin:'https://ww2.managemydirectory.com',status:200,reply},{host:'ww2.managemydirectory.com',origin:'https://attacker.invalid',status:200,reply},{host:'attacker.invalid',origin:'https://attacker.invalid',status:200,reply},{host:'www.weddingwin.ca',origin:'https://www.weddingwin.ca',status:409,reply:{ok:false,error:'Draw changed. Refresh the list.'}},{host:'www.weddingwin.ca',origin:'https://www.weddingwin.ca',status:200,reply:{...reply,to_generation:5}},{host:'www.weddingwin.ca',origin:'https://www.weddingwin.ca',status:500,reply:{ok:false,error:'<unsafe>'}}];
  // Each fixture invokes the real POST branch. The transport alone is stubbed;
  // there is no database or email connection in this test.
  for (const [index,input] of inputs.entries()) {
    const code=`eval(stripslashes(base64_decode('${b64(base+helpers)}')));$_POST=json_decode(base64_decode('${b64(JSON.stringify(valid))}'),true);$_SERVER=array('HTTP_HOST'=>'${input.host}','HTTP_ORIGIN'=>'${input.origin}');$ww_qrbs_post_action='draw_reset';$ww_qrbs_database='offline';$calls=0;function ww_qrbs_edge_call($db,$payload){global $calls;$calls++;return json_decode(base64_decode('${b64(JSON.stringify({http_status:input.status,payload:input.reply}))}'),true);}function ww_qrbs_response_succeeded($result){return $result['http_status']===200 && $result['payload']['ok']===true;}function ww_qrbs_data_json($body,$status){global $calls;echo json_encode(array('status'=>$status,'body'=>$body,'calls'=>$calls));exit();}eval(stripslashes(base64_decode('${b64(handler)}')));`;
    const got=php(code);
    assert.equal(got.status,[200,400,400,409,503,503][index]);
    assert.equal(got.calls,[1,0,0,1,1,1][index]);
    if(index===0) assert.deepEqual(got.body,reply);
    if(index===5) assert(!got.body.error.includes('<'));
  }
});
