// Real PHP7.4 results functions and real query execution against an isolated
// SQLite database. MySQL's used SELECT/JOIN/GROUP syntax is SQLite-compatible;
// the adapter changes only the database API, not the production SQL text.
// No live service, account, scan or network request is used.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pathToFileURL, fileURLToPath } from 'node:url';
import test, { after } from 'node:test';

const root = process.env.QR_PHP_WASM_ROOT || fileURLToPath(new URL('../node_modules/@php-wasm', import.meta.url));
assert.equal(JSON.parse(readFileSync(`${root}/node/package.json`, 'utf8')).version, '3.1.52');
const { PHP } = await import(pathToFileURL(`${root}/universal/index.js`));
const { loadNodeRuntime } = await import(pathToFileURL(`${root}/node/index.js`));
const php = new PHP(await loadNodeRuntime('7.4', { emscriptenOptions: { processId: process.pid } }));
after(() => php.exit());
const source = readFileSync(new URL('../brilliant-directories/widgets/262-qr-bingo-results.php', import.meta.url), 'utf8');
const declarationEnd = source.indexOf('// WW_QRR_ACCESS_GATE');
assert(declarationEnd > 0);
const declarations = source.slice(0, declarationEnd);
const fixtureHash = (await php.run({code:'<?php echo password_hash("offline-fixture-password", PASSWORD_BCRYPT);'})).text;
assert.doesNotMatch(source, /[$]2[aby][$][0-9]{2}[$][./A-Za-z0-9]{53}/, 'Never publish a password verifier in the widget source.');
const config = Object.freeze({ event_key: 'offline-event', event_name: 'Offline wedding show', vendor_tag_id: 30,
  revision: 15, scan_open_early: true, scan_opens_at: '2026-10-18T04:00:00Z',
  scan_history_starts_at: '2026-09-08T18:36:05Z', history_starts_at: '2026-10-18T15:00:00Z', entry_closes_at: '2026-10-18T19:00:00Z' });
const baseMembers = [[40001, 17, 2], [40002, 17, 2], [40003, 17, 1], [40004, 17, 2], [40005, 17, 2],
  [10001, 18, 2], [10002, 4, 2], [10003, 17, 2]];
const baseTags = [[40001, 30, 1], [40001, 30, 1], [40002, 30, 1], [40003, 30, 1], [40004, 99, 1], [40005, 30, 2]];
const b64 = value => Buffer.from(value).toString('base64');

