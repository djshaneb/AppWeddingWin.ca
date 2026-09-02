# Dependency audit triage

Status: **PRODUCTION BUILD BASELINE RECORDED — final immutable-tag verification required**

Audited: 2026-08-28 through 2026-09-01 against the npm production dependency tree (`npm audit --omit=dev`). The earlier hardened source was used for signed/TestFlight build `1.0.0 (2)` and recorded by `v1.0.0-rc.3`; the newer QR Bingo source requires a replacement build and immutable-tag verification.

## Changes applied

- Aligned the four Expo SDK 54 patch mismatches reported by `expo install --check`:
  - `expo` `~54.0.37`
  - `expo-constants` `~18.0.14`
  - `expo-font` `~14.0.12`
  - `expo-router` `~6.0.24`
- Added the missing direct Expo asset peer/plugin, `expo-asset` `~12.0.13`, after `expo-doctor` identified it.
- Applied lockfile-only safe audit remediation.
- Pinned patched transitive versions for `brace-expansion` (`5.0.9`) and `postcss` (`8.5.26`) through npm `overrides`.
- Pinned vulnerable transitive `uuid` releases below `11.1.1` to `11.1.1`, removing the remaining moderate build-tool advisory family.
- Regenerated `package-lock.json` without changing package managers. This repository remains npm-based.
- Added a clean-checkout release gate pinned to Node `24.20.0`, npm `11.19.0`, and Deno `2.9.5`. The guarded production audit invokes the active npm CLI portably and fails when the reviewed advisory baseline expands.
- Reviewed the newly reported `decode-uri-component` malformed-percent-decoding denial-of-service advisory. The guarded baseline now recognizes only that exact advisory and fails if its severity, advisory source, affected package rollup, or either reviewed ceiling expands.

The earlier release-candidate checks reported dependencies up to date, `expo-doctor` passing 18/18 checks, typecheck and lint passing, and the then-current shared Deno regression suites passing before `v1.0.0-rc.3`. The current 2026-09-01 QR Bingo working tree passes dependency alignment, Expo Doctor **18/18**, typecheck, lint, the expanded shared Deno suite **167/167**, and the guarded production audit at the exact reviewed 8-high/8-moderate baseline. Repeat the complete set from a clean immutable-tag checkout before production submission.

## Before and after

| Production-tree audit | Before | After |
| --- | ---: | ---: |
| Critical | 2 | 0 |
| High | not release-recorded separately | 8 |
| Moderate | not release-recorded separately | 8 |
| Total | 33 | 16 |

## Remaining findings

The remaining audit entries come from two underlying packages:

- `image-size@1.2.1` through Metro: denial-of-service advisories in optional image parsers. Metro processes developer-supplied project assets while building; this package is not bundled as executable application code on the user's iPhone.
- `decode-uri-component@0.2.2` through `query-string`, React Navigation, and Expo Router: denial of service from exponential decoding of malformed percent-encoded input. npm expands this runtime dependency into 8 moderate package-level findings. The patched `decode-uri-component@0.5.0` release is ESM-only, while the SDK 54 `query-string@7.1.3` consumer loads it with CommonJS `require`; forcing that override would break the current navigation stack.

npm expands the `image-size` build-tool family into 8 high package-level findings and advertises a forced Expo 57 migration as its automatic fix. That is a breaking SDK change rather than a safe patch for this release candidate, so `npm audit fix --force` was deliberately not used. The URL-decoding advisory likewise needs a compatible Expo Router/React Navigation dependency update or an intentionally tested SDK upgrade; recording it in the guard is not a claim that it is fixed.

## Release decision

The critical findings are removed and the exact SDK 54 dependency set builds successfully. The `image-size` advisories apply to trusted build inputs; the URL-decoding advisory is in the navigation dependency tree and remains a tracked runtime risk. Keep build inputs trusted, do not run Metro against untrusted image files, and re-run this audit whenever Expo Router or React Navigation publishes a compatible patch and during the planned SDK upgrade. The guard may accept only this documented baseline; any expansion fails verification.

Before every release:

```bash
npm ci
npx expo install --check
npx expo-doctor
npm audit --omit=dev
```

Do not accept a forced audit fix unless the resulting Expo/React Native version set is intentionally migrated and passes the complete iOS regression suite.
