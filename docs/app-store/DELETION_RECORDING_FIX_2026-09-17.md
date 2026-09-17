# Deletion confirmation correction — September 17, 2026

During the physical iPhone recording on TestFlight 1.0.0 (7), deleting the disposable review account exceeded the app's 18-second request timeout. The UI incorrectly reported failure and a concurrent background request displayed a session-expired alert. Read-only backend checks subsequently confirmed removal of the member, Auth identity, cached credentials, exchanges, push tokens and account-only data. Shared conversation and moderation records were retained intentionally.

The client now permits a 160-second deletion response window, beyond the service's documented 150-second gateway limit. Network loss, malformed responses and server errors are treated as unconfirmed outcomes, without claiming success or prompting a blind retry. Only a successful server response confirms deletion. Identity checks prevent a late request or confirmation from affecting a different account. Background session, website bridge and chat-status responses are discarded when deletion has retired them.

Validation: 55 focused offline tests passed across deletion confirmation and session expiry. TypeScript passed. Scoped lint has no errors and seven existing warnings in the home screen. Physical confirmation and replacement footage remain pending on the corrected TestFlight build. The failed build-7 deletion clip is excluded from successful demonstration footage.

Apple's submission is rejected with a Guideline 2.1 information request. The response and recording are being prepared; neither a reply nor a resubmission has been sent as part of this correction.
