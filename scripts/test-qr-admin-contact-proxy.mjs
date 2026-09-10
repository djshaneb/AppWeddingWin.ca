import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import test from 'node:test';

const source = readFileSync(new URL('../brilliant-directories/widgets/ww-qr-bingo-settings.php', import.meta.url), 'utf8');
const section = (start, end) => source.slice(source.indexOf(start), source.indexOf(end, source.indexOf(start)));
const base = section('    function ww_qrbs_text_length(', '    function ww_qrbs_validate_https_url(');
const contacts = section('    /* WW_QR_ADMIN_CONTACT_HELPERS_START */', '    /* WW_QR_ADMIN_CONTACT_HELPERS_END */');
const fields = section('    function ww_qrbs_data_filters(', '    function ww_qrbs_csv_cell(');
const valid = { action:'contact_add', dataset:'contacts', csrf_token:'test-csrf', event_key:'private-admin-test', couple_id:'990001', expected_version:'0', request_id:'12345678-1234-4234-8234-123456789abc', operator_identity:'Offline admin test', name:'Alex & Jamie', email:'couple@example.invalid', phone:'555-123-4567', wedding_date:'2027-03-17', wedding_venue:'Example Hall' };
const remove = { ...valid, action:'contact_remove', expected_version:'1' };
for (const key of ['name','email','phone','wedding_date','wedding_venue']) delete remove[key];
const cases = [
  { value: valid, ok:true },
  { value:{...valid,wedding_date:'',wedding_venue:''}, ok:true },
  { value:remove, ok:true },
  { value:{...remove,action:'contact_restore'}, ok:true },
  { value:{...valid,verified_couple:{id:'990001',subscription_id:'18',active:'2'}}, ok:false },
  { value:{...valid,consent_share_contact:'1'}, ok:false },
  { value:{...valid,event_key:'bad event'}, ok:false },
  { value:{...valid,dataset:'winners'}, ok:false },
  { value:{...valid,couple_id:'0'}, ok:false },
  { value:{...valid,couple_id:['990001']}, ok:false },
  { value:{...valid,expected_version:'1'}, ok:false },
  { value:{...remove,expected_version:'0'}, ok:false },
  { value:{...remove,expected_version:'1e4'}, ok:false },
  { value:{...remove,name:'Cannot modify while removing'}, ok:false },
  { value:{...valid,request_id:'not-a-uuid'}, ok:false },
  { value:{...valid,operator_identity:''}, ok:false },
  { value:{...valid,name:'<script>bad</script>'}, ok:false },
  { value:{...valid,name:'WeddingWin Couple'}, ok:false },
  { value:{...valid,email:'abc@privaterelay.appleid.com'}, ok:false },
  { value:{...valid,email:'couple@example.invalid\r\nBcc: other@example.invalid'}, ok:false },
  { value:{...valid,phone:'123'}, ok:false },
  { value:{...valid,wedding_date:'2027-02-30'}, ok:false },
  { value:{...valid,wedding_date:''}, ok:false },
  { value:{...valid,wedding_venue:'X'.repeat(201)}, ok:false },
];
const encoded = value => Buffer.from(value).toString('base64');
const php = code => JSON.parse(execFileSync('npm',['exec','--offline','--package=@php-wasm/cli','--','php-wasm-cli','-r',code],{encoding:'utf8',timeout:60000,maxBuffer:2*1024*1024}));

test('actual PHP admin contact validation survives BD backslash stripping', () => {
  assert(!contacts.includes('\\'), 'new widget_data PHP must not depend on preserved backslashes');
  const got = php(`eval(stripslashes(base64_decode('${encoded(base+contacts)}'))); $cases=json_decode(base64_decode('${encoded(JSON.stringify(cases))}'),true); $out=array(); foreach($cases as $case){try{$value=ww_qrbs_contact_mutation($case['value']);$out[]=array('ok'=>true,'value'=>$value);}catch(Exception $e){$out[]=array('ok'=>false);}} echo json_encode($out);`);
  assert.deepEqual(got.map(row=>row.ok),cases.map(row=>row.ok));
  assert.equal(got[0].value.name,'Alex & Jamie');
  assert.equal(got[0].value.expected_version,0);
  assert(!('csrf_token' in got[0].value));
  assert(!('verified_couple' in got[0].value));
});

test('lookup is bounded and never accepts client membership proof', () => {
  const lookupCases = [{action:'contact_lookup',csrf_token:'test',search:'Alex'}, {action:'contact_lookup',search:'a'}, {action:'contact_lookup',search:'Alex',verified_couple:'18'}, {action:'contact_lookup',search:'X'.repeat(121)}];
  const got=php(`eval(stripslashes(base64_decode('${encoded(base+contacts)}'))); $cases=json_decode(base64_decode('${encoded(JSON.stringify(lookupCases))}'),true);$out=array();foreach($cases as $case){try{ww_qrbs_contact_lookup_request($case);$out[]=true;}catch(Exception $e){$out[]=false;}} echo json_encode($out);`);
  assert.deepEqual(got,[true,false,false,false]);
  assert(contacts.includes("u.subscription_id='18' AND u.active='2'"));
  assert(contacts.includes('LIMIT 20'));
  assert(!contacts.includes('SELECT *'));
});

test('contact status filters are exact and Contacts-only', () => {
  const filter={action:'data_list',dataset:'contacts',event_key:'test-event'};
  const inputs=[filter,{...filter,contact_status:'removed'},{...filter,contact_status:'all'},{...filter,contact_status:'bad'},{...filter,dataset:'winners',contact_status:'active'}];
  const got=php(`eval(stripslashes(base64_decode('${encoded(base+fields)}')));$cases=json_decode(base64_decode('${encoded(JSON.stringify(inputs))}'),true);$out=array();foreach($cases as $case){try{$out[]=ww_qrbs_data_filters($case);}catch(Exception $e){$out[]=false;}}echo json_encode($out);`);
  assert.equal(got[0].contact_status,'active'); assert.equal(got[1].contact_status,'removed'); assert.equal(got[2].contact_status,'all'); assert.equal(got[3],false); assert.equal(got[4],false);
});

test('mutation proxy keeps route, CSRF, origin and signed identity protections', () => {
  const handler=section('    /* WW_QR_ADMIN_CONTACT_REQUEST_START */','    /* WW_QR_ADMIN_CONTACT_REQUEST_END */');
  assert(source.indexOf("$ww_qrbs_request_path !== '/admin/go.php'") < source.indexOf('function ww_qrbs_contact_mutation'));
  assert(source.indexOf('hash_equals($ww_qrbs_csrf, $ww_qrbs_submitted_csrf)') < source.indexOf('/* WW_QR_ADMIN_CONTACT_REQUEST_START */'));
  assert(handler.includes("$origin !== 'https://' . $host"));
  assert(handler.includes("ww_qrbs_contact_member_rows($ww_qrbs_database, $payload['couple_id'], true)"));
  assert(handler.includes("$payload['verified_couple'] = array('id' => $members[0]['couple_id']"));
  assert(handler.includes('ww_qrbs_edge_call($ww_qrbs_database, $payload)'));
  assert(handler.includes("$reply['request_id'] !== $payload['request_id']"));
  for (const unsafe of ['DELETE FROM','INSERT INTO','UPDATE users_data','vendor_visits','consent_share_contact']) assert(!handler.includes(unsafe));
});
