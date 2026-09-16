# Why build 4 worked and later TestFlight installations failed

## Finding

The first replacement, build 5, used the same application code as the successful build 4. The intentional app change was the iOS build number from 4 to 5. The failure began before the review-flow work in build 6 and the review-header correction in build 7.

The strongest unexplained transition is that the recently uploaded, working build 4 became **Expired** in TestFlight. New uploads still process successfully but TestFlight refuses their installation-data request before package download. This points toward TestFlight availability, tester authorization or an app/account record problem. The exact server-side cause has not been established.

## What changed in our release process

| Item | Working build 4 | First replacement build 5 |
| --- | --- | --- |
| Intentional app change | Approved chat fix already included | Build number 4 → 5 only |
| Build service/profile | EAS production, Store distribution | Same |
| App version / bundle | 1.0.0 / ca.weddingwin.app | Same |
| Submission target | App Store app 6806603211 | Same |
| Test distribution | WeddingWin Internal QA | Same existing group |
| iPhone/iPad support | Both device families | Same |

Git commit `eb87b3a` changes only `app.json`'s iOS build number. Between build 4's recorded source and build 5's source, the other changes are release documents. `eas.json`, dependencies and app runtime source did not change. Both EAS uploads completed successfully.

A fresh independent comparison of the actual uploaded archives confirms:

- The JavaScript bundle is byte-identical. All 81 app-bundle paths match, and 74 files are identical.
- Main and framework executable code is identical outside the code-signature regions. Their binary UUIDs match.
- The embedded provisioning profile, signed entitlements and signing certificate chain are identical. Strict signature verification passes for both archives.
- Minimum iOS 15.1, iOS 26 SDK, arm64 and iPhone/iPad device families are unchanged.
- Differences are the build-number fields, renewed signatures/resource seals, and symbol-file archive-path/timestamp metadata. No different app implementation, signing identity or device requirement was found.

## What Apple's records show

The recorded action history establishes this order (September 15, UTC):

1. **04:15:04:** Build 4 upload completed. At **04:26:08**, the recorded click adjacent to the Expire Build control was the separate **Save** button after editing What to Test; it was not an expiration click.
2. **04:56:57:** The owner reported Stop Testing while replacing an older test version. Successful build 4 iPad checks followed at approximately **05:14–05:28**, including notifications. That earlier Stop Testing action does not explain the later failure.
3. **19:21:46:** The earlier invitation was reported invalid; its cause is unestablished. At **19:58:29**, the first fresh authenticated observation showed builds 2, 3 and 4 Expired. Build 4 was approximately 16 hours old. A previous page still displaying 90 days could have been stale and does not establish the exact expiration time.
4. **20:01:36:** Build 5 was started after the expiration was observed. The first phone installation failure followed around **20:47**. The second phone's Media & Purchases account switch occurred later, around **21:09**, so it cannot explain the first phone's failure.

The targeted action-history audit found no recorded root-agent Expire Build action before the first fresh expiration observation. The reauthenticated inspection selected the existing tester, opened the group's empty build picker and cancelled it; it did not remove a tester, reinvite one or expire a build. This narrows our recorded actions but does not identify the actor or server event that expired build 4.

The current App Store Connect view was checked again September 16 UTC. Build 4 remains Binary State **Validated**, uploaded September 14 at 9:15 p.m. PDT, with **one installation and 13 sessions**, but its TestFlight status is **Expired** and it has no assigned groups. Builds 5, 6 and 7 show **Ready to Submit**, **90 days** and the existing internal group with one invite. Thus build 4's unavailability cannot be explained by 90 days elapsing since upload.

The latest physical iPad retry returned HTTP 404 from the app/build installation-data endpoint, with **Error Downloading Install Data** and no package progress. See the [fresh retry evidence](TESTFLIGHT_RETRY_2026-09-16.md). This occurs before WeddingWin can execute and does not establish a runtime-code defect.

Apple documents [normal build availability and statuses](https://developer.apple.com/help/app-store-connect/reference/app-uploads/app-build-statuses) and [manual build expiration](https://developer.apple.com/help/app-store-connect/test-a-beta-version/stop-testing-a-build). Apple's public developer-relations staff have also acknowledged investigation of this class of [unexpected expiration followed by installation failures](https://developer.apple.com/forums/thread/813703). That is supporting context, not a diagnosis of this account or proof of a missing beta contract.

## Remaining uncertainty

Apple needs to explain why the successful build became unavailable and why the replacement build's install-data lookup returns 404 despite its visible testing assignment. Existing feedback **FB24795843** and support case **102964472775** contain the installation evidence. No new external message, rebuild, tester deletion or app deletion was performed for this comparison.
