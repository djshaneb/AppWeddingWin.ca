import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import { appSource, loadAppDeclarations } from './native-app-source-fixture.mjs';

// Exercise production declarations and JSX handlers with isolated state. No
// app import, native UI, account, network, credentials, or persistent writes.
const ast = ts.createSourceFile('index.tsx', appSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let nativeHome;
function find(node) {
  if (ts.isFunctionDeclaration(node) && node.name?.text === 'NativeHome') nativeHome = node;
  ts.forEachChild(node, find);
}
find(ast);
assert(nativeHome);
const elements = [];
function collect(node) {
  if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) elements.push(node);
  ts.forEachChild(node, collect);
}
collect(nativeHome);
const attribute = (node, name) => node.attributes.properties.find((property) => ts.isJsxAttribute(property) && property.name.getText(ast) === name)?.initializer;
const literal = (node, name) => attribute(node, name)?.text;
const expression = (node, name) => {
  const initializer = attribute(node, name);
  assert(initializer && ts.isJsxExpression(initializer) && initializer.expression, `Missing expression ${name}`);
  return initializer.expression.getText(ast);
};
const element = (id, tag) => {
  const matches = elements.filter(node => literal(node, 'testID') === id && node.tagName.getText(ast) === tag);
  assert.equal(matches.length, 1, `Expected unique ${tag}: ${id}`);
  return matches[0];
};
const phoneInput = element('profile-phone-input', 'TextInput');
const calendarButton = element('profile-wedding-date-calendar', 'TouchableOpacity');
const datePicker = element('profile-wedding-date-picker', 'DateTimePicker');
const calendarModal = element('profile-wedding-date-modal', 'Modal');
const calendarClose = element('profile-wedding-date-calendar-close', 'TouchableOpacity');
const venueInput = element('profile-wedding-venue-input', 'TextInput');
const undecidedButton = element('profile-wedding-date-undecided', 'TouchableOpacity');
const phoneDoneButton = element('profile-phone-keyboard-done', 'TouchableOpacity');
const evaluate = (source, globals = {}) => {
  const context = vm.createContext(globals);
  vm.runInContext(ts.transpileModule(`globalThis.result = (${source});`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText, context);
  return context.result;
};
const dateHelpers = ['normalizeWeddingDate', 'normalizeWeddingDateInput'];
const { normalizeWeddingDateInput } = loadAppDeclarations(dateHelpers);
const flush = () => new Promise(resolve => setImmediate(resolve));
const jsxText = node => {
  const parts = [];
  function visit(child) {
    if (ts.isJsxText(child)) parts.push(child.text.trim());
    ts.forEachChild(child, visit);
  }
  visit(node);
  return parts.filter(Boolean).join(' ');
};
function appVariable(name) {
  let result;
  function visit(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(ast) === name) {
      assert.equal(result, undefined);
      result = node;
    }
    ts.forEachChild(node, visit);
  }
  visit(ast);
  assert(result, `Missing app variable ${name}`);
  return result;
}
function styleFor(node) {
  const name = /^styles\.([a-zA-Z0-9_]+)$/.exec(expression(node, 'style'))?.[1];
  assert(name, 'Expected a named style');
  const stylesObject = appVariable('styles').initializer.arguments[0];
  const property = stylesObject.properties.find(item => item.name?.getText(ast) === name);
  assert(property && ts.isPropertyAssignment(property));
  return evaluate(property.initializer.getText(ast), loadAppDeclarations(['BRAND_COLOR']));
}


test('calendar-only contact form has no editable date input or obsolete date input ref', () => {
  assert.equal(elements.some(node => literal(node, 'testID') === 'profile-wedding-date-input'), false);
  assert.equal(appSource.includes('profileWeddingDateInputRef'), false);
  assert.equal(expression(phoneInput, 'ref'), 'profilePhoneInputRef');
  assert.equal(literal(phoneInput, 'keyboardType'), 'phone-pad');
  assert.equal(expression(phoneInput, 'value'), 'profilePhone');
});

