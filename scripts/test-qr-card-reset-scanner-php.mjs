// Real PHP routes with synthetic accounts, SQLite scan rows and offline Edge replies.
import assert from 'node:assert/strict';
import test from 'node:test';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const source = readFileSync(new URL('../brilliant-directories/widgets/258-julian-qr-code-bingo.php', import.meta.url), 'utf8');
const encode = value => Buffer.from(value).toString('base64');
const section = (start, end) => {
  const from = source.indexOf(start), to = source.indexOf(end, from + start.length);
  assert(from >= 0 && to > from, start); return source.slice(from, to);
};
const helpers = section('    function ww_qr_bingo_is_positive_json_integer(', '    /* WW_QR_SCANNER_WINDOW_HELPERS_START */') +
  section('/* WW_QR_COUPLE_CARD_STATE_START */', '/* WW_QR_COUPLE_CARD_STATE_END */');
function php(code) {
  const directory = mkdtempSync(join(realpathSync(tmpdir()), 'ww-card-reset-php-'));
  try {
    const path = join(directory, 'fixture.php'); writeFileSync(path, '<?php\n' + code);
    return JSON.parse(execFileSync(process.execPath, [fileURLToPath(new URL('../node_modules/@php-wasm/cli/php-wasm.js', import.meta.url)), path],
      { encoding: 'utf8', maxBuffer: 4 * 1024 * 1024, timeout: 60000 }));
  } finally { rmSync(directory, { recursive: true, force: true }); }
}
const initial = { event_key: 'offline-event', couple_id: '90001', generation: 0, scan_reset_after: null };
const reset = { ...initial, generation: 3, scan_reset_after: '2026-09-11T12:00:00Z' };
const config = { event_key: 'offline-event', event_name: 'Offline show', vendor_tag_id: 30, revision: 9,
  rules_version: 'offline-rules', official_rules_url: 'https://www.weddingwin.ca/qr-bingo-vendor-draw-rules',
  scan_enabled: true, vendor_draws_enabled: true, scan_open_early: true,
  scan_opens_at: '2030-10-18T04:00:00Z', scan_history_starts_at: '2026-09-01T00:00:00Z',
  history_starts_at: '2030-10-18T15:00:00Z', entry_closes_at: '2030-10-18T19:00:00Z' };

