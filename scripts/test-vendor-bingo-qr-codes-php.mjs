import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import test from 'node:test';

const source = readFileSync(new URL('../brilliant-directories/widgets/ww-vendor-bingo-qr-codes.php', import.meta.url), 'utf8');
const helpers = source.slice(source.indexOf('    /* WW_VENDOR_CODES_HELPERS_START */'), source.indexOf('    /* WW_VENDOR_CODES_HELPERS_END */'));
const encode = value => Buffer.from(value).toString('base64');
const php = code => execFileSync('npm', ['exec', '--offline', '--package=@php-wasm/cli', '--', 'php-wasm-cli', '-r', code], {
  encoding: 'utf8', timeout: 60000, maxBuffer: 10 * 1024 * 1024,
});
const evalHelpers = `eval(stripslashes(base64_decode('${encode(helpers)}')));`;
const server = { REQUEST_URI: '/vendor-bingo-qr-codes', REQUEST_METHOD: 'GET' };
const config = {
  ok: true,
  event_config: {
    published: true, event_key: 'fictional-show-2027', revision: 12, vendor_tag_id: 30,
    event_name: 'Fictional Wedding Show', venue_name: 'Example Hall',
    history_starts_at: '2027-10-18T15:00:00+00:00',
    vendor_email_subject: 'NEVER EXPOSE', unrelated_private_field: 'NEVER EXPOSE',
  },
};
const row = { user_id: '990001', company: 'Alex &amp; Jamie Photography', first_name: 'Private', last_name: 'Person', email: 'never@example.invalid', phone: '5551234567' };

test('actual PHP permits public GET only on the exact unlisted route', () => {
  const cases = [
    [server, 'html'],
    [{ ...server, QUERY_STRING: 'page_id=4343&format=json' }, 'html'],
    [{ ...server, REQUEST_URI: '/vendor-bingo-qr-codes/' }, 'html'],
    [{ ...server, REQUEST_URI: '/vendor-bingo-qr-codes/?format=json', QUERY_STRING: 'page_id=4343' }, 'json'],
    [{ ...server, REQUEST_URI: '/vendor-bingo-qr-codes?format=json' }, 'json'],
    [{ ...server, REQUEST_URI: '/admin/go.php' }, 404],
    [{ ...server, REQUEST_URI: '/vendor-bingo-qr-codes/other' }, 404],
    [{ ...server, REQUEST_URI: '/vendor-bingo-qr-codes%2f' }, 404],
    ...['POST', 'PUT', 'DELETE', 'HEAD', 'OPTIONS'].map(REQUEST_METHOD => [{ ...server, REQUEST_METHOD }, 405]),
    ...['event_key=another-event', 'vendor_tag_id=1', 'format[]=json', 'format=html', 'format=json&member_id=990001',
      'format=json&format=json', 'format=json&event_key=another-event', 'format=json;vendor_tag_id=1',
      'format=%6ason', '%66ormat=json', 'format=json&', 'page_id=4343'].map(query => [{ ...server, REQUEST_URI: `${server.REQUEST_URI}?${query}` }, 400]),
  ];
  const output = JSON.parse(php(`${evalHelpers} $cases=json_decode(base64_decode('${encode(JSON.stringify(cases))}'),true); $out=array(); foreach($cases as $case){try{$out[]=ww_vbqc_request($case[0]);}catch(Exception $e){$out[]=$e->getCode();}} echo json_encode($out);`));
  assert.deepEqual(output, cases.map(item => item[1]));
});

test('actual PHP validates published configuration and exposes only public event metadata', () => {
  const replace = patch => ({ ...config, event_config: { ...config.event_config, ...patch } });
  const inputs = [
    config,
    replace({ history_starts_at: '2027-10-18T15:00:00Z' }),
    replace({ published: false }), replace({ published: 'true' }),
    replace({ vendor_tag_id: "30' OR 1=1" }), replace({ vendor_tag_id: '30' }), replace({ vendor_tag_id: 0 }),
    replace({ vendor_tag_id: 2147483648 }), replace({ revision: 0 }), replace({ event_key: 'bad event' }),
    replace({ event_name: '<b>Event</b>' }), replace({ event_name: 'X'.repeat(161) }), replace({ venue_name: '' }),
    replace({ history_starts_at: '2027-02-30T15:00:00Z' }), replace({ history_starts_at: '2027-10-18T25:00:00Z' }),
    replace({ history_starts_at: '2027-10-18T15:00:00+14:01' }),
    { ...config, ok: false }, { ok: true }, 'not-json',
  ];
  const output = JSON.parse(php(`${evalHelpers} $inputs=json_decode(base64_decode('${encode(JSON.stringify(inputs))}'),true); $out=array(); foreach($inputs as $value){try{$out[]=ww_vbqc_config(is_string($value)?$value:json_encode($value));}catch(Exception $e){$out[]=false;}}echo json_encode($out);`));
  assert.deepEqual(output.map(Boolean), [true, true, ...Array(inputs.length - 2).fill(false)]);
  assert.deepEqual(output[0], { tag_id: 30, event: { key: 'fictional-show-2027', name: 'Fictional Wedding Show', venue: 'Example Hall', starts_at: '2027-10-18T15:00:00+00:00', revision: 12 } });
  assert(!JSON.stringify(output).includes('NEVER EXPOSE'));
});

