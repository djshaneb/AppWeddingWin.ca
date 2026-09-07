import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import { appSource, loadAppDeclarations } from './native-app-source-fixture.mjs';

// Production TSX/declarations, with no React rendering, device, account or network.
const ast = ts.createSourceFile('index.tsx', appSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let nativeApp;
function find(node) {
  if (ts.isFunctionDeclaration(node) && node.name?.text === 'NativeHome') nativeApp = node;
  ts.forEachChild(node, find);
}
find(ast);
assert(nativeApp, 'NativeHome must exist');
const elements = [];
function collect(node) {
  if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) elements.push(node);
  ts.forEachChild(node, collect);
}
collect(nativeApp);
const attribute = (node, name) => node.attributes.properties.find((property) => ts.isJsxAttribute(property) && property.name.getText(ast) === name)?.initializer;
const literal = (node, name) => attribute(node, name)?.text;
const expression = (node, name) => {
  const value = attribute(node, name);
  assert(value && ts.isJsxExpression(value) && value.expression, `Missing expression ${name}`);
  return value.expression.getText(ast);
};
const evaluate = (source, globals = {}) => {
  const code = ts.transpileModule(`globalThis.result = (${source});`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  const context = vm.createContext(globals);
  vm.runInContext(code, context);
  return context.result;
};
const input = (name) => {
  const matches = elements.filter((node) => node.tagName.getText(ast) === 'TextInput' && literal(node, 'accessibilityLabel') === name);
  assert.equal(matches.length, 1, `Expected exactly one auth ${name} field`);
  return matches[0];
};
const outerScroll = elements.find((node) => node.tagName.getText(ast) === 'ScrollView');
assert(outerScroll);

test('iOS keyboard adjustment is limited to auth step two and editable contact details', () => {
  for (const [os, member, step, profile, expected] of [
    ['ios', null, 2, false, true],
    ['ios', null, 1, false, false],
    ['ios', { account_role: 'couple' }, 2, false, false],
    ['ios', { account_role: 'vendor' }, 2, false, false],
    ['ios', { account_role: 'couple' }, 2, true, true],
    ['android', null, 2, false, false],
    ['android', {}, 2, true, false],
    ['web', null, 2, false, false],
  ]) {
    const result = loadAppDeclarations(['adjustEntryKeyboardInsets'], {
      Platform: { OS: os }, member, wizardStep: step, shouldCompleteProfile: profile,
    });
    assert.equal(result.adjustEntryKeyboardInsets, expected);
  }
});

test('outer native form uses one inset mechanism and preserves first-tap submit behavior', () => {
  assert.equal(expression(outerScroll, 'automaticallyAdjustKeyboardInsets'), 'adjustEntryKeyboardInsets');
  assert.equal(literal(outerScroll, 'keyboardShouldPersistTaps'), 'handled');
  assert.equal(evaluate(expression(outerScroll, 'keyboardDismissMode'), { adjustEntryKeyboardInsets: true }), 'interactive');
  assert.equal(evaluate(expression(outerScroll, 'keyboardDismissMode'), { adjustEntryKeyboardInsets: false }), 'none');
  assert(!elements.some((node) => node.tagName.getText(ast) === 'KeyboardAvoidingView'), 'a second avoidance layer would double the native inset');
  assert.equal(attribute(outerScroll, 'contentInset'), undefined, 'do not add manual keyboard insets');
  const adjusted = elements.filter((node) => attribute(node, 'automaticallyAdjustKeyboardInsets'));
  assert.equal(adjusted.length, 1, 'do not alter nested vendor/modal scroll views');
});

test('switching back to menu remounts the inset-owning scroll view', () => {
  const key = expression(outerScroll, 'key');
  assert.notEqual(evaluate(key, { adjustEntryKeyboardInsets: true }), evaluate(key, { adjustEntryKeyboardInsets: false }), 'form keyboard insets must not survive into the menu');
});

test('Email Next focuses the actual password input without blurring or submitting', () => {
  const email = input('Email');
  const password = input('Password');
  assert.equal(literal(email, 'returnKeyType'), 'next');
  assert.equal(literal(email, 'submitBehavior'), 'submit');
  assert.equal(expression(password, 'ref'), 'passwordInputRef');
  let focused = 0;
  const next = evaluate(expression(email, 'onSubmitEditing'), {
    passwordInputRef: { current: { focus() { focused++; } } },
  });
  next();
  assert.equal(focused, 1);
  const whileUnmounted = evaluate(expression(email, 'onSubmitEditing'), { passwordInputRef: { current: null } });
  assert.doesNotThrow(whileUnmounted);
});

test('signup and login password autofill semantics stay separate and secure', () => {
  const password = input('Password');
  assert.equal(evaluate(expression(password, 'textContentType'), { authMode: 'signup' }), 'newPassword');
  assert.equal(evaluate(expression(password, 'textContentType'), { authMode: 'login' }), 'password');
  assert.equal(literal(password, 'autoCapitalize'), 'none');
  assert.equal(evaluate(expression(password, 'autoCorrect')), false);
  assert.equal(evaluate(expression(password, 'secureTextEntry'), { showPassword: false }), true);
  assert.equal(evaluate(expression(password, 'secureTextEntry'), { showPassword: true }), false);
});

test('Password Done uses the same validated signup or login action as the button', () => {
  const signup = () => 'signup';
  const login = () => 'login';
  const handler = expression(input('Password'), 'onSubmitEditing');
  assert.equal(evaluate(handler, { authMode: 'signup', createMemberAccount: signup, openLogin: login }), signup);
  assert.equal(evaluate(handler, { authMode: 'login', createMemberAccount: signup, openLogin: login }), login);
});

function actions(overrides = {}) {
  const events = [];
  const alerts = [];
  const runtime = loadAppDeclarations(['openLogin', 'createMemberAccount'], {
    email: 'keyboard-test@example.invalid', password: 'dummy-password-123', role: 'couple',
    emailLoginLoading: false, signupLoading: false,
    isValidEmail: (value) => value.includes('@'),
    requireSignupConsent: () => true,
    buildSignupConsent: () => ({ acceptedTerms: true, acceptedPrivacy: true }),
    Alert: { alert: (...args) => alerts.push(args) },
    Keyboard: { dismiss: () => events.push('dismiss') },
    onEmailLogin: () => events.push('login'),
    onMemberSignup: () => events.push('signup'),
    ...overrides,
  });
  return { ...runtime, events, alerts };
}

test('validated signup/login dismiss keyboard before starting a request', () => {
  const login = actions(); login.openLogin();
  assert.deepEqual(login.events, ['dismiss', 'login']);
  const signup = actions(); signup.createMemberAccount();
  assert.deepEqual(signup.events, ['dismiss', 'signup']);
});

test('invalid or busy signup/login never submit or dismiss away the entered form', () => {
  for (const values of [
    { email: '' }, { password: '' }, { signupLoading: true },
    { email: 'invalid' }, { password: 'short' }, { requireSignupConsent: () => false },
  ]) {
    const fixture = actions(values); fixture.createMemberAccount();
    assert.deepEqual(fixture.events, []);
  }
  for (const values of [{ email: '' }, { password: '' }, { emailLoginLoading: true }]) {
    const fixture = actions(values); fixture.openLogin();
    assert.deepEqual(fixture.events, []);
  }
});