function route({ action = 'get_scanned', card = initial, privateFixture = false, probeCard = card,
  scanCard = card, lock = '1', visits = [], fields = {}, origin = 'https://www.weddingwin.ca' } = {}) {
  const fixture = { action, card, privateFixture, probeCard, scanCard, lock, visits, config };
  const post = { action, vendor_id: '707', qr_csrf: 'c'.repeat(64), expected_event_key: config.event_key,
    expected_config_revision: '9', participation_notice_version: 'offline-rules|2026-09-04-pre-scan-draw-consent', ...fields };
  const adapted = source.replace('$eventConfig = ww_qr_bingo_runtime_config();', '$eventConfig = ww_qr_bingo_scanner_config($fixture["config"]);');
  return php(`
    ini_set('display_errors','0');date_default_timezone_set('UTC');http_response_code(200);
    $fixture=json_decode(base64_decode('${encode(JSON.stringify(fixture))}'),true);
    $fixture['config']['history_starts_at_unix']=strtotime($fixture['config']['history_starts_at']);
    $fixture['config']['entry_closes_at_unix']=strtotime($fixture['config']['entry_closes_at']);
    $_SERVER=array('REQUEST_METHOD'=>'POST','REQUEST_URI'=>'/qr','HTTP_ORIGIN'=>base64_decode('${encode(origin)}'));
    $_COOKIE=array('userid'=>'90001');$_POST=json_decode(base64_decode('${encode(JSON.stringify(post))}'),true);
    ini_set('session.save_path','/tmp');session_id('offline-card-reset-test');session_start();$_SESSION['ww_qr_couple_website_csrf']=array('member_id'=>'90001','token'=>str_repeat('c',64));
    $w=array('database'=>'offline');$events=array();$calls=array();$queries=array();
    $database=new SQLite3(':memory:');
    $database->createFunction('NOW',function(){return gmdate('Y-m-d H:i:s');});
    $database->exec('CREATE TABLE users_data(user_id INTEGER PRIMARY KEY,subscription_id INTEGER,active INTEGER,bingo_completed INTEGER DEFAULT 0,bingo_completion_date TEXT)');
    $database->exec('INSERT INTO users_data(user_id,subscription_id,active) VALUES(90001,18,2),(90002,18,2),(707,17,2),(808,17,2)');
    $database->exec('CREATE TABLE rel_tags(object_id INTEGER,tag_id INTEGER,tag_type_id INTEGER)');
    $database->exec('INSERT INTO rel_tags VALUES(707,30,1),(808,30,1)');
    $database->exec('CREATE TABLE vendor_visits(user_id INTEGER,vendor_id INTEGER,scan_date TEXT DEFAULT CURRENT_TIMESTAMP,UNIQUE(user_id,vendor_id))');
    foreach($fixture['visits'] as $row){$q=$database->prepare('INSERT INTO vendor_visits VALUES(?,?,?)');foreach($row as $i=>$v)$q->bindValue($i+1,$v);$q->execute();}
    class user {static function isUserLogged($cookies){return true;}}
    function getUser($id,$w){return array('user_id'=>'90001','active'=>'2','subscription_id'=>'18');}
    function ww_email_verification_state($user){return array();}
    function ww_qr_bingo_prepare_json_response(){}
    function mysql_real_escape_string($value){return SQLite3::escapeString($value);}
    function mysql_fetch_assoc($result){return $result?$result->fetchArray(SQLITE3_ASSOC):false;}
    function mysql($unused,$sql){global $database,$events,$queries,$fixture;$queries[]=$sql;
      if(strpos($sql,'GET_LOCK(')!==false){$events[]='lock';return $database->query("SELECT '".SQLite3::escapeString($fixture['lock'])."' AS acquired");}
      if(strpos($sql,'RELEASE_LOCK(')!==false){$events[]='release';return $database->query('SELECT 1');}
      if(strpos($sql,'INSERT INTO vendor_visits')!==false)$events[]='write_scan';
      $sql=str_replace('ON DUPLICATE KEY UPDATE scan_date = NOW()','ON CONFLICT(user_id,vendor_id) DO UPDATE SET scan_date = NOW()',$sql);
      return $database->query($sql);
    }
    function ww_qr_bingo_vendor_draw_request($action,$payload){global $fixture,$events,$calls;
      $events[]=$action;$calls[]=array('action'=>$action,'payload'=>$payload);
      if($action==='contact_profile_get')return array('status_code'=>200,'body'=>array('ok'=>true,'profile_complete'=>true,'event_key'=>$fixture['card']['event_key'],'card_state'=>$fixture['card'],
        'contact_profile'=>array('name'=>'Alex and Sam','email'=>'couple@example.invalid','phone'=>'5550100','version'=>1),'missing_profile_fields'=>array()));
      if($action==='fixture_context'||$action==='scan'){
        $state=$action==='scan'?$fixture['scanCard']:$fixture['probeCard'];
        $scanned=$action==='scan'?array('707'):array();
        return array('status_code'=>200,'body'=>array('ok'=>true,'app_review_fixture'=>$fixture['privateFixture'],'email_test_fixture'=>false,
          'card_state'=>$state,'card_generation'=>$state['generation'],'vendors'=>array(array('id'=>'707','user_id'=>'707','name'=>'Private offline booth')),
          'scanned'=>$scanned,'scanned_count'=>count($scanned),'total_count'=>1,'completed'=>count($scanned)===1));
      }
      return array('status_code'=>200,'body'=>array('ok'=>true,'card_state'=>$fixture['card'],'card_generation'=>$fixture['card']['generation']));
    }
    ob_start();
    register_shutdown_function(function(){global $events,$calls,$queries,$database;$body=ob_get_clean();$status=http_response_code();
      register_shutdown_function(function()use($body,$status){global $events,$calls,$queries,$database;$rows=array();$r=$database->query('SELECT user_id,vendor_id,scan_date FROM vendor_visits ORDER BY user_id,vendor_id');while($row=$r->fetchArray(SQLITE3_ASSOC))$rows[]=$row;
        echo json_encode(array('status'=>$status,'body'=>json_decode($body,true),'raw'=>$body,'events'=>$events,'calls'=>$calls,'queries'=>$queries,'visits'=>$rows));});
    });
    eval('?>'.base64_decode('${encode(adapted)}'));
  `);
}