async function run({ payload = config, visits = [], members = baseMembers, tags = baseTags,
  operation = 'scoreboard', failureStage = 0, method = 'POST', revision = '15', authenticated = true,
  cookieState = 'valid', origin = 'https://www.weddingwin.ca', action = 'get_scoreboard_data', password = '', passwordHash = fixtureHash,
  contactRows = [], contactFailure = false, resetRows = [], resetFailure = false, resetReply = null } = {}) {
  const fixture = { config: payload, members, tags, visits, failureStage, contactRows, contactFailure, passwordHash, resetRows, resetFailure, resetReply };
  // Sign any fixture cookie with a valid synthetic verifier, then apply the
  // requested server configuration before executing the real access gate.
  const configureHash = "$fixture['passwordHash']===null?putenv('WW_QR_RESULTS_PASSWORD_HASH'):putenv('WW_QR_RESULTS_PASSWORD_HASH='.$fixture['passwordHash']);";
  const access = authenticated ? `$payload=(time()+${cookieState === 'expired' ? '-1' : '3600'}).'.'.str_repeat('a',32);$_COOKIE['__Secure-ww_qrr_access']=$payload.'.'.${cookieState === 'tampered' ? "str_repeat('b',64)" : "ww_qrr_signature($payload,str_repeat('s',64))"};` : '';
  const evaluatedSource = operation === 'http'
    ? source.replace('// WW_QRR_ACCESS_GATE', access + configureHash + '\n// WW_QRR_ACCESS_GATE').replace('$wwQrrConfig = ww_qrr_runtime_config();', '$wwQrrConfig = ww_qrr_normalize_config($fixture["config"]);')
    : declarations;
  const code = `<?php
    ini_set('display_errors','0');date_default_timezone_set('UTC');
    $fixture=json_decode(base64_decode('${b64(JSON.stringify(fixture))}'),true);
    putenv('WW_QR_RESULTS_PASSWORD_HASH='.base64_decode('${b64(fixtureHash)}'));
    $database=new SQLite3(':memory:');$queryCount=0;$queries=array();
    $database->exec("CREATE TABLE users_data(user_id INTEGER PRIMARY KEY, subscription_id INTEGER, active INTEGER, first_name TEXT DEFAULT 'Alex', last_name TEXT DEFAULT 'Couple', email TEXT DEFAULT 'review@example.invalid', phone_number TEXT DEFAULT '555-0100')");
    $database->exec('CREATE TABLE rel_tags(object_id INTEGER, tag_id INTEGER, tag_type_id INTEGER)');
    $database->exec('CREATE TABLE vendor_visits(user_id INTEGER, vendor_id INTEGER, scan_date TEXT)');
    foreach(array('members'=>array('users_data',3),'tags'=>array('rel_tags',3),'visits'=>array('vendor_visits',3)) as $key=>$table){
      $statement=$database->prepare('INSERT INTO '.$table[0].($key==='members'?' (user_id,subscription_id,active)':'').' VALUES (?,?,?)');
      foreach($fixture[$key] as $row){foreach($row as $index=>$value){$statement->bindValue($index+1,$value,is_int($value)?SQLITE3_INTEGER:SQLITE3_TEXT);}$statement->execute();$statement->reset();}
    }
    $w=array('database'=>'offline');
    function mysql($unused,$sql){global $database,$queries,$queryCount,$fixture;if(strpos($sql,'ww_qr_bingo_admin_credentials')!==false)return $database->query("SELECT '".str_repeat('s',64)."' AS secret_text");$queries[]=$sql;$queryCount++;if($queryCount===$fixture['failureStage'])return false;return $database->query($sql);}
    function mysql_fetch_assoc($result){return $result->fetchArray(SQLITE3_ASSOC);}
    function mysql_real_escape_string($text){return SQLite3::escapeString($text);}
    foreach(array('CURLOPT_POST','CURLOPT_POSTFIELDS','CURLOPT_HTTPHEADER','CURLOPT_FOLLOWLOCATION','CURLOPT_CONNECTTIMEOUT','CURLOPT_TIMEOUT','CURLOPT_SSL_VERIFYPEER','CURLOPT_SSL_VERIFYHOST','CURLOPT_WRITEFUNCTION','CURLINFO_HTTP_CODE') as $index=>$key)if(!defined($key))define($key,$index+1);
    function ww_test_curl_init($url){return (object)array('options'=>array());}
    function ww_test_curl_setopt_array($curl,$options){$curl->options=$options;return true;}
    function ww_test_curl_exec($curl){global $fixture;$payload=json_decode($curl->options[CURLOPT_POSTFIELDS],true);$curl->reset=$payload['action']==='card_reset_cutoffs';$reply=$curl->reset?($fixture['resetReply']===null?array('ok'=>true,'action'=>'card_reset_cutoffs','event_key'=>$fixture['config']['event_key'],'rows'=>$fixture['resetRows'],'has_more'=>false):$fixture['resetReply']):array('ok'=>true,'dataset'=>'contacts','event_key'=>$fixture['config']['event_key'],'rows'=>$fixture['contactRows'],'has_more'=>false);$body=json_encode($reply);$write=$curl->options[CURLOPT_WRITEFUNCTION];$write($curl,$body);return true;}
    function ww_test_curl_getinfo($curl,$key){global $fixture;return ($curl->reset?$fixture['resetFailure']:$fixture['contactFailure'])?503:200;}
    function ww_test_curl_close($curl){}
    eval('?>'.base64_decode('${b64(evaluatedSource.replaceAll('curl_', 'ww_test_curl_'))}'));
    ${operation !== 'http' ? access + configureHash : ''}
    ${operation === 'config' ? 'echo json_encode(ww_qrr_normalize_config($fixture["config"]));'
      : operation === 'scoreboard' ? '$normalized=ww_qrr_normalize_config($fixture["config"]);echo json_encode(array("result"=>ww_qrr_scoreboard($normalized),"queries"=>$queries));'
      : operation === 'password-config' ? 'echo json_encode(array("configured"=>ww_qrr_password_hash()!=="","authorized"=>ww_qrr_authorized()));' : ''}
  `;
  return php.run({ code, relativeUri: '/qr_results', protocol: 'https', method,
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Origin: origin },
    body: method === 'POST' ? new TextEncoder().encode(new URLSearchParams({ action, results_password:password, expected_event_key: 'offline-event', expected_config_revision: revision }).toString()) : undefined,
  });
}

