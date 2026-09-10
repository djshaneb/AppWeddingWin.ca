import { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import {
  accountDeletionIsInFlight,
  accountMutationIsCurrent,
  getAccountDeletionGeneration,
} from '@/lib/account_deletion_state';
import {
  getNativeSessionStorageGeneration,
  mutateNativeSessionStorage,
  readNativeSessionStorage,
} from '@/lib/native_session_storage';

const BRAND_COLOR = '#C66A6A';
const APP_BACKEND_URL = 'https://pszcjoyabwvzsxxjtkhs.supabase.co';
const APP_BACKEND_PUBLISHABLE_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBzemNqb3lhYnd2enN4eGp0a2hzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg2OTMxMTYsImV4cCI6MjA5NDI2OTExNn0.QLCEmNcn1WAks0IHkCLmI3iY5K4GnRxZ9Sfy89GYrLo';
const NATIVE_MEMBER_SESSION_KEY = 'weddingwin.nativeMember.v1';
const NATIVE_BRIDGE_SESSION_KEY = 'weddingwin.nativeBridgeSession.v1';
const EMAIL_REFRESH_TIMEOUT_MS = 15000;

type NativeBridgeSession = {
  user_id?: string | number;
  token?: string;
};

function parseNativeSession(raw: string | null): NativeBridgeSession | null {
  if (!raw) return null;
  try {
    const session = JSON.parse(raw) as NativeBridgeSession;
    return session?.user_id && session?.token ? session : null;
  } catch {
    return null;
  }
}

function sameNativeSessionIdentity(
  first: NativeBridgeSession | null,
  second: NativeBridgeSession | null,
) {
  return (
    !!first &&
    !!second &&
    String(first.user_id || '') === String(second.user_id || '') &&
    String(first.token || '') === String(second.token || '')
  );
}

async function refreshConfirmedEmail(screenSignal: AbortSignal) {
  if (screenSignal.aborted || accountDeletionIsInFlight()) return;
  const deletionGeneration = getAccountDeletionGeneration();

  const nativeSession = await readNativeSessionStorage(async () =>
    parseNativeSession(
      await SecureStore.getItemAsync(NATIVE_BRIDGE_SESSION_KEY),
    ),
  );
  if (
    screenSignal.aborted ||
    !accountMutationIsCurrent(deletionGeneration) ||
    !nativeSession
  )
    return;
  const expectedStorageGeneration = getNativeSessionStorageGeneration();

  const requestController = new AbortController();
  const cancelRequest = () => requestController.abort();
  screenSignal.addEventListener('abort', cancelRequest, { once: true });
  const timeout = setTimeout(cancelRequest, EMAIL_REFRESH_TIMEOUT_MS);
  try {
    const response = await fetch(
      `${APP_BACKEND_URL}/functions/v1/bd-complete-profile`,
      {
        method: 'POST',
        signal: requestController.signal,
        headers: {
          Authorization: `Bearer ${APP_BACKEND_PUBLISHABLE_KEY}`,
          apikey: APP_BACKEND_PUBLISHABLE_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          native_session: nativeSession,
          action: 'refresh',
        }),
      },
    );
    const data = await response.json().catch(() => ({}));
    if (
      !response.ok ||
      !data?.ok ||
      !data?.user ||
      requestController.signal.aborted ||
      !accountMutationIsCurrent(deletionGeneration)
    )
      return;

    const refreshedSession = data.native_session
      ? (data.native_session as NativeBridgeSession)
      : null;
    if (
      (data.user?.user_id &&
        String(data.user.user_id) !== String(nativeSession.user_id)) ||
      (refreshedSession &&
        (!refreshedSession.token ||
          String(refreshedSession.user_id || '') !==
            String(nativeSession.user_id)))
    )
      return;

    await mutateNativeSessionStorage(async (writeGeneration) => {
      if (
        writeGeneration !== expectedStorageGeneration + 1 ||
        screenSignal.aborted ||
        !accountMutationIsCurrent(deletionGeneration)
      )
        return false;

      const currentSession = parseNativeSession(
        await SecureStore.getItemAsync(NATIVE_BRIDGE_SESSION_KEY),
      );
      if (!sameNativeSessionIdentity(currentSession, nativeSession)) {
        return false;
      }

      await SecureStore.setItemAsync(
        NATIVE_MEMBER_SESSION_KEY,
        JSON.stringify(data.user),
      );
      if (refreshedSession) {
        await SecureStore.setItemAsync(
          NATIVE_BRIDGE_SESSION_KEY,
          JSON.stringify(refreshedSession),
        );
      }
      return true;
    });
  } finally {
    clearTimeout(timeout);
    screenSignal.removeEventListener('abort', cancelRequest);
  }
}

export default function EmailConfirmedScreen() {
  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    const finish = async () => {
      await refreshConfirmedEmail(controller.signal).catch(() => {});
      if (!cancelled) router.replace('/(tabs)');
    };

    const timer = setTimeout(finish, 500);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      controller.abort();
    };
  }, []);

  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color={BRAND_COLOR} />
      <Text style={styles.title}>Checking your email</Text>
      <Text style={styles.message}>Taking you back to WeddingWin...</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFF8F5',
    padding: 24,
    gap: 14,
  },
  title: {
    color: '#2E2E32',
    fontSize: 22,
    fontWeight: '800',
  },
  message: {
    color: '#7D6B68',
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
    fontWeight: '600',
  },
});
