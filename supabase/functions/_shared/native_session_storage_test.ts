import {
  getNativeSessionStorageGeneration,
  mutateNativeSessionStorage,
  readNativeSessionStorage,
} from '../../../lib/native_session_storage.ts';
import {
  accountDeletionIsInFlight,
  accountMutationIsCurrent,
  beginAccountDeletion,
  finishAccountDeletion,
  getAccountDeletionGeneration,
} from '../../../lib/account_deletion_state.ts';

const appSource = await Deno.readTextFile(
  new URL('../../../app/(tabs)/index.tsx', import.meta.url),
);
const aboutSource = await Deno.readTextFile(
  new URL('../../../app/(tabs)/about.tsx', import.meta.url),
);
const confirmationSource = await Deno.readTextFile(
  new URL('../../../app/email-confirmed.tsx', import.meta.url),
);

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

Deno.test(
  'native session storage operations are globally serialized',
  async () => {
    const order: string[] = [];
    let releaseFirst!: () => void;
    let markFirstStarted!: () => void;
    const firstMayFinish = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    const firstStarted = new Promise<void>((resolve) => {
      markFirstStarted = resolve;
    });

    const first = mutateNativeSessionStorage(async () => {
      order.push('first-start');
      markFirstStarted();
      await firstMayFinish;
      order.push('first-end');
    });
    const read = readNativeSessionStorage(async () => {
      order.push('read');
    });
    const second = mutateNativeSessionStorage(async () => {
      order.push('second');
    });

    await firstStarted;
    assert(
      order.join(',') === 'first-start',
      'a later read or write entered the native-session critical section early',
    );
    releaseFirst();
    await Promise.all([first, read, second]);
    assert(
      order.join(',') === 'first-start,first-end,read,second',
      'native-session storage operations did not preserve queue order',
    );
  },
);

Deno.test(
  'email confirmation cannot restore a later logout or account switch',
  () => {
    assert(
      confirmationSource.includes('EMAIL_REFRESH_TIMEOUT_MS') &&
        confirmationSource.includes('signal: requestController.signal') &&
        confirmationSource.includes('screenSignal.aborted'),
      'email confirmation refresh must be bounded and cancelled with its screen',
    );
    assert(
      confirmationSource.includes('expectedStorageGeneration') &&
        confirmationSource.includes(
          'writeGeneration !== expectedStorageGeneration + 1',
        ) &&
        confirmationSource.includes(
          'sameNativeSessionIdentity(currentSession, nativeSession)',
        ) &&
        confirmationSource.includes('mutateNativeSessionStorage'),
      'email confirmation must conditionally persist only the session it refreshed',
    );
    assert(
      appSource.includes('mutateNativeSessionStorage') &&
        appSource.includes('queueNativeSessionStorageMutation'),
      'the home route must share the same storage queue with email confirmation',
    );
    assert(
      getNativeSessionStorageGeneration() >= 2,
      'queued native-session writes must advance the process-wide generation',
    );
  },
);

Deno.test(
  'account deletion owns its guard before reading secure storage',
  () => {
    const start = aboutSource.indexOf('const startNativeAccountDeletion');
    const guard = aboutSource.indexOf('beginAccountDeletion', start);
    const dispatch = aboutSource.indexOf('deleteNativeAccount(session)', guard);
    assert(
      start >= 0 && guard > start && dispatch > guard,
      'the process-wide deletion guard must be acquired before the first async session read',
    );
    assert(
      aboutSource.includes(
        'sameNativeSessionIdentity(session, deletionSession)',
      ),
      'account deletion must refuse a cached identity after the stored account changes',
    );

    const generation = getAccountDeletionGeneration();
    assert(
      beginAccountDeletion('storage-test-user', 'storage-test-token'),
      'the deletion guard was not acquired',
    );
    assert(
      accountDeletionIsInFlight() && !accountMutationIsCurrent(generation),
      'starting deletion must immediately invalidate an older account mutation',
    );
    finishAccountDeletion('storage-test-user', 'storage-test-token');
    assert(
      !accountDeletionIsInFlight() && !accountMutationIsCurrent(generation),
      'an old account mutation must stay invalid after deletion releases its guard',
    );
  },
);