test('results retain authorized early scans when early access is turned off', async () => {
  const visits = [[10001, 40001, '2026-09-08 18:36:05']];
  for (const scan_open_early of [true, false]) {
    const response = await run({ payload: { ...config, scan_open_early }, visits });
    assert.equal(response.httpStatusCode, 200, response.text);
    const { result, queries } = response.json;
    assert.equal(result.active_participants, 1); assert.equal(result.participants[0].scanned_count, 1);
    assert(queries[1].includes("vv.scan_date >= '2026-09-08 18:36:05'"));
    assert(queries[1].includes("vv.scan_date < '2026-10-18 19:00:00'"));
  }
});

test('real SQL uses inclusive retained floor and exclusive close, with distinct current active vendors', async () => {
  const { result } = (await run({ visits: [
    [10001, 40001, '2026-09-08 18:36:05'], [10001, 40001, '2026-10-18 16:00:00'],
    [10001, 40002, '2026-10-18 18:59:59'],
    [10002, 40001, '2026-09-08 18:36:04'], [10002, 40002, '2026-10-18 19:00:00'],
    [10002, 40003, '2026-10-18 16:00:00'], [10002, 40004, '2026-10-18 16:00:00'], [10002, 40005, '2026-10-18 16:00:00'],
    [10003, 40001, '2026-10-18 16:00:00'], [19999, 40001, '2026-10-18 16:00:00'],
  ] })).json;
  assert.equal(result.total_vendors, 2); assert.equal(result.active_participants, 1);
  assert.equal(result.completed_participants, 1); assert.equal(result.participants[0].scanned_count, 2);
  assert.equal(result.participants[0].progress_percentage, 100);
});

test('legacy absent scan floor falls back to show start, never an explicit malformed floor', async () => {
  const legacy = { ...config }; delete legacy.scan_history_starts_at;
  const normalized = (await run({ operation: 'config', payload: legacy })).json;
  assert.equal(normalized.scan_history_starts_at_sql, '2026-10-18 15:00:00');
  for (const value of [null, '', {}, 0, '2026-09-31T12:00:00Z', '2026-09-08T24:00:00Z', '2026-09-08T12:00:00+14:01', '2026-10-18T15:00:01Z']) {
    assert.equal((await run({ operation: 'config', payload: { ...config, scan_history_starts_at: value } })).json, null);
  }
});

test('malformed identities, revisions and inverted event boundaries fail closed', async () => {
  for (const patch of [{ event_key: "bad' OR 1=1" }, { event_name: '<b>Wrong</b>' }, { vendor_tag_id: '30' },
    { revision: '15' }, { revision: 0 }, { history_starts_at: null }, { entry_closes_at: null },
    { entry_closes_at: config.history_starts_at }, { entry_closes_at: '2026-10-18T14:59:59Z' }]) {
    assert.equal((await run({ operation: 'config', payload: { ...config, ...patch } })).json, null);
  }
  const response = await run({ operation: 'http', payload: { ...config, scan_history_starts_at: null } });
  assert.equal(response.httpStatusCode, 503); assert.equal(response.json.status, 'error');
});

test('501 completed couples plus a partial couple produce accurate totals with only 500 anonymous rows', async () => {
  const members = [...baseMembers], visits = [];
  for (let i = 0; i < 501; i++) {
    const id = 20000 + i; members.push([id, 18, 2]);
    visits.push([id, 40001, '2026-09-08 18:36:05'], [id, 40002, '2026-10-18 16:00:00']);
  }
  visits.push([10001, 40001, '2026-10-18 16:00:00']);
  const { result } = (await run({ members, visits })).json;
  assert.equal(result.active_participants, 502); assert.equal(result.completed_participants, 501);
  assert.equal(result.shown_participants, 500); assert.equal(result.display_limit, 500); assert.equal(result.has_more, true);
  assert.equal(result.participants.length, 500);
  assert.equal(new Set(result.participants.map(row => row.member_id)).size, 500);
  for (const row of result.participants) {
    assert.deepEqual(Object.keys(row).sort(), ['email', 'is_completed', 'label', 'member_id', 'phone', 'progress_percentage', 'scanned_count', 'total_vendors']);
    assert.equal(row.label, 'Alex Couple');
    assert.equal(row.email, 'review@example.invalid');
    assert.equal(row.phone, '555-0100');
  }
});