test('large whole-row wedding date button has placeholder, selected value and 44pt targets', () => {
  assert.ok(elements.some(node => node.tagName.getText(ast) === 'Text' &&
    jsxText(node.parent) === 'Wedding date'), 'wedding date must have a visible field label');
  assert.equal(literal(calendarButton, 'accessibilityRole'), 'button');
  assert.equal(literal(calendarButton, 'accessibilityLabel'), 'Choose optional wedding date');
  assert.equal(expression(calendarButton, 'disabled'), 'profileSaveLoading');
  for (const [date, expected] of [['', 'Not selected'], ['2027-10-18', '2027-10-18']]) {
    assert.equal(evaluate(expression(calendarButton, 'accessibilityValue'), { profileWeddingDate: date }).text, expected);
  }
  assert.ok(calendarButton.parent.getText(ast).includes("'Choose wedding date'"));
  const style = styleFor(calendarButton);
  assert.ok(style.minHeight >= 44, 'entire calendar row must be comfortably tappable');
  assert.ok(style.flexDirection === 'row');
  const closeStyle = styleFor(calendarClose);
  assert.ok(closeStyle.minWidth >= 44 && closeStyle.minHeight >= 44);
});

test('phone focus closes calendar without changing phone or date', () => {
  const events = [];
  evaluate(expression(phoneInput, 'onFocus'), {
    setShowWeddingPicker: value => events.push(value),
    setProfilePhone: () => assert.fail('focus must not mutate phone'),
    setProfileWeddingDate: () => assert.fail('focus must not mutate date'),
  })();
  assert.deepEqual(events, [false]);
});

test('phone keypad has a matching iOS accessory with a visible accessible Done target only on the loaded contact form', () => {
  const accessories = elements.filter(node => node.tagName.getText(ast) === 'InputAccessoryView' &&
    literal(node, 'nativeID') === 'profile-phone-keyboard-toolbar');
  assert.equal(accessories.length, 1);
  const accessory = accessories[0];
  for (const os of ['ios', 'android', 'web']) {
    assert.equal(evaluate(expression(phoneInput, 'inputAccessoryViewID'), { Platform: { OS: os } }),
      os === 'ios' ? literal(accessory, 'nativeID') : undefined);
  }
  let branch = accessory.parent;
  while (branch && !ts.isConditionalExpression(branch)) branch = branch.parent;
  assert(branch);
  for (const [os, complete, profile, expected] of [
    ['ios', true, {}, true], ['ios', false, {}, false], ['ios', true, null, false],
    ['android', true, {}, false], ['web', true, {}, false],
  ]) {
    assert.equal(Boolean(evaluate(branch.condition.getText(ast), {
      Platform: { OS: os }, shouldCompleteProfile: complete, qrContactProfile: profile,
    })), expected);
  }
  assert.equal(branch.whenFalse.getText(ast), 'null');
  assert(accessory.parent.getText(ast).includes('profile-phone-keyboard-done'));
  assert.equal(literal(phoneDoneButton, 'accessibilityRole'), 'button');
  assert.equal(literal(phoneDoneButton, 'accessibilityLabel'), 'Done entering phone number');
  assert.equal(jsxText(phoneDoneButton.parent), 'Done');
  const style = styleFor(phoneDoneButton);
  assert.ok(style.minWidth >= 44 && style.minHeight >= 44);
});

test('Done and Android submit dismiss the phone keyboard without saving, navigation, or contact changes', () => {
  assert.equal(literal(phoneInput, 'returnKeyType'), 'done');
  for (const handler of [expression(phoneDoneButton, 'onPress'), expression(phoneInput, 'onSubmitEditing')]) {
    assert.equal(handler, 'dismissProfilePhoneKeyboard');
    const events = [];
    const deny = () => assert.fail('Keyboard Done must only blur and dismiss, never mutate contacts or save');
    const runtime = loadAppDeclarations(['dismissProfilePhoneKeyboard'], {
      profilePhoneInputRef: { current: { blur: () => events.push('blur') } },
      Keyboard: { dismiss: () => events.push('dismiss') },
      setProfileFirstName: deny, setProfileEmail: deny, setProfilePhone: deny,
      setProfileWeddingDate: deny, setProfileWeddingVenue: deny,
      setShowWeddingPicker: deny, onCompleteProfile: deny, saveProfile: deny,
    });
    evaluate(handler, runtime)(); evaluate(handler, runtime)();
    assert.deepEqual(events, ['blur', 'dismiss', 'blur', 'dismiss']);
  }
  const events = [];
  const absent = loadAppDeclarations(['dismissProfilePhoneKeyboard'], {
    profilePhoneInputRef: { current: null }, Keyboard: { dismiss: () => events.push('dismiss') },
  });
  assert.doesNotThrow(absent.dismissProfilePhoneKeyboard);
  assert.deepEqual(events, ['dismiss']);
});

