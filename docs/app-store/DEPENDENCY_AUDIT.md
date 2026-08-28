# Dependency audit triage

Status: **WORKING-TREE REMEDIATION RECORDED — repeat on the immutable release tag**

Audited: 2026-08-28 against the npm production dependency tree (`npm audit --omit=dev`) recorded by local release-candidate tag `v1.0.0-rc.2`. No source has been pushed or used for a signed/TestFlight build.

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

The local checks report dependencies up to date, `expo-doctor` passes 18/18 checks, typecheck and lint pass, and the complete shared Deno regression suite passes **60/60**. The tested source is recorded by local tag `v1.0.0-rc.2`; repeat the checks from a clean tag checkout before any push or TestFlight claim.

## Before and after

| Production-tree audit | Before | After |
| --- | ---: | ---: |
| Critical | 2 | 0 |
| High | not release-recorded separately | 8 |
| Moderate | not release-recorded separately | 0 |
| Total | 33 | 8 |

## Remaining findings

The remaining audit entries roll up through Expo/Metro's local build toolchain. The only underlying unresolved package is:

- `image-size@1.2.1` through Metro: denial-of-service advisories in optional image parsers. Metro processes developer-supplied project assets while building; this package is not bundled as executable application code on the user's iPhone.
npm expands that build-tool family into 8 high package-level findings across Expo and Metro packages. The current audit advertises a forced Expo 57 migration as the automatic fix, which is a breaking SDK change rather than a safe patch for this release candidate, so `npm audit fix --force` was deliberately not used.

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
