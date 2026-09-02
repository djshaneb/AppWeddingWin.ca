import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Linking,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  ChevronRight,
  FileText,
  Mail,
  Shield,
  Trash2,
} from 'lucide-react-native';

const SITE_URL = 'https://www.weddingwin.ca';
const BRAND_COLOR = '#C66A6A';
const LOGO_IMAGE = {
  uri: `${SITE_URL}/images/CoralLogoTransB.png`,
} as const;
const DELETE_ACCOUNT_URL = `${SITE_URL}/account/deleteaccount`;
const APP_BACKEND_URL = 'https://pszcjoyabwvzsxxjtkhs.supabase.co';
const APP_BACKEND_PUBLISHABLE_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBzemNqb3lhYnd2enN4eGp0a2hzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg2OTMxMTYsImV4cCI6MjA5NDI2OTExNn0.QLCEmNcn1WAks0IHkCLmI3iY5K4GnRxZ9Sfy89GYrLo';
const NATIVE_MEMBER_SESSION_KEY = 'weddingwin.nativeMember.v1';
const NATIVE_BRIDGE_SESSION_KEY = 'weddingwin.nativeBridgeSession.v1';
const CHAT_UNREAD_SESSION_KEY = 'weddingwin.chatUnread.v1';
const PUSH_TOKEN_SESSION_KEY = 'weddingwin.expoPushToken.v1';
const ACCOUNT_DELETED_EVENT_KEY = 'weddingwin.accountDeleted.v1';

type NativeBridgeSession = {
  email?: string;
  user_id?: string | number;
  token?: string;
  cookie?: string;
};

type DeleteAccountResponse = {
  ok?: boolean;
  deleted?: boolean;
  error?: string;
  diagnostic_id?: string;
  requires_apple_reauthentication?: boolean;
};

async function openExternal(url: string) {
  try {
    await Linking.openURL(url);
  } catch {
    Alert.alert('Could not open link', 'Please try again in a moment.');
  }
}

function validNativeSession(value: unknown): value is NativeBridgeSession {
  if (!value || typeof value !== 'object') return false;
  const session = value as NativeBridgeSession;
  return !!session.user_id && !!session.token;
}