test('calendar button blurs phone and dismisses keyboard before opening', () => {
  assert.equal(expression(calendarButton, 'onPress'), 'toggleWeddingDateCalendar');
  const events = []; let shown = false;
  const f = loadAppDeclarations(['toggleWeddingDateCalendar'], {
    profilePhoneInputRef: { current: { blur: () => events.push('phone blur') } },
    profileWeddingVenueInputRef: { current: { blur: () => events.push('venue blur') } },
    Keyboard: { dismiss: () => events.push('dismiss') },
    setShowWeddingPicker: update => { shown = update(shown); events.push(shown); },
  });
  f.toggleWeddingDateCalendar();
  assert.deepEqual(events, ['phone blur', 'venue blur', 'dismiss', true]);
  const absent = loadAppDeclarations(['toggleWeddingDateCalendar'], {
    profileWeddingVenueInputRef: { current: null },
    profilePhoneInputRef: { current: null }, Keyboard: { dismiss() {} }, setShowWeddingPicker() {},
  });
  assert.doesNotThrow(absent.toggleWeddingDateCalendar);
});

test('iOS modal has wedding date heading and X; Android retains native picker', () => {
  assert.equal(literal(calendarClose, 'accessibilityLabel'), 'Close wedding date calendar');
  assert.equal(literal(calendarClose, 'accessibilityRole'), 'button');
  assert(calendarClose.parent.children.some(node => ts.isJsxSelfClosingElement(node) && node.tagName.getText(ast) === 'X'));
  const titles = elements.filter(node => node.tagName.getText(ast) === 'Text' && literal(node, 'accessibilityRole') === 'header' && jsxText(node.parent) === 'Wedding date');
  assert.equal(titles.length, 1);
  assert.equal(evaluate(expression(calendarModal, 'visible'), { showWeddingPicker: false }), false);
  assert.equal(evaluate(expression(calendarModal, 'visible'), { showWeddingPicker: true }), true);
  let branch = calendarModal.parent;
  while (branch && !ts.isConditionalExpression(branch)) branch = branch.parent;
  assert(branch);
  assert.equal(evaluate(branch.condition.getText(ast), { Platform: { OS: 'ios' } }), true);
  assert.equal(evaluate(branch.condition.getText(ast), { Platform: { OS: 'android' } }), false);
  assert.equal(branch.whenFalse.getText(ast), 'weddingDatePickerElement');
  assert.equal(evaluate(expression(datePicker, 'display'), { Platform: { OS: 'ios' } }), 'inline');
  assert.equal(evaluate(expression(datePicker, 'display'), { Platform: { OS: 'android' } }), 'default');
});

test('X, system close and accessibility escape are idempotent and never save/change contacts', () => {
  const escape = elements.find(node => attribute(node, 'onAccessibilityEscape') && expression(node, 'onAccessibilityEscape') === 'closeWeddingDateCalendar');
  assert(escape);
  assert(escape.attributes.properties.some(property => ts.isJsxAttribute(property) && property.name.getText(ast) === 'accessibilityViewIsModal'));
  for (const handler of [expression(calendarClose, 'onPress'), expression(calendarModal, 'onRequestClose'), expression(escape, 'onAccessibilityEscape')]) {
    assert.equal(handler, 'closeWeddingDateCalendar');
    const events = [];
    const runtime = loadAppDeclarations(['closeWeddingDateCalendar'], {
      setShowWeddingPicker: value => events.push(value),
      setProfileWeddingDate: () => assert.fail('close must preserve date'),
      setProfilePhone: () => assert.fail('close must preserve phone'),
      onCompleteProfile: () => assert.fail('close must never save'),
    });
    evaluate(handler, runtime)(); evaluate(handler, runtime)();
    assert.deepEqual(events, [false, false]);
  }
});