test('real roster/progress query failures return explicit unavailable errors, never successful zero totals', async () => {
  for (const failureStage of [1, 2, 3]) {
    const response = await run({ operation: 'http', failureStage });
    assert.equal(response.httpStatusCode, 503, response.text);
    assert.deepEqual(response.json, { status: 'error', message: 'QR Bingo results are temporarily unavailable. Please try again.' });
    assert(!response.text.includes('SELECT')); assert(!response.text.includes('participants'));
  }
});

test('legitimately empty results remain successful and cannot claim completion', async () => {
  const { result } = (await run({ members: [], tags: [] })).json;
  assert.equal(result.active_participants, 0); assert.equal(result.completed_participants, 0);
  assert.equal(result.total_vendors, 0); assert.equal(result.has_more, false); assert.deepEqual(result.participants, []);
});

test('unauthenticated, expired, and tampered access cannot retrieve contact JSON', async () => {
  for (const options of [{authenticated:false}, {cookieState:'expired'}, {cookieState:'tampered'}]) {
    const response = await run({operation:'http', ...options});
    assert.equal(response.httpStatusCode,401);
    assert.equal(response.json.code,'password_required');
    assert(!response.text.includes('review@example.invalid'));
    assert(!response.text.includes('member_id'));
  }
});

test('locked GET has only a password form and cross-origin requests fail closed', async () => {
  const response=await run({operation:'http',method:'GET',authenticated:false});
  assert(response.text.includes('type="password"'));
  assert(!response.text.includes('id="wwQrResultsApp"'));
  assert(!response.text.includes('review@example.invalid'));
  assert(response.text.includes('noindex,nofollow,noarchive'));
  const foreign=await run({operation:'http',origin:'https://example.invalid'});
  assert.equal(foreign.httpStatusCode,403);
  assert(!foreign.text.includes('member_id'));
});

test('POST revision guard remains intact and JSON never includes standalone HTML', async () => {
  const stale = await run({ operation: 'http', revision: '14' });
  assert.equal(stale.httpStatusCode, 409); assert.equal(stale.json.code, 'stale_event_config');
  const good = await run({ operation: 'http' });
  assert.equal(good.httpStatusCode, 200); assert.equal(good.json.status, 'success');
  assert(!good.text.includes('<meta')); assert(!good.text.includes('<title'));
});

test('standalone GET supplies the mobile viewport and page title; deployed PHP stays backslash-free', async () => {
  const response = await run({ operation: 'http', method: 'GET' });
  assert.equal(response.httpStatusCode, 200);
  assert(response.text.includes('<meta name="viewport" content="width=device-width, initial-scale=1">'));
  assert(response.text.includes('<title>QR Bingo Results | WeddingWin</title>'));
  assert.equal(source.includes('\\'), false);
});

test('password unlock issues a secure one-hour cookie and locking clears it', async () => {
  const response=await run({operation:'http',authenticated:false,action:'unlock_results',password:'offline-fixture-password'});
  assert.equal(response.httpStatusCode,303,response.text);
  const headers=JSON.stringify(response.headers);
  assert.match(headers,/__Secure-ww_qrr_access/);
  assert.match(headers,/secure/i);assert.match(headers,/httponly/i);assert.match(headers,/samesite=Strict/i);
  assert.match(headers,/no-store/);assert.match(headers,/noindex/);
  const locked=await run({operation:'http',action:'lock_results'});
  assert.equal(locked.httpStatusCode,303);
  assert.match(JSON.stringify(locked.headers),/expires=/i);
});

test('server-configured synthetic bcrypt verifier enables access without changing source', async () => {
  const response = await run({ operation: 'password-config' });
  assert.deepEqual(response.json, { configured: true, authorized: true });
});

