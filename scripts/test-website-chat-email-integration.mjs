import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = name => readFileSync(new URL('../brilliant-directories/widgets/' + name, import.meta.url), 'utf8');
const core = read('email-verification-core.php');
const preflight = read('356-chat-new-thread-guard.php');
const page = read('357-member-profile-contact.php');
const pageJs = read('357-member-profile-contact.js');
const ui = read('chat-email-pending-ui.js');
const extractCore = source => source.match(/\/\* WW_EMAIL_VERIFICATION_CORE_START \*\/[\s\S]*?\/\* WW_EMAIL_VERIFICATION_CORE_END \*\//)?.[0];

test('both standalone chat widgets embed the authoritative PHP core unchanged', () => {
  assert.ok(extractCore(core));
  for (const source of [preflight, page]) {
    assert.equal(extractCore(source), extractCore(core));
    assert.equal((source.match(/WW_EMAIL_VERIFICATION_CORE_START/g) ?? []).length, 1);
  }
});

test('new-thread preflight checks canonical authenticated state before guard events or allowance', () => {
  const auth = preflight.indexOf('$wwGuardFreshMember = ww_ev_current_member();');
  const check = preflight.indexOf('$wwGuardEmailState = ww_email_verification_state($wwGuardFreshMember);');
  const stop = preflight.indexOf("'result' => 'email_confirmation_required'", check);
  assert.ok(auth > 0 && check > auth && stop > check);
  assert.ok(preflight.indexOf('$wwGuardCreate = mysql(') > stop);
  assert.ok(preflight.indexOf("$json['result'] = 'allow';") > stop);
  assert.match(preflight.slice(auth, check), /\$wwGuardFreshMember\['user_id'\] !== \(string\)\$wwGuardSenderId/);
  assert.match(preflight.slice(stop, stop + 1000), /403/);
  assert.match(preflight.slice(stop, stop + 1000), /catch \(Exception \$error\)/);
  assert.match(preflight.slice(stop, stop + 1000), /503/);
});

test('contact page blocks only member compose UX and still renders conversation history', () => {
  assert.match(page, /\$chatViewerUser = array\(\);/);
  assert.match(page, /if \(\$canSendChatMsg && !empty\(\$chatViewerUser\['user_id'\]\)\)/);
  assert.match(page, /\$wwChatFreshMember = ww_ev_current_member\(\);/);
  assert.match(page, /ww_email_verification_state\(\$wwChatFreshMember\)/);
  const notice = page.indexOf('id="ww-chat-email-pending-notice"');
  assert.ok(notice > 0);
  assert.ok(page.indexOf("echo widget($addOnDirectMessages['widget']", notice) > notice);
  assert.match(page.slice(notice, notice + 500), /ww_ev_escape\(\$wwChatEmailNotice\)/);
  assert.match(page.slice(notice, notice + 500), /href="\/verify-email-change"/);
});

test('pending guards run before legacy capture handlers and friendly 403 avoids generic service failure', () => {
  assert.ok(pageJs.startsWith(ui.trimEnd()));
  assert.ok(pageJs.indexOf('__wwChatEmailPendingUiInstalled') < pageJs.indexOf('__wwNewThreadGuardInstalled'));
  const handler = pageJs.indexOf("xhr.responseJSON.result === 'email_confirmation_required'");
  assert.ok(handler > 0);
  assert.match(pageJs.slice(handler, handler + 260), /releaseButton\(button\);/);
  assert.match(pageJs.slice(handler, handler + 260), /showWarning\('Confirm your new email address before sending messages\.'\);/);
  assert.match(pageJs.slice(handler, handler + 260), /return;/);
  assert.equal(read('357-member-profile-contact.css').trim(), read('chat-email-pending-ui.css').trim());
});
