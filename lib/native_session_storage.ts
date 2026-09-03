let nativeSessionStorageQueue: Promise<void> = Promise.resolve();
let nativeSessionStorageGeneration = 0;

function runExclusively<T>(operation: () => Promise<T>): Promise<T> {
  const queued = nativeSessionStorageQueue.catch(() => {}).then(operation);
  nativeSessionStorageQueue = queued.then(
    () => undefined,
    () => undefined,
  );
  return queued;
}

/**
 * Serializes reads that must observe both native-session records together.
 * Later writes wait until the read finishes.
 */
export function readNativeSessionStorage<T>(read: () => Promise<T>) {
  return runExclusively(read);
}

/**
 * Serializes every native account/session write across mounted routes.
 * The generation is reserved synchronously when the write is queued.
 */
export function mutateNativeSessionStorage<T>(
  mutation: (generation: number) => Promise<T>,
) {
  nativeSessionStorageGeneration += 1;
  const generation = nativeSessionStorageGeneration;
  return runExclusively(() => mutation(generation));
}

export function getNativeSessionStorageGeneration() {
  return nativeSessionStorageGeneration;
}
