# TestFlight retry — September 16, 2026

WeddingWin Canada **1.0.0 (7)** still failed to install on the connected iPad. The fresh device trace again places the failure at TestFlight's install-data request, before package download or installation progress. The underlying cause remains unknown.

## Actions and observations

- One Update tap at approximately **02:24:33 UTC** left Update visible, without Open or an alert, through 45 seconds. This observation does not prove that an install request was sent.
- TestFlight was reopened and **WeddingWin Canada 1.0.0, Build 7** was visually verified. A second single-Update helper began at **02:27:37.013 UTC** and observed the requested-app-unavailable error, with no Open button. Its result is `work/app-store-build7-sept15/ipad-retry-sept16-refreshed-update7.xcresult`.
- There were **two Update taps this turn, with one fresh server failure proven**. A passing XCTest observer means its observation routine completed; it is not a successful app installation or an app acceptance test.

## Fresh failure evidence

At **2026-09-16 02:28:04.399187 UTC**, Console recorded **HTTP 404** for:

```text
/v2/accounts/[redacted]/apps/6806603211/builds/236341488/install
```

Apple response correlation key: **KQLZTCP7X2KK2HWL4DRDOYNMBI**.

The trace then reported **Error Downloading Install Data**, **No Progress**, null download and install progress, and `serverCode: 200`. That server error field is separate from the observed HTTP 404. The recorded prior installed version was **1.0.0 (4)**; it does not establish a successful build 7 installation.

Console capture was stopped and that stop was verified. No app code, configuration or build was changed. Changes to the temporary UI helper added TestFlight reopening and private screenshot capture only. A later cleanup check found no remaining TestFlight alerts, so it performed no dismissal.

A cleanup helper at **02:29:25 UTC** found no TestFlight alerts and skipped dismissal without tapping. The exact build 7 identity remained verified. A redacted evidence record is saved locally at `work/app-store-build7-sept15/ipad-retry-sept16-redacted-evidence.json` with permissions `600`.

## Follow-up scope

This repeats the failure stage documented in the [earlier build 7 installation evidence](/Users/shane/Documents/Codex/2026-09-10/one-of-my-previous-chats-won/work/app-store-build7-sept15/TESTFLIGHT_INSTALL_DATA_FAILURE_2026-09-15.md). It does not identify a new app defect or justify another rebuild or app deletion.

The new evidence is recorded for existing Apple feedback **FB24795843** and support case **102964472775**. **No new message was sent to Apple during this retry.** TestFlight installation and subsequent distribution-build acceptance remain incomplete.
