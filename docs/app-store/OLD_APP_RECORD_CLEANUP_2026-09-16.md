# Old App Store app record cleanup — September 16, 2026 UTC

The owner explicitly approved removal of the following ten older draft app records after reviewing Apple's warning that removal releases the app names and uploaded bundle IDs cannot be reused for new app records. Each exact record was checked by app ID and name before removal, and afterward displayed its removal notice and **Restore App** control.

| Removed draft | Apple app ID |
| --- | --- |
| weddingwin4 | 6756084225 |
| weddingwin3 | 6755900350 |
| weddingwin2 | 6755896806 |
| WeddingWin | 6755896487 |
| WeddingWin.ca | 6755897555 |
| weddingwin.ca-app | 6755980100 |
| Wedding Win App | 6755897000 |
| WeddingWinCanada | 6755896956 |
| bolt-expo-nativewind (e6e649) | 6755978838 |
| bolt-expo-nativewind (5ed380) | 6755896923 |

The final active app list contains only **WeddingWin Canada**, app **6806603211**. Its builds remain intact: builds 5–7 show Ready to Submit, 90 days and WeddingWin Internal QA; builds 2–4 remain Expired. No current app record, build, signing identifier, device installation or app code was removed or changed. The current release source has no reference to the ten removed app IDs.

## TestFlight outcome after cleanup

One guarded build 7 Update on the connected iPad was run beginning **02:45:25 UTC**. It again displayed **Could not install WeddingWin Canada. The requested app is not available or doesn’t exist.** No Open button appeared. The XCTest observer completed successfully; the app installation failed.

Local result: `work/app-store-build7-sept15/ipad-after-old-record-cleanup-sept16.xcresult`.

This establishes that the immediate retry still failed after cleanup. No new HTTP trace was captured during this attempt, so it is not an additional verified HTTP 404. No new communication was sent to Apple. The existing installation investigation remains open.