test('card state validates exact identity and integer generation, with a strict next-second scan floor', () => {
  const invalid = [null, { ...initial, event_key: 'other' }, { ...initial, couple_id: '90002' }, { ...initial, generation: '0' },
    { ...initial, generation: -1 }, { ...initial, generation: 1 }, { ...reset, scan_reset_after: null },
    { ...reset, scan_reset_after: '2026-02-30T12:00:00Z' }, { ...reset, generation: 9007199254740992 }];
  const got = php(`${helpers}$cases=json_decode(base64_decode('${encode(JSON.stringify([initial, reset, ...invalid]))}'),true);$out=array();foreach($cases as $value)$out[]=ww_qr_bingo_card_state($value,'offline-event','90001');
    echo json_encode(array('states'=>$out,'floor'=>ww_qr_bingo_card_floor(strtotime('2026-09-01T00:00:00Z'),$cases[1]),'unchanged'=>ww_qr_bingo_card_floor(99,$cases[0])));`);
  assert.deepEqual(got.states.slice(0, 2), [initial, reset]); assert(got.states.slice(2).every(value => value === null));
  assert.equal(got.floor, Date.parse(reset.scan_reset_after) / 1000 + 1); assert.equal(got.unchanged, 99);
});

test('real scan route locks before loading card state and releases after the confirmed write', () => {
  const got = route({ action: 'scan_vendor', card: reset });
  assert.equal(got.status, 200, got.raw); assert.equal(got.body.card_generation, 3); assert.deepEqual(got.body.card_state, reset);
  assert(got.events.indexOf('lock') < got.events.indexOf('contact_profile_get'));
  assert(got.events.indexOf('contact_profile_get') < got.events.indexOf('write_scan'));
  assert(got.events.indexOf('write_scan') < got.events.indexOf('release'));
  assert.equal(got.visits.length, 1);
  const query = got.queries.find(sql => sql.includes('GET_LOCK('));
  assert.equal(query, "SELECT GET_LOCK('ww_qr_card:" + createHash('sha256').update('offline-event|90001').digest('hex').slice(0, 48) + "', 10) AS acquired");
  assert.equal(got.queries.filter(sql => sql.includes('RELEASE_LOCK(')).length, 1);
});

test('lock rejection and unavailable card state fail closed before any scan write', () => {
  const locked = route({ action: 'scan_vendor', lock: '0' });
  assert.equal(locked.status, 503, locked.raw); assert(!locked.events.includes('contact_profile_get')); assert.equal(locked.visits.length, 0);
  const missing = route({ action: 'scan_vendor', card: { ...initial, generation: '0' } });
  assert.equal(missing.status, 503, missing.raw); assert(!missing.events.includes('write_scan')); assert(missing.events.includes('release'));
});

test('pre-reset native scan generation is rejected before writing and malformed generations fail closed', () => {
  for (const expected of ['0', '2', '4']) {
    const got = route({ action: 'scan_vendor', card: reset, fields: { expected_card_generation: expected } });
    assert.equal(got.status, 409, got.raw); assert.equal(got.body.code, 'stale_card_generation'); assert(!got.events.includes('write_scan')); assert(got.events.includes('release'));
  }
  for (const expected of ['-1', '03', '3.0', '9007199254740992', ['3']]) {
    const got = route({ action: 'scan_vendor', card: reset, fields: { expected_card_generation: expected } });
    assert.equal(got.status, 400, got.raw); assert(!got.events.includes('write_scan'));
  }
  const current = route({ action: 'scan_vendor', card: reset, fields: { expected_card_generation: '3' } });
  assert.equal(current.status, 200, current.raw); assert(current.events.includes('write_scan'));
});

