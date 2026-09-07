import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// A deliberately narrow bridge patch. Review the upstream Swift source before
// changing either guard when upgrading Expo; never silently patch a new version.
export const EXPO_APPLE_VERSION = '8.0.8';
export const PRISTINE_SWIFT_SHA256 = '97e44eb0ee52be91312dcd424e0acc23c79bd7f2c45e18957b5f39b527dd92bc';
export const SCOPE_DIAGNOSTIC_EDITS = [
  [
    '  var authController: ASAuthorizationController?\n',
    '  var authController: ASAuthorizationController?\n\n' +
      '  // WeddingWin scope diagnostic v1: presence only, never identity proof.\n' +
      '  private var weddingWinRequestedScopes: [ASAuthorization.Scope]?\n',
  ],
  [
    '      authController = ASAuthorizationController(authorizationRequests: [request])',
    '      weddingWinRequestedScopes = request.requestedScopes\n' +
      '      authController = ASAuthorizationController(authorizationRequests: [request])',
  ],
  [
    '    let response: AuthenticationResponse = [\n',
    '    // Keep unknown separate from false (including a missing credential).\n' +
      '    func diagnosticFlag(_ value: Bool?) -> Any {\n' +
      '      if let value { return value }\n' +
      '      return NSNull()\n' +
      '    }\n' +
      '    let response: AuthenticationResponse = [\n' +
      '      "weddingWinScopeDiagnostics": [\n' +
      '        "diagnosticVersion": 1,\n' +
      '        "requestedEmail": diagnosticFlag(weddingWinRequestedScopes?.contains(.email)),\n' +
      '        "requestedName": diagnosticFlag(weddingWinRequestedScopes?.contains(.fullName)),\n' +
      '        "authorizedEmail": diagnosticFlag(credential?.authorizedScopes.contains(.email)),\n' +
      '        "authorizedName": diagnosticFlag(credential?.authorizedScopes.contains(.fullName)),\n' +
      '        "credentialEmailPresent": diagnosticFlag(credential.map { $0.email != nil })\n' +
      '      ],\n',
  ],
];

export function swiftHash(source) {
  return createHash('sha256').update(source).digest('hex');
}

// Only the exact upstream source or the exact output of our patch is accepted.
// Reconstructing and checking the upstream hash also rejects partial/tampered
// patches without maintaining a second independent copy of Expo's source.
export function patchAppleScopeDiagnostics(source, version) {
  if (version !== EXPO_APPLE_VERSION) {
    throw new Error(`Review Apple scope diagnostic patch for expo-apple-authentication ${version}; expected ${EXPO_APPLE_VERSION}.`);
  }
  let pristine = source;
  for (const [before, after] of [...SCOPE_DIAGNOSTIC_EDITS].reverse()) {
    pristine = pristine.replace(after, before);
  }
  if (swiftHash(pristine) !== PRISTINE_SWIFT_SHA256) {
    throw new Error('Apple scope diagnostic patch: unexpected Swift source; review upstream changes before continuing.');
  }
  let patched = pristine;
  for (const [before, after] of SCOPE_DIAGNOSTIC_EDITS) {
    if (patched.split(before).length !== 2) throw new Error('Apple scope diagnostic patch anchor is not unique.');
    patched = patched.replace(before, after);
  }
  if (source !== pristine && source !== patched) {
    throw new Error('Apple scope diagnostic patch is incomplete; restore the installed package before continuing.');
  }
  return patched;
}

export function patchInstalledAppleScopeDiagnostics(projectRoot) {
  const packageRoot = path.join(projectRoot, 'node_modules/expo-apple-authentication');
  const { version } = JSON.parse(readFileSync(path.join(packageRoot, 'package.json'), 'utf8'));
  const swiftPath = path.join(packageRoot, 'ios/AppleAuthenticationRequest.swift');
  const source = readFileSync(swiftPath, 'utf8');
  const patched = patchAppleScopeDiagnostics(source, version);
  if (source !== patched) writeFileSync(swiftPath, patched);
  return source === patched ? 'already applied' : 'applied';
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const projectRoot = fileURLToPath(new URL('..', import.meta.url));
  console.log(`Apple scope diagnostic bridge: ${patchInstalledAppleScopeDiagnostics(projectRoot)} (${EXPO_APPLE_VERSION}).`);
}
