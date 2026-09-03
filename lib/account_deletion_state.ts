type DeletingAccountIdentity = {
  userId: string;
  token: string;
};

export type AccountDeletedEvent = {
  deletedAt: string;
  userId: string;
  token: string;
};

let deletingAccount: DeletingAccountIdentity | null = null;
let accountDeletionGeneration = 0;
const deletionListeners = new Set<(event: AccountDeletedEvent) => void>();

export function beginAccountDeletion(userId: unknown, token: unknown) {
  if (deletingAccount) return false;
  const identity = {
    userId: String(userId || '').trim(),
    token: String(token || '').trim(),
  };
  if (!identity.userId || !identity.token) return false;
  deletingAccount = identity;
  accountDeletionGeneration += 1;
  return true;
}

export function finishAccountDeletion(userId: unknown, token: unknown) {
  if (
    deletingAccount?.userId === String(userId || '').trim() &&
    deletingAccount?.token === String(token || '').trim()
  ) {
    deletingAccount = null;
  }
}

export function accountDeletionIsInFlight() {
  return deletingAccount !== null;
}

export function getAccountDeletionGeneration() {
  return accountDeletionGeneration;
}

export function accountMutationIsCurrent(generation: number) {
  return !deletingAccount && generation === accountDeletionGeneration;
}

export function notifyAccountDeleted(event: AccountDeletedEvent) {
  deletionListeners.forEach((listener) => listener(event));
}

export function subscribeToAccountDeleted(
  listener: (event: AccountDeletedEvent) => void,
) {
  deletionListeners.add(listener);
  return () => {
    deletionListeners.delete(listener);
  };
}