test('real progress SQL excludes visits at the reset second and retains the next second for only this couple', () => {
  const got = route({ card: reset, visits: [[90001, 707, '2026-09-11 12:00:00'], [90001, 808, '2026-09-11 12:00:01'], [90002, 707, '2026-09-11 12:00:02']] });
  assert.equal(got.status, 200, got.raw); assert.deepEqual(got.body.scanned, ['808']); assert.deepEqual(got.body.vendor_draw_scanned, ['808']);
  assert.equal(got.body.card_generation, 3); assert.deepEqual(got.body.card_state, reset); assert.equal(got.visits.length, 3);
  assert(got.queries.some(sql => sql.includes("vv.scan_date >= '2026-09-11 12:00:01'")));
});

test('a scan at or before the reset cutoff cannot create fresh proof', () => {
  const card = { ...reset, scan_reset_after: '2029-09-11T12:00:00Z' };
  const got = route({ action: 'scan_vendor', card });
  assert.equal(got.status, 409, got.raw); assert.equal(got.body.code, 'card_reset_in_progress');
  assert(!got.events.includes('write_scan')); assert(got.events.includes('release'));
});

test('signed offer and opt-in forwarding use the loaded generation and ignore a forged browser generation', () => {
  for (const action of ['raffle_offer', 'raffle_opt_in']) {
    const got = route({ action, card: reset, fields: { expected_card_generation: '999', vendor_offer_version: '2026-09-11T12:00:00Z', consent_version: 'offline-rules', participant_responsibility_disclosure: 'Offline canonical disclosure' } });
    assert.equal(got.status, 200, got.raw);
    assert.equal(got.calls.find(call => call.action === action).payload.expected_card_generation, 3);
    assert.equal(got.visits.length, 0);
  }
});

test('private fixture scan and progress keep their effective event and current generation', () => {
  const card = { ...reset, event_key: 'private-offline-event' };
  const scanned = route({ action: 'scan_vendor', privateFixture: true, card });
  assert.equal(scanned.status, 200, scanned.raw); assert.deepEqual(scanned.body.card_state, card); assert.equal(scanned.body.card_generation, 3);
  assert.equal(scanned.calls.find(call => call.action === 'scan').payload.expected_card_generation, 3);
  assert(scanned.queries.find(sql => sql.includes('GET_LOCK(')).includes(createHash('sha256').update('private-offline-event|90001').digest('hex').slice(0, 48)));
  assert.equal(scanned.body.vendor_draw_scan, true); assert.equal(scanned.visits.length, 0);
  const progress = route({ privateFixture: true, card });
  assert.equal(progress.status, 200, progress.raw); assert.deepEqual(progress.body.card_state, card); assert.equal(progress.body.card_generation, 3);
});

test('fixture state from another couple or generation cannot be reused across reset', () => {
  const card = { ...reset, event_key: 'private-offline-event' };
  const foreign = route({ privateFixture: true, card, probeCard: { ...card, couple_id: '90002' } });
  assert.equal(foreign.status, 503, foreign.raw); assert(!foreign.events.includes('contact_profile_get'));
  const stale = route({ action: 'scan_vendor', privateFixture: true, card, probeCard: { ...card, generation: 2 } });
  assert.equal(stale.status, 409, stale.raw); assert.equal(stale.body.code, 'stale_card_generation'); assert(!stale.calls.some(call => call.action === 'scan'));
  assert(stale.events.includes('release'));
  const responseStale = route({ action: 'scan_vendor', privateFixture: true, card, scanCard: { ...card, generation: 2 } });
  assert.equal(responseStale.status, 502, responseStale.raw); assert.equal(responseStale.body.status, 'error');
});
