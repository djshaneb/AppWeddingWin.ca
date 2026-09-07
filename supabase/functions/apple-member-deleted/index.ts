import {
  AppleReceiptError,
  parseAppleDeletionReceipt,
} from "../_shared/apple_grant_lifecycle.ts";
import {
  appleGrantPrivateConfig,
  enqueueAppleMemberDeletion,
} from "../_shared/apple_grant_store.ts";

Deno.serve(async (request) => {
  const headers = {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
  };
  try {
    const secrets = await appleGrantPrivateConfig();
    const receipt = await parseAppleDeletionReceipt(
      request,
      secrets.apple_member_deleted_secret,
    );
    if (receipt.ignored) {
      return new Response(JSON.stringify({ ignored: true }), {
        status: 200,
        headers,
      });
    }
    const job = await enqueueAppleMemberDeletion(receipt.bdMemberId, {
      fullCleanup: true,
    });
    return new Response(
      JSON.stringify({ accepted: true, status: job.status }),
      { status: 200, headers },
    );
  } catch (error) {
    const status = error instanceof AppleReceiptError ? error.status : 503;
    return new Response(
      JSON.stringify({
        error: error instanceof AppleReceiptError
          ? error.message
          : "Deletion receipt temporarily unavailable.",
      }),
      { status, headers },
    );
  }
});