test('calendar selection changes only unsaved date and cancellation preserves contacts', () => {
  for (const os of ['ios', 'android']) {
    const dates = [], visible = [];
    const onChange = evaluate(expression(datePicker, 'onChange'), {
      Platform: { OS: os }, formatWeddingDate: () => '2027-10-18',
      setProfileWeddingDate: value => dates.push(value), closeWeddingDateCalendar: () => visible.push(false),
      setProfilePhone: () => assert.fail('picker must preserve phone'),
      onCompleteProfile: () => assert.fail('picker must not save'),
    });
    onChange({ type: 'dismissed' }, new Date(2027, 9, 18));
    assert.deepEqual(dates, []);
    onChange({ type: 'set' }, undefined);
    assert.deepEqual(dates, []);
    onChange({ type: 'set' }, new Date(2027, 9, 18));
    assert.deepEqual(dates, ['2027-10-18']);
    assert.equal(visible.at(-1), false);
  }
});

test('Clear date clears draft date and dependent venue without saving', () => {
  const clear = elements.filter(node => literal(node, 'accessibilityLabel') === 'Clear wedding date');
  assert.equal(clear.length, 1);
  const events = [];
  evaluate(expression(clear[0], 'onPress'), {
    setProfileWeddingDate: value => events.push(['date', value]),
    setProfileWeddingVenue: value => events.push(['venue', value]),
    closeWeddingDateCalendar: () => events.push(['close']),
    setProfilePhone: () => assert.fail('clear date must preserve phone'),
    onCompleteProfile: () => assert.fail('clear date must never save'),
  })();
  assert.deepEqual(events, [['date', ''], ['venue', ''], ['close']]);
});

function saveFixture({ date = '', venue = '', busy = false, held = false, loaded = true } = {}) {
  const requests = [], alerts = [], events = [];
  let release;
  const gate = held ? new Promise(resolve => { release = resolve; }) : Promise.resolve();
  const pressRef = { current: false };
  const f = loadAppDeclarations([...dateHelpers, 'isApplePrivateRelayEmail', 'isValidEmail',
    'isValidContactPhone', 'RESERVED_QR_CONTACT_NAMES', 'isReservedQrContactName', 'saveProfile'], {
    qrContactProfile: loaded ? { version: 1 } : null,
    profileSaveLoading: busy, profileSavePressInFlightRef: pressRef,
    profileFirstName: 'Date Test', profileEmail: 'date-test@example.invalid', profilePhone: '5551234567',
    profileWeddingDate: date, profileWeddingVenue: venue, memberIsCouple: true, qrContactCompletionRequested: true,
    Keyboard: { dismiss: () => events.push('dismiss') },
    Alert: { alert: (...args) => alerts.push(args) },
    onCompleteProfile: async profile => { requests.push(profile); await gate; return true; },
  });
  return { ...f, requests, alerts, events, pressRef, release: () => release?.() };
}

test('optional blank and selected canonical date save through Bingo callback with unchanged phone', async () => {
  for (const date of ['', '2027-10-18']) {
    const f = saveFixture({ date });
    f.saveProfile(); await flush();
    assert.equal(f.requests.length, 1);
    assert.equal(f.requests[0].weddingDate, date);
    assert.equal(f.requests[0].phone, '5551234567');
    assert.deepEqual(f.alerts, []);
    assert.equal(f.pressRef.current, false);
  }
});

test('invalid date from stale data is rejected despite removal of manual date entry', () => {
  for (const date of ['2027-02-29', '2027-10', 'nonsense']) {
    const f = saveFixture({ date }); f.saveProfile();
    assert.deepEqual(f.requests, []);
    assert.equal(f.alerts[0][0], 'Check your wedding date');
    assert.equal(f.alerts[0][1], 'Choose your wedding date from the calendar.');
  }
});

test('loading/missing contact profile and repeated save taps cannot duplicate Bingo requests', async () => {
  for (const options of [{ busy: true }, { loaded: false }]) {
    const f = saveFixture(options); f.saveProfile(); assert.deepEqual(f.requests, []);
  }
  const f = saveFixture({ date: '2027-10-18', held: true });
  f.saveProfile(); f.saveProfile(); assert.equal(f.requests.length, 1);
  assert.equal(f.pressRef.current, true); f.release(); await flush();
  assert.equal(f.pressRef.current, false);
});

