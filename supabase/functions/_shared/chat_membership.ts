type ChatMembershipPlan = Record<string, unknown>;

function hasOwnFlag(plan: ChatMembershipPlan, name: string) {
  return Object.prototype.hasOwnProperty.call(plan, name);
}

function enabledPlanFlag(value: unknown) {
  return String(value ?? "").trim() === "1";
}

/**
 * Resolves Brilliant Directories' receive-message permission without letting a
 * stale legacy field override the active direct-message setting. The
 * private-reviewer override may only be passed after the caller has validated
 * the expiring reviewer pair.
 */
export function recipientCanReceiveChat(
  plan: ChatMembershipPlan | undefined,
  pairedPrivateReviewer = false,
) {
  if (pairedPrivateReviewer) return true;
  if (!plan) return false;

  if (hasOwnFlag(plan, "enable_receiving_chat_messages")) {
    return enabledPlanFlag(plan.enable_receiving_chat_messages);
  }
  if (hasOwnFlag(plan, "enable_direct_messages")) {
    return enabledPlanFlag(plan.enable_direct_messages);
  }
  return enabledPlanFlag(plan.receive_messages);
}