async function loadNativeSession() {
  const raw = await SecureStore.getItemAsync(NATIVE_BRIDGE_SESSION_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return validNativeSession(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

async function requestAccountDeletion(
  nativeSession: NativeBridgeSession,
  appleAuthorizationCode = '',
  appleNonce = ''
) {
  const response = await fetch(`${APP_BACKEND_URL}/functions/v1/bd-delete-account`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${APP_BACKEND_PUBLISHABLE_KEY}`,
      apikey: APP_BACKEND_PUBLISHABLE_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      confirmation: 'DELETE',
      native_session: nativeSession,
      apple_authorization_code: appleAuthorizationCode,
      apple_nonce: appleNonce,
    }),
  });
  const result = (await response.json().catch(() => ({}))) as DeleteAccountResponse;
  return { response, result };
}

async function clearDeletedAccountSession() {
  // Home is already mounted behind this tab. Leave a one-shot event so it can
  // clear in-memory account/chat/WebView state when it regains focus.
  await SecureStore.setItemAsync(ACCOUNT_DELETED_EVENT_KEY, new Date().toISOString());
  await Promise.allSettled([
    SecureStore.deleteItemAsync(NATIVE_MEMBER_SESSION_KEY),
    SecureStore.deleteItemAsync(NATIVE_BRIDGE_SESSION_KEY),
    SecureStore.deleteItemAsync(CHAT_UNREAD_SESSION_KEY),
    SecureStore.deleteItemAsync(PUSH_TOKEN_SESSION_KEY),
  ]);
}

function LinkRow({
  icon,
  title,
  subtitle,
  url,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  url: string;
}) {
  return (
    <TouchableOpacity
      style={styles.row}
      activeOpacity={0.82}
      onPress={() => openExternal(url)}
      accessibilityRole="link"
      accessibilityLabel={`${title}. ${subtitle}`}>
      <View style={styles.iconWrap}>{icon}</View>
      <View style={styles.rowText}>
        <Text style={styles.rowTitle}>{title}</Text>
        <Text style={styles.rowSub}>{subtitle}</Text>
      </View>
      <ChevronRight size={20} color="#D1AAA5" strokeWidth={2} />
    </TouchableOpacity>
  );
}

export default function AboutScreen() {
  const router = useRouter();
  const [hasNativeSession, setHasNativeSession] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      loadNativeSession()
        .then((session) => {
          if (active) setHasNativeSession(!!session);
        })
        .catch(() => {
          if (active) setHasNativeSession(false);
        });
      return () => {
        active = false;
      };
    }, [])
  );

  const deleteNativeAccount = useCallback(async () => {
    setDeleting(true);
    try {
      const session = await loadNativeSession();
      if (!session) {
        setHasNativeSession(false);
        await openExternal(DELETE_ACCOUNT_URL);
        return;
      }

      let deletion = await requestAccountDeletion(session);
      if (deletion.result.requires_apple_reauthentication) {
        if (Platform.OS !== 'ios' || !(await AppleAuthentication.isAvailableAsync())) {
          throw new Error('Sign in with Apple confirmation is unavailable on this device.');
        }
        const appleState = Crypto.randomUUID();
        const appleNonce = Crypto.randomUUID();
        const credential = await AppleAuthentication.signInAsync({
          requestedScopes: [],
          state: appleState,
          nonce: appleNonce,
        });
        if (credential.state !== appleState) {
          throw new Error('Apple confirmation did not match this deletion request.');
        }
        if (!credential.authorizationCode) {
          throw new Error('Apple did not return the confirmation needed to revoke access.');
        }
        deletion = await requestAccountDeletion(
          session,
          credential.authorizationCode,
          appleNonce
        );
      }

      if (!deletion.response.ok || !deletion.result.ok || !deletion.result.deleted) {
        const diagnostic = deletion.result.diagnostic_id
          ? `\n\nDiagnostic: ${deletion.result.diagnostic_id}`
          : '';
        throw new Error(`${deletion.result.error || 'Account deletion failed.'}${diagnostic}`);
      }

      await clearDeletedAccountSession();
      setHasNativeSession(false);
      Alert.alert(
        'Account deleted',
        'Your WeddingWin account and account-only app data were permanently deleted. Shared message history may remain visible to the other participant under WeddingWin’s retention policy.',
        [{ text: 'OK', onPress: () => router.replace('/') }]
      );
    } catch (error) {
      const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : '';
      if (code === 'ERR_REQUEST_CANCELED') return;
      const message = error instanceof Error ? error.message : 'Account deletion failed.';
      Alert.alert('Could not delete account', message);
    } finally {
      setDeleting(false);
    }
  }, [router]);

  const confirmDeleteAccount = useCallback(() => {
    if (!hasNativeSession) {
      Alert.alert(
        'Delete account?',
        'WeddingWin will open the secure account deletion page. You can review the details before confirming deletion.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Open Delete Account',
            style: 'destructive',
            onPress: () => openExternal(DELETE_ACCOUNT_URL),
          },
        ]
      );
      return;
    }

    Alert.alert(
      'Permanently delete account?',
      'This deletes your WeddingWin login, profile or vendor listing, push token, QR visit progress, and active account-only app data. Optional draw records are removed or de-identified from active features, subject to legally required contest records, disputes, legal holds, fraud prevention, and normal backup expiry. Shared message history may remain visible to the other participant under WeddingWin’s retention policy, but the conversation will be closed and no new messages can be sent. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete Account',
          style: 'destructive',
          onPress: deleteNativeAccount,
        },
      ]
    );
  }, [deleteNativeAccount, hasNativeSession]);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Image
            source={LOGO_IMAGE}
            style={styles.logo}
            resizeMode="contain"
            accessibilityLabel="WeddingWin.ca Canada"
          />
          <Text style={styles.title}>About WeddingWin</Text>
          <Text style={styles.body}>App version 1.0.0</Text>
        </View>

        <View style={styles.linkCard}>
          <Text style={styles.sectionTitle}>Support</Text>
          <LinkRow
            icon={<Mail size={20} color={BRAND_COLOR} strokeWidth={2} />}
            title="Contact WeddingWin"
            subtitle="info@weddingwin.ca"
            url="mailto:info@weddingwin.ca"
          />
        </View>

        <View style={styles.linkCard}>
          <Text style={styles.sectionTitle}>Legal</Text>
          <LinkRow
            icon={<Shield size={20} color={BRAND_COLOR} strokeWidth={2} />}
            title="Privacy Policy"
            subtitle="How WeddingWin handles your data"
            url={`${SITE_URL}/about/privacy`}
          />
          <View style={styles.divider} />
          <LinkRow
            icon={<Mail size={20} color={BRAND_COLOR} strokeWidth={2} />}
            title="Privacy Request"
            subtitle="Access, correct, or delete your information"
            url={`${SITE_URL}/privacy-request`}
          />
          <View style={styles.divider} />
          <LinkRow
            icon={<FileText size={20} color={BRAND_COLOR} strokeWidth={2} />}
            title="Terms of Use"
            subtitle="Rules for using WeddingWin"
            url={`${SITE_URL}/about/terms`}
          />
          <View style={styles.divider} />
          <LinkRow
            icon={<FileText size={20} color={BRAND_COLOR} strokeWidth={2} />}
            title="Vendor Prize-Draw Official Rules"
            subtitle="A booth scan records only a visit; entering a vendor draw requires a separate optional opt-in"
            url={`${SITE_URL}/qr-bingo-vendor-draw-rules`}
          />
        </View>

        <View style={styles.linkCard}>
          <Text style={styles.sectionTitle}>Account Management</Text>
          <TouchableOpacity
            style={styles.row}
            activeOpacity={0.82}
            onPress={confirmDeleteAccount}
            disabled={deleting}
            accessibilityRole="button"
            accessibilityLabel="Delete account"
            accessibilityState={{ disabled: deleting }}>
            <View style={[styles.iconWrap, styles.deleteIconWrap]}>
              <Trash2 size={20} color="#9B3E36" strokeWidth={2} />
            </View>
            <View style={styles.rowText}>
              <Text style={[styles.rowTitle, styles.deleteTitle]}>Delete Account</Text>
              <Text style={styles.rowSub}>
                {hasNativeSession
                  ? 'Permanently delete your account and associated app data'
                  : 'Open the secure account deletion page'}
              </Text>
            </View>
            {deleting ? (
              <ActivityIndicator color="#9B3E36" />
            ) : (
              <ChevronRight size={20} color="#D1AAA5" strokeWidth={2} />
            )}
          </TouchableOpacity>
        </View>

        <Text style={styles.footerText}>WeddingWin Canada</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFF8F5',
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 22,
    paddingBottom: 36,
  },
  header: {
    minHeight: 148,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
    paddingVertical: 20,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#F0D5D1',
  },
  logo: {
    width: '82%',
    maxWidth: 260,
    height: 70,
  },
  title: {
    color: '#2E2E32',
    fontSize: 21,
    lineHeight: 26,
    fontWeight: '800',
    marginTop: 8,
    textAlign: 'center',
  },
  body: {
    color: '#8E7D7A',
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '700',
    marginTop: 4,
    textAlign: 'center',
  },
  linkCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 16,
    marginTop: 14,
    borderWidth: 1,
    borderColor: '#F0D5D1',
  },
  sectionTitle: {
    color: '#2E2E32',
    fontSize: 15,
    lineHeight: 19,
    fontWeight: '800',
    marginBottom: 8,
  },
  row: {
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
  },
  iconWrap: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#FFF1EF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 13,
  },
  deleteIconWrap: {
    backgroundColor: '#FFF1EE',
  },
  rowText: {
    flex: 1,
  },
  rowTitle: {
    color: '#2D2827',
    fontSize: 16,
    lineHeight: 20,
    fontWeight: '800',
  },
  rowSub: {
    color: '#8E7D7A',
    fontSize: 13,
    lineHeight: 17,
    fontWeight: '500',
    marginTop: 2,
  },
  deleteTitle: {
    color: '#9B3E36',
  },
  divider: {
    height: 1,
    backgroundColor: '#F4DFDC',
    marginLeft: 55,
  },
  footerText: {
    alignSelf: 'center',
    color: '#9B8583',
    fontSize: 12,
    fontWeight: '700',
    paddingTop: 20,
  },
});
