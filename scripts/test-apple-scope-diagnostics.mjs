import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import {
  EXPO_APPLE_VERSION, PRISTINE_SWIFT_SHA256, SCOPE_DIAGNOSTIC_EDITS,
  patchAppleScopeDiagnostics, patchInstalledAppleScopeDiagnostics, swiftHash,
} from './patch-apple-scope-diagnostics.mjs';
import { loadAppDeclarations } from './native-app-source-fixture.mjs';

const installed = readFileSync(new URL('../node_modules/expo-apple-authentication/ios/AppleAuthenticationRequest.swift', import.meta.url), 'utf8');
let pristine = installed;
for (const [before, after] of [...SCOPE_DIAGNOSTIC_EDITS].reverse()) pristine = pristine.replace(after, before);
// The fixture is the exact hash-verified clean Expo file, whether postinstall has
// run or not. It is not a synthetic approximation of Swift's original payload.
assert.equal(swiftHash(pristine), PRISTINE_SWIFT_SHA256);

test('scope diagnostic patch applies to the exact clean Expo 8.0.8 source and is idempotent', () => {
  const patched = patchAppleScopeDiagnostics(pristine, EXPO_APPLE_VERSION);
  assert.notEqual(patched, pristine);
  assert.equal(patchAppleScopeDiagnostics(patched, EXPO_APPLE_VERSION), patched);
  assert.equal(patched.match(/"weddingWinScopeDiagnostics"/g)?.length, 1);
});

test('scope diagnostic patch changes no existing request, credential, callback or lifecycle data', () => {
  const patched = patchAppleScopeDiagnostics(pristine, EXPO_APPLE_VERSION);
  let restored = patched;
  for (const [before, after] of [...SCOPE_DIAGNOSTIC_EDITS].reverse()) restored = restored.replace(after, before);
  assert.equal(restored, pristine);
  for (const line of pristine.split('\n').filter(line => /request\.(requestedScopes|requestedOperation|user|state|nonce) =|"(fullName|email|user|realUserStatus|state|authorizationCode|identityToken)":|callback\?\(|pendingRequests\./.test(line))) {
    assert.equal(patched.split(line).length, pristine.split(line).length, `Preserve original occurrences: ${line.trim()}`);
  }
  assert(patched.indexOf('weddingWinRequestedScopes = request.requestedScopes') > patched.indexOf('request.requestedScopes = try scopesFromInts'));
  assert(patched.indexOf('weddingWinRequestedScopes = request.requestedScopes') < patched.indexOf('authController = ASAuthorizationController'));
  assert(patched.includes('credential?.authorizedScopes.contains(.email)'));
  assert(patched.includes('credential?.authorizedScopes.contains(.fullName)'));
  assert(patched.includes('if let value { return value }\n      return NSNull()'));
  const added = SCOPE_DIAGNOSTIC_EDITS.map(([before, after]) => after.replace(before, '')).join('\n');
  assert(!/print\(|log\.|identityToken|authorizationCode|credential\?\.user|credential\?\.fullName/.test(added));
});

test('scope diagnostic patch rejects unsupported versions, edited source, duplicate and partial patches', () => {
  assert.throws(() => patchAppleScopeDiagnostics(pristine, '8.0.9'), /expected 8\.0\.8/);
  assert.throws(() => patchAppleScopeDiagnostics(pristine + '\n', EXPO_APPLE_VERSION), /unexpected Swift source/);
  const [before, after] = SCOPE_DIAGNOSTIC_EDITS[0];
  assert.throws(() => patchAppleScopeDiagnostics(pristine.replace(before, after), EXPO_APPLE_VERSION), /incomplete/);
  const patched = patchAppleScopeDiagnostics(pristine, EXPO_APPLE_VERSION);
  assert.throws(() => patchAppleScopeDiagnostics(patched + after, EXPO_APPLE_VERSION), /unexpected Swift source/);
});

test('installed patch runner is idempotent and does not modify package metadata', () => {
  const fixtureRoot = mkdtempSync(path.join(os.tmpdir(), 'weddingwin-apple-scope-'));
  try {
    const packageRoot = path.join(fixtureRoot, 'node_modules/expo-apple-authentication');
    mkdirSync(path.join(packageRoot, 'ios'), { recursive: true });
    const metadata = JSON.stringify({ name: 'expo-apple-authentication', version: EXPO_APPLE_VERSION, untouched: true });
    const swiftPath = path.join(packageRoot, 'ios/AppleAuthenticationRequest.swift');
    writeFileSync(path.join(packageRoot, 'package.json'), metadata);
    writeFileSync(swiftPath, pristine);
    assert.equal(patchInstalledAppleScopeDiagnostics(fixtureRoot), 'applied');
    assert.equal(patchInstalledAppleScopeDiagnostics(fixtureRoot), 'already applied');
    assert.equal(readFileSync(swiftPath, 'utf8'), patchAppleScopeDiagnostics(pristine, EXPO_APPLE_VERSION));
    assert.equal(readFileSync(path.join(packageRoot, 'package.json'), 'utf8'), metadata);
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

const frontend = loadAppDeclarations(['appleNativeScopeDiagnostics']).appleNativeScopeDiagnostics;
const backendSource = readFileSync(new URL('../supabase/functions/_shared/apple_scope_diagnostics.ts', import.meta.url), 'utf8');
const backendContext = vm.createContext({ exports: {} });
vm.runInContext(ts.transpileModule(backendSource, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText, backendContext);
const backend = backendContext.exports.normalizeAppleScopeDiagnostics;
const unknown = {
  diagnosticVersion: null, requestedEmail: null, requestedName: null,
  authorizedEmail: null, authorizedName: null, credentialEmailPresent: null,
};
const jsonValue = value => JSON.parse(JSON.stringify(value));

test('client and server scope telemetry agree on strict allowlisting and unknown states', () => {
  for (const input of [undefined, null, true, [], 'secret@example.invalid', {}, { diagnosticVersion: 2, requestedEmail: true }]) {
    assert.deepEqual(jsonValue(frontend(input)), unknown);
    assert.deepEqual(jsonValue(backend(input)), unknown);
  }
  for (const input of [
    { diagnosticVersion: 1, requestedEmail: true, requestedName: false, authorizedEmail: null },
    { diagnosticVersion: 1, requestedEmail: 'secret@example.invalid', requestedName: { id_token: 'secret' }, authorizedEmail: 1, authorizedName: true, credentialEmailPresent: false, email: 'secret@example.invalid' },
  ]) {
    const result = jsonValue(frontend(input));
    assert.deepEqual(result, jsonValue(backend(input)));
    assert.deepEqual(Object.keys(result), Object.keys(unknown));
    assert(Object.values(result).every(value => value === null || value === true || value === false || value === 1));
    assert(!JSON.stringify(result).includes('secret'));
  }
});

test('native handler uses scope diagnostics only in its bounded telemetry event', () => {
  const handler = readFileSync(new URL('../supabase/functions/apple-native-login/index.ts', import.meta.url), 'utf8');
  assert.equal(handler.match(/normalizeAppleScopeDiagnostics\(/g)?.length, 1);
  assert.match(handler, /console\.log\("apple-native-login:scope-diagnostics", \{\s*diagnosticId,\s*clientReported: normalizeAppleScopeDiagnostics\(\s*clientContext\.appleScopeDiagnostics\s*,?\s*\),\s*\}\);/);
  assert.equal(handler.match(/clientContext\.appleScopeDiagnostics/g)?.length, 1);
});