test('venue is optional, bounded and visible only after a wedding date is selected', () => {
  assert.ok(elements.some(node => node.tagName.getText(ast) === 'Text' && jsxText(node.parent) === 'Wedding venue'));
  assert.equal(elements.some(node => node.tagName.getText(ast) === 'Text' && /Wedding (?:date|venue) \(optional\)/.test(jsxText(node.parent))), false);
  assert.equal(expression(venueInput, 'value'), 'profileWeddingVenue');
  assert.equal(evaluate(expression(venueInput, 'maxLength')), 200);
  assert.equal(evaluate(expression(venueInput, 'editable'), { profileSaveLoading: true }), false);
  let branch = venueInput.parent;
  while (branch && !ts.isConditionalExpression(branch)) branch = branch.parent;
  assert(branch, 'venue must remain inside an explicit visibility condition');
  assert.equal(Boolean(evaluate(branch.condition.getText(ast), { profileWeddingDate: '' })), false);
  assert.equal(Boolean(evaluate(branch.condition.getText(ast), { profileWeddingDate: '2030-10-18' })), true);
  assert.equal(branch.whenFalse.getText(ast), 'null');
  const changes = [];
  evaluate(expression(venueInput, 'onChangeText'), { setProfileWeddingVenue: value => changes.push(value) })('The Test Venue');
  assert.deepEqual(changes, ['The Test Venue']);
});

test('Not sure yet is a smaller accessible action that clears date and venue without saving', () => {
  assert.equal(literal(undecidedButton, 'accessibilityLabel'), 'Wedding date to be determined');
  assert.equal(jsxText(undecidedButton.parent), 'Not sure yet');
  assert.equal(evaluate(expression(undecidedButton, 'disabled'), { profileSaveLoading: true }), true);
  const small = styleFor(undecidedButton), large = styleFor(calendarButton);
  assert.ok(small.width < 100 && small.minHeight >= 44 && large.flex === 1);
  const events = [];
  const action = evaluate(expression(undecidedButton, 'onPress'), {
    setProfileWeddingDate: value => events.push(['date', value]),
    setProfileWeddingVenue: value => events.push(['venue', value]),
    Keyboard: { dismiss: () => events.push(['keyboard']) },
    closeWeddingDateCalendar: () => events.push(['close']),
    onCompleteProfile: () => assert.fail('undecided must not save'),
    setProfilePhone: () => assert.fail('undecided must preserve phone'),
  });
  action(); action();
  assert.deepEqual(events, [
    ['keyboard'], ['date', ''], ['venue', ''], ['close'],
    ['keyboard'], ['date', ''], ['venue', ''], ['close'],
  ]);
});

test('venue save accepts blank or bounded names but drops stale venue when date is blank', async () => {
  for (const [date, venue, expected] of [
    ['2030-10-18', '', ''], ['2030-10-18', '  Test Venue  ', 'Test Venue'],
    ['2030-10-18', 'V'.repeat(200), 'V'.repeat(200)], ['', 'Old hidden venue', ''],
  ]) {
    const f = saveFixture({ date, venue }); f.saveProfile(); await flush();
    assert.equal(f.requests.length, 1);
    assert.equal(f.requests[0].weddingDate, date);
    assert.equal(f.requests[0].weddingVenue, expected);
    assert.equal(f.requests[0].phone, '5551234567');
  }
});

test('invalid venue never reaches save and does not truncate to a different value', () => {
  for (const venue of ['V'.repeat(201), 'Venue\nInjected', 'Venue\u0000Injected', '<Venue>']) {
    const f = saveFixture({ date: '2030-10-18', venue }); f.saveProfile();
    assert.deepEqual(f.requests, []);
    assert.equal(f.alerts[0][0], 'Check your wedding venue');
    assert.equal(f.pressRef.current, false);
  }
});

test('Android clear date also discards dependent venue without saving', () => {
  const events = [];
  evaluate(expression(datePicker, 'onChange'), {
    Platform: { OS: 'android' }, formatWeddingDate: () => assert.fail('clear must not select'),
    setProfileWeddingDate: value => events.push(['date', value]),
    setProfileWeddingVenue: value => events.push(['venue', value]),
    closeWeddingDateCalendar: () => events.push(['close']),
    onCompleteProfile: () => assert.fail('clear must not save'),
  })({ type: 'neutralButtonPressed' }, undefined);
  assert.deepEqual(events, [['date', ''], ['venue', ''], ['close']]);
});