test('actual PHP canonicalizes stable IDs and outputs no contact fields', () => {
  const inputs = [row, { ...row, user_id: '999999999999999999', company: 'É'.repeat(200) }, { ...row, company: '', first_name: 'Public', last_name: 'Vendor' },
    ...['0', '01', '-1', '1.0', '1e3', '1&event=other', '1000000000000000000'].map(user_id => ({ ...row, user_id })),
    { ...row, user_id: ['990001'] }, { ...row, company: 'A\nB' }, { ...row, company: 'X'.repeat(201) },
    { ...row, company: '', first_name: '', last_name: '' }];
  const output = JSON.parse(php(`${evalHelpers} $inputs=json_decode(base64_decode('${encode(JSON.stringify(inputs))}'),true);$out=array();foreach($inputs as $value){try{$out[]=ww_vbqc_vendor($value);}catch(Exception $e){$out[]=false;}}echo json_encode($out);`));
  assert.deepEqual(output.map(Boolean), [true, true, true, ...Array(inputs.length - 3).fill(false)]);
  assert.deepEqual(output[0], { id: '990001', name: 'Alex & Jamie Photography', qr_url: 'https://www.weddingwin.ca/qr?vendor_id=990001' });
  assert.equal(output[1].name, 'É'.repeat(200));
  assert.equal(output[2].name, 'Public Vendor');
  assert(!JSON.stringify(output).includes('never@example.invalid'));
  assert(!JSON.stringify(output).includes('5551234567'));
});

test('actual PHP roster is distinct, deterministic and fails closed at 5001', () => {
  const code = `${evalHelpers}
    $rows=array();$index=0;$query='';$fail=false;
    function mysql($database,$sql){global $query,$fail;$query=$sql;return !$fail;}
    function mysql_fetch_assoc($result){global $rows,$index;return $index<count($rows)?$rows[$index++]:false;}
    function run_roster($input){global $rows,$index;$rows=$input;$index=0;try{return ww_vbqc_roster('test-database',30);}catch(Exception $e){return array('error'=>$e->getCode());}}
    $base=json_decode(base64_decode('${encode(JSON.stringify(row))}'),true);
    $out=array();$out['empty']=run_roster(array());$out['duplicate']=run_roster(array($base,$base));
    $conflict=$base;$conflict['company']='Different name';$out['conflict']=run_roster(array($base,$conflict));
    $many=array();for($n=1;$n<=5001;$n++){$item=$base;$item['user_id']=(string)$n;$many[]=$item;}
    $out['exact_limit']=count(run_roster(array_slice($many,0,5000)));$out['over_limit']=run_roster($many);
    $fail=true;$out['query_failure']=run_roster(array($base));$out['query']=$query;echo json_encode($out);`;
  const output = JSON.parse(php(code));
  assert.deepEqual(output.empty, []);
  assert.equal(output.duplicate.length, 1);
  assert.deepEqual(output.conflict, { error: 503 });
  assert.equal(output.exact_limit, 5000);
  assert.deepEqual(output.over_limit, { error: 503 });
  assert.deepEqual(output.query_failure, { error: 503 });
  assert.match(output.query, /SELECT DISTINCT u\.user_id, u\.company, u\.first_name, u\.last_name/);
  assert.match(output.query, /rt\.tag_id = '30' AND rt\.tag_type_id = 1 AND u\.active = 2/);
  assert.match(output.query, /ORDER BY u\.user_id ASC LIMIT 5001/);
  assert.doesNotMatch(output.query, /email|phone|draw|raffle|fixture|DELETE|UPDATE|INSERT/i);
});

test('actual PHP JSON clears BD page buffers and exits before footer output', () => {
  const output = php(`${evalHelpers} ob_start();echo '<html>BD HEADER';ob_start();echo 'OTHER BUFFER';ww_vbqc_json(array('ok'=>true,'vendors'=>array()),200);echo 'BD FOOTER';`);
  assert.deepEqual(JSON.parse(output), { ok: true, vendors: [] });
  assert(!output.includes('BD HEADER'));
  assert(!output.includes('BD FOOTER'));
});

