# Native Apple scope diagnostics

## Current sign-in path

The iPhone app's main **Sign up with Apple** and **Sign in with Apple** buttons
now open the system authentication browser directly. There is no separate
browser fallback link or automatic native-first attempt. The browser flow keeps
PKCE in memory, validates the exact Apple callback, and exchanges its one-time
code for an app session. Signup still requires explicit current terms/privacy
consent and preserves the selected vendor or couple role; ordinary login does
not submit new signup consent.

This is a change of authentication transport, **not a claim that the direct
native missing-email behavior is fixed**. The direct-native handler and its
scope/security tests remain as an internal diagnostic target with no UI binding.
The native diagnostic described below is only emitted if that direct-native
path is deliberately exercised in a controlled test build. The browser path
continues to require server-verified Apple identity and email; it does not reuse
deleted account details or accept client contact fields as proof.

## Scope probe

This temporary diagnostic distinguishes the scopes the native request actually
sent from the contact fields Apple authorized or returned. It does not repair
signup, revoke a grant, or change any authentication/account-deletion behavior.

`scripts/patch-apple-scope-diagnostics.mjs` is the app's `postinstall` hook. It
patches only `expo-apple-authentication` **8.0.8**, and accepts only the hash-verified
original `AppleAuthenticationRequest.swift` or this exact patch's output. Unknown
versions, source changes and partial patches fail explicitly for review. No new
patching dependency is installed. Keep any future postinstall tasks alongside
this hook rather than replacing them.

After an install with lifecycle scripts disabled, run:

```sh
node scripts/patch-apple-scope-diagnostics.mjs
npm run test:apple-native
```

A **new native build is required**. Metro reloads/OTA updates cannot update Swift,
and Expo Go is not patched. Old/unpatched builds report `null` (unknown), never a
false assertion that a scope was not requested.

The bridge adds one optional `weddingWinScopeDiagnostics` object to the unchanged
credential result. The app strictly normalizes it into
`client_context.appleScopeDiagnostics`, and the Edge Function independently
normalizes it again before logging `apple-native-login:scope-diagnostics` with the
existing request diagnostic ID. The six allowed fields are:

- `diagnosticVersion`: `1`, or `null` for unsupported/missing diagnostics.
- `requestedEmail`, `requestedName`: actual native request scope membership.
- `authorizedEmail`, `authorizedName`: returned credential scope membership.
- `credentialEmailPresent`: whether the credential has an email field.

The last five fields are only boolean or `null`; no email address, name, Apple
subject, token, authorization code, scope array, or arbitrary client text is added
to this diagnostic. All flags are **untrusted client telemetry, not authentication
proof**. They must never establish verified email, consent, account ownership,
membership, grant identity or permission to delete/link an account.

Tests check clean-source patching, exact idempotence, source/version guards,
preservation of the original credential/request fields, client/server allowlist
agreement, and unchanged normal login/signup behavior. They are offline tests;
passing them is not a claim of physical-device or Apple-service success.

Apple documents the native field at
[ASAuthorizationAppleIDCredential.authorizedScopes](https://developer.apple.com/documentation/authenticationservices/asauthorizationappleidcredential/authorizedscopes).

To remove the diagnostic later: remove the postinstall hook, patch/test scripts,
client telemetry field/helper and server telemetry event/helper, then reinstall
the dependency from the lockfile and rebuild the native app. Never treat an old
binary or patched dependency left on disk as proof that diagnostics were removed.
