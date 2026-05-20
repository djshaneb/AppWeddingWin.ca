import { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import * as WebBrowser from 'expo-web-browser';

const BRAND_COLOR = '#C66A6A';
const APP_BACKEND_URL = 'https://pszcjoyabwvzsxxjtkhs.supabase.co';
const APP_BACKEND_PUBLISHABLE_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBzemNqb3lhYnd2enN4eGp0a2hzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg2OTMxMTYsImV4cCI6MjA5NDI2OTExNn0.QLCEmNcn1WAks0IHkCLmI3iY5K4GnRxZ9Sfy89GYrLo';
const NATIVE_MEMBER_SESSION_KEY = 'weddingwin.nativeMember.v1';
const NATIVE_BRIDGE_SESSION_KEY = 'weddingwin.nativeBridgeSession.v1';

async function refreshConfirmedEmail(email: string) {
  const storedSession = await SecureStore.getItemAsync(NATIVE_BRIDGE_SESSION_KEY);
  if (!storedSession) return;

  const nativeSession = JSON.parse(storedSession);
  if (!nativeSession?.user_id || !nativeSession?.token) return;

  const response = await fetch(`${APP_BACKEND_URL}/functions/v1/bd-complete-profile`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${APP_BACKEND_PUBLISHABLE_KEY}`,
      apikey: APP_BACKEND_PUBLISHABLE_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      native_session: nativeSession,
      profile: { email },
    }),
  });
  const data = await response.json();

  if (!response.ok || !data?.ok || !data?.user) return;
  await SecureStore.setItemAsync(NATIVE_MEMBER_SESSION_KEY, JSON.stringify(data.user));
  if (data.native_session) {
    await SecureStore.setItemAsync(
      NATIVE_BRIDGE_SESSION_KEY,
      JSON.stringify(data.native_session)
    );
  }
}

export default function EmailConfirmedScreen() {
  const params = useLocalSearchParams<{
    app_login_url?: string;
    email?: string;
  }>();

  useEffect(() => {
    const appLoginUrl = Array.isArray(params.app_login_url)
      ? params.app_login_url[0]
      : params.app_login_url;
    const email = Array.isArray(params.email) ? params.email[0] : params.email;

    if (appLoginUrl) {
      WebBrowser.openAuthSessionAsync(appLoginUrl, 'https://www.weddingwin.ca/auth-callback')
        .catch(() => {})
        .finally(() => {
          router.replace('/(tabs)');
        });
      return;
    }

    let cancelled = false;
    const finish = async () => {
      if (email) {
        await refreshConfirmedEmail(email).catch(() => {});
      }
      if (!cancelled) router.replace('/(tabs)');
    };

    const timer = setTimeout(finish, 500);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [params.app_login_url, params.email]);

  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color={BRAND_COLOR} />
      <Text style={styles.title}>Email confirmed</Text>
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