test('missing or malformed server verifier rejects existing cookies and password unlock', async () => {
  const invalid = [null, '', 'not-a-bcrypt-hash', fixtureHash.slice(0, -1), fixtureHash + 'x',
    fixtureHash + '\n', fixtureHash.replace('$2y$', '$2z$'),
    fixtureHash.slice(0, 4) + '03' + fixtureHash.slice(6),
    fixtureHash.slice(0, 4) + '32' + fixtureHash.slice(6)];
  for (const passwordHash of invalid) {
    assert.deepEqual((await run({ operation: 'password-config', passwordHash })).json,
      { configured: false, authorized: false });
    const blocked = await run({ operation: 'http', passwordHash });
    assert.equal(blocked.httpStatusCode, 401);
    assert.equal(blocked.json.code, 'password_required');
    assert(!blocked.text.includes('member_id'));
    const lockedPage = await run({ operation: 'http', method: 'GET', passwordHash });
    assert(lockedPage.text.includes('type="password"'));
    assert(!lockedPage.text.includes('id="wwQrResultsApp"'));
    const unlock = await run({ operation: 'http', authenticated: false, action: 'unlock_results',
      password: 'offline-fixture-password', passwordHash });
    assert(unlock.text.includes('Access is temporarily unavailable.'));
    assert(!JSON.stringify(unlock.headers).includes('__Secure-ww_qrr_access='));
    assert(!unlock.text.includes('id="wwQrResultsApp"'));
  }
});

test('password guessing is limited across requests without access cookies', async () => {
  for(let i=0;i<5;i++) {
    const response=await run({operation:'http',authenticated:false,action:'unlock_results',password:'incorrect'});
    assert(response.text.includes('not correct'));
    assert(!response.text.includes('member_id'));
  }
  const response=await run({operation:'http',authenticated:false,action:'unlock_results',password:'incorrect'});
  assert.equal(response.httpStatusCode,429);
  assert(response.text.includes('Too many attempts'));
  assert(!response.text.includes('member_id'));
});

test('saved Bingo contact values override account fields only for the matching scanner member', async () => {
  const result=(await run({visits:[[10001,40001,'2026-09-08 18:36:05']],contactRows:[
    {couple_id:'10001',name:'Alex & Jamie',email:'bingo@example.invalid',phone:'555-0199'},
    {couple_id:'99999',name:'Unrelated',email:'unrelated@example.invalid',phone:'555-0111'}
  ]})).json.result;
  assert.equal(result.participants.length,1);
  assert.equal(result.participants[0].label,'Alex & Jamie');
  assert.equal(result.participants[0].email,'bingo@example.invalid');
  assert.equal(result.participants[0].phone,'555-0199');
  assert.equal(result.participants[0].member_id,'10001');
  assert(!JSON.stringify(result).includes('unrelated'));
});

test('Bingo contact service errors do not silently substitute stale account details', async () => {
  const response=await run({operation:'http',visits:[[10001,40001,'2026-09-08 18:36:05']],contactFailure:true});
  assert.equal(response.httpStatusCode,503);
  assert(!response.text.includes('review@example.invalid'));
});

test('account reset removes old scans from totals and rows while retaining fresh scans and other couples', async () => {
  const resetRows = [{couple_id:'10001', generation:1, scan_reset_after:'2026-09-11T20:00:00Z'}];
  const visits = [[10001,40001,'2026-09-11 19:59:59'],[10001,40002,'2026-09-11 20:00:00'],[10002,40001,'2026-09-11 19:59:59'],[10002,40002,'2026-09-11 20:00:00']];
  const before = (await run({visits,resetRows})).json.result;
  assert.equal(before.active_participants,1);assert.equal(before.completed_participants,1);
  assert.deepEqual(before.participants.map(row=>row.member_id),['10002']);
  const after = (await run({visits:[...visits,[10001,40001,'2026-09-11 20:00:01']],resetRows})).json.result;
  assert.equal(after.active_participants,2);assert.equal(after.completed_participants,1);
  assert.equal(after.participants.find(row=>row.member_id==='10001').scanned_count,1);
});

test('unavailable or malformed reset state fails closed instead of displaying cleared cards', async () => {
  const valid={ok:true,action:'card_reset_cutoffs',event_key:config.event_key,rows:[],has_more:false};
  const row={couple_id:'10001',generation:1,scan_reset_after:'2026-09-11T20:00:00Z'};
  const patches=[{resetFailure:true},...[
    {...valid,event_key:'wrong'}, {...valid,action:'data_list'}, {...valid,has_more:true}, {...valid,rows:null},
    {...valid,rows:[{...row,couple_id:"10001' OR 1=1"}]}, {...valid,rows:[{...row,generation:0}]},
    {...valid,rows:[{...row,scan_reset_after:'2026-09-31T20:00:00Z'}]}, {...valid,rows:[row,row]},
  ].map(resetReply=>({resetReply}))];
  for(const patch of patches){const result=await run({operation:'http',...patch});assert.equal(result.httpStatusCode,503,result.text);assert(!result.text.includes('participants'));}
});
