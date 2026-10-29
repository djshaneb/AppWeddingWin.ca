# Message API relief — 29 October 2026

## Scope and deployment

The installed mobile app continues using its existing API contracts and polling
intervals. This backend change removes redundant Brilliant Directories member
lookups from passive message status/list/read requests and coordinates shared
website message refreshes across concurrent workers. It requires no app update.

Only these Supabase functions were deployed:

| Function | Before | After | JWT setting |
| --- | --- | --- | --- |
| bd-chat-status | 37 | 38 | false, unchanged; canonical native-session authentication remains mandatory |
| bd-chat-sync | 56 | 57 | false, unchanged; canonical native-session authentication remains mandatory |

Deployment began at 18:28 UTC. Downloaded deployed files match the prepared source
exactly. The other 28 functions, including bd-push-sweep v17, were unchanged.
There were no database migrations, key changes, native source/configuration edits,
website changes, account resets or App Store submissions.

## Authorization and delivery safeguards

- Every passive request still validates the canonical member token/cookie and
  performs an uncached, signed website account/email verification request.
- The live verification widget was read before deployment. Its source matches
  the repository after removing private configuration. It directly queries the
  exact member and requires active status 2 before returning the email proof.
- Cached profile fields do not authorize access. Unavailable, malformed,
  inactive/deleted or pending-email proof fails closed. Only a fully validated,
  non-pending email change permits one fresh BD lookup and another verification.
- Send, open-vendor and report actions keep their fresh BD member checks;
  recipient permissions, pair restrictions, moderation and idempotency remain.
- A unique-key insert elects one refresh owner in the existing service-only
  cache table. Reads bypass per-worker memory. Completion is fenced by owner,
  running state and unexpired lease; stale owners cannot overwrite successors.
- Refreshes retain the existing 20-second freshness interval. A failed refresh
  waits 30 seconds before another attempt. Each refresh has a 120-second crash
  lease, a 90-second work deadline, 25-second request headroom and 32-call cap.
- Budget/lease exhaustion defers queued delivery without consuming delivery
  retries. Normal user sends run outside the refresh budget.

## Verification

- 310 Deno tests, 166 Node tests and 18 PostgreSQL integration cases passed:
  494 counted tests, zero failures. Notification cron tests also run within the
  Node suite. Both deployed entrypoints passed Deno type checking.
- An offline 1,200-request passive-poll scenario made zero redundant BD member
  lookups. Three hundred concurrent simulated workers elected one refresh owner.
- Tests cover expired ownership, failed persistence, failure cooldown, bounded
  calls, independent request isolation, outbox claim release, read receipts,
  canonical session revocation, email confirmation, messaging permissions,
  notification identities/routing, Google login and QR Bingo scan recovery.
- Post-deployment catalog comparison found all functions active, with unchanged
  JWT settings, cron jobs, RLS, grants, policies, index/constraint health and
  advisory categories/levels.
- The first observed live coordinated refresh completed successfully at
  18:28:51 UTC with eight BD calls.
- Live controlled-account login, status, inbox, send and read requests passed.
  One message was delivered, an explicit repeat with the same client ID created
  no duplicate, the recipient saw it as read, and unread count returned to zero.
  The database records one send, one delivered outbox row and zero failed
  delivery attempts. Forged sessions were rejected with HTTP 401 on both routes.
- The operational harness initially expected the displayed history to grow
  from 12 to 13 messages. The unchanged API intentionally returns the latest 12.
  A follow-up without any sends confirmed the correct message, ownership, read
  state and unread count. The original failed assertion is preserved in the
  operational evidence; it was not an API or delivery failure.
- Between 18:28:35 and 18:34 UTC, the endpoints returned 18 HTTP 200 responses
  and the two deliberate HTTP 401 rejections, with no 429 or 5xx responses.
  Six observed shared refreshes completed with eight BD calls each and no
  recorded runtime errors in that window.
- Four natural notification-worker runs from 18:30 through 18:33 UTC returned
  HTTP 200, checked 52 registrations each and reported zero failures. There
  were no eligible new notifications in those runs.

The controlled message accounts have no enabled push registrations; these live
message checks do not demonstrate a new automatic phone notification. The user
confirmed seeing and hearing the separate physical-phone test earlier today.
That test, the unchanged push worker, notification regression tests and healthy
post-deployment worker runs are separate pieces of evidence, not a claim that
the controlled message generated a physical alert.

This reduces message-related website API consumption; it does not eliminate
necessary app-to-backend requests or guarantee the provider's overall capacity
under 300 real users. Concurrent testing was offline to avoid production load.
The notification worker has its own complete-snapshot checks and was preserved.

Private operational artifacts, original deployment bundles and detailed test
logs are held outside the checkout in `work/message-api-relief-2026-10-29`.
Rollback is scoped to the saved original chat-status v37 and chat-sync v56
bundles, preserving their original JWT settings. Do not roll back unrelated
notification or database maintenance changes.
