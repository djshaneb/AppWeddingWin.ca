import { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';

type Status = 'working' | 'no-params' | 'redirecting' | 'error';

const BRAND_COLOR = '#C66A6A';

export default function AuthCallback() {
  const [status, setStatus] = useState<Status>('working');
  const [message, setMessage] = useState('Signing you in...');

  useEffect(() => {
    if (Platform.OS !== 'web') {
      setStatus('error');
      setMessage('This page only works on the web.');
      return;
    }

    try {
      const hash = (window.location.hash || '').replace(/^#/, '');
      const search = (window.location.search || '').replace(/^\?/, '');
      const ua = navigator.userAgent || '';
      const inApp = /WeddingWinApp/.test(ua);

      let combined = hash;
      if (search) combined = combined ? `${combined}&${search}` : search;

      if (!combined) {
        setStatus('no-params');
        setMessage('No auth data found on this URL.');
        return;
      }

      if (inApp) {
        const deepLink = `weddingwin://auth-callback#${combined}`;
        setStatus('redirecting');
        setMessage('Returning to the app...');

        const w = window as unknown as {
          WeddingWinApp?: { completeAuth?: (link: string) => void };
        };
        if (w.WeddingWinApp && typeof w.WeddingWinApp.completeAuth === 'function') {
          w.WeddingWinApp.completeAuth(deepLink);
          return;
        }
        window.location.href = deepLink;
        return;
      }

      setStatus('redirecting');
      setMessage('Signed in. Redirecting...');
      const dest = `https://www.weddingwin.ca/#${combined}`;
      setTimeout(() => window.location.replace(dest), 400);
    } catch {
      setStatus('error');
      setMessage('Something went wrong.');
    }
  }, []);

  const goHome = () => {
    if (Platform.OS === 'web') {
      window.location.replace('https://www.weddingwin.ca/');
      return;
    }
    router.replace('/(tabs)');
  };

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        {status === 'working' || status === 'redirecting' ? (
          <ActivityIndicator size="large" color={BRAND_COLOR} />
        ) : null}

        <Text style={styles.title}>WeddingWin</Text>
        <Text style={styles.message}>{message}</Text>

        {status === 'no-params' || status === 'error' ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Go to homepage"
            style={styles.button}
            onPress={goHome}>
            <Text style={styles.buttonText}>Go to homepage</Text>
          </Pressable>
        ) : null}

      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFF8F5',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    alignItems: 'center',
    maxWidth: 520,
    width: '100%',
    gap: 16,
  },
  title: {
    color: BRAND_COLOR,
    fontSize: 20,
    fontWeight: '600',
    letterSpacing: 1,
  },
  message: {
    color: '#3B3433',
    fontSize: 16,
    textAlign: 'center',
    lineHeight: 24,
  },
  button: {
    backgroundColor: BRAND_COLOR,
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
    marginTop: 8,
  },
  buttonText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 14,
  },
});