test('whole JSON handler ignores BD-injected GET routing and builds the exact public feed', () => {
  // Only replace the fixed public HTTP transport with a fixture; execute the real
  // validator, roster query, request handler, response emitter and exit behavior.
  const offlineSource = source.replace('function ww_vbqc_public_config() {', 'function ww_vbqc_unused_http_transport() {');
  const output = php(`
    function ww_vbqc_public_config(){return ww_vbqc_config(base64_decode('${encode(JSON.stringify(config))}'));}
    $rows=json_decode(base64_decode('${encode(JSON.stringify([row]))}'),true);$index=0;
    function mysql($database,$sql){if($database!=='fixture-db'||strpos($sql,"rt.tag_id = '30'")===false){throw new Exception('Unexpected query');}return true;}
    function mysql_fetch_assoc($result){global $rows,$index;return $index<count($rows)?$rows[$index++]:false;}
    $w=array('database'=>'fixture-db');
    $_SERVER=json_decode(base64_decode('${encode(JSON.stringify({ ...server, REQUEST_URI: `${server.REQUEST_URI}?format=json`, QUERY_STRING: 'page_id=4343&format=internal' }))}'),true);
    $_GET=array('page_id'=>'4343','format'=>'internal','event_key'=>'internal-router-value');
    ob_start();echo '<html>Unwanted BD wrapper';
    eval('?>'.stripslashes(base64_decode('${encode(offlineSource)}')));
    echo 'Unwanted footer';
  `);
  const result = JSON.parse(output);
  assert.deepEqual(Object.keys(result).sort(), ['event', 'generated_at', 'ok', 'total', 'vendors']);
  assert.equal(result.ok, true);
  assert.equal(result.total, 1);
  assert.deepEqual(result.vendors, [{ id: '990001', name: 'Alex & Jamie Photography', qr_url: 'https://www.weddingwin.ca/qr?vendor_id=990001' }]);
  assert.deepEqual(Object.keys(result.event).sort(), ['key', 'name', 'revision', 'starts_at', 'venue']);
  assert(Number.isFinite(Date.parse(result.generated_at)));
  for (const secret of ['NEVER EXPOSE', 'Private', 'Person', 'never@example.invalid', '5551234567', 'Unwanted']) assert(!output.includes(secret));
});

test('whole normal page ignores BD-injected GET routing and renders without network or database work', () => {
  const offlineSource = source.replace('function ww_vbqc_public_config() {', 'function ww_vbqc_unused_http_transport() {');
  const output = php(`function ww_vbqc_public_config(){throw new Exception('Unexpected HTTP');}function mysql($database,$sql){throw new Exception('Unexpected database');}$_SERVER=json_decode(base64_decode('${encode(JSON.stringify({ ...server, QUERY_STRING: 'page_id=4343&format=json' }))}'),true);$_GET=array('page_id'=>'4343','format'=>'json','event_key'=>'internal-router-value');eval('?>'.stripslashes(base64_decode('${encode(offlineSource)}')));`);
  const shell = readFileSync(new URL('../brilliant-directories/widgets/ww-vendor-bingo-qr-codes.html', import.meta.url), 'utf8').trim();
  assert(output.includes(shell));
  assert(!output.includes('Unexpected'));
  assert(output.includes('id="wwVendorCodes"'));
  assert(output.includes('data-feed-url="/vendor-bingo-qr-codes?format=json"'));
});

test('whole handler rejects an external event override even when rewritten GET omits it', () => {
  const offlineSource = source.replace('function ww_vbqc_public_config() {', 'function ww_vbqc_unused_http_transport() {');
  const output = php(`function ww_vbqc_public_config(){throw new Exception('Unexpected HTTP');}function mysql($database,$sql){throw new Exception('Unexpected database');}$_SERVER=json_decode(base64_decode('${encode(JSON.stringify({ ...server, REQUEST_URI: `${server.REQUEST_URI}?format=json&event_key=another-event`, QUERY_STRING: 'page_id=4343' }))}'),true);$_GET=array('page_id'=>'4343');ob_start();echo 'BD wrapper';eval('?>'.stripslashes(base64_decode('${encode(offlineSource)}')));`);
  assert.deepEqual(JSON.parse(output), { ok: false, error: 'Only the current published event is available here.' });
  assert(!output.includes('Unexpected'));
});

test('normal page and errors carry no-index/no-store without authentication or writes', () => {
  assert(!source.includes('\\'), 'BD widget_data strips backslashes');
  assert(source.includes("header('X-Robots-Tag: noindex, nofollow')"));
  assert(source.includes("header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0')"));
  assert(source.includes('<meta name="robots" content="noindex,nofollow">'));
  assert.equal((source.match(/ww_vbqc_headers\(\);/g) || []).length, 2);
  for (const forbidden of ['$_SESSION', 'session_start(', 'hash_hmac(', 'Authorization:', 'service_role', 'INSERT INTO', 'DELETE FROM', 'UPDATE users_data', "$_POST"]) assert(!source.includes(forbidden));
  assert(source.includes('CURLOPT_FOLLOWLOCATION, false'));
  assert(source.includes('CURLOPT_SSL_VERIFYPEER, true'));
  assert(source.includes('CURLOPT_SSL_VERIFYHOST, 2'));
  assert(source.includes('strlen($body) + strlen($chunk) > 65536'));
  assert(source.indexOf('ww_vbqc_request($_SERVER)') < source.indexOf('$ww_vbqc_config = ww_vbqc_public_config()'));
  assert(!source.includes('$_GET'));
});
