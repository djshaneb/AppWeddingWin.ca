import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync, mkdtempSync, writeFileSync, rmSync, realpathSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const source=readFileSync(new URL('../brilliant-directories/widgets/ww-qr-bingo-settings.php',import.meta.url),'utf8');
const section=(start,end)=>source.slice(source.indexOf(start),source.indexOf(end,source.indexOf(start)));
const helpers=section('    function ww_qrbs_text_length(', '    function ww_qrbs_validate_https_url(')+section('    /* WW_QR_MASTER_EXPORT_HELPERS_START */','    /* WW_QR_MASTER_EXPORT_HELPERS_END */');
const ID='11111111-2222-4333-8444-555555555555';
const start={action:'master_contacts_export_start',dataset:'master_contacts',operator_identity:'Offline Admin',request_id:ID,csrf_token:'test-only'};
const page={action:'master_contacts_export_page',dataset:'master_contacts',operator_identity:'Offline Admin',export_id:ID,cursor:'5000'};
const complete={...page,action:'master_contacts_export_complete',expected_row_count:'5001'}; delete complete.cursor;
function run(code){
  const directory=mkdtempSync(join(realpathSync(tmpdir()),'ww-master-proxy-'));
  try{
    const path=join(directory,'test.php'); writeFileSync(path,'<?php\n'+code);
    return JSON.parse(execFileSync(process.execPath,[fileURLToPath(new URL('../node_modules/@php-wasm/cli/php-wasm.js',import.meta.url)),path],{encoding:'utf8',timeout:60000,maxBuffer:1024*1024}));
  }finally{rmSync(directory,{recursive:true,force:true});}
}
const encoded=value=>Buffer.from(value).toString('base64');

test('master proxy projects exact typed actions and strips CSRF before the signed backend call',()=>{
  const result=run(`${helpers}$cases=json_decode(base64_decode('${encoded(JSON.stringify([start,page,complete]))}'),true);$out=array();foreach($cases as $case)$out[]=ww_qrbs_master_export_request($case);echo json_encode($out);`);
  assert.deepEqual(result[0],{action:start.action,dataset:'master_contacts',operator_identity:'Offline Admin',request_id:ID});
  assert.equal(result[1].cursor,5000); assert.equal(result[2].expected_row_count,5001);
});

test('master proxy rejects caller filters, forged scope, invalid identifiers and pagination',()=>{
  const invalid=[{...start,event_key:'filter'},{...start,search:'name'},{...start,vendor_id:'1'},{...start,contact_status:'active'},{...start,operator_identity:''},{...start,operator_identity:'<b>Admin</b>'},{...start,operator_identity:['Admin']},{...start,dataset:'contacts'},{...start,action:'data_export'},{...start,request_id:'bad'},{...start,export_id:ID},{...page,cursor:'-1'},{...page,cursor:'0.5'},{...page,cursor:'1e3'},{...page,cursor:'00'},{...page,cursor:['0']},{...complete,expected_row_count:'1000000000'}];
  const result=run(`${helpers}$cases=json_decode(base64_decode('${encoded(JSON.stringify(invalid))}'),true);$out=array();foreach($cases as $case){try{ww_qrbs_master_export_request($case);$out[]=true;}catch(Exception $e){$out[]=false;}}echo json_encode($out);`);
  assert.deepEqual(result,invalid.map(()=>false));
});

test('master handler uses existing admin route, session, CSRF, origin and signed transport; code survives CMS rendering',()=>{
  const handler=section('    /* WW_QR_MASTER_EXPORT_REQUEST_START */','    /* WW_QR_MASTER_EXPORT_REQUEST_END */');
  assert(source.indexOf("$ww_qrbs_request_path !== '/admin/go.php'")<source.indexOf('/* WW_QR_MASTER_EXPORT_REQUEST_START */'));
  assert(source.indexOf('hash_equals($ww_qrbs_csrf, $ww_qrbs_submitted_csrf)')<source.indexOf('/* WW_QR_MASTER_EXPORT_REQUEST_START */'));
  assert(handler.includes("$origin !== 'https://' . $host"));
  assert(handler.includes('ww_qrbs_edge_call($ww_qrbs_database, $payload)'));
  assert(handler.includes("$reply['action'] !== $payload['action']"));
  assert(handler.includes("$reply['dataset'] !== 'master_contacts'"));
  assert(!handler.includes('mysql(')); assert(!helpers.includes('\\')); assert(!handler.includes('\\'));
  assert(source.includes("$payload['action'] === 'master_contacts_export_page') $responseLimit = 2097152"));
  assert(source.includes("$payload['action'] === 'master_contacts_export_start' ? 30 : 15"));
});
