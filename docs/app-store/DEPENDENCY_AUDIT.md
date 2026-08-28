# Dependency audit triage

Status: **WORKING-TREE REMEDIATION RECORDED — repeat on the immutable release tag**

Audited: 2026-08-28 against the then-current working-tree npm production dependency tree (`npm audit --omit=dev`). The package/lockfile changes were not yet a tagged release when this record was prepared.

## Changes applied

- Aligned the four Expo SDK 54 patch mismatches reported by `expo install --check`:
  - `expo` `~54.0.37`
  - `expo-constants` `~18.0.14`
  - `expo-font` `~14.0.12`
  - `expo-router` `~6.0.24`
- Added the missing direct Expo asset peer/plugin, `expo-asset` `~12.0.13`, after `expo-doctor` identified it.
- Applied lockfile-only safe audit remediation.
- Pinned patched transitive versions for `brace-expansion` (`5.0.9`) and `postcss` (`8.5.26`) through npm `overrides`.
- Regenerated `package-lock.json` without changing package managers. This repository remains npm-based.

The current working-tree checks report dependencies up to date and `expo-doctor` passes 18/18 checks. These are not final release-tag evidence; repeat them from a clean checkout.

## Before and after

| Production-tree audit | Before | After |
| --- | ---: | ---: |
| Critical | 2 | 0 |
| High | not release-recorded separately | 8 |
| Moderate | not release-recorded separately | 13 |
| Total | 33 | 21 |

## Remaining findings

The remaining audit entries roll up through Expo/Metro's local build toolchain. The two underlying unresolved packages are:

- `image-size@1.2.1` through Metro: denial-of-service advisories in optional image parsers. Metro processes developer-supplied project assets while building; this package is not bundled as executable application code on the user's iPhone.
- `uuid@7.0.3` through Expo's `xcode`/code-signing helper dependencies: a bounds-check advisory for APIs that accept a caller-supplied output buffer. This is also build tooling, not application runtime code.

npm expands those build-tool families into 8 high and 13 moderate package-level findings across Expo, Metro, configuration, assets, and routing packages. npm's advertised automatic fix is an invalid downgrade/major migration (for example, proposing Expo 46 or SDK 57-family packages for an SDK 54 application), so `npm audit fix --force` was deliberately not used.

## Release decision

The critical findings are removed and the exact SDK 54 dependency set builds successfully. The remaining advisories do not represent code shipped into the native app runtime, but they remain relevant to trusted build hosts. Keep build inputs trusted, do not run Metro against untrusted image files, and re-run this audit when Expo publishes a compatible SDK 54 patch or during a planned SDK upgrade.

Before every release:

```bash
npm ci
npx expo install --check
npx expo-doctor
npm audit --omit=dev
```

Do not accept a forced audit fix unless the resulting Expo/React Native version set is intentionally migrated and passes the complete iOS regression suite.
