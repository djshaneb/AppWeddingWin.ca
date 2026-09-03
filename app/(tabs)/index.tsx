import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
} from 'react';
import {
  AccessibilityInfo,
  Alert,
  ActivityIndicator,
  AppState,
  Image,
  ImageBackground,
  Keyboard,
  Linking,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  Vibration,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  accountDeletionIsInFlight,
  accountMutationIsCurrent,
  getAccountDeletionGeneration,
  subscribeToAccountDeleted,
} from '@/lib/account_deletion_state';
import { mutateNativeSessionStorage } from '@/lib/native_session_storage';
import { useFocusEffect } from '@react-navigation/native';
import { useNavigation } from 'expo-router';
import { WebView, type WebViewNavigation } from 'react-native-webview';
import * as AuthSession from 'expo-auth-session';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';
import { File, Paths } from 'expo-file-system';
import {
  CameraView,
  useCameraPermissions,
  type BarcodeScanningResult,
} from 'expo-camera';
import Constants from 'expo-constants';
import { StatusBar } from 'expo-status-bar';
import { createAudioPlayer, setAudioModeAsync } from 'expo-audio';
import * as Haptics from 'expo-haptics';
import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import * as Notifications from 'expo-notifications';
import * as SecureStore from 'expo-secure-store';
import * as Sharing from 'expo-sharing';
import * as WebBrowser from 'expo-web-browser';
import DateTimePicker from '@react-native-community/datetimepicker';
import {
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Eye,
  Globe2,
  House,
  LayoutDashboard,
  LockKeyhole,
  LogOut,
  Mail,
  ImagePlus,
  MessageCircle,
  Phone,
  QrCode,
  ScanLine,
  Search,
  Store,
  TriangleAlert as AlertTriangle,
  X,
  UserPlus,
  UserRound,
} from 'lucide-react-native';
import {
  isWeddingWinHost,
  isWedWebsiteHost,
  qrPayloadUrlAllowed,
  webViewSubframeUrlAllowed,
  webViewUrlAction,
} from '../../lib/webview_url_policy';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

type ShouldStartLoadRequest = { url: string; isTopFrame: boolean };
type SignupRole = 'couple' | 'vendor';
type LoginCredentials = { email: string; password: string; role?: SignupRole };
type ContactProfile = {
  firstName: string;
  email: string;
  phone: string;
  weddingDate?: string;
};
type SignupConsent = {
  acceptedTerms: true;
  acceptedPrivacy: true;
  acceptedAt: string;
  termsVersion: string;
  privacyVersion: string;
};
type MemberSignup = ContactProfile & {
  password: string;
  role: SignupRole;
  consent: SignupConsent;
};
type NativeMember = {
  user_id?: string | number;
  subscription_id?: string | number;
  account_role?: SignupRole;
  role?: string;
  member_role?: string;
  member_type?: string;
  user_type?: string;
  first_name?: string;
  last_name?: string;
  email: string;
  company?: string;
  filename?: string;
  image_main_file?: string;
  phone_number?: string;
  city?: string;
  state_code?: string;
  country_code?: string;
  zip_code?: string;
  wedding_date?: string;
};
type NativeBridgeSession = {
  email?: string;
  user_id?: string | number;
  token?: string;
  cookie?: string;
};

function hasNativeBridgeSession(session?: NativeBridgeSession | null) {
  return !!session?.user_id && (!!session.token || !!session.cookie);
}

function hasNativeTokenSession(session?: NativeBridgeSession | null) {
  return !!session?.user_id && !!session.token;
}

type ChatStatus = {
  unread_count?: number;
  latest_label?: string;
  inbox_path?: string;
};
type NativeChatThread = {
  id: string;
  token: string;
  thread_id?: string;
  request_uri?: string;
  title: string;
  avatar_url?: string;
  subtitle: string;
  updated_at: string;
  unread_count: number;
  reported?: boolean;
  closed?: boolean;
  report_notice?: string;
};
type NativeChatMessage = {
  id: string;
  thread_token: string;
  owner: string;
  is_mine: boolean;
  status: number;
  content: string;
  image_urls?: string[];
  avatar_url?: string;
  created_at: string;
  delivery_state?: 'stored' | 'delivered' | 'queued' | 'failed';
  delivery_error?: string;
};
type NativeChatSyncResponse = {
  ok?: boolean;
  error?: string;
  detail?: string;
  threads?: NativeChatThread[];
  selected_thread_token?: string;
  selected_thread_reported?: boolean;
  report_notice?: string;
  messages?: NativeChatMessage[];
  unread_count?: number;
  send_delivery_state?: 'stored' | 'delivered' | 'queued' | 'failed';
  send_delivery_error?: string;
  chat_images_enabled?: boolean;
  chat_images_notice?: string;
  sync_debug?: {
    member_id?: string;
    bd_threads?: number;
    app_threads?: number;
    visible_app_threads?: number;
  };
};
type NativeChatSyncAction =
  'list' | 'read' | 'send' | 'report' | 'open_vendor_profile';
type QrBingoVendor = {
  id: string;
  name: string;
  cover_photo?: string;
  full_filename?: string;
  user_id?: string;
};
type QrBingoEventConfig = {
  event_key: string;
  revision: number;
  event_name: string;
  venue_name: string;
  vendor_tag_id: number;
  app_card_enabled: boolean;
  scan_enabled: boolean;
  vendor_draws_enabled: boolean;
  email_delivery_mode: string;
  official_rules_url: string;
  rules_version: string;
  history_starts_at: string;
  entry_closes_at: string;
};
type QrBingoRaffleOffer = {
  app_review_fixture?: boolean;
  email_test_fixture?: boolean;
  outbound_email_suppressed?: boolean;
  vendor_offer_version: string;
  vendor_id: string;
  vendor_name: string;
  vendor_business_name?: string;
  vendor_profile_url?: string;
  prize_title: string;
  prize_description?: string;
  prize_approx_value_cad?: number;
  prize_count?: number;
  max_winners?: number;
  exclude_previous_winners?: boolean;
  eligibility_region?: string;
  entry_opens_at?: string;
  entry_closes_at?: string;
  draw_at?: string;
  entry_limit?: string;
  odds_basis?: string;
  no_purchase_required?: boolean;
  skill_testing_question_required?: boolean;
  alternate_free_entry_url?: string;
  eligibility_exclusions?: string;
  terms_url: string;
  consent_version: string;
  entrant_share_fields?: string[];
  administrator_name?: string;
  co_sponsor_name?: string;
  prize_provider_name?: string;
  participant_responsibility_disclosure?: string;
  apple_non_sponsor_disclaimer?: string;
};
type QrBingoSyncResponse = {
  ok?: boolean;
  code?: string;
  error?: string;
  detail?: string;
  profile_complete?: boolean;
  missing_profile_fields?: string[];
  profile_edit_url?: string;
  participation_notice_version?: string;
  app_review_fixture?: boolean;
  email_test_fixture?: boolean;
  event_config?: QrBingoEventConfig | null;
  vendors?: QrBingoVendor[];
  scanned?: string[];
  scanned_count?: number;
  total_count?: number;
  matched_vendor?: QrBingoVendor;
  raffle_offer?: QrBingoRaffleOffer | null;
  completed?: boolean;
};
type QrBingoPublicConfigResponse = {
  ok?: boolean;
  error?: string;
  event_config?: QrBingoEventConfig | null;
};
type QrBingoRaffleSettings = {
  enabled: boolean;
  prize_title: string;
  prize_description: string;
  prize_approx_value_cad?: number | null;
  max_winners?: number;
  exclude_previous_winners?: boolean;
  eligibility_region?: string;
  entry_closes_at?: string;
  draw_at?: string;
  odds_basis?: string;
  no_purchase_required?: boolean;
  skill_testing_question_required?: boolean;
  alternate_free_entry_url?: string;
  legal_terms_accepted: boolean;
  legal_terms_version?: string;
  rules_viewed_at?: string;
  draw_opens_at: string;
  updated_at?: string;
};
type QrBingoRaffleEntry = {
  participant_reference: string;
  couple_name: string;
  couple_email: string;
  couple_phone: string;
  couple_wedding_date: string;
  entry_method?: string;
  rules_version?: string;
  entered_at?: string;
  included: boolean;
  exclusion_reason?: string;
  pool_status?:
    | 'included'
    | 'excluded'
    | 'already_selected'
    | 'previous_winner'
    | 'disqualified'
    | 'reacceptance_required'
    | 'in_person_scan_required';
  pool_status_reason?: string;
  selection_status?: string;
  previous_winner?: boolean;
  selection_eligible?: boolean;
  in_selection_pool?: boolean;
  can_update?: boolean;
  consented_at?: string;
  created_at?: string;
};
type QrBingoRaffleDraw = {
  id: string;
  winner_name: string;
  winner_email: string;
  winner_phone?: string;
  winner_wedding_date?: string;
  prize_title: string;
  draw_number: number;
  draw_reason: string;
  drawn_at: string;
  email_error?: string;
  selection_status?: 'legacy' | 'potential' | 'verified' | 'disqualified';
  eligibility_verified_at?: string;
  skill_question_verified_at?: string;
  verified_at?: string;
  winner_rules_confirmed_at?: string;
  skill_question_prompt?: string;
  vendor_email_sent_at?: string;
  couple_email_sent_at?: string;
  notice_pending?: boolean;
  notice_complete?: boolean;
  can_send_notice?: boolean;
  can_test_suppressed_notice?: boolean;
};
type QrBingoVendorRaffleResponse = {
  ok?: boolean;
  error?: string;
  detail?: string;
  message?: string;
  conflict?: boolean;
  event_key?: string;
  event_revision?: number;
  vendor?: QrBingoVendor;
  settings?: QrBingoRaffleSettings;
  entries?: QrBingoRaffleEntry[];
  draw?: QrBingoRaffleDraw;
  draws?: QrBingoRaffleDraw[];
  can_draw?: boolean;
  max_draws?: number;
  draws_remaining?: number;
  draw_limit_reached?: boolean;
  entry_count?: number;
  entrant_count?: number;
  selection_pool_count?: number;
  excluded_count?: number;
  max_winners?: number;
  active_winner_count?: number;
  verified_winner_count?: number;
  remaining_winner_slots?: number;
  eligible_entry_count?: number;
  included_entry_count?: number;
  excluded_entry_count?: number;
  historical_entry_count?: number;
  selection_in_progress?: boolean;
  can_update_entries?: boolean;
  material_terms_locked?: boolean;
  can_send_verified_winner_notice?: boolean;
  can_test_suppressed_notice?: boolean;
  verified_potential_winner_notice_pending?: boolean;
  outbound_email_enabled?: boolean;
  app_review_fixture?: boolean;
  email_test_fixture?: boolean;
  outbound_email_suppressed?: boolean;
  suppressed?: boolean;
  suppressed_test_complete?: boolean;
  draw_opens_at?: string;
  entry_closes_at?: string;
  draw_at?: string;
  eligibility_region?: string;
  odds_basis?: string;
  no_purchase_required?: boolean;
  skill_testing_question_required?: boolean;
  alternate_free_entry_url?: string;
  terms_url?: string;
  rules_version?: string;
  rules_current?: boolean;
  vendor_acceptance_current?: boolean;
  couple_email_subject?: string;
  administrator_name?: string;
  co_sponsor_name?: string;
  prize_provider_name?: string;
  vendor_responsibility_disclosure?: string;
  apple_non_sponsor_disclaimer?: string;
  email_result?: {
    vendor?: { sent?: boolean; already_sent?: boolean; error?: string };
    couple?: { sent?: boolean; already_sent?: boolean; error?: string };
    complete?: boolean;
    suppressed?: boolean;
    vendor_sent?: boolean;
    couple_sent?: boolean;
    error?: string;
  };
  report?: {
    filename: string;
    mime_type: string;
    generated_at: string;
    row_count: number;
    csv: string;
    contains_contact_data: true;
    contact_share_scope: 'named_vendor_draw_administration';
    marketing_consent_included: true;
    report_kind: 'named_vendor_draw_contacts';
    rules_version: string;
    event_key: string;
    event_revision: number;
    vendor_bingo_id: string;
    vendor_bd_user_id: string;
    vendor_name: string;
    purpose: string;
  };
};
type CompleteQrBingoVendorRaffleResponse = QrBingoVendorRaffleResponse & {
  vendor: QrBingoVendor;
  settings: QrBingoRaffleSettings;
  rules_version: string;
};

function isCompleteVendorRaffleDashboard(
  value: QrBingoVendorRaffleResponse | null | undefined,
): value is CompleteQrBingoVendorRaffleResponse {
  return Boolean(value?.vendor && value?.settings && value?.rules_version);
}
type VendorRaffleWizardStep = 1 | 2 | 3 | 4;
type QrScanFeedbackTone = 'idle' | 'success' | 'duplicate' | 'error';

const TARGET_URL = 'https://www.weddingwin.ca';
const WEBSITE_LOGOUT_URL = `${TARGET_URL}/account/logout`;
const DEFAULT_BRIDGE_TARGET_PATH = '/account/home';
const COUPLE_MEMBERSHIP_PLAN_ID = '18';
const VENDOR_MEMBERSHIP_PLAN_ID = '17';
const VENDOR_MEMBERSHIP_PLAN_IDS = new Set(['17', '27', '28']);
const TERMS_URL = `${TARGET_URL}/about/terms`;
const PRIVACY_URL = `${TARGET_URL}/about/privacy`;
const TERMS_VERSION = '2026-09-01';
const PRIVACY_VERSION = '2026-09-01';
const APP_BACKEND_URL = 'https://pszcjoyabwvzsxxjtkhs.supabase.co';
const APP_BACKEND_PUBLISHABLE_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBzemNqb3lhYnd2enN4eGp0a2hzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg2OTMxMTYsImV4cCI6MjA5NDI2OTExNn0.QLCEmNcn1WAks0IHkCLmI3iY5K4GnRxZ9Sfy89GYrLo';
const QR_BINGO_SYNC_FUNCTION_URL = `${APP_BACKEND_URL}/functions/v1/bd-qr-bingo-sync`;
const QR_BINGO_PUBLIC_CONFIG_URL = `${APP_BACKEND_URL}/functions/v1/bd-qr-bingo-admin?action=public_config`;
const VENDOR_RAFFLE_FUNCTION_URL = `${APP_BACKEND_URL}/functions/v1/bd-qr-bingo-vendor-sync`;
const QR_BINGO_REQUEST_TIMEOUT_MS = 12000;
const QR_BINGO_MENU_CONFIG_REFRESH_MS = 60_000;
const BRAND_COLOR = '#C66A6A';
const OAUTH_RETURN_URL = 'https://www.weddingwin.ca/auth-callback';
const APP_UA_TAG = 'WeddingWinApp/1.0';
const NATIVE_MEMBER_SESSION_KEY = 'weddingwin.nativeMember.v1';
const NATIVE_BRIDGE_SESSION_KEY = 'weddingwin.nativeBridgeSession.v1';
const CHAT_UNREAD_SESSION_KEY = 'weddingwin.chatUnread.v1';
const PUSH_TOKEN_SESSION_KEY = 'weddingwin.expoPushToken.v1';
const PENDING_PUSH_UNREGISTER_KEY = 'weddingwin.pendingPushUnregister.v1';
const ACCOUNT_DELETED_EVENT_KEY = 'weddingwin.accountDeleted.v1';
const QR_BINGO_PARTICIPATION_NOTICE_VERSION = '2026-09-01-in-person-entry';
const VENDOR_RAFFLE_WIZARD_STEPS = [
  { id: 1, label: 'Prize' },
  { id: 2, label: 'Rules & Open' },
  { id: 3, label: 'Couples' },
  { id: 4, label: 'Winner' },
] as const satisfies readonly { id: VendorRaffleWizardStep; label: string }[];
const CHAT_STATUS_POLL_MS = 30000;
const CHAT_REQUEST_TIMEOUT_MS = 18000;
const APP_REQUEST_TIMEOUT_MS = 18000;
const WEBSITE_BRIDGE_REQUEST_TIMEOUT_MS = 12000;
const CHAT_IMAGE_MAX_DATA_URI_LENGTH = 320_000;
const CHAT_IMAGE_PREPARE_OPTIONS = [
  { maxSide: 1600, compress: 0.72 },
  { maxSide: 1200, compress: 0.58 },
  { maxSide: 960, compress: 0.48 },
  { maxSide: 720, compress: 0.42 },
] as const;
const DEFAULT_CHAT_INBOX_PATH = '/account/chat_messages';
const CHAT_REPORTED_NOTICE =
  'Member blocked: This conversation is closed and future messages from this member will not appear while WeddingWin reviews your report.';
const CHAT_IMAGES_DISABLED_NOTICE =
  'Photo sharing is temporarily unavailable while WeddingWin completes image-safety review. Text messages are still available.';
const CHAT_DING_SOUND = require('../../assets/sounds/chat-ding.wav');
const QR_VENDOR_DRAW_MOBILE_SLIDES = [
  {
    source: require('../../assets/images/qr-bingo/vendor-draw-mobile/vendor-draw-mobile-slide-01.webp'),
    accessibilityLabel:
      'Step 1 of 5, scan the booth QR. Couples scan your QR Bingo sign right at your booth.',
  },
  {
    source: require('../../assets/images/qr-bingo/vendor-draw-mobile/vendor-draw-mobile-slide-02.webp'),
    accessibilityLabel:
      'Step 2 of 5, couples choose to enter. Couples can opt in to your draw.',
  },
  {
    source: require('../../assets/images/qr-bingo/vendor-draw-mobile/vendor-draw-mobile-slide-03.webp'),
    accessibilityLabel:
      'Step 3 of 5, download your entrant list. Couples who enter share their contact information, which you may use for the draw and wedding-related marketing.',
  },
  {
    source: require('../../assets/images/qr-bingo/vendor-draw-mobile/vendor-draw-mobile-slide-04.webp'),
    accessibilityLabel:
      'Step 4 of 5, select a potential winner. After entries close, use the random-selection tool. This does not award the prize yet.',
  },
  {
    source: require('../../assets/images/qr-bingo/vendor-draw-mobile/vendor-draw-mobile-slide-05.webp'),
    accessibilityLabel:
      'Step 5 of 5, confirm and fulfill. Ensure the couple meets the draw rules, send the WeddingWin.ca winner notice, and provide the prize.',
  },
];
const CHAT_INBOX_PATHS = new Set([
  '/account/chat_messages',
  '/account/chat/messages',
]);

async function fetchAppJsonWithTimeout<T>(
  url: string,
  init: RequestInit,
  timeoutMessage: string,
  timeoutMs = APP_REQUEST_TIMEOUT_MS,
): Promise<{ response: Response; data: T }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    const data = (await response.json().catch(() => null)) as T;
    return { response, data };
  } catch (error) {
    if (controller.signal.aborted) throw new Error(timeoutMessage);
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchQrBingoJsonWithTimeout<T>(
  url: string,
  init: RequestInit,
  timeoutMessage: string,
): Promise<{ response: Response; data: T }> {
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    QR_BINGO_REQUEST_TIMEOUT_MS,
  );

  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    const data = (await response.json()) as T;
    return { response, data };
  } catch (error) {
    if (controller.signal.aborted) throw new Error(timeoutMessage);
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
// Immutable compatibility map from the original active tag-27 roster sorted by
// BD user_id. Only vendors that are also active in the October tag-30 roster
// are accepted; tag-30-only member 37878 never had an NWS25 code.
const LEGACY_NWS25_VENDOR_IDS: Readonly<Record<string, string>> = Object.freeze(
  {
    'NWS25-002': '16849',
    'NWS25-009': '27768',
    'NWS25-010': '29211',
    'NWS25-011': '29215',
    'NWS25-013': '31521',
    'NWS25-026': '38085',
    'NWS25-030': '38117',
    'NWS25-031': '38118',
    'NWS25-032': '38140',
    'NWS25-039': '38290',
    'NWS25-066': '38519',
  },
);
const BD_GOOGLE_RETURN_PATH = 'bd-login';
const TAB_BAR_STYLE = {
  backgroundColor: '#FFF8F5',
  borderTopWidth: 0.5,
  borderTopColor: '#F0D5D1',
  height: Platform.OS === 'ios' ? 88 : 64,
  paddingTop: 8,
  paddingBottom: Platform.OS === 'ios' ? 28 : 8,
};

function isOAuthStartUrl(url: string): boolean {
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase();
    const backendHost = new URL(APP_BACKEND_URL).hostname.toLowerCase();
    if (
      u.protocol === 'https:' &&
      host === backendHost &&
      u.pathname.startsWith('/auth/v1/authorize')
    ) {
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

function isTrustedWebsiteBridgeUrl(url: unknown): boolean {
  try {
    return new URL(String(url || '')).origin === new URL(TARGET_URL).origin;
  } catch {
    return false;
  }
}

function isOneTimeAppLoginUrl(url: unknown): boolean {
  try {
    const parsed = new URL(String(url || ''));
    return (
      isTrustedWebsiteBridgeUrl(parsed.toString()) &&
      parsed.pathname === '/app-login' &&
      /^[A-Za-z0-9_-]{43}$/.test(parsed.searchParams.get('code') || '')
    );
  } catch {
    return false;
  }
}

function isBdAppGoogleLoginUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return (
      u.protocol === 'https:' &&
      isWeddingWinHost(u.hostname) &&
      u.pathname === '/login' &&
      u.searchParams.get('ww_app_oauth') === '1'
    );
  } catch {
    return false;
  }
}

function isGoogleIdentityUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return (
      parsed.protocol === 'https:' &&
      parsed.hostname.toLowerCase() === 'accounts.google.com'
    );
  } catch {
    return false;
  }
}

function membershipPlanForRole(role: SignupRole) {
  return role === 'vendor'
    ? VENDOR_MEMBERSHIP_PLAN_ID
    : COUPLE_MEMBERSHIP_PLAN_ID;
}

function buildNativeGoogleStartUrl(
  returnUrl: string,
  role: SignupRole,
  codeChallenge: string,
  consent?: SignupConsent,
): string {
  const url = new URL('/auth/google-start', TARGET_URL);
  url.searchParams.set('redirect_to', returnUrl);
  url.searchParams.set('subscription_id', membershipPlanForRole(role));
  url.searchParams.set('code_challenge', codeChallenge);
  if (consent) {
    url.searchParams.set('accepted_terms', '1');
    url.searchParams.set('accepted_privacy', '1');
    url.searchParams.set('accepted_at', consent.acceptedAt);
    url.searchParams.set('terms_version', consent.termsVersion);
    url.searchParams.set('privacy_version', consent.privacyVersion);
  }
  return url.toString();
}

function base64UrlFromBytes(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return globalThis
    .btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

async function createGooglePkcePair() {
  const codeVerifier = base64UrlFromBytes(await Crypto.getRandomBytesAsync(32));
  const base64Challenge = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    codeVerifier,
    { encoding: Crypto.CryptoEncoding.BASE64 },
  );
  return {
    codeVerifier,
    codeChallenge: base64Challenge
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, ''),
  };
}

const IOS_USER_AGENT =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1 ' +
  APP_UA_TAG;
const ANDROID_USER_AGENT =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36 ' +
  APP_UA_TAG;

const USER_AGENT =
  Platform.OS === 'android' ? ANDROID_USER_AGENT : IOS_USER_AGENT;
const HERO_IMAGE = {
  uri: `${TARGET_URL}/images/Happy-Couple-on-Wedding-Day_1.jpg`,
} as const;
const LOGO_IMAGE = {
  uri: `${TARGET_URL}/images/CoralLogoTransB.png`,
} as const;
const COUPLE_MENU_WEBSITE_AI_IMAGE = require('../../assets/images/couple-menu/ai-website-builder.webp');
const COUPLE_MENU_VENDOR_AI_IMAGE = require('../../assets/images/couple-menu/ai-vendor-search.webp');
const COUPLE_MENU_MESSAGES_AI_IMAGE = require('../../assets/images/couple-menu/ai-private-messages.webp');
const COUPLE_MENU_QR_AI_IMAGE = require('../../assets/images/couple-menu/ai-qr-bingo.webp');
const VENDOR_MENU_DASHBOARD_AI_IMAGE = require('../../assets/images/couple-menu/ai-vendor-dashboard-small.png');

const CLOAK_INJECTION = `
(function() {
  try {
    var isOwnSite = false;
    var isSupabase = false;
    try {
      isOwnSite = /(^|\\.)weddingwin\\.ca$/i.test(window.location.hostname);
      isSupabase = /(^|\\.)supabase\\.co$/i.test(window.location.hostname);
    } catch(e) {}

    if (isOwnSite) {
      try {
        var hideWrappedAuthMenuItems = function() {
          var selector = [
            '#link450-mobile',
            '#link453-mobile',
            '#link450',
            '#link453',
            '.sidebar-nav a[href="/sign-up"]',
            '.sidebar-nav a[href="/login"]',
            '.tablet-menu-ul a[href="/sign-up"]',
            '.tablet-menu-ul a[href="/login"]'
          ].join(',');
          document.querySelectorAll(selector).forEach(function(link) {
            var menuItem = link.closest ? link.closest('li') : link.parentElement;
            if (!menuItem) return;
            menuItem.setAttribute('data-ww-app-hidden-auth-menu-item', '1');
            menuItem.style.setProperty('display', 'none', 'important');
          });
        };
        var authMenuCleanupQueued = false;
        var scheduleAuthMenuCleanup = function() {
          if (authMenuCleanupQueued) return;
          authMenuCleanupQueued = true;
          window.requestAnimationFrame(function() {
            authMenuCleanupQueued = false;
            hideWrappedAuthMenuItems();
          });
        };

        hideWrappedAuthMenuItems();
        document.addEventListener('DOMContentLoaded', hideWrappedAuthMenuItems);
        if (document.documentElement) {
          var authMenuObserver = new MutationObserver(scheduleAuthMenuCleanup);
          authMenuObserver.observe(document.documentElement, { childList: true, subtree: true });
        }
      } catch(e) {}

      try {
        var blockMetaPixelScript = function(value) {
          return /connect\\.facebook\\.net\\/.*fbevents\\.js/i.test(String(value || ''));
        };
        var noopFbq = function(){};
        noopFbq.callMethod = function(){};
        noopFbq.queue = [];
        noopFbq.loaded = true;
        window.fbq = noopFbq;
        window._fbq = noopFbq;

        var nativeCreateElement = document.createElement.bind(document);
        document.createElement = function(tagName) {
          var element = nativeCreateElement(tagName);
          if (String(tagName || '').toLowerCase() === 'script') {
            var nativeSetAttribute = element.setAttribute.bind(element);
            Object.defineProperty(element, 'src', {
              configurable: true,
              get: function() {
                return element.getAttribute('src') || '';
              },
              set: function(value) {
                if (blockMetaPixelScript(value)) {
                  nativeSetAttribute('data-ww-app-blocked-src', String(value));
                  return;
                }
                nativeSetAttribute('src', value);
              }
            });
            element.setAttribute = function(name, value) {
              if (String(name || '').toLowerCase() === 'src' && blockMetaPixelScript(value)) {
                nativeSetAttribute('data-ww-app-blocked-src', String(value));
                return;
              }
              return nativeSetAttribute(name, value);
            };
          }
          return element;
        };
      } catch(e) {}

      var notifyAppLogout = function() {
        try {
          window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify({
            type: 'bd-app-logout'
          }));
        } catch(e) {}
      };

      var isLogoutHref = function(href) {
        try {
          var logoutUrl = new URL(href, window.location.href);
          var path = logoutUrl.pathname.replace(/\\/+$/, '') || '/';
          return path === '/logout' ||
            path === '/account/logout' ||
            logoutUrl.searchParams.has('logout') ||
            logoutUrl.searchParams.has('ww_app_logout');
        } catch(e) {
          return false;
        }
      };

      try {
        var params = new URLSearchParams(window.location.search || '');
        if (params.has('ww_app_logout')) {
          try { window.localStorage && window.localStorage.clear(); } catch(e) {}
          try { window.sessionStorage && window.sessionStorage.clear(); } catch(e) {}
          notifyAppLogout();
        }
      } catch(e) {}

      try {
        document.addEventListener('click', function(event) {
          var el = event.target;
          while (el && el !== document) {
            if (el.tagName === 'A' && isLogoutHref(el.getAttribute('href') || '')) {
              try { window.localStorage && window.localStorage.clear(); } catch(e) {}
              try { window.sessionStorage && window.sessionStorage.clear(); } catch(e) {}
              notifyAppLogout();
              break;
            }
            el = el.parentElement;
          }
        }, true);
      } catch(e) {}
    }

    if (isSupabase) {
      try {
        window.open = function(url) {
          try { if (url) window.location.href = url; } catch(e) {}
          return {
            closed: false,
            focus: function(){},
            blur: function(){},
            close: function(){ this.closed = true; },
            postMessage: function(){},
            location: { href: '', replace: function(u){ if(u) window.location.href = u; } },
            document: { write: function(){}, close: function(){} }
          };
        };
      } catch(e) {}
    }

    var ensureInline = function(v) {
      v.setAttribute('playsinline', '');
      v.setAttribute('webkit-playsinline', '');
      v.removeAttribute('autoplay');
      v.autoplay = false;
    };
    var applyToVideos = function(root) {
      try { (root || document).querySelectorAll('video').forEach(ensureInline); } catch(e) {}
    };
    document.addEventListener('DOMContentLoaded', function() { applyToVideos(); });
    try {
      var obs = new MutationObserver(function(muts) {
        muts.forEach(function(m) {
          m.addedNodes && m.addedNodes.forEach(function(n) {
            if (n.nodeType === 1) {
              if (n.tagName === 'VIDEO') ensureInline(n);
              if (n.querySelectorAll) applyToVideos(n);
            }
          });
        });
      });
      obs.observe(document.documentElement, { childList: true, subtree: true });
    } catch(e) {}

    try {
      Object.defineProperty(navigator, 'webdriver', { get: function(){ return false; } });
    } catch(e) {}
    try {
      Object.defineProperty(navigator, 'plugins', { get: function(){ return [1,2,3,4,5]; } });
    } catch(e) {}
    try {
      Object.defineProperty(navigator, 'languages', { get: function(){ return ['en-US','en']; } });
    } catch(e) {}
    try {
      window.chrome = window.chrome || { runtime: {} };
    } catch(e) {}
    try {
      var origQuery = window.navigator.permissions && window.navigator.permissions.query;
      if (origQuery) {
        window.navigator.permissions.query = function(p) {
          if (p && p.name === 'notifications') {
            return Promise.resolve({ state: Notification.permission });
          }
          return origQuery.call(window.navigator.permissions, p);
        };
      }
    } catch(e) {}
  } catch(e) {}
})();
true;
`;

function isWeddingWinLoggedOutUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    const path = parsed.pathname.replace(/\/+$/, '') || '/';

    if (parsed.protocol !== 'https:' || !isWeddingWinHost(host)) return false;

    return (
      path === '/login' ||
      path === '/logout' ||
      path === '/account/logout' ||
      parsed.searchParams.has('logout')
    );
  } catch {
    return false;
  }
}

function isWeddingWinLogoutActionUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    const path = parsed.pathname.replace(/\/+$/, '') || '/';

    if (parsed.protocol !== 'https:' || !isWeddingWinHost(host)) return false;

    return (
      path === '/logout' ||
      path === '/account/logout' ||
      parsed.searchParams.has('logout') ||
      parsed.searchParams.has('ww_app_logout')
    );
  } catch {
    return false;
  }
}

function getWeddingWinPath(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' || !isWeddingWinHost(parsed.hostname))
      return '';
    return parsed.pathname.replace(/\/+$/, '') || '/';
  } catch {
    return '';
  }
}

function isWedWebsiteUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' && isWedWebsiteHost(parsed.hostname);
  } catch {
    return false;
  }
}

function isChatInboxPath(path: string): boolean {
  const normalized = path.replace(/\/+$/, '') || '/';
  return [...CHAT_INBOX_PATHS].some(
    (inboxPath) =>
      normalized === inboxPath || normalized.startsWith(`${inboxPath}/view/`),
  );
}

function chatThreadTokenFromPath(path: string): string {
  const normalized = path.replace(/\/+$/, '') || '/';
  for (const inboxPath of CHAT_INBOX_PATHS) {
    const prefix = `${inboxPath}/view/`;
    if (!normalized.startsWith(prefix)) continue;
    try {
      return decodeURIComponent(
        normalized.slice(prefix.length).split('/')[0] || '',
      ).trim();
    } catch {
      return '';
    }
  }
  return '';
}

function isVendorConnectPath(path: string): boolean {
  const parts = path
    .replace(/^\/+|\/+$/g, '')
    .split('/')
    .filter(Boolean);
  return parts.length >= 2 && parts[parts.length - 1] === 'connect';
}

function vendorNameFromConnectUrl(url: string): string {
  try {
    const parsed = new URL(url, TARGET_URL);
    const parts = parsed.pathname
      .replace(/^\/+|\/+$/g, '')
      .split('/')
      .filter(Boolean);
    const slug = parts[parts.length - 2] || '';
    if (!slug) return 'this vendor';
    return slug
      .split('-')
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');
  } catch {
    return 'this vendor';
  }
}

function normalizeWeddingDate(value: unknown): string {
  const candidate = String(value || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(candidate)) return '';

  const [year, month, day] = candidate.split('-').map(Number);
  if (year < 1900 || month < 1 || month > 12 || day < 1 || day > 31) return '';

  const parsed = new Date(year, month - 1, day);
  if (
    parsed.getFullYear() !== year ||
    parsed.getMonth() !== month - 1 ||
    parsed.getDate() !== day
  ) {
    return '';
  }
  return candidate;
}

function normalizeMemberRole(value: unknown): SignupRole | null {
  const role = String(value || '')
    .trim()
    .toLowerCase();
  if (!role) return null;
  if (/^(couple|couples|bride|groom|engaged|wedding couple)$/.test(role))
    return 'couple';
  if (/^(vendor|business|professional|wedding vendor)$/.test(role))
    return 'vendor';
  return null;
}

function memberAccountRole(
  member: NativeMember | null,
  fallbackRole: SignupRole = 'couple',
): SignupRole {
  if (!member) return fallbackRole;

  const planId = String(member.subscription_id ?? '').trim();
  if (planId === COUPLE_MEMBERSHIP_PLAN_ID) return 'couple';
  if (VENDOR_MEMBERSHIP_PLAN_IDS.has(planId)) return 'vendor';

  const explicitRole = [
    member.account_role,
    member.role,
    member.member_role,
    member.member_type,
    member.user_type,
  ]
    .map(normalizeMemberRole)
    .find((role): role is SignupRole => role !== null);
  if (explicitRole) return explicitRole;

  if (String(member.company || '').trim()) return 'vendor';
  if (normalizeWeddingDate(member.wedding_date)) return 'couple';
  if (
    String(member.first_name || '')
      .trim()
      .toLowerCase() === 'weddingwin couple'
  ) {
    return 'couple';
  }

  // Unknown/missing plan data must not silently grant vendor-only UI. The
  // selected login role is persisted as account_role whenever it is available.
  return fallbackRole;
}

function withMemberRole(
  member: NativeMember,
  fallbackRole: SignupRole,
): NativeMember {
  return {
    ...member,
    account_role: memberAccountRole(member, fallbackRole),
  };
}

function isCoupleAccount(member: NativeMember | null): boolean {
  return !!member && memberAccountRole(member) === 'couple';
}

function isApplePrivateRelayEmail(email?: string): boolean {
  return String(email || '')
    .trim()
    .toLowerCase()
    .endsWith('@privaterelay.appleid.com');
}

function isValidEmail(email: string): boolean {
  const clean = email.trim().toLowerCase();
  return (
    clean.length <= 254 &&
    !/[<>\s]/.test(clean) &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean)
  );
}

function isValidContactPhone(phone: unknown): boolean {
  const value = String(phone || '').trim();
  if (!value || /[<>]/.test(value)) return false;
  const digits = value.replace(/\D/g, '');
  return digits.length >= 7 && digits.length <= 15;
}

const RESERVED_QR_CONTACT_NAMES = new Set([
  'couple',
  'weddingwin',
  'weddingwin couple',
]);

function isReservedQrContactName(name: unknown): boolean {
  const normalizedName = String(name || '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
  return RESERVED_QR_CONTACT_NAMES.has(normalizedName);
}

function editableQrProfileFirstName(
  firstNameValue: unknown,
  lastNameValue: unknown,
): string {
  const firstName = String(firstNameValue || '').trim();
  const fullName = [firstName, String(lastNameValue || '').trim()]
    .filter(Boolean)
    .join(' ');
  return isReservedQrContactName(fullName) ? '' : firstName;
}

function missingQrContactFields(member: NativeMember | null): string[] {
  if (!member) return ['name', 'email', 'phone number'];
  const firstName = String(member.first_name || '').trim();
  const displayName = [firstName, String(member.last_name || '').trim()]
    .filter(Boolean)
    .join(' ');
  const missing: string[] = [];
  if (!displayName || isReservedQrContactName(displayName)) {
    missing.push('name');
  }
  if (!isValidEmail(String(member.email || ''))) missing.push('email');
  if (!isValidContactPhone(member.phone_number)) missing.push('phone number');
  return missing;
}

function formatWeddingDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

const PROMOTION_TIME_ZONE = 'America/Toronto';
const promotionDateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: PROMOTION_TIME_ZONE,
  year: 'numeric',
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
  timeZoneName: 'short',
});
const qrMenuDateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: PROMOTION_TIME_ZONE,
  weekday: 'long',
  year: 'numeric',
  month: 'long',
  day: 'numeric',
});

function formatPromotionDate(value?: string): string {
  const date = new Date(value || '');
  if (!Number.isFinite(date.getTime())) return 'See official rules';
  const easternDate = promotionDateFormatter
    .format(date)
    .replace(/(?:GMT|UTC)\s*[−-]0?4(?::?00)?/i, 'EDT')
    .replace(/(?:GMT|UTC)\s*[−-]0?5(?::?00)?/i, 'EST');
  return /\b(?:EST|EDT)\b/.test(easternDate)
    ? `${easternDate} (ET)`
    : `${easternDate} ET`;
}

function formatQrMenuDate(value?: string): string {
  const date = new Date(value || '');
  return Number.isFinite(date.getTime())
    ? qrMenuDateFormatter.format(date)
    : '';
}

function isValidIsoCalendarDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function normalizeRaffleMaxWinners(value: unknown): 1 | 2 | 3 {
  const parsed = Number(value);
  if (parsed === 2 || parsed === 3) return parsed;
  return 1;
}

function normalizeCurrencyDraft(value: string): string {
  const cleaned = value.replace(/[^0-9.]/g, '');
  const dotIndex = cleaned.indexOf('.');
  if (dotIndex < 0) return cleaned;
  const whole = cleaned.slice(0, dotIndex) || '0';
  const fraction = cleaned
    .slice(dotIndex + 1)
    .replace(/\./g, '')
    .slice(0, 2);
  return `${whole}.${fraction}`;
}

function recommendedVendorRaffleWizardStep(
  data: QrBingoVendorRaffleResponse,
): VendorRaffleWizardStep {
  const settings = data.settings;
  const hasPrize = Boolean(
    settings?.prize_description?.trim() &&
    Number(settings?.prize_approx_value_cad) > 0,
  );
  const hasWinnerWork = Boolean(
    data.selection_in_progress ||
    data.verified_potential_winner_notice_pending ||
    (data.draws || []).some(
      (draw) =>
        draw.selection_status === 'potential' ||
        draw.selection_status === 'verified',
    ),
  );

  if (hasWinnerWork) return 4;
  if (!hasPrize) return 1;
  if (
    !settings?.legal_terms_accepted ||
    data.rules_current === false ||
    !settings.enabled
  )
    return 2;
  return 3;
}

function parseWeddingDate(value?: string): Date {
  const normalized = normalizeWeddingDate(value);
  if (normalized) {
    const [year, month, day] = normalized.split('-').map(Number);
    return new Date(year, month - 1, day);
  }
  const fallback = new Date();
  fallback.setMonth(fallback.getMonth() + 6);
  return fallback;
}

function normalizedVendorProfileUrl(value: unknown): string {
  const raw = String(value || '').trim();
  if (!raw) return '';

  try {
    const url = new URL(raw, TARGET_URL);
    if (!/^https?:$/.test(url.protocol)) return '';
    const host = url.hostname.toLowerCase().replace(/^www\./, '');
    const path = decodeURIComponent(url.pathname).replace(/\/+$/, '') || '/';
    return `${host}${path}`;
  } catch {
    return '';
  }
}

function addQrVendorToken(tokens: Set<string>, value: unknown) {
  let token = String(value || '').trim();
  if (!token) return;

  try {
    token = decodeURIComponent(token);
  } catch {
    // Keep malformed percent-encoded payloads usable as their literal value.
  }
  token = token.split(/[?#]/, 1)[0].trim();
  if (!token) return;

  tokens.add(token.toLowerCase());
}

function legacyQrVendorId(raw: string): string {
  const possibleValues = [raw];

  try {
    const url = new URL(raw);
    const pathParts = url.pathname.split('/').filter(Boolean);
    if (pathParts.length) possibleValues.push(pathParts[pathParts.length - 1]);
    ['vendor_id', 'vendor', 'id', 'code', 'qr'].forEach((key) => {
      const value = url.searchParams.get(key);
      if (value) possibleValues.push(value);
    });
  } catch {
    // Direct legacy payloads do not need URL parsing.
  }

  for (const value of possibleValues) {
    let token = String(value || '').trim();
    try {
      token = decodeURIComponent(token);
    } catch {
      // Keep malformed percent-encoded payloads usable as their literal value.
    }
    token = token.split(/[?#]/, 1)[0].trim();
    const match = token.match(/^nws25[-_:]\s*(\d{3})$/i);
    if (!match) continue;
    return LEGACY_NWS25_VENDOR_IDS[`NWS25-${match[1]}`] || '';
  }

  return '';
}

function qrVendorTokens(raw: string): Set<string> {
  const tokens = new Set<string>();
  addQrVendorToken(tokens, raw);

  try {
    const url = new URL(raw);
    const protocol = url.protocol.toLowerCase();
    if (protocol === 'nws:' && url.hostname.toLowerCase() === 'vendor') {
      addQrVendorToken(tokens, url.pathname.replace(/^\/+/, '').split('/')[0]);
    }

    ['vendor_id', 'vendor', 'id', 'code', 'qr'].forEach((key) => {
      addQrVendorToken(tokens, url.searchParams.get(key));
    });
  } catch {
    // Plain numeric, legacy, and nws:// prefix payloads are handled below.
  }

  const nwsPrefixMatch = raw.match(/^nws:\/\/vendor\/([^/?#]+)/i);
  if (nwsPrefixMatch) addQrVendorToken(tokens, nwsPrefixMatch[1]);

  return tokens;
}

function vendorIdentityTokens(vendor: QrBingoVendor): Set<string> {
  const tokens = new Set<string>();
  [vendor.id, vendor.user_id].forEach((value) => {
    const raw = String(value || '').trim();
    if (!raw) return;
    addQrVendorToken(tokens, value);
    const numeric = Number(raw);
    if (Number.isFinite(numeric)) tokens.add(String(numeric));
  });
  return tokens;
}

function matchQrBingoVendor(value: string, vendors: QrBingoVendor[]) {
  const raw = value.trim();
  if (!qrPayloadUrlAllowed(raw)) return null;

  const normalizedUrl = normalizedVendorProfileUrl(raw);

  const directUrlMatch = normalizedUrl
    ? vendors.find((vendor) => {
        const vendorUrl = normalizedVendorProfileUrl(vendor.full_filename);
        return vendorUrl === normalizedUrl;
      })
    : null;
  if (directUrlMatch) return directUrlMatch;

  // Printed NWS25 codes predate stable vendor IDs. Resolve only through the
  // frozen historical tag-27 map; the current tag-30 array order can change.
  const legacyVendorId = legacyQrVendorId(raw);
  if (legacyVendorId) {
    return (
      vendors.find((vendor) =>
        vendorIdentityTokens(vendor).has(legacyVendorId),
      ) || null
    );
  }

  const candidates = qrVendorTokens(raw);
  if (!candidates.size) return null;
  return (
    vendors.find((vendor) => {
      const identities = vendorIdentityTokens(vendor);
      return [...candidates].some((candidate) => identities.has(candidate));
    }) || null
  );
}

function normalizeQrBingoEventConfig(
  value: unknown,
): QrBingoEventConfig | null {
  if (!value || typeof value !== 'object') return null;
  const payload = value as Record<string, unknown>;
  const eventName =
    typeof payload.event_name === 'string'
      ? payload.event_name.replace(/\s+/g, ' ').trim().slice(0, 120)
      : '';
  if (!eventName) return null;

  const revision =
    typeof payload.revision === 'number' &&
    Number.isInteger(payload.revision) &&
    payload.revision >= 0
      ? payload.revision
      : 0;
  const vendorTagId =
    typeof payload.vendor_tag_id === 'number' &&
    Number.isInteger(payload.vendor_tag_id) &&
    payload.vendor_tag_id >= 0
      ? payload.vendor_tag_id
      : 0;
  const normalizedText = (candidate: unknown, max: number) =>
    typeof candidate === 'string' ? candidate.trim().slice(0, max) : '';
  const venueName = normalizedText(payload.venue_name, 160);
  const historyStartsAt = normalizedText(payload.history_starts_at, 80);
  const entryClosesAt = normalizedText(payload.entry_closes_at, 80);
  const historyStartsAtMs = new Date(historyStartsAt).getTime();
  const entryClosesAtMs = new Date(entryClosesAt).getTime();
  if (
    !venueName ||
    typeof payload.app_card_enabled !== 'boolean' ||
    typeof payload.scan_enabled !== 'boolean' ||
    !Number.isFinite(historyStartsAtMs) ||
    !Number.isFinite(entryClosesAtMs) ||
    historyStartsAtMs >= entryClosesAtMs
  )
    return null;

  return {
    event_key: normalizedText(payload.event_key, 160),
    revision,
    event_name: eventName,
    venue_name: venueName,
    vendor_tag_id: vendorTagId,
    app_card_enabled: payload.app_card_enabled,
    scan_enabled: payload.scan_enabled,
    vendor_draws_enabled: payload.vendor_draws_enabled === true,
    email_delivery_mode: normalizedText(payload.email_delivery_mode, 80),
    official_rules_url: normalizedText(payload.official_rules_url, 500),
    rules_version: normalizedText(payload.rules_version, 80),
    history_starts_at: historyStartsAt,
    entry_closes_at: entryClosesAt,
  };
}

function NativeQrScanner({
  visible,
  onClose,
  onScan,
  nativeSession,
  member,
  onCompleteContact,
}: {
  visible: boolean;
  onClose: () => void;
  onScan: (value: string) => void;
  nativeSession: NativeBridgeSession | null;
  member: NativeMember | null;
  onCompleteContact: () => void;
}) {
  const [permission, requestPermission] = useCameraPermissions();
  const requestCameraPermissionRef = useRef(requestPermission);
  const canRequestCameraPermission = Boolean(
    permission && !permission.granted && permission.canAskAgain,
  );
  const [scanLocked, setScanLocked] = useState(false);
  const [loadingBingo, setLoadingBingo] = useState(false);
  const [savingBingo, setSavingBingo] = useState(false);
  const [bingoError, setBingoError] = useState<string | null>(null);
  const [eventConfig, setEventConfig] = useState<QrBingoEventConfig | null>(
    null,
  );
  const [appReviewFixture, setAppReviewFixture] = useState(false);
  const [emailTestFixture, setEmailTestFixture] = useState(false);
  const [vendors, setVendors] = useState<QrBingoVendor[]>([]);
  const [bingoTotalCount, setBingoTotalCount] = useState<number | null>(null);
  const [scannedVendorIds, setScannedVendorIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [lastScanLabel, setLastScanLabel] = useState('');
  const [lastScanTone, setLastScanTone] = useState<QrScanFeedbackTone>('idle');
  const [raffleOffer, setRaffleOffer] = useState<QrBingoRaffleOffer | null>(
    null,
  );
  const [raffleSaving, setRaffleSaving] = useState(false);
  const [raffleRulesViewedVersion, setRaffleRulesViewedVersion] = useState('');
  const [ageOfMajorityAttested, setAgeOfMajorityAttested] = useState(false);
  const [residencyAttested, setResidencyAttested] = useState(false);
  const [exclusionsAttested, setExclusionsAttested] = useState(false);
  const [promotionResponsibilityAccepted, setPromotionResponsibilityAccepted] =
    useState(false);
  const [participationNoticeAccepted, setParticipationNoticeAccepted] =
    useState(false);
  const [participationNoticeLoading, setParticipationNoticeLoading] =
    useState(false);
  const [serverMissingContactFields, setServerMissingContactFields] = useState<
    string[]
  >([]);
  const [scanWindowNow, setScanWindowNow] = useState(() => Date.now());
  const scanFeedbackClearTimerRef = useRef<ReturnType<
    typeof setTimeout
  > | null>(null);
  const scanUnlockTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scanInFlightRef = useRef(false);
  const raffleOfferInFlightRef = useRef(false);
  const raffleEntryInFlightRef = useRef(false);
  const qrInteractionGenerationRef = useRef(0);
  const bingoCardRequestIdRef = useRef(0);
  const eventConfigRevision = eventConfig?.revision;
  const eventScanEnabled = eventConfig?.scan_enabled;
  const eventVendorDrawsEnabled = eventConfig?.vendor_draws_enabled;
  const scanOpensAt = new Date(
    String(eventConfig?.history_starts_at || ''),
  ).getTime();
  const scanClosesAt = new Date(
    String(eventConfig?.entry_closes_at || ''),
  ).getTime();
  const isolatedFixtureActive = emailTestFixture || appReviewFixture;
  const productionScanWindowOpen =
    Number.isFinite(scanOpensAt) &&
    Number.isFinite(scanClosesAt) &&
    scanWindowNow >= scanOpensAt &&
    scanWindowNow < scanClosesAt;
  const scanWindowClosed = Boolean(
    eventScanEnabled === true &&
    !isolatedFixtureActive &&
    !productionScanWindowOpen,
  );
  const localMissingContactFields = useMemo(
    () => missingQrContactFields(member),
    [member],
  );
  const missingContactFields =
    serverMissingContactFields.length > 0
      ? serverMissingContactFields
      : localMissingContactFields;
  const contactProfileComplete = missingContactFields.length === 0;
  const participationNoticeKey = useMemo(() => {
    const userId = String(
      member?.user_id || nativeSession?.user_id || '',
    ).trim();
    const rulesVersion = String(
      eventConfig?.rules_version || QR_BINGO_PARTICIPATION_NOTICE_VERSION,
    ).trim();
    return userId
      ? `weddingwin.qrParticipationNotice.${userId}.${rulesVersion}.${QR_BINGO_PARTICIPATION_NOTICE_VERSION}`
      : '';
  }, [eventConfig?.rules_version, member?.user_id, nativeSession?.user_id]);

  useEffect(() => {
    requestCameraPermissionRef.current = requestPermission;
  }, [requestPermission]);

  useEffect(() => {
    if (!visible) return;
    setScanWindowNow(Date.now());
    const timer = setInterval(() => setScanWindowNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, [visible]);

  useEffect(() => {
    setServerMissingContactFields([]);
  }, [
    member?.email,
    member?.first_name,
    member?.last_name,
    member?.phone_number,
    member?.user_id,
  ]);

  const resetEligibilityAttestations = useCallback(() => {
    setAgeOfMajorityAttested(false);
    setResidencyAttested(false);
    setExclusionsAttested(false);
    setPromotionResponsibilityAccepted(false);
  }, []);

  const clearBingoCardState = useCallback(() => {
    setEventConfig(null);
    setAppReviewFixture(false);
    setEmailTestFixture(false);
    setVendors([]);
    setBingoTotalCount(null);
    setScannedVendorIds(new Set());
  }, []);

  const clearScanFeedbackTimer = useCallback(() => {
    if (scanFeedbackClearTimerRef.current) {
      clearTimeout(scanFeedbackClearTimerRef.current);
      scanFeedbackClearTimerRef.current = null;
    }
  }, []);

  const showScanFeedback = useCallback(
    (label: string, tone: QrScanFeedbackTone, clearAfterMs?: number) => {
      clearScanFeedbackTimer();
      setLastScanLabel(label);
      setLastScanTone(tone);
      if (label) {
        AccessibilityInfo.announceForAccessibility(`QR scan result: ${label}`);
      }

      if (clearAfterMs) {
        scanFeedbackClearTimerRef.current = setTimeout(() => {
          setLastScanLabel('');
          setLastScanTone('idle');
          scanFeedbackClearTimerRef.current = null;
        }, clearAfterMs);
      }
    },
    [clearScanFeedbackTimer],
  );

  const loadBingoCard = useCallback(async () => {
    const requestId = bingoCardRequestIdRef.current + 1;
    bingoCardRequestIdRef.current = requestId;
    if (!nativeSession?.user_id || !nativeSession?.token) {
      clearBingoCardState();
      setLoadingBingo(false);
      setBingoError(
        'Sign in to your WeddingWin account before scanning booth QR codes.',
      );
      return;
    }
    if (!contactProfileComplete) {
      clearBingoCardState();
      setLoadingBingo(false);
      setBingoError(null);
      return;
    }

    setLoadingBingo(true);
    setBingoError(null);

    try {
      const { response, data } =
        await fetchQrBingoJsonWithTimeout<QrBingoSyncResponse>(
          QR_BINGO_SYNC_FUNCTION_URL,
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${APP_BACKEND_PUBLISHABLE_KEY}`,
              apikey: APP_BACKEND_PUBLISHABLE_KEY,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              action: 'list',
              native_session: nativeSession,
            }),
          },
          'QR Bingo took too long to load. Check your connection and try again.',
        );
      if (!response.ok || data?.ok === false) {
        throw new Error(
          data?.detail || data?.error || 'QR Bingo is unavailable right now.',
        );
      }
      if (requestId !== bingoCardRequestIdRef.current) return;

      if (data.profile_complete === false) {
        const missing = Array.isArray(data.missing_profile_fields)
          ? data.missing_profile_fields
              .map((field) => String(field || '').trim())
              .filter(Boolean)
          : ['name', 'email', 'phone number'];
        setServerMissingContactFields(
          missing.length > 0 ? missing : ['name', 'email', 'phone number'],
        );
        clearBingoCardState();
        setBingoError(null);
        return;
      }

      setServerMissingContactFields([]);
      setEventConfig(normalizeQrBingoEventConfig(data.event_config));
      setAppReviewFixture(data.app_review_fixture === true);
      setEmailTestFixture(data.email_test_fixture === true);
      setVendors(data.vendors || []);
      setBingoTotalCount(
        typeof data.total_count === 'number'
          ? data.total_count
          : data.vendors?.length || 0,
      );
      setScannedVendorIds(new Set((data.scanned || []).map(String)));
    } catch (error) {
      if (requestId !== bingoCardRequestIdRef.current) return;
      clearBingoCardState();
      setBingoError(
        error instanceof Error
          ? error.message
          : 'QR Bingo is unavailable right now.',
      );
    } finally {
      if (requestId === bingoCardRequestIdRef.current) setLoadingBingo(false);
    }
  }, [clearBingoCardState, contactProfileComplete, nativeSession]);

  useEffect(() => {
    qrInteractionGenerationRef.current += 1;
    if (scanUnlockTimerRef.current) {
      clearTimeout(scanUnlockTimerRef.current);
      scanUnlockTimerRef.current = null;
    }
    scanInFlightRef.current = false;
    raffleOfferInFlightRef.current = false;
    raffleEntryInFlightRef.current = false;
    setSavingBingo(false);
    setRaffleSaving(false);
    if (!visible) {
      bingoCardRequestIdRef.current += 1;
      setServerMissingContactFields([]);
      clearBingoCardState();
      setLoadingBingo(false);
      showScanFeedback('', 'idle');
      return;
    }
    setScanLocked(false);
    clearBingoCardState();
    showScanFeedback('', 'idle');
    setRaffleOffer(null);
    setRaffleRulesViewedVersion('');
    setAgeOfMajorityAttested(false);
    setResidencyAttested(false);
    setExclusionsAttested(false);
    setPromotionResponsibilityAccepted(false);
    setParticipationNoticeAccepted(false);
    loadBingoCard();
  }, [clearBingoCardState, loadBingoCard, showScanFeedback, visible]);

  useEffect(() => {
    if (
      !visible ||
      !contactProfileComplete ||
      !eventConfig ||
      !participationNoticeKey
    ) {
      setParticipationNoticeLoading(false);
      return;
    }
    let active = true;
    setParticipationNoticeLoading(true);
    SecureStore.getItemAsync(participationNoticeKey)
      .then((value) => {
        if (active) setParticipationNoticeAccepted(value === '1');
      })
      .catch(() => {
        if (active) setParticipationNoticeAccepted(false);
      })
      .finally(() => {
        if (active) setParticipationNoticeLoading(false);
      });
    return () => {
      active = false;
    };
  }, [contactProfileComplete, eventConfig, participationNoticeKey, visible]);

  useEffect(() => {
    if (
      !visible ||
      !contactProfileComplete ||
      !participationNoticeAccepted ||
      eventScanEnabled !== true ||
      scanWindowClosed ||
      !canRequestCameraPermission
    )
      return;
    requestCameraPermissionRef.current().catch(() => {});
  }, [
    canRequestCameraPermission,
    contactProfileComplete,
    eventScanEnabled,
    participationNoticeAccepted,
    scanWindowClosed,
    visible,
  ]);

  useEffect(() => {
    if (eventScanEnabled === undefined) return;
    if (eventScanEnabled && !scanWindowClosed) {
      setScanLocked(false);
      return;
    }
    setScanLocked(true);
    showScanFeedback('', 'idle');
  }, [
    eventConfigRevision,
    eventScanEnabled,
    scanWindowClosed,
    showScanFeedback,
  ]);

  useEffect(() => {
    if (eventVendorDrawsEnabled !== false) return;
    setRaffleOffer(null);
    setRaffleRulesViewedVersion('');
    resetEligibilityAttestations();
  }, [eventVendorDrawsEnabled, resetEligibilityAttestations]);

  useEffect(() => clearScanFeedbackTimer, [clearScanFeedbackTimer]);

  useEffect(
    () => () => {
      if (scanUnlockTimerRef.current) clearTimeout(scanUnlockTimerRef.current);
    },
    [],
  );

  const saveBingoScan = useCallback(
    async (vendor: QrBingoVendor) => {
      if (accountDeletionIsInFlight()) return false;
      const deletionGeneration = getAccountDeletionGeneration();
      const interactionGeneration = qrInteractionGenerationRef.current;
      if (!nativeSession?.user_id || !nativeSession?.token) {
        clearBingoCardState();
        setBingoError(
          'Sign in to your WeddingWin account before scanning booth QR codes.',
        );
        return false;
      }
      if (!contactProfileComplete) {
        setBingoError(
          'Complete your name, email, and phone number before scanning.',
        );
        return false;
      }
      if (!participationNoticeAccepted) {
        setBingoError(
          'Read and accept the QR Bingo participation notice before scanning.',
        );
        return false;
      }
      if (eventScanEnabled !== true) {
        setBingoError(
          'QR Bingo scanning is temporarily paused. Your saved progress is unchanged.',
        );
        return false;
      }

      setSavingBingo(true);
      setBingoError(null);

      try {
        const { response, data } =
          await fetchQrBingoJsonWithTimeout<QrBingoSyncResponse>(
            QR_BINGO_SYNC_FUNCTION_URL,
            {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${APP_BACKEND_PUBLISHABLE_KEY}`,
                apikey: APP_BACKEND_PUBLISHABLE_KEY,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                action: 'scan',
                native_session: nativeSession,
                vendor_id: vendor.id,
                participation_notice_version: `${eventConfig?.rules_version || ''}|${QR_BINGO_PARTICIPATION_NOTICE_VERSION}`,
              }),
            },
            'Saving this booth visit took too long. Check your connection and scan again.',
          );
        if (
          interactionGeneration !== qrInteractionGenerationRef.current ||
          !accountMutationIsCurrent(deletionGeneration)
        )
          return false;
        const nextEventConfig = normalizeQrBingoEventConfig(data.event_config);
        setEventConfig(nextEventConfig);
        if (!response.ok || data?.ok === false) {
          throw new Error(
            data?.detail ||
              data?.error ||
              'This vendor scan could not be saved.',
          );
        }

        setVendors(data.vendors || vendors);
        setBingoTotalCount(
          typeof data.total_count === 'number'
            ? data.total_count
            : data.vendors?.length || vendors.length,
        );
        setScannedVendorIds(new Set((data.scanned || [vendor.id]).map(String)));
        showScanFeedback(
          data.completed
            ? 'QR Bingo card complete. Booth scans record visits; vendor draw entries remain separate and optional.'
            : `Scanned: ${vendor.name}`,
          'success',
          data.completed ? undefined : 5000,
        );
        if (nextEventConfig?.vendor_draws_enabled && data.raffle_offer) {
          setRaffleRulesViewedVersion('');
          setAgeOfMajorityAttested(false);
          setResidencyAttested(false);
          setExclusionsAttested(false);
          setPromotionResponsibilityAccepted(false);
          setRaffleOffer(data.raffle_offer);
        } else {
          setRaffleOffer(null);
        }
        return true;
      } catch (error) {
        if (
          interactionGeneration === qrInteractionGenerationRef.current &&
          accountMutationIsCurrent(deletionGeneration)
        ) {
          setBingoError(
            error instanceof Error
              ? error.message
              : 'This vendor scan could not be saved.',
          );
        }
        return false;
      } finally {
        if (interactionGeneration === qrInteractionGenerationRef.current) {
          setSavingBingo(false);
        }
      }
    },
    [
      clearBingoCardState,
      contactProfileComplete,
      eventConfig?.rules_version,
      eventScanEnabled,
      nativeSession,
      participationNoticeAccepted,
      showScanFeedback,
      vendors,
    ],
  );

  const reopenVendorDrawOffer = useCallback(
    async (vendor: QrBingoVendor) => {
      if (accountDeletionIsInFlight()) return false;
      const deletionGeneration = getAccountDeletionGeneration();
      if (raffleOfferInFlightRef.current) return false;
      if (!nativeSession?.user_id || !nativeSession?.token) {
        clearBingoCardState();
        setBingoError(
          'Sign in to your WeddingWin account before reviewing vendor draws.',
        );
        return false;
      }
      if (eventVendorDrawsEnabled !== true) {
        showScanFeedback(
          `Already scanned: ${vendor.name}. Optional vendor draws are temporarily unavailable.`,
          'duplicate',
          5000,
        );
        return false;
      }

      raffleOfferInFlightRef.current = true;
      const interactionGeneration = qrInteractionGenerationRef.current;
      setSavingBingo(true);
      setBingoError(null);
      try {
        const { response, data } = await fetchQrBingoJsonWithTimeout<
          QrBingoSyncResponse & { message?: string }
        >(
          QR_BINGO_SYNC_FUNCTION_URL,
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${APP_BACKEND_PUBLISHABLE_KEY}`,
              apikey: APP_BACKEND_PUBLISHABLE_KEY,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              action: 'raffle_offer',
              native_session: nativeSession,
              vendor_id: vendor.id,
            }),
          },
          'Loading this vendor draw took too long. Check your connection and try again.',
        );
        if (
          interactionGeneration !== qrInteractionGenerationRef.current ||
          !accountMutationIsCurrent(deletionGeneration)
        )
          return false;
        const nextEventConfig = normalizeQrBingoEventConfig(data.event_config);
        setEventConfig(nextEventConfig);
        if (!response.ok || data?.ok === false) {
          throw new Error(
            data?.detail ||
              data?.error ||
              'This vendor draw could not be reviewed.',
          );
        }
        if (nextEventConfig?.vendor_draws_enabled !== true) {
          setRaffleOffer(null);
          showScanFeedback(
            'Optional vendor draws are temporarily unavailable.',
            'duplicate',
            5000,
          );
          return false;
        }
        if (!data.raffle_offer) {
          showScanFeedback(
            data.message ||
              `No entry action is currently available for ${vendor.name}.`,
            'duplicate',
            5000,
          );
          return false;
        }
        setRaffleRulesViewedVersion('');
        setAgeOfMajorityAttested(false);
        setResidencyAttested(false);
        setExclusionsAttested(false);
        setPromotionResponsibilityAccepted(false);
        setRaffleOffer(data.raffle_offer);
        showScanFeedback(
          `Booth already visited. ${vendor.name} draw available.`,
          'duplicate',
          5000,
        );
        return true;
      } catch (error) {
        if (
          interactionGeneration === qrInteractionGenerationRef.current &&
          accountMutationIsCurrent(deletionGeneration)
        ) {
          setBingoError(
            error instanceof Error
              ? error.message
              : 'This vendor draw could not be reviewed.',
          );
        }
        return false;
      } finally {
        if (interactionGeneration === qrInteractionGenerationRef.current) {
          raffleOfferInFlightRef.current = false;
          setSavingBingo(false);
        }
      }
    },
    [
      clearBingoCardState,
      eventVendorDrawsEnabled,
      nativeSession,
      showScanFeedback,
    ],
  );

  const handleBarcodeScanned = useCallback(
    async (result: BarcodeScanningResult) => {
      if (accountDeletionIsInFlight()) return;
      const interactionGeneration = qrInteractionGenerationRef.current;
      const value = result.data?.trim();
      if (!contactProfileComplete) {
        setBingoError(
          'Complete your name, email, and phone number before scanning.',
        );
        return;
      }
      if (!participationNoticeAccepted) {
        setBingoError(
          'Read and accept the QR Bingo participation notice before scanning.',
        );
        return;
      }
      if (
        eventScanEnabled !== true ||
        scanLocked ||
        scanInFlightRef.current ||
        raffleOffer ||
        !value
      )
        return;
      scanInFlightRef.current = true;
      setScanLocked(true);
      const unlockAfter = (delay: number) => {
        if (interactionGeneration !== qrInteractionGenerationRef.current)
          return;
        if (scanUnlockTimerRef.current)
          clearTimeout(scanUnlockTimerRef.current);
        scanUnlockTimerRef.current = setTimeout(() => {
          if (interactionGeneration !== qrInteractionGenerationRef.current)
            return;
          scanUnlockTimerRef.current = null;
          scanInFlightRef.current = false;
          setScanLocked(false);
        }, delay);
      };
      const matched = matchQrBingoVendor(value, vendors);
      if (!matched) {
        showScanFeedback('Unrecognized QR', 'error', 5000);
        unlockAfter(1600);
        return;
      }

      if (scannedVendorIds.has(matched.id)) {
        setBingoError(null);
        if (eventVendorDrawsEnabled) {
          await reopenVendorDrawOffer(matched);
        } else {
          showScanFeedback(
            `Already scanned: ${matched.name}. Optional vendor draws are temporarily unavailable.`,
            'duplicate',
            5000,
          );
        }
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
        if (interactionGeneration !== qrInteractionGenerationRef.current)
          return;
        unlockAfter(1200);
        return;
      }

      const saved = await saveBingoScan(matched);
      if (interactionGeneration !== qrInteractionGenerationRef.current) return;
      if (saved) {
        onScan(value);
      }
      unlockAfter(1600);
    },
    [
      contactProfileComplete,
      eventScanEnabled,
      eventVendorDrawsEnabled,
      onScan,
      participationNoticeAccepted,
      raffleOffer,
      reopenVendorDrawOffer,
      saveBingoScan,
      scanLocked,
      scannedVendorIds,
      showScanFeedback,
      vendors,
    ],
  );

  const enterRaffle = useCallback(async () => {
    if (accountDeletionIsInFlight()) return;
    const deletionGeneration = getAccountDeletionGeneration();
    const interactionGeneration = qrInteractionGenerationRef.current;
    if (!nativeSession?.user_id || !nativeSession?.token) {
      clearBingoCardState();
      setBingoError(
        'Sign in to your WeddingWin account before entering this vendor draw.',
      );
      return;
    }
    if (
      eventVendorDrawsEnabled !== true ||
      !raffleOffer ||
      raffleSaving ||
      raffleEntryInFlightRef.current
    )
      return;
    const vendorOfferVersion = String(
      raffleOffer.vendor_offer_version || '',
    ).trim();
    if (
      !vendorOfferVersion ||
      !Number.isFinite(Date.parse(vendorOfferVersion))
    ) {
      raffleEntryInFlightRef.current = true;
      const staleVendor = {
        id: raffleOffer.vendor_id,
        name: raffleOffer.vendor_name,
      };
      try {
        setRaffleOffer(null);
        resetEligibilityAttestations();
        const refreshed = await reopenVendorDrawOffer(staleVendor);
        if (
          interactionGeneration !== qrInteractionGenerationRef.current ||
          !accountMutationIsCurrent(deletionGeneration)
        )
          return;
        setBingoError(
          refreshed
            ? 'This vendor offer was refreshed. Review the current prize and rules before choosing to enter.'
            : 'This vendor offer could not be refreshed. Try again before entering.',
        );
      } finally {
        raffleEntryInFlightRef.current = false;
      }
      return;
    }
    if (raffleRulesViewedVersion !== raffleOffer.consent_version) {
      setBingoError(
        'Open the official rules before choosing to enter this vendor draw.',
      );
      return;
    }
    if (
      !ageOfMajorityAttested ||
      !residencyAttested ||
      !exclusionsAttested ||
      !promotionResponsibilityAccepted
    ) {
      setBingoError(
        'Confirm the eligibility statements and accept the named vendor contact-sharing and marketing terms before entering this draw.',
      );
      return;
    }
    const participantResponsibilityDisclosure = String(
      raffleOffer.participant_responsibility_disclosure || '',
    ).trim();
    if (!participantResponsibilityDisclosure) {
      setBingoError(
        'The current vendor-responsibility agreement could not be verified. Reload this offer before entering.',
      );
      return;
    }
    raffleEntryInFlightRef.current = true;
    setRaffleSaving(true);
    setBingoError(null);

    try {
      const { response, data } = await fetchQrBingoJsonWithTimeout<
        QrBingoSyncResponse & {
          already_entered?: boolean;
          message?: string;
        }
      >(
        QR_BINGO_SYNC_FUNCTION_URL,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${APP_BACKEND_PUBLISHABLE_KEY}`,
            apikey: APP_BACKEND_PUBLISHABLE_KEY,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            action: 'raffle_opt_in',
            native_session: nativeSession,
            vendor_id: raffleOffer.vendor_id,
            vendor_offer_version: vendorOfferVersion,
            consent_version: raffleOffer.consent_version,
            rules_viewed: true,
            apple_non_sponsor_acknowledged: true,
            age_of_majority_attested: ageOfMajorityAttested,
            residency_attested: residencyAttested,
            exclusions_attested: exclusionsAttested,
            promotion_responsibility_acknowledged:
              promotionResponsibilityAccepted,
            draw_administration_contact_share_acknowledged:
              promotionResponsibilityAccepted,
            vendor_marketing_consent_acknowledged:
              promotionResponsibilityAccepted,
            participant_responsibility_disclosure:
              participantResponsibilityDisclosure,
          }),
        },
        'Entering this vendor draw took too long. Check your connection and try again.',
      );
      if (
        interactionGeneration !== qrInteractionGenerationRef.current ||
        !accountMutationIsCurrent(deletionGeneration)
      )
        return;
      setEventConfig(normalizeQrBingoEventConfig(data.event_config));
      if (!response.ok || data?.ok === false) {
        if (data?.code === 'stale_vendor_offer') {
          const staleVendor = {
            id: raffleOffer.vendor_id,
            name: raffleOffer.vendor_name,
          };
          setRaffleOffer(null);
          resetEligibilityAttestations();
          await reopenVendorDrawOffer(staleVendor);
          if (
            interactionGeneration !== qrInteractionGenerationRef.current ||
            !accountMutationIsCurrent(deletionGeneration)
          )
            return;
          throw new Error(
            'This vendor changed its draw settings. Review the refreshed prize and rules before choosing to enter.',
          );
        }
        throw new Error(
          data?.detail ||
            data?.error ||
            data?.message ||
            'Could not enter this draw.',
        );
      }
      showScanFeedback(
        data.already_entered
          ? 'You are already entered for this vendor draw.'
          : `Entered: ${raffleOffer.vendor_name} draw`,
        'success',
      );
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(
        () => {},
      );
      setRaffleOffer(null);
      resetEligibilityAttestations();
    } catch (error) {
      if (
        interactionGeneration === qrInteractionGenerationRef.current &&
        accountMutationIsCurrent(deletionGeneration)
      ) {
        setBingoError(
          error instanceof Error ? error.message : 'Could not enter this draw.',
        );
      }
    } finally {
      if (interactionGeneration === qrInteractionGenerationRef.current) {
        raffleEntryInFlightRef.current = false;
        setRaffleSaving(false);
      }
    }
  }, [
    ageOfMajorityAttested,
    clearBingoCardState,
    eventVendorDrawsEnabled,
    exclusionsAttested,
    nativeSession,
    promotionResponsibilityAccepted,
    raffleOffer,
    raffleRulesViewedVersion,
    raffleSaving,
    reopenVendorDrawOffer,
    resetEligibilityAttestations,
    residencyAttested,
    showScanFeedback,
  ]);

  const acceptParticipationNotice = useCallback(() => {
    if (!participationNoticeKey || accountDeletionIsInFlight()) return;
    setParticipationNoticeAccepted(true);
    setBingoError(null);
    SecureStore.setItemAsync(participationNoticeKey, '1').catch(() => {
      // The acknowledgement still applies for this open scanner session.
    });
  }, [participationNoticeKey]);

  if (!visible) return null;

  const hasPermission = permission?.granted;
  const canAskPermission = permission?.canAskAgain !== false;
  const scannedCount = scannedVendorIds.size;
  const totalCount = bingoTotalCount ?? vendors.length;
  const totalLabel = totalCount > 0 ? String(totalCount) : '...';
  const progressPercent =
    totalCount > 0 ? Math.round((scannedCount / totalCount) * 100) : 0;
  const completed = totalCount > 0 && scannedCount === totalCount;
  const eligibilityConfirmed =
    ageOfMajorityAttested && residencyAttested && exclusionsAttested;
  const vendorDrawConsentConfirmed =
    eligibilityConfirmed && promotionResponsibilityAccepted;
  const raffleEntryDisabled = Boolean(
    raffleSaving ||
    raffleRulesViewedVersion !== raffleOffer?.consent_version ||
    !vendorDrawConsentConfirmed ||
    !raffleOffer?.participant_responsibility_disclosure,
  );
  const scanEnabled = eventScanEnabled === true && !scanWindowClosed;
  const scanDisabled = eventScanEnabled === false;
  const vendorDrawsEnabled = eventVendorDrawsEnabled === true;
  const onlyPhoneNumberMissing =
    missingContactFields.length === 1 &&
    missingContactFields[0].toLowerCase() === 'phone number';
  const onlyNameMissing =
    missingContactFields.length === 1 &&
    missingContactFields[0].toLowerCase() === 'name';

  return (
    <View
      style={styles.qrOverlay}
      accessibilityViewIsModal
      importantForAccessibility="yes"
      onAccessibilityEscape={onClose}
    >
      <StatusBar style="light" animated />
      <View style={styles.qrHeader}>
        <View>
          <Text style={styles.qrEyebrow}>
            {eventConfig?.event_name || 'QR Bingo Event'}
          </Text>
          <Text style={styles.qrTitle}>QR Bingo</Text>
        </View>
        <TouchableOpacity
          style={styles.qrCloseButton}
          activeOpacity={0.78}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Close QR scanner"
        >
          <X size={22} color="#2E2E32" strokeWidth={2.2} />
        </TouchableOpacity>
      </View>

      <Text style={styles.qrSubTitle}>
        {!contactProfileComplete
          ? onlyPhoneNumberMissing
            ? 'Add your phone number here to continue with QR Bingo.'
            : onlyNameMissing
              ? 'Add your full name here to continue with QR Bingo.'
              : 'Complete the missing contact details here to continue with QR Bingo.'
          : scanDisabled
            ? 'QR Bingo scanning is temporarily paused. Your saved progress is unchanged.'
            : scanWindowClosed
              ? `Booth scanning is available${eventConfig?.venue_name ? ` at ${eventConfig.venue_name}` : ''} from ${formatPromotionDate(eventConfig?.history_starts_at)} until ${formatPromotionDate(eventConfig?.entry_closes_at)}.`
              : 'Visit every vendor booth. Scan each QR. Fill your card.'}
      </Text>

      <View style={styles.qrCameraFrame}>
        {!contactProfileComplete ? (
          <View style={styles.qrPermissionPanel}>
            <UserRound size={52} color={BRAND_COLOR} strokeWidth={1.8} />
            <Text style={styles.qrPermissionTitle}>
              {onlyPhoneNumberMissing
                ? 'Add a phone number'
                : onlyNameMissing
                  ? 'Add your full name'
                  : 'Complete your contact details'}
            </Text>
            <Text style={styles.qrPermissionText}>
              {onlyPhoneNumberMissing
                ? 'Add a valid phone number before scanning.'
                : onlyNameMissing
                  ? 'Add your full name before scanning.'
                  : `Add your ${missingContactFields.join(', ')} before scanning.`}{' '}
              If you enter a vendor draw, that vendor receives your contact
              details and may contact you with wedding-related offers.
            </Text>
            <TouchableOpacity
              style={styles.qrPermissionButton}
              activeOpacity={0.84}
              onPress={onCompleteContact}
              accessibilityRole="button"
              accessibilityLabel={
                onlyPhoneNumberMissing
                  ? 'Add phone number for QR Bingo'
                  : onlyNameMissing
                    ? 'Add full name for QR Bingo'
                    : 'Complete contact details'
              }
            >
              <Text style={styles.qrPermissionButtonText}>
                {onlyPhoneNumberMissing
                  ? 'Add Phone Number'
                  : onlyNameMissing
                    ? 'Add Full Name'
                    : 'Complete Contact Details'}
              </Text>
            </TouchableOpacity>
          </View>
        ) : !eventConfig ? (
          <View style={styles.qrPermissionPanel}>
            {loadingBingo ? (
              <ActivityIndicator size="large" color={BRAND_COLOR} />
            ) : (
              <AlertTriangle size={52} color={BRAND_COLOR} strokeWidth={1.8} />
            )}
            <Text style={styles.qrPermissionTitle}>
              {loadingBingo
                ? 'Loading event settings'
                : 'QR Bingo is unavailable'}
            </Text>
            <Text style={styles.qrPermissionText}>
              {loadingBingo
                ? 'Checking the current event before starting the camera.'
                : 'Close and reopen the scanner to refresh the event settings.'}
            </Text>
          </View>
        ) : participationNoticeLoading ? (
          <View style={styles.qrPermissionPanel}>
            <ActivityIndicator size="large" color={BRAND_COLOR} />
            <Text style={styles.qrPermissionTitle}>
              Checking your acknowledgement
            </Text>
          </View>
        ) : !participationNoticeAccepted ? (
          <View style={styles.qrPermissionPanel}>
            <QrCode size={52} color={BRAND_COLOR} strokeWidth={1.8} />
            <Text style={styles.qrPermissionTitle}>Before you scan</Text>
            <TouchableOpacity
              style={styles.signupConsentToggle}
              activeOpacity={0.82}
              onPress={acceptParticipationNotice}
              accessible
              testID="qr-bingo-terms-acknowledgement"
              accessibilityRole="checkbox"
              accessibilityLabel="I agree to the QR Bingo Terms"
              accessibilityHint="Required before using the QR Bingo scanner"
              accessibilityState={{ checked: participationNoticeAccepted }}
            >
              <View style={styles.signupConsentBox} />
              <Text style={styles.signupConsentText}>
                I agree to the QR Bingo Terms.
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              activeOpacity={0.76}
              onPress={() =>
                Linking.openURL(TERMS_URL).catch(() =>
                  setBingoError('The Terms of Use could not be opened.'),
                )
              }
              accessibilityRole="link"
              accessibilityLabel="Read the QR Bingo Terms"
            >
              <Text style={styles.raffleTermsLink}>Read QR Bingo Terms</Text>
            </TouchableOpacity>
            <TouchableOpacity
              activeOpacity={0.76}
              onPress={() =>
                Linking.openURL(PRIVACY_URL).catch(() =>
                  setBingoError('The Privacy Policy could not be opened.'),
                )
              }
              accessibilityRole="link"
              accessibilityLabel="Open WeddingWin Privacy Policy"
            >
              <Text style={styles.raffleTermsLink}>View Privacy Policy</Text>
            </TouchableOpacity>
          </View>
        ) : scanWindowClosed ? (
          <View style={styles.qrPermissionPanel}>
            <QrCode size={52} color={BRAND_COLOR} strokeWidth={1.8} />
            <Text style={styles.qrPermissionTitle}>
              Scanning opens at the show
            </Text>
            <Text style={styles.qrPermissionText}>
              QR Bingo booth scans are available at{' '}
              {eventConfig?.event_name || 'the wedding show'} from{' '}
              {formatPromotionDate(eventConfig?.history_starts_at)} until{' '}
              {formatPromotionDate(eventConfig?.entry_closes_at)}.
            </Text>
          </View>
        ) : scanDisabled ? (
          <View style={styles.qrPermissionPanel}>
            <QrCode size={52} color={BRAND_COLOR} strokeWidth={1.8} />
            <Text style={styles.qrPermissionTitle}>
              QR Bingo scanning is paused
            </Text>
            <Text style={styles.qrPermissionText}>
              Booth visits are temporarily unavailable. Your saved progress
              remains on your card.
            </Text>
          </View>
        ) : scanEnabled && hasPermission ? (
          <>
            <CameraView
              style={styles.qrCamera}
              facing="back"
              accessible={false}
              importantForAccessibility="no-hide-descendants"
              barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
              onBarcodeScanned={
                scanLocked || raffleOffer ? undefined : handleBarcodeScanned
              }
            />
            <View style={styles.qrFrameShade} pointerEvents="none">
              <View style={styles.qrFocusBox}>
                <View style={[styles.qrCorner, styles.qrCornerTopLeft]} />
                <View style={[styles.qrCorner, styles.qrCornerTopRight]} />
                <View style={[styles.qrCorner, styles.qrCornerBottomLeft]} />
                <View style={[styles.qrCorner, styles.qrCornerBottomRight]} />
                <ScanLine size={42} color="#FFFFFF" strokeWidth={1.8} />
              </View>
            </View>
            {savingBingo ? (
              <View style={styles.qrSavingPill} pointerEvents="none">
                <ActivityIndicator size="small" color="#FFFFFF" />
              </View>
            ) : null}
            {lastScanLabel ? (
              <View
                style={[
                  styles.qrCameraFeedback,
                  lastScanTone === 'duplicate' &&
                    styles.qrCameraFeedbackDuplicate,
                  lastScanTone === 'error' && styles.qrCameraFeedbackError,
                  lastScanTone === 'success' && styles.qrCameraFeedbackSuccess,
                ]}
                pointerEvents="none"
                accessible={false}
                importantForAccessibility="no-hide-descendants"
              >
                <Text style={styles.qrCameraFeedbackText} numberOfLines={2}>
                  {lastScanLabel}
                </Text>
              </View>
            ) : null}
          </>
        ) : (
          <View style={styles.qrPermissionPanel}>
            <QrCode size={52} color={BRAND_COLOR} strokeWidth={1.8} />
            <Text style={styles.qrPermissionTitle}>Camera access needed</Text>
            <Text style={styles.qrPermissionText}>
              Allow camera access so the app can scan WeddingWin QR bingo codes.
            </Text>
            {canAskPermission ? (
              <TouchableOpacity
                style={styles.qrPermissionButton}
                activeOpacity={0.84}
                onPress={() => requestPermission()}
                accessibilityRole="button"
                accessibilityLabel="Allow camera access for QR Bingo"
              >
                <Text style={styles.qrPermissionButtonText}>Allow Camera</Text>
              </TouchableOpacity>
            ) : (
              <Text style={styles.qrPermissionText}>
                Camera access is blocked in settings. Enable it there, then
                reopen the scanner.
              </Text>
            )}
          </View>
        )}
      </View>

      {__DEV__ &&
      (emailTestFixture || appReviewFixture) &&
      contactProfileComplete &&
      participationNoticeAccepted &&
      vendors.length === 1 &&
      !scannedVendorIds.has(vendors[0].id) ? (
        <TouchableOpacity
          style={styles.qrPermissionButton}
          activeOpacity={0.84}
          disabled={scanLocked || savingBingo}
          onPress={() =>
            handleBarcodeScanned({
              data: `https://www.weddingwin.ca/qr?vendor_id=${encodeURIComponent(vendors[0].id)}`,
              type: 'qr',
            } as BarcodeScanningResult)
          }
          accessibilityRole="button"
          accessibilityLabel={
            emailTestFixture
              ? 'Emulate controlled email-test booth QR scan'
              : 'Emulate controlled App Review booth QR scan'
          }
        >
          <Text style={styles.qrPermissionButtonText}>
            {emailTestFixture
              ? 'Test only: Emulate email-test booth QR'
              : 'Test only: Emulate App Review booth QR'}
          </Text>
        </TouchableOpacity>
      ) : null}

      {contactProfileComplete ? (
        <View style={styles.qrFooter}>
          <View style={styles.qrProgressHeader}>
            <Text style={styles.qrFooterTitle}>
              {scannedCount} / {totalLabel} scanned
            </Text>
            <Text style={styles.qrProgressPercent}>{progressPercent}%</Text>
          </View>
          <View
            style={styles.qrProgressTrack}
            accessibilityRole="progressbar"
            accessibilityValue={{ min: 0, max: totalCount, now: scannedCount }}
          >
            <View
              style={[styles.qrProgressFill, { width: `${progressPercent}%` }]}
            />
          </View>
          {lastScanLabel ? (
            <Text
              style={[
                styles.qrLastScanText,
                lastScanTone === 'duplicate' && styles.qrLastScanDuplicate,
                lastScanTone === 'error' && styles.qrLastScanError,
                completed && styles.qrLastScanComplete,
              ]}
              accessibilityRole="text"
              accessibilityLabel={`QR scan result: ${lastScanLabel}`}
            >
              {lastScanLabel}
            </Text>
          ) : (
            <Text style={styles.qrFooterText}>
              Scan the QR code at each vendor booth to unlock their card.
            </Text>
          )}
          {bingoError ? (
            <Text style={styles.qrErrorText}>{bingoError}</Text>
          ) : null}
          {loadingBingo ? (
            <View style={styles.qrGridLoading}>
              <ActivityIndicator size="small" color={BRAND_COLOR} />
            </View>
          ) : (
            <ScrollView
              style={styles.qrVendorList}
              contentContainerStyle={styles.qrVendorGrid}
              showsVerticalScrollIndicator={false}
            >
              {vendors.map((vendor) => {
                const isScanned = scannedVendorIds.has(vendor.id);
                const canReviewVendorDraw = isScanned && vendorDrawsEnabled;
                return (
                  <TouchableOpacity
                    key={vendor.id}
                    style={[
                      styles.qrVendorTile,
                      isScanned && styles.qrVendorTileScanned,
                    ]}
                    activeOpacity={canReviewVendorDraw ? 0.78 : 1}
                    disabled={!canReviewVendorDraw || savingBingo}
                    onPress={
                      canReviewVendorDraw
                        ? () => reopenVendorDrawOffer(vendor)
                        : undefined
                    }
                    accessibilityRole={canReviewVendorDraw ? 'button' : 'text'}
                    accessibilityLabel={`${vendor.name}. ${canReviewVendorDraw ? 'Booth visited. Review optional vendor draw' : isScanned ? 'Booth visited' : 'Not scanned'}`}
                  >
                    {vendor.cover_photo ? (
                      <Image
                        source={{ uri: vendor.cover_photo }}
                        style={styles.qrVendorImage}
                        accessible={false}
                      />
                    ) : (
                      <View style={styles.qrVendorImagePlaceholder}>
                        <QrCode size={22} color="#BFAFAA" strokeWidth={1.7} />
                      </View>
                    )}
                    <Text style={styles.qrVendorName} numberOfLines={2}>
                      {vendor.name}
                    </Text>
                    {isScanned ? (
                      <View style={styles.qrVendorCheck}>
                        <Text style={styles.qrVendorCheckText}>{'\u2713'}</Text>
                      </View>
                    ) : null}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          )}
        </View>
      ) : null}
      <Modal
        visible={vendorDrawsEnabled && !!raffleOffer}
        transparent
        animationType="fade"
        onRequestClose={() => {
          setRaffleOffer(null);
          setBingoError(null);
          resetEligibilityAttestations();
        }}
      >
        <View style={styles.raffleModalBackdrop}>
          <View style={styles.raffleModalCard}>
            <ScrollView
              style={styles.raffleModalBody}
              contentContainerStyle={styles.raffleModalCardContent}
              showsVerticalScrollIndicator={false}
            >
              <Text style={styles.raffleModalEyebrow}>Vendor Draw</Text>
              <Text style={styles.raffleModalTitle}>
                {raffleOffer?.prize_title || 'Enter vendor draw'}
              </Text>
              <Text style={styles.raffleModalVendor}>
                {raffleOffer?.vendor_name}
              </Text>
              <Text style={styles.raffleModalText}>
                Named vendor sponsor, operator, and prize provider:{' '}
                {raffleOffer?.vendor_business_name || raffleOffer?.vendor_name}
              </Text>
              {raffleOffer?.vendor_profile_url ? (
                <TouchableOpacity
                  activeOpacity={0.76}
                  onPress={() =>
                    Linking.openURL(raffleOffer.vendor_profile_url!).catch(() =>
                      setBingoError('The vendor profile could not be opened.'),
                    )
                  }
                  accessibilityRole="link"
                  accessibilityLabel="Open the named vendor profile and contact route"
                >
                  <Text style={styles.raffleTermsLink}>
                    Open vendor identity, profile, and contact route
                  </Text>
                </TouchableOpacity>
              ) : null}
              {raffleOffer?.app_review_fixture ? (
                <Text style={styles.raffleModalText}>
                  App Review test fixture only. This is not a real promotion, no
                  prize is awarded, and outbound email is disabled.
                </Text>
              ) : null}
              {raffleOffer?.email_test_fixture ? (
                <Text style={styles.raffleModalText}>
                  Isolated prize-email QA fixture only. No real prize is
                  awarded. If this controlled test entry is selected and
                  verified, one notice is sent only to the allowlisted test
                  mailbox; no vendor copy is sent.
                </Text>
              ) : null}
              {raffleOffer?.prize_description ? (
                <Text style={styles.raffleModalText}>
                  {raffleOffer.prize_description}
                </Text>
              ) : null}
              <Text style={styles.raffleModalText}>
                Approximate prize value / maximum savings: $
                {Number(raffleOffer?.prize_approx_value_cad || 0).toFixed(2)}{' '}
                CAD{`\n`}
                Maximum winners:{' '}
                {normalizeRaffleMaxWinners(
                  raffleOffer?.max_winners || raffleOffer?.prize_count,
                )}
                {`\n`}
                Repeat-winner rule:{' '}
                {raffleOffer?.exclude_previous_winners !== false
                  ? 'The same couple will not be selected more than once.'
                  : 'A prior verified winner remains eligible for another random selection.'}
              </Text>
              <Text style={styles.raffleModalText}>
                Vendor draws are only for eligible couples attending the wedding
                show in person. Visit the booth, scan its QR code, then choose
                whether to enter. The QR entry replaces a paper ballot; scanning
                alone only records the booth visit and QR Bingo progress. No
                purchase from the vendor is required. One entry is allowed per
                eligible couple for this vendor draw.
              </Text>
              <Text style={styles.raffleModalText}>
                By entering, I agree that Wedding Win Inc. may share my name,
                email address, phone number, wedding date, and entry/consent
                evidence with{' '}
                {raffleOffer?.vendor_business_name ||
                  raffleOffer?.vendor_name ||
                  'the named vendor'}
                . That vendor may use these details to administer this draw and
                contact me with wedding-related offers and promotions. I may
                unsubscribe from vendor marketing at any time. The named vendor
                remains responsible for the prize, eligibility, verification,
                delivery, and fulfilment disputes.
              </Text>
              <Text style={styles.raffleModalText}>
                {raffleOffer?.apple_non_sponsor_disclaimer ||
                  'Apple Inc. is not a sponsor of and is not involved in this promotion.'}
              </Text>
              <TouchableOpacity
                activeOpacity={0.76}
                onPress={() => {
                  if (!raffleOffer?.terms_url) return;
                  Linking.openURL(raffleOffer.terms_url)
                    .then(() => {
                      setRaffleRulesViewedVersion(raffleOffer.consent_version);
                      setBingoError(null);
                    })
                    .catch(() =>
                      setBingoError('The official rules could not be opened.'),
                    );
                }}
                accessibilityRole="link"
                accessibilityLabel="View vendor draw rules"
              >
                <Text style={styles.raffleTermsLink}>View draw rules</Text>
              </TouchableOpacity>
              <Text style={styles.raffleModalText}>
                {raffleRulesViewedVersion === raffleOffer?.consent_version
                  ? 'Rules opened. Enter Draw now records your acceptance.'
                  : 'Open the rules before the entry button becomes available.'}
              </Text>
              <TouchableOpacity
                style={styles.signupConsentToggle}
                onPress={() => {
                  setAgeOfMajorityAttested((value) => !value);
                  setBingoError(null);
                }}
                accessible
                testID="vendor-draw-age-confirmation"
                accessibilityRole="checkbox"
                accessibilityLabel="I have reached the age of majority"
                accessibilityHint="Required to enter this vendor draw"
                accessibilityState={{ checked: ageOfMajorityAttested }}
              >
                <View
                  style={[
                    styles.signupConsentBox,
                    ageOfMajorityAttested && styles.signupConsentBoxChecked,
                  ]}
                >
                  {ageOfMajorityAttested ? (
                    <Text style={styles.signupConsentCheck}>{'\u2713'}</Text>
                  ) : null}
                </View>
                <Text style={styles.signupConsentText}>
                  I have reached the age of majority.
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.signupConsentToggle}
                onPress={() => {
                  setResidencyAttested((value) => !value);
                  setBingoError(null);
                }}
                accessible
                testID="vendor-draw-residency-confirmation"
                accessibilityRole="checkbox"
                accessibilityLabel="I reside in the eligible region shown in the draw rules"
                accessibilityHint="Required to enter this vendor draw"
                accessibilityState={{ checked: residencyAttested }}
              >
                <View
                  style={[
                    styles.signupConsentBox,
                    residencyAttested && styles.signupConsentBoxChecked,
                  ]}
                >
                  {residencyAttested ? (
                    <Text style={styles.signupConsentCheck}>{'\u2713'}</Text>
                  ) : null}
                </View>
                <Text style={styles.signupConsentText}>
                  I reside in the eligible region shown above.
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.signupConsentToggle}
                onPress={() => {
                  setExclusionsAttested((value) => !value);
                  setBingoError(null);
                }}
                accessible
                testID="vendor-draw-exclusions-confirmation"
                accessibilityRole="checkbox"
                accessibilityLabel="I am not excluded from this vendor draw under the official rules"
                accessibilityHint="Required to enter this vendor draw"
                accessibilityState={{ checked: exclusionsAttested }}
              >
                <View
                  style={[
                    styles.signupConsentBox,
                    exclusionsAttested && styles.signupConsentBoxChecked,
                  ]}
                >
                  {exclusionsAttested ? (
                    <Text style={styles.signupConsentCheck}>{'\u2713'}</Text>
                  ) : null}
                </View>
                <Text style={styles.signupConsentText}>
                  I am not Wedding Win Inc., the named vendor or prize provider,
                  an employee of either, or a member of an excluded
                  employee&apos;s immediate household under the Official Rules.
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.signupConsentToggle}
                onPress={() => {
                  setPromotionResponsibilityAccepted((value) => !value);
                  setBingoError(null);
                }}
                accessible
                testID="vendor-draw-contact-sharing-confirmation"
                accessibilityRole="checkbox"
                accessibilityLabel={`I agree to share my contact information with ${raffleOffer?.vendor_business_name || raffleOffer?.vendor_name || 'this vendor'} for this draw and its wedding-related marketing, and I accept the current draw rules`}
                accessibilityHint="Required to enter this vendor draw"
                accessibilityState={{
                  checked: promotionResponsibilityAccepted,
                }}
              >
                <View
                  style={[
                    styles.signupConsentBox,
                    promotionResponsibilityAccepted &&
                      styles.signupConsentBoxChecked,
                  ]}
                >
                  {promotionResponsibilityAccepted ? (
                    <Text style={styles.signupConsentCheck}>{'\u2713'}</Text>
                  ) : null}
                </View>
                <Text style={styles.signupConsentText}>
                  I agree to share my contact information with{' '}
                  {raffleOffer?.vendor_business_name ||
                    raffleOffer?.vendor_name ||
                    'this vendor'}{' '}
                  for this draw and its wedding-related marketing, and I accept
                  the current draw rules.
                </Text>
              </TouchableOpacity>
              {bingoError ? (
                <Text
                  style={styles.qrErrorText}
                  accessibilityRole="alert"
                  accessibilityLiveRegion="assertive"
                >
                  {bingoError}
                </Text>
              ) : null}
            </ScrollView>
            <View style={styles.raffleModalActions}>
              <TouchableOpacity
                style={styles.raffleCancelButton}
                activeOpacity={0.78}
                onPress={() => {
                  setRaffleOffer(null);
                  setBingoError(null);
                  resetEligibilityAttestations();
                }}
                disabled={raffleSaving}
                accessibilityRole="button"
                accessibilityLabel="Decline vendor draw entry"
              >
                <Text style={styles.raffleCancelText}>No Thanks</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.raffleEnterButton,
                  raffleEntryDisabled && styles.loginButtonDisabled,
                ]}
                activeOpacity={0.86}
                onPress={enterRaffle}
                disabled={raffleEntryDisabled}
                accessibilityRole="button"
                accessibilityLabel="Enter vendor draw"
                accessibilityState={{ disabled: raffleEntryDisabled }}
              >
                {raffleSaving ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.raffleEnterText}>
                    {raffleRulesViewedVersion ===
                      raffleOffer?.consent_version && vendorDrawConsentConfirmed
                      ? 'Accept Rules & Enter'
                      : 'Review & Confirm All'}
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

type BottomNavIcon = ComponentType<{
  size?: number;
  color?: string;
  strokeWidth?: number;
}>;

function CoupleBottomNav({
  onBackToApp,
  onOpenWebsiteBuilder,
  onOpenDashboard,
  onOpenChat,
  onOpenQrScanner,
  chatUnreadCount,
}: {
  onBackToApp: () => void;
  onOpenWebsiteBuilder: () => void;
  onOpenDashboard: () => void;
  onOpenChat: () => void;
  onOpenQrScanner: () => void;
  chatUnreadCount: number;
}) {
  const renderItem = (
    testID: string,
    label: string,
    accessibilityLabel: string,
    Icon: BottomNavIcon,
    onPress: () => void,
    badgeCount = 0,
  ) => (
    <TouchableOpacity
      testID={testID}
      accessible
      style={styles.coupleBottomNavItem}
      activeOpacity={0.78}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
    >
      <View style={styles.coupleBottomNavIconWrap}>
        <Icon size={19} color={BRAND_COLOR} strokeWidth={2.15} />
        {badgeCount > 0 ? (
          <View style={styles.coupleBottomNavBadge}>
            <Text style={styles.coupleBottomNavBadgeText}>
              {badgeCount > 99 ? '99+' : badgeCount}
            </Text>
          </View>
        ) : null}
      </View>
      <Text style={styles.coupleBottomNavLabel} numberOfLines={1}>
        {label}
      </Text>
    </TouchableOpacity>
  );

  return (
    <View
      testID="couple-bottom-nav"
      accessible={false}
      collapsable={false}
      style={styles.coupleBottomNav}
      pointerEvents="auto"
    >
      {renderItem(
        'couple-bottom-nav-app',
        'App',
        'Back to WeddingWin app',
        House,
        onBackToApp,
      )}
      {renderItem(
        'couple-bottom-nav-website',
        'Website',
        'Open wedding website builder',
        Globe2,
        onOpenWebsiteBuilder,
      )}
      {renderItem(
        'couple-bottom-nav-vendors',
        'Vendors',
        'Open vendor search dashboard',
        Search,
        onOpenDashboard,
      )}
      {renderItem(
        'couple-bottom-nav-messages',
        'Messages',
        'Open private messages',
        MessageCircle,
        onOpenChat,
        chatUnreadCount,
      )}
      {renderItem(
        'couple-bottom-nav-qr-bingo',
        'QR Bingo',
        'Open QR Bingo scanner',
        QrCode,
        onOpenQrScanner,
      )}
    </View>
  );
}

function VendorBottomNav({
  onBackToApp,
  onOpenVendorDashboard,
  onOpenChat,
  onOpenVendorDraw,
  chatUnreadCount,
}: {
  onBackToApp: () => void;
  onOpenVendorDashboard: () => void;
  onOpenChat: () => void;
  onOpenVendorDraw: () => void;
  chatUnreadCount: number;
}) {
  const renderItem = (
    testID: string,
    label: string,
    accessibilityLabel: string,
    Icon: BottomNavIcon,
    onPress: () => void,
    badgeCount = 0,
  ) => (
    <TouchableOpacity
      testID={testID}
      accessible
      style={styles.coupleBottomNavItem}
      activeOpacity={0.78}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
    >
      <View style={styles.coupleBottomNavIconWrap}>
        <Icon size={19} color={BRAND_COLOR} strokeWidth={2.15} />
        {badgeCount > 0 ? (
          <View style={styles.coupleBottomNavBadge}>
            <Text style={styles.coupleBottomNavBadgeText}>
              {badgeCount > 99 ? '99+' : badgeCount}
            </Text>
          </View>
        ) : null}
      </View>
      <Text style={styles.coupleBottomNavLabel} numberOfLines={1}>
        {label}
      </Text>
    </TouchableOpacity>
  );

  return (
    <View
      testID="vendor-bottom-nav"
      accessible={false}
      collapsable={false}
      style={styles.coupleBottomNav}
      pointerEvents="auto"
    >
      {renderItem(
        'vendor-bottom-nav-app',
        'App',
        'Back to WeddingWin app',
        House,
        onBackToApp,
      )}
      {renderItem(
        'vendor-bottom-nav-dashboard',
        'Dashboard',
        'Open vendor dashboard',
        LayoutDashboard,
        onOpenVendorDashboard,
      )}
      {renderItem(
        'vendor-bottom-nav-messages',
        'Messages',
        'Open private messages',
        MessageCircle,
        onOpenChat,
        chatUnreadCount,
      )}
      {renderItem(
        'vendor-bottom-nav-draw',
        'Draw',
        'Open QR Bingo vendor draw settings',
        QrCode,
        onOpenVendorDraw,
      )}
    </View>
  );
}

function NativeHome({
  onOpenUrl,
  onOpenWebsiteBuilder,
  onOpenDashboard,
  onOpenChat,
  onRegisterVendorDrawCloser,
  onOpenQrScanner,
  qrContactCompletionRequested,
  onCancelQrContactCompletion,
  onAppleSignIn,
  onGoogleSignIn,
  onEmailLogin,
  onMemberSignup,
  onCompleteProfile,
  googleLoginLoading,
  emailLoginLoading,
  signupLoading,
  profileSaveLoading,
  member,
  chatUnreadCount,
  chatStatusLabel,
  websiteSessionReady,
  onSignOut,
  nativeSession,
  vendorDrawOpenRequestId,
}: {
  onOpenUrl: (path: string) => void;
  onOpenWebsiteBuilder: () => void;
  onOpenDashboard: () => void;
  onOpenChat: () => void;
  onRegisterVendorDrawCloser: (closer: (() => Promise<boolean>) | null) => void;
  onOpenQrScanner: () => void;
  qrContactCompletionRequested: boolean;
  onCancelQrContactCompletion: () => void;
  onAppleSignIn: (role: SignupRole, consent?: SignupConsent) => void;
  onGoogleSignIn: (role: SignupRole, consent?: SignupConsent) => void;
  onEmailLogin: (credentials: LoginCredentials) => Promise<void>;
  onMemberSignup: (signup: MemberSignup) => Promise<void>;
  onCompleteProfile: (profile: ContactProfile) => Promise<void>;
  googleLoginLoading: boolean;
  emailLoginLoading: boolean;
  signupLoading: boolean;
  profileSaveLoading: boolean;
  member: NativeMember | null;
  chatUnreadCount: number;
  chatStatusLabel: string;
  websiteSessionReady: boolean;
  onSignOut: () => void | Promise<void>;
  nativeSession: NativeBridgeSession | null;
  vendorDrawOpenRequestId: number;
}) {
  const { width: viewportWidth, height: viewportHeight } =
    useWindowDimensions();
  const vendorDrawSlideWidth = Math.min(Math.max(viewportWidth - 82, 260), 380);
  const vendorDrawSlideHeight = Math.round(
    vendorDrawSlideWidth * (1920 / 1088),
  );
  const [role, setRole] = useState<'couple' | 'vendor'>('couple');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('login');
  const [wizardStep, setWizardStep] = useState<1 | 2>(1);
  const [profileFirstName, setProfileFirstName] = useState(
    editableQrProfileFirstName(member?.first_name, member?.last_name),
  );
  const [profileEmail, setProfileEmail] = useState(member?.email || '');
  const [profilePhone, setProfilePhone] = useState(member?.phone_number || '');
  const [profileWeddingDate, setProfileWeddingDate] = useState(
    normalizeWeddingDate(member?.wedding_date),
  );
  const [showWeddingPicker, setShowWeddingPicker] = useState(false);
  const [signupConsentAccepted, setSignupConsentAccepted] = useState(false);
  const [qrMenuEventConfig, setQrMenuEventConfig] =
    useState<QrBingoEventConfig | null>(null);
  const [qrMenuConfigLoading, setQrMenuConfigLoading] = useState(false);
  const [qrMenuConfigUnavailable, setQrMenuConfigUnavailable] = useState(false);
  const [showVendorRaffle, setShowVendorRaffle] = useState(false);
  const [vendorRaffleLoading, setVendorRaffleLoading] = useState(false);
  const [vendorRaffleSaving, setVendorRaffleSaving] = useState(false);
  const [vendorRaffleDrawing, setVendorRaffleDrawing] = useState(false);
  const [vendorRaffleSendingDrawId, setVendorRaffleSendingDrawId] = useState<
    string | null
  >(null);
  const [vendorRaffleReviewing, setVendorRaffleReviewing] = useState(false);
  const [vendorRaffleExporting, setVendorRaffleExporting] = useState(false);
  const [vendorRaffleEntriesLoading, setVendorRaffleEntriesLoading] =
    useState(false);
  const [
    vendorRaffleEntryUpdatingReference,
    setVendorRaffleEntryUpdatingReference,
  ] = useState<string | null>(null);
  const [vendorRaffleError, setVendorRaffleError] = useState<string | null>(
    null,
  );
  const [vendorRaffleSaveError, setVendorRaffleSaveError] = useState<
    string | null
  >(null);
  const [vendorRaffle, setVendorRaffle] =
    useState<QrBingoVendorRaffleResponse | null>(null);
  const [vendorRaffleEntries, setVendorRaffleEntries] = useState<
    QrBingoRaffleEntry[]
  >([]);
  const [vendorRaffleEntryReasons, setVendorRaffleEntryReasons] = useState<
    Record<string, string>
  >({});
  const [vendorRaffleEntryQuery, setVendorRaffleEntryQuery] = useState('');
  const [vendorRaffleEntryFilter, setVendorRaffleEntryFilter] = useState<
    'all' | 'included' | 'excluded'
  >('all');
  const [
    vendorRaffleExpandedEntryReference,
    setVendorRaffleExpandedEntryReference,
  ] = useState<string | null>(null);
  const [vendorRaffleWizardStep, setVendorRaffleWizardStep] =
    useState<VendorRaffleWizardStep>(1);
  const [vendorRaffleGuideExpanded, setVendorRaffleGuideExpanded] =
    useState(false);
  const [
    vendorRaffleEmailPreviewExpanded,
    setVendorRaffleEmailPreviewExpanded,
  ] = useState(false);
  const [vendorRaffleSlideIndex, setVendorRaffleSlideIndex] = useState(0);
  const [vendorRaffleRulesExpanded, setVendorRaffleRulesExpanded] =
    useState(false);
  const [raffleEnabled, setRaffleEnabled] = useState(false);
  const [rafflePrizeTitle, setRafflePrizeTitle] = useState('');
  const [rafflePrizeDescription, setRafflePrizeDescription] = useState('');
  const [rafflePrizeApproxValueCad, setRafflePrizeApproxValueCad] =
    useState('');
  const [raffleMaxWinners, setRaffleMaxWinners] = useState<1 | 2 | 3>(1);
  const [raffleExcludePreviousWinners, setRaffleExcludePreviousWinners] =
    useState(true);
  const [raffleLegalAccepted, setRaffleLegalAccepted] = useState(false);
  const [vendorEligibilityConfirmed, setVendorEligibilityConfirmed] =
    useState(false);
  const [vendorRulesReleaseConfirmed, setVendorRulesReleaseConfirmed] =
    useState(false);
  const [vendorSkillAnswer, setVendorSkillAnswer] = useState('');
  const [vendorVerificationDate, setVendorVerificationDate] = useState('');
  const [vendorVerificationMethod, setVendorVerificationMethod] = useState('');
  const [vendorVerificationReference, setVendorVerificationReference] =
    useState('');
  const [vendorReviewNotes, setVendorReviewNotes] = useState('');
  const [vendorRaffleRulesViewedVersion, setVendorRaffleRulesViewedVersion] =
    useState('');
  const [vendorRaffleSaveMessage, setVendorRaffleSaveMessage] = useState('');
  const profileSavePressInFlightRef = useRef(false);
  const qrMenuConfigRequestGenerationRef = useRef(0);
  const signOutConfirmationVisibleRef = useRef(false);
  const vendorRaffleHydratingRef = useRef(false);
  const vendorRaffleLoadedRef = useRef(false);
  const vendorRaffleSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const vendorRaffleLastSavedRef = useRef('');
  const vendorRaffleSaveInFlightRef = useRef(false);
  const vendorRaffleSavePromiseRef = useRef<Promise<boolean> | null>(null);
  const vendorRaffleSaveSeqRef = useRef(0);
  const vendorRaffleLocalEditGenerationRef = useRef(0);
  const vendorRaffleLastFailedSignatureRef = useRef('');
  const vendorRaffleOpenGenerationRef = useRef(0);
  const vendorRaffleOpenInFlightRef = useRef<Promise<void> | null>(null);
  const vendorRaffleEntriesRequestGenerationRef = useRef(0);
  const vendorRaffleEntriesInFlightRef = useRef<Promise<void> | null>(null);
  const vendorRaffleActionInFlightRef = useRef<string | null>(null);
  const lastVendorDrawOpenRequestRef = useRef(0);
  const vendorRaffleScrollRef = useRef<ScrollView>(null);
  const vendorRaffleEntriesAutoLoadRef = useRef(false);

  useEffect(() => {
    setProfileFirstName(
      editableQrProfileFirstName(member?.first_name, member?.last_name),
    );
    setProfileEmail(member?.email || '');
    setProfilePhone(member?.phone_number || '');
    setProfileWeddingDate(normalizeWeddingDate(member?.wedding_date));
  }, [
    member?.email,
    member?.first_name,
    member?.last_name,
    member?.phone_number,
    member?.wedding_date,
  ]);

  useEffect(() => {
    if (role === 'vendor') {
      setAuthMode('login');
    }
  }, [role]);

  const continueFromPath = () => {
    setAuthMode('signup');
    setWizardStep(2);
  };

  const showExistingLogin = () => {
    setAuthMode('login');
    setWizardStep(2);
  };

  const showSignupConsentAlert = () => {
    Alert.alert(
      'Agreement required',
      "Please agree to WeddingWin's Terms of Use and Privacy Policy before creating an account.",
    );
  };

  const buildSignupConsent = (): SignupConsent => ({
    acceptedTerms: true,
    acceptedPrivacy: true,
    acceptedAt: new Date().toISOString(),
    termsVersion: TERMS_VERSION,
    privacyVersion: PRIVACY_VERSION,
  });

  const requireSignupConsent = () => {
    if (signupConsentAccepted) return true;
    showSignupConsentAlert();
    return false;
  };

  const openPolicyLink = (url: string) => {
    Linking.openURL(url).catch(() => {
      Alert.alert('Could not open link', 'Please try again in a moment.');
    });
  };

  const startGoogleSignup = () => {
    if (!requireSignupConsent()) return;
    onGoogleSignIn(role, buildSignupConsent());
  };

  const startAppleSignup = () => {
    if (!requireSignupConsent()) return;
    onAppleSignIn(role, buildSignupConsent());
  };

  const openLogin = () => {
    if (emailLoginLoading) return;

    const cleanEmail = email.trim();
    if (!cleanEmail || !password) {
      Alert.alert(
        'Enter your login details',
        'Add your email and password to sign in.',
      );
      return;
    }
    onEmailLogin({ email: cleanEmail, password: password.trim(), role });
  };

  const createMemberAccount = () => {
    if (signupLoading) return;

    const cleanEmail = email.trim();
    if (!cleanEmail || !password.trim()) {
      Alert.alert('Finish your account', 'Add your email and password.');
      return;
    }

    if (!isValidEmail(cleanEmail)) {
      Alert.alert(
        'Enter a valid email',
        'Use an email address that can receive website login, vendor-contact, and app messages.',
      );
      return;
    }

    if (password.trim().length < 8) {
      Alert.alert('Choose a stronger password', 'Use at least 8 characters.');
      return;
    }

    if (!requireSignupConsent()) return;

    onMemberSignup({
      role,
      firstName: '',
      email: cleanEmail.toLowerCase(),
      phone: '',
      password: password.trim(),
      weddingDate: '',
      consent: buildSignupConsent(),
    });
  };

  const memberIsCouple = isCoupleAccount(member);
  const refreshQrMenuEventConfig = useCallback(async () => {
    const requestGeneration = qrMenuConfigRequestGenerationRef.current + 1;
    qrMenuConfigRequestGenerationRef.current = requestGeneration;
    setQrMenuConfigUnavailable(false);
    setQrMenuConfigLoading(true);

    try {
      const { response, data } =
        await fetchAppJsonWithTimeout<QrBingoPublicConfigResponse>(
          QR_BINGO_PUBLIC_CONFIG_URL,
          {
            method: 'GET',
            headers: {
              Authorization: `Bearer ${APP_BACKEND_PUBLISHABLE_KEY}`,
              apikey: APP_BACKEND_PUBLISHABLE_KEY,
              Accept: 'application/json',
            },
          },
          'Wedding show details took too long to load.',
        );
      if (!response.ok || data?.ok === false) {
        throw new Error(data?.error || 'Wedding show details are unavailable.');
      }
      if (requestGeneration !== qrMenuConfigRequestGenerationRef.current) {
        return;
      }
      const eventConfig = normalizeQrBingoEventConfig(
        data?.event_config || null,
      );
      if (!eventConfig) {
        throw new Error('Wedding show details are unavailable.');
      }
      setQrMenuEventConfig(eventConfig);
      setQrMenuConfigUnavailable(false);
    } catch {
      if (requestGeneration !== qrMenuConfigRequestGenerationRef.current) {
        return;
      }
      setQrMenuEventConfig(null);
      setQrMenuConfigUnavailable(true);
    } finally {
      if (requestGeneration === qrMenuConfigRequestGenerationRef.current) {
        setQrMenuConfigLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    if (!memberIsCouple) {
      qrMenuConfigRequestGenerationRef.current += 1;
      setQrMenuEventConfig(null);
      setQrMenuConfigLoading(false);
      setQrMenuConfigUnavailable(false);
      return;
    }

    void refreshQrMenuEventConfig();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        void refreshQrMenuEventConfig();
        return;
      }
      qrMenuConfigRequestGenerationRef.current += 1;
      setQrMenuConfigLoading(false);
    });
    const refreshTimer = setInterval(() => {
      if (AppState.currentState === 'active') {
        void refreshQrMenuEventConfig();
      }
    }, QR_BINGO_MENU_CONFIG_REFRESH_MS);
    return () => {
      qrMenuConfigRequestGenerationRef.current += 1;
      subscription.remove();
      clearInterval(refreshTimer);
    };
  }, [member?.user_id, memberIsCouple, refreshQrMenuEventConfig]);

  const memberContactName = [member?.first_name, member?.last_name]
    .map((value) => String(value || '').trim())
    .filter(Boolean)
    .join(' ');
  const qrMissingContactFields = missingQrContactFields(member);
  const qrNeedsContactName = qrMissingContactFields.includes('name');
  const qrNeedsContactPhone = qrMissingContactFields.includes('phone number');
  const qrContactProfileHint =
    qrNeedsContactName && qrNeedsContactPhone
      ? 'Add your full name and phone number to continue with QR Bingo.'
      : qrNeedsContactName
        ? 'Add your full name to continue with QR Bingo.'
        : 'Add a phone number to continue with QR Bingo.';
  const displayName =
    memberIsCouple && isReservedQrContactName(memberContactName)
      ? member?.email
      : !memberIsCouple && member?.company
        ? member.company
        : memberContactName || member?.company || member?.email;
  // Couple accounts always land on the native app menu. Optional profile
  // details never block normal app use; the QR flow requests its own required
  // contact fields only when the couple chooses QR Bingo.
  const shouldCompleteProfile = memberIsCouple && qrContactCompletionRequested;
  const usesApplePrivateRelayEmail = isApplePrivateRelayEmail(member?.email);
  const isVendorRole = role === 'vendor';
  const showCoupleMenu = !!member && memberIsCouple;
  const showVendorMenu = !!member && !memberIsCouple;
  const showOneAppMenu =
    !!member && !shouldCompleteProfile && (showCoupleMenu || showVendorMenu);
  const compactOneAppMenu = showOneAppMenu || viewportHeight < 740;
  const qrMenuAvailable = Boolean(
    qrMenuEventConfig?.app_card_enabled && qrMenuEventConfig.scan_enabled,
  );
  const qrMenuConfigPending =
    !qrMenuEventConfig && (qrMenuConfigLoading || !qrMenuConfigUnavailable);
  const qrMenuDateLabel = qrMenuEventConfig
    ? formatQrMenuDate(qrMenuEventConfig.history_starts_at)
    : '';
  const qrMenuEventNameLabel = qrMenuEventConfig?.event_name || 'Wedding Show';
  const qrMenuVenueLabel = qrMenuEventConfig?.venue_name || '';
  const qrMenuScheduleLabel = qrMenuDateLabel
    ? `${qrMenuDateLabel}${qrMenuVenueLabel ? ` at ${qrMenuVenueLabel}` : ''}`
    : '';
  const qrMenuStatusLabel = qrMenuConfigPending
    ? 'Checking wedding show availability...'
    : qrMenuConfigUnavailable
      ? 'Wedding show details are unavailable'
      : qrMenuEventConfig?.app_card_enabled === true &&
          qrMenuEventConfig.scan_enabled === false
        ? 'QR Bingo is temporarily paused'
        : 'Available at Wedding Shows';
  const vendorRaffleRulesVersion =
    vendorRaffle?.rules_version ||
    vendorRaffle?.settings?.legal_terms_version ||
    '2026-09-01-in-person-entry';
  const vendorResponsibilityDisclosure =
    vendorRaffle?.vendor_responsibility_disclosure?.trim() || '';

  const vendorRaffleSignature = useCallback(
    (
      enabled: boolean,
      prizeDescription: string,
      prizeApproxValueCad: string,
      maxWinners: number,
      excludePreviousWinners: boolean,
      legalAccepted: boolean,
      legalTermsVersion: string,
    ) =>
      JSON.stringify({
        enabled,
        prize_description: prizeDescription,
        prize_approx_value_cad: prizeApproxValueCad,
        max_winners: normalizeRaffleMaxWinners(maxWinners),
        exclude_previous_winners: excludePreviousWinners,
        legal_terms_accepted: legalAccepted,
        legal_terms_version: legalAccepted ? legalTermsVersion : '',
      }),
    [],
  );

  const markVendorRaffleLocalEdit = () => {
    vendorRaffleLocalEditGenerationRef.current += 1;
    vendorRaffleLastFailedSignatureRef.current = '';
    setVendorRaffleSaveError(null);
  };

  const finishVendorRaffleHydration = useCallback(() => {
    setTimeout(() => {
      vendorRaffleHydratingRef.current = false;
      vendorRaffleLoadedRef.current = true;
    }, 0);
  }, []);

  const applyVendorRaffle = useCallback(
    (
      data: CompleteQrBingoVendorRaffleResponse,
      options: { preserveWizardContext?: boolean } = {},
    ) => {
      vendorRaffleHydratingRef.current = true;
      setVendorRaffle(data);
      setRaffleEnabled(Boolean(data.settings?.enabled));
      setRafflePrizeTitle(data.settings?.prize_title || '');
      setRafflePrizeDescription(data.settings?.prize_description || '');
      setRafflePrizeApproxValueCad(
        data.settings?.prize_approx_value_cad
          ? String(data.settings.prize_approx_value_cad)
          : '',
      );
      setRaffleMaxWinners(
        normalizeRaffleMaxWinners(data.settings?.max_winners),
      );
      setRaffleExcludePreviousWinners(
        data.settings?.exclude_previous_winners !== false,
      );
      const currentRulesAccepted =
        data.vendor_acceptance_current ??
        Boolean(
          data.settings?.legal_terms_accepted &&
          data.settings?.legal_terms_version === data.rules_version,
        );
      setRaffleLegalAccepted(currentRulesAccepted);
      setVendorRaffleRulesViewedVersion(
        currentRulesAccepted ? data.rules_version || '' : '',
      );
      if (!options.preserveWizardContext) {
        setVendorRaffleWizardStep(recommendedVendorRaffleWizardStep(data));
        setVendorRaffleRulesExpanded(false);
      }
      setVendorEligibilityConfirmed(false);
      setVendorRulesReleaseConfirmed(false);
      setVendorSkillAnswer('');
      setVendorVerificationDate('');
      setVendorVerificationMethod('');
      setVendorVerificationReference('');
      setVendorReviewNotes('');
      vendorRaffleLastSavedRef.current = vendorRaffleSignature(
        Boolean(data.settings?.enabled),
        data.settings?.prize_description || '',
        data.settings?.prize_approx_value_cad
          ? String(data.settings.prize_approx_value_cad)
          : '',
        normalizeRaffleMaxWinners(data.settings?.max_winners),
        data.settings?.exclude_previous_winners !== false,
        Boolean(data.settings?.legal_terms_accepted),
        data.settings?.legal_terms_version || '',
      );
      vendorRaffleLastFailedSignatureRef.current = '';
      setVendorRaffleSaveError(null);
      setVendorRaffleSaveMessage(
        'Changes save automatically to the app and website.',
      );
      finishVendorRaffleHydration();
    },
    [finishVendorRaffleHydration, vendorRaffleSignature],
  );

  const fetchVendorRaffle = useCallback(
    async (openGeneration: number) => {
      const requestIsCurrent = () =>
        vendorRaffleOpenGenerationRef.current === openGeneration;
      vendorRaffleLoadedRef.current = false;
      vendorRaffleHydratingRef.current = false;
      setVendorRaffle(null);
      setVendorRaffleEntries([]);
      setVendorRaffleEntryReasons({});
      setVendorRaffleEntryQuery('');
      setVendorRaffleEntryFilter('all');
      setVendorRaffleExpandedEntryReference(null);
      setVendorRaffleError(null);
      if (!nativeSession?.user_id || !nativeSession?.token) {
        if (!requestIsCurrent()) return;
        setVendorRaffleLoading(false);
        setVendorRaffleError('Sign in again before opening vendor draw tools.');
        return;
      }
      setVendorRaffleLoading(true);
      try {
        const { response, data } =
          await fetchQrBingoJsonWithTimeout<QrBingoVendorRaffleResponse>(
            VENDOR_RAFFLE_FUNCTION_URL,
            {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${APP_BACKEND_PUBLISHABLE_KEY}`,
                apikey: APP_BACKEND_PUBLISHABLE_KEY,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                action: 'vendor_raffle_get',
                native_session: nativeSession,
              }),
            },
            'Vendor draw tools took too long to load. Check your connection and try again.',
          );
        if (!response.ok || data?.ok === false) {
          throw new Error(
            data?.detail || data?.error || 'Vendor draw tools are unavailable.',
          );
        }
        if (!isCompleteVendorRaffleDashboard(data)) {
          throw new Error(
            'Vendor draw tools did not return an eligible vendor.',
          );
        }
        if (!requestIsCurrent()) return;
        applyVendorRaffle(data);
      } catch (error) {
        if (!requestIsCurrent()) return;
        setVendorRaffle(null);
        setVendorRaffleError(
          error instanceof Error
            ? error.message
            : 'Vendor draw tools are unavailable.',
        );
      } finally {
        if (requestIsCurrent()) setVendorRaffleLoading(false);
      }
    },
    [applyVendorRaffle, nativeSession],
  );

  const openVendorRaffle = useCallback(() => {
    if (vendorRaffleOpenInFlightRef.current) return;
    const openGeneration = vendorRaffleOpenGenerationRef.current + 1;
    vendorRaffleOpenGenerationRef.current = openGeneration;
    vendorRaffleLoadedRef.current = false;
    vendorRaffleEntriesAutoLoadRef.current = false;
    vendorRaffleEntriesRequestGenerationRef.current += 1;
    vendorRaffleEntriesInFlightRef.current = null;
    vendorRaffleActionInFlightRef.current = null;
    setVendorRaffleSaveMessage('');
    setVendorRaffleSaveError(null);
    setVendorRaffleWizardStep(1);
    setVendorRaffleGuideExpanded(false);
    setVendorRaffleEmailPreviewExpanded(false);
    setVendorRaffleSlideIndex(0);
    setVendorRaffleRulesExpanded(false);
    setShowVendorRaffle(true);
    const request = fetchVendorRaffle(openGeneration).finally(() => {
      if (vendorRaffleOpenInFlightRef.current === request) {
        vendorRaffleOpenInFlightRef.current = null;
      }
    });
    vendorRaffleOpenInFlightRef.current = request;
    void request;
  }, [fetchVendorRaffle]);

  useEffect(() => {
    if (showVendorRaffle) return;
    setVendorRaffleEntries([]);
    setVendorRaffleEntryReasons({});
    setVendorRaffleEntryQuery('');
    setVendorRaffleEntryFilter('all');
    setVendorRaffleExpandedEntryReference(null);
  }, [showVendorRaffle]);

  useEffect(() => {
    if (
      !showVendorMenu ||
      vendorDrawOpenRequestId <= 0 ||
      vendorDrawOpenRequestId === lastVendorDrawOpenRequestRef.current
    ) {
      return;
    }

    lastVendorDrawOpenRequestRef.current = vendorDrawOpenRequestId;
    openVendorRaffle();
  }, [openVendorRaffle, showVendorMenu, vendorDrawOpenRequestId]);

  const saveVendorRaffle = useCallback(
    async (options: { silent?: boolean } = {}) => {
      if (
        accountDeletionIsInFlight() ||
        !nativeSession?.user_id ||
        !nativeSession?.token ||
        vendorRaffleSaveInFlightRef.current
      )
        return false;
      const deletionGeneration = getAccountDeletionGeneration();
      const saveEditGeneration = vendorRaffleLocalEditGenerationRef.current;
      const saveSeq = vendorRaffleSaveSeqRef.current + 1;
      vendorRaffleSaveSeqRef.current = saveSeq;
      const draftEnabled = raffleEnabled;
      const draftPrizeTitle = rafflePrizeTitle;
      const draftPrizeDescription = rafflePrizeDescription;
      const draftPrizeApproxValueCad = rafflePrizeApproxValueCad;
      const draftMaxWinners = raffleMaxWinners;
      const draftExcludePreviousWinners = raffleExcludePreviousWinners;
      const draftLegalAccepted = raffleLegalAccepted;
      const materialTermsLocked = Boolean(vendorRaffle?.material_terms_locked);
      const currentSettings = vendorRaffle?.settings;
      const requestPrizeTitle = materialTermsLocked
        ? currentSettings?.prize_title || draftPrizeTitle
        : draftPrizeDescription.trim().split(/\r?\n/)[0]?.trim() ||
          draftPrizeTitle;
      const requestPrizeDescription = materialTermsLocked
        ? currentSettings?.prize_description || draftPrizeDescription
        : draftPrizeDescription;
      const requestPrizeApproxValueCad = materialTermsLocked
        ? Number(
            currentSettings?.prize_approx_value_cad || draftPrizeApproxValueCad,
          )
        : Number(draftPrizeApproxValueCad);
      const requestMaxWinners = materialTermsLocked
        ? normalizeRaffleMaxWinners(currentSettings?.max_winners)
        : draftMaxWinners;
      const requestExcludePreviousWinners = materialTermsLocked
        ? currentSettings?.exclude_previous_winners !== false
        : draftExcludePreviousWinners;
      // Material prize terms stay locked after opening, but a vendor must still
      // be able to accept a newly published rules version. Keep acceptance tied
      // to the current draft and exact current version instead of freezing the
      // previous acceptance with the prize fields.
      const requestLegalAccepted = draftLegalAccepted;
      const draftRulesViewed =
        requestLegalAccepted &&
        vendorRaffleRulesViewedVersion === vendorRaffleRulesVersion;
      const combinedAcceptance = Boolean(
        requestLegalAccepted && draftRulesViewed,
      );
      const savedSignature = vendorRaffleSignature(
        draftEnabled,
        draftPrizeDescription,
        draftPrizeApproxValueCad,
        draftMaxWinners,
        draftExcludePreviousWinners,
        draftLegalAccepted,
        vendorRaffleRulesViewedVersion,
      );
      vendorRaffleSaveInFlightRef.current = true;
      setVendorRaffleSaving(true);
      setVendorRaffleError(null);
      setVendorRaffleSaveError(null);
      try {
        const { response, data } =
          await fetchQrBingoJsonWithTimeout<QrBingoVendorRaffleResponse>(
            VENDOR_RAFFLE_FUNCTION_URL,
            {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${APP_BACKEND_PUBLISHABLE_KEY}`,
                apikey: APP_BACKEND_PUBLISHABLE_KEY,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                action: 'vendor_raffle_update',
                native_session: nativeSession,
                enabled: draftEnabled,
                prize_title: requestPrizeTitle,
                prize_description: requestPrizeDescription,
                prize_approx_value_cad: requestPrizeApproxValueCad,
                max_winners: requestMaxWinners,
                exclude_previous_winners: requestExcludePreviousWinners,
                legal_terms_accepted: combinedAcceptance,
                consent_version: vendorRaffleRulesVersion,
                rules_viewed: combinedAcceptance,
                apple_non_sponsor_acknowledged: combinedAcceptance,
                vendor_responsibility_acknowledged: combinedAcceptance,
                vendor_responsibility_disclosure:
                  vendorResponsibilityDisclosure,
                client_platform: Platform.OS,
                settings_updated_at: vendorRaffle?.settings?.updated_at || '',
              }),
            },
            'Saving your vendor draw took too long. Check your connection and try again.',
          );
        if (!accountMutationIsCurrent(deletionGeneration)) return false;
        if (!response.ok || data?.ok === false) {
          if (response.status === 409 || data?.conflict) {
            if (isCompleteVendorRaffleDashboard(data)) {
              // A complete 409 means another save won the optimistic lock (or
              // the legal agreement changed). Keep the wizard on the same step,
              // but restore every field from the authoritative response. Merely
              // borrowing its new timestamp while keeping stale draft values
              // would let a retry overwrite changes from another device.
              applyVendorRaffle(data, { preserveWizardContext: true });
            }
            const message =
              data?.detail ||
              data?.error ||
              'This draw was updated in another tab. Review the latest settings before saving again.';
            if (!options.silent) Alert.alert('Updated in another tab', message);
            vendorRaffleLastFailedSignatureRef.current = '';
            setVendorRaffleSaveError(null);
            setVendorRaffleSaveMessage(message);
            return false;
          }
          throw new Error(
            data?.detail || data?.error || 'Could not save this draw.',
          );
        }
        if (!isCompleteVendorRaffleDashboard(data)) {
          throw new Error(
            'The saved draw response was incomplete. Your current screen was kept open; try again.',
          );
        }
        const acceptancePersisted =
          data.vendor_acceptance_current ??
          Boolean(
            data.settings.legal_terms_accepted &&
            data.settings.legal_terms_version === data.rules_version,
          );
        if (combinedAcceptance && !acceptancePersisted) {
          throw new Error(
            'Your agreement was not saved. Your prize details were left unchanged; tap Try again.',
          );
        }
        setVendorRaffle(data);
        vendorRaffleLastSavedRef.current = savedSignature;
        vendorRaffleLastFailedSignatureRef.current = '';
        if (
          vendorRaffleLocalEditGenerationRef.current === saveEditGeneration &&
          saveSeq === vendorRaffleSaveSeqRef.current
        ) {
          vendorRaffleHydratingRef.current = true;
          setRaffleEnabled(Boolean(data.settings?.enabled));
          setRafflePrizeTitle(data.settings?.prize_title || '');
          setRafflePrizeDescription(data.settings?.prize_description || '');
          setRafflePrizeApproxValueCad(
            data.settings?.prize_approx_value_cad
              ? String(data.settings.prize_approx_value_cad)
              : '',
          );
          setRaffleMaxWinners(
            normalizeRaffleMaxWinners(data.settings?.max_winners),
          );
          setRaffleExcludePreviousWinners(
            data.settings?.exclude_previous_winners !== false,
          );
          const currentRulesAccepted =
            data.vendor_acceptance_current ??
            Boolean(
              data.settings?.legal_terms_accepted &&
              data.settings?.legal_terms_version === data.rules_version,
            );
          setRaffleLegalAccepted(currentRulesAccepted);
          setVendorRaffleRulesViewedVersion(
            currentRulesAccepted ? data.rules_version || '' : '',
          );
          finishVendorRaffleHydration();
        }
        setVendorRaffleSaveMessage(
          vendorRaffleLocalEditGenerationRef.current !== saveEditGeneration
            ? 'Saving your latest changes...'
            : 'Saved to the app and website.',
        );
        setVendorRaffleSaveError(null);
        if (!options.silent) {
          Alert.alert(
            'Saved',
            'Your QR Bingo vendor draw settings are synced in the app and on the website.',
          );
        }
        return true;
      } catch (error) {
        if (!accountMutationIsCurrent(deletionGeneration)) return false;
        vendorRaffleLastFailedSignatureRef.current = savedSignature;
        const message =
          error instanceof Error ? error.message : 'Could not save this draw.';
        setVendorRaffleSaveError(message);
        setVendorRaffleSaveMessage('Could not save. Tap Try again.');
        return false;
      } finally {
        vendorRaffleSaveInFlightRef.current = false;
        setVendorRaffleSaving(false);
      }
    },
    [
      applyVendorRaffle,
      finishVendorRaffleHydration,
      nativeSession,
      raffleEnabled,
      raffleExcludePreviousWinners,
      raffleLegalAccepted,
      raffleMaxWinners,
      rafflePrizeDescription,
      rafflePrizeApproxValueCad,
      rafflePrizeTitle,
      vendorRaffle,
      vendorRaffleRulesVersion,
      vendorResponsibilityDisclosure,
      vendorRaffleRulesViewedVersion,
      vendorRaffleSignature,
    ],
  );

  const runVendorRaffleSave = useCallback(
    (options: { silent?: boolean } = {}) => {
      const currentSave = vendorRaffleSavePromiseRef.current;
      if (currentSave) return currentSave;
      const savePromise = saveVendorRaffle(options);
      vendorRaffleSavePromiseRef.current = savePromise;
      void savePromise.finally(() => {
        if (vendorRaffleSavePromiseRef.current === savePromise) {
          vendorRaffleSavePromiseRef.current = null;
        }
      });
      return savePromise;
    },
    [saveVendorRaffle],
  );

  const flushVendorRaffleSaveBeforeAction = useCallback(async () => {
    if (vendorRaffleSaveTimerRef.current) {
      clearTimeout(vendorRaffleSaveTimerRef.current);
      vendorRaffleSaveTimerRef.current = null;
    }
    if (
      !vendorRaffle ||
      !vendorRaffleLoadedRef.current ||
      vendorRaffleHydratingRef.current
    ) {
      return false;
    }

    const editGeneration = vendorRaffleLocalEditGenerationRef.current;
    const pendingSave = vendorRaffleSavePromiseRef.current;
    if (pendingSave && !(await pendingSave)) return false;
    if (vendorRaffleLocalEditGenerationRef.current !== editGeneration) {
      return false;
    }

    const currentSignature = vendorRaffleSignature(
      raffleEnabled,
      rafflePrizeDescription,
      rafflePrizeApproxValueCad,
      raffleMaxWinners,
      raffleExcludePreviousWinners,
      raffleLegalAccepted,
      vendorRaffleRulesViewedVersion,
    );
    if (currentSignature === vendorRaffleLastSavedRef.current) return true;

    setVendorRaffleSaveMessage('Saving changes before continuing...');
    const saved = await runVendorRaffleSave({ silent: true });
    return (
      saved &&
      vendorRaffleLocalEditGenerationRef.current === editGeneration &&
      vendorRaffleLastSavedRef.current === currentSignature
    );
  }, [
    raffleEnabled,
    raffleExcludePreviousWinners,
    raffleLegalAccepted,
    raffleMaxWinners,
    rafflePrizeDescription,
    rafflePrizeApproxValueCad,
    runVendorRaffleSave,
    vendorRaffle,
    vendorRaffleRulesViewedVersion,
    vendorRaffleSignature,
  ]);

  const prepareVendorRaffleAction = useCallback(
    async (actionKey: string) => {
      if (accountDeletionIsInFlight() || vendorRaffleActionInFlightRef.current)
        return false;
      const deletionGeneration = getAccountDeletionGeneration();
      const preparationOwner = `prepare:${actionKey}`;
      vendorRaffleActionInFlightRef.current = preparationOwner;
      const ready = await flushVendorRaffleSaveBeforeAction();
      if (!accountMutationIsCurrent(deletionGeneration)) {
        if (vendorRaffleActionInFlightRef.current === preparationOwner) {
          vendorRaffleActionInFlightRef.current = null;
        }
        return false;
      }
      if (vendorRaffleActionInFlightRef.current !== preparationOwner) {
        return false;
      }
      if (!ready) {
        vendorRaffleActionInFlightRef.current = null;
        setVendorRaffleSaveMessage(
          'Save your latest changes, then try that action again.',
        );
        Alert.alert(
          'Finish saving first',
          'Your draw action was not started. Check that the latest settings are saved, then try again.',
        );
        return false;
      }
      return true;
    },
    [flushVendorRaffleSaveBeforeAction],
  );

  const closeVendorRaffle = useCallback(async (): Promise<boolean> => {
    if (vendorRaffleActionInFlightRef.current) {
      Alert.alert(
        'Action in progress',
        'Wait for the current draw action to finish before closing.',
      );
      return false;
    }
    const closeOwner = 'close:vendor-raffle';
    vendorRaffleActionInFlightRef.current = closeOwner;
    try {
      if (vendorRaffleSaveTimerRef.current) {
        clearTimeout(vendorRaffleSaveTimerRef.current);
        vendorRaffleSaveTimerRef.current = null;
      }

      if (
        !vendorRaffle ||
        !vendorRaffleLoadedRef.current ||
        vendorRaffleHydratingRef.current
      ) {
        vendorRaffleOpenGenerationRef.current += 1;
        vendorRaffleOpenInFlightRef.current = null;
        vendorRaffleEntriesRequestGenerationRef.current += 1;
        vendorRaffleEntriesInFlightRef.current = null;
        setVendorRaffleLoading(false);
        setShowVendorRaffle(false);
        return true;
      }

      const currentSignature = vendorRaffleSignature(
        raffleEnabled,
        rafflePrizeDescription,
        rafflePrizeApproxValueCad,
        raffleMaxWinners,
        raffleExcludePreviousWinners,
        raffleLegalAccepted,
        vendorRaffleRulesViewedVersion,
      );
      if (currentSignature === vendorRaffleLastSavedRef.current) {
        vendorRaffleEntriesRequestGenerationRef.current += 1;
        vendorRaffleEntriesInFlightRef.current = null;
        setShowVendorRaffle(false);
        return true;
      }

      const editGenerationAtClose = vendorRaffleLocalEditGenerationRef.current;
      setVendorRaffleSaveMessage('Saving before closing...');
      const saved = await flushVendorRaffleSaveBeforeAction();
      if (!saved) {
        Alert.alert(
          'Changes not saved',
          'The draw settings remain open so you can check the error and try again.',
        );
        return false;
      }
      if (
        vendorRaffleLocalEditGenerationRef.current !== editGenerationAtClose
      ) {
        setVendorRaffleSaveMessage(
          'You made another change while saving. Wait for it to save before closing.',
        );
        return false;
      }
      vendorRaffleEntriesRequestGenerationRef.current += 1;
      vendorRaffleEntriesInFlightRef.current = null;
      setShowVendorRaffle(false);
      return true;
    } finally {
      if (vendorRaffleActionInFlightRef.current === closeOwner) {
        vendorRaffleActionInFlightRef.current = null;
      }
    }
  }, [
    raffleEnabled,
    raffleExcludePreviousWinners,
    raffleLegalAccepted,
    raffleMaxWinners,
    rafflePrizeDescription,
    rafflePrizeApproxValueCad,
    flushVendorRaffleSaveBeforeAction,
    vendorRaffle,
    vendorRaffleRulesViewedVersion,
    vendorRaffleSignature,
  ]);

  useEffect(() => {
    const closeVendorDrawIfOpen = () =>
      showVendorRaffle ? closeVendorRaffle() : Promise.resolve(true);
    onRegisterVendorDrawCloser(closeVendorDrawIfOpen);
    return () => onRegisterVendorDrawCloser(null);
  }, [closeVendorRaffle, onRegisterVendorDrawCloser, showVendorRaffle]);

  useEffect(() => {
    if (
      !showVendorRaffle ||
      !vendorRaffle ||
      !vendorRaffleLoadedRef.current ||
      vendorRaffleHydratingRef.current
    ) {
      return;
    }
    const signature = vendorRaffleSignature(
      raffleEnabled,
      rafflePrizeDescription,
      rafflePrizeApproxValueCad,
      raffleMaxWinners,
      raffleExcludePreviousWinners,
      raffleLegalAccepted,
      vendorRaffleRulesViewedVersion,
    );
    if (signature === vendorRaffleLastSavedRef.current) {
      // A save can finish after the vendor has tapped back to an already-saved
      // value. No follow-up request is needed in that case, so clear only stale
      // pending copy instead of leaving the wizard on "Saving changes...".
      setVendorRaffleSaveMessage((current) =>
        /saving|waiting/i.test(current)
          ? 'Saved to the app and website.'
          : current,
      );
      return;
    }
    if (signature === vendorRaffleLastFailedSignatureRef.current) return;
    if (vendorRaffleActionInFlightRef.current) {
      setVendorRaffleSaveMessage('Waiting for the current draw action...');
      return;
    }
    if (vendorRaffleSaving || vendorRaffleSaveInFlightRef.current) {
      setVendorRaffleSaveMessage('Saving your latest changes...');
      return;
    }

    setVendorRaffleSaveMessage('Saving after you pause...');
    if (vendorRaffleSaveTimerRef.current)
      clearTimeout(vendorRaffleSaveTimerRef.current);
    vendorRaffleSaveTimerRef.current = setTimeout(() => {
      vendorRaffleSaveTimerRef.current = null;
      void runVendorRaffleSave({ silent: true });
    }, 1200);

    return () => {
      if (vendorRaffleSaveTimerRef.current) {
        clearTimeout(vendorRaffleSaveTimerRef.current);
        vendorRaffleSaveTimerRef.current = null;
      }
    };
  }, [
    raffleEnabled,
    raffleExcludePreviousWinners,
    raffleLegalAccepted,
    raffleMaxWinners,
    rafflePrizeDescription,
    rafflePrizeApproxValueCad,
    runVendorRaffleSave,
    showVendorRaffle,
    vendorRaffle,
    vendorRaffleRulesViewedVersion,
    vendorRaffleSaving,
    vendorRaffleSignature,
  ]);

  const fetchVendorRaffleEntries = useCallback(() => {
    if (!nativeSession?.user_id || !nativeSession?.token)
      return Promise.resolve();
    const existingRequest = vendorRaffleEntriesInFlightRef.current;
    if (existingRequest) return existingRequest;

    const requestGeneration =
      vendorRaffleEntriesRequestGenerationRef.current + 1;
    vendorRaffleEntriesRequestGenerationRef.current = requestGeneration;
    const requestIsCurrent = () =>
      vendorRaffleEntriesRequestGenerationRef.current === requestGeneration;
    setVendorRaffleEntriesLoading(true);
    setVendorRaffleError(null);

    const request = (async () => {
      try {
        const { response, data } =
          await fetchQrBingoJsonWithTimeout<QrBingoVendorRaffleResponse>(
            VENDOR_RAFFLE_FUNCTION_URL,
            {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${APP_BACKEND_PUBLISHABLE_KEY}`,
                apikey: APP_BACKEND_PUBLISHABLE_KEY,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                action: 'vendor_raffle_entries_get',
                native_session: nativeSession,
              }),
            },
            'Loading the entrant selection list took too long. Check your connection and try again.',
          );
        if (!requestIsCurrent()) return;
        if (!response.ok || data?.ok === false) {
          throw new Error(
            data?.detail ||
              data?.error ||
              'Could not load the entrant selection list.',
          );
        }
        setVendorRaffleEntries(data.entries || []);
        setVendorRaffle((current) =>
          current
            ? {
                ...current,
                entrant_count: data.entrant_count ?? current.entrant_count,
                entry_count: data.entry_count ?? current.entry_count,
                eligible_entry_count:
                  data.eligible_entry_count ?? current.eligible_entry_count,
                included_entry_count:
                  data.included_entry_count ?? current.included_entry_count,
                excluded_entry_count:
                  data.excluded_entry_count ?? current.excluded_entry_count,
                can_update_entries:
                  data.can_update_entries ?? current.can_update_entries,
                selection_in_progress:
                  data.selection_in_progress ?? current.selection_in_progress,
              }
            : current,
        );
      } catch (error) {
        if (requestIsCurrent()) {
          setVendorRaffleError(
            error instanceof Error
              ? error.message
              : 'Could not load the entrant selection list.',
          );
        }
      } finally {
        if (requestIsCurrent()) setVendorRaffleEntriesLoading(false);
      }
    })().finally(() => {
      if (vendorRaffleEntriesInFlightRef.current === request) {
        vendorRaffleEntriesInFlightRef.current = null;
      }
    });
    vendorRaffleEntriesInFlightRef.current = request;
    return request;
  }, [nativeSession]);

  useEffect(() => {
    if (
      !showVendorRaffle ||
      vendorRaffleWizardStep !== 3 ||
      vendorRaffleEntriesAutoLoadRef.current ||
      vendorRaffleEntriesLoading
    ) {
      return;
    }

    vendorRaffleEntriesAutoLoadRef.current = true;
    void fetchVendorRaffleEntries();
  }, [
    fetchVendorRaffleEntries,
    showVendorRaffle,
    vendorRaffleEntriesLoading,
    vendorRaffleWizardStep,
  ]);

  const updateVendorRaffleEntry = async (
    entry: QrBingoRaffleEntry,
    included: boolean,
  ) => {
    if (
      accountDeletionIsInFlight() ||
      !nativeSession?.user_id ||
      !nativeSession?.token ||
      vendorRaffleEntryUpdatingReference ||
      vendorRaffleActionInFlightRef.current ||
      vendorRaffleHasPendingPotentialWinner
    )
      return;
    const deletionGeneration = getAccountDeletionGeneration();
    const participantReference = entry.participant_reference.trim();
    const typedReason = String(
      vendorRaffleEntryReasons[participantReference] || '',
    ).trim();
    const reason = included
      ? 'Restored by the vendor in the WeddingWin app.'
      : typedReason;
    if (!participantReference) {
      setVendorRaffleError(
        'This entrant is missing its protected participant reference. Refresh the list and try again.',
      );
      return;
    }
    if (!included && !reason) {
      setVendorRaffleError(
        'Add a short reason before excluding this entrant from random selection.',
      );
      return;
    }

    const actionKey = `entry:${participantReference}:${included ? 'restore' : 'exclude'}`;
    if (!(await prepareVendorRaffleAction(actionKey))) return;
    vendorRaffleActionInFlightRef.current = `confirm:${actionKey}`;
    Alert.alert(
      included ? 'Restore to selection pool?' : 'Exclude from selection pool?',
      included
        ? `${entry.couple_name || 'This entrant'} will be included again. The no-repeat winner rule may still keep a prior winner out of the eligible pool. Their opted-in record has remained in the CSV.`
        : `${entry.couple_name || 'This entrant'} will stay in the entrant CSV, but will not be eligible for random selection until restored.`,
      [
        {
          text: 'Cancel',
          style: 'cancel',
          onPress: () => {
            if (
              vendorRaffleActionInFlightRef.current === `confirm:${actionKey}`
            ) {
              vendorRaffleActionInFlightRef.current = null;
            }
          },
        },
        {
          text: included ? 'Restore' : 'Exclude',
          style: included ? 'default' : 'destructive',
          onPress: async () => {
            if (!accountMutationIsCurrent(deletionGeneration)) {
              if (
                vendorRaffleActionInFlightRef.current === `confirm:${actionKey}`
              ) {
                vendorRaffleActionInFlightRef.current = null;
              }
              return;
            }
            if (
              vendorRaffleActionInFlightRef.current !== `confirm:${actionKey}`
            )
              return;
            vendorRaffleActionInFlightRef.current = `request:${actionKey}`;
            vendorRaffleEntriesRequestGenerationRef.current += 1;
            vendorRaffleEntriesInFlightRef.current = null;
            setVendorRaffleEntryUpdatingReference(participantReference);
            setVendorRaffleError(null);
            try {
              const { response, data } =
                await fetchQrBingoJsonWithTimeout<QrBingoVendorRaffleResponse>(
                  VENDOR_RAFFLE_FUNCTION_URL,
                  {
                    method: 'POST',
                    headers: {
                      Authorization: `Bearer ${APP_BACKEND_PUBLISHABLE_KEY}`,
                      apikey: APP_BACKEND_PUBLISHABLE_KEY,
                      'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                      action: 'vendor_raffle_entry_update',
                      native_session: nativeSession,
                      participant_reference: participantReference,
                      included,
                      reason,
                      exclusion_reason: reason,
                      client_platform: 'ios',
                    }),
                  },
                  included
                    ? 'Restoring this entrant took too long. Check your connection and try again.'
                    : 'Excluding this entrant took too long. Check your connection and try again.',
                );
              if (!accountMutationIsCurrent(deletionGeneration)) return;
              if (!response.ok || data?.ok === false) {
                throw new Error(
                  data?.detail ||
                    data?.error ||
                    'Could not update this entrant.',
                );
              }
              setVendorRaffle((current) =>
                current
                  ? {
                      ...current,
                      entrant_count:
                        data.entrant_count ?? current.entrant_count,
                      entry_count: data.entry_count ?? current.entry_count,
                      eligible_entry_count:
                        data.eligible_entry_count ??
                        current.eligible_entry_count,
                      included_entry_count:
                        data.included_entry_count ??
                        current.included_entry_count,
                      excluded_entry_count:
                        data.excluded_entry_count ??
                        current.excluded_entry_count,
                      can_update_entries:
                        data.can_update_entries ?? current.can_update_entries,
                      selection_in_progress:
                        data.selection_in_progress ??
                        current.selection_in_progress,
                    }
                  : current,
              );
              if (data.entries) setVendorRaffleEntries(data.entries);
              else {
                setVendorRaffleEntries((current) =>
                  current.map((row) =>
                    row.participant_reference === participantReference
                      ? {
                          ...row,
                          included,
                          pool_status: included ? 'included' : 'excluded',
                          exclusion_reason: included ? '' : reason,
                        }
                      : row,
                  ),
                );
              }
              setVendorRaffleEntryReasons((current) => ({
                ...current,
                [participantReference]: '',
              }));
              Alert.alert(
                included ? 'Entrant restored' : 'Entrant excluded',
                included
                  ? 'This entrant is included again. If the no-repeat winner rule applies, a prior winner still remains ineligible. Their CSV record was never removed.'
                  : 'This entrant is out of the selection pool but remains in the vendor CSV.',
              );
            } catch (error) {
              if (!accountMutationIsCurrent(deletionGeneration)) return;
              setVendorRaffleError(
                error instanceof Error
                  ? error.message
                  : 'Could not update this entrant.',
              );
            } finally {
              if (
                vendorRaffleActionInFlightRef.current === `request:${actionKey}`
              ) {
                vendorRaffleActionInFlightRef.current = null;
              }
              setVendorRaffleEntryUpdatingReference(null);
            }
          },
        },
      ],
    );
  };

  const drawVendorWinner = async () => {
    if (
      accountDeletionIsInFlight() ||
      !nativeSession?.user_id ||
      !nativeSession?.token ||
      vendorRaffleDrawing ||
      vendorRaffleActionInFlightRef.current
    )
      return;
    const deletionGeneration = getAccountDeletionGeneration();
    const actionKey = 'draw-winner';
    if (!(await prepareVendorRaffleAction(actionKey))) return;
    vendorRaffleActionInFlightRef.current = `confirm:${actionKey}`;
    Alert.alert(
      'Select a potential winner?',
      `WeddingWin will randomly select one potential winner from ${vendorRaffleSelectionPoolCount} included ${vendorRaffleSelectionPoolCount === 1 ? 'entrant' : 'entrants'}. No email or prize claim is sent at this step.`,
      [
        {
          text: 'Cancel',
          style: 'cancel',
          onPress: () => {
            if (
              vendorRaffleActionInFlightRef.current === `confirm:${actionKey}`
            ) {
              vendorRaffleActionInFlightRef.current = null;
            }
          },
        },
        {
          text: 'Select Potential Winner',
          onPress: async () => {
            if (!accountMutationIsCurrent(deletionGeneration)) {
              if (
                vendorRaffleActionInFlightRef.current === `confirm:${actionKey}`
              ) {
                vendorRaffleActionInFlightRef.current = null;
              }
              return;
            }
            if (
              vendorRaffleActionInFlightRef.current !== `confirm:${actionKey}`
            )
              return;
            vendorRaffleActionInFlightRef.current = `request:${actionKey}`;
            vendorRaffleEntriesRequestGenerationRef.current += 1;
            vendorRaffleEntriesInFlightRef.current = null;
            setVendorRaffleDrawing(true);
            setVendorRaffleError(null);
            try {
              const { response, data } = await fetchQrBingoJsonWithTimeout<
                QrBingoVendorRaffleResponse & { draw?: QrBingoRaffleDraw }
              >(
                VENDOR_RAFFLE_FUNCTION_URL,
                {
                  method: 'POST',
                  headers: {
                    Authorization: `Bearer ${APP_BACKEND_PUBLISHABLE_KEY}`,
                    apikey: APP_BACKEND_PUBLISHABLE_KEY,
                    'Content-Type': 'application/json',
                  },
                  body: JSON.stringify({
                    action: 'vendor_raffle_draw',
                    native_session: nativeSession,
                  }),
                },
                'Selecting a potential winner took too long. Check your connection and try again.',
              );
              if (!accountMutationIsCurrent(deletionGeneration)) return;
              if (!response.ok || data?.ok === false) {
                throw new Error(
                  data?.detail ||
                    data?.error ||
                    'Could not select a potential winner.',
                );
              }
              if (!isCompleteVendorRaffleDashboard(data)) {
                throw new Error(
                  'The winner response was incomplete. Reload the vendor draw before trying again.',
                );
              }
              applyVendorRaffle(data, { preserveWizardContext: true });
              await fetchVendorRaffleEntries();
              if (!accountMutationIsCurrent(deletionGeneration)) return;
              Alert.alert(
                'Potential Winner Selected',
                `${data.draw?.winner_name || 'Potential winner selected.'}\n\nNo email or prize claim was sent. Complete the verification shown in the dashboard, then use that verified selection's separate Send Winner Email button.`,
              );
            } catch (error) {
              if (!accountMutationIsCurrent(deletionGeneration)) return;
              const message =
                error instanceof Error
                  ? error.message
                  : 'Could not select a potential winner.';
              setVendorRaffleError(message);
              Alert.alert('Potential winner not selected', message);
            } finally {
              if (
                vendorRaffleActionInFlightRef.current === `request:${actionKey}`
              ) {
                vendorRaffleActionInFlightRef.current = null;
              }
              setVendorRaffleDrawing(false);
            }
          },
        },
      ],
    );
  };

  const sendVendorWinnerNotice = async (draw: QrBingoRaffleDraw) => {
    if (
      accountDeletionIsInFlight() ||
      !nativeSession?.user_id ||
      !nativeSession?.token ||
      vendorRaffleSendingDrawId ||
      vendorRaffleActionInFlightRef.current
    )
      return;
    const deletionGeneration = getAccountDeletionGeneration();
    const actionKey = `send-winner:${draw.id}`;
    if (!(await prepareVendorRaffleAction(actionKey))) return;
    vendorRaffleActionInFlightRef.current = `confirm:${actionKey}`;
    Alert.alert(
      vendorRaffle?.app_review_fixture
        ? 'Test the send step?'
        : 'Send winner email?',
      vendorRaffle?.app_review_fixture
        ? 'This isolated App Review fixture will exercise the separate send action but will not send an email or record a delivery timestamp.'
        : vendorRaffle?.email_test_fixture
          ? 'This isolated QA fixture sends one production-rendered test message only to its allowlisted mailbox. It does not award a real prize.'
          : `Send the verified winner email for selection #${draw.draw_number} now? Selection and verification are already recorded; this action only sends the fulfillment notices.`,
      [
        {
          text: 'Cancel',
          style: 'cancel',
          onPress: () => {
            if (
              vendorRaffleActionInFlightRef.current === `confirm:${actionKey}`
            ) {
              vendorRaffleActionInFlightRef.current = null;
            }
          },
        },
        {
          text: vendorRaffle?.app_review_fixture
            ? 'Run Safe Test'
            : 'Send Winner Email',
          onPress: async () => {
            if (!accountMutationIsCurrent(deletionGeneration)) {
              if (
                vendorRaffleActionInFlightRef.current === `confirm:${actionKey}`
              ) {
                vendorRaffleActionInFlightRef.current = null;
              }
              return;
            }
            if (
              vendorRaffleActionInFlightRef.current !== `confirm:${actionKey}`
            )
              return;
            vendorRaffleActionInFlightRef.current = `request:${actionKey}`;
            setVendorRaffleSendingDrawId(draw.id);
            setVendorRaffleError(null);
            try {
              const { response, data } = await fetchQrBingoJsonWithTimeout<
                QrBingoVendorRaffleResponse & { draw?: QrBingoRaffleDraw }
              >(
                VENDOR_RAFFLE_FUNCTION_URL,
                {
                  method: 'POST',
                  headers: {
                    Authorization: `Bearer ${APP_BACKEND_PUBLISHABLE_KEY}`,
                    apikey: APP_BACKEND_PUBLISHABLE_KEY,
                    'Content-Type': 'application/json',
                  },
                  body: JSON.stringify({
                    action: 'vendor_raffle_send_notice',
                    native_session: nativeSession,
                    draw_id: draw.id,
                    client_platform: 'ios',
                  }),
                },
                'Sending the winner email took too long. Check your connection and try again.',
              );
              if (!accountMutationIsCurrent(deletionGeneration)) return;
              if (!response.ok || data?.ok === false) {
                throw new Error(
                  data?.detail ||
                    data?.error ||
                    'Could not send the winner email.',
                );
              }
              if (!isCompleteVendorRaffleDashboard(data)) {
                throw new Error(
                  'The winner-email response was incomplete. Reload the vendor draw before trying again.',
                );
              }
              applyVendorRaffle(data, { preserveWizardContext: true });
              if (
                data.suppressed_test_complete === true ||
                data.suppressed === true
              ) {
                Alert.alert(
                  'Test Send Completed',
                  data.message ||
                    'The send step completed safely. This isolated App Review fixture sent no email and recorded no delivery timestamp.',
                );
                return;
              }
              const vendorSent = data.email_result?.vendor?.sent;
              const coupleSent = data.email_result?.couple?.sent;
              Alert.alert(
                'Winner Email Sent',
                vendorSent && coupleSent
                  ? 'The couple and vendor notices were confirmed sent.'
                  : coupleSent
                    ? 'The couple notice was confirmed sent.'
                    : vendorSent
                      ? 'The vendor notice was confirmed sent.'
                      : 'The server confirmed this notice was already processed.',
              );
            } catch (error) {
              if (!accountMutationIsCurrent(deletionGeneration)) return;
              const message =
                error instanceof Error
                  ? error.message
                  : 'Could not send the winner email.';
              setVendorRaffleError(message);
              Alert.alert('Winner email not sent', message);
            } finally {
              if (
                vendorRaffleActionInFlightRef.current === `request:${actionKey}`
              ) {
                vendorRaffleActionInFlightRef.current = null;
              }
              setVendorRaffleSendingDrawId(null);
            }
          },
        },
      ],
    );
  };

  const reviewVendorPotentialWinner = async (
    drawId: string,
    decision: 'confirm' | 'disqualify',
  ) => {
    if (
      accountDeletionIsInFlight() ||
      !nativeSession?.user_id ||
      !nativeSession?.token ||
      vendorRaffleReviewing ||
      vendorRaffleActionInFlightRef.current
    )
      return;
    const deletionGeneration = getAccountDeletionGeneration();
    const showVendorReviewError = (message: string) => {
      setVendorRaffleError(message);
      Alert.alert(
        decision === 'confirm'
          ? 'Complete winner verification'
          : 'Disqualification reason required',
        message,
      );
    };
    const verificationDate = vendorVerificationDate.trim();
    const verificationMethod = vendorVerificationMethod.trim();
    const verificationReference = vendorVerificationReference.trim();
    const additionalReviewNotes = vendorReviewNotes.trim();
    let confirmationEvidenceNotes = '';
    if (decision === 'confirm') {
      if (!vendorEligibilityConfirmed) {
        showVendorReviewError(
          'Attest that your business independently verified eligibility under the current Official Rules.',
        );
        return;
      }
      if (!vendorRulesReleaseConfirmed) {
        showVendorReviewError(
          'Attest that your business obtained the entrant declaration/release outside Wedding Win.',
        );
        return;
      }
      if (!vendorSkillAnswer.trim()) {
        showVendorReviewError(
          "Enter the selected couple's answer to the verification question.",
        );
        return;
      }
      if (!isValidIsoCalendarDate(verificationDate)) {
        showVendorReviewError(
          'Enter the verification date in YYYY-MM-DD format.',
        );
        return;
      }
      if (!verificationMethod) {
        showVendorReviewError(
          'State how your business completed the verification, such as by phone, video call, email, or in person.',
        );
        return;
      }
      if (!verificationReference) {
        showVendorReviewError(
          'Add a non-sensitive evidence reference, such as a call-log time, email subject/date, or signed-release file ID.',
        );
        return;
      }
      confirmationEvidenceNotes = [
        `Date: ${verificationDate}`,
        `Method: ${verificationMethod}`,
        `Reference: ${verificationReference}`,
        additionalReviewNotes
          ? `Additional notes: ${additionalReviewNotes}`
          : '',
      ]
        .filter(Boolean)
        .join('\n');
    }
    if (decision === 'disqualify' && !additionalReviewNotes) {
      showVendorReviewError(
        'Add a clear disqualification reason before preserving this decision.',
      );
      return;
    }

    const actionKey = `review:${drawId}:${decision}`;
    if (!(await prepareVendorRaffleAction(actionKey))) return;
    vendorRaffleActionInFlightRef.current = `confirm:${actionKey}`;
    Alert.alert(
      decision === 'confirm'
        ? 'Confirm potential winner?'
        : 'Disqualify potential winner?',
      decision === 'confirm'
        ? "Your business confirms it completed every required winner-verification step and saved dated evidence. Wedding Win records your attestation; it does not perform or certify your business's eligibility, release, or prize-fulfillment work."
        : 'This preserves the reason in the audit record and allows a replacement potential winner to be selected.',
      [
        {
          text: 'Cancel',
          style: 'cancel',
          onPress: () => {
            if (
              vendorRaffleActionInFlightRef.current === `confirm:${actionKey}`
            ) {
              vendorRaffleActionInFlightRef.current = null;
            }
          },
        },
        {
          text: decision === 'confirm' ? 'Confirm' : 'Disqualify',
          style: decision === 'disqualify' ? 'destructive' : 'default',
          onPress: async () => {
            if (!accountMutationIsCurrent(deletionGeneration)) {
              if (
                vendorRaffleActionInFlightRef.current === `confirm:${actionKey}`
              ) {
                vendorRaffleActionInFlightRef.current = null;
              }
              return;
            }
            if (
              vendorRaffleActionInFlightRef.current !== `confirm:${actionKey}`
            )
              return;
            vendorRaffleActionInFlightRef.current = `request:${actionKey}`;
            vendorRaffleEntriesRequestGenerationRef.current += 1;
            vendorRaffleEntriesInFlightRef.current = null;
            setVendorRaffleReviewing(true);
            setVendorRaffleError(null);
            try {
              const { response, data } =
                await fetchQrBingoJsonWithTimeout<QrBingoVendorRaffleResponse>(
                  VENDOR_RAFFLE_FUNCTION_URL,
                  {
                    method: 'POST',
                    headers: {
                      Authorization: `Bearer ${APP_BACKEND_PUBLISHABLE_KEY}`,
                      apikey: APP_BACKEND_PUBLISHABLE_KEY,
                      'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                      action: 'vendor_raffle_review',
                      native_session: nativeSession,
                      draw_id: drawId,
                      decision,
                      skill_question_answer: vendorSkillAnswer.trim(),
                      eligibility_confirmed: vendorEligibilityConfirmed,
                      rules_release_confirmed: vendorRulesReleaseConfirmed,
                      review_notes:
                        decision === 'confirm'
                          ? confirmationEvidenceNotes
                          : additionalReviewNotes,
                      disqualification_reason: additionalReviewNotes,
                    }),
                  },
                  'Recording the potential-winner review took too long. Check your connection and try again.',
                );
              if (!accountMutationIsCurrent(deletionGeneration)) return;
              if (!response.ok || data?.ok === false) {
                throw new Error(
                  data?.detail ||
                    data?.error ||
                    'Could not record the potential-winner review.',
                );
              }
              if (!isCompleteVendorRaffleDashboard(data)) {
                throw new Error(
                  'The winner-review response was incomplete. Reload the vendor draw before trying again.',
                );
              }
              applyVendorRaffle(data, { preserveWizardContext: true });
              await fetchVendorRaffleEntries();
              if (!accountMutationIsCurrent(deletionGeneration)) return;
              Alert.alert(
                decision === 'confirm'
                  ? 'Verification Recorded'
                  : 'Potential Winner Disqualified',
                decision === 'confirm'
                  ? 'Your vendor attestation and evidence reference are recorded. Your business remains responsible for winner verification and prize fulfillment; Wedding Win has not performed or certified that work.'
                  : 'The audit record is preserved. You may select a replacement potential winner.',
              );
            } catch (error) {
              if (!accountMutationIsCurrent(deletionGeneration)) return;
              const message =
                error instanceof Error
                  ? error.message
                  : 'Could not record the potential-winner review.';
              setVendorRaffleError(message);
              Alert.alert('Winner review not saved', message);
            } finally {
              if (
                vendorRaffleActionInFlightRef.current === `request:${actionKey}`
              ) {
                vendorRaffleActionInFlightRef.current = null;
              }
              setVendorRaffleReviewing(false);
            }
          },
        },
      ],
    );
  };

  const downloadVendorParticipationReport = async () => {
    if (
      accountDeletionIsInFlight() ||
      !nativeSession?.user_id ||
      !nativeSession?.token ||
      vendorRaffleExporting ||
      vendorRaffleActionInFlightRef.current
    )
      return;
    const deletionGeneration = getAccountDeletionGeneration();
    const actionKey = 'export-entrants';
    if (!(await prepareVendorRaffleAction(actionKey))) return;
    vendorRaffleActionInFlightRef.current = `request:${actionKey}`;
    setVendorRaffleExporting(true);
    setVendorRaffleError(null);
    try {
      const { response, data } =
        await fetchQrBingoJsonWithTimeout<QrBingoVendorRaffleResponse>(
          VENDOR_RAFFLE_FUNCTION_URL,
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${APP_BACKEND_PUBLISHABLE_KEY}`,
              apikey: APP_BACKEND_PUBLISHABLE_KEY,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              action: 'vendor_raffle_export',
              client_platform: 'ios',
              native_session: nativeSession,
            }),
          },
          'Creating the draw entrant list took too long. Check your connection and try again.',
        );
      if (!accountMutationIsCurrent(deletionGeneration)) return;
      if (!response.ok || data?.ok === false || !data.report) {
        throw new Error(
          data?.detail ||
            data?.error ||
            'Could not create the draw entrant list.',
        );
      }
      const expectedVendorBingoId = String(
        vendorRaffle?.vendor?.id || '',
      ).trim();
      const expectedVendorBdUserId = String(
        vendorRaffle?.vendor?.user_id || nativeSession.user_id || '',
      ).trim();
      const expectedVendorName = String(
        vendorRaffle?.vendor?.name || '',
      ).trim();
      const expectedEventKey = String(vendorRaffle?.event_key || '').trim();
      const expectedEventRevision = vendorRaffle?.event_revision;
      const expectedRulesVersion = String(
        vendorRaffle?.rules_version || '',
      ).trim();
      if (
        data.report.contains_contact_data !== true ||
        data.report.contact_share_scope !==
          'named_vendor_draw_administration' ||
        data.report.marketing_consent_included !== true ||
        data.report.report_kind !== 'named_vendor_draw_contacts' ||
        data.report.mime_type !== 'text/csv;charset=utf-8' ||
        data.report.rules_version !== expectedRulesVersion ||
        data.report.event_key !== expectedEventKey ||
        data.report.event_revision !== expectedEventRevision ||
        data.report.vendor_bingo_id !== expectedVendorBingoId ||
        data.report.vendor_bd_user_id !== expectedVendorBdUserId ||
        data.report.vendor_name !== expectedVendorName ||
        !expectedRulesVersion ||
        !expectedEventKey ||
        !Number.isSafeInteger(expectedEventRevision) ||
        !expectedVendorBingoId ||
        !expectedVendorBdUserId ||
        !expectedVendorName ||
        typeof data.report.csv !== 'string'
      ) {
        throw new Error(
          'The entrant list did not match this vendor, event, current rules, or required CSV privacy contract.',
        );
      }
      if (data.report.row_count < 1) {
        Alert.alert(
          'No current entrants',
          'No current vendor-draw entries with the required entrant attestations are available to report.',
        );
        return;
      }
      if (!(await Sharing.isAvailableAsync())) {
        throw new Error('File sharing is not available on this device.');
      }
      if (!accountMutationIsCurrent(deletionGeneration)) return;
      const safeFilename =
        data.report.filename.replace(/[^A-Za-z0-9._-]/g, '-') ||
        'weddingwin-participants.csv';
      const reportFile = new File(Paths.cache, safeFilename);
      reportFile.create({ overwrite: true });
      reportFile.write(data.report.csv);
      try {
        await Sharing.shareAsync(reportFile.uri, {
          mimeType: 'text/csv',
          UTI: 'public.comma-separated-values-text',
          dialogTitle: 'Save WeddingWin draw entrant list',
        });
        if (!accountMutationIsCurrent(deletionGeneration)) return;
        setVendorRaffleSaveMessage(
          `Entrant list ready: ${data.report.row_count} current ${data.report.row_count === 1 ? 'entry' : 'entries'}. Every listed couple accepted this vendor's draw and wedding-related marketing terms.`,
        );
      } finally {
        try {
          if (reportFile.exists) reportFile.delete();
        } catch {
          // The OS may already have released or moved the temporary file.
        }
      }
    } catch (error) {
      if (!accountMutationIsCurrent(deletionGeneration)) return;
      setVendorRaffleError(
        error instanceof Error
          ? error.message
          : 'Could not create the draw entrant list.',
      );
    } finally {
      if (vendorRaffleActionInFlightRef.current === `request:${actionKey}`) {
        vendorRaffleActionInFlightRef.current = null;
      }
      setVendorRaffleExporting(false);
    }
  };

  const vendorDrawPrizePreview =
    rafflePrizeDescription.trim().split(/\r?\n/)[0]?.trim() ||
    rafflePrizeTitle.trim() ||
    'Your prize';
  const vendorDrawNamePreview =
    vendorRaffle?.vendor?.name || displayName || 'your business';
  const vendorDrawEmailSubjectPreview =
    vendorRaffle?.couple_email_subject?.trim() ||
    'Your name was selected for a QR Bingo booth draw';
  const vendorRaffleDrawCount =
    typeof vendorRaffle?.active_winner_count === 'number'
      ? vendorRaffle.active_winner_count
      : (vendorRaffle?.draws || []).filter(
          (draw) =>
            draw.selection_status === 'potential' ||
            draw.selection_status === 'verified',
        ).length;
  const vendorRaffleMaxDraws = normalizeRaffleMaxWinners(
    vendorRaffle?.max_winners ||
      vendorRaffle?.settings?.max_winners ||
      vendorRaffle?.max_draws,
  );
  const vendorRaffleDrawsRemaining =
    typeof vendorRaffle?.remaining_winner_slots === 'number'
      ? vendorRaffle.remaining_winner_slots
      : typeof vendorRaffle?.draws_remaining === 'number'
        ? vendorRaffle.draws_remaining
        : Math.max(0, vendorRaffleMaxDraws - vendorRaffleDrawCount);
  const vendorRaffleEntrantCount = Number(
    vendorRaffle?.entrant_count ?? vendorRaffle?.entry_count ?? 0,
  );
  const vendorRaffleSelectionPoolCount = Number(
    vendorRaffle?.eligible_entry_count ??
      vendorRaffle?.included_entry_count ??
      vendorRaffle?.selection_pool_count ??
      vendorRaffleEntrantCount,
  );
  const vendorRaffleExcludedCount = Number(
    vendorRaffle?.excluded_entry_count ?? vendorRaffle?.excluded_count ?? 0,
  );
  const vendorRaffleHasEligibleEntries = vendorRaffleSelectionPoolCount > 0;
  const vendorPendingPotentialWinner = (vendorRaffle?.draws || []).find(
    (draw) => draw.selection_status === 'potential',
  );
  const vendorRaffleHasPendingPotentialWinner = Boolean(
    vendorRaffle?.selection_in_progress || vendorPendingPotentialWinner,
  );
  const vendorRaffleCanPickWinner = Boolean(
    raffleEnabled &&
    vendorRaffleHasEligibleEntries &&
    vendorRaffle?.can_draw &&
    vendorRaffleDrawsRemaining > 0 &&
    !vendorRaffleHasPendingPotentialWinner,
  );
  const vendorRaffleWillSendVerifiedNotice = Boolean(
    vendorRaffle?.can_send_verified_winner_notice,
  );
  const vendorRaffleCanTestSuppressedNotice = Boolean(
    vendorRaffle?.can_test_suppressed_notice,
  );
  const vendorRaffleOutboundEmailBlocked = Boolean(
    vendorRaffle?.verified_potential_winner_notice_pending &&
    !vendorRaffle?.outbound_email_enabled &&
    !vendorRaffleCanTestSuppressedNotice,
  );
  const vendorRaffleMaterialLocked = Boolean(
    vendorRaffle?.material_terms_locked,
  );
  const vendorRaffleSettingsMutationBusy = Boolean(
    vendorRaffleSaving ||
    vendorRaffleDrawing ||
    vendorRaffleSendingDrawId ||
    vendorRaffleReviewing ||
    vendorRaffleExporting ||
    vendorRaffleEntryUpdatingReference,
  );
  const vendorRafflePrizeControlsDisabled =
    vendorRaffleMaterialLocked || vendorRaffleSettingsMutationBusy;
  const vendorRaffleSaveMessageLower = vendorRaffleSaveMessage.toLowerCase();
  const vendorRaffleSaveHasIssue =
    Boolean(vendorRaffleSaveError) ||
    vendorRaffleSaveMessageLower.includes('could not') ||
    vendorRaffleSaveMessageLower.includes('not saved');
  const vendorRaffleSaveIsPending =
    vendorRaffleSaving || vendorRaffleSaveMessageLower.includes('saving');
  const vendorRaffleSaveStatusText = vendorRaffleSaveHasIssue
    ? 'Could not save'
    : vendorRaffleSaveIsPending
      ? 'Saving changes...'
      : 'Saved automatically';
  const vendorRafflePrizeStepComplete = Boolean(
    rafflePrizeDescription.trim() && Number(rafflePrizeApproxValueCad) > 0,
  );
  const vendorRaffleWizardStepTitle = {
    1: 'Describe your prize',
    2: 'Review rules and open entries',
    3: 'Manage couples',
    4: 'Select and contact a winner',
  }[vendorRaffleWizardStep];
  const vendorRaffleWizardStepDescription = {
    1: 'Add what the winner receives, its maximum value or savings, and how many winners you want.',
    2: 'Accept the current vendor draw rules, review the final summary, and choose whether couples can enter.',
    3: 'View every couple who entered, manage the selection pool, and download the contact list.',
    4: 'Select a potential winner, complete the required checks, then send the separate winner email.',
  }[vendorRaffleWizardStep];
  const vendorRaffleCanUpdateEntries = Boolean(
    vendorRaffle?.can_update_entries !== false &&
    !vendorRaffleHasPendingPotentialWinner,
  );
  const vendorRaffleVisibleEntries = useMemo(() => {
    const query = vendorRaffleEntryQuery.trim().toLowerCase();
    return vendorRaffleEntries.filter((entry) => {
      const poolStatus =
        entry.pool_status ||
        (entry.included === false ? 'excluded' : 'included');
      const inSelectionPool =
        entry.in_selection_pool === true || poolStatus === 'included';
      const matchesFilter =
        vendorRaffleEntryFilter === 'all' ||
        (vendorRaffleEntryFilter === 'included' && inSelectionPool) ||
        (vendorRaffleEntryFilter === 'excluded' && !inSelectionPool);
      const searchable = [
        entry.couple_name,
        entry.couple_email,
        entry.couple_phone,
        entry.couple_wedding_date,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return matchesFilter && (!query || searchable.includes(query));
    });
  }, [vendorRaffleEntries, vendorRaffleEntryFilter, vendorRaffleEntryQuery]);
  const vendorPotentialWinnerConfirmationReady = Boolean(
    vendorEligibilityConfirmed &&
    vendorRulesReleaseConfirmed &&
    vendorSkillAnswer.trim() &&
    isValidIsoCalendarDate(vendorVerificationDate) &&
    vendorVerificationMethod.trim() &&
    vendorVerificationReference.trim(),
  );

  const openVendorRaffleWizardStep = (step: VendorRaffleWizardStep) => {
    setVendorRaffleWizardStep(step);
    setVendorRaffleError(null);
    if (
      step === 3 &&
      !vendorRaffleEntries.length &&
      !vendorRaffleEntriesLoading
    ) {
      vendorRaffleEntriesAutoLoadRef.current = true;
      void fetchVendorRaffleEntries();
    }
    requestAnimationFrame(() => {
      vendorRaffleScrollRef.current?.scrollTo({ y: 0, animated: true });
      const stepLabel =
        VENDOR_RAFFLE_WIZARD_STEPS.find((item) => item.id === step)?.label ||
        '';
      AccessibilityInfo.announceForAccessibility(
        `Step ${step} of 4: ${stepLabel}`,
      );
    });
  };

  const continueVendorRaffleWizard = () => {
    if (vendorRaffleWizardStep === 1 && !vendorRafflePrizeStepComplete) {
      Alert.alert(
        'Finish the prize details',
        !rafflePrizeDescription.trim()
          ? 'Describe the prize or discount before continuing.'
          : 'Enter the prize value or maximum savings in Canadian dollars before continuing.',
      );
      return;
    }
    if (vendorRaffleWizardStep < 4) {
      openVendorRaffleWizardStep(
        (vendorRaffleWizardStep + 1) as VendorRaffleWizardStep,
      );
    }
  };

  const requestSignOut = () => {
    if (signOutConfirmationVisibleRef.current) return;
    signOutConfirmationVisibleRef.current = true;

    const closeConfirmation = () => {
      signOutConfirmationVisibleRef.current = false;
    };

    Alert.alert(
      'Sign out of WeddingWin?',
      'Are you sure you want to sign out of your account?',
      [
        {
          text: 'Cancel',
          style: 'cancel',
          onPress: closeConfirmation,
        },
        {
          text: 'Sign Out',
          style: 'destructive',
          onPress: () => {
            closeConfirmation();
            void onSignOut();
          },
        },
      ],
      {
        cancelable: true,
        onDismiss: closeConfirmation,
      },
    );
  };

  const saveProfile = () => {
    if (profileSaveLoading || profileSavePressInFlightRef.current) return;

    const missingRequiredFields: string[] = [];
    const profileDisplayName = [
      profileFirstName,
      String(member?.last_name || '').trim(),
    ]
      .map((value) => String(value || '').trim())
      .filter(Boolean)
      .join(' ');
    if (
      !profileFirstName.trim() ||
      isReservedQrContactName(profileDisplayName)
    ) {
      missingRequiredFields.push('name');
    }
    if (!profileEmail.trim()) missingRequiredFields.push('email address');
    if (
      memberIsCouple &&
      qrContactCompletionRequested &&
      !profilePhone.trim()
    ) {
      missingRequiredFields.push('phone number');
    }

    if (missingRequiredFields.length > 0) {
      Alert.alert(
        'Finish your profile',
        qrContactCompletionRequested
          ? `Add your ${missingRequiredFields.join(', ')} to continue with QR Bingo.`
          : `Add your ${missingRequiredFields.join(', ')} to save your profile.`,
      );
      return;
    }

    if (!isValidEmail(profileEmail)) {
      Alert.alert(
        'Enter a valid email',
        'Use an email address that can receive website login, vendor-contact, and app messages.',
      );
      return;
    }

    if (profilePhone.trim() && !isValidContactPhone(profilePhone)) {
      Alert.alert(
        'Enter a valid phone number',
        qrContactCompletionRequested
          ? 'Use a phone number with 7 to 15 digits to continue with QR Bingo.'
          : 'Use a phone number with 7 to 15 digits, or leave it blank.',
      );
      return;
    }

    profileSavePressInFlightRef.current = true;
    void onCompleteProfile({
      firstName: profileFirstName.trim(),
      email: profileEmail.trim().toLowerCase(),
      phone: profilePhone.trim(),
      ...(memberIsCouple ? { weddingDate: profileWeddingDate.trim() } : {}),
    }).finally(() => {
      profileSavePressInFlightRef.current = false;
    });
  };

  return (
    <SafeAreaView style={styles.nativeContainer} edges={['top']}>
      <ScrollView
        scrollEnabled
        contentContainerStyle={[styles.nativeContent]}
        showsVerticalScrollIndicator={false}
      >
        <ImageBackground
          source={HERO_IMAGE}
          style={[
            styles.loginBackdrop,
            compactOneAppMenu && styles.loginBackdropCompact,
            member && styles.loginBackdropWithAnchoredSignOut,
          ]}
        >
          <View style={styles.backdropWash} />
          <View style={[styles.branch, styles.branchTopRight]}>
            <View style={styles.branchStem} />
            <View style={[styles.leaf, styles.leafOne]} />
            <View style={[styles.leaf, styles.leafTwo]} />
            <View style={[styles.leaf, styles.leafThree]} />
          </View>
          <View style={[styles.branch, styles.branchBottomLeft]}>
            <View style={styles.branchStem} />
            <View style={[styles.leaf, styles.leafOne]} />
            <View style={[styles.leaf, styles.leafTwo]} />
            <View style={[styles.leaf, styles.leafThree]} />
          </View>

          <View
            style={[
              styles.logoWrap,
              compactOneAppMenu && styles.logoWrapCompact,
            ]}
          >
            <Image
              source={LOGO_IMAGE}
              style={[
                styles.brandLogo,
                compactOneAppMenu && styles.brandLogoCompact,
              ]}
              resizeMode="contain"
              accessibilityLabel="WeddingWin.ca"
            />
            {!compactOneAppMenu ? (
              <Text style={styles.countryLabel}>CANADA</Text>
            ) : null}
          </View>
          {!showOneAppMenu ? (
            <Text style={styles.tagline}>
              {isVendorRole
                ? 'Where the perfect couples can find you'
                : 'Find your perfect venue & vendors'}
            </Text>
          ) : null}

          {!member && wizardStep === 1 ? (
            <View style={styles.pathWizard}>
              <Text style={styles.pathTitle}>Choose your path</Text>
              <View style={styles.pathDivider}>
                <View style={styles.pathLine} />
                <Text style={styles.pathHeart}>{'\u2665'}</Text>
                <View style={styles.pathLine} />
              </View>
              <Text style={styles.pathIntro}>
                {
                  "Tell us how you'd like to use WeddingWin so we can personalize your experience."
                }
              </Text>

              <TouchableOpacity
                style={[
                  styles.pathCard,
                  role === 'couple' && styles.pathCardActive,
                ]}
                activeOpacity={0.88}
                onPress={() => setRole('couple')}
                accessibilityRole="radio"
                accessibilityLabel="Choose couple account"
                accessibilityState={{ checked: role === 'couple' }}
              >
                <View
                  style={[styles.pathIconCircle, styles.pathIconCircleCouple]}
                >
                  <UserRound size={44} color={BRAND_COLOR} strokeWidth={1.45} />
                </View>
                <View style={styles.pathCopy}>
                  <Text
                    style={[
                      styles.pathCardTitle,
                      role === 'couple' && styles.pathCardTitleActive,
                    ]}
                  >
                    Couple
                  </Text>
                  <Text style={styles.pathCardText}>
                    Find venues, compare vendors, and plan your perfect day.
                  </Text>
                </View>
                <View
                  style={[
                    styles.pathRadio,
                    role === 'couple' && styles.pathRadioActive,
                  ]}
                >
                  {role === 'couple' ? (
                    <Text style={styles.pathRadioCheck}>{'\u2713'}</Text>
                  ) : null}
                </View>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.pathCard,
                  role === 'vendor' && styles.pathCardActive,
                ]}
                activeOpacity={0.88}
                onPress={() => setRole('vendor')}
                accessibilityRole="radio"
                accessibilityLabel="Choose vendor account"
                accessibilityState={{ checked: role === 'vendor' }}
              >
                <View
                  style={[styles.pathIconCircle, styles.pathIconCircleVendor]}
                >
                  <Store size={44} color="#B9882E" strokeWidth={1.45} />
                </View>
                <View style={styles.pathCopy}>
                  <Text
                    style={[
                      styles.pathCardTitle,
                      role === 'vendor' && styles.pathCardTitleActive,
                    ]}
                  >
                    Vendor
                  </Text>
                  <Text style={styles.pathCardText}>
                    Showcase your business, get discovered, and connect with
                    engaged couples.
                  </Text>
                </View>
                <View
                  style={[
                    styles.pathRadio,
                    role === 'vendor' && styles.pathRadioActive,
                  ]}
                >
                  {role === 'vendor' ? (
                    <Text style={styles.pathRadioCheck}>{'\u2713'}</Text>
                  ) : null}
                </View>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.pathContinueButton}
                activeOpacity={0.9}
                onPress={continueFromPath}
                accessibilityRole="button"
                accessibilityLabel={`Continue with ${role} account`}
              >
                <Text style={styles.pathContinueText}>Continue</Text>
              </TouchableOpacity>

              <View style={styles.pathLoginRow}>
                <Text style={styles.pathLoginCopy}>
                  Already have an account?
                </Text>
                <TouchableOpacity
                  activeOpacity={0.76}
                  onPress={showExistingLogin}
                  accessibilityRole="button"
                  accessibilityLabel={`Log in as ${role}`}
                >
                  <Text style={styles.pathLoginLink}>Log In</Text>
                </TouchableOpacity>
              </View>

              <Text style={styles.pathFooter}>
                Your wedding journey starts here
              </Text>
            </View>
          ) : null}

          {member || wizardStep === 2 ? (
            <View
              style={[
                styles.loginCard,
                showOneAppMenu && styles.oneAppLoginCard,
              ]}
            >
              {member ? (
                <View
                  style={[
                    styles.signedInPanel,
                    showOneAppMenu && styles.oneAppSignedInPanel,
                  ]}
                >
                  <Text style={styles.signedInTitle}>
                    {qrContactCompletionRequested
                      ? 'Complete contact details'
                      : 'You are signed in'}
                  </Text>
                  <Text
                    style={[
                      styles.signedInName,
                      showOneAppMenu && styles.oneAppSignedInName,
                    ]}
                    numberOfLines={1}
                  >
                    {displayName}
                  </Text>
                  {usesApplePrivateRelayEmail ? (
                    <Text style={styles.profileHint} accessibilityRole="text">
                      Apple forwards WeddingWin and vendor-contact emails
                      through this private address. Keep Apple email forwarding
                      enabled to receive them.
                    </Text>
                  ) : null}
                  {qrContactCompletionRequested ? (
                    <Text style={styles.profileHint} accessibilityRole="text">
                      {qrContactProfileHint}
                    </Text>
                  ) : null}
                  {shouldCompleteProfile ? (
                    <>
                      <View style={styles.profileInputShell}>
                        <UserRound
                          size={20}
                          color="#7D7D80"
                          strokeWidth={1.7}
                        />
                        <TextInput
                          value={profileFirstName}
                          onChangeText={setProfileFirstName}
                          placeholder="Full name"
                          placeholderTextColor="#A8A8AD"
                          textContentType="name"
                          accessibilityLabel="Full name required for QR Bingo"
                          style={styles.textInput}
                        />
                      </View>
                      <View style={styles.profileInputShell}>
                        <Mail size={20} color="#7D7D80" strokeWidth={1.7} />
                        <Text style={styles.readOnlyInput} numberOfLines={1}>
                          {member.email}
                        </Text>
                      </View>
                      <View style={styles.profileInputShell}>
                        <Phone size={20} color="#7D7D80" strokeWidth={1.7} />
                        <TextInput
                          value={profilePhone}
                          onChangeText={setProfilePhone}
                          placeholder="Phone number"
                          placeholderTextColor="#A8A8AD"
                          keyboardType="phone-pad"
                          textContentType="telephoneNumber"
                          autoComplete="tel"
                          accessibilityLabel="Phone number required for QR Bingo"
                          style={styles.textInput}
                        />
                      </View>
                      <TouchableOpacity
                        style={styles.profileInputShell}
                        activeOpacity={0.82}
                        onPress={() => setShowWeddingPicker((shown) => !shown)}
                        accessibilityRole="button"
                        accessibilityLabel="Choose optional wedding date"
                      >
                        <CalendarDays
                          size={20}
                          color="#7D7D80"
                          strokeWidth={1.7}
                        />
                        <Text
                          style={[
                            styles.readOnlyInput,
                            !profileWeddingDate && styles.placeholderText,
                          ]}
                        >
                          {profileWeddingDate || 'Wedding date (optional)'}
                        </Text>
                      </TouchableOpacity>
                      {showWeddingPicker ? (
                        <DateTimePicker
                          value={parseWeddingDate(profileWeddingDate)}
                          mode="date"
                          display={Platform.OS === 'ios' ? 'inline' : 'default'}
                          minimumDate={new Date()}
                          themeVariant="light"
                          accentColor={BRAND_COLOR}
                          textColor="#2E2E32"
                          onChange={(_, selectedDate) => {
                            if (selectedDate) {
                              setProfileWeddingDate(
                                formatWeddingDate(selectedDate),
                              );
                              setShowWeddingPicker(false);
                            } else if (Platform.OS !== 'ios') {
                              setShowWeddingPicker(false);
                            }
                          }}
                          style={styles.weddingDatePicker}
                        />
                      ) : null}
                      <TouchableOpacity
                        style={[
                          styles.secondaryAction,
                          profileSaveLoading && styles.secondaryActionPending,
                        ]}
                        disabled={profileSaveLoading}
                        activeOpacity={0.82}
                        onPress={saveProfile}
                        accessibilityRole="button"
                        accessibilityLabel="Save contact details and continue to QR Bingo"
                      >
                        {profileSaveLoading ? (
                          <ActivityIndicator size="small" color="#FFFFFF" />
                        ) : (
                          <Text style={styles.secondaryActionText}>
                            Save & Continue to QR Bingo
                          </Text>
                        )}
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[
                          styles.signOutButton,
                          profileSaveLoading && styles.loginButtonDisabled,
                        ]}
                        disabled={profileSaveLoading}
                        activeOpacity={0.82}
                        onPress={() => {
                          if (
                            profileSaveLoading ||
                            profileSavePressInFlightRef.current
                          )
                            return;
                          onCancelQrContactCompletion();
                        }}
                        accessibilityRole="button"
                        accessibilityLabel="Cancel contact details update"
                        accessibilityState={{ disabled: profileSaveLoading }}
                      >
                        <Text style={styles.signOutText}>Cancel</Text>
                      </TouchableOpacity>
                    </>
                  ) : showCoupleMenu ? (
                    <>
                      <TouchableOpacity
                        style={[styles.coupleMenuCard, styles.oneAppMenuCard]}
                        activeOpacity={0.86}
                        onPress={onOpenWebsiteBuilder}
                        accessibilityRole="button"
                        accessibilityLabel="Open wedding website builder"
                      >
                        <View style={styles.coupleMenuCopy}>
                          <Text style={styles.coupleMenuEyebrow}>Create</Text>
                          <Text style={styles.coupleMenuTitle}>
                            Wedding Website Builder
                          </Text>
                          <Text style={styles.coupleMenuDescription}>
                            Build and edit your wedding website.
                          </Text>
                        </View>
                        <Image
                          source={COUPLE_MENU_WEBSITE_AI_IMAGE}
                          style={[
                            styles.coupleMenuImage,
                            styles.oneAppMenuImage,
                          ]}
                          resizeMode="contain"
                        />
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.coupleMenuCard, styles.oneAppMenuCard]}
                        activeOpacity={0.86}
                        onPress={onOpenDashboard}
                        accessibilityRole="button"
                        accessibilityLabel="Open vendor search dashboard"
                      >
                        <View style={styles.coupleMenuCopy}>
                          <Text style={styles.coupleMenuEyebrow}>Plan</Text>
                          <Text style={styles.coupleMenuTitle}>
                            Vendor Search
                          </Text>
                          <Text style={styles.coupleMenuDescription}>
                            Search vendors and manage your saved finds.
                          </Text>
                        </View>
                        <Image
                          source={COUPLE_MENU_VENDOR_AI_IMAGE}
                          style={[
                            styles.coupleMenuImage,
                            styles.oneAppMenuImage,
                          ]}
                          resizeMode="contain"
                        />
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.coupleMenuCard, styles.oneAppMenuCard]}
                        activeOpacity={0.86}
                        onPress={onOpenChat}
                        accessibilityRole="button"
                        accessibilityLabel="Open private messages"
                      >
                        <View style={styles.coupleMenuCopy}>
                          <View style={styles.coupleMenuTitleRow}>
                            <Text style={styles.coupleMenuEyebrow}>
                              Connect
                            </Text>
                            {chatUnreadCount > 0 ? (
                              <View style={styles.chatBadge}>
                                <Text style={styles.chatBadgeText}>
                                  {chatUnreadCount > 99
                                    ? '99+'
                                    : chatUnreadCount}
                                </Text>
                              </View>
                            ) : null}
                          </View>
                          <Text style={styles.coupleMenuTitle}>
                            Private Messages
                          </Text>
                          <Text
                            style={styles.coupleMenuDescription}
                            numberOfLines={2}
                          >
                            {chatUnreadCount > 0
                              ? chatStatusLabel
                              : 'Open your synced WeddingWin inbox.'}
                          </Text>
                        </View>
                        <Image
                          source={COUPLE_MENU_MESSAGES_AI_IMAGE}
                          style={[
                            styles.coupleMenuImage,
                            styles.oneAppMenuImage,
                          ]}
                          resizeMode="contain"
                        />
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[
                          styles.coupleMenuCard,
                          styles.oneAppMenuCard,
                          !qrMenuAvailable && styles.qrMenuCardDisabled,
                        ]}
                        activeOpacity={qrMenuAvailable ? 0.86 : 1}
                        disabled={!qrMenuAvailable}
                        onPress={qrMenuAvailable ? onOpenQrScanner : undefined}
                        accessibilityRole="button"
                        accessibilityLabel={
                          qrMenuAvailable
                            ? `Open ${qrMenuEventNameLabel} QR Bingo scanner. ${qrMenuScheduleLabel}`
                            : qrMenuScheduleLabel
                              ? `${qrMenuEventNameLabel} QR Bingo scanner. ${qrMenuStatusLabel}. ${qrMenuScheduleLabel}`
                              : `${qrMenuEventNameLabel} QR Bingo scanner. ${qrMenuStatusLabel}`
                        }
                        accessibilityState={{
                          disabled: !qrMenuAvailable,
                          busy: qrMenuConfigPending,
                        }}
                      >
                        <View style={styles.coupleMenuCopy}>
                          <Text
                            style={[
                              styles.coupleMenuEyebrow,
                              !qrMenuAvailable && styles.qrMenuTextDisabled,
                            ]}
                          >
                            {qrMenuEventNameLabel}
                          </Text>
                          <Text
                            style={[
                              styles.coupleMenuTitle,
                              !qrMenuAvailable && styles.qrMenuTitleDisabled,
                            ]}
                          >
                            QR Bingo Scanner
                          </Text>
                          {qrMenuDateLabel ? (
                            <Text
                              style={[
                                styles.qrMenuEventDate,
                                !qrMenuAvailable && styles.qrMenuTextDisabled,
                              ]}
                            >
                              {qrMenuDateLabel}
                            </Text>
                          ) : null}
                          {qrMenuVenueLabel ? (
                            <Text
                              style={[
                                styles.qrMenuEventVenue,
                                !qrMenuAvailable && styles.qrMenuTextDisabled,
                              ]}
                              numberOfLines={1}
                            >
                              {qrMenuVenueLabel}
                            </Text>
                          ) : null}
                          {!qrMenuAvailable ? (
                            <Text style={styles.qrMenuUnavailableText}>
                              {qrMenuStatusLabel}
                            </Text>
                          ) : null}
                        </View>
                        <Image
                          source={COUPLE_MENU_QR_AI_IMAGE}
                          style={[
                            styles.coupleMenuImage,
                            styles.oneAppMenuImage,
                            !qrMenuAvailable && styles.qrMenuImageDisabled,
                          ]}
                          resizeMode="contain"
                        />
                      </TouchableOpacity>
                    </>
                  ) : showVendorMenu ? (
                    <>
                      <TouchableOpacity
                        style={[styles.coupleMenuCard, styles.oneAppMenuCard]}
                        activeOpacity={0.86}
                        onPress={onOpenDashboard}
                        accessibilityRole="button"
                        accessibilityLabel="Open vendor dashboard"
                      >
                        <View style={styles.coupleMenuCopy}>
                          <Text style={styles.coupleMenuEyebrow}>Account</Text>
                          <Text style={styles.coupleMenuTitle}>
                            Vendor Dashboard
                          </Text>
                          <Text style={styles.coupleMenuDescription}>
                            Manage your profile, leads, messages, and WeddingWin
                            account.
                          </Text>
                        </View>
                        <Image
                          source={VENDOR_MENU_DASHBOARD_AI_IMAGE}
                          style={[
                            styles.coupleMenuImage,
                            styles.oneAppMenuImage,
                          ]}
                          resizeMode="contain"
                        />
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.coupleMenuCard, styles.oneAppMenuCard]}
                        activeOpacity={0.86}
                        onPress={onOpenChat}
                        accessibilityRole="button"
                        accessibilityLabel="Open private chat messages"
                      >
                        <View style={styles.coupleMenuCopy}>
                          <View style={styles.coupleMenuTitleRow}>
                            <Text style={styles.coupleMenuEyebrow}>
                              Messages
                            </Text>
                            {chatUnreadCount > 0 ? (
                              <View style={styles.chatBadge}>
                                <Text style={styles.chatBadgeText}>
                                  {chatUnreadCount > 99
                                    ? '99+'
                                    : chatUnreadCount}
                                </Text>
                              </View>
                            ) : null}
                          </View>
                          <Text style={styles.coupleMenuTitle}>
                            Private Chat Messages
                          </Text>
                          <Text
                            style={styles.coupleMenuDescription}
                            numberOfLines={2}
                          >
                            {chatUnreadCount > 0
                              ? chatStatusLabel
                              : 'Reply to couples from your WeddingWin inbox.'}
                          </Text>
                        </View>
                        <Image
                          source={COUPLE_MENU_MESSAGES_AI_IMAGE}
                          style={[
                            styles.coupleMenuImage,
                            styles.oneAppMenuImage,
                          ]}
                          resizeMode="contain"
                        />
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[
                          styles.coupleMenuCard,
                          styles.oneAppMenuCard,
                          styles.qrMenuCard,
                        ]}
                        activeOpacity={0.86}
                        onPress={openVendorRaffle}
                        accessibilityRole="button"
                        accessibilityLabel="Open QR Bingo vendor draw settings"
                      >
                        <View style={styles.coupleMenuCopy}>
                          <Text style={styles.coupleMenuEyebrow}>QR Bingo</Text>
                          <Text style={styles.coupleMenuTitle}>
                            Vendor Draw Settings
                          </Text>
                          <Text style={styles.coupleMenuDescription}>
                            Set your booth prize, review participation, and run
                            your vendor prize-draw verification and fulfillment
                            flow.
                          </Text>
                        </View>
                        <Image
                          source={COUPLE_MENU_QR_AI_IMAGE}
                          style={[
                            styles.coupleMenuImage,
                            styles.oneAppMenuImage,
                          ]}
                          resizeMode="contain"
                        />
                      </TouchableOpacity>
                    </>
                  ) : (
                    <>
                      <TouchableOpacity
                        style={styles.secondaryAction}
                        activeOpacity={0.82}
                        onPress={onOpenDashboard}
                        accessibilityRole="button"
                        accessibilityLabel="Open website account"
                      >
                        <Text style={styles.secondaryActionText}>
                          Open Website Account
                        </Text>
                      </TouchableOpacity>
                    </>
                  )}
                </View>
              ) : (
                <>
                  <TouchableOpacity
                    style={styles.wizardBackButton}
                    activeOpacity={0.76}
                    onPress={() => setWizardStep(1)}
                    accessibilityRole="button"
                    accessibilityLabel="Change account path"
                  >
                    <ChevronLeft
                      size={18}
                      color={BRAND_COLOR}
                      strokeWidth={2.2}
                    />
                    <Text style={styles.wizardBackText}>Change path</Text>
                  </TouchableOpacity>
                  <Text style={styles.authTitle}>
                    {isVendorRole
                      ? authMode === 'signup'
                        ? 'Create your vendor account'
                        : 'Log in to your vendor account'
                      : authMode === 'signup'
                        ? 'Create your couple account'
                        : 'Log in to WeddingWin'}
                  </Text>
                  <Text style={styles.authIntro}>
                    {isVendorRole
                      ? authMode === 'signup'
                        ? 'Sign up with Apple or Google to start connecting with couples.'
                        : 'Welcome back. Open your vendor dashboard and messages.'
                      : authMode === 'signup'
                        ? 'Sign up with Apple or Google to start planning faster.'
                        : 'Welcome back. Open your dashboard and messages.'}
                  </Text>

                  {authMode === 'signup' ? (
                    <>
                      <View style={styles.signupConsentRow}>
                        <TouchableOpacity
                          style={styles.signupConsentToggle}
                          activeOpacity={0.82}
                          onPress={() =>
                            setSignupConsentAccepted((accepted) => !accepted)
                          }
                          accessibilityRole="checkbox"
                          accessibilityLabel="Agree to WeddingWin terms and privacy policy"
                          accessibilityState={{
                            checked: signupConsentAccepted,
                          }}
                        >
                          <View
                            style={[
                              styles.signupConsentBox,
                              signupConsentAccepted &&
                                styles.signupConsentBoxChecked,
                            ]}
                          >
                            {signupConsentAccepted ? (
                              <Text style={styles.signupConsentCheck}>
                                {'\u2713'}
                              </Text>
                            ) : null}
                          </View>
                          <Text style={styles.signupConsentText}>
                            {
                              "I agree to WeddingWin's Terms of Use and Privacy Policy."
                            }
                          </Text>
                        </TouchableOpacity>
                        <View style={styles.signupConsentPolicyLinks}>
                          <Text style={styles.signupConsentPolicyPrefix}>
                            Read:
                          </Text>
                          <TouchableOpacity
                            activeOpacity={0.72}
                            onPress={() => openPolicyLink(TERMS_URL)}
                            accessibilityRole="link"
                            accessibilityLabel="Read WeddingWin Terms of Use"
                          >
                            <Text style={styles.signupConsentLink}>
                              Terms of Use
                            </Text>
                          </TouchableOpacity>
                          <Text style={styles.signupConsentPolicyPrefix}>
                            and
                          </Text>
                          <TouchableOpacity
                            activeOpacity={0.72}
                            onPress={() => openPolicyLink(PRIVACY_URL)}
                            accessibilityRole="link"
                            accessibilityLabel="Read WeddingWin Privacy Policy"
                          >
                            <Text style={styles.signupConsentLink}>
                              Privacy Policy
                            </Text>
                          </TouchableOpacity>
                        </View>
                      </View>

                      <TouchableOpacity
                        style={[
                          styles.googleButton,
                          (googleLoginLoading || !signupConsentAccepted) &&
                            styles.loginButtonDisabled,
                        ]}
                        disabled={googleLoginLoading}
                        activeOpacity={0.86}
                        onPress={startGoogleSignup}
                        accessibilityRole="button"
                        accessibilityLabel="Sign up with Google"
                      >
                        {googleLoginLoading ? (
                          <ActivityIndicator size="small" color="#3C4043" />
                        ) : (
                          <>
                            <View style={styles.googleMark}>
                              <Text style={styles.googleMarkText}>G</Text>
                            </View>
                            <Text style={styles.googleButtonText}>
                              Sign up with Google
                            </Text>
                          </>
                        )}
                      </TouchableOpacity>

                      {Platform.OS === 'ios' ? (
                        <AppleAuthentication.AppleAuthenticationButton
                          buttonType={
                            AppleAuthentication.AppleAuthenticationButtonType
                              .SIGN_UP
                          }
                          buttonStyle={
                            AppleAuthentication.AppleAuthenticationButtonStyle
                              .BLACK
                          }
                          cornerRadius={8}
                          style={[
                            styles.appleButton,
                            !signupConsentAccepted &&
                              styles.appleButtonDisabled,
                          ]}
                          onPress={startAppleSignup}
                        />
                      ) : null}

                      <Text style={styles.emailSignupPrompt}>
                        Sign up with email
                      </Text>
                    </>
                  ) : null}

                  <Text
                    style={[
                      styles.inputLabel,
                      authMode === 'signup' && styles.passwordLabel,
                    ]}
                  >
                    Email
                  </Text>
                  <View style={styles.inputShell}>
                    <Mail size={22} color="#7D7D80" strokeWidth={1.7} />
                    <TextInput
                      value={email}
                      onChangeText={setEmail}
                      placeholder="Enter your email"
                      placeholderTextColor="#A8A8AD"
                      keyboardType="email-address"
                      autoCapitalize="none"
                      autoCorrect={false}
                      textContentType="emailAddress"
                      accessibilityLabel="Email"
                      style={styles.textInput}
                      returnKeyType="next"
                    />
                  </View>

                  <Text style={[styles.inputLabel, styles.passwordLabel]}>
                    Password
                  </Text>
                  <View style={styles.inputShell}>
                    <LockKeyhole size={22} color="#7D7D80" strokeWidth={1.7} />
                    <TextInput
                      value={password}
                      onChangeText={setPassword}
                      placeholder="Enter your password"
                      placeholderTextColor="#A8A8AD"
                      secureTextEntry={!showPassword}
                      textContentType="password"
                      accessibilityLabel="Password"
                      style={styles.textInput}
                      returnKeyType="done"
                      onSubmitEditing={
                        authMode === 'signup' ? createMemberAccount : openLogin
                      }
                    />
                    <TouchableOpacity
                      style={styles.eyeButton}
                      hitSlop={10}
                      onPress={() => setShowPassword((value) => !value)}
                      accessibilityRole="button"
                      accessibilityLabel={
                        showPassword ? 'Hide password' : 'Show password'
                      }
                    >
                      <Eye size={24} color="#8A8A8D" strokeWidth={1.7} />
                    </TouchableOpacity>
                  </View>

                  {authMode !== 'signup' ? (
                    <TouchableOpacity
                      style={styles.forgotButton}
                      activeOpacity={0.75}
                      onPress={() => onOpenUrl('/login/retrieval')}
                      accessibilityRole="button"
                      accessibilityLabel="Forgot password"
                    >
                      <Text style={styles.forgotText}>Forgot password?</Text>
                    </TouchableOpacity>
                  ) : null}

                  <TouchableOpacity
                    style={[
                      styles.loginButton,
                      (emailLoginLoading ||
                        signupLoading ||
                        (authMode === 'signup' && !signupConsentAccepted)) &&
                        styles.loginButtonDisabled,
                    ]}
                    disabled={
                      emailLoginLoading ||
                      signupLoading ||
                      (authMode === 'signup' && !signupConsentAccepted)
                    }
                    activeOpacity={0.9}
                    onPress={
                      authMode === 'signup' ? createMemberAccount : openLogin
                    }
                    accessibilityRole="button"
                    accessibilityLabel={
                      authMode === 'signup'
                        ? `Create ${role} account`
                        : `Log in as ${role}`
                    }
                  >
                    {(authMode === 'signup' && signupLoading) ||
                    emailLoginLoading ? (
                      <ActivityIndicator size="small" color="#FFFFFF" />
                    ) : (
                      <Text style={styles.loginButtonText}>
                        {authMode === 'signup' ? 'Create Account' : 'Log In'}
                      </Text>
                    )}
                  </TouchableOpacity>

                  {authMode === 'login' ? (
                    <View style={styles.orRow}>
                      <View style={styles.orLine} />
                      <Text style={styles.orText}>OR</Text>
                      <View style={styles.orLine} />
                    </View>
                  ) : null}

                  {!isVendorRole && authMode === 'login' ? (
                    <TouchableOpacity
                      style={styles.createButton}
                      activeOpacity={0.86}
                      onPress={() => setAuthMode('signup')}
                      accessibilityRole="button"
                      accessibilityLabel="Create couple account"
                    >
                      <UserPlus
                        size={24}
                        color={BRAND_COLOR}
                        strokeWidth={1.8}
                      />
                      <Text style={styles.createButtonText}>
                        Create Couple Account
                      </Text>
                    </TouchableOpacity>
                  ) : null}

                  {authMode === 'login' ? (
                    <TouchableOpacity
                      style={[
                        styles.googleButton,
                        googleLoginLoading && styles.loginButtonDisabled,
                      ]}
                      disabled={googleLoginLoading}
                      activeOpacity={0.86}
                      onPress={() => onGoogleSignIn(role)}
                      accessibilityRole="button"
                      accessibilityLabel="Sign in with Google"
                    >
                      {googleLoginLoading ? (
                        <ActivityIndicator size="small" color="#3C4043" />
                      ) : (
                        <>
                          <View style={styles.googleMark}>
                            <Text style={styles.googleMarkText}>G</Text>
                          </View>
                          <Text style={styles.googleButtonText}>
                            Sign in with Google
                          </Text>
                        </>
                      )}
                    </TouchableOpacity>
                  ) : null}

                  {Platform.OS === 'ios' && authMode === 'login' ? (
                    <AppleAuthentication.AppleAuthenticationButton
                      buttonType={
                        AppleAuthentication.AppleAuthenticationButtonType
                          .SIGN_IN
                      }
                      buttonStyle={
                        AppleAuthentication.AppleAuthenticationButtonStyle.BLACK
                      }
                      cornerRadius={8}
                      style={styles.appleButton}
                      onPress={() => onAppleSignIn(role)}
                    />
                  ) : null}
                </>
              )}
            </View>
          ) : null}

          {member ? (
            <TouchableOpacity
              style={[
                styles.signOutButton,
                styles.bottomLeftSignOutButton,
                styles.anchoredSignOutButton,
              ]}
              activeOpacity={0.82}
              onPress={requestSignOut}
              testID="native-sign-out"
              accessibilityRole="button"
              accessibilityLabel="Sign out of WeddingWin"
              accessibilityHint="Asks for confirmation before signing out"
            >
              <LogOut size={15} color="#7D7D80" strokeWidth={2} />
              <Text style={styles.signOutText}>Sign Out</Text>
            </TouchableOpacity>
          ) : null}

          {!showOneAppMenu ? (
            <TouchableOpacity
              style={styles.supportLink}
              activeOpacity={0.75}
              onPress={() =>
                Linking.openURL('mailto:info@weddingwin.ca').catch(() => {})
              }
              accessibilityRole="link"
              accessibilityLabel="Email WeddingWin support"
            >
              <MessageCircle size={18} color={BRAND_COLOR} strokeWidth={1.8} />
              <Text style={styles.supportText}>
                Plan your dream day with{'\n'}trusted wedding professionals
              </Text>
            </TouchableOpacity>
          ) : null}
        </ImageBackground>
      </ScrollView>
      <Modal
        visible={showVendorRaffle}
        transparent
        animationType="slide"
        onRequestClose={() => {
          void closeVendorRaffle();
        }}
      >
        <View style={styles.vendorRaffleBackdrop}>
          <View
            style={styles.vendorRaffleSheet}
            testID="vendor-draw-wizard"
            accessibilityViewIsModal
          >
            <View style={styles.vendorRaffleHeader}>
              <View>
                <Text style={styles.vendorRaffleEyebrow}>
                  Wedding show tools
                </Text>
                <Text
                  style={styles.vendorRaffleTitle}
                  accessibilityRole="header"
                >
                  QR Bingo Vendor Draw
                </Text>
                <Text style={styles.vendorRaffleHeaderText}>
                  Set up your booth prize in four short steps, then manage
                  couples and winners from the same place.
                </Text>
              </View>
              <TouchableOpacity
                style={styles.vendorRaffleClose}
                activeOpacity={0.78}
                onPress={() => {
                  void closeVendorRaffle();
                }}
                disabled={vendorRaffleSaving}
                accessibilityRole="button"
                accessibilityLabel="Save and close vendor draw settings"
                accessibilityState={{ disabled: vendorRaffleSaving }}
              >
                <X size={22} color="#2E2E32" strokeWidth={2.2} />
              </TouchableOpacity>
            </View>
            {vendorRaffleLoading ? (
              <View style={styles.vendorRaffleLoading}>
                <ActivityIndicator size="large" color={BRAND_COLOR} />
              </View>
            ) : (
              <ScrollView
                ref={vendorRaffleScrollRef}
                style={styles.vendorRaffleScroll}
                testID="vendor-draw-wizard-scroll"
                showsVerticalScrollIndicator={false}
                keyboardDismissMode="interactive"
                keyboardShouldPersistTaps="handled"
              >
                {vendorRaffleError ? (
                  <Text
                    style={styles.vendorRaffleError}
                    testID="vendor-draw-wizard-error"
                    accessibilityRole="alert"
                    accessibilityLiveRegion="assertive"
                  >
                    {vendorRaffleError}
                  </Text>
                ) : null}
                {vendorRaffle?.vendor ? (
                  <>
                    {vendorRaffle.app_review_fixture ? (
                      <View style={styles.vendorRaffleDrawStatusCard}>
                        <Text style={styles.vendorRaffleDrawStatusLabel}>
                          Isolated App Review fixture
                        </Text>
                        <Text style={styles.vendorRaffleDrawStatusText}>
                          Test-only data is separated from the production event.
                          Early selection is enabled for review, no real prize
                          is awarded, outbound email is suppressed, and the
                          private vendor listing remains inactive.
                        </Text>
                      </View>
                    ) : null}
                    {vendorRaffle.email_test_fixture ? (
                      <View style={styles.vendorRaffleDrawStatusCard}>
                        <Text style={styles.vendorRaffleDrawStatusLabel}>
                          Isolated prize-email QA fixture
                        </Text>
                        <Text style={styles.vendorRaffleDrawStatusText}>
                          This test uses Sound Of Harmony and one allowlisted
                          couple account in a separate event. It cannot select a
                          production entrant, cannot send a vendor copy, and
                          does not award a real prize.
                        </Text>
                      </View>
                    ) : null}
                    <View style={styles.vendorRaffleGuideCard}>
                      <TouchableOpacity
                        style={styles.vendorRaffleGuideHeader}
                        activeOpacity={0.78}
                        onPress={() =>
                          setVendorRaffleGuideExpanded((value) => !value)
                        }
                        testID="vendor-draw-how-it-works"
                        accessibilityRole="button"
                        accessibilityLabel="How vendor draws work"
                        accessibilityHint="Shows or hides the five-page visual guide"
                        accessibilityState={{
                          expanded: vendorRaffleGuideExpanded,
                        }}
                      >
                        <View style={styles.vendorRaffleGuideCopy}>
                          <Text style={styles.vendorRaffleGuideTitle}>
                            New here? See how it works
                          </Text>
                          <Text style={styles.vendorRaffleGuideText}>
                            Optional five-page visual guide
                          </Text>
                        </View>
                        <ChevronDown
                          size={20}
                          color="#8A454B"
                          strokeWidth={2.2}
                          style={
                            vendorRaffleGuideExpanded
                              ? styles.vendorRaffleRulesChevronOpen
                              : undefined
                          }
                        />
                      </TouchableOpacity>
                      {vendorRaffleGuideExpanded ? (
                        <View style={styles.vendorRaffleGuideContent}>
                          <View
                            style={[
                              styles.vendorRaffleInfographicFrame,
                              { width: vendorDrawSlideWidth },
                            ]}
                          >
                            <ScrollView
                              horizontal
                              showsHorizontalScrollIndicator={false}
                              decelerationRate="fast"
                              disableIntervalMomentum
                              snapToInterval={vendorDrawSlideWidth}
                              snapToAlignment="start"
                              onMomentumScrollEnd={(event) => {
                                const nextIndex = Math.round(
                                  event.nativeEvent.contentOffset.x /
                                    vendorDrawSlideWidth,
                                );
                                setVendorRaffleSlideIndex(
                                  Math.max(
                                    0,
                                    Math.min(
                                      QR_VENDOR_DRAW_MOBILE_SLIDES.length - 1,
                                      nextIndex,
                                    ),
                                  ),
                                );
                              }}
                              contentContainerStyle={
                                styles.vendorRaffleInfographicTrack
                              }
                            >
                              {QR_VENDOR_DRAW_MOBILE_SLIDES.map(
                                (slide, index) => (
                                  <Image
                                    key={index}
                                    source={slide.source}
                                    style={[
                                      styles.vendorRaffleInfographic,
                                      {
                                        width: vendorDrawSlideWidth,
                                        height: vendorDrawSlideHeight,
                                      },
                                    ]}
                                    resizeMode="cover"
                                    accessible
                                    accessibilityLabel={
                                      slide.accessibilityLabel
                                    }
                                  />
                                ),
                              )}
                            </ScrollView>
                            <View style={styles.vendorRaffleCarouselCue}>
                              <Text style={styles.vendorRaffleCarouselCueText}>
                                Swipe left to see the next page
                              </Text>
                              <View style={styles.vendorRaffleCarouselDots}>
                                {QR_VENDOR_DRAW_MOBILE_SLIDES.map(
                                  (_, index) => (
                                    <View
                                      key={index}
                                      style={[
                                        styles.vendorRaffleCarouselDot,
                                        index === vendorRaffleSlideIndex &&
                                          styles.vendorRaffleCarouselDotActive,
                                      ]}
                                    />
                                  ),
                                )}
                              </View>
                            </View>
                          </View>
                        </View>
                      ) : null}
                    </View>
                    <View style={styles.vendorRaffleWizardCard}>
                      <Text style={styles.vendorRaffleSectionEyebrow}>
                        Prize setup wizard
                      </Text>
                      <View
                        style={styles.vendorRaffleProcessRow}
                        accessibilityRole="tablist"
                      >
                        {VENDOR_RAFFLE_WIZARD_STEPS.map((step) => {
                          const selected = vendorRaffleWizardStep === step.id;
                          return (
                            <TouchableOpacity
                              key={step.id}
                              style={[
                                styles.vendorRaffleProcessPill,
                                selected &&
                                  styles.vendorRaffleProcessPillActive,
                              ]}
                              activeOpacity={0.8}
                              onPress={() =>
                                openVendorRaffleWizardStep(step.id)
                              }
                              testID={`vendor-draw-wizard-step-${step.id}`}
                              accessibilityRole="button"
                              accessibilityLabel={`Step ${step.id} of 4: ${step.label}`}
                              accessibilityState={{ selected }}
                            >
                              <Text
                                style={[
                                  styles.vendorRaffleProcessNumber,
                                  selected &&
                                    styles.vendorRaffleProcessNumberActive,
                                ]}
                              >
                                {step.id}
                              </Text>
                              <Text
                                style={[
                                  styles.vendorRaffleProcessText,
                                  selected &&
                                    styles.vendorRaffleProcessTextActive,
                                ]}
                              >
                                {step.label}
                              </Text>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                      <View style={styles.vendorRaffleWizardHeading}>
                        <Text
                          style={styles.vendorRaffleWizardCount}
                          accessibilityLiveRegion="polite"
                        >
                          Step {vendorRaffleWizardStep} of 4
                        </Text>
                        <Text
                          style={styles.vendorRaffleSectionTitle}
                          accessibilityRole="header"
                        >
                          {vendorRaffleWizardStepTitle}
                        </Text>
                        <Text style={styles.vendorRaffleWizardDescription}>
                          {vendorRaffleWizardStepDescription}
                        </Text>
                      </View>
                      {vendorRaffleWizardStep === 2 ? (
                        <>
                          <View
                            style={styles.vendorRaffleRulesCard}
                            testID="vendor-draw-step-rules"
                          >
                            <TouchableOpacity
                              style={styles.vendorRaffleRulesHeader}
                              activeOpacity={0.78}
                              onPress={() =>
                                setVendorRaffleRulesExpanded((value) => !value)
                              }
                              accessibilityRole="button"
                              accessibilityLabel="Vendor Draw Rules and responsibilities"
                              accessibilityHint={
                                vendorRaffleRulesExpanded
                                  ? 'Hides the legal details'
                                  : 'Shows the legal details'
                              }
                              accessibilityState={{
                                expanded: vendorRaffleRulesExpanded,
                              }}
                            >
                              <View style={styles.vendorRaffleRulesHeaderCopy}>
                                <Text style={styles.vendorRaffleRulesTitle}>
                                  Vendor draw agreement
                                </Text>
                                <Text style={styles.vendorRaffleRulesSummary}>
                                  {raffleLegalAccepted &&
                                  vendorRaffleRulesViewedVersion ===
                                    vendorRaffleRulesVersion
                                    ? 'Accepted. You can review the legal details anytime.'
                                    : 'Open the Official Rules, then confirm below.'}
                                </Text>
                              </View>
                              <View
                                style={styles.vendorRaffleRulesHeaderAction}
                              >
                                <Text
                                  style={
                                    styles.vendorRaffleRulesHeaderActionText
                                  }
                                >
                                  {vendorRaffleRulesExpanded
                                    ? 'Hide details'
                                    : 'View details'}
                                </Text>
                                <ChevronDown
                                  size={18}
                                  color="#8A454B"
                                  strokeWidth={2.2}
                                  style={
                                    vendorRaffleRulesExpanded
                                      ? styles.vendorRaffleRulesChevronOpen
                                      : undefined
                                  }
                                />
                              </View>
                            </TouchableOpacity>
                            {vendorRaffleRulesExpanded ? (
                              <View
                                style={styles.vendorRaffleRulesContent}
                                testID="vendor-draw-rules-details"
                              >
                                <View style={styles.vendorRaffleInfoCard}>
                                  <Text style={styles.vendorRaffleInfoTitle}>
                                    Vendor responsibilities
                                  </Text>
                                  <Text style={styles.vendorRaffleInfoText}>
                                    {vendorResponsibilityDisclosure ||
                                      'The current vendor responsibility agreement could not be verified. Reload before accepting or opening entries.'}
                                  </Text>
                                </View>
                                <View style={styles.vendorRaffleInfoCard}>
                                  <Text style={styles.vendorRaffleInfoTitle}>
                                    Wedding Win&apos;s role
                                  </Text>
                                  <Text style={styles.vendorRaffleInfoText}>
                                    Wedding Win provides the technical tools and
                                    records the vendor&apos;s confirmation. The
                                    vendor checks eligibility, obtains any
                                    required release, and provides the prize.
                                  </Text>
                                </View>
                                <View style={styles.vendorRaffleInfoCard}>
                                  <Text style={styles.vendorRaffleInfoTitle}>
                                    Why prize details lock
                                  </Text>
                                  <Text style={styles.vendorRaffleInfoText}>
                                    Once a promotion opens or receives an entry,
                                    its prize, winner count, and repeat-winner
                                    rule stay fixed so every entrant receives
                                    the offer they accepted. Close the current
                                    draw before creating a materially different
                                    prize under a new rules version.
                                  </Text>
                                </View>
                                <View style={styles.vendorRaffleInfoCard}>
                                  <Text style={styles.vendorRaffleInfoTitle}>
                                    Current event and entry terms
                                  </Text>
                                  <Text style={styles.vendorRaffleInfoText}>
                                    Vendor draws are for eligible couples
                                    attending the wedding show in person.
                                    Couples visit your booth, scan your QR code,
                                    and separately choose whether to enter. The
                                    QR entry replaces a paper ballot. General
                                    admission is free in advance while
                                    available; VIP and door admission may be
                                    paid, but paid admission never improves the
                                    odds. Eligibility:{' '}
                                    {vendorRaffle?.eligibility_region ||
                                      vendorRaffle?.settings
                                        ?.eligibility_region ||
                                      'see Official Rules'}
                                    . Entries close{' '}
                                    {formatPromotionDate(
                                      vendorRaffle?.entry_closes_at ||
                                        vendorRaffle?.settings?.entry_closes_at,
                                    )}
                                    . Scheduled draw{' '}
                                    {formatPromotionDate(
                                      vendorRaffle?.draw_at ||
                                        vendorRaffle?.settings?.draw_at,
                                    )}
                                    .{' '}
                                    {vendorRaffle?.odds_basis ||
                                      vendorRaffle?.settings?.odds_basis ||
                                      'Each accepted entry has an equal chance in random potential-winner selection.'}
                                  </Text>
                                </View>
                              </View>
                            ) : null}
                            <View style={styles.vendorRaffleAgreementPanel}>
                              <TouchableOpacity
                                style={styles.vendorRaffleRulesLinkButton}
                                activeOpacity={0.76}
                                onPress={() => {
                                  if (!vendorRaffle?.terms_url) return;
                                  Linking.openURL(vendorRaffle.terms_url).catch(
                                    () =>
                                      setVendorRaffleError(
                                        'The official rules could not be opened.',
                                      ),
                                  );
                                }}
                                accessibilityRole="link"
                                accessibilityLabel="Open vendor draw official rules"
                              >
                                <Text style={styles.vendorRaffleRulesLink}>
                                  Open Official Rules
                                </Text>
                              </TouchableOpacity>
                              <TouchableOpacity
                                style={[
                                  styles.signupConsentToggle,
                                  vendorRaffleSettingsMutationBusy &&
                                    styles.loginButtonDisabled,
                                ]}
                                activeOpacity={0.78}
                                disabled={vendorRaffleSettingsMutationBusy}
                                onPress={() => {
                                  if (
                                    !vendorRaffle?.terms_url ||
                                    !vendorRaffle?.rules_version ||
                                    !vendorResponsibilityDisclosure
                                  ) {
                                    Alert.alert(
                                      'Agreement unavailable',
                                      'Reload the current Official Rules and vendor responsibilities before accepting.',
                                    );
                                    return;
                                  }
                                  if (raffleEnabled && raffleLegalAccepted) {
                                    Alert.alert(
                                      'Turn entries off first',
                                      'An open draw must keep its vendor responsibility acceptance. Turn off prize entries before withdrawing acceptance.',
                                    );
                                    return;
                                  }
                                  markVendorRaffleLocalEdit();
                                  const nextAccepted = !raffleLegalAccepted;
                                  setRaffleLegalAccepted(nextAccepted);
                                  setVendorRaffleRulesViewedVersion(
                                    nextAccepted
                                      ? vendorRaffleRulesVersion
                                      : '',
                                  );
                                }}
                                testID="vendor-draw-rules-acceptance"
                                accessibilityRole="checkbox"
                                accessibilityLabel="Confirm the Official Rules and vendor responsibilities were read and accepted"
                                accessibilityState={{
                                  checked: raffleLegalAccepted,
                                  disabled: vendorRaffleSettingsMutationBusy,
                                }}
                              >
                                <View
                                  style={[
                                    styles.signupConsentBox,
                                    raffleLegalAccepted &&
                                      styles.signupConsentBoxChecked,
                                  ]}
                                >
                                  {raffleLegalAccepted ? (
                                    <Text style={styles.signupConsentCheck}>
                                      {'\u2713'}
                                    </Text>
                                  ) : null}
                                </View>
                                <Text
                                  style={[
                                    styles.signupConsentText,
                                    styles.vendorRaffleAgreementText,
                                  ]}
                                >
                                  I confirm I have read and accept the current
                                  Official Rules and vendor responsibilities,
                                  and I am authorized to do so for this vendor.
                                </Text>
                              </TouchableOpacity>
                            </View>
                          </View>
                          <TouchableOpacity
                            style={[
                              styles.vendorRaffleToggleRow,
                              vendorRaffleSettingsMutationBusy &&
                                styles.loginButtonDisabled,
                            ]}
                            activeOpacity={0.8}
                            disabled={vendorRaffleSettingsMutationBusy}
                            onPress={() => {
                              markVendorRaffleLocalEdit();
                              setRaffleEnabled((value) => {
                                const nextValue = !value;
                                if (
                                  nextValue &&
                                  (!raffleLegalAccepted ||
                                    vendorRaffleRulesViewedVersion !==
                                      vendorRaffleRulesVersion)
                                ) {
                                  Alert.alert(
                                    'Confirmation required',
                                    'Check the box confirming you have read and accept the current Official Rules and vendor responsibilities.',
                                  );
                                  return false;
                                }
                                if (
                                  nextValue &&
                                  !rafflePrizeDescription.trim()
                                ) {
                                  Alert.alert(
                                    'Add the prize first',
                                    'Describe the prize before accepting entries.',
                                  );
                                  return false;
                                }
                                if (
                                  nextValue &&
                                  !(Number(rafflePrizeApproxValueCad) > 0)
                                ) {
                                  Alert.alert(
                                    'Add the prize value',
                                    'Enter the prize value or maximum savings in Canadian dollars before accepting entries.',
                                  );
                                  return false;
                                }
                                return nextValue;
                              });
                            }}
                            testID="vendor-draw-open-entries"
                            accessibilityRole="switch"
                            accessibilityLabel="Open your prize draw"
                            accessibilityState={{
                              checked: raffleEnabled,
                              disabled: vendorRaffleSettingsMutationBusy,
                            }}
                          >
                            <View
                              style={[
                                styles.vendorRaffleToggle,
                                raffleEnabled && styles.vendorRaffleToggleOn,
                              ]}
                            >
                              <View
                                style={[
                                  styles.vendorRaffleToggleKnob,
                                  raffleEnabled &&
                                    styles.vendorRaffleToggleKnobOn,
                                ]}
                              />
                            </View>
                            <View style={styles.vendorRaffleToggleCopy}>
                              <Text style={styles.vendorRaffleToggleTitle}>
                                Open your prize draw
                              </Text>
                              <Text style={styles.vendorRaffleToggleText}>
                                {raffleEnabled
                                  ? 'Your draw is open. Couples who scan your booth can choose to enter.'
                                  : 'Your draw is closed. Couples can still scan your booth for QR Bingo, but they will not see an option to enter your draw.'}
                              </Text>
                            </View>
                          </TouchableOpacity>
                        </>
                      ) : null}
                      <View>
                        {vendorRaffleWizardStep === 1 ? (
                          <View testID="vendor-draw-step-prize">
                            <Text style={styles.inputLabel}>
                              Prize or discount details
                            </Text>
                            <View
                              style={[
                                styles.inputShell,
                                styles.vendorRaffleTextAreaShell,
                              ]}
                            >
                              <TextInput
                                value={rafflePrizeDescription}
                                editable={!vendorRafflePrizeControlsDisabled}
                                onChangeText={(value) => {
                                  markVendorRaffleLocalEdit();
                                  setRafflePrizeDescription(value);
                                }}
                                placeholder={
                                  'Example: 50% off a photography package\nMaximum discount $500. New bookings only; include the package, expiry, and exclusions.'
                                }
                                placeholderTextColor="#A8A8AD"
                                style={[
                                  styles.textInput,
                                  styles.vendorRaffleTextArea,
                                ]}
                                testID="vendor-draw-prize-details"
                                accessibilityLabel="Prize or discount details"
                                accessibilityState={{
                                  disabled: vendorRafflePrizeControlsDisabled,
                                }}
                                multiline
                              />
                            </View>
                            <Text style={styles.vendorRaffleFieldHelp}>
                              {vendorRaffleMaterialLocked
                                ? 'Prize details are locked for this open draw. See Vendor Draw Rules for why.'
                                : 'Use the first line as the prize name. Discounts such as 50% off are supported—state the service or package, maximum savings, expiry, booking requirements, and exclusions.'}
                            </Text>
                            <Text style={styles.inputLabel}>
                              Prize value or maximum savings (CAD)
                            </Text>
                            <View style={styles.inputShell}>
                              <TextInput
                                value={rafflePrizeApproxValueCad}
                                editable={!vendorRafflePrizeControlsDisabled}
                                onChangeText={(value) => {
                                  markVendorRaffleLocalEdit();
                                  setRafflePrizeApproxValueCad(
                                    normalizeCurrencyDraft(value),
                                  );
                                }}
                                placeholder="Example: 250"
                                placeholderTextColor="#A8A8AD"
                                style={styles.textInput}
                                keyboardType="decimal-pad"
                                testID="vendor-draw-prize-value"
                                accessibilityLabel="Approximate prize value or maximum savings in Canadian dollars"
                                accessibilityState={{
                                  disabled: vendorRafflePrizeControlsDisabled,
                                }}
                              />
                            </View>
                            <Text style={styles.vendorRaffleFieldHelp}>
                              Required before entries can open. For a percentage
                              discount, enter the largest dollar amount a winner
                              can save. Couples see this amount before opting
                              in.
                            </Text>
                            <Text style={styles.inputLabel}>
                              Number of winners
                            </Text>
                            <View style={styles.vendorRaffleWinnerCountOptions}>
                              {([1, 2, 3] as const).map((count) => (
                                <TouchableOpacity
                                  key={count}
                                  style={[
                                    styles.vendorRaffleWinnerCountOption,
                                    raffleMaxWinners === count &&
                                      styles.vendorRaffleWinnerCountOptionSelected,
                                    vendorRafflePrizeControlsDisabled &&
                                      styles.loginButtonDisabled,
                                  ]}
                                  activeOpacity={0.78}
                                  disabled={vendorRafflePrizeControlsDisabled}
                                  onPress={() => {
                                    markVendorRaffleLocalEdit();
                                    setRaffleMaxWinners(count);
                                  }}
                                  testID={`vendor-draw-winner-count-${count}`}
                                  accessibilityRole="button"
                                  accessibilityLabel={`${count} ${count === 1 ? 'winner' : 'winners'}`}
                                  accessibilityState={{
                                    selected: raffleMaxWinners === count,
                                    disabled: vendorRafflePrizeControlsDisabled,
                                  }}
                                >
                                  <Text
                                    style={[
                                      styles.vendorRaffleWinnerCountOptionText,
                                      raffleMaxWinners === count &&
                                        styles.vendorRaffleWinnerCountOptionTextSelected,
                                    ]}
                                  >
                                    {count}
                                  </Text>
                                </TouchableOpacity>
                              ))}
                            </View>
                            <Text style={styles.vendorRaffleFieldHelp}>
                              Choose up to three verified winners. Each
                              selection is a separate step, and no winner email
                              is sent until you verify that selection and tap
                              Send Winner Email.
                            </Text>
                            <TouchableOpacity
                              style={[
                                styles.vendorRaffleToggleRow,
                                vendorRafflePrizeControlsDisabled &&
                                  styles.loginButtonDisabled,
                              ]}
                              activeOpacity={0.8}
                              disabled={vendorRafflePrizeControlsDisabled}
                              onPress={() => {
                                markVendorRaffleLocalEdit();
                                setRaffleExcludePreviousWinners(
                                  (value) => !value,
                                );
                              }}
                              testID="vendor-draw-no-repeat-winners"
                              accessibilityRole="switch"
                              accessibilityLabel="Do not select the same couple twice"
                              accessibilityState={{
                                checked: raffleExcludePreviousWinners,
                                disabled: vendorRafflePrizeControlsDisabled,
                              }}
                            >
                              <View
                                style={[
                                  styles.vendorRaffleToggle,
                                  raffleExcludePreviousWinners &&
                                    styles.vendorRaffleToggleOn,
                                ]}
                              >
                                <View
                                  style={[
                                    styles.vendorRaffleToggleKnob,
                                    raffleExcludePreviousWinners &&
                                      styles.vendorRaffleToggleKnobOn,
                                  ]}
                                />
                              </View>
                              <View style={styles.vendorRaffleToggleCopy}>
                                <Text style={styles.vendorRaffleToggleTitle}>
                                  Do not select the same couple twice
                                </Text>
                                <Text style={styles.vendorRaffleToggleText}>
                                  {raffleExcludePreviousWinners
                                    ? 'On (recommended): a verified winner is excluded from later random selections for this vendor draw.'
                                    : 'Off: a prior verified winner remains eligible in later random selections.'}
                                </Text>
                              </View>
                            </TouchableOpacity>
                            {vendorRaffleMaterialLocked ? (
                              <Text style={styles.vendorRaffleFieldHelp}>
                                Winner settings are locked for this draw. See
                                Vendor Draw Rules for details.
                              </Text>
                            ) : null}
                          </View>
                        ) : null}
                        {vendorRaffleWizardStep === 2 ? (
                          <View
                            style={styles.vendorRaffleEmailPreview}
                            testID="vendor-draw-email-preview"
                          >
                            <TouchableOpacity
                              style={styles.vendorRafflePreviewHeader}
                              activeOpacity={0.78}
                              onPress={() =>
                                setVendorRaffleEmailPreviewExpanded(
                                  (value) => !value,
                                )
                              }
                              accessibilityRole="button"
                              accessibilityLabel="Preview email sent to the couple"
                              accessibilityState={{
                                expanded: vendorRaffleEmailPreviewExpanded,
                              }}
                            >
                              <View style={styles.vendorRaffleGuideCopy}>
                                <Text style={styles.vendorRafflePreviewEyebrow}>
                                  Couple email preview
                                </Text>
                                <Text style={styles.vendorRafflePreviewMeta}>
                                  Sent only when you tap Send Winner Email
                                </Text>
                              </View>
                              <ChevronDown
                                size={20}
                                color="#8A454B"
                                strokeWidth={2.2}
                                style={
                                  vendorRaffleEmailPreviewExpanded
                                    ? styles.vendorRaffleRulesChevronOpen
                                    : undefined
                                }
                              />
                            </TouchableOpacity>
                            {vendorRaffleEmailPreviewExpanded ? (
                              <View style={styles.vendorRafflePreviewPaper}>
                                <Image
                                  source={{
                                    uri: 'https://www.weddingwin.ca/images/CoralLogoTransB.png',
                                  }}
                                  style={styles.vendorRafflePreviewLogo}
                                  resizeMode="contain"
                                  accessibilityLabel="WeddingWin.ca"
                                />
                                <View
                                  style={styles.vendorRafflePreviewDivider}
                                />
                                <Text style={styles.vendorRafflePreviewSubject}>
                                  Subject: {vendorDrawEmailSubjectPreview}
                                </Text>
                                <Text style={styles.vendorRafflePreviewBody}>
                                  Hi First Name,
                                </Text>
                                <Text style={styles.vendorRafflePreviewBody}>
                                  Congratulations, your name was selected by{' '}
                                  {vendorDrawNamePreview} for their draw.
                                </Text>
                                <View style={styles.vendorRafflePreviewBox}>
                                  <Text
                                    style={styles.vendorRafflePreviewSection}
                                  >
                                    Your draw
                                  </Text>
                                  <Text style={styles.vendorRafflePreviewBody}>
                                    Vendor: {vendorDrawNamePreview}
                                  </Text>
                                  <Text style={styles.vendorRafflePreviewBody}>
                                    Draw item: {vendorDrawPrizePreview}
                                  </Text>
                                </View>
                                <Text style={styles.vendorRafflePreviewSection}>
                                  What happens next
                                </Text>
                                <Text style={styles.vendorRafflePreviewBody}>
                                  {vendorDrawNamePreview} will follow up with
                                  the prize details and next steps.
                                </Text>
                                <View style={styles.vendorRafflePreviewButton}>
                                  <Text
                                    style={styles.vendorRafflePreviewButtonText}
                                  >
                                    View vendor profile
                                  </Text>
                                </View>
                                <Text style={styles.vendorRafflePreviewSection}>
                                  Why you received this
                                </Text>
                                <Text style={styles.vendorRafflePreviewBody}>
                                  You opted in after scanning this vendor{'’s'}{' '}
                                  QR code at the wedding show.
                                </Text>
                                <Text style={styles.vendorRafflePreviewFooter}>
                                  WeddingWin.ca
                                </Text>
                              </View>
                            ) : null}
                          </View>
                        ) : null}
                      </View>
                      {vendorRaffleWizardStep === 3 ? (
                        <View testID="vendor-draw-step-couples">
                          <View style={styles.vendorRaffleStatsRow}>
                            <View style={styles.vendorRaffleStat}>
                              <Text style={styles.vendorRaffleStatValue}>
                                {vendorRaffleEntrantCount}
                              </Text>
                              <Text style={styles.vendorRaffleStatLabel}>
                                Total entrants
                              </Text>
                            </View>
                            <View style={styles.vendorRaffleStat}>
                              <Text style={styles.vendorRaffleStatValue}>
                                {vendorRaffleSelectionPoolCount}
                              </Text>
                              <Text style={styles.vendorRaffleStatLabel}>
                                In selection pool
                              </Text>
                            </View>
                            <View style={styles.vendorRaffleStat}>
                              <Text style={styles.vendorRaffleStatValue}>
                                {vendorRaffleDrawCount}/{vendorRaffleMaxDraws}
                              </Text>
                              <Text style={styles.vendorRaffleStatLabel}>
                                Selections used
                              </Text>
                            </View>
                          </View>
                          <Text style={styles.vendorRaffleSectionEyebrow}>
                            Couple contacts
                          </Text>
                          <Text
                            style={styles.vendorRaffleSectionTitle}
                            accessibilityRole="header"
                          >
                            Your draw contacts
                          </Text>
                          <Text style={styles.vendorRaffleHint}>
                            Search every couple who opted in. Open Manage winner
                            selection on a contact only when you need to remove
                            or restore them. Every contact stays in your CSV.
                          </Text>
                          <Text style={styles.vendorRaffleHint}>
                            Included: {vendorRaffleSelectionPoolCount} ·
                            Excluded: {vendorRaffleExcludedCount}
                          </Text>
                          {vendorRaffleHasPendingPotentialWinner ? (
                            <View style={styles.vendorRaffleDrawStatusCard}>
                              <Text style={styles.vendorRaffleDrawStatusLabel}>
                                Selection pool paused
                              </Text>
                              <Text style={styles.vendorRaffleDrawStatusText}>
                                Include, exclude, and restore controls are
                                temporarily disabled while a potential winner is
                                awaiting verification or disqualification.
                              </Text>
                            </View>
                          ) : null}
                          <View style={styles.vendorRaffleExportRow}>
                            <TouchableOpacity
                              style={[
                                styles.raffleCancelButton,
                                vendorRaffleEntriesLoading &&
                                  styles.loginButtonDisabled,
                              ]}
                              activeOpacity={0.78}
                              disabled={vendorRaffleEntriesLoading}
                              onPress={fetchVendorRaffleEntries}
                              testID="vendor-draw-load-contacts"
                              accessibilityRole="button"
                              accessibilityLabel={
                                vendorRaffleEntries.length
                                  ? 'Refresh draw contacts'
                                  : 'View draw contacts'
                              }
                            >
                              {vendorRaffleEntriesLoading ? (
                                <ActivityIndicator
                                  size="small"
                                  color="#AA565D"
                                />
                              ) : (
                                <Text style={styles.raffleCancelText}>
                                  {vendorRaffleEntries.length
                                    ? 'Refresh Contacts'
                                    : 'View Couple Contacts'}
                                </Text>
                              )}
                            </TouchableOpacity>
                          </View>
                          {vendorRaffleEntries.length ? (
                            <View>
                              <View style={styles.vendorRaffleContactSearch}>
                                <Search
                                  size={18}
                                  color="#8B7C78"
                                  strokeWidth={2}
                                />
                                <TextInput
                                  value={vendorRaffleEntryQuery}
                                  onChangeText={setVendorRaffleEntryQuery}
                                  placeholder="Search name, email or phone"
                                  placeholderTextColor="#A28F8A"
                                  style={styles.vendorRaffleContactSearchInput}
                                  autoCapitalize="none"
                                  autoCorrect={false}
                                  returnKeyType="search"
                                  testID="vendor-draw-contact-search"
                                  accessibilityLabel="Search draw contacts"
                                />
                                {vendorRaffleEntryQuery ? (
                                  <TouchableOpacity
                                    style={
                                      styles.vendorRaffleContactSearchClear
                                    }
                                    onPress={() =>
                                      setVendorRaffleEntryQuery('')
                                    }
                                    accessibilityRole="button"
                                    accessibilityLabel="Clear contact search"
                                  >
                                    <X
                                      size={16}
                                      color="#756662"
                                      strokeWidth={2.2}
                                    />
                                  </TouchableOpacity>
                                ) : null}
                              </View>
                              <View
                                style={styles.vendorRaffleContactFilters}
                                accessibilityLabel="Filter draw contacts"
                              >
                                {(
                                  [
                                    ['all', 'All'],
                                    ['included', 'In selection'],
                                    ['excluded', 'Not selectable'],
                                  ] as const
                                ).map(([value, label]) => {
                                  const selected =
                                    vendorRaffleEntryFilter === value;
                                  return (
                                    <TouchableOpacity
                                      key={value}
                                      style={[
                                        styles.vendorRaffleContactFilter,
                                        selected &&
                                          styles.vendorRaffleContactFilterSelected,
                                      ]}
                                      onPress={() =>
                                        setVendorRaffleEntryFilter(value)
                                      }
                                      accessibilityRole="button"
                                      accessibilityState={{ selected }}
                                      accessibilityLabel={`Show ${label.toLowerCase()} draw contacts`}
                                    >
                                      <Text
                                        style={[
                                          styles.vendorRaffleContactFilterText,
                                          selected &&
                                            styles.vendorRaffleContactFilterTextSelected,
                                        ]}
                                      >
                                        {label}
                                      </Text>
                                    </TouchableOpacity>
                                  );
                                })}
                              </View>
                              <Text
                                style={styles.vendorRaffleContactCount}
                                accessibilityLiveRegion="polite"
                              >
                                {vendorRaffleVisibleEntries.length ===
                                vendorRaffleEntries.length
                                  ? `${vendorRaffleEntries.length} ${vendorRaffleEntries.length === 1 ? 'contact' : 'contacts'}`
                                  : `Showing ${vendorRaffleVisibleEntries.length} of ${vendorRaffleEntries.length} contacts`}
                              </Text>
                            </View>
                          ) : null}
                          {vendorRaffleVisibleEntries.map((entry) => {
                            const participantReference =
                              entry.participant_reference;
                            const isIncludedByVendor = entry.included !== false;
                            const poolStatus =
                              entry.pool_status ||
                              (isIncludedByVendor ? 'included' : 'excluded');
                            const isInSelectionPool =
                              entry.in_selection_pool === true ||
                              poolStatus === 'included';
                            const canExcludeFromPool =
                              poolStatus === 'included';
                            const canRestoreToPool = poolStatus === 'excluded';
                            const poolStatusLabel =
                              poolStatus === 'already_selected'
                                ? 'Selected'
                                : poolStatus === 'disqualified'
                                  ? 'Disqualified'
                                  : poolStatus === 'previous_winner'
                                    ? 'Prior winner'
                                    : poolStatus === 'reacceptance_required'
                                      ? 'Scan and reaccept required'
                                      : poolStatus === 'in_person_scan_required'
                                        ? 'In-show scan required'
                                        : poolStatus === 'excluded'
                                          ? 'Excluded'
                                          : 'Included';
                            const rowUpdating =
                              vendorRaffleEntryUpdatingReference ===
                              participantReference;
                            const canUpdateRow =
                              vendorRaffleCanUpdateEntries &&
                              entry.can_update !== false &&
                              !rowUpdating;
                            const entrantName =
                              entry.couple_name || 'Unnamed entrant';
                            const nameParts = entrantName
                              .trim()
                              .split(/\s+/)
                              .filter(Boolean);
                            const entrantInitials =
                              `${nameParts[0]?.[0] || 'W'}${nameParts.length > 1 ? nameParts[nameParts.length - 1]?.[0] || '' : ''}`.toUpperCase();
                            const entrantEmail = String(
                              entry.couple_email || '',
                            ).trim();
                            const entrantPhone = String(
                              entry.couple_phone || '',
                            ).trim();
                            const dialValue = entrantPhone.replace(
                              /[^0-9+]/g,
                              '',
                            );
                            const canEmail =
                              /^[^@\s?&#]+@[^@\s?&#]+\.[^@\s?&#]+$/.test(
                                entrantEmail,
                              );
                            const canCall =
                              dialValue.replace(/[^0-9]/g, '').length >= 7;
                            const managementProtected =
                              !canExcludeFromPool && !canRestoreToPool;
                            const managementLabel = managementProtected
                              ? 'View entry record'
                              : canRestoreToPool
                                ? 'Restore or review entry'
                                : 'Manage winner selection';
                            const isExpanded =
                              vendorRaffleExpandedEntryReference ===
                              participantReference;
                            return (
                              <View
                                key={participantReference}
                                style={styles.vendorRaffleEntrantCard}
                              >
                                <View style={styles.vendorRaffleEntrantHeading}>
                                  <View
                                    style={styles.vendorRaffleEntrantIdentity}
                                  >
                                    <View
                                      style={styles.vendorRaffleEntrantAvatar}
                                      accessibilityElementsHidden
                                    >
                                      <Text
                                        style={
                                          styles.vendorRaffleEntrantAvatarText
                                        }
                                      >
                                        {entrantInitials}
                                      </Text>
                                    </View>
                                    <View
                                      style={styles.vendorRaffleEntrantCopy}
                                    >
                                      <Text
                                        style={styles.vendorRaffleEntryName}
                                      >
                                        {entrantName}
                                      </Text>
                                      <Text
                                        style={styles.vendorRaffleEntryText}
                                      >
                                        Draw contact
                                      </Text>
                                    </View>
                                  </View>
                                  <View
                                    style={[
                                      styles.vendorRaffleEntrantStatus,
                                      !isInSelectionPool &&
                                        styles.vendorRaffleEntrantStatusExcluded,
                                    ]}
                                  >
                                    <Text
                                      style={[
                                        styles.vendorRaffleEntrantStatusText,
                                        !isInSelectionPool &&
                                          styles.vendorRaffleEntrantStatusTextExcluded,
                                      ]}
                                    >
                                      {poolStatusLabel}
                                    </Text>
                                  </View>
                                </View>
                                <View style={styles.vendorRaffleContactGrid}>
                                  <TouchableOpacity
                                    style={styles.vendorRaffleContactItem}
                                    activeOpacity={canEmail ? 0.72 : 1}
                                    disabled={!canEmail}
                                    onPress={() =>
                                      Linking.openURL(
                                        `mailto:${entrantEmail}`,
                                      ).catch(() =>
                                        setVendorRaffleError(
                                          'The email app could not be opened.',
                                        ),
                                      )
                                    }
                                    accessibilityRole={
                                      canEmail ? 'link' : undefined
                                    }
                                    accessibilityLabel={
                                      canEmail
                                        ? `Email ${entrantName} at ${entrantEmail}`
                                        : `No email provided for ${entrantName}`
                                    }
                                  >
                                    <Mail
                                      size={17}
                                      color="#AA565D"
                                      strokeWidth={2}
                                    />
                                    <View
                                      style={styles.vendorRaffleContactItemCopy}
                                    >
                                      <Text
                                        style={styles.vendorRaffleContactLabel}
                                      >
                                        Email
                                      </Text>
                                      <Text
                                        style={styles.vendorRaffleContactValue}
                                      >
                                        {entrantEmail || 'Not provided'}
                                      </Text>
                                    </View>
                                  </TouchableOpacity>
                                  <TouchableOpacity
                                    style={styles.vendorRaffleContactItem}
                                    activeOpacity={canCall ? 0.72 : 1}
                                    disabled={!canCall}
                                    onPress={() =>
                                      Linking.openURL(`tel:${dialValue}`).catch(
                                        () =>
                                          setVendorRaffleError(
                                            'The phone app could not be opened.',
                                          ),
                                      )
                                    }
                                    accessibilityRole={
                                      canCall ? 'link' : undefined
                                    }
                                    accessibilityLabel={
                                      canCall
                                        ? `Call ${entrantName} at ${entrantPhone}`
                                        : `No phone provided for ${entrantName}`
                                    }
                                  >
                                    <Phone
                                      size={17}
                                      color="#AA565D"
                                      strokeWidth={2}
                                    />
                                    <View
                                      style={styles.vendorRaffleContactItemCopy}
                                    >
                                      <Text
                                        style={styles.vendorRaffleContactLabel}
                                      >
                                        Phone
                                      </Text>
                                      <Text
                                        style={styles.vendorRaffleContactValue}
                                      >
                                        {entrantPhone || 'Not provided'}
                                      </Text>
                                    </View>
                                  </TouchableOpacity>
                                  <View style={styles.vendorRaffleContactItem}>
                                    <CalendarDays
                                      size={17}
                                      color="#AA565D"
                                      strokeWidth={2}
                                    />
                                    <View
                                      style={styles.vendorRaffleContactItemCopy}
                                    >
                                      <Text
                                        style={styles.vendorRaffleContactLabel}
                                      >
                                        Wedding date
                                      </Text>
                                      <Text
                                        style={styles.vendorRaffleContactValue}
                                      >
                                        {entry.couple_wedding_date ||
                                          'Not provided'}
                                      </Text>
                                    </View>
                                  </View>
                                </View>
                                <TouchableOpacity
                                  style={styles.vendorRaffleEntryManageButton}
                                  activeOpacity={0.72}
                                  onPress={() =>
                                    setVendorRaffleExpandedEntryReference(
                                      isExpanded ? null : participantReference,
                                    )
                                  }
                                  accessibilityRole="button"
                                  accessibilityState={{ expanded: isExpanded }}
                                  accessibilityLabel={`${managementLabel} for ${entrantName}`}
                                >
                                  <Text
                                    style={
                                      styles.vendorRaffleEntryManageButtonText
                                    }
                                  >
                                    {managementLabel}
                                  </Text>
                                  <ChevronDown
                                    size={18}
                                    color="#8A454B"
                                    strokeWidth={2.2}
                                    style={
                                      isExpanded
                                        ? styles.vendorRaffleEntryManageChevronOpen
                                        : undefined
                                    }
                                  />
                                </TouchableOpacity>
                                {isExpanded ? (
                                  <View
                                    style={styles.vendorRaffleEntryManagement}
                                  >
                                    <Text
                                      style={styles.vendorRaffleEntryReference}
                                    >
                                      Entry reference: {participantReference}
                                    </Text>
                                    <Text style={styles.vendorRaffleEntryText}>
                                      {entry.entry_method ===
                                      'alternate_free_entry'
                                        ? 'Archived historical entry'
                                        : 'In-show QR entry'}
                                      {entry.entered_at
                                        ? ` · ${formatPromotionDate(entry.entered_at)}`
                                        : ''}
                                    </Text>
                                    {entry.pool_status_reason ? (
                                      <Text
                                        style={
                                          styles.vendorRaffleExclusionReason
                                        }
                                      >
                                        {entry.pool_status_reason}
                                      </Text>
                                    ) : null}
                                    {canExcludeFromPool ? (
                                      <>
                                        <Text style={styles.inputLabel}>
                                          Reason to exclude
                                        </Text>
                                        <View style={styles.inputShell}>
                                          <TextInput
                                            value={
                                              vendorRaffleEntryReasons[
                                                participantReference
                                              ] || ''
                                            }
                                            editable={canUpdateRow}
                                            onChangeText={(value) => {
                                              setVendorRaffleEntryReasons(
                                                (current) => ({
                                                  ...current,
                                                  [participantReference]: value,
                                                }),
                                              );
                                              setVendorRaffleError(null);
                                            }}
                                            placeholder="Example: duplicate entry confirmed"
                                            placeholderTextColor="#A8A8AD"
                                            style={styles.textInput}
                                            maxLength={300}
                                            accessibilityLabel={`Reason to exclude ${entry.couple_name || 'entrant'}`}
                                          />
                                        </View>
                                        <TouchableOpacity
                                          style={[
                                            styles.vendorRaffleSmallDangerButton,
                                            !canUpdateRow &&
                                              styles.loginButtonDisabled,
                                          ]}
                                          activeOpacity={0.78}
                                          disabled={!canUpdateRow}
                                          onPress={() =>
                                            updateVendorRaffleEntry(
                                              entry,
                                              false,
                                            )
                                          }
                                          accessibilityRole="button"
                                          accessibilityLabel={`Exclude ${entry.couple_name || 'entrant'} from selection`}
                                        >
                                          {rowUpdating ? (
                                            <ActivityIndicator
                                              size="small"
                                              color="#9B3E36"
                                            />
                                          ) : (
                                            <Text
                                              style={
                                                styles.vendorRaffleSmallDangerButtonText
                                              }
                                            >
                                              Exclude from Selection
                                            </Text>
                                          )}
                                        </TouchableOpacity>
                                      </>
                                    ) : canRestoreToPool ? (
                                      <>
                                        <Text
                                          style={
                                            styles.vendorRaffleExclusionReason
                                          }
                                        >
                                          Reason:{' '}
                                          {entry.exclusion_reason ||
                                            'No reason returned.'}
                                        </Text>
                                        <TouchableOpacity
                                          style={[
                                            styles.vendorRaffleSmallRestoreButton,
                                            !canUpdateRow &&
                                              styles.loginButtonDisabled,
                                          ]}
                                          activeOpacity={0.78}
                                          disabled={!canUpdateRow}
                                          onPress={() =>
                                            updateVendorRaffleEntry(entry, true)
                                          }
                                          accessibilityRole="button"
                                          accessibilityLabel={`Restore ${entry.couple_name || 'entrant'} to selection`}
                                        >
                                          {rowUpdating ? (
                                            <ActivityIndicator
                                              size="small"
                                              color="#168044"
                                            />
                                          ) : (
                                            <Text
                                              style={
                                                styles.vendorRaffleSmallRestoreButtonText
                                              }
                                            >
                                              Restore to Selection
                                            </Text>
                                          )}
                                        </TouchableOpacity>
                                      </>
                                    ) : (
                                      <Text
                                        style={
                                          styles.vendorRaffleExclusionReason
                                        }
                                      >
                                        {poolStatus === 'already_selected'
                                          ? 'This entrant has already been selected and cannot be changed in the selection pool.'
                                          : poolStatus === 'disqualified'
                                            ? 'This disqualification is preserved in the audit record, and the entrant cannot be selected again for this vendor offer.'
                                            : 'The no-repeat setting keeps this prior winner out of the current selection pool.'}
                                      </Text>
                                    )}
                                    <Text style={styles.vendorRaffleFieldHelp}>
                                      This contact stays in the downloadable CSV
                                      whether included or excluded.
                                    </Text>
                                  </View>
                                ) : null}
                              </View>
                            );
                          })}
                          {vendorRaffleEntries.length &&
                          !vendorRaffleVisibleEntries.length ? (
                            <View style={styles.vendorRaffleContactEmpty}>
                              <Text
                                style={styles.vendorRaffleContactEmptyTitle}
                              >
                                No matching couples
                              </Text>
                              <Text style={styles.vendorRaffleContactEmptyText}>
                                Try another search or choose a different filter.
                              </Text>
                            </View>
                          ) : null}
                          <Text style={styles.vendorRaffleHint}>
                            Download every couple who entered this draw, with
                            name, email, phone, wedding date, and entry/consent
                            evidence. The list excludes member IDs and raw
                            database IDs. Each listed couple agreed that this
                            named vendor may use the information for the draw
                            and wedding-related marketing.
                          </Text>
                          <View style={styles.vendorRaffleExportRow}>
                            <TouchableOpacity
                              style={[
                                styles.raffleCancelButton,
                                vendorRaffleExporting &&
                                  styles.loginButtonDisabled,
                              ]}
                              activeOpacity={0.78}
                              disabled={vendorRaffleExporting}
                              onPress={downloadVendorParticipationReport}
                              testID="vendor-draw-download-contacts"
                              accessibilityRole="button"
                              accessibilityLabel="Download vendor draw entrant list CSV"
                            >
                              {vendorRaffleExporting ? (
                                <ActivityIndicator
                                  size="small"
                                  color="#AA565D"
                                />
                              ) : (
                                <Text style={styles.raffleCancelText}>
                                  Download Contacts (CSV)
                                </Text>
                              )}
                            </TouchableOpacity>
                          </View>
                          <Text style={styles.vendorRaffleHint}>
                            Every person in this list expressly chose this named
                            vendor draw and accepted its named-vendor
                            contact-sharing and wedding-related marketing terms.
                            Honour unsubscribe requests and protect the
                            information under the Vendor Draw Rules.
                          </Text>
                        </View>
                      ) : null}
                      {vendorRaffleWizardStep === 4 ? (
                        <View testID="vendor-draw-step-winner">
                          <Text style={styles.vendorRaffleSectionEyebrow}>
                            Potential-winner selection
                          </Text>
                          <Text
                            style={styles.vendorRaffleSectionTitle}
                            accessibilityRole="header"
                          >
                            Winner selection and email
                          </Text>
                          <View style={styles.vendorRaffleDrawStatusCard}>
                            <Text style={styles.vendorRaffleDrawStatusLabel}>
                              {vendorRaffleCanTestSuppressedNotice
                                ? 'Safe test send ready'
                                : vendorRaffleOutboundEmailBlocked
                                  ? 'Verified email waiting'
                                  : vendorRaffleHasPendingPotentialWinner
                                    ? 'Awaiting vendor verification'
                                    : vendorRaffleWillSendVerifiedNotice
                                      ? 'Winner email ready'
                                      : vendorRaffleDrawsRemaining <= 0
                                        ? 'All winner spots filled'
                                        : !vendorRaffleHasEligibleEntries
                                          ? 'Waiting for included entrants'
                                          : vendorRaffleCanPickWinner
                                            ? 'Selection is available'
                                            : 'Selection opens after entry closes'}
                            </Text>
                            <Text style={styles.vendorRaffleDrawStatusText}>
                              {vendorRaffleCanTestSuppressedNotice
                                ? 'Verification is recorded. Use Test Send on the matching selection to exercise the separate send step; this isolated fixture will send no email and record no delivery timestamp.'
                                : vendorRaffleOutboundEmailBlocked
                                  ? 'The verified selection is preserved, but its separate winner-email button remains disabled until outbound delivery is available.'
                                  : vendorRaffleHasPendingPotentialWinner
                                    ? 'A potential winner is awaiting verification. No fulfillment notice or prize claim is allowed yet.'
                                    : vendorRaffleWillSendVerifiedNotice
                                      ? 'Verification is recorded. Use Send Winner Email on the matching verified selection below; selecting and emailing remain separate actions.'
                                      : vendorRaffleDrawsRemaining <= 0
                                        ? `All ${vendorRaffleMaxDraws} configured winner ${vendorRaffleMaxDraws === 1 ? 'slot is' : 'slots are'} used.`
                                        : !vendorRaffleHasEligibleEntries
                                          ? 'Restore or wait for an eligible entrant before selecting another potential winner.'
                                          : vendorRaffleCanPickWinner
                                            ? `${vendorRaffleDrawsRemaining} of ${vendorRaffleMaxDraws} potential-winner selections available.`
                                            : `Selection is available after ${formatPromotionDate(vendorRaffle?.draw_opens_at)}.`}
                            </Text>
                          </View>
                          <View style={styles.vendorRaffleWinnerSteps}>
                            <View style={styles.vendorRaffleWinnerStep}>
                              <Text style={styles.vendorRaffleWinnerStepNumber}>
                                1
                              </Text>
                              <View style={styles.vendorRaffleWinnerStepCopy}>
                                <View
                                  style={styles.vendorRaffleWinnerStepTitleRow}
                                  accessible={false}
                                >
                                  <UserRound
                                    size={17}
                                    color="#AA565D"
                                    strokeWidth={2.2}
                                  />
                                  <Text
                                    style={styles.vendorRaffleWinnerStepTitle}
                                  >
                                    Pick a potential winner
                                  </Text>
                                </View>
                                <Text style={styles.vendorRaffleWinnerStepText}>
                                  After entries close, tap Select Potential
                                  Winner. Wedding Win will randomly choose one
                                  couple.
                                </Text>
                              </View>
                            </View>
                            <View style={styles.vendorRaffleWinnerStep}>
                              <Text style={styles.vendorRaffleWinnerStepNumber}>
                                2
                              </Text>
                              <View style={styles.vendorRaffleWinnerStepCopy}>
                                <View
                                  style={styles.vendorRaffleWinnerStepTitleRow}
                                  accessible={false}
                                >
                                  <Eye
                                    size={17}
                                    color="#AA565D"
                                    strokeWidth={2.2}
                                  />
                                  <Text
                                    style={styles.vendorRaffleWinnerStepTitle}
                                  >
                                    Confirm the winner
                                  </Text>
                                </View>
                                <Text style={styles.vendorRaffleWinnerStepText}>
                                  Make sure the couple meets your draw rules,
                                  then finish the quick verification steps.
                                </Text>
                              </View>
                            </View>
                            <View style={styles.vendorRaffleWinnerStep}>
                              <Text style={styles.vendorRaffleWinnerStepNumber}>
                                3
                              </Text>
                              <View style={styles.vendorRaffleWinnerStepCopy}>
                                <View
                                  style={styles.vendorRaffleWinnerStepTitleRow}
                                  accessible={false}
                                >
                                  <Mail
                                    size={17}
                                    color="#AA565D"
                                    strokeWidth={2.2}
                                  />
                                  <Text
                                    style={styles.vendorRaffleWinnerStepTitle}
                                  >
                                    Send the good news
                                  </Text>
                                </View>
                                <Text style={styles.vendorRaffleWinnerStepText}>
                                  Once verified, tap Send Winner Email. Wedding
                                  Win will send the official notice.
                                </Text>
                              </View>
                            </View>
                            <View style={styles.vendorRaffleWinnerStep}>
                              <Text style={styles.vendorRaffleWinnerStepNumber}>
                                4
                              </Text>
                              <View style={styles.vendorRaffleWinnerStepCopy}>
                                <View
                                  style={styles.vendorRaffleWinnerStepTitleRow}
                                  accessible={false}
                                >
                                  <Store
                                    size={17}
                                    color="#AA565D"
                                    strokeWidth={2.2}
                                  />
                                  <Text
                                    style={styles.vendorRaffleWinnerStepTitle}
                                  >
                                    Give the prize
                                  </Text>
                                </View>
                                <Text style={styles.vendorRaffleWinnerStepText}>
                                  Contact the verified couple to arrange their
                                  prize. Entrants also agreed that you may
                                  contact them about wedding-related offers.
                                </Text>
                              </View>
                            </View>
                          </View>
                          {vendorPendingPotentialWinner ? (
                            <View style={styles.vendorRaffleWinnerCard}>
                              <Text style={styles.vendorRaffleWinnerTitle}>
                                Vendor verification required
                              </Text>
                              <Text style={styles.vendorRaffleWinnerName}>
                                {vendorPendingPotentialWinner.winner_name}
                              </Text>
                              <Text style={styles.vendorRaffleWinnerText}>
                                {vendorPendingPotentialWinner.winner_email}
                              </Text>
                              <Text style={styles.inputLabel}>
                                Verification question
                              </Text>
                              <Text style={styles.vendorRaffleSectionTitle}>
                                {vendorPendingPotentialWinner.skill_question_prompt ||
                                  'The verification question could not be generated. Contact Wedding Win support; do not confirm this selection.'}
                              </Text>
                              <Text style={styles.inputLabel}>
                                Couple&apos;s answer
                              </Text>
                              <View style={styles.inputShell}>
                                <TextInput
                                  value={vendorSkillAnswer}
                                  onChangeText={(value) => {
                                    setVendorSkillAnswer(value);
                                    setVendorRaffleError(null);
                                  }}
                                  placeholder="Enter the answer"
                                  placeholderTextColor="#A8A8AD"
                                  style={styles.textInput}
                                  keyboardType="numbers-and-punctuation"
                                  testID="vendor-draw-winner-answer"
                                  accessibilityLabel="Selected couple verification answer"
                                />
                              </View>
                              <Text style={styles.vendorRaffleFieldHelp}>
                                Enter the answer exactly as the selected couple
                                provides it. Wedding Win checks it when you
                                submit.
                              </Text>
                              <TouchableOpacity
                                style={styles.signupConsentToggle}
                                onPress={() => {
                                  setVendorEligibilityConfirmed(
                                    (value) => !value,
                                  );
                                  setVendorRaffleError(null);
                                }}
                                testID="vendor-draw-winner-eligibility"
                                accessibilityRole="checkbox"
                                accessibilityState={{
                                  checked: vendorEligibilityConfirmed,
                                }}
                              >
                                <View
                                  style={[
                                    styles.signupConsentBox,
                                    vendorEligibilityConfirmed &&
                                      styles.signupConsentBoxChecked,
                                  ]}
                                >
                                  {vendorEligibilityConfirmed ? (
                                    <Text style={styles.signupConsentCheck}>
                                      {'\u2713'}
                                    </Text>
                                  ) : null}
                                </View>
                                <Text style={styles.signupConsentText}>
                                  I attest that my business independently
                                  verified this person meets the eligibility
                                  requirements in the current Official Rules.
                                </Text>
                              </TouchableOpacity>
                              <TouchableOpacity
                                style={styles.signupConsentToggle}
                                onPress={() => {
                                  setVendorRulesReleaseConfirmed(
                                    (value) => !value,
                                  );
                                  setVendorRaffleError(null);
                                }}
                                testID="vendor-draw-winner-release"
                                accessibilityRole="checkbox"
                                accessibilityState={{
                                  checked: vendorRulesReleaseConfirmed,
                                }}
                              >
                                <View
                                  style={[
                                    styles.signupConsentBox,
                                    vendorRulesReleaseConfirmed &&
                                      styles.signupConsentBoxChecked,
                                  ]}
                                >
                                  {vendorRulesReleaseConfirmed ? (
                                    <Text style={styles.signupConsentCheck}>
                                      {'\u2713'}
                                    </Text>
                                  ) : null}
                                </View>
                                <Text style={styles.signupConsentText}>
                                  I attest that my business obtained the
                                  potential winner&apos;s required declaration
                                  and release outside Wedding Win and will
                                  complete prize fulfillment itself.
                                </Text>
                              </TouchableOpacity>
                              <Text style={styles.inputLabel}>
                                Verification date (YYYY-MM-DD)
                              </Text>
                              <View style={styles.inputShell}>
                                <TextInput
                                  value={vendorVerificationDate}
                                  onChangeText={(value) => {
                                    setVendorVerificationDate(value);
                                    setVendorRaffleError(null);
                                  }}
                                  placeholder="2026-08-30"
                                  placeholderTextColor="#A8A8AD"
                                  style={styles.textInput}
                                  keyboardType="numbers-and-punctuation"
                                  autoCapitalize="none"
                                  maxLength={10}
                                  testID="vendor-draw-verification-date"
                                  accessibilityLabel="Potential winner verification date"
                                />
                              </View>
                              <Text style={styles.inputLabel}>
                                Verification method
                              </Text>
                              <View style={styles.inputShell}>
                                <TextInput
                                  value={vendorVerificationMethod}
                                  onChangeText={(value) => {
                                    setVendorVerificationMethod(value);
                                    setVendorRaffleError(null);
                                  }}
                                  placeholder="Phone, video call, email, or in person"
                                  placeholderTextColor="#A8A8AD"
                                  style={styles.textInput}
                                  maxLength={120}
                                  testID="vendor-draw-verification-method"
                                  accessibilityLabel="Potential winner verification method"
                                />
                              </View>
                              <Text style={styles.inputLabel}>
                                Evidence reference
                              </Text>
                              <View style={styles.inputShell}>
                                <TextInput
                                  value={vendorVerificationReference}
                                  onChangeText={(value) => {
                                    setVendorVerificationReference(value);
                                    setVendorRaffleError(null);
                                  }}
                                  placeholder="Call-log time, email subject/date, or signed-release file ID"
                                  placeholderTextColor="#A8A8AD"
                                  style={styles.textInput}
                                  maxLength={300}
                                  testID="vendor-draw-verification-reference"
                                  accessibilityLabel="Potential winner verification evidence reference"
                                />
                              </View>
                              <Text style={styles.vendorRaffleFieldHelp}>
                                Required for confirmation. Record a
                                non-sensitive reference that your business can
                                use to locate its own evidence; do not paste
                                identity documents or the release itself.
                              </Text>
                              <Text style={styles.inputLabel}>
                                Additional notes or disqualification reason
                              </Text>
                              <View
                                style={[
                                  styles.inputShell,
                                  styles.vendorRaffleTextAreaShell,
                                ]}
                              >
                                <TextInput
                                  value={vendorReviewNotes}
                                  onChangeText={(value) => {
                                    setVendorReviewNotes(value);
                                    setVendorRaffleError(null);
                                  }}
                                  placeholder="Optional for confirmation; a reason is required to disqualify"
                                  placeholderTextColor="#A8A8AD"
                                  style={[
                                    styles.textInput,
                                    styles.vendorRaffleTextArea,
                                  ]}
                                  testID="vendor-draw-verification-notes"
                                  accessibilityLabel="Potential winner review notes"
                                  maxLength={400}
                                  multiline
                                />
                              </View>
                              <View style={styles.raffleModalActions}>
                                <TouchableOpacity
                                  style={[
                                    styles.raffleCancelButton,
                                    vendorRaffleReviewing &&
                                      styles.loginButtonDisabled,
                                  ]}
                                  disabled={vendorRaffleReviewing}
                                  onPress={() =>
                                    reviewVendorPotentialWinner(
                                      vendorPendingPotentialWinner.id,
                                      'disqualify',
                                    )
                                  }
                                  accessibilityRole="button"
                                  accessibilityLabel="Disqualify potential winner"
                                >
                                  <Text style={styles.raffleCancelText}>
                                    Disqualify
                                  </Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                  style={[
                                    styles.raffleEnterButton,
                                    vendorRaffleReviewing &&
                                      styles.loginButtonDisabled,
                                  ]}
                                  disabled={vendorRaffleReviewing}
                                  onPress={() =>
                                    reviewVendorPotentialWinner(
                                      vendorPendingPotentialWinner.id,
                                      'confirm',
                                    )
                                  }
                                  accessibilityRole="button"
                                  accessibilityLabel="Record vendor attestation and confirm potential winner"
                                >
                                  {vendorRaffleReviewing ? (
                                    <ActivityIndicator
                                      size="small"
                                      color="#FFFFFF"
                                    />
                                  ) : (
                                    <Text style={styles.raffleEnterText}>
                                      {vendorPotentialWinnerConfirmationReady
                                        ? 'Record Attestation & Confirm'
                                        : 'Complete Required Verification'}
                                    </Text>
                                  )}
                                </TouchableOpacity>
                              </View>
                            </View>
                          ) : null}
                          <TouchableOpacity
                            style={[
                              styles.raffleEnterButton,
                              (!vendorRaffleCanPickWinner ||
                                vendorRaffleDrawing) &&
                                styles.loginButtonDisabled,
                            ]}
                            activeOpacity={0.88}
                            disabled={
                              !vendorRaffleCanPickWinner || vendorRaffleDrawing
                            }
                            onPress={drawVendorWinner}
                            testID="vendor-draw-select-potential-winner"
                            accessibilityRole="button"
                            accessibilityLabel={
                              vendorRaffleHasPendingPotentialWinner
                                ? 'Awaiting vendor verification'
                                : vendorRaffleDrawsRemaining <= 0
                                  ? 'All winner spots filled'
                                  : 'Select potential winner'
                            }
                          >
                            {vendorRaffleDrawing ? (
                              <ActivityIndicator size="small" color="#FFFFFF" />
                            ) : (
                              <Text style={styles.raffleEnterText}>
                                {vendorRaffleHasPendingPotentialWinner
                                  ? 'Awaiting Verification'
                                  : vendorRaffleDrawsRemaining <= 0
                                    ? 'All Winner Spots Filled'
                                    : 'Select Potential Winner'}
                              </Text>
                            )}
                          </TouchableOpacity>
                          {vendorRaffleHasPendingPotentialWinner ? (
                            <Text style={styles.vendorRaffleHint}>
                              Your business must confirm or disqualify the
                              potential winner above. A disqualified selection
                              can be replaced while preserving its audit record.
                            </Text>
                          ) : vendorRaffleDrawsRemaining <= 0 ? (
                            <Text style={styles.vendorRaffleHint}>
                              All winner spots are filled. You can still
                              download the full contact list.
                            </Text>
                          ) : !vendorRaffleHasEligibleEntries ? (
                            <Text style={styles.vendorRaffleHint}>
                              There are no included eligible entrants. Restore
                              an entrant or wait for another eligible entry.
                            </Text>
                          ) : !vendorRaffle?.can_draw ? (
                            <Text style={styles.vendorRaffleHint}>
                              Selection opens only after the entry close,
                              scheduled draw, and draw-open timestamps have all
                              passed.
                            </Text>
                          ) : (
                            <Text style={styles.vendorRaffleHint}>
                              Selecting creates a potential-winner record only.
                              It does not send email.
                            </Text>
                          )}
                          {(vendorRaffle?.draws || []).map((draw) => {
                            const hasSelectedContact = Boolean(
                              draw.winner_name ||
                              draw.winner_email ||
                              draw.winner_phone ||
                              draw.winner_wedding_date,
                            );
                            const noticeComplete =
                              draw.notice_complete === true;
                            const noticePending = draw.notice_pending === true;
                            const canSendNotice = draw.can_send_notice === true;
                            const canTestSuppressedNotice =
                              draw.can_test_suppressed_notice === true;
                            const canUseNoticeAction =
                              canSendNotice || canTestSuppressedNotice;
                            const sendingThisNotice =
                              vendorRaffleSendingDrawId === draw.id;
                            return (
                              <View
                                key={draw.id}
                                style={styles.vendorRaffleWinnerCard}
                              >
                                <Text style={styles.vendorRaffleWinnerTitle}>
                                  Selection #{draw.draw_number}:{' '}
                                  {draw.selection_status === 'legacy'
                                    ? 'historical record'
                                    : draw.selection_status || 'potential'}
                                </Text>
                                {hasSelectedContact ? (
                                  <>
                                    {draw.winner_name ? (
                                      <Text
                                        style={styles.vendorRaffleWinnerName}
                                      >
                                        Name: {draw.winner_name}
                                      </Text>
                                    ) : null}
                                    {draw.winner_email ? (
                                      <Text
                                        style={styles.vendorRaffleWinnerText}
                                      >
                                        Email: {draw.winner_email}
                                      </Text>
                                    ) : null}
                                    {draw.winner_phone ? (
                                      <Text
                                        style={styles.vendorRaffleWinnerText}
                                      >
                                        Phone: {draw.winner_phone}
                                      </Text>
                                    ) : null}
                                    {draw.winner_wedding_date ? (
                                      <Text
                                        style={styles.vendorRaffleWinnerText}
                                      >
                                        Wedding date: {draw.winner_wedding_date}
                                      </Text>
                                    ) : null}
                                    <Text style={styles.vendorRaffleWinnerText}>
                                      This couple accepted this vendor’s draw
                                      and wedding-related marketing terms.
                                      Honour unsubscribe requests and use the
                                      information under the Vendor Draw Rules.
                                    </Text>
                                  </>
                                ) : (
                                  <Text style={styles.vendorRaffleWinnerText}>
                                    No contact details were recorded for this
                                    selection.
                                  </Text>
                                )}
                                {draw.selection_status === 'verified' &&
                                noticeComplete ? (
                                  <Text style={styles.vendorRaffleNoticeSent}>
                                    Winner email sent
                                  </Text>
                                ) : null}
                                {draw.selection_status === 'verified' &&
                                noticePending ? (
                                  <TouchableOpacity
                                    style={[
                                      styles.raffleEnterButton,
                                      (!canUseNoticeAction ||
                                        sendingThisNotice) &&
                                        styles.loginButtonDisabled,
                                    ]}
                                    activeOpacity={0.88}
                                    disabled={
                                      !canUseNoticeAction || sendingThisNotice
                                    }
                                    onPress={() => sendVendorWinnerNotice(draw)}
                                    testID={`vendor-draw-send-winner-email-${draw.draw_number}`}
                                    accessibilityRole="button"
                                    accessibilityLabel={
                                      canTestSuppressedNotice
                                        ? `Test suppressed winner email send for selection ${draw.draw_number}`
                                        : `Send winner email for selection ${draw.draw_number}`
                                    }
                                  >
                                    {sendingThisNotice ? (
                                      <ActivityIndicator
                                        size="small"
                                        color="#FFFFFF"
                                      />
                                    ) : (
                                      <Text style={styles.raffleEnterText}>
                                        {canTestSuppressedNotice
                                          ? 'Test Send (Email Suppressed)'
                                          : canSendNotice
                                            ? 'Send Winner Email'
                                            : 'Winner Email Unavailable'}
                                      </Text>
                                    )}
                                  </TouchableOpacity>
                                ) : null}
                                {draw.email_error ? (
                                  <Text style={styles.vendorRaffleError}>
                                    {draw.email_error}
                                  </Text>
                                ) : null}
                              </View>
                            );
                          })}
                        </View>
                      ) : null}
                      <View
                        style={styles.vendorRaffleAutosaveRow}
                        testID="vendor-draw-save-status"
                        accessibilityLabel={
                          vendorRaffleSaveError ||
                          vendorRaffleSaveMessage ||
                          vendorRaffleSaveStatusText
                        }
                        accessibilityLiveRegion="polite"
                      >
                        <View
                          style={styles.vendorRaffleSaveIndicatorSlot}
                          pointerEvents="none"
                        >
                          {vendorRaffleSaveIsPending ? (
                            <ActivityIndicator size="small" color="#AA565D" />
                          ) : (
                            <View
                              style={[
                                styles.vendorRaffleSaveDot,
                                vendorRaffleSaveHasIssue &&
                                  styles.vendorRaffleSaveDotIssue,
                              ]}
                            />
                          )}
                        </View>
                        <Text
                          style={[
                            styles.vendorRaffleSaveHint,
                            vendorRaffleSaveHasIssue &&
                              styles.vendorRaffleSaveHintIssue,
                          ]}
                          numberOfLines={vendorRaffleSaveHasIssue ? 2 : 1}
                        >
                          {vendorRaffleSaveError || vendorRaffleSaveStatusText}
                        </Text>
                        {vendorRaffleSaveHasIssue ? (
                          <TouchableOpacity
                            style={styles.vendorRaffleSaveRetry}
                            activeOpacity={0.78}
                            disabled={vendorRaffleSaving}
                            onPress={() => {
                              vendorRaffleLastFailedSignatureRef.current = '';
                              setVendorRaffleSaveError(null);
                              void runVendorRaffleSave({ silent: false });
                            }}
                            testID="vendor-draw-save-retry"
                            accessibilityRole="button"
                            accessibilityLabel="Try saving vendor draw changes again"
                          >
                            <Text style={styles.vendorRaffleSaveRetryText}>
                              Try again
                            </Text>
                          </TouchableOpacity>
                        ) : null}
                      </View>
                      <View style={styles.vendorRaffleWizardActions}>
                        {vendorRaffleWizardStep > 1 ? (
                          <TouchableOpacity
                            style={[
                              styles.raffleCancelButton,
                              styles.vendorRaffleWizardButton,
                            ]}
                            activeOpacity={0.8}
                            onPress={() =>
                              openVendorRaffleWizardStep(
                                (vendorRaffleWizardStep -
                                  1) as VendorRaffleWizardStep,
                              )
                            }
                            testID="vendor-draw-wizard-back"
                            accessibilityRole="button"
                            accessibilityLabel={`Back to step ${vendorRaffleWizardStep - 1}`}
                          >
                            <ChevronLeft
                              size={18}
                              color="#AA565D"
                              strokeWidth={2.4}
                            />
                            <Text style={styles.raffleCancelText}>Back</Text>
                          </TouchableOpacity>
                        ) : null}
                        {vendorRaffleWizardStep < 4 ? (
                          <TouchableOpacity
                            style={[
                              styles.raffleEnterButton,
                              styles.vendorRaffleWizardButton,
                            ]}
                            activeOpacity={0.88}
                            onPress={continueVendorRaffleWizard}
                            testID="vendor-draw-wizard-continue"
                            accessibilityRole="button"
                            accessibilityLabel={`Continue to step ${vendorRaffleWizardStep + 1}`}
                          >
                            <Text
                              style={styles.raffleEnterText}
                              numberOfLines={1}
                            >
                              Continue
                            </Text>
                            <ChevronRight
                              size={18}
                              color="#FFFFFF"
                              strokeWidth={2.4}
                            />
                          </TouchableOpacity>
                        ) : (
                          <TouchableOpacity
                            style={[
                              styles.raffleEnterButton,
                              styles.vendorRaffleWizardButton,
                            ]}
                            activeOpacity={0.88}
                            disabled={vendorRaffleSaving}
                            onPress={() => {
                              void closeVendorRaffle();
                            }}
                            testID="vendor-draw-wizard-finish"
                            accessibilityRole="button"
                            accessibilityLabel="Save and close vendor draw wizard"
                            accessibilityState={{
                              disabled: vendorRaffleSaving,
                            }}
                          >
                            <Text style={styles.raffleEnterText}>
                              Save &amp; Close
                            </Text>
                          </TouchableOpacity>
                        )}
                      </View>
                    </View>
                  </>
                ) : null}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

type ChatThreadSort = 'recent' | 'unread' | 'name';

function cleanNativeChatThread(
  thread: NativeChatThread,
): NativeChatThread | null {
  const title = String(thread.title || '').trim();
  const subtitle = String(thread.subtitle || '').trim();
  const hasRealMessage =
    !!subtitle &&
    !/^no messages yet$/i.test(subtitle) &&
    !/^tap to start the conversation$/i.test(subtitle) &&
    !/^https?:\/\//i.test(subtitle);
  const hasReadableTitle =
    !!title &&
    !/^\d+$/.test(title) &&
    !/^app:/i.test(title) &&
    title !== 'Conversation';

  if (
    !hasRealMessage &&
    !hasReadableTitle &&
    !thread.reported &&
    !thread.closed
  )
    return null;

  return {
    ...thread,
    title: hasReadableTitle ? title : 'WeddingWin Member',
    subtitle: hasRealMessage
      ? subtitle
      : thread.closed || thread.reported
        ? subtitle
        : 'Open conversation',
  };
}

function chatThreadTimeValue(value: string) {
  if (/^\d{14}$/.test(value)) {
    const year = Number(value.slice(0, 4));
    const month = Number(value.slice(4, 6)) - 1;
    const day = Number(value.slice(6, 8));
    const hour = Number(value.slice(8, 10));
    const minute = Number(value.slice(10, 12));
    const second = Number(value.slice(12, 14));
    return new Date(year, month, day, hour, minute, second).getTime();
  }

  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : 0;
}

function formatChatThreadDate(value: string) {
  const time = chatThreadTimeValue(value);
  if (!time) return '';

  return new Intl.DateTimeFormat('en-US', {
    month: '2-digit',
    day: '2-digit',
    year: 'numeric',
  }).format(new Date(time));
}

function chatMessageDeliveryLabel(message: NativeChatMessage) {
  if (!message.is_mine) return '';
  switch (message.delivery_state) {
    case 'stored':
      return 'Saved';
    case 'delivered':
      return 'Delivered';
    case 'queued':
      return 'Queued for delivery';
    case 'failed':
      return 'Delivery failed';
    default:
      return '';
  }
}

function playWebChatDing() {
  if (Platform.OS !== 'web') return;

  try {
    const audioGlobal = globalThis as typeof globalThis & {
      AudioContext?: typeof AudioContext;
      webkitAudioContext?: typeof AudioContext;
    };
    const AudioContextCtor =
      audioGlobal.AudioContext || audioGlobal.webkitAudioContext;
    if (!AudioContextCtor) return;

    const context = new AudioContextCtor();
    const now = context.currentTime;
    const gain = context.createGain();
    gain.connect(context.destination);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.11, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.42);

    [880, 1174.66].forEach((frequency, index) => {
      const start = now + index * 0.16;
      const oscillator = context.createOscillator();
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(frequency, start);
      oscillator.connect(gain);
      oscillator.start(start);
      oscillator.stop(start + 0.2);
    });

    setTimeout(() => {
      context.close().catch(() => {});
    }, 650);
  } catch {
    // Browsers can block audio before the first user gesture.
  }
}

function NativeChatScreen({
  member,
  nativeSession,
  threads,
  messages,
  selectedThreadToken,
  loading,
  sending,
  reporting,
  error,
  notice,
  imagesEnabled,
  imagesNotice,
  syncDebug,
  draft,
  onDraftChange,
  onSelectThread,
  onSend,
  onAttachImage,
  onReport,
  onRefresh,
  onClose,
  onThreadViewChange,
  chatUnreadCount,
  openThreadRequestId,
  openingConversationLabel,
}: {
  member: NativeMember | null;
  nativeSession: NativeBridgeSession | null;
  threads: NativeChatThread[];
  messages: NativeChatMessage[];
  selectedThreadToken: string;
  loading: boolean;
  sending: boolean;
  reporting: boolean;
  error: string | null;
  notice: string | null;
  imagesEnabled: boolean;
  imagesNotice: string;
  syncDebug?: NativeChatSyncResponse['sync_debug'] | null;
  draft: string;
  onDraftChange: (value: string) => void;
  onSelectThread: (threadToken: string) => void;
  onSend: () => void;
  onAttachImage: () => void;
  onReport: () => void;
  onRefresh: () => void;
  onClose: () => void;
  onThreadViewChange: (isThreadView: boolean) => void;
  chatUnreadCount: number;
  openThreadRequestId: number;
  openingConversationLabel?: string;
}) {
  const [threadSort, setThreadSort] = useState<ChatThreadSort>('recent');
  const [chatView, setChatView] = useState<'list' | 'thread'>('list');
  const [previewImageUrl, setPreviewImageUrl] = useState('');
  const [showJumpToLatest, setShowJumpToLatest] = useState(false);
  const handledOpenThreadRequestRef = useRef(0);
  const refreshPressInFlightRef = useRef(false);
  // Expo SDK 54 forces Android edge-to-edge, which breaks adjustResize and
  // KeyboardAvoidingView - the keyboard just covers the composer. Track the
  // keyboard frame ourselves and pad the chat body to keep the input and
  // send button visible. Seeding from Keyboard.metrics() also covers the
  // case where the keyboard is already open when this overlay mounts
  // (e.g. tapping Send Message while a website form field has focus).
  const [keyboardHeight, setKeyboardHeight] = useState(
    () => Keyboard.metrics()?.height ?? 0,
  );
  useEffect(() => {
    const showEvent =
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent =
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const showSub = Keyboard.addListener(showEvent, (event) => {
      setKeyboardHeight(Math.max(0, event.endCoordinates?.height ?? 0));
    });
    const hideSub = Keyboard.addListener(hideEvent, () => setKeyboardHeight(0));
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);
  const messagesScrollRef = useRef<ScrollView>(null);
  const messagesNearBottomRef = useRef(true);
  const previousMessageCountRef = useRef(0);
  useEffect(() => {
    if (keyboardHeight > 0) {
      messagesScrollRef.current?.scrollToEnd({ animated: true });
    }
  }, [keyboardHeight]);
  useEffect(() => {
    messagesNearBottomRef.current = true;
    previousMessageCountRef.current = 0;
    setShowJumpToLatest(false);
  }, [selectedThreadToken]);
  useEffect(() => {
    const previousCount = previousMessageCountRef.current;
    if (
      messages.length > previousCount &&
      previousCount > 0 &&
      !messagesNearBottomRef.current
    ) {
      setShowJumpToLatest(true);
    }
    previousMessageCountRef.current = messages.length;
  }, [messages.length]);
  const displayThreads = useMemo(() => {
    return threads
      .map((thread) => {
        const cleaned = cleanNativeChatThread(thread);
        if (cleaned) return cleaned;
        return thread.token === selectedThreadToken
          ? {
              ...thread,
              title: 'WeddingWin Member',
              subtitle: 'Open conversation',
            }
          : null;
      })
      .filter((thread): thread is NativeChatThread => !!thread);
  }, [selectedThreadToken, threads]);
  const selectedThread = displayThreads.find(
    (thread) => thread.token === selectedThreadToken,
  );
  const isThreadView = chatView === 'thread' && !!selectedThread;
  const accountLabel = useMemo(() => {
    const memberId = String(
      member?.user_id || nativeSession?.user_id || '',
    ).trim();
    const email = String(member?.email || nativeSession?.email || '').trim();
    const company = String(member?.company || '').trim();
    const name = [member?.first_name, member?.last_name]
      .filter(Boolean)
      .join(' ')
      .trim();
    const displayName = company || name;
    const parts = [
      displayName || null,
      memberId ? `Member ID #${memberId}` : null,
      email || null,
    ].filter(Boolean);

    return parts.length ? `Signed in as ${parts.join(' - ')}` : '';
  }, [member, nativeSession]);
  const emptySyncLabel = useMemo(() => {
    if (!syncDebug) return '';
    const bdCount = Number(syncDebug.bd_threads || 0);
    const appCount = Number(
      syncDebug.visible_app_threads ?? syncDebug.app_threads ?? 0,
    );
    return `Sync checked this account: ${bdCount} website chat${bdCount === 1 ? '' : 's'}, ${appCount} app chat${appCount === 1 ? '' : 's'}.`;
  }, [syncDebug]);
  const selectedThreadIsAppNative = selectedThreadToken.startsWith('app:');
  const selectedThreadClosed =
    !!selectedThread?.closed || !!selectedThread?.reported;
  const selectedThreadNotice = selectedThreadClosed
    ? selectedThread?.report_notice || CHAT_REPORTED_NOTICE
    : '';
  const selectedInitial = (selectedThread?.title || 'W')
    .trim()
    .charAt(0)
    .toUpperCase();
  const sortedThreads = useMemo(() => {
    return [...displayThreads].sort((a, b) => {
      if (threadSort === 'name') return a.title.localeCompare(b.title);
      if (threadSort === 'unread') {
        const unreadDelta = b.unread_count - a.unread_count;
        if (unreadDelta !== 0) return unreadDelta;
      }
      return (
        chatThreadTimeValue(b.updated_at) - chatThreadTimeValue(a.updated_at)
      );
    });
  }, [displayThreads, threadSort]);
  const isOpeningConversation =
    !!openingConversationLabel &&
    loading &&
    !selectedThread &&
    displayThreads.length === 0;
  const openThread = (threadToken: string) => {
    if (reporting) return;
    setChatView('thread');
    onSelectThread(threadToken);
  };
  const goBack = () => {
    if (reporting) return;
    if (isThreadView) {
      setChatView('list');
      return;
    }

    onClose();
  };
  const refreshMessages = () => {
    if (loading || reporting || refreshPressInFlightRef.current) return;
    refreshPressInFlightRef.current = true;
    void Promise.resolve(onRefresh()).finally(() => {
      refreshPressInFlightRef.current = false;
    });
  };

  useEffect(() => {
    onThreadViewChange(isThreadView);
  }, [isThreadView, onThreadViewChange]);

  useEffect(() => {
    if (
      openThreadRequestId > handledOpenThreadRequestRef.current &&
      selectedThread
    ) {
      handledOpenThreadRequestRef.current = openThreadRequestId;
      setChatView('thread');
    }
  }, [openThreadRequestId, selectedThread]);

  return (
    <SafeAreaView style={styles.chatNativeShell} edges={['top']}>
      <View
        style={styles.chatNativeContent}
        accessibilityElementsHidden={!!previewImageUrl}
        importantForAccessibility={
          previewImageUrl ? 'no-hide-descendants' : 'auto'
        }
      >
        <View style={styles.chatNativeHeader}>
          <TouchableOpacity
            style={[
              styles.chatBackButton,
              reporting && styles.chatReportButtonDisabled,
            ]}
            activeOpacity={0.76}
            onPress={goBack}
            disabled={reporting}
            accessibilityRole="button"
            accessibilityLabel={
              isThreadView ? 'Back to conversations' : 'Close messages'
            }
            accessibilityState={{ disabled: reporting }}
          >
            <ChevronLeft size={24} color="#2E2E32" strokeWidth={2.2} />
          </TouchableOpacity>
          <View style={styles.chatScreenTitleWrap}>
            <Text style={styles.chatScreenTitle}>
              {isThreadView ? selectedThread?.title : 'Messages'}
            </Text>
            <Text style={styles.chatScreenSubtitle}>
              {isThreadView ? 'WeddingWin conversation' : 'WeddingWin inbox'}
            </Text>
          </View>
          {isThreadView ? (
            <TouchableOpacity
              testID="chat-report-button"
              style={[
                styles.chatReportButton,
                (selectedThreadClosed || reporting || sending) &&
                  styles.chatReportButtonDisabled,
              ]}
              activeOpacity={0.76}
              onPress={onReport}
              disabled={
                !selectedThreadToken ||
                selectedThreadClosed ||
                reporting ||
                sending
              }
              accessibilityRole="button"
              accessibilityLabel="Report conversation and block member"
            >
              <AlertTriangle size={17} color="#8A514C" strokeWidth={2.2} />
              <Text style={styles.chatReportText}>
                {selectedThreadClosed
                  ? 'Blocked'
                  : reporting
                    ? 'Blocking'
                    : 'Report & Block'}
              </Text>
            </TouchableOpacity>
          ) : null}
          <TouchableOpacity
            style={[
              styles.chatRefreshButton,
              (loading || reporting) && styles.chatReportButtonDisabled,
            ]}
            activeOpacity={0.76}
            onPress={refreshMessages}
            disabled={loading || reporting}
            accessibilityRole="button"
            accessibilityLabel="Refresh messages"
            accessibilityState={{ disabled: loading || reporting }}
          >
            <Text style={styles.chatRefreshText}>Refresh</Text>
          </TouchableOpacity>
        </View>

        {error ? (
          <View style={styles.chatErrorBanner}>
            <Text style={styles.chatErrorText}>{error}</Text>
          </View>
        ) : null}

        {notice ? (
          <View style={styles.chatNoticeBanner} accessibilityRole="text">
            <Text style={styles.chatNoticeText}>{notice}</Text>
          </View>
        ) : null}

        <View
          style={[styles.chatNativeBody, { paddingBottom: keyboardHeight }]}
        >
          {!isThreadView ? (
            <View style={styles.chatConversationList}>
              {!isOpeningConversation ? (
                <View style={styles.chatInboxToolbar}>
                  {(
                    [
                      ['recent', 'Recent'],
                      ['unread', 'Unread'],
                      ['name', 'A-Z'],
                    ] as const
                  ).map(([value, label]) => (
                    <TouchableOpacity
                      key={value}
                      style={[
                        styles.chatSortChip,
                        threadSort === value && styles.chatSortChipActive,
                      ]}
                      activeOpacity={0.78}
                      onPress={() => setThreadSort(value)}
                      accessibilityRole="button"
                      accessibilityLabel={`Sort conversations by ${label}`}
                      accessibilityState={{ selected: threadSort === value }}
                    >
                      <Text
                        style={[
                          styles.chatSortChipText,
                          threadSort === value && styles.chatSortChipTextActive,
                        ]}
                      >
                        {label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              ) : null}

              <ScrollView
                style={styles.chatConversationScroll}
                contentContainerStyle={styles.chatConversationContent}
                showsVerticalScrollIndicator={false}
              >
                {isOpeningConversation ? (
                  <View style={styles.chatCenteredState}>
                    <ActivityIndicator size="small" color={BRAND_COLOR} />
                    <Text style={styles.chatCenteredText}>
                      Opening chat with {openingConversationLabel}...
                    </Text>
                  </View>
                ) : loading && displayThreads.length === 0 ? (
                  <View style={styles.chatCenteredState}>
                    <ActivityIndicator size="small" color={BRAND_COLOR} />
                    <Text style={styles.chatCenteredText}>
                      Loading conversations...
                    </Text>
                  </View>
                ) : null}
                {displayThreads.length === 0 &&
                !loading &&
                !isOpeningConversation ? (
                  <View style={styles.chatCenteredState}>
                    <MessageCircle
                      size={36}
                      color={BRAND_COLOR}
                      strokeWidth={1.7}
                    />
                    <Text style={styles.chatCenteredText}>
                      Your synced WeddingWin chats will appear here.
                    </Text>
                    {accountLabel ? (
                      <View style={styles.chatEmptyPill}>
                        <Text style={styles.chatEmptyPillText}>
                          {accountLabel}
                        </Text>
                      </View>
                    ) : null}
                    {emptySyncLabel ? (
                      <Text style={styles.chatEmptyHint}>{emptySyncLabel}</Text>
                    ) : null}
                  </View>
                ) : null}
                {sortedThreads.map((thread) => (
                  <TouchableOpacity
                    key={thread.token}
                    style={[
                      styles.chatConversationRow,
                      thread.unread_count > 0 &&
                        styles.chatConversationRowUnread,
                    ]}
                    activeOpacity={0.82}
                    onPress={() => openThread(thread.token)}
                    accessibilityRole="button"
                    accessibilityLabel={`Open conversation with ${thread.title}`}
                  >
                    <View style={styles.chatThreadAvatar}>
                      {thread.avatar_url ? (
                        <Image
                          source={{ uri: thread.avatar_url }}
                          style={styles.chatThreadAvatarImage}
                          resizeMode="cover"
                        />
                      ) : (
                        <Text style={styles.chatAvatarInitial}>
                          {thread.title.trim().charAt(0).toUpperCase() || 'W'}
                        </Text>
                      )}
                    </View>
                    <View style={styles.chatInboxNameWrap}>
                      <View style={styles.chatConversationTitleLine}>
                        <Text style={styles.chatInboxName} numberOfLines={1}>
                          {thread.title}
                        </Text>
                        <Text
                          style={styles.chatInboxDateText}
                          numberOfLines={1}
                        >
                          {formatChatThreadDate(thread.updated_at)}
                        </Text>
                      </View>
                      <View style={styles.chatConversationPreviewLine}>
                        <Text
                          style={styles.chatInboxLastMessage}
                          numberOfLines={1}
                        >
                          {thread.closed || thread.reported
                            ? thread.report_notice || CHAT_REPORTED_NOTICE
                            : !imagesEnabled &&
                                /^\[image\]$/i.test(thread.subtitle || '')
                              ? 'Open conversation'
                              : thread.subtitle || 'No messages yet'}
                        </Text>
                        {thread.unread_count > 0 ? (
                          <View style={styles.chatThreadUnread}>
                            <Text style={styles.chatThreadUnreadText}>
                              {thread.unread_count > 99
                                ? '99+'
                                : thread.unread_count}
                            </Text>
                          </View>
                        ) : null}
                      </View>
                    </View>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          ) : (
            <>
              <View style={styles.chatThreadProfileBar}>
                <View style={styles.chatMessageAvatar}>
                  {selectedThread?.avatar_url ? (
                    <Image
                      source={{ uri: selectedThread.avatar_url }}
                      style={styles.chatMessageAvatarImage}
                      resizeMode="cover"
                    />
                  ) : (
                    <Text style={styles.chatMessageAvatarInitial}>
                      {selectedInitial}
                    </Text>
                  )}
                </View>
                <View style={styles.chatThreadProfileCopy}>
                  <Text style={styles.chatThreadProfileName} numberOfLines={1}>
                    {selectedThread?.title}
                  </Text>
                  <Text style={styles.chatThreadProfileStatus}>
                    {selectedThreadClosed
                      ? 'Member blocked while WeddingWin reviews it'
                      : selectedThreadIsAppNative
                        ? 'WeddingWin app chat'
                        : 'Synced with website chat'}
                  </Text>
                </View>
              </View>

              <ScrollView
                ref={messagesScrollRef}
                style={styles.chatMessages}
                contentContainerStyle={styles.chatMessagesContent}
                keyboardDismissMode={
                  Platform.OS === 'ios' ? 'interactive' : 'on-drag'
                }
                keyboardShouldPersistTaps="handled"
                onContentSizeChange={() => {
                  if (messagesNearBottomRef.current) {
                    messagesScrollRef.current?.scrollToEnd({ animated: false });
                  }
                }}
                onScroll={({ nativeEvent }) => {
                  const distanceFromBottom =
                    nativeEvent.contentSize.height -
                    (nativeEvent.contentOffset.y +
                      nativeEvent.layoutMeasurement.height);
                  const isNearBottom = distanceFromBottom < 96;
                  messagesNearBottomRef.current = isNearBottom;
                  if (isNearBottom && showJumpToLatest)
                    setShowJumpToLatest(false);
                }}
                scrollEventThrottle={16}
                showsVerticalScrollIndicator={false}
              >
                {selectedThreadClosed ? (
                  <View style={styles.chatReportedNotice}>
                    <AlertTriangle
                      size={18}
                      color="#8A514C"
                      strokeWidth={2.2}
                    />
                    <Text style={styles.chatReportedNoticeText}>
                      {selectedThreadNotice}
                    </Text>
                  </View>
                ) : null}
                {loading && messages.length === 0 ? (
                  <View style={styles.chatCenteredState}>
                    <ActivityIndicator size="small" color={BRAND_COLOR} />
                    <Text style={styles.chatCenteredText}>
                      Loading messages...
                    </Text>
                  </View>
                ) : null}
                {!loading && messages.length === 0 ? (
                  <View style={styles.chatCenteredState}>
                    <MessageCircle
                      size={36}
                      color={BRAND_COLOR}
                      strokeWidth={1.7}
                    />
                    <Text style={styles.chatCenteredText}>
                      {threads.length === 0
                        ? 'Your synced WeddingWin chats will appear here.'
                        : 'No messages in this conversation yet.'}
                    </Text>
                    {threads.length === 0 && accountLabel ? (
                      <View style={styles.chatEmptyPill}>
                        <Text style={styles.chatEmptyPillText}>
                          {accountLabel}
                        </Text>
                      </View>
                    ) : null}
                    {threads.length === 0 && emptySyncLabel ? (
                      <Text style={styles.chatEmptyHint}>{emptySyncLabel}</Text>
                    ) : null}
                  </View>
                ) : null}
                {messages.map((message) => (
                  <View
                    key={message.id}
                    style={[
                      styles.chatMessageRow,
                      message.is_mine && styles.chatMessageRowMine,
                    ]}
                  >
                    {!message.is_mine ? (
                      <View style={styles.chatMessageAvatar}>
                        {message.avatar_url ? (
                          <Image
                            source={{ uri: message.avatar_url }}
                            style={styles.chatMessageAvatarImage}
                            resizeMode="cover"
                          />
                        ) : (
                          <Text style={styles.chatMessageAvatarInitial}>
                            {selectedInitial}
                          </Text>
                        )}
                      </View>
                    ) : null}
                    <View
                      style={[
                        styles.chatMessageBubble,
                        message.is_mine && styles.chatMessageBubbleMine,
                      ]}
                    >
                      {imagesEnabled
                        ? message.image_urls?.map((url, index) => (
                            <TouchableOpacity
                              key={`${message.id}-image-${index}`}
                              activeOpacity={0.86}
                              onPress={() => setPreviewImageUrl(url)}
                              accessibilityRole="button"
                              accessibilityLabel="Open message image"
                            >
                              <Image
                                source={{ uri: url }}
                                style={styles.chatMessageImage}
                                resizeMode="cover"
                              />
                            </TouchableOpacity>
                          ))
                        : null}
                      {message.content ? (
                        <Text
                          style={[
                            styles.chatMessageText,
                            message.is_mine && styles.chatMessageTextMine,
                            imagesEnabled && message.image_urls?.length
                              ? styles.chatMessageTextWithImage
                              : null,
                          ]}
                        >
                          {message.content}
                        </Text>
                      ) : null}
                      {chatMessageDeliveryLabel(message) ? (
                        <Text
                          style={[
                            styles.chatMessageDeliveryText,
                            message.delivery_state === 'failed' &&
                              styles.chatMessageDeliveryFailed,
                          ]}
                          accessibilityLabel={`Message delivery status: ${chatMessageDeliveryLabel(message)}`}
                        >
                          {chatMessageDeliveryLabel(message)}
                        </Text>
                      ) : null}
                    </View>
                    {message.is_mine ? (
                      <View style={styles.chatMessageAvatar}>
                        {message.avatar_url ? (
                          <Image
                            source={{ uri: message.avatar_url }}
                            style={styles.chatMessageAvatarImage}
                            resizeMode="cover"
                          />
                        ) : (
                          <Text style={styles.chatMessageAvatarInitial}>
                            Me
                          </Text>
                        )}
                      </View>
                    ) : null}
                  </View>
                ))}
              </ScrollView>
              {showJumpToLatest ? (
                <TouchableOpacity
                  testID="chat-jump-to-latest"
                  style={styles.chatJumpToLatest}
                  activeOpacity={0.84}
                  onPress={() => {
                    messagesNearBottomRef.current = true;
                    setShowJumpToLatest(false);
                    messagesScrollRef.current?.scrollToEnd({ animated: true });
                  }}
                  accessibilityRole="button"
                  accessibilityLabel="Jump to latest messages"
                >
                  <ChevronDown size={17} color="#FFFFFF" strokeWidth={2.4} />
                  <Text style={styles.chatJumpToLatestText}>
                    Latest messages
                  </Text>
                </TouchableOpacity>
              ) : null}

              {selectedThreadClosed ? (
                <View style={styles.chatClosedComposer}>
                  <AlertTriangle size={18} color="#8A514C" strokeWidth={2.2} />
                  <Text style={styles.chatClosedComposerText}>
                    {selectedThreadNotice}
                  </Text>
                </View>
              ) : (
                <>
                  {!imagesEnabled ? (
                    <View
                      style={styles.chatImagesDisabledNotice}
                      accessibilityRole="text"
                    >
                      <Text style={styles.chatImagesDisabledNoticeText}>
                        {imagesNotice || CHAT_IMAGES_DISABLED_NOTICE}
                      </Text>
                    </View>
                  ) : null}
                  <View style={styles.chatComposer}>
                    {imagesEnabled ? (
                      <TouchableOpacity
                        testID="chat-image-button"
                        style={[
                          styles.chatImageButton,
                          (sending || reporting || !selectedThreadToken) &&
                            styles.chatSendButtonDisabled,
                        ]}
                        disabled={sending || reporting || !selectedThreadToken}
                        activeOpacity={0.82}
                        onPress={onAttachImage}
                        accessibilityRole="button"
                        accessibilityLabel="Choose a photo to send"
                      >
                        <ImagePlus
                          size={21}
                          color={BRAND_COLOR}
                          strokeWidth={2.2}
                        />
                      </TouchableOpacity>
                    ) : null}
                    <TextInput
                      testID="chat-message-input"
                      value={draft}
                      onChangeText={onDraftChange}
                      editable={!sending && !reporting}
                      placeholder="Write a message..."
                      placeholderTextColor="#9D8D89"
                      multiline
                      accessibilityLabel="Message"
                      style={styles.chatComposerInput}
                    />
                    <TouchableOpacity
                      testID="chat-send-button"
                      style={[
                        styles.chatSendButton,
                        (!draft.trim() ||
                          sending ||
                          reporting ||
                          !selectedThreadToken) &&
                          styles.chatSendButtonDisabled,
                      ]}
                      disabled={
                        !draft.trim() ||
                        sending ||
                        reporting ||
                        !selectedThreadToken
                      }
                      activeOpacity={0.82}
                      onPress={onSend}
                      accessibilityRole="button"
                      accessibilityLabel="Send message"
                    >
                      {sending ? (
                        <ActivityIndicator size="small" color="#FFFFFF" />
                      ) : (
                        <Text style={styles.chatSendText}>Send</Text>
                      )}
                    </TouchableOpacity>
                  </View>
                </>
              )}
            </>
          )}
        </View>
        {chatUnreadCount > 0 ? (
          <TouchableOpacity
            style={styles.chatBubble}
            activeOpacity={0.82}
            onPress={() => setChatView('list')}
            accessibilityRole="button"
            accessibilityLabel="View unread WeddingWin messages"
          >
            <MessageCircle size={27} color="#FFFFFF" strokeWidth={2.2} />
            <View style={styles.chatBubbleBadge}>
              <Text style={styles.chatBubbleBadgeText}>
                {chatUnreadCount > 99 ? '99+' : chatUnreadCount}
              </Text>
            </View>
          </TouchableOpacity>
        ) : null}
      </View>
      <Modal
        visible={!!previewImageUrl}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setPreviewImageUrl('')}
      >
        <View
          style={styles.chatImagePreviewBackdrop}
          accessibilityViewIsModal
          importantForAccessibility="yes"
        >
          <TouchableOpacity
            testID="chat-image-preview-close"
            style={styles.chatImagePreviewClose}
            activeOpacity={0.8}
            onPress={() => setPreviewImageUrl('')}
            accessibilityRole="button"
            accessibilityLabel="Close message image"
          >
            <X size={26} color="#FFFFFF" strokeWidth={2.4} />
          </TouchableOpacity>
          {previewImageUrl ? (
            <Image
              source={{ uri: previewImageUrl }}
              style={styles.chatImagePreviewImage}
              resizeMode="contain"
              accessibilityLabel="Message image preview"
            />
          ) : null}
        </View>
      </Modal>
    </SafeAreaView>
  );
}

export default function HomeScreen() {
  const lastNotificationResponse = Notifications.useLastNotificationResponse();
  const webviewRef = useRef<WebView>(null);
  const navigation = useNavigation();
  const currentUrlRef = useRef(TARGET_URL);
  const sourceUriRef = useRef(TARGET_URL);
  const loadingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const webViewReloadOwnerRef = useRef<string | null>(null);
  const historyNavigationTimerRef = useRef<ReturnType<
    typeof setTimeout
  > | null>(null);
  const bottomNavigationFrameRef = useRef<ReturnType<
    typeof requestAnimationFrame
  > | null>(null);
  const navigationIntentGenerationRef = useRef(0);
  const websiteLoginBridgePromisesRef = useRef(
    new Map<string, Promise<string>>(),
  );
  const nativeSessionRefreshPromisesRef = useRef(
    new Map<string, Promise<NativeBridgeSession | null>>(),
  );
  const nativeSessionGenerationRef = useRef(0);
  const authOperationGenerationRef = useRef(0);
  const authOperationInFlightRef = useRef<string | null>(null);
  const profileCompletionIntentRef = useRef(0);
  const browserAuthInFlightRef = useRef(false);
  const logoutInFlightRef = useRef(false);
  const logoutOperationGenerationRef = useRef(0);
  const finishLogoutInFlightRef = useRef<Promise<void> | null>(null);
  const webViewSessionGenerationRef = useRef(0);
  const [showBrowser, setShowBrowser] = useState(false);
  const [sourceUri, setSourceUri] = useState(TARGET_URL);
  const [webViewSessionKey, setWebViewSessionKey] = useState(0);
  const [isWedWebsiteSite, setIsWedWebsiteSite] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [canGoBack, setCanGoBack] = useState(false);
  const [canGoForward, setCanGoForward] = useState(false);
  const [googleLoginLoading, setGoogleLoginLoading] = useState(false);
  const [emailLoginLoading, setEmailLoginLoading] = useState(false);
  const [signupLoading, setSignupLoading] = useState(false);
  const [profileSaveLoading, setProfileSaveLoading] = useState(false);
  const [logoutLoading, setLogoutLoading] = useState(false);
  const [nativeMember, setNativeMember] = useState<NativeMember | null>(null);
  const [nativeBridgeSession, setNativeBridgeSession] =
    useState<NativeBridgeSession | null>(null);
  const [nativeSessionHydrated, setNativeSessionHydrated] = useState(false);
  const [chatUnreadCount, setChatUnreadCount] = useState(0);
  const [chatStatusLabel, setChatStatusLabel] = useState(
    'Synced with website chat',
  );
  const [chatInboxPath, setChatInboxPath] = useState(DEFAULT_CHAT_INBOX_PATH);
  const [isChatPage, setIsChatPage] = useState(false);
  const [showNativeChat, setShowNativeChat] = useState(false);
  const [nativeChatThreads, setNativeChatThreads] = useState<
    NativeChatThread[]
  >([]);
  const [nativeChatMessages, setNativeChatMessages] = useState<
    NativeChatMessage[]
  >([]);
  const [selectedChatThreadToken, setSelectedChatThreadToken] = useState('');
  const [nativeChatLoading, setNativeChatLoading] = useState(false);
  const [nativeChatSending, setNativeChatSending] = useState(false);
  const [nativeChatReporting, setNativeChatReporting] = useState(false);
  const [nativeChatError, setNativeChatError] = useState<string | null>(null);
  const [nativeChatNotice, setNativeChatNotice] = useState<string | null>(null);
  const [nativeChatImagesEnabled, setNativeChatImagesEnabled] = useState(false);
  const [nativeChatImagesNotice, setNativeChatImagesNotice] = useState(
    CHAT_IMAGES_DISABLED_NOTICE,
  );
  const [nativeChatDraft, setNativeChatDraft] = useState('');
  const [nativeChatSyncDebug, setNativeChatSyncDebug] = useState<
    NativeChatSyncResponse['sync_debug'] | null
  >(null);
  const [nativeChatThreadOpen, setNativeChatThreadOpen] = useState(false);
  const [nativeChatOpenRequestId, setNativeChatOpenRequestId] = useState(0);
  const [nativeChatOpeningLabel, setNativeChatOpeningLabel] = useState('');
  const [showNativeQrScanner, setShowNativeQrScanner] = useState(false);
  const [qrContactCompletionRequested, setQrContactCompletionRequested] =
    useState(false);
  const [vendorDrawOpenRequestId, setVendorDrawOpenRequestId] = useState(0);
  const [pendingDashboardRedirect, setPendingDashboardRedirect] =
    useState(false);
  const [pendingBridgeTargetPath, setPendingBridgeTargetPath] = useState(
    DEFAULT_BRIDGE_TARGET_PATH,
  );
  const pendingBdFormLoginRef = useRef<LoginCredentials | null>(null);
  const pendingBdFormLoginSubmittedRef = useRef(false);
  const pendingAppLogoutRef = useRef(false);
  const signedOutRecoveryIntentRef = useRef(false);
  const chatUnreadSnapshotRef = useRef<number | null>(null);
  const chatDingPlayerRef = useRef<ReturnType<typeof createAudioPlayer> | null>(
    null,
  );
  const nativeBridgeSessionRef = useRef<NativeBridgeSession | null>(null);
  const nativeMemberRef = useRef<NativeMember | null>(null);
  const bridgeSessionWaitersRef = useRef<
    ((session: NativeBridgeSession | null) => void)[]
  >([]);
  const websiteBridgeNonceRef = useRef('');
  const nativeChatThreadOpenRef = useRef(false);
  const selectedChatThreadTokenRef = useRef('');
  const nativeChatRequestGenerationRef = useRef(0);
  const nativeChatSendRequestGenerationRef = useRef(0);
  const nativeChatReportRequestGenerationRef = useRef(0);
  const nativeChatVisibleAbortControllerRef = useRef<AbortController | null>(
    null,
  );
  const nativeChatLoadingGenerationRef = useRef(0);
  const chatStatusRequestGenerationRef = useRef(0);
  const chatStatusInFlightRef = useRef<Promise<void> | null>(null);
  // Async work from a signed-out account can finish after a new account has
  // already started its own send. Ownership ids keep an older finally block
  // from unlocking or hiding the newer operation.
  const nativeChatSendInFlightRef = useRef<string | null>(null);
  const nativeChatImagePickerInFlightRef = useRef<string | null>(null);
  const nativeChatReportInFlightRef = useRef<'confirm' | 'request' | null>(
    null,
  );
  const nativeChatPendingTextSendsRef = useRef(
    new Map<
      string,
      { threadToken: string; message: string; clientMessageId: string }
    >(),
  );
  const nativeChatPendingImageSendsRef = useRef(
    new Map<
      string,
      {
        threadToken: string;
        signature: string;
        clientMessageId: string;
        createdAt: number;
      }
    >(),
  );
  const nativeChatDraftsRef = useRef(new Map<string, string>());
  const pushRegistrationKeyRef = useRef('');
  const pushRegistrationGenerationRef = useRef(0);
  const pushRegistrationPromisesRef = useRef(new Map<string, Promise<void>>());
  const pushRegistrationSerialRef = useRef<Promise<void>>(Promise.resolve());
  const pendingPushUnregisterMutationRef = useRef<Promise<void>>(
    Promise.resolve(),
  );
  const expoPushTokenRef = useRef('');
  const handledNotificationResponseIdsRef = useRef(new Set<string>());
  const vendorConnectNativeUrlRef = useRef('');
  const vendorDrawCloserRef = useRef<(() => Promise<boolean>) | null>(null);
  const vendorConnectNativeTimerRef = useRef<ReturnType<
    typeof setTimeout
  > | null>(null);

  const addDebugLine = useCallback((_line: string) => {}, []);

  const registerVendorDrawCloser = useCallback(
    (closer: (() => Promise<boolean>) | null) => {
      vendorDrawCloserRef.current = closer;
    },
    [],
  );

  const queueNativeSessionStorageMutation = useCallback(
    (mutation: () => Promise<void>) => {
      void mutateNativeSessionStorage(async () => {
        await mutation();
      }).catch(() => {});
    },
    [],
  );

  const queuePendingPushUnregisterMutation = useCallback(
    (mutation: () => Promise<void>) => {
      const queued = pendingPushUnregisterMutationRef.current
        .catch(() => {})
        .then(mutation);
      pendingPushUnregisterMutationRef.current = queued.catch(() => {});
      return queued;
    },
    [],
  );

  const savePendingPushUnregister = useCallback(
    (raw: string) =>
      queuePendingPushUnregisterMutation(() =>
        SecureStore.setItemAsync(PENDING_PUSH_UNREGISTER_KEY, raw),
      ),
    [queuePendingPushUnregisterMutation],
  );

  const deletePendingPushUnregisterIfCurrent = useCallback(
    (expectedRaw: string) =>
      queuePendingPushUnregisterMutation(async () => {
        const currentRaw = await SecureStore.getItemAsync(
          PENDING_PUSH_UNREGISTER_KEY,
        ).catch(() => null);
        if (currentRaw !== expectedRaw) return;
        await SecureStore.deleteItemAsync(PENDING_PUSH_UNREGISTER_KEY);
      }),
    [queuePendingPushUnregisterMutation],
  );

  const commitNativeMember = useCallback(
    (member: NativeMember | null) => {
      if (member) pendingAppLogoutRef.current = false;
      nativeMemberRef.current = member;
      setNativeMember(member);
      queueNativeSessionStorageMutation(() =>
        member
          ? SecureStore.setItemAsync(
              NATIVE_MEMBER_SESSION_KEY,
              JSON.stringify(member),
            )
          : SecureStore.deleteItemAsync(NATIVE_MEMBER_SESSION_KEY),
      );
    },
    [queueNativeSessionStorageMutation],
  );

  const commitNativeBridgeSession = useCallback(
    (session: NativeBridgeSession | null) => {
      nativeSessionGenerationRef.current += 1;
      nativeBridgeSessionRef.current = session;
      setNativeBridgeSession(session);
      queueNativeSessionStorageMutation(() =>
        session
          ? SecureStore.setItemAsync(
              NATIVE_BRIDGE_SESSION_KEY,
              JSON.stringify(session),
            )
          : SecureStore.deleteItemAsync(NATIVE_BRIDGE_SESSION_KEY),
      );
    },
    [queueNativeSessionStorageMutation],
  );

  const beginAuthOperation = useCallback((operation: string) => {
    if (
      accountDeletionIsInFlight() ||
      logoutInFlightRef.current ||
      pendingAppLogoutRef.current ||
      authOperationInFlightRef.current
    )
      return null;
    authOperationInFlightRef.current = operation;
    authOperationGenerationRef.current += 1;
    return authOperationGenerationRef.current;
  }, []);

  const authOperationIsCurrent = useCallback(
    (operation: string, generation: number) =>
      authOperationInFlightRef.current === operation &&
      authOperationGenerationRef.current === generation,
    [],
  );

  const finishAuthOperation = useCallback(
    (operation: string, generation: number) => {
      if (authOperationIsCurrent(operation, generation)) {
        authOperationInFlightRef.current = null;
      }
    },
    [authOperationIsCurrent],
  );

  const invalidateNavigationIntent = useCallback(() => {
    navigationIntentGenerationRef.current += 1;
    if (bottomNavigationFrameRef.current !== null) {
      cancelAnimationFrame(bottomNavigationFrameRef.current);
      bottomNavigationFrameRef.current = null;
    }
  }, []);

  const beginNavigationIntent = useCallback(() => {
    invalidateNavigationIntent();
    return navigationIntentGenerationRef.current;
  }, [invalidateNavigationIntent]);

  const advanceWebViewSession = useCallback(() => {
    const nextGeneration = webViewSessionGenerationRef.current + 1;
    webViewSessionGenerationRef.current = nextGeneration;
    setWebViewSessionKey(nextGeneration);
    return nextGeneration;
  }, []);

  const hideWebsiteBrowser = useCallback(() => {
    // Retire the mounted WebView synchronously. WebKit can deliver queued
    // navigation/message callbacks after React has started hiding it; moving
    // the generation first makes every callback from that instance inert.
    advanceWebViewSession();
    setShowBrowser(false);
  }, [advanceWebViewSession]);

  const updateAppBadge = useCallback((count: number) => {
    if (Platform.OS === 'web') return;
    const normalizedCount = Number.isFinite(count)
      ? Math.max(0, Math.trunc(count))
      : 0;
    Notifications.setBadgeCountAsync(normalizedCount).catch(() => {});
  }, []);

  const clearLoadingTimeout = useCallback(() => {
    if (loadingTimeoutRef.current) {
      clearTimeout(loadingTimeoutRef.current);
      loadingTimeoutRef.current = null;
    }
  }, []);

  const startLoadingFeedback = useCallback(() => {
    clearLoadingTimeout();
    setLoading(true);
    loadingTimeoutRef.current = setTimeout(() => {
      setLoading(false);
      loadingTimeoutRef.current = null;
    }, 12000);
  }, [clearLoadingTimeout]);

  const navigateWebViewTo = useCallback((nextUrl: string) => {
    webViewReloadOwnerRef.current = null;
    const shouldForceNavigation =
      sourceUriRef.current === nextUrl && !!webviewRef.current;
    sourceUriRef.current = nextUrl;

    if (shouldForceNavigation) {
      webviewRef.current?.stopLoading();
      webviewRef.current?.injectJavaScript(`
(function() {
  setTimeout(function() {
    try { window.location.assign(${JSON.stringify(nextUrl)}); } catch (e) {}
  }, 0);
})();
true;
`);
      return;
    }

    setSourceUri(nextUrl);
  }, []);

  useEffect(() => {
    nativeChatThreadOpenRef.current = nativeChatThreadOpen;
    chatStatusRequestGenerationRef.current += 1;
    chatStatusInFlightRef.current = null;
  }, [nativeChatThreadOpen]);

  useEffect(() => {
    selectedChatThreadTokenRef.current = selectedChatThreadToken;
    chatStatusRequestGenerationRef.current += 1;
    chatStatusInFlightRef.current = null;
  }, [selectedChatThreadToken]);

  useEffect(() => {
    nativeBridgeSessionRef.current = nativeBridgeSession;
  }, [nativeBridgeSession]);

  useEffect(() => {
    nativeMemberRef.current = nativeMember;
  }, [nativeMember]);

  const registerPushNotifications = useCallback(
    async (session: NativeBridgeSession | null) => {
      if (Platform.OS === 'web' || !session?.user_id || !session?.token) return;

      const registrationKey = `${session.user_id}:${session.token}`;
      if (pushRegistrationKeyRef.current === registrationKey) return;
      const existingRegistration =
        pushRegistrationPromisesRef.current.get(registrationKey);
      if (existingRegistration) {
        await existingRegistration;
        return;
      }
      let releaseRegistration = () => {};
      const registrationMarker = new Promise<void>((resolve) => {
        releaseRegistration = resolve;
      });
      pushRegistrationPromisesRef.current.set(
        registrationKey,
        registrationMarker,
      );
      const previousPushOperation = pushRegistrationSerialRef.current;
      let releasePushOperation = () => {};
      const pushOperationMarker = new Promise<void>((resolve) => {
        releasePushOperation = resolve;
      });
      pushRegistrationSerialRef.current = previousPushOperation
        .catch(() => {})
        .then(() => pushOperationMarker);
      const registrationGeneration = pushRegistrationGenerationRef.current + 1;
      pushRegistrationGenerationRef.current = registrationGeneration;
      const sessionGeneration = nativeSessionGenerationRef.current;
      const registrationIsCurrent = () =>
        pushRegistrationGenerationRef.current === registrationGeneration &&
        nativeSessionGenerationRef.current === sessionGeneration &&
        !logoutInFlightRef.current &&
        String(nativeBridgeSessionRef.current?.user_id || '') ===
          String(session.user_id || '') &&
        String(nativeBridgeSessionRef.current?.token || '') ===
          String(session.token || '');

      await previousPushOperation.catch(() => {});
      try {
        const existingPermission = await Notifications.getPermissionsAsync();
        if (!registrationIsCurrent()) return;
        let finalStatus = existingPermission.status;
        if (finalStatus !== 'granted') {
          const requestedPermission =
            await Notifications.requestPermissionsAsync();
          if (!registrationIsCurrent()) return;
          finalStatus = requestedPermission.status;
        }
        if (finalStatus !== 'granted') return;

        const projectId =
          Constants.easConfig?.projectId ||
          (
            Constants.expoConfig?.extra?.eas as
              { projectId?: string } | undefined
          )?.projectId;
        if (!projectId && !__DEV__) {
          console.warn(
            'Push registration skipped: EAS project ID is not configured.',
          );
          return;
        }
        const tokenResult = projectId
          ? await Notifications.getExpoPushTokenAsync({ projectId })
          : await Notifications.getExpoPushTokenAsync();
        const expoPushToken = tokenResult.data;
        if (!expoPushToken || !registrationIsCurrent()) return;

        // Keep the token available before the server call starts. If the user
        // signs out after the server accepts the call but before its response
        // returns, logout can still queue an exact token/session unregister.
        expoPushTokenRef.current = expoPushToken;
        await SecureStore.setItemAsync(
          PUSH_TOKEN_SESSION_KEY,
          expoPushToken,
        ).catch(() => {});
        if (!registrationIsCurrent()) {
          if (expoPushTokenRef.current === expoPushToken) {
            expoPushTokenRef.current = '';
            await SecureStore.deleteItemAsync(PUSH_TOKEN_SESSION_KEY).catch(
              () => {},
            );
          }
          return;
        }

        const { response: registrationResponse, data: registrationBody } =
          await fetchAppJsonWithTimeout<{ ok?: boolean; error?: string }>(
            `${APP_BACKEND_URL}/functions/v1/bd-register-push-token`,
            {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${APP_BACKEND_PUBLISHABLE_KEY}`,
                apikey: APP_BACKEND_PUBLISHABLE_KEY,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                native_session: session,
                expo_push_token: expoPushToken,
                platform: Platform.OS,
              }),
            },
            'Push registration timed out.',
            12000,
          );
        if (!registrationResponse.ok || registrationBody?.ok !== true) {
          throw new Error(
            String(
              registrationBody?.error ||
                `Push registration failed (${registrationResponse.status})`,
            ),
          );
        }

        if (!registrationIsCurrent()) {
          // Registration reached the server after sign-out or session replacement.
          // Immediately undo that stale registration instead of restoring it locally.
          const newerRegistrationForSameMember =
            String(nativeBridgeSessionRef.current?.user_id || '') ===
              String(session.user_id || '') &&
            !!pushRegistrationKeyRef.current &&
            pushRegistrationKeyRef.current !== registrationKey;
          if (!newerRegistrationForSameMember) {
            const pendingCleanup = JSON.stringify({
              native_session: session,
              expo_push_token: expoPushToken,
            });
            await savePendingPushUnregister(pendingCleanup).catch(() => {});
            const cleanupResult = await fetchAppJsonWithTimeout<{
              ok?: boolean;
            }>(
              `${APP_BACKEND_URL}/functions/v1/bd-register-push-token`,
              {
                method: 'POST',
                headers: {
                  Authorization: `Bearer ${APP_BACKEND_PUBLISHABLE_KEY}`,
                  apikey: APP_BACKEND_PUBLISHABLE_KEY,
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  action: 'unregister',
                  native_session: session,
                  expo_push_token: expoPushToken,
                }),
              },
              'Push cleanup timed out.',
              5000,
            ).catch(() => null);
            if (cleanupResult?.response.ok && cleanupResult.data?.ok === true) {
              await deletePendingPushUnregisterIfCurrent(pendingCleanup).catch(
                () => {},
              );
            }
          }
          return;
        }

        pushRegistrationKeyRef.current = registrationKey;
      } catch {
        // Push is helpful, but chat should keep working even if registration fails.
      } finally {
        releasePushOperation();
        releaseRegistration();
        if (
          pushRegistrationPromisesRef.current.get(registrationKey) ===
          registrationMarker
        ) {
          pushRegistrationPromisesRef.current.delete(registrationKey);
        }
      }
    },
    [deletePendingPushUnregisterIfCurrent, savePendingPushUnregister],
  );

  const unregisterPushNotifications = useCallback(
    async (
      session: NativeBridgeSession | null | undefined,
      explicitExpoPushToken = '',
    ) => {
      if (Platform.OS === 'web') return true;
      const sessionGeneration = nativeSessionGenerationRef.current;
      const expoPushToken =
        explicitExpoPushToken ||
        expoPushTokenRef.current ||
        (await SecureStore.getItemAsync(PUSH_TOKEN_SESSION_KEY).catch(
          () => null,
        )) ||
        '';
      if (!expoPushToken) return true;
      if (!session?.user_id || !session.token) return false;

      const previousPushOperation = pushRegistrationSerialRef.current;
      let releasePushOperation = () => {};
      const pushOperationMarker = new Promise<void>((resolve) => {
        releasePushOperation = resolve;
      });
      pushRegistrationSerialRef.current = previousPushOperation
        .catch(() => {})
        .then(() => pushOperationMarker);
      await previousPushOperation.catch(() => {});

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      try {
        const response = await fetch(
          `${APP_BACKEND_URL}/functions/v1/bd-register-push-token`,
          {
            method: 'POST',
            signal: controller.signal,
            headers: {
              Authorization: `Bearer ${APP_BACKEND_PUBLISHABLE_KEY}`,
              apikey: APP_BACKEND_PUBLISHABLE_KEY,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              action: 'unregister',
              native_session: session,
              expo_push_token: expoPushToken,
            }),
          },
        );
        const body = await response.json().catch(() => null);
        if (!response.ok || body?.ok !== true) return false;
        if (
          nativeSessionGenerationRef.current === sessionGeneration &&
          !nativeBridgeSessionRef.current
        ) {
          expoPushTokenRef.current = '';
          await SecureStore.deleteItemAsync(PUSH_TOKEN_SESSION_KEY).catch(
            () => {},
          );
        }
        return true;
      } catch {
        return false;
      } finally {
        clearTimeout(timeout);
        releasePushOperation();
      }
    },
    [],
  );

  const retryPendingPushUnregister = useCallback(async () => {
    if (Platform.OS === 'web') return;
    const raw = await SecureStore.getItemAsync(
      PENDING_PUSH_UNREGISTER_KEY,
    ).catch(() => null);
    if (!raw) return;
    try {
      const pending = JSON.parse(raw) as {
        native_session?: NativeBridgeSession | null;
        expo_push_token?: string;
      };
      const completed = await unregisterPushNotifications(
        pending.native_session,
        String(pending.expo_push_token || ''),
      );
      if (completed) {
        await deletePendingPushUnregisterIfCurrent(raw).catch(() => {});
      }
    } catch {
      // Leave the encrypted retry record in place for the next foreground pass.
    }
  }, [deletePendingPushUnregisterIfCurrent, unregisterPushNotifications]);

  useEffect(() => {
    setAudioModeAsync({
      playsInSilentMode: true,
      interruptionMode: 'mixWithOthers',
      allowsRecording: false,
      shouldPlayInBackground: false,
      shouldRouteThroughEarpiece: false,
    }).catch(() => {});

    const player = createAudioPlayer(CHAT_DING_SOUND, {
      downloadFirst: true,
      keepAudioSessionActive: true,
    });
    chatDingPlayerRef.current = player;

    return () => {
      player.remove();
      chatDingPlayerRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (Platform.OS === 'web' || !nativeSessionHydrated) return;
    const retryPushState = async () => {
      await retryPendingPushUnregister();
      const session = nativeBridgeSessionRef.current;
      const registrationKey =
        session?.user_id && session?.token
          ? `${session.user_id}:${session.token}`
          : '';
      if (
        registrationKey &&
        pushRegistrationKeyRef.current !== registrationKey
      ) {
        await registerPushNotifications(session);
      }
    };
    void retryPushState();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void retryPushState();
    });
    const retryTimer = setInterval(() => {
      if (AppState.currentState === 'active') void retryPushState();
    }, 60_000);
    return () => {
      subscription.remove();
      clearInterval(retryTimer);
    };
  }, [
    nativeBridgeSession?.token,
    nativeBridgeSession?.user_id,
    nativeSessionHydrated,
    registerPushNotifications,
    retryPendingPushUnregister,
  ]);

  const playChatNotificationCue = useCallback(() => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(
      () => {},
    );
    Vibration.vibrate([0, 120, 80, 120]);

    const player = chatDingPlayerRef.current;
    if (player) {
      try {
        player.pause();
        player
          .seekTo(0)
          .then(() => player.play())
          .catch(() => player.play());
        return;
      } catch {
        // Fall back to synthesized web audio below when native playback is unavailable.
      }
    }

    playWebChatDing();
  }, []);

  const openNativeQrScanner = useCallback(() => {
    invalidateNavigationIntent();
    setShowNativeChat(false);
    setNativeChatThreadOpen(false);
    setShowNativeQrScanner(true);
  }, [invalidateNavigationIntent]);

  const openQrContactCompletion = useCallback(() => {
    invalidateNavigationIntent();
    profileCompletionIntentRef.current += 1;
    setShowNativeQrScanner(false);
    hideWebsiteBrowser();
    setQrContactCompletionRequested(true);
  }, [hideWebsiteBrowser, invalidateNavigationIntent]);

  const cancelQrContactCompletion = useCallback(() => {
    invalidateNavigationIntent();
    profileCompletionIntentRef.current += 1;
    setQrContactCompletionRequested(false);
  }, [invalidateNavigationIntent]);

  useEffect(() => {
    const nativeModalVisible = showNativeChat || showNativeQrScanner;
    navigation.setOptions({
      tabBarStyle:
        showBrowser || nativeModalVisible ? { display: 'none' } : TAB_BAR_STYLE,
    });

    return () => {
      navigation.setOptions({ tabBarStyle: TAB_BAR_STYLE });
    };
  }, [navigation, showBrowser, showNativeChat, showNativeQrScanner]);

  const clearNativeSession = useCallback(() => {
    authOperationGenerationRef.current += 1;
    authOperationInFlightRef.current = null;
    profileCompletionIntentRef.current += 1;
    websiteLoginBridgePromisesRef.current.clear();
    nativeSessionRefreshPromisesRef.current.clear();
    websiteBridgeNonceRef.current = '';
    const bridgeWaiters = bridgeSessionWaitersRef.current.splice(0);
    bridgeWaiters.forEach((resolve) => resolve(null));
    pendingBdFormLoginRef.current = null;
    pendingBdFormLoginSubmittedRef.current = false;
    commitNativeMember(null);
    commitNativeBridgeSession(null);
    setGoogleLoginLoading(false);
    setEmailLoginLoading(false);
    setSignupLoading(false);
    setProfileSaveLoading(false);
    setChatUnreadCount(0);
    setChatStatusLabel('Synced with website chat');
    setChatInboxPath(DEFAULT_CHAT_INBOX_PATH);
    setShowNativeChat(false);
    setNativeChatThreads([]);
    setNativeChatMessages([]);
    nativeChatRequestGenerationRef.current += 1;
    nativeChatReportRequestGenerationRef.current += 1;
    nativeChatLoadingGenerationRef.current =
      nativeChatRequestGenerationRef.current;
    nativeChatVisibleAbortControllerRef.current?.abort();
    nativeChatVisibleAbortControllerRef.current = null;
    nativeChatSendInFlightRef.current = null;
    nativeChatImagePickerInFlightRef.current = null;
    nativeChatPendingTextSendsRef.current.clear();
    nativeChatPendingImageSendsRef.current.clear();
    setNativeChatLoading(false);
    setNativeChatSending(false);
    chatStatusRequestGenerationRef.current += 1;
    chatStatusInFlightRef.current = null;
    setQrContactCompletionRequested(false);
    setSelectedChatThreadToken('');
    setNativeChatError(null);
    setNativeChatNotice(null);
    nativeChatReportInFlightRef.current = null;
    setNativeChatReporting(false);
    setNativeChatImagesEnabled(false);
    setNativeChatImagesNotice(CHAT_IMAGES_DISABLED_NOTICE);
    setNativeChatDraft('');
    nativeChatDraftsRef.current.clear();
    chatUnreadSnapshotRef.current = null;
    pushRegistrationGenerationRef.current += 1;
    pushRegistrationPromisesRef.current.clear();
    pushRegistrationKeyRef.current = '';
    expoPushTokenRef.current = '';
    setPendingDashboardRedirect(false);
    setPendingBridgeTargetPath(DEFAULT_BRIDGE_TARGET_PATH);
    signedOutRecoveryIntentRef.current = false;
    SecureStore.deleteItemAsync(CHAT_UNREAD_SESSION_KEY).catch(() => {});
    SecureStore.deleteItemAsync(PUSH_TOKEN_SESSION_KEY).catch(() => {});
    updateAppBadge(0);
  }, [commitNativeBridgeSession, commitNativeMember, updateAppBadge]);

  const clearWebsiteStorage = useCallback(() => {
    webviewRef.current?.injectJavaScript(`
      try {
        window.localStorage && window.localStorage.clear();
        window.sessionStorage && window.sessionStorage.clear();
        String(document.cookie || '').split(';').forEach(function(part) {
          var name = part.split('=')[0].trim();
          if (!name) return;
          var expired = name + '=; expires=Thu, 01 Jan 1970 00:00:00 GMT; max-age=0; path=/';
          document.cookie = expired;
          document.cookie = expired + '; domain=.weddingwin.ca';
          document.cookie = expired + '; domain=www.weddingwin.ca';
        });
        if (window.caches && window.caches.keys) {
          window.caches.keys().then(function(keys) {
            keys.forEach(function(key) { window.caches.delete(key); });
          }).catch(function() {});
        }
      } catch (e) {}
      true;
    `);
  }, []);

  const resetWebsiteBrowser = useCallback(() => {
    clearLoadingTimeout();
    webviewRef.current?.stopLoading();
    webviewRef.current?.clearHistory?.();
    webviewRef.current?.clearFormData?.();
    webviewRef.current?.clearCache?.(true);
    sourceUriRef.current = TARGET_URL;
    currentUrlRef.current = TARGET_URL;
    setSourceUri(TARGET_URL);
    setCanGoBack(false);
    setCanGoForward(false);
    setIsChatPage(false);
    setIsWedWebsiteSite(false);
    setPendingDashboardRedirect(false);
    setPendingBridgeTargetPath(DEFAULT_BRIDGE_TARGET_PATH);
    setLoading(false);
    setError(null);
    advanceWebViewSession();
  }, [advanceWebViewSession, clearLoadingTimeout]);

  const consumeAccountDeletedEvent = useCallback(
    (deletedUserId = '', deletedToken = '') => {
      const currentSession = nativeBridgeSessionRef.current;
      const appliesToCurrentSession =
        !deletedUserId ||
        !currentSession?.user_id ||
        (String(currentSession.user_id) === deletedUserId &&
          (!deletedToken ||
            String(currentSession.token || '') === deletedToken));
      if (appliesToCurrentSession) {
        clearNativeSession();
        clearWebsiteStorage();
        resetWebsiteBrowser();
        hideWebsiteBrowser();
      }
      SecureStore.deleteItemAsync(ACCOUNT_DELETED_EVENT_KEY).catch(() => {});
    },
    [
      clearNativeSession,
      clearWebsiteStorage,
      hideWebsiteBrowser,
      resetWebsiteBrowser,
    ],
  );

  useEffect(
    () =>
      subscribeToAccountDeleted((event) => {
        consumeAccountDeletedEvent(event.userId, event.token);
      }),
    [consumeAccountDeletedEvent],
  );

  useFocusEffect(
    useCallback(() => {
      let active = true;
      SecureStore.getItemAsync(ACCOUNT_DELETED_EVENT_KEY)
        .then((deletedEvent) => {
          if (!active || !deletedEvent) return;
          let deletedUserId = '';
          let deletedToken = '';
          try {
            const parsed = JSON.parse(deletedEvent) as {
              user_id?: unknown;
              token?: unknown;
            };
            deletedUserId = String(parsed.user_id || '').trim();
            deletedToken = String(parsed.token || '').trim();
          } catch {
            // Legacy timestamp events predate identity scoping and are consumed
            // with the old clear-on-focus behavior.
          }
          consumeAccountDeletedEvent(deletedUserId, deletedToken);
        })
        .catch(() => {});
      return () => {
        active = false;
        invalidateNavigationIntent();
      };
    }, [consumeAccountDeletedEvent, invalidateNavigationIntent]),
  );

  const finishLogoutInApp = useCallback(
    (reason: string) => {
      if (finishLogoutInFlightRef.current)
        return finishLogoutInFlightRef.current;
      const logoutGeneration = logoutOperationGenerationRef.current + 1;
      logoutOperationGenerationRef.current = logoutGeneration;
      addDebugLine(`logout synced: ${reason}`);
      logoutInFlightRef.current = true;
      setLogoutLoading(true);
      pendingAppLogoutRef.current = false;
      invalidateNavigationIntent();
      const sessionToUnregister = nativeBridgeSessionRef.current;
      const pushTokenToUnregister = expoPushTokenRef.current;
      clearNativeSession();
      const clearedSessionGeneration = nativeSessionGenerationRef.current;
      setError(null);
      const request = (async () => {
        if (
          sessionToUnregister?.user_id &&
          sessionToUnregister.token &&
          pushTokenToUnregister
        ) {
          const pendingPushUnregister = JSON.stringify({
            native_session: sessionToUnregister,
            expo_push_token: pushTokenToUnregister,
          });
          await savePendingPushUnregister(pendingPushUnregister).catch(
            () => {},
          );
          const pushUnregistered = await unregisterPushNotifications(
            sessionToUnregister,
            pushTokenToUnregister,
          );
          if (pushUnregistered) {
            await deletePendingPushUnregisterIfCurrent(
              pendingPushUnregister,
            ).catch(() => {});
          }
        } else {
          await unregisterPushNotifications(
            sessionToUnregister,
            pushTokenToUnregister,
          );
        }
        // Give the website logout request a short window to invalidate its server
        // session, then destroy the non-persistent WebView only if no newer login
        // has replaced the session in the meantime.
        await new Promise<void>((resolve) => setTimeout(resolve, 500));
        if (logoutOperationGenerationRef.current !== logoutGeneration) return;
        const sessionWasReplaced =
          nativeSessionGenerationRef.current !== clearedSessionGeneration ||
          !!nativeBridgeSessionRef.current;
        if (!sessionWasReplaced) {
          clearWebsiteStorage();
          resetWebsiteBrowser();
          hideWebsiteBrowser();
        }
      })().finally(() => {
        if (
          finishLogoutInFlightRef.current === request &&
          logoutOperationGenerationRef.current === logoutGeneration
        ) {
          finishLogoutInFlightRef.current = null;
          pendingAppLogoutRef.current = false;
          logoutInFlightRef.current = false;
          setLogoutLoading(false);
        }
      });
      finishLogoutInFlightRef.current = request;
      return request;
    },
    [
      addDebugLine,
      clearNativeSession,
      clearWebsiteStorage,
      deletePendingPushUnregisterIfCurrent,
      hideWebsiteBrowser,
      invalidateNavigationIntent,
      resetWebsiteBrowser,
      savePendingPushUnregister,
      unregisterPushNotifications,
    ],
  );

  useEffect(() => {
    let alive = true;
    const hydrationGeneration = nativeSessionGenerationRef.current;

    Promise.all([
      SecureStore.getItemAsync(NATIVE_MEMBER_SESSION_KEY),
      SecureStore.getItemAsync(NATIVE_BRIDGE_SESSION_KEY),
      SecureStore.getItemAsync(PUSH_TOKEN_SESSION_KEY),
    ])
      .then(([storedMember, storedBridge, storedPushToken]) => {
        if (
          !alive ||
          nativeSessionGenerationRef.current !== hydrationGeneration
        )
          return;

        expoPushTokenRef.current = storedPushToken || '';

        const member = storedMember
          ? (JSON.parse(storedMember) as NativeMember)
          : null;
        const bridge = storedBridge
          ? (JSON.parse(storedBridge) as NativeBridgeSession)
          : null;

        if (member?.email && bridge?.user_id && bridge?.token) {
          commitNativeMember(
            withMemberRole(member, member.account_role || 'couple'),
          );
          commitNativeBridgeSession(bridge);
          return;
        }

        if (member?.email || bridge?.user_id || bridge?.token) {
          addDebugLine('cleared old native session');
          queueNativeSessionStorageMutation(async () => {
            await SecureStore.deleteItemAsync(NATIVE_MEMBER_SESSION_KEY);
            await SecureStore.deleteItemAsync(NATIVE_BRIDGE_SESSION_KEY);
          });
        }
      })
      .catch(() => {})
      .finally(() => {
        if (alive) setNativeSessionHydrated(true);
      });

    return () => {
      alive = false;
    };
  }, [
    addDebugLine,
    commitNativeBridgeSession,
    commitNativeMember,
    queueNativeSessionStorageMutation,
  ]);

  const openUrl = useCallback(
    (path: string) => {
      const url = new URL(path, TARGET_URL);
      const nextUrl = url.toString();
      const nextPath = getWeddingWinPath(nextUrl);
      signedOutRecoveryIntentRef.current =
        !nativeMember && nextPath === '/login/retrieval';
      if (!nativeMember && nextPath.startsWith('/login')) {
        // Mount a fresh private WebView for signed-out auth pages so stale site
        // cookies cannot turn Forgot password into an authenticated account view.
        advanceWebViewSession();
        setCanGoBack(false);
        setCanGoForward(false);
      }
      setError(null);
      startLoadingFeedback();
      setIsChatPage(isChatInboxPath(getWeddingWinPath(nextUrl)));
      setIsWedWebsiteSite(isWedWebsiteUrl(nextUrl));
      currentUrlRef.current = nextUrl;
      navigateWebViewTo(nextUrl);
      setShowBrowser(true);
    },
    [
      advanceWebViewSession,
      nativeMember,
      navigateWebViewTo,
      startLoadingFeedback,
    ],
  );

  const openAbsoluteUrl = useCallback(
    (url: string) => {
      signedOutRecoveryIntentRef.current = false;
      addDebugLine(`open ${url.replace(TARGET_URL, '')}`);
      setError(null);
      startLoadingFeedback();
      setIsChatPage(isChatInboxPath(getWeddingWinPath(url)));
      setIsWedWebsiteSite(isWedWebsiteUrl(url));
      currentUrlRef.current = url;
      navigateWebViewTo(url);
      setShowBrowser(true);
    },
    [addDebugLine, navigateWebViewTo, startLoadingFeedback],
  );

  const startBridgeRedirect = useCallback(
    (targetPath = DEFAULT_BRIDGE_TARGET_PATH) => {
      setPendingBridgeTargetPath(targetPath);
      setPendingDashboardRedirect(true);
    },
    [],
  );

  const runEmailLogin = useCallback(
    async (credentials: LoginCredentials) => {
      const authGeneration = beginAuthOperation('email-login');
      if (authGeneration === null) return;
      setEmailLoginLoading(true);

      try {
        const { response, data } = await fetchAppJsonWithTimeout<any>(
          `${APP_BACKEND_URL}/functions/v1/bd-email-login`,
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${APP_BACKEND_PUBLISHABLE_KEY}`,
              apikey: APP_BACKEND_PUBLISHABLE_KEY,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(credentials),
          },
          'Login took too long. Check your connection and try again.',
        );
        if (!authOperationIsCurrent('email-login', authGeneration)) return;

        if (
          !response.ok ||
          !data?.ok ||
          !data?.user?.email ||
          !hasNativeTokenSession(data?.native_session)
        ) {
          const detail =
            typeof data?.detail === 'string' && data.detail
              ? `: ${data.detail}`
              : '';
          addDebugLine(`email login failed ${response.status}${detail}`);
          Alert.alert(
            'Login failed',
            data?.error || 'Please check your email and password.',
          );
          return;
        }

        addDebugLine('email login ok -> native session');
        const signedInUser = withMemberRole(
          data.user as NativeMember,
          credentials.role || 'couple',
        );
        commitNativeMember(signedInUser);
        commitNativeBridgeSession(data.native_session);
        hideWebsiteBrowser();
      } catch {
        if (authOperationIsCurrent('email-login', authGeneration)) {
          Alert.alert(
            'Login unavailable',
            'Please check your connection and try again.',
          );
        }
      } finally {
        if (authOperationIsCurrent('email-login', authGeneration)) {
          setEmailLoginLoading(false);
          finishAuthOperation('email-login', authGeneration);
        }
      }
    },
    [
      addDebugLine,
      authOperationIsCurrent,
      beginAuthOperation,
      commitNativeBridgeSession,
      commitNativeMember,
      finishAuthOperation,
      hideWebsiteBrowser,
    ],
  );

  const saveNativeSession = useCallback(
    (
      user: NativeMember,
      session?: NativeBridgeSession | null,
      fallbackRole: SignupRole = 'couple',
    ) => {
      const normalizedUser = withMemberRole(user, fallbackRole);
      commitNativeMember(normalizedUser);
      commitNativeBridgeSession(session || null);
    },
    [commitNativeBridgeSession, commitNativeMember],
  );

  const createWebsiteLoginBridge = useCallback(
    async (
      session: NativeBridgeSession,
      targetPath: '/account/home' | '/builder-sso',
    ) => {
      const sessionGeneration = nativeSessionGenerationRef.current;
      const controller = new AbortController();
      const timeout = setTimeout(
        () => controller.abort(),
        WEBSITE_BRIDGE_REQUEST_TIMEOUT_MS,
      );
      let response: Response;
      try {
        response = await fetch(
          `${APP_BACKEND_URL}/functions/v1/bd-email-login`,
          {
            method: 'POST',
            signal: controller.signal,
            headers: {
              Authorization: `Bearer ${APP_BACKEND_PUBLISHABLE_KEY}`,
              apikey: APP_BACKEND_PUBLISHABLE_KEY,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              native_session: session,
              target_path: targetPath,
            }),
          },
        );
      } catch (error) {
        if (controller.signal.aborted) {
          throw new Error(
            'The website took too long to open. Check your connection and try again.',
          );
        }
        throw error;
      } finally {
        clearTimeout(timeout);
      }
      const data = await response.json().catch(() => ({}));
      const bridgeUrl =
        typeof data?.app_login_url === 'string' ? data.app_login_url : '';
      let parsedBridge: URL | null = null;
      try {
        parsedBridge = new URL(bridgeUrl);
      } catch {
        parsedBridge = null;
      }
      if (
        !response.ok ||
        data?.ok !== true ||
        !parsedBridge ||
        !isOneTimeAppLoginUrl(parsedBridge.toString())
      ) {
        throw new Error(
          data?.error || 'A secure website session could not be created.',
        );
      }

      const activeSession = nativeBridgeSessionRef.current;
      if (
        data.native_session &&
        nativeSessionGenerationRef.current === sessionGeneration &&
        String(activeSession?.user_id || '') ===
          String(session.user_id || '') &&
        String(activeSession?.token || '') === String(session.token || '')
      ) {
        const refreshedSession = { ...session, ...data.native_session };
        commitNativeBridgeSession(refreshedSession);
      }
      return parsedBridge.toString();
    },
    [commitNativeBridgeSession],
  );

  const createCoalescedWebsiteLoginBridge = useCallback(
    (
      session: NativeBridgeSession,
      targetPath: '/account/home' | '/builder-sso',
    ) => {
      const bridgeKey = [
        targetPath,
        String(session.user_id || ''),
        String(session.token || session.cookie || ''),
      ].join(':');
      const existing = websiteLoginBridgePromisesRef.current.get(bridgeKey);
      if (existing) return existing;

      const request = createWebsiteLoginBridge(session, targetPath).finally(
        () => {
          if (
            websiteLoginBridgePromisesRef.current.get(bridgeKey) === request
          ) {
            websiteLoginBridgePromisesRef.current.delete(bridgeKey);
          }
        },
      );
      websiteLoginBridgePromisesRef.current.set(bridgeKey, request);
      return request;
    },
    [createWebsiteLoginBridge],
  );

  const runMemberSignup = useCallback(
    async (signup: MemberSignup) => {
      const authGeneration = beginAuthOperation('member-signup');
      if (authGeneration === null) return;
      setSignupLoading(true);

      try {
        const endpoint =
          signup.role === 'vendor' ? 'bd-vendor-signup' : 'bd-couple-signup';
        const signupPayload = {
          first_name: signup.firstName,
          email: signup.email,
          ...(signup.phone ? { phone: signup.phone } : {}),
          password: signup.password,
          ...(signup.role === 'couple' && signup.weddingDate
            ? { wedding_date: signup.weddingDate }
            : {}),
          accepted_terms: signup.consent.acceptedTerms,
          accepted_privacy: signup.consent.acceptedPrivacy,
          accepted_at: signup.consent.acceptedAt,
          terms_version: signup.consent.termsVersion,
          privacy_version: signup.consent.privacyVersion,
          client_context: {
            appOwnership: Constants.appOwnership,
            platform: Platform.OS,
            nativeAppVersion: Constants.nativeAppVersion,
            runtimeVersion: Constants.expoConfig?.runtimeVersion,
          },
        };
        const { response, data } = await fetchAppJsonWithTimeout<any>(
          `${APP_BACKEND_URL}/functions/v1/${endpoint}`,
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${APP_BACKEND_PUBLISHABLE_KEY}`,
              apikey: APP_BACKEND_PUBLISHABLE_KEY,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(signupPayload),
          },
          'Account creation took too long. Check your connection and try again.',
        );
        if (!authOperationIsCurrent('member-signup', authGeneration)) return;

        if (
          !response.ok ||
          !data?.ok ||
          !data?.user?.email ||
          !hasNativeTokenSession(data?.native_session)
        ) {
          const detail =
            typeof data?.detail === 'string' && data.detail
              ? `\n\n${data.detail}`
              : '';
          Alert.alert(
            'Account not created',
            `${data?.error || `WeddingWin could not create your ${signup.role} account yet.`}${detail}`,
          );
          return;
        }

        addDebugLine(`${signup.role} signup ok -> app-login bridge`);
        const signedUpUser = {
          ...data.user,
          subscription_id:
            data.user?.subscription_id || membershipPlanForRole(signup.role),
        };
        saveNativeSession(signedUpUser, data.native_session);
        hideWebsiteBrowser();
      } catch {
        if (authOperationIsCurrent('member-signup', authGeneration)) {
          Alert.alert(
            'Signup unavailable',
            'Please check your connection and try again.',
          );
        }
      } finally {
        if (authOperationIsCurrent('member-signup', authGeneration)) {
          setSignupLoading(false);
          finishAuthOperation('member-signup', authGeneration);
        }
      }
    },
    [
      addDebugLine,
      authOperationIsCurrent,
      beginAuthOperation,
      finishAuthOperation,
      hideWebsiteBrowser,
      saveNativeSession,
    ],
  );

  const runCompleteProfile = useCallback(
    async (profile: ContactProfile) => {
      const profileSession = logoutInFlightRef.current
        ? null
        : nativeBridgeSessionRef.current;
      if (!profileSession?.user_id || !profileSession?.token) {
        Alert.alert(
          'Sign in again',
          'Please sign in once more before saving your profile.',
        );
        return;
      }

      const authGeneration = beginAuthOperation('profile-save');
      if (authGeneration === null) return;
      profileCompletionIntentRef.current += 1;
      const profileIntent = profileCompletionIntentRef.current;
      const navigationIntent = beginNavigationIntent();
      const shouldResumeQrScanner = qrContactCompletionRequested;
      setProfileSaveLoading(true);

      try {
        const profilePayload = {
          first_name: profile.firstName,
          email: profile.email,
          phone: profile.phone,
          ...(profile.weddingDate ? { wedding_date: profile.weddingDate } : {}),
        };
        const { response, data } = await fetchAppJsonWithTimeout<any>(
          `${APP_BACKEND_URL}/functions/v1/bd-complete-profile`,
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${APP_BACKEND_PUBLISHABLE_KEY}`,
              apikey: APP_BACKEND_PUBLISHABLE_KEY,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              native_session: profileSession,
              profile: profilePayload,
            }),
          },
          'Saving your profile took too long. Check your connection and try again.',
        );
        if (
          !authOperationIsCurrent('profile-save', authGeneration) ||
          profileCompletionIntentRef.current !== profileIntent
        )
          return;

        if (response.ok && data?.email_confirmation_required) {
          Alert.alert(
            'Confirm your email',
            data?.message ||
              'Please check your email and tap the confirmation link before continuing.',
          );
          return;
        }

        if (!response.ok || !data?.ok || !data?.user?.email) {
          const detail =
            typeof data?.detail === 'string' ? data.detail.trim() : '';
          const errorMessage =
            data?.error || 'WeddingWin could not save your details yet.';
          if (detail) {
            addDebugLine(`complete profile failed: ${detail}`);
            console.warn('bd-complete-profile failed', {
              status: response.status,
              detail,
            });
          }
          Alert.alert('Profile not saved', errorMessage);
          return;
        }

        const completedUser = {
          ...(nativeMember || {}),
          ...(data.user || {}),
          first_name: data.user?.first_name || profile.firstName,
          email: data.user?.email || profile.email,
          phone_number: data.user?.phone_number || profile.phone,
          wedding_date:
            data.user?.wedding_date ||
            profile.weddingDate ||
            nativeMember?.wedding_date,
          subscription_id:
            data.user?.subscription_id ||
            nativeMember?.subscription_id ||
            COUPLE_MEMBERSHIP_PLAN_ID,
        };
        const completedSession: NativeBridgeSession = {
          ...profileSession,
          ...(data.native_session || {}),
        };
        saveNativeSession(
          withMemberRole(completedUser, 'couple'),
          completedSession,
        );

        if (
          profileCompletionIntentRef.current !== profileIntent ||
          navigationIntentGenerationRef.current !== navigationIntent
        )
          return;

        setQrContactCompletionRequested(false);
        hideWebsiteBrowser();
        if (shouldResumeQrScanner) {
          setShowNativeQrScanner(true);
        }
      } catch {
        if (
          authOperationIsCurrent('profile-save', authGeneration) &&
          profileCompletionIntentRef.current === profileIntent &&
          navigationIntentGenerationRef.current === navigationIntent
        ) {
          Alert.alert(
            'Profile not saved',
            'Please check your connection and try again.',
          );
        }
      } finally {
        if (authOperationIsCurrent('profile-save', authGeneration)) {
          setProfileSaveLoading(false);
          finishAuthOperation('profile-save', authGeneration);
        }
      }
    },
    [
      addDebugLine,
      authOperationIsCurrent,
      beginAuthOperation,
      beginNavigationIntent,
      finishAuthOperation,
      hideWebsiteBrowser,
      nativeMember,
      qrContactCompletionRequested,
      saveNativeSession,
    ],
  );

  const prepareExclusiveWebsiteDestination = useCallback(() => {
    // Website destinations and native overlays are mutually exclusive. Retire
    // the currently visible chat request before starting bridge work so a
    // slower Messages/QR tap cannot cover the newer destination.
    nativeChatRequestGenerationRef.current += 1;
    nativeChatLoadingGenerationRef.current =
      nativeChatRequestGenerationRef.current;
    nativeChatVisibleAbortControllerRef.current?.abort();
    nativeChatVisibleAbortControllerRef.current = null;
    setNativeChatLoading(false);
    setNativeChatNotice(null);
    setNativeChatOpenRequestId(0);
    setNativeChatThreadOpen(false);
    setShowNativeChat(false);
    setShowNativeQrScanner(false);
  }, []);

  const openDashboardWithBridge = useCallback(
    async (existingNavigationIntent?: number) => {
      const navigationIntent =
        typeof existingNavigationIntent === 'number'
          ? existingNavigationIntent
          : beginNavigationIntent();
      prepareExclusiveWebsiteDestination();
      const activeSession = logoutInFlightRef.current
        ? null
        : nativeBridgeSessionRef.current;
      const activeMember = logoutInFlightRef.current
        ? null
        : nativeMemberRef.current;
      if (!activeSession?.user_id || !activeSession?.token) {
        if (navigationIntentGenerationRef.current !== navigationIntent) return;
        if (activeMember?.email) {
          addDebugLine('open dashboard with existing web session');
          openAbsoluteUrl(`${TARGET_URL}/account/home`);
          return;
        }
        addDebugLine('no bridge session; sign in required');
        clearNativeSession();
        hideWebsiteBrowser();
        Alert.alert(
          'Sign in again',
          'Please sign in once more so the app can create a website session.',
        );
        return;
      }

      try {
        addDebugLine('open dashboard with one-time website bridge');
        const bridgeUrl = await createCoalescedWebsiteLoginBridge(
          activeSession,
          '/account/home',
        );
        if (navigationIntentGenerationRef.current !== navigationIntent) return;
        startBridgeRedirect();
        openAbsoluteUrl(bridgeUrl);
      } catch (error) {
        if (navigationIntentGenerationRef.current !== navigationIntent) return;
        Alert.alert(
          'Dashboard unavailable',
          error instanceof Error
            ? error.message
            : 'Please sign in again and try once more.',
        );
      }
    },
    [
      addDebugLine,
      beginNavigationIntent,
      clearNativeSession,
      createCoalescedWebsiteLoginBridge,
      hideWebsiteBrowser,
      openAbsoluteUrl,
      prepareExclusiveWebsiteDestination,
      startBridgeRedirect,
    ],
  );

  const openWebsiteBuilderWithBridge = useCallback(
    async (existingNavigationIntent?: number) => {
      const navigationIntent =
        typeof existingNavigationIntent === 'number'
          ? existingNavigationIntent
          : beginNavigationIntent();
      prepareExclusiveWebsiteDestination();
      const activeSession = logoutInFlightRef.current
        ? null
        : nativeBridgeSessionRef.current;
      const activeMember = logoutInFlightRef.current
        ? null
        : nativeMemberRef.current;
      if (!activeSession?.user_id || !activeSession?.token) {
        if (navigationIntentGenerationRef.current !== navigationIntent) return;
        if (activeMember?.email) {
          addDebugLine('open website builder with existing web session');
          openAbsoluteUrl(`${TARGET_URL}/builder-sso`);
          return;
        }
        addDebugLine('no bridge session for website builder');
        clearNativeSession();
        hideWebsiteBrowser();
        Alert.alert(
          'Sign in again',
          'Please sign in once more so the app can open your wedding website builder.',
        );
        return;
      }

      try {
        addDebugLine('open website builder with one-time website bridge');
        const bridgeUrl = await createCoalescedWebsiteLoginBridge(
          activeSession,
          '/builder-sso',
        );
        if (navigationIntentGenerationRef.current !== navigationIntent) return;
        startBridgeRedirect('/builder-sso');
        openAbsoluteUrl(bridgeUrl);
      } catch (error) {
        if (navigationIntentGenerationRef.current !== navigationIntent) return;
        Alert.alert(
          'Website builder unavailable',
          error instanceof Error
            ? error.message
            : 'Please sign in again and try once more.',
        );
      }
    },
    [
      addDebugLine,
      beginNavigationIntent,
      clearNativeSession,
      createCoalescedWebsiteLoginBridge,
      hideWebsiteBrowser,
      openAbsoluteUrl,
      prepareExclusiveWebsiteDestination,
      startBridgeRedirect,
    ],
  );

  const requestWebsiteSessionBridge = useCallback(() => {
    if (logoutInFlightRef.current || pendingAppLogoutRef.current) return;
    const bridgeNonce = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
    websiteBridgeNonceRef.current = bridgeNonce;
    webviewRef.current?.injectJavaScript(`
(function() {
  try {
    if (window.location.origin !== ${JSON.stringify(new URL(TARGET_URL).origin)}) return true;
    var pairs = {};
    var decode = function(value) {
      try { return decodeURIComponent(value); } catch (e) { return value; }
    };
    String(document.cookie || '').split(';').forEach(function(part) {
      var index = part.indexOf('=');
      if (index < 0) return;
      var key = decode(part.slice(0, index).trim());
      var value = decode(part.slice(index + 1).trim());
      if (key) pairs[key] = value;
    });
    var session = {
      user_id: pairs.user_id || '',
      token: pairs.token || '',
      cookie: pairs.cookie || ''
    };
    if (session.user_id && (session.token || session.cookie)) {
      window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify({
        type: 'bd-cookie-session',
        bridge_nonce: ${JSON.stringify(bridgeNonce)},
        native_session: session
      }));
    }
  } catch (e) {}
  return true;
})();
true;
`);
  }, []);

  const waitForWebsiteSessionBridge = useCallback(
    (timeoutMs = 650) => {
      requestWebsiteSessionBridge();

      return new Promise<NativeBridgeSession | null>((resolve) => {
        let finished = false;
        let timer: ReturnType<typeof setTimeout> | null = null;

        const finish = (session: NativeBridgeSession | null) => {
          if (finished) return;
          finished = true;
          if (timer) clearTimeout(timer);
          resolve(session);
        };

        bridgeSessionWaitersRef.current.push(finish);
        timer = setTimeout(() => {
          bridgeSessionWaitersRef.current =
            bridgeSessionWaitersRef.current.filter(
              (waiter) => waiter !== finish,
            );
          finish(nativeBridgeSessionRef.current);
        }, timeoutMs);
      });
    },
    [requestWebsiteSessionBridge],
  );

  const refreshNativeBridgeSession = useCallback(
    (session: NativeBridgeSession | null | undefined) => {
      if (!hasNativeBridgeSession(session)) return Promise.resolve(null);
      const bridgeSession = session as NativeBridgeSession;
      const refreshKey = `${bridgeSession.user_id}:${bridgeSession.token}`;
      const existingRequest =
        nativeSessionRefreshPromisesRef.current.get(refreshKey);
      if (existingRequest) return existingRequest;
      const sessionGeneration = nativeSessionGenerationRef.current;
      const request = (async () => {
        const controller = new AbortController();
        const timeout = setTimeout(
          () => controller.abort(),
          WEBSITE_BRIDGE_REQUEST_TIMEOUT_MS,
        );
        try {
          const currentMember = nativeMemberRef.current;
          const sessionForRefresh = {
            ...bridgeSession,
            email:
              bridgeSession.email ||
              nativeBridgeSessionRef.current?.email ||
              currentMember?.email ||
              '',
          };
          const response = await fetch(
            `${APP_BACKEND_URL}/functions/v1/bd-email-login`,
            {
              method: 'POST',
              signal: controller.signal,
              headers: {
                Authorization: `Bearer ${APP_BACKEND_PUBLISHABLE_KEY}`,
                apikey: APP_BACKEND_PUBLISHABLE_KEY,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({ native_session: sessionForRefresh }),
            },
          );
          const data = await response.json();
          if (!response.ok || !data?.ok || !data?.native_session) return null;
          const activeSession = nativeBridgeSessionRef.current;
          if (
            nativeSessionGenerationRef.current !== sessionGeneration ||
            String(activeSession?.user_id || '') !==
              String(bridgeSession.user_id || '') ||
            String(activeSession?.token || '') !==
              String(bridgeSession.token || '')
          )
            return null;

          const refreshedSession = data.native_session as NativeBridgeSession;
          const refreshedUser = data.user as NativeMember | undefined;
          commitNativeBridgeSession(refreshedSession);
          if (refreshedUser?.email) {
            const latestMember = nativeMemberRef.current;
            const normalizedUser = withMemberRole(
              { ...(latestMember || {}), ...refreshedUser },
              memberAccountRole(latestMember),
            );
            commitNativeMember(normalizedUser);
          }
          return refreshedSession;
        } catch {
          return null;
        } finally {
          clearTimeout(timeout);
        }
      })().finally(() => {
        if (
          nativeSessionRefreshPromisesRef.current.get(refreshKey) === request
        ) {
          nativeSessionRefreshPromisesRef.current.delete(refreshKey);
        }
      });
      nativeSessionRefreshPromisesRef.current.set(refreshKey, request);
      return request;
    },
    [commitNativeBridgeSession, commitNativeMember],
  );

  const handleNativeQrScan = useCallback(
    (rawValue: string) => {
      const value = rawValue.trim();
      if (!value) return;

      playChatNotificationCue();
    },
    [playChatNotificationCue],
  );

  const syncNativeChat = useCallback(
    async (
      action: NativeChatSyncAction = 'list',
      options: {
        threadToken?: string;
        threadId?: string;
        requestUri?: string;
        message?: string;
        imageDataUri?: string;
        clientMessageId?: string;
        connectUrl?: string;
        threadTitle?: string;
        nativeSession?: NativeBridgeSession | null;
        sessionRetryAttempted?: boolean;
        quiet?: boolean;
        fallbackToWebsite?: boolean;
      } = {},
    ) => {
      if (accountDeletionIsInFlight()) return null;
      const deletionGeneration = getAccountDeletionGeneration();
      const isSendRequest = action === 'send';
      const isReportRequest = action === 'report';
      const showsLoading =
        action === 'list' ||
        action === 'read' ||
        action === 'open_vendor_profile';
      const visibleRequestGeneration = nativeChatRequestGenerationRef.current;
      const requestGeneration = isSendRequest
        ? nativeChatSendRequestGenerationRef.current + 1
        : isReportRequest
          ? nativeChatReportRequestGenerationRef.current + 1
          : nativeChatRequestGenerationRef.current + 1;
      if (isSendRequest) {
        nativeChatSendRequestGenerationRef.current = requestGeneration;
      } else if (isReportRequest) {
        nativeChatReportRequestGenerationRef.current = requestGeneration;
      } else {
        nativeChatRequestGenerationRef.current = requestGeneration;
      }
      const activeNativeSession = logoutInFlightRef.current
        ? null
        : nativeBridgeSessionRef.current;
      const requestSessionGeneration = nativeSessionGenerationRef.current;
      const requestSessionUserId = String(activeNativeSession?.user_id || '');
      const requestSessionToken = String(activeNativeSession?.token || '');
      const requestThreadToken =
        options.threadToken ||
        selectedChatThreadTokenRef.current ||
        selectedChatThreadToken;
      const requestIsCurrent = () =>
        (isSendRequest
          ? nativeChatSendRequestGenerationRef.current === requestGeneration
          : isReportRequest
            ? nativeChatReportRequestGenerationRef.current === requestGeneration
            : nativeChatRequestGenerationRef.current === requestGeneration) &&
        nativeSessionGenerationRef.current === requestSessionGeneration &&
        !logoutInFlightRef.current &&
        !pendingAppLogoutRef.current &&
        String(nativeBridgeSessionRef.current?.user_id || '') ===
          requestSessionUserId &&
        String(nativeBridgeSessionRef.current?.token || '') ===
          requestSessionToken &&
        accountMutationIsCurrent(deletionGeneration);
      requestWebsiteSessionBridge();

      if (!hasNativeBridgeSession(activeNativeSession)) {
        if (!options.quiet) {
          setNativeChatError('Please sign in to use WeddingWin messages.');
        }
        return null;
      }

      if (!options.quiet) {
        if (showsLoading) {
          nativeChatLoadingGenerationRef.current = requestGeneration;
          setNativeChatLoading(true);
        }
        setNativeChatError(null);
        if (action !== 'send') setNativeChatNotice(null);
      }

      let visibleAbortController: AbortController | null = null;
      try {
        const controller = new AbortController();
        if (showsLoading) {
          nativeChatVisibleAbortControllerRef.current?.abort();
          nativeChatVisibleAbortControllerRef.current = controller;
          visibleAbortController = controller;
        }
        const timeout = setTimeout(
          () => controller.abort(),
          CHAT_REQUEST_TIMEOUT_MS,
        );
        let response: Response;
        try {
          response = await fetch(
            `${APP_BACKEND_URL}/functions/v1/bd-chat-sync`,
            {
              method: 'POST',
              signal: controller.signal,
              headers: {
                Authorization: `Bearer ${APP_BACKEND_PUBLISHABLE_KEY}`,
                apikey: APP_BACKEND_PUBLISHABLE_KEY,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                action,
                native_session: activeNativeSession,
                thread_token: requestThreadToken,
                selected_thread_id: options.threadId,
                selected_thread_title: options.threadTitle,
                selected_thread_request_uri: options.requestUri,
                message: options.message,
                image_data_uri: options.imageDataUri,
                client_message_id: options.clientMessageId,
                connect_url: options.connectUrl,
              }),
            },
          );
        } catch (error) {
          if (controller.signal.aborted) {
            throw new Error(
              'Messages took too long to respond. Check your connection and try again.',
            );
          }
          throw error;
        } finally {
          clearTimeout(timeout);
        }
        const data = (await response.json()) as NativeChatSyncResponse;

        if (!requestIsCurrent()) return null;
        if (
          action === 'read' &&
          requestThreadToken &&
          selectedChatThreadTokenRef.current &&
          requestThreadToken !== selectedChatThreadTokenRef.current
        ) {
          return null;
        }

        if (typeof data.chat_images_enabled === 'boolean') {
          setNativeChatImagesEnabled(data.chat_images_enabled);
        }
        if (typeof data.chat_images_notice === 'string') {
          setNativeChatImagesNotice(
            data.chat_images_notice || CHAT_IMAGES_DISABLED_NOTICE,
          );
        }

        if (!response.ok || data?.ok === false) {
          const detail = data?.detail ? ` ${data.detail}` : '';
          throw new Error(`${data?.error || 'Chat sync failed.'}${detail}`);
        }

        if (
          (isSendRequest || isReportRequest) &&
          (nativeChatRequestGenerationRef.current !==
            visibleRequestGeneration ||
            (requestThreadToken &&
              selectedChatThreadTokenRef.current &&
              requestThreadToken !== selectedChatThreadTokenRef.current))
        ) {
          // Confirm the original send/report to its caller without allowing its
          // older payload to replace a newer refresh or another visible thread.
          return data;
        }

        if ((data as { partial?: boolean }).partial) {
          // Send succeeded but the backend hit the website API rate limit while
          // rebuilding the thread list. Keep the current UI; next poll refreshes.
          return data;
        }

        const threads = data.threads || [];
        setNativeChatSyncDebug(data.sync_debug || null);
        const nextThreadToken =
          data.selected_thread_token ||
          options.threadToken ||
          threads[0]?.token ||
          '';
        setNativeChatThreads(threads);
        selectedChatThreadTokenRef.current = nextThreadToken;
        setSelectedChatThreadToken(nextThreadToken);
        setNativeChatDraft(
          nativeChatDraftsRef.current.get(nextThreadToken) || '',
        );
        setNativeChatMessages(data.messages || []);
        setNativeChatError((current) =>
          current &&
          /login needs to be refreshed|native session expired|sign in again/i.test(
            current,
          )
            ? null
            : current,
        );
        if (action === 'open_vendor_profile') {
          setNativeChatOpeningLabel('');
        }
        const unreadCount = Number(data.unread_count || 0);
        const shouldSuppressAlert =
          action === 'read' ||
          (nativeChatThreadOpenRef.current &&
            !!selectedChatThreadTokenRef.current &&
            (options.threadToken || selectedChatThreadToken) ===
              selectedChatThreadTokenRef.current);
        if (
          !shouldSuppressAlert &&
          chatUnreadSnapshotRef.current !== null &&
          unreadCount > chatUnreadSnapshotRef.current
        ) {
          playChatNotificationCue();
        }
        chatUnreadSnapshotRef.current = Number.isFinite(unreadCount)
          ? unreadCount
          : 0;
        SecureStore.setItemAsync(
          CHAT_UNREAD_SESSION_KEY,
          String(chatUnreadSnapshotRef.current),
        ).catch(() => {});
        setChatUnreadCount(chatUnreadSnapshotRef.current);
        updateAppBadge(chatUnreadSnapshotRef.current);
        setChatStatusLabel(
          chatUnreadSnapshotRef.current > 0
            ? `${chatUnreadSnapshotRef.current} new message${chatUnreadSnapshotRef.current === 1 ? '' : 's'} waiting`
            : 'No new messages',
        );
        return data;
      } catch (error) {
        if (!requestIsCurrent()) return null;
        if (
          (isSendRequest || isReportRequest) &&
          (nativeChatRequestGenerationRef.current !==
            visibleRequestGeneration ||
            (requestThreadToken &&
              selectedChatThreadTokenRef.current &&
              requestThreadToken !== selectedChatThreadTokenRef.current))
        )
          return null;
        const message =
          error instanceof Error ? error.message : 'Chat sync failed.';
        if (
          /native session expired/i.test(message) &&
          !options.sessionRetryAttempted
        ) {
          const backendRefreshedSession =
            await refreshNativeBridgeSession(activeNativeSession);
          if (hasNativeBridgeSession(backendRefreshedSession)) {
            return syncNativeChat(action, {
              ...options,
              nativeSession: backendRefreshedSession,
              fallbackToWebsite: false,
              sessionRetryAttempted: true,
            });
          }

          const refreshedSession = await waitForWebsiteSessionBridge(1200);
          if (hasNativeBridgeSession(refreshedSession)) {
            return syncNativeChat(action, {
              ...options,
              nativeSession: refreshedSession,
              fallbackToWebsite: false,
              sessionRetryAttempted: true,
            });
          }
        }
        if (
          !options.quiet &&
          options.fallbackToWebsite &&
          /native session expired/i.test(message)
        ) {
          addDebugLine('native chat session expired');
          setNativeChatError(
            'Your app login needs to be refreshed before messages can open. Please sign out and sign back in, then try Send Message again.',
          );
          return null;
        }
        if (!options.quiet) {
          setNativeChatError(
            /native session expired/i.test(message)
              ? 'Your app login needs to be refreshed before messages can open. Please sign out and sign back in, then try Send Message again.'
              : message,
          );
          if (action === 'open_vendor_profile') {
            setNativeChatOpeningLabel('');
          }
        }
        return null;
      } finally {
        if (
          showsLoading &&
          nativeChatVisibleAbortControllerRef.current === visibleAbortController
        ) {
          nativeChatVisibleAbortControllerRef.current = null;
        }
        if (
          !options.quiet &&
          showsLoading &&
          nativeChatLoadingGenerationRef.current === requestGeneration
        ) {
          setNativeChatLoading(false);
        }
      }
    },
    [
      addDebugLine,
      playChatNotificationCue,
      refreshNativeBridgeSession,
      requestWebsiteSessionBridge,
      selectedChatThreadToken,
      updateAppBadge,
      waitForWebsiteSessionBridge,
    ],
  );

  // A keyboard opened by a website form must never linger under the native
  // chat overlay - blur the WebView's focused field and dismiss it before the
  // overlay mounts, otherwise it covers the composer and send button.
  const dismissAnyKeyboard = useCallback(() => {
    webviewRef.current?.injectJavaScript(
      '(function(){try{if(document.activeElement&&document.activeElement.blur){document.activeElement.blur();}}catch(e){}})();true;',
    );
    Keyboard.dismiss();
  }, []);

  const openChatWithBridge = useCallback(
    async (existingNavigationIntent?: number) => {
      const navigationIntent =
        typeof existingNavigationIntent === 'number'
          ? existingNavigationIntent
          : beginNavigationIntent();
      const closeVendorDraw = vendorDrawCloserRef.current;
      if (closeVendorDraw && !(await closeVendorDraw())) return;
      if (navigationIntentGenerationRef.current !== navigationIntent) return;
      const activeNativeSession = logoutInFlightRef.current
        ? null
        : nativeBridgeSessionRef.current;
      if (!hasNativeBridgeSession(activeNativeSession)) {
        openUrl(chatInboxPath || DEFAULT_CHAT_INBOX_PATH);
        return;
      }

      requestWebsiteSessionBridge();
      addDebugLine('open native messages');
      dismissAnyKeyboard();
      setNativeChatNotice(null);
      setNativeChatOpenRequestId(0);
      setNativeChatThreadOpen(false);
      setShowNativeQrScanner(false);
      setShowNativeChat(true);
      syncNativeChat('list', { fallbackToWebsite: true });
    },
    [
      addDebugLine,
      beginNavigationIntent,
      chatInboxPath,
      dismissAnyKeyboard,
      openUrl,
      requestWebsiteSessionBridge,
      syncNativeChat,
    ],
  );

  useEffect(() => {
    if (!nativeSessionHydrated || !lastNotificationResponse) return;
    if (
      lastNotificationResponse.actionIdentifier !==
        Notifications.DEFAULT_ACTION_IDENTIFIER ||
      lastNotificationResponse.notification.request.content.data?.screen !==
        'chat'
    ) {
      return;
    }

    const responseId = lastNotificationResponse.notification.request.identifier;
    if (handledNotificationResponseIdsRef.current.has(responseId)) {
      Notifications.clearLastNotificationResponse();
      return;
    }

    handledNotificationResponseIdsRef.current.add(responseId);
    Notifications.clearLastNotificationResponse();
    if (hasNativeBridgeSession(nativeBridgeSessionRef.current)) {
      openChatWithBridge();
    }
  }, [
    lastNotificationResponse,
    nativeBridgeSession,
    nativeSessionHydrated,
    openChatWithBridge,
  ]);

  useEffect(() => {
    if (Platform.OS === 'web' || !nativeSessionHydrated) return;

    const syncBadge = () => {
      updateAppBadge(
        hasNativeBridgeSession(nativeBridgeSessionRef.current)
          ? chatUnreadCount
          : 0,
      );
    };
    syncBadge();

    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') syncBadge();
    });
    return () => subscription.remove();
  }, [
    chatUnreadCount,
    nativeBridgeSession,
    nativeSessionHydrated,
    updateAppBadge,
  ]);

  const openNativeChatDeepLink = useCallback(
    async (path: string) => {
      invalidateNavigationIntent();
      const activeNativeSession = logoutInFlightRef.current
        ? null
        : nativeBridgeSessionRef.current;
      if (!hasNativeBridgeSession(activeNativeSession)) return;

      const threadToken = chatThreadTokenFromPath(path);
      requestWebsiteSessionBridge();
      dismissAnyKeyboard();
      setLoading(false);
      setError(null);
      setNativeChatError(null);
      setNativeChatNotice(null);
      setNativeChatOpenRequestId(0);
      setNativeChatThreadOpen(false);
      setShowNativeQrScanner(false);
      if (threadToken) {
        selectedChatThreadTokenRef.current = threadToken;
        setSelectedChatThreadToken(threadToken);
        setNativeChatDraft(nativeChatDraftsRef.current.get(threadToken) || '');
        setNativeChatMessages([]);
      }
      setShowNativeChat(true);

      const data = await syncNativeChat(threadToken ? 'read' : 'list', {
        threadToken,
        nativeSession: activeNativeSession,
        fallbackToWebsite: true,
      });
      if (threadToken && data?.selected_thread_token) {
        setNativeChatOpenRequestId((value) => value + 1);
      }
    },
    [
      dismissAnyKeyboard,
      invalidateNavigationIntent,
      requestWebsiteSessionBridge,
      syncNativeChat,
    ],
  );

  const openVendorConnectChat = useCallback(
    async (connectUrl: string) => {
      if (vendorConnectNativeUrlRef.current === connectUrl) return;
      vendorConnectNativeUrlRef.current = connectUrl;
      invalidateNavigationIntent();
      if (vendorConnectNativeTimerRef.current) {
        clearTimeout(vendorConnectNativeTimerRef.current);
      }
      vendorConnectNativeTimerRef.current = setTimeout(() => {
        vendorConnectNativeUrlRef.current = '';
        vendorConnectNativeTimerRef.current = null;
      }, 2200);

      addDebugLine('open native vendor conversation');
      dismissAnyKeyboard();
      setNativeChatOpeningLabel(vendorNameFromConnectUrl(connectUrl));
      setLoading(false);
      setError(null);
      setNativeChatError(null);
      setNativeChatNotice(null);
      setNativeChatOpenRequestId(0);
      setNativeChatThreadOpen(false);
      setShowNativeQrScanner(false);
      setShowNativeChat(true);
      requestWebsiteSessionBridge();

      try {
        let activeNativeSession = logoutInFlightRef.current
          ? null
          : nativeBridgeSessionRef.current;
        if (!hasNativeBridgeSession(activeNativeSession)) {
          activeNativeSession = await waitForWebsiteSessionBridge(350);
        }
        if (!hasNativeBridgeSession(activeNativeSession)) {
          setNativeChatError(
            'Please sign in through the app before starting a private message.',
          );
          setNativeChatOpeningLabel('');
          return;
        }

        const data = await syncNativeChat('open_vendor_profile', {
          connectUrl,
          nativeSession: activeNativeSession,
        });

        if (data?.selected_thread_token) {
          await syncNativeChat('read', {
            threadToken: data.selected_thread_token,
            nativeSession: activeNativeSession,
          });
          setNativeChatOpenRequestId((value) => value + 1);
        }
      } finally {
        if (vendorConnectNativeTimerRef.current) {
          clearTimeout(vendorConnectNativeTimerRef.current);
        }
        vendorConnectNativeTimerRef.current = setTimeout(() => {
          vendorConnectNativeUrlRef.current = '';
          vendorConnectNativeTimerRef.current = null;
        }, 600);
      }
    },
    [
      addDebugLine,
      dismissAnyKeyboard,
      invalidateNavigationIntent,
      requestWebsiteSessionBridge,
      syncNativeChat,
      waitForWebsiteSessionBridge,
    ],
  );

  const interceptVendorConnectChat = useCallback(
    (connectUrl: string) => {
      if (vendorConnectNativeUrlRef.current === connectUrl) {
        setLoading(false);
        return;
      }
      openVendorConnectChat(connectUrl);
    },
    [openVendorConnectChat],
  );

  const selectNativeChatThread = useCallback(
    (threadToken: string) => {
      if (nativeChatReportInFlightRef.current === 'request') return;
      nativeChatRequestGenerationRef.current += 1;
      selectedChatThreadTokenRef.current = threadToken;
      setSelectedChatThreadToken(threadToken);
      setNativeChatDraft(nativeChatDraftsRef.current.get(threadToken) || '');
      setNativeChatMessages([]);
      setNativeChatError(null);
      setNativeChatNotice(null);
      void syncNativeChat('read', { threadToken });
    },
    [syncNativeChat],
  );

  const updateNativeChatDraft = useCallback((value: string) => {
    const threadToken = selectedChatThreadTokenRef.current;
    if (threadToken) nativeChatDraftsRef.current.set(threadToken, value);
    setNativeChatDraft(value);
  }, []);

  const sendNativeChatMessage = useCallback(async () => {
    const message = nativeChatDraft.trim();
    if (
      !message ||
      !selectedChatThreadToken ||
      nativeChatSendInFlightRef.current ||
      nativeChatReportInFlightRef.current
    )
      return;
    const selectedThread = nativeChatThreads.find(
      (thread) => thread.token === selectedChatThreadToken,
    );
    if (selectedThread?.closed || selectedThread?.reported) {
      setNativeChatError(selectedThread.report_notice || CHAT_REPORTED_NOTICE);
      return;
    }

    const sendOperationId = Crypto.randomUUID();
    const sendSessionGeneration = nativeSessionGenerationRef.current;
    const sendNativeSession = nativeBridgeSessionRef.current;
    if (!hasNativeBridgeSession(sendNativeSession)) return;
    const capturedNativeSession = sendNativeSession as NativeBridgeSession;
    const pendingSendKey = `${capturedNativeSession.user_id}:${selectedChatThreadToken}`;
    nativeChatSendInFlightRef.current = sendOperationId;
    setNativeChatSending(true);
    setNativeChatNotice(null);
    const pendingTextForThread =
      nativeChatPendingTextSendsRef.current.get(pendingSendKey);
    const pendingSend =
      pendingTextForThread?.message === message
        ? pendingTextForThread
        : {
            threadToken: selectedChatThreadToken,
            message,
            clientMessageId: Crypto.randomUUID(),
          };
    nativeChatPendingTextSendsRef.current.set(pendingSendKey, pendingSend);
    const sendSessionStillCurrent = () =>
      nativeSessionGenerationRef.current === sendSessionGeneration &&
      nativeBridgeSessionRef.current?.user_id === capturedNativeSession.user_id;
    const sendThreadStillSelected = () =>
      sendSessionStillCurrent() &&
      selectedChatThreadTokenRef.current === pendingSend.threadToken;
    const clearPendingTextSend = () => {
      if (
        nativeChatPendingTextSendsRef.current.get(pendingSendKey)
          ?.clientMessageId === pendingSend.clientMessageId
      ) {
        nativeChatPendingTextSendsRef.current.delete(pendingSendKey);
      }
    };
    try {
      const sent = await syncNativeChat('send', {
        threadToken: pendingSend.threadToken,
        threadId: selectedThread?.thread_id || selectedThread?.id,
        threadTitle: selectedThread?.title,
        requestUri: selectedThread?.request_uri,
        message,
        clientMessageId: pendingSend.clientMessageId,
        nativeSession: capturedNativeSession,
      });
      if (
        sent?.send_delivery_state === 'stored' ||
        sent?.send_delivery_state === 'delivered' ||
        sent?.send_delivery_state === 'queued'
      ) {
        clearPendingTextSend();
        if (sendSessionStillCurrent()) {
          const savedDraft =
            nativeChatDraftsRef.current.get(pendingSend.threadToken) || '';
          if (savedDraft.trim() === message) {
            nativeChatDraftsRef.current.set(pendingSend.threadToken, '');
            if (sendThreadStillSelected()) {
              setNativeChatDraft((current) =>
                current.trim() === message ? '' : current,
              );
            }
          }
        }
        if (
          sent.send_delivery_state === 'queued' &&
          sendThreadStillSelected()
        ) {
          setNativeChatNotice('Message saved and queued for website delivery.');
        }
      } else if (sent?.send_delivery_state === 'failed') {
        // A confirmed terminal failure is safe to retry as a new operation.
        // Keep the id only for ambiguous transport/no-response outcomes.
        clearPendingTextSend();
        if (sendThreadStillSelected()) {
          setNativeChatError(
            sent.send_delivery_error ||
              'Message delivery failed. Your draft is still here so you can try again.',
          );
        }
      } else if (sent && sendThreadStillSelected()) {
        setNativeChatError(
          sent.send_delivery_error ||
            'WeddingWin could not confirm delivery. Your draft is still here so you can try again.',
        );
      }
    } finally {
      if (nativeChatSendInFlightRef.current === sendOperationId) {
        nativeChatSendInFlightRef.current = null;
        setNativeChatSending(false);
      }
    }
  }, [
    nativeChatDraft,
    nativeChatThreads,
    selectedChatThreadToken,
    syncNativeChat,
  ]);

  const sendNativeChatImage = useCallback(async () => {
    if (
      nativeChatImagePickerInFlightRef.current ||
      nativeChatSendInFlightRef.current ||
      nativeChatReportInFlightRef.current
    )
      return;
    if (!nativeChatImagesEnabled) {
      setNativeChatError(nativeChatImagesNotice || CHAT_IMAGES_DISABLED_NOTICE);
      return;
    }
    if (!selectedChatThreadToken) return;
    const sendThreadToken = selectedChatThreadToken;
    const sendSessionGeneration = nativeSessionGenerationRef.current;
    const sendNativeSession = nativeBridgeSessionRef.current;
    if (!hasNativeBridgeSession(sendNativeSession)) return;
    const capturedNativeSession = sendNativeSession as NativeBridgeSession;
    const pendingSendKey = `${capturedNativeSession.user_id}:${sendThreadToken}`;

    const selectedThread = nativeChatThreads.find(
      (thread) => thread.token === sendThreadToken,
    );
    if (selectedThread?.closed || selectedThread?.reported) {
      setNativeChatError(selectedThread.report_notice || CHAT_REPORTED_NOTICE);
      return;
    }

    const imageOperationId = Crypto.randomUUID();
    nativeChatImagePickerInFlightRef.current = imageOperationId;
    const imageOperationStillCurrent = () =>
      nativeChatImagePickerInFlightRef.current === imageOperationId &&
      nativeSessionGenerationRef.current === sendSessionGeneration &&
      nativeBridgeSessionRef.current?.user_id === capturedNativeSession.user_id;
    try {
      // iOS uses the system PHPicker here, so WeddingWin receives only the
      // photo the user selects instead of requesting broad library access.
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: false,
        quality: 1,
      });
      if (!imageOperationStillCurrent()) return;
      if (result.canceled) return;

      const asset = result.assets[0];
      if (!asset?.uri) {
        Alert.alert('Photo unavailable', 'Please choose a different photo.');
        return;
      }

      const resizeFor = (maxSide: number) => {
        const width = Number(asset.width || 0);
        const height = Number(asset.height || 0);
        if (width <= maxSide && height <= maxSide) return [];
        return [
          {
            resize: width >= height ? { width: maxSide } : { height: maxSide },
          },
        ];
      };
      const processPhoto = (maxSide: number, compress: number) =>
        ImageManipulator.manipulateAsync(asset.uri, resizeFor(maxSide), {
          base64: true,
          compress,
          format: ImageManipulator.SaveFormat.JPEG,
        });

      if (nativeChatSendInFlightRef.current) return;
      nativeChatSendInFlightRef.current = imageOperationId;
      setNativeChatSending(true);
      if (selectedChatThreadTokenRef.current === sendThreadToken) {
        setNativeChatError(null);
        setNativeChatNotice(null);
      }

      const captionDraft = nativeChatDraft;
      let imageDataUri = '';
      for (const option of CHAT_IMAGE_PREPARE_OPTIONS) {
        const prepared = await processPhoto(option.maxSide, option.compress);
        if (!imageOperationStillCurrent()) return;
        imageDataUri = prepared.base64
          ? `data:image/jpeg;base64,${prepared.base64}`
          : '';
        if (
          imageDataUri &&
          imageDataUri.length <= CHAT_IMAGE_MAX_DATA_URI_LENGTH
        )
          break;
      }
      if (
        !imageDataUri ||
        imageDataUri.length > CHAT_IMAGE_MAX_DATA_URI_LENGTH
      ) {
        Alert.alert(
          'Photo is too large',
          'Please choose a smaller photo and try again.',
        );
        return;
      }
      if (!imageOperationStillCurrent()) return;

      const imageDigest = await Crypto.digestStringAsync(
        Crypto.CryptoDigestAlgorithm.SHA256,
        `${capturedNativeSession.user_id}:${sendThreadToken}:${imageDataUri}`,
      );
      if (!imageOperationStillCurrent()) return;
      const pendingImageForThread =
        nativeChatPendingImageSendsRef.current.get(pendingSendKey);
      const pendingImage =
        pendingImageForThread?.signature === imageDigest &&
        Date.now() - pendingImageForThread.createdAt < 5 * 60_000
          ? pendingImageForThread
          : {
              threadToken: sendThreadToken,
              signature: imageDigest,
              clientMessageId: Crypto.randomUUID(),
              createdAt: Date.now(),
            };
      nativeChatPendingImageSendsRef.current.set(pendingSendKey, pendingImage);
      const sendSessionStillCurrent = () =>
        nativeSessionGenerationRef.current === sendSessionGeneration &&
        nativeBridgeSessionRef.current?.user_id ===
          capturedNativeSession.user_id;
      const sendThreadStillSelected = () =>
        sendSessionStillCurrent() &&
        selectedChatThreadTokenRef.current === pendingImage.threadToken;
      const clearPendingImageSend = () => {
        if (
          nativeChatPendingImageSendsRef.current.get(pendingSendKey)
            ?.clientMessageId === pendingImage.clientMessageId
        ) {
          nativeChatPendingImageSendsRef.current.delete(pendingSendKey);
        }
      };
      const sent = await syncNativeChat('send', {
        threadToken: pendingImage.threadToken,
        threadId: selectedThread?.thread_id || selectedThread?.id,
        threadTitle: selectedThread?.title,
        requestUri: selectedThread?.request_uri,
        message: captionDraft.trim(),
        imageDataUri,
        clientMessageId: pendingImage.clientMessageId,
        nativeSession: capturedNativeSession,
      });
      if (
        sent?.send_delivery_state === 'stored' ||
        sent?.send_delivery_state === 'delivered' ||
        sent?.send_delivery_state === 'queued'
      ) {
        clearPendingImageSend();
        if (sendSessionStillCurrent()) {
          const savedDraft =
            nativeChatDraftsRef.current.get(pendingImage.threadToken) || '';
          if (savedDraft === captionDraft) {
            nativeChatDraftsRef.current.set(pendingImage.threadToken, '');
            if (sendThreadStillSelected()) {
              setNativeChatDraft((current) =>
                current === captionDraft ? '' : current,
              );
            }
          }
        }
        if (
          sent.send_delivery_state === 'queued' &&
          sendThreadStillSelected()
        ) {
          setNativeChatNotice('Photo saved and queued for website delivery.');
        }
      } else if (sent?.send_delivery_state === 'failed') {
        clearPendingImageSend();
        if (sendThreadStillSelected()) {
          setNativeChatError(
            sent.send_delivery_error ||
              'Photo delivery failed. Please try again.',
          );
        }
      } else if (sent && sendThreadStillSelected()) {
        setNativeChatError(
          sent.send_delivery_error ||
            'WeddingWin could not confirm photo delivery. Please try again.',
        );
      }
    } catch (error) {
      if (
        imageOperationStillCurrent() &&
        selectedChatThreadTokenRef.current === sendThreadToken
      ) {
        setNativeChatError(
          error instanceof Error
            ? error.message
            : 'The photo could not be prepared. Please try again.',
        );
      }
    } finally {
      if (nativeChatImagePickerInFlightRef.current === imageOperationId) {
        nativeChatImagePickerInFlightRef.current = null;
      }
      if (nativeChatSendInFlightRef.current === imageOperationId) {
        nativeChatSendInFlightRef.current = null;
        setNativeChatSending(false);
      }
    }
  }, [
    nativeChatDraft,
    nativeChatImagesEnabled,
    nativeChatImagesNotice,
    nativeChatThreads,
    selectedChatThreadToken,
    syncNativeChat,
  ]);

  const reportNativeChatConversation = useCallback(() => {
    if (
      nativeChatReportInFlightRef.current ||
      nativeChatSendInFlightRef.current ||
      nativeChatImagePickerInFlightRef.current
    )
      return;
    if (!selectedChatThreadToken) {
      Alert.alert(
        'Choose a conversation',
        'Select a message thread before reporting it.',
      );
      return;
    }

    const reportThreadToken = selectedChatThreadToken;
    const selectedThread = nativeChatThreads.find(
      (thread) => thread.token === reportThreadToken,
    );
    if (selectedThread?.closed || selectedThread?.reported) {
      Alert.alert(
        'Chat already reported',
        selectedThread.report_notice || CHAT_REPORTED_NOTICE,
      );
      return;
    }

    nativeChatReportInFlightRef.current = 'confirm';
    Alert.alert(
      'Report and block this member?',
      'WeddingWin will close this conversation, block new conversations between these accounts, and review your report. Neither party can continue messaging through the app while the block is active.',
      [
        {
          text: 'Cancel',
          style: 'cancel',
          onPress: () => {
            nativeChatReportInFlightRef.current = null;
          },
        },
        {
          text: 'Report & Block',
          style: 'destructive',
          onPress: async () => {
            if (nativeChatReportInFlightRef.current !== 'confirm') return;
            nativeChatReportInFlightRef.current = 'request';
            setNativeChatReporting(true);
            try {
              // Use the mirror-backed report action so the member block,
              // report aliases, and durable website-close outbox row are
              // committed together before the UI confirms success.
              const reported = await syncNativeChat('report', {
                threadToken: reportThreadToken,
                fallbackToWebsite: false,
              });
              if (!reported?.selected_thread_reported) {
                throw new Error(reported?.error || 'Chat report failed.');
              }
              const notice = reported.report_notice || CHAT_REPORTED_NOTICE;
              nativeChatDraftsRef.current.set(reportThreadToken, '');
              if (selectedChatThreadTokenRef.current === reportThreadToken) {
                setNativeChatDraft('');
                setNativeChatError(null);
              }
              Alert.alert('Member blocked and chat reported', notice);
            } catch (error) {
              const message =
                error instanceof Error ? error.message : 'Chat report failed.';
              if (selectedChatThreadTokenRef.current === reportThreadToken) {
                setNativeChatError(message);
              } else {
                Alert.alert('Report not completed', message);
              }
            } finally {
              nativeChatReportInFlightRef.current = null;
              setNativeChatReporting(false);
            }
          },
        },
      ],
    );
  }, [nativeChatThreads, selectedChatThreadToken, syncNativeChat]);

  const refreshChatStatus = useCallback(() => {
    let activeNativeSession = logoutInFlightRef.current
      ? null
      : nativeBridgeSessionRef.current;
    if (!hasNativeBridgeSession(activeNativeSession)) {
      chatStatusRequestGenerationRef.current += 1;
      chatStatusInFlightRef.current = null;
      setChatUnreadCount(0);
      setChatStatusLabel('Synced with website chat');
      setChatInboxPath(DEFAULT_CHAT_INBOX_PATH);
      chatUnreadSnapshotRef.current = null;
      return Promise.resolve();
    }
    const existingRequest = chatStatusInFlightRef.current;
    if (existingRequest) return existingRequest;

    const requestGeneration = chatStatusRequestGenerationRef.current + 1;
    chatStatusRequestGenerationRef.current = requestGeneration;
    const initialStatusSession = activeNativeSession as NativeBridgeSession;
    const statusUserId = String(initialStatusSession.user_id || '');
    const activeThreadToken = nativeChatThreadOpenRef.current
      ? selectedChatThreadTokenRef.current
      : '';
    const requestIsCurrent = () =>
      chatStatusRequestGenerationRef.current === requestGeneration &&
      !logoutInFlightRef.current &&
      String(nativeBridgeSessionRef.current?.user_id || '') === statusUserId &&
      (nativeChatThreadOpenRef.current
        ? selectedChatThreadTokenRef.current
        : '') === activeThreadToken;

    const request = (async () => {
      try {
        const requestStatus = async (session: NativeBridgeSession) => {
          const controller = new AbortController();
          const timeout = setTimeout(
            () => controller.abort(),
            WEBSITE_BRIDGE_REQUEST_TIMEOUT_MS,
          );
          try {
            return await fetch(
              `${APP_BACKEND_URL}/functions/v1/bd-chat-status`,
              {
                method: 'POST',
                signal: controller.signal,
                headers: {
                  Authorization: `Bearer ${APP_BACKEND_PUBLISHABLE_KEY}`,
                  apikey: APP_BACKEND_PUBLISHABLE_KEY,
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  native_session: session,
                  active_thread_token: activeThreadToken,
                }),
              },
            );
          } finally {
            clearTimeout(timeout);
          }
        };

        let response = await requestStatus(initialStatusSession);
        let data = (await response.json()) as ChatStatus & {
          ok?: boolean;
          error?: string;
        };
        if (!requestIsCurrent()) return;

        if (
          !response.ok &&
          /native session expired/i.test(String(data?.error || ''))
        ) {
          const refreshedSession =
            await refreshNativeBridgeSession(activeNativeSession);
          if (!requestIsCurrent()) return;
          if (hasNativeBridgeSession(refreshedSession)) {
            activeNativeSession = refreshedSession as NativeBridgeSession;
            response = await requestStatus(activeNativeSession);
            data = (await response.json()) as ChatStatus & {
              ok?: boolean;
              error?: string;
            };
            if (!requestIsCurrent()) return;
          }
        }

        if (!response.ok || data?.ok === false) {
          setChatStatusLabel('Website chat sync paused');
          return;
        }

        const nextUnread = Number(data.unread_count || 0);
        const unreadCount = Number.isFinite(nextUnread) ? nextUnread : 0;
        const storedUnread = await SecureStore.getItemAsync(
          CHAT_UNREAD_SESSION_KEY,
        );
        if (!requestIsCurrent()) return;
        const storedSnapshot =
          storedUnread !== null && Number.isFinite(Number(storedUnread))
            ? Number(storedUnread)
            : null;

        if (chatUnreadSnapshotRef.current === null) {
          chatUnreadSnapshotRef.current = storedSnapshot ?? unreadCount;
        }

        if (
          !nativeChatThreadOpenRef.current &&
          unreadCount > chatUnreadSnapshotRef.current
        ) {
          playChatNotificationCue();
        }

        chatUnreadSnapshotRef.current = unreadCount;
        SecureStore.setItemAsync(
          CHAT_UNREAD_SESSION_KEY,
          String(unreadCount),
        ).catch(() => {});
        setChatUnreadCount(unreadCount);
        updateAppBadge(unreadCount);
        setChatInboxPath(data.inbox_path || DEFAULT_CHAT_INBOX_PATH);
        setChatStatusLabel(
          unreadCount > 0
            ? `${unreadCount} new message${unreadCount === 1 ? '' : 's'} waiting`
            : data.latest_label || 'No new messages',
        );
      } catch {
        if (requestIsCurrent()) setChatStatusLabel('Website chat sync paused');
      }
    })().finally(() => {
      if (chatStatusInFlightRef.current === request) {
        chatStatusInFlightRef.current = null;
      }
    });
    chatStatusInFlightRef.current = request;
    return request;
  }, [playChatNotificationCue, refreshNativeBridgeSession, updateAppBadge]);

  useEffect(() => {
    chatStatusRequestGenerationRef.current += 1;
    chatStatusInFlightRef.current = null;
    if (!hasNativeBridgeSession(nativeBridgeSession)) {
      setChatUnreadCount(0);
      setChatStatusLabel('Synced with website chat');
      setChatInboxPath(DEFAULT_CHAT_INBOX_PATH);
      chatUnreadSnapshotRef.current = null;
      return;
    }

    let alive = true;
    const run = () => {
      if (!alive) return;
      refreshChatStatus();
    };

    run();
    const poll = setInterval(run, CHAT_STATUS_POLL_MS);

    return () => {
      alive = false;
      clearInterval(poll);
    };
  }, [nativeBridgeSession, refreshChatStatus]);

  useEffect(() => {
    if (!showNativeChat) return;
    const poll = setInterval(() => {
      if (
        nativeChatSendInFlightRef.current ||
        nativeChatReportInFlightRef.current ||
        nativeChatVisibleAbortControllerRef.current
      )
        return;
      if (
        nativeChatThreadOpenRef.current &&
        selectedChatThreadTokenRef.current
      ) {
        syncNativeChat('read', {
          threadToken: selectedChatThreadTokenRef.current,
          quiet: true,
        });
        return;
      }

      syncNativeChat('list', { quiet: true });
    }, CHAT_STATUS_POLL_MS);

    return () => clearInterval(poll);
  }, [showNativeChat, syncNativeChat]);

  const runNativeAppleLogin = useCallback(
    async (role: SignupRole = 'couple', consent?: SignupConsent) => {
      if (Platform.OS !== 'ios') {
        Alert.alert(
          'Apple sign-in unavailable',
          'Sign in with Apple is available on iPhone.',
        );
        return;
      }

      const authGeneration = beginAuthOperation('apple-login');
      if (authGeneration === null) return;
      try {
        const available = await AppleAuthentication.isAvailableAsync();
        if (!authOperationIsCurrent('apple-login', authGeneration)) return;
        if (!available) {
          Alert.alert(
            'Apple sign-in unavailable',
            'This device is not ready for Sign in with Apple.',
          );
          return;
        }

        const credential = await AppleAuthentication.signInAsync({
          requestedScopes: [
            AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
            AppleAuthentication.AppleAuthenticationScope.EMAIL,
          ],
        });
        if (!authOperationIsCurrent('apple-login', authGeneration)) return;

        if (!credential.identityToken) {
          Alert.alert(
            'Apple sign-in failed',
            'Apple did not return a sign-in token.',
          );
          return;
        }

        const { response, data } = await fetchAppJsonWithTimeout<any>(
          `${APP_BACKEND_URL}/functions/v1/apple-native-login`,
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${APP_BACKEND_PUBLISHABLE_KEY}`,
              apikey: APP_BACKEND_PUBLISHABLE_KEY,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              id_token: credential.identityToken,
              apple_user: credential.user,
              email: credential.email,
              given_name: credential.fullName?.givenName,
              family_name: credential.fullName?.familyName,
              redirect_to: TARGET_URL,
              subscription_id: membershipPlanForRole(role),
              accepted_terms: consent?.acceptedTerms || false,
              accepted_privacy: consent?.acceptedPrivacy || false,
              accepted_at: consent?.acceptedAt || '',
              terms_version: consent?.termsVersion || '',
              privacy_version: consent?.privacyVersion || '',
              client_context: {
                appOwnership: Constants.appOwnership,
                platform: Platform.OS,
                nativeAppVersion: Constants.nativeAppVersion,
                runtimeVersion: Constants.expoConfig?.runtimeVersion,
              },
            }),
          },
          'Apple sign-in took too long. Check your connection and try again.',
        );
        if (!authOperationIsCurrent('apple-login', authGeneration)) return;
        if (
          !response.ok ||
          !data?.user?.email ||
          !hasNativeTokenSession(data?.native_session)
        ) {
          const diagnostic = data?.diagnostic_id
            ? `\n\nDiagnostic: ${data.diagnostic_id}`
            : '';
          Alert.alert(
            'Apple sign-in failed',
            `${data?.error || 'WeddingWin could not create a secure app session. Please try again.'}${diagnostic}`,
          );
          return;
        }

        saveNativeSession(data.user, data.native_session, role);
        hideWebsiteBrowser();
      } catch (e) {
        if (!authOperationIsCurrent('apple-login', authGeneration)) return;
        const code =
          e && typeof e === 'object' && 'code' in e ? String(e.code) : '';
        if (code === 'ERR_REQUEST_CANCELED') return;
        Alert.alert('Apple sign-in failed', 'Please try again.');
      } finally {
        finishAuthOperation('apple-login', authGeneration);
      }
    },
    [
      authOperationIsCurrent,
      beginAuthOperation,
      finishAuthOperation,
      hideWebsiteBrowser,
      saveNativeSession,
    ],
  );

  const runOAuthInSystemBrowser = useCallback(
    async (authUrl: string) => {
      if (browserAuthInFlightRef.current) return;
      browserAuthInFlightRef.current = true;
      const navigationIntent = beginNavigationIntent();
      try {
        const result = await WebBrowser.openAuthSessionAsync(
          authUrl,
          OAUTH_RETURN_URL,
          { showInRecents: true },
        );

        if (
          result.type !== 'success' ||
          !result.url ||
          navigationIntentGenerationRef.current !== navigationIntent
        )
          return;

        webviewRef.current?.injectJavaScript(
          `setTimeout(function(){ window.location.href = ${JSON.stringify(result.url)}; }, 0); true;`,
        );
      } catch {
        // user dismissed or system browser failed; leave WebView as-is
      } finally {
        browserAuthInFlightRef.current = false;
      }
    },
    [beginNavigationIntent],
  );

  const runBdGoogleLoginInSystemBrowser = useCallback(
    async (role: SignupRole = 'couple', consent?: SignupConsent) => {
      if (browserAuthInFlightRef.current) return;
      const authGeneration = beginAuthOperation('google-login');
      if (authGeneration === null) return;
      browserAuthInFlightRef.current = true;
      const returnUrl = AuthSession.makeRedirectUri({
        scheme: 'weddingwin',
        path: BD_GOOGLE_RETURN_PATH,
      });

      setGoogleLoginLoading(true);
      try {
        const { codeVerifier, codeChallenge } = await createGooglePkcePair();
        if (!authOperationIsCurrent('google-login', authGeneration)) return;
        const result = await WebBrowser.openAuthSessionAsync(
          buildNativeGoogleStartUrl(returnUrl, role, codeChallenge, consent),
          returnUrl,
          { showInRecents: true },
        );

        if (
          result.type !== 'success' ||
          !result.url ||
          !authOperationIsCurrent('google-login', authGeneration)
        )
          return;

        const callbackUrl = new URL(result.url);
        const errorMessage =
          callbackUrl.searchParams.get('error_description') ||
          callbackUrl.searchParams.get('error');
        if (errorMessage) {
          Alert.alert('Google sign-in failed', errorMessage);
          return;
        }

        const exchangeCode = callbackUrl.searchParams.get('exchange_code');
        if (!exchangeCode) {
          Alert.alert(
            'Google sign-in failed',
            'WeddingWin could not finish the app login session.',
          );
          return;
        }

        const { response: exchangeResponse, data: exchange } =
          await fetchAppJsonWithTimeout<any>(
            `${APP_BACKEND_URL}/functions/v1/google-native-exchange`,
            {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${APP_BACKEND_PUBLISHABLE_KEY}`,
                apikey: APP_BACKEND_PUBLISHABLE_KEY,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                code: exchangeCode,
                code_verifier: codeVerifier,
              }),
            },
            'Google sign-in took too long. Check your connection and try again.',
          );
        if (!authOperationIsCurrent('google-login', authGeneration)) return;
        if (
          !exchangeResponse.ok ||
          !exchange?.ok ||
          !exchange?.user?.email ||
          !hasNativeTokenSession(exchange?.native_session)
        ) {
          Alert.alert(
            'Google sign-in failed',
            exchange?.error ||
              'The secure Google login exchange expired. Please try again.',
          );
          return;
        }

        addDebugLine('Google login ok -> one-time native exchange');
        saveNativeSession(exchange.user, exchange.native_session, role);
        hideWebsiteBrowser();
      } catch {
        if (authOperationIsCurrent('google-login', authGeneration)) {
          Alert.alert(
            'Google sign-in failed',
            'Please check your connection and try again.',
          );
        }
      } finally {
        browserAuthInFlightRef.current = false;
        if (authOperationIsCurrent('google-login', authGeneration)) {
          setGoogleLoginLoading(false);
          finishAuthOperation('google-login', authGeneration);
        }
      }
    },
    [
      addDebugLine,
      authOperationIsCurrent,
      beginAuthOperation,
      finishAuthOperation,
      hideWebsiteBrowser,
      saveNativeSession,
    ],
  );

  const applyChatPageChrome = useCallback(() => {
    webviewRef.current?.injectJavaScript(`
(function() {
  try {
    var path = window.location.pathname.replace(/\\/+$/, '') || '/';
    var isChat = path === '/account/chat_messages' ||
      path.indexOf('/account/chat_messages/view/') === 0 ||
      path === '/account/chat/messages' ||
      path.indexOf('/account/chat/messages/view/') === 0;
    document.documentElement.classList.toggle('ww-app-chat-page', isChat);
    document.body && document.body.classList.toggle('ww-app-chat-page', isChat);
    var id = 'ww-app-chat-page-style';
    var style = document.getElementById(id);
    if (!isChat) {
      if (style && style.parentNode) style.parentNode.removeChild(style);
      return true;
    }
    if (!style) {
      style = document.createElement('style');
      style.id = id;
      document.head.appendChild(style);
    }
    style.textContent = [
      'html.ww-app-chat-page, body.ww-app-chat-page { background: #fff !important; padding: 0 !important; margin: 0 !important; overflow-x: hidden !important; }',
      'body.ww-app-chat-page header, body.ww-app-chat-page footer, body.ww-app-chat-page #header, body.ww-app-chat-page #footer, body.ww-app-chat-page .header, body.ww-app-chat-page .footer, body.ww-app-chat-page .navbar, body.ww-app-chat-page .navbar-fixed-top, body.ww-app-chat-page .navbar-fixed-bottom, body.ww-app-chat-page .mobile-main-menu, body.ww-app-chat-page .mobile-main-menu-wrapper, body.ww-app-chat-page .breadcrumb, body.ww-app-chat-page .breadcrumbs { display: none !important; }',
      'body.ww-app-chat-page #main-content, body.ww-app-chat-page main, body.ww-app-chat-page .main-content, body.ww-app-chat-page .container, body.ww-app-chat-page .container-fluid { width: 100% !important; max-width: none !important; margin: 0 !important; padding-left: 0 !important; padding-right: 0 !important; }',
      'body.ww-app-chat-page .row { margin-left: 0 !important; margin-right: 0 !important; }',
      'body.ww-app-chat-page [class*="col-"] { padding-left: 0 !important; padding-right: 0 !important; }',
      'body.ww-app-chat-page input, body.ww-app-chat-page textarea, body.ww-app-chat-page button { font-size: 16px !important; }'
    ].join('\\n');
  } catch (e) {}
  return true;
})();
true;
`);
  }, []);

  const handleShouldStart = useCallback(
    (request: ShouldStartLoadRequest) => {
      const { url } = request;
      const hasSignedInAppSession = Boolean(
        nativeMember || hasNativeBridgeSession(nativeBridgeSessionRef.current),
      );
      const weddingWinPath = getWeddingWinPath(url);

      if (weddingWinPath) {
        addDebugLine(`should start ${weddingWinPath}`);
      }

      if (
        hasSignedInAppSession &&
        (isBdAppGoogleLoginUrl(url) ||
          isOAuthStartUrl(url) ||
          isGoogleIdentityUrl(url))
      ) {
        addDebugLine('blocked signed-in website authentication request');
        setLoading(false);
        return false;
      }

      if (request.isTopFrame === false) {
        const allowed = webViewSubframeUrlAllowed(url);
        if (!allowed) {
          addDebugLine('blocked insecure or active-content WebView subframe');
        }
        return allowed;
      }

      if (isWeddingWinLogoutActionUrl(url)) {
        finishLogoutInApp('website logout started');
        return true;
      }

      if (
        weddingWinPath.startsWith('/account') &&
        !nativeMember &&
        !hasNativeBridgeSession(nativeBridgeSession) &&
        !pendingBdFormLoginRef.current &&
        !pendingDashboardRedirect
      ) {
        addDebugLine('blocked signed-out account navigation');
        setLoading(false);
        const signedOutPath = signedOutRecoveryIntentRef.current
          ? '/login/retrieval'
          : '/login';
        const signedOutUrl = `${TARGET_URL}${signedOutPath}`;
        advanceWebViewSession();
        setCanGoBack(false);
        setCanGoForward(false);
        currentUrlRef.current = signedOutUrl;
        navigateWebViewTo(signedOutUrl);
        return false;
      }

      if (
        weddingWinPath &&
        isChatInboxPath(weddingWinPath) &&
        hasNativeBridgeSession(nativeBridgeSessionRef.current)
      ) {
        addDebugLine('intercept website chat deep link -> native chat');
        setLoading(false);
        void openNativeChatDeepLink(weddingWinPath);
        return false;
      }

      if (weddingWinPath && isVendorConnectPath(weddingWinPath)) {
        addDebugLine('intercept vendor connect -> native chat');
        setLoading(false);
        interceptVendorConnectChat(url);
        return false;
      }

      if (
        weddingWinPath === '/account/home' &&
        !pendingDashboardRedirect &&
        (nativeBridgeSession?.user_id || nativeMember?.email)
      ) {
        addDebugLine('intercept direct dashboard -> bridge');
        setLoading(false);
        openDashboardWithBridge();
        return false;
      }

      if (isBdAppGoogleLoginUrl(url)) {
        addDebugLine('intercept BD Google login');
        setLoading(false);
        runBdGoogleLoginInSystemBrowser();
        return false;
      }

      if (isOAuthStartUrl(url)) {
        addDebugLine('intercept OAuth authorize');
        setLoading(false);
        runOAuthInSystemBrowser(url);
        return false;
      }

      const navigationAction = webViewUrlAction(url);
      if (navigationAction === 'in-app') {
        return true;
      }
      if (navigationAction === 'system-browser' && isGoogleIdentityUrl(url)) {
        setLoading(false);
        addDebugLine('blocked unsolicited Google identity navigation');
        return false;
      }
      if (
        navigationAction === 'system-browser' ||
        navigationAction === 'external-app'
      ) {
        setLoading(false);
        Linking.openURL(url).catch(() => {});
        return false;
      }
      setLoading(false);
      addDebugLine('blocked non-allowlisted WebView navigation');
      return false;
    },
    [
      addDebugLine,
      advanceWebViewSession,
      finishLogoutInApp,
      nativeBridgeSession,
      nativeMember,
      navigateWebViewTo,
      openNativeChatDeepLink,
      openDashboardWithBridge,
      interceptVendorConnectChat,
      pendingDashboardRedirect,
      runBdGoogleLoginInSystemBrowser,
      runOAuthInSystemBrowser,
    ],
  );

  const handleNavigationStateChange = useCallback(
    (s: WebViewNavigation) => {
      currentUrlRef.current = s.url;
      setCanGoBack(s.canGoBack);
      setCanGoForward(s.canGoForward);
      setIsWedWebsiteSite(isWedWebsiteUrl(s.url));
      const weddingWinPath = getWeddingWinPath(s.url);
      if (
        weddingWinPath.startsWith('/login') &&
        weddingWinPath !== '/login/retrieval'
      ) {
        signedOutRecoveryIntentRef.current = false;
      }
      setIsChatPage(isChatInboxPath(weddingWinPath));

      if (weddingWinPath) {
        addDebugLine(`nav ${weddingWinPath}`);
      }

      if (
        weddingWinPath &&
        isChatInboxPath(weddingWinPath) &&
        hasNativeBridgeSession(nativeBridgeSessionRef.current)
      ) {
        addDebugLine('website chat deep link reached -> native chat');
        setLoading(false);
        void openNativeChatDeepLink(weddingWinPath);
        return;
      }

      if (weddingWinPath && isVendorConnectPath(weddingWinPath)) {
        addDebugLine('vendor connect reached -> native chat');
        setLoading(false);
        interceptVendorConnectChat(s.url);
        return;
      }

      if (isWeddingWinLoggedOutUrl(s.url)) {
        addDebugLine('BD logged-out URL seen');
        if (
          pendingBdFormLoginRef.current &&
          pendingBdFormLoginSubmittedRef.current
        ) {
          addDebugLine('BD form login returned to login');
          clearNativeSession();
          Alert.alert('Login failed', 'Please check your email and password.');
        } else if (
          pendingDashboardRedirect &&
          !isWeddingWinLogoutActionUrl(s.url)
        ) {
          addDebugLine(
            'BD logged-out URL seen during bridge; keeping native session',
          );
        } else {
          finishLogoutInApp(
            pendingAppLogoutRef.current
              ? 'app logout confirmed by website'
              : 'website logout finished',
          );
        }
      }

      if (
        pendingDashboardRedirect &&
        (weddingWinPath.startsWith('/login/fromsignup') ||
          weddingWinPath.startsWith('/login/token'))
      ) {
        addDebugLine('BD token route reached; waiting for BD login');
      } else if (
        pendingDashboardRedirect &&
        pendingBridgeTargetPath !== DEFAULT_BRIDGE_TARGET_PATH &&
        weddingWinPath.startsWith(pendingBridgeTargetPath)
      ) {
        addDebugLine(`bridge target reached ${pendingBridgeTargetPath}`);
        setPendingDashboardRedirect(false);
        setPendingBridgeTargetPath(DEFAULT_BRIDGE_TARGET_PATH);
      } else if (
        pendingDashboardRedirect &&
        weddingWinPath &&
        !weddingWinPath.startsWith('/app-login') &&
        !weddingWinPath.startsWith('/login') &&
        !weddingWinPath.startsWith('/account')
      ) {
        const bridgeTargetPath =
          pendingBridgeTargetPath || DEFAULT_BRIDGE_TARGET_PATH;
        addDebugLine(
          `bridge guard from ${weddingWinPath} to ${bridgeTargetPath}`,
        );
        setPendingDashboardRedirect(false);
        setPendingBridgeTargetPath(DEFAULT_BRIDGE_TARGET_PATH);
        webviewRef.current?.injectJavaScript(
          `setTimeout(function(){ window.location.replace(${JSON.stringify(`${TARGET_URL}${bridgeTargetPath}`)}); }, 0); true;`,
        );
      } else if (
        pendingDashboardRedirect &&
        pendingBridgeTargetPath !== DEFAULT_BRIDGE_TARGET_PATH &&
        weddingWinPath.startsWith('/account')
      ) {
        addDebugLine(`account bridge landing -> ${pendingBridgeTargetPath}`);
        setPendingDashboardRedirect(false);
        setPendingBridgeTargetPath(DEFAULT_BRIDGE_TARGET_PATH);
        webviewRef.current?.injectJavaScript(
          `setTimeout(function(){ window.location.replace(${JSON.stringify(`${TARGET_URL}${pendingBridgeTargetPath}`)}); }, 0); true;`,
        );
      } else if (weddingWinPath.startsWith('/account')) {
        addDebugLine('account page reached');
        requestWebsiteSessionBridge();
        const pendingLogin = pendingBdFormLoginRef.current;
        if (pendingLogin) {
          pendingBdFormLoginRef.current = null;
          pendingBdFormLoginSubmittedRef.current = false;
          const bridgedMember = withMemberRole(
            { email: pendingLogin.email },
            pendingLogin.role || 'couple',
          );
          commitNativeMember(bridgedMember);
        }
        setPendingDashboardRedirect(false);
        setPendingBridgeTargetPath(DEFAULT_BRIDGE_TARGET_PATH);
        applyChatPageChrome();
      }
    },
    [
      addDebugLine,
      applyChatPageChrome,
      clearNativeSession,
      commitNativeMember,
      finishLogoutInApp,
      interceptVendorConnectChat,
      openNativeChatDeepLink,
      pendingBridgeTargetPath,
      pendingDashboardRedirect,
      requestWebsiteSessionBridge,
    ],
  );

  const handleMessage = useCallback(
    (event: { nativeEvent: { data?: string; url?: string } }) => {
      const data = event.nativeEvent.data || '';
      if (!isTrustedWebsiteBridgeUrl(event.nativeEvent.url)) {
        addDebugLine('ignored untrusted WebView message');
        return;
      }
      if (data.startsWith('ww-bd-login:')) {
        addDebugLine(data);
        return;
      }

      try {
        const message = JSON.parse(data) as {
          type?: string;
          bridge_nonce?: string;
        };
        if (message.type === 'bd-app-login-cookies-set') {
          addDebugLine('BD bridge reported cookies set');
        } else if (message.type === 'bd-cookie-session') {
          if (logoutInFlightRef.current || pendingAppLogoutRef.current) {
            addDebugLine('ignored website session during logout');
            return;
          }
          if (
            !message.bridge_nonce ||
            message.bridge_nonce !== websiteBridgeNonceRef.current
          ) {
            addDebugLine('ignored stale WebView bridge response');
            return;
          }
          websiteBridgeNonceRef.current = '';
          const bridged = (message as { native_session?: NativeBridgeSession })
            .native_session;
          if (bridged?.user_id && (bridged.token || bridged.cookie)) {
            const confirmedBridge = bridged;
            const currentMemberId = String(nativeMember?.user_id || '').trim();
            const bridgedMemberId = String(
              confirmedBridge.user_id || '',
            ).trim();
            if (!currentMemberId || currentMemberId === bridgedMemberId) {
              const refreshedSession = {
                ...nativeBridgeSession,
                ...confirmedBridge,
                email:
                  confirmedBridge.email ||
                  nativeMember?.email ||
                  nativeBridgeSession?.email,
              };
              commitNativeBridgeSession(refreshedSession);
              const waiters = bridgeSessionWaitersRef.current.splice(0);
              waiters.forEach((resolve) => resolve(refreshedSession));
              addDebugLine('BD cookie session refreshed');
            }
          }
        } else if (message.type === 'bd-app-logout') {
          finishLogoutInApp('website logout message');
        }
      } catch {
        // Ignore unrelated website messages.
      }
    },
    [
      addDebugLine,
      commitNativeBridgeSession,
      finishLogoutInApp,
      nativeBridgeSession,
      nativeMember,
    ],
  );

  const handleOpenWindow = useCallback(
    (event: { nativeEvent: { targetUrl?: string } }) => {
      const target = event.nativeEvent.targetUrl;
      if (!target) return;
      const hasSignedInAppSession = Boolean(
        nativeMember || hasNativeBridgeSession(nativeBridgeSessionRef.current),
      );

      if (
        hasSignedInAppSession &&
        (isBdAppGoogleLoginUrl(target) ||
          isOAuthStartUrl(target) ||
          isGoogleIdentityUrl(target))
      ) {
        setLoading(false);
        addDebugLine('blocked signed-in website authentication window');
        return;
      }

      if (isBdAppGoogleLoginUrl(target)) {
        setLoading(false);
        runBdGoogleLoginInSystemBrowser();
        return;
      }

      if (isOAuthStartUrl(target)) {
        setLoading(false);
        runOAuthInSystemBrowser(target);
        return;
      }

      const navigationAction = webViewUrlAction(target);
      if (navigationAction === 'in-app' && target !== 'about:blank') {
        const weddingWinPath = getWeddingWinPath(target);
        if (weddingWinPath && isVendorConnectPath(weddingWinPath)) {
          setLoading(false);
          interceptVendorConnectChat(target);
          return;
        }

        if (
          weddingWinPath &&
          isChatInboxPath(weddingWinPath) &&
          hasNativeBridgeSession(nativeBridgeSessionRef.current)
        ) {
          setLoading(false);
          void openNativeChatDeepLink(weddingWinPath);
          return;
        }

        addDebugLine(`open window ${target.replace(TARGET_URL, '')}`);
        setError(null);
        startLoadingFeedback();
        setIsChatPage(isChatInboxPath(weddingWinPath));
        setIsWedWebsiteSite(isWedWebsiteUrl(target));
        currentUrlRef.current = target;
        navigateWebViewTo(target);
        return;
      }
      if (
        navigationAction === 'system-browser' &&
        isGoogleIdentityUrl(target)
      ) {
        setLoading(false);
        addDebugLine('blocked unsolicited Google identity window');
        return;
      }
      if (
        navigationAction === 'system-browser' ||
        navigationAction === 'external-app'
      ) {
        setLoading(false);
        Linking.openURL(target).catch(() => {});
        return;
      }
      setLoading(false);
      addDebugLine('blocked non-allowlisted WebView window');
    },
    [
      addDebugLine,
      interceptVendorConnectChat,
      nativeMember,
      navigateWebViewTo,
      openNativeChatDeepLink,
      runBdGoogleLoginInSystemBrowser,
      runOAuthInSystemBrowser,
      startLoadingFeedback,
    ],
  );

  const submitPendingBdFormLogin = useCallback(() => {
    const credentials = pendingBdFormLoginRef.current;
    if (!credentials) return;
    if (pendingBdFormLoginSubmittedRef.current) return;
    pendingBdFormLoginSubmittedRef.current = true;

    addDebugLine('inject BD login form submit');
    webviewRef.current?.injectJavaScript(`
(function() {
  try {
    var email = ${JSON.stringify(credentials.email)};
    var pass = ${JSON.stringify(credentials.password)};
    var form = document.querySelector('form[id^="member_login_"], form[name^="member_login_"]');
    if (!form) {
      window.ReactNativeWebView && window.ReactNativeWebView.postMessage('ww-bd-login:no-form');
      return true;
    }
    var emailInput = form.querySelector('input[name="email"]');
    var passInput = form.querySelector('input[name="pass"], input[name="password"]');
    if (!emailInput || !passInput) {
      window.ReactNativeWebView && window.ReactNativeWebView.postMessage('ww-bd-login:missing-fields');
      return true;
    }
    emailInput.value = email;
    passInput.value = pass;
    emailInput.dispatchEvent(new Event('input', { bubbles: true }));
    passInput.dispatchEvent(new Event('input', { bubbles: true }));
    var direct = form.querySelector('input[name="login_direct_url"]');
    if (!direct) {
      direct = document.createElement('input');
      direct.type = 'hidden';
      direct.name = 'login_direct_url';
      form.appendChild(direct);
    }
    direct.value = '/account/home';
    var origin = form.querySelector('input[name="url_origin_pars"]');
    if (origin) origin.value = '/account/home';
    setTimeout(function() {
      try {
        HTMLFormElement.prototype.submit.call(form);
      } catch (e) {
        form.submit();
      }
    }, 120);
  } catch (e) {
    window.ReactNativeWebView && window.ReactNativeWebView.postMessage('ww-bd-login:error:' + (e && e.message ? e.message : String(e)));
  }
  return true;
})();
true;
`);
  }, [addDebugLine]);

  useEffect(() => {
    return () => {
      invalidateNavigationIntent();
      if (historyNavigationTimerRef.current) {
        clearTimeout(historyNavigationTimerRef.current);
        historyNavigationTimerRef.current = null;
      }
      if (vendorConnectNativeTimerRef.current) {
        clearTimeout(vendorConnectNativeTimerRef.current);
        vendorConnectNativeTimerRef.current = null;
      }
      clearLoadingTimeout();
    };
  }, [clearLoadingTimeout, invalidateNavigationIntent]);

  const handleLoadStart = useCallback(() => {
    startLoadingFeedback();
  }, [startLoadingFeedback]);

  const handleLoadEnd = useCallback(() => {
    webViewReloadOwnerRef.current = null;
    clearLoadingTimeout();
    setLoading(false);
    applyChatPageChrome();
    const weddingWinPath = getWeddingWinPath(currentUrlRef.current);
    if (weddingWinPath && isVendorConnectPath(weddingWinPath)) {
      interceptVendorConnectChat(currentUrlRef.current);
      return;
    }
    if (weddingWinPath.startsWith('/account')) {
      requestWebsiteSessionBridge();
    }
    if (
      pendingBdFormLoginRef.current &&
      getWeddingWinPath(currentUrlRef.current) === '/login'
    ) {
      submitPendingBdFormLogin();
    }
  }, [
    applyChatPageChrome,
    clearLoadingTimeout,
    interceptVendorConnectChat,
    requestWebsiteSessionBridge,
    submitPendingBdFormLogin,
  ]);

  const handleError = useCallback(
    ({
      nativeEvent,
    }: {
      nativeEvent: { description?: string; code?: number; url?: string };
    }) => {
      if (nativeEvent.code === -999) return;
      const failedUrl = String(nativeEvent.url || '').trim();
      if (failedUrl && failedUrl !== currentUrlRef.current) return;
      webViewReloadOwnerRef.current = null;
      clearLoadingTimeout();
      setLoading(false);
      setError(nativeEvent.description || 'Connection failed');
    },
    [clearLoadingTimeout],
  );

  const reload = useCallback(() => {
    if (webViewReloadOwnerRef.current) return;
    const reloadOwner = Crypto.randomUUID();
    webViewReloadOwnerRef.current = reloadOwner;
    invalidateNavigationIntent();
    setError(null);
    startLoadingFeedback();
    webviewRef.current?.stopLoading();
    const reloadUrl =
      currentUrlRef.current || sourceUriRef.current || TARGET_URL;
    sourceUriRef.current = reloadUrl;
    setSourceUri(reloadUrl);
    // A new WebView instance gives the retry its own callback generation, so a
    // queued error from the failed instance cannot cover the retried page.
    advanceWebViewSession();
  }, [advanceWebViewSession, invalidateNavigationIntent, startLoadingFeedback]);

  const runHistoryNavigation = useCallback(
    (direction: 'back' | 'forward') => {
      if (historyNavigationTimerRef.current) {
        clearTimeout(historyNavigationTimerRef.current);
        historyNavigationTimerRef.current = null;
      }

      invalidateNavigationIntent();
      webViewReloadOwnerRef.current = null;
      clearLoadingTimeout();
      setError(null);
      setLoading(false);
      webviewRef.current?.stopLoading();

      historyNavigationTimerRef.current = setTimeout(() => {
        historyNavigationTimerRef.current = null;
        setLoading(true);
        if (direction === 'back') {
          webviewRef.current?.goBack();
        } else {
          webviewRef.current?.goForward();
        }
      }, 60);
    },
    [clearLoadingTimeout, invalidateNavigationIntent],
  );

  const goBackInBrowser = useCallback(() => {
    if (!canGoBack) return;
    runHistoryNavigation('back');
  }, [canGoBack, runHistoryNavigation]);

  const goForwardInBrowser = useCallback(() => {
    if (!canGoForward) return;
    runHistoryNavigation('forward');
  }, [canGoForward, runHistoryNavigation]);

  const signOutEverywhere = useCallback(async () => {
    if (accountDeletionIsInFlight()) return;
    if (finishLogoutInFlightRef.current) {
      await finishLogoutInFlightRef.current;
      return;
    }
    invalidateNavigationIntent();
    addDebugLine('sign out app + website');
    pendingAppLogoutRef.current = true;
    const logoutRequest = finishLogoutInApp('app logout requested');
    openAbsoluteUrl(`${WEBSITE_LOGOUT_URL}?ww_app_logout=${Date.now()}`);
    await logoutRequest;
  }, [
    addDebugLine,
    finishLogoutInApp,
    invalidateNavigationIntent,
    openAbsoluteUrl,
  ]);

  const openVendorDrawSettings = useCallback(() => {
    if (historyNavigationTimerRef.current) {
      clearTimeout(historyNavigationTimerRef.current);
      historyNavigationTimerRef.current = null;
    }
    clearLoadingTimeout();
    webviewRef.current?.stopLoading();
    setShowNativeChat(false);
    setNativeChatThreadOpen(false);
    setError(null);
    setLoading(false);
    hideWebsiteBrowser();
    setVendorDrawOpenRequestId((requestId) => requestId + 1);
  }, [clearLoadingTimeout, hideWebsiteBrowser]);

  const dismissWrappedWebsiteMenus = useCallback(() => {
    webviewRef.current?.injectJavaScript(`
(function() {
  try {
    var openMenuSelector = [
      '.mobile-main-menu.opened',
      '.mobile-main-menu.open',
      '.mobile-main-menu.show',
      'header .dropdown.open',
      '.header .dropdown.open',
      'nav .dropdown.open',
      '.mini-nav .open',
      'header .navbar-collapse.in',
      '.header .navbar-collapse.in',
      'nav .navbar-collapse.in',
      'header .navbar-collapse.show',
      '.header .navbar-collapse.show',
      'nav .navbar-collapse.show'
    ].join(',');

    document.querySelectorAll(openMenuSelector).forEach(function(node) {
      node.classList.remove('opened', 'open', 'show', 'in');
    });

    document.querySelectorAll(
      'header [aria-expanded="true"], .header [aria-expanded="true"], nav [aria-expanded="true"]'
    ).forEach(function(toggle) {
      toggle.setAttribute('aria-expanded', 'false');
      toggle.classList.add('collapsed');
    });

    if (document.activeElement && document.activeElement.blur) {
      document.activeElement.blur();
    }
  } catch (e) {}
})();
true;
`);
  }, []);

  const closeBrowserToApp = useCallback(() => {
    invalidateNavigationIntent();
    if (historyNavigationTimerRef.current) {
      clearTimeout(historyNavigationTimerRef.current);
      historyNavigationTimerRef.current = null;
    }
    clearLoadingTimeout();
    webviewRef.current?.stopLoading();
    dismissWrappedWebsiteMenus();
    Keyboard.dismiss();
    setPendingDashboardRedirect(false);
    setPendingBridgeTargetPath(DEFAULT_BRIDGE_TARGET_PATH);
    setLoading(false);
    setError(null);
    setIsChatPage(false);
    signedOutRecoveryIntentRef.current = false;
    hideWebsiteBrowser();
  }, [
    clearLoadingTimeout,
    dismissWrappedWebsiteMenus,
    hideWebsiteBrowser,
    invalidateNavigationIntent,
  ]);

  const runBottomNavigationAction = useCallback(
    (action: (navigationIntent?: number) => void | Promise<void>) => {
      const navigationIntent = beginNavigationIntent();
      if (historyNavigationTimerRef.current) {
        clearTimeout(historyNavigationTimerRef.current);
        historyNavigationTimerRef.current = null;
      }
      clearLoadingTimeout();
      setLoading(false);
      webviewRef.current?.stopLoading();
      dismissWrappedWebsiteMenus();
      bottomNavigationFrameRef.current = requestAnimationFrame(() => {
        bottomNavigationFrameRef.current = null;
        if (navigationIntentGenerationRef.current !== navigationIntent) return;
        void action(navigationIntent);
      });
    },
    [beginNavigationIntent, clearLoadingTimeout, dismissWrappedWebsiteMenus],
  );

  const openWebsiteBuilderFromBottomNav = useCallback(() => {
    runBottomNavigationAction(openWebsiteBuilderWithBridge);
  }, [openWebsiteBuilderWithBridge, runBottomNavigationAction]);

  const openDashboardFromBottomNav = useCallback(() => {
    runBottomNavigationAction(openDashboardWithBridge);
  }, [openDashboardWithBridge, runBottomNavigationAction]);

  const openChatFromBottomNav = useCallback(() => {
    runBottomNavigationAction(openChatWithBridge);
  }, [openChatWithBridge, runBottomNavigationAction]);

  const openQrScannerFromBottomNav = useCallback(() => {
    runBottomNavigationAction(openNativeQrScanner);
  }, [openNativeQrScanner, runBottomNavigationAction]);

  const openVendorDrawFromBottomNav = useCallback(() => {
    runBottomNavigationAction(openVendorDrawSettings);
  }, [openVendorDrawSettings, runBottomNavigationAction]);

  const renderLoading = useCallback(function renderLoading() {
    return (
      <View style={styles.loading} pointerEvents="none">
        <ActivityIndicator size="large" color={BRAND_COLOR} />
      </View>
    );
  }, []);

  const closeNativeChat = useCallback(() => {
    if (nativeChatReportInFlightRef.current === 'request') return;
    nativeChatRequestGenerationRef.current += 1;
    nativeChatLoadingGenerationRef.current =
      nativeChatRequestGenerationRef.current;
    setNativeChatLoading(false);
    nativeChatVisibleAbortControllerRef.current?.abort();
    nativeChatVisibleAbortControllerRef.current = null;
    setNativeChatNotice(null);
    setNativeChatOpenRequestId(0);
    setNativeChatThreadOpen(false);
    setShowNativeChat(false);
  }, []);

  const renderNativeChatOverlay = () =>
    showNativeChat ? (
      <View
        style={styles.nativeChatOverlay}
        accessibilityViewIsModal
        importantForAccessibility="yes"
        onAccessibilityEscape={closeNativeChat}
      >
        <NativeChatScreen
          member={nativeMember}
          nativeSession={nativeBridgeSession}
          threads={nativeChatThreads}
          messages={nativeChatMessages}
          selectedThreadToken={selectedChatThreadToken}
          loading={nativeChatLoading}
          sending={nativeChatSending}
          reporting={nativeChatReporting}
          error={nativeChatError}
          notice={nativeChatNotice}
          imagesEnabled={nativeChatImagesEnabled}
          imagesNotice={nativeChatImagesNotice}
          syncDebug={nativeChatSyncDebug}
          draft={nativeChatDraft}
          onDraftChange={updateNativeChatDraft}
          onSelectThread={selectNativeChatThread}
          onSend={sendNativeChatMessage}
          onAttachImage={sendNativeChatImage}
          onReport={reportNativeChatConversation}
          onRefresh={() => syncNativeChat('list')}
          onClose={closeNativeChat}
          onThreadViewChange={setNativeChatThreadOpen}
          chatUnreadCount={chatUnreadCount}
          openThreadRequestId={nativeChatOpenRequestId}
          openingConversationLabel={nativeChatOpeningLabel}
        />
      </View>
    ) : null;
  const nativeMemberIsCouple = isCoupleAccount(nativeMember);
  const logoutProgressOverlay = logoutLoading ? (
    <View
      style={styles.sessionTransitionOverlay}
      accessibilityViewIsModal
      accessibilityRole="progressbar"
      accessibilityLabel="Signing out of WeddingWin"
    >
      <View style={styles.sessionTransitionCard}>
        <ActivityIndicator size="large" color={BRAND_COLOR} />
        <Text style={styles.sessionTransitionText}>Finishing sign out...</Text>
      </View>
    </View>
  ) : null;

  if (!nativeSessionHydrated) {
    return (
      <View
        style={[styles.nativeShell, styles.chatCenteredState]}
        accessibilityRole="progressbar"
      >
        <ActivityIndicator size="large" color={BRAND_COLOR} />
        <Text style={styles.chatCenteredText}>Opening WeddingWin...</Text>
      </View>
    );
  }

  if (!showBrowser) {
    const nativeOverlayVisible = showNativeChat || showNativeQrScanner;
    return (
      <View style={styles.nativeShell}>
        <View
          style={styles.nativeHomeLayer}
          accessibilityElementsHidden={nativeOverlayVisible}
          importantForAccessibility={
            nativeOverlayVisible ? 'no-hide-descendants' : 'auto'
          }
        >
          <NativeHome
            onOpenUrl={openUrl}
            onOpenWebsiteBuilder={openWebsiteBuilderWithBridge}
            onOpenDashboard={openDashboardWithBridge}
            onOpenChat={openChatWithBridge}
            onRegisterVendorDrawCloser={registerVendorDrawCloser}
            onOpenQrScanner={openNativeQrScanner}
            qrContactCompletionRequested={qrContactCompletionRequested}
            onCancelQrContactCompletion={cancelQrContactCompletion}
            onAppleSignIn={runNativeAppleLogin}
            onGoogleSignIn={runBdGoogleLoginInSystemBrowser}
            onEmailLogin={runEmailLogin}
            onMemberSignup={runMemberSignup}
            onCompleteProfile={runCompleteProfile}
            googleLoginLoading={googleLoginLoading}
            emailLoginLoading={emailLoginLoading}
            signupLoading={signupLoading}
            profileSaveLoading={profileSaveLoading}
            member={nativeMember}
            chatUnreadCount={chatUnreadCount}
            chatStatusLabel={chatStatusLabel}
            websiteSessionReady={true}
            onSignOut={signOutEverywhere}
            nativeSession={nativeBridgeSession}
            vendorDrawOpenRequestId={vendorDrawOpenRequestId}
          />
        </View>
        {renderNativeChatOverlay()}
        <NativeQrScanner
          visible={showNativeQrScanner}
          onClose={() => setShowNativeQrScanner(false)}
          onScan={handleNativeQrScan}
          nativeSession={nativeBridgeSession}
          member={nativeMember}
          onCompleteContact={openQrContactCompletion}
        />
        {logoutProgressOverlay}
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.webContainer}>
        {isChatPage ? (
          <View style={styles.chatScreenHeader}>
            <TouchableOpacity
              style={styles.chatBackButton}
              activeOpacity={0.76}
              onPress={closeBrowserToApp}
              accessibilityRole="button"
              accessibilityLabel="Back to WeddingWin app"
            >
              <ChevronLeft size={24} color="#2E2E32" strokeWidth={2.2} />
            </TouchableOpacity>
            <View style={styles.chatScreenTitleWrap}>
              <Text style={styles.chatScreenTitle}>Messages</Text>
              <Text style={styles.chatScreenSubtitle}>WeddingWin chat</Text>
            </View>
            <View style={styles.chatHeaderSpacer} />
          </View>
        ) : null}
        <WebView
          key={`weddingwin-web-session-${webViewSessionKey}`}
          ref={webviewRef}
          source={{ uri: sourceUri }}
          userAgent={USER_AGENT}
          incognito
          cacheEnabled={false}
          sharedCookiesEnabled={false}
          thirdPartyCookiesEnabled={false}
          domStorageEnabled
          javaScriptEnabled
          allowsBackForwardNavigationGestures
          pullToRefreshEnabled
          startInLoadingState
          // Let every attempted navigation reach handleShouldStart. The
          // centralized webViewUrlAction policy then keeps trusted HTTPS in
          // app, routes approved external schemes out, and fails closed for
          // insecure or active-content URLs.
          originWhitelist={['*']}
          setSupportMultipleWindows
          allowsInlineMediaPlayback
          mediaPlaybackRequiresUserAction
          allowsPictureInPictureMediaPlayback={false}
          // The embedded site is for account management and chat, not media
          // capture. Deny camera/microphone requests so WebKit cannot surface
          // a permission prompt for capabilities the native app does not use
          // or declare in its App Store privacy metadata.
          mediaCapturePermissionGrantType="deny"
          javaScriptCanOpenWindowsAutomatically
          decelerationRate="normal"
          contentInsetAdjustmentBehavior="never"
          automaticallyAdjustContentInsets={false}
          keyboardDisplayRequiresUserAction={false}
          hideKeyboardAccessoryView
          injectedJavaScriptBeforeContentLoaded={CLOAK_INJECTION}
          containerStyle={
            !showNativeChat && (nativeMember || !isChatPage)
              ? styles.webviewWithCoupleBottomNav
              : undefined
          }
          onShouldStartLoadWithRequest={(request) =>
            webViewSessionGenerationRef.current === webViewSessionKey &&
            handleShouldStart(request)
          }
          onOpenWindow={(event) => {
            if (webViewSessionGenerationRef.current !== webViewSessionKey)
              return;
            handleOpenWindow(event);
          }}
          onNavigationStateChange={(state) => {
            if (webViewSessionGenerationRef.current !== webViewSessionKey)
              return;
            handleNavigationStateChange(state);
          }}
          onMessage={(event) => {
            if (webViewSessionGenerationRef.current !== webViewSessionKey)
              return;
            handleMessage(event);
          }}
          onLoadStart={() => {
            if (webViewSessionGenerationRef.current !== webViewSessionKey)
              return;
            handleLoadStart();
          }}
          onLoadEnd={() => {
            if (webViewSessionGenerationRef.current !== webViewSessionKey)
              return;
            handleLoadEnd();
          }}
          onError={(event) => {
            if (webViewSessionGenerationRef.current !== webViewSessionKey)
              return;
            handleError(event);
          }}
          renderLoading={renderLoading}
          style={[
            styles.webview,
            isWedWebsiteSite && !isChatPage && styles.wedWebsiteWebview,
          ]}
        />

        {!isChatPage ? (
          <View
            style={[
              styles.browserNavControls,
              isWedWebsiteSite && styles.browserNavControlsCompact,
            ]}
          >
            <TouchableOpacity
              style={[
                styles.browserNavButton,
                isWedWebsiteSite && styles.browserNavButtonCompact,
                !canGoBack && styles.browserNavButtonDisabled,
              ]}
              activeOpacity={0.76}
              disabled={!canGoBack}
              onPress={goBackInBrowser}
              accessibilityRole="button"
              accessibilityLabel="Go back"
            >
              <ChevronLeft
                size={isWedWebsiteSite ? 19 : 22}
                color={canGoBack ? '#2E2E32' : '#BFAFAA'}
                strokeWidth={2.4}
              />
            </TouchableOpacity>
            <View
              style={[
                styles.browserNavDivider,
                isWedWebsiteSite && styles.browserNavDividerCompact,
              ]}
            />
            <TouchableOpacity
              style={[
                styles.browserNavButton,
                isWedWebsiteSite && styles.browserNavButtonCompact,
                !canGoForward && styles.browserNavButtonDisabled,
              ]}
              activeOpacity={0.76}
              disabled={!canGoForward}
              onPress={goForwardInBrowser}
              accessibilityRole="button"
              accessibilityLabel="Go forward"
            >
              <ChevronRight
                size={isWedWebsiteSite ? 19 : 22}
                color={canGoForward ? '#2E2E32' : '#BFAFAA'}
                strokeWidth={2.4}
              />
            </TouchableOpacity>
          </View>
        ) : null}

        {error && (
          <View style={styles.errorView}>
            <AlertTriangle size={48} color={BRAND_COLOR} strokeWidth={1.5} />
            <Text style={styles.errorTitle}>Unable to load</Text>
            <Text style={styles.errorText}>{error}</Text>
            <TouchableOpacity
              onPress={reload}
              style={styles.retryButton}
              accessibilityRole="button"
              accessibilityLabel="Try loading again"
            >
              <Text style={styles.retryText}>Try Again</Text>
            </TouchableOpacity>
          </View>
        )}

        {loading && !error && (
          <View style={styles.topLoader} pointerEvents="none">
            <ActivityIndicator size="small" color={BRAND_COLOR} />
          </View>
        )}

        {nativeMember && nativeMemberIsCouple && !showNativeChat ? (
          <CoupleBottomNav
            onBackToApp={closeBrowserToApp}
            onOpenWebsiteBuilder={openWebsiteBuilderFromBottomNav}
            onOpenDashboard={openDashboardFromBottomNav}
            onOpenChat={openChatFromBottomNav}
            onOpenQrScanner={openQrScannerFromBottomNav}
            chatUnreadCount={chatUnreadCount}
          />
        ) : nativeMember && !showNativeChat ? (
          <VendorBottomNav
            onBackToApp={closeBrowserToApp}
            onOpenVendorDashboard={openDashboardFromBottomNav}
            onOpenChat={openChatFromBottomNav}
            onOpenVendorDraw={openVendorDrawFromBottomNav}
            chatUnreadCount={chatUnreadCount}
          />
        ) : !isChatPage && !showNativeChat ? (
          <TouchableOpacity
            testID="browser-bottom-nav-app"
            style={styles.browserReturnButton}
            activeOpacity={0.78}
            onPress={closeBrowserToApp}
            accessibilityRole="button"
            accessibilityLabel="Back to WeddingWin app"
          >
            <House size={20} color={BRAND_COLOR} strokeWidth={2.15} />
            <Text style={styles.coupleBottomNavLabel}>App</Text>
          </TouchableOpacity>
        ) : null}

        {renderNativeChatOverlay()}
        <NativeQrScanner
          visible={showNativeQrScanner}
          onClose={() => setShowNativeQrScanner(false)}
          onScan={handleNativeQrScan}
          nativeSession={nativeBridgeSession}
          member={nativeMember}
          onCompleteContact={openQrContactCompletion}
        />
        {logoutProgressOverlay}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  nativeContainer: {
    flex: 1,
    backgroundColor: '#FFF8F5',
  },
  nativeShell: {
    flex: 1,
    backgroundColor: '#FFF8F5',
  },
  nativeHomeLayer: {
    flex: 1,
  },
  nativeChatOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 80,
    elevation: 80,
    backgroundColor: '#FFF8F5',
  },
  sessionTransitionOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 120,
    elevation: 120,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 248, 245, 0.92)',
  },
  sessionTransitionCard: {
    minWidth: 190,
    paddingHorizontal: 24,
    paddingVertical: 22,
    alignItems: 'center',
    gap: 12,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#F1D9D5',
  },
  sessionTransitionText: {
    color: '#433A39',
    fontSize: 16,
    fontWeight: '700',
  },
  nativeContent: {
    flexGrow: 1,
  },
  loginBackdrop: {
    flex: 1,
    minHeight: '100%',
    paddingHorizontal: 22,
    paddingTop: 10,
    paddingBottom: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFF8F5',
  },
  loginBackdropCompact: {
    paddingHorizontal: 16,
    paddingTop: 5,
    paddingBottom: 5,
  },
  loginBackdropWithAnchoredSignOut: {
    paddingBottom: 64,
  },
  backdropWash: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255, 250, 247, 0.9)',
  },
  branch: {
    position: 'absolute',
    width: 96,
    height: 96,
    opacity: 0.28,
  },
  branchTopRight: {
    top: 0,
    right: -18,
    transform: [{ rotate: '-38deg' }],
  },
  branchBottomLeft: {
    bottom: -6,
    left: -34,
    transform: [{ rotate: '142deg' }],
  },
  branchStem: {
    position: 'absolute',
    left: 46,
    top: 8,
    width: 1.5,
    height: 88,
    backgroundColor: '#E7A3A0',
    borderRadius: 1,
  },
  leaf: {
    position: 'absolute',
    width: 18,
    height: 29,
    borderTopLeftRadius: 18,
    borderBottomRightRadius: 18,
    borderWidth: 1,
    borderColor: '#E7A3A0',
    backgroundColor: 'rgba(231, 163, 160, 0.16)',
  },
  leafOne: {
    top: 18,
    left: 52,
    transform: [{ rotate: '34deg' }],
  },
  leafTwo: {
    top: 39,
    left: 28,
    transform: [{ rotate: '-42deg' }],
  },
  leafThree: {
    top: 62,
    left: 53,
    transform: [{ rotate: '34deg' }],
  },
  logoWrap: {
    width: '88%',
    maxWidth: 300,
    height: 82,
    marginTop: 0,
    marginBottom: 2,
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  logoWrapCompact: {
    maxWidth: 218,
    height: 48,
    marginBottom: 0,
  },
  brandLogo: {
    width: '100%',
    height: 72,
  },
  brandLogoCompact: {
    height: 48,
  },
  countryLabel: {
    position: 'absolute',
    left: 0,
    bottom: 0,
    color: BRAND_COLOR,
    fontSize: 10,
    lineHeight: 12,
    fontWeight: '800',
    letterSpacing: 0,
  },
  tagline: {
    color: '#38383D',
    fontSize: 14,
    lineHeight: 18,
    marginTop: 0,
    textAlign: 'center',
    fontWeight: '500',
  },
  pathWizard: {
    width: '100%',
    maxWidth: 382,
    alignItems: 'center',
    marginTop: 12,
    zIndex: 2,
  },
  pathTitle: {
    color: '#2F3036',
    fontSize: 32,
    lineHeight: 37,
    fontWeight: '500',
    textAlign: 'center',
  },
  pathDivider: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    marginTop: 6,
    marginBottom: 6,
  },
  pathLine: {
    width: 32,
    height: 1,
    backgroundColor: '#C08B29',
  },
  pathHeart: {
    color: '#B9882E',
    fontSize: 18,
    lineHeight: 20,
  },
  pathIntro: {
    color: '#424349',
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    maxWidth: 310,
    marginBottom: 12,
  },
  pathCard: {
    width: '100%',
    minHeight: 104,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#E9D7CA',
    backgroundColor: 'rgba(255, 255, 255, 0.96)',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 10,
    shadowColor: '#D9A49C',
    shadowOpacity: 0.14,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  pathCardActive: {
    borderColor: BRAND_COLOR,
    borderWidth: 1.4,
    shadowOpacity: 0.22,
  },
  pathIconCircle: {
    width: 68,
    height: 68,
    borderRadius: 34,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  pathIconCircleCouple: {
    backgroundColor: '#FCE9E6',
  },
  pathIconCircleVendor: {
    backgroundColor: '#FFF4E3',
  },
  pathCopy: {
    flex: 1,
    minWidth: 0,
  },
  pathCardTitle: {
    color: '#303137',
    fontSize: 24,
    lineHeight: 29,
    fontWeight: '500',
    marginBottom: 4,
  },
  pathCardTitleActive: {
    color: '#A83D3D',
  },
  pathCardText: {
    color: '#4C4D53',
    fontSize: 14,
    lineHeight: 19,
  },
  pathRadio: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1.6,
    borderColor: '#C08B29',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 10,
  },
  pathRadioActive: {
    backgroundColor: BRAND_COLOR,
    borderColor: BRAND_COLOR,
  },
  pathRadioCheck: {
    color: '#FFFFFF',
    fontSize: 22,
    lineHeight: 25,
    fontWeight: '800',
  },
  pathContinueButton: {
    width: '94%',
    height: 50,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: BRAND_COLOR,
    marginTop: 8,
    shadowColor: BRAND_COLOR,
    shadowOpacity: 0.28,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 7 },
    elevation: 7,
  },
  pathContinueText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
  },
  pathLoginRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 10,
  },
  pathLoginCopy: {
    color: '#57585E',
    fontSize: 15,
  },
  pathLoginLink: {
    color: BRAND_COLOR,
    fontSize: 15,
    fontWeight: '700',
    textDecorationLine: 'underline',
  },
  pathStepText: {
    color: '#313238',
    fontSize: 14,
    marginTop: 14,
    marginBottom: 8,
  },
  stepDots: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  stepDot: {
    width: 48,
    height: 5,
    borderRadius: 3,
    backgroundColor: '#E3E0DD',
  },
  stepDotActive: {
    backgroundColor: BRAND_COLOR,
  },
  pathFooter: {
    color: '#5F6066',
    fontSize: 14,
    fontStyle: 'italic',
    marginTop: 14,
    textAlign: 'center',
  },
  roleSwitch: {
    width: '100%',
    maxWidth: 292,
    minHeight: 54,
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    borderRadius: 28,
    padding: 5,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: BRAND_COLOR,
    shadowOpacity: 0.16,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
    elevation: 6,
    marginTop: 18,
    zIndex: 2,
  },
  roleOption: {
    flex: 1,
    height: 44,
    borderRadius: 22,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
  },
  roleOptionActive: {
    backgroundColor: BRAND_COLOR,
  },
  roleText: {
    color: '#333338',
    fontSize: 17,
    fontWeight: '600',
  },
  roleTextActive: {
    color: '#FFFFFF',
  },
  roleCaption: {
    color: '#6F6F72',
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '600',
    marginTop: 7,
    textAlign: 'center',
  },
  loginCard: {
    width: '100%',
    maxWidth: 360,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.96)',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 12,
    marginTop: 10,
    shadowColor: '#D9A49C',
    shadowOpacity: 0.17,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 9 },
    elevation: 8,
  },
  oneAppLoginCard: {
    maxWidth: 352,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingTop: 9,
    paddingBottom: 7,
    marginTop: 5,
  },
  wizardBackButton: {
    alignSelf: 'flex-start',
    minHeight: 28,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginBottom: 2,
  },
  wizardBackText: {
    color: BRAND_COLOR,
    fontSize: 13,
    fontWeight: '700',
  },
  authStepText: {
    color: '#8E7C77',
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0,
    marginBottom: 3,
  },
  authTitle: {
    color: '#303137',
    fontSize: 22,
    lineHeight: 26,
    fontWeight: '700',
  },
  authIntro: {
    color: '#68696F',
    fontSize: 13,
    lineHeight: 18,
    marginTop: 4,
    marginBottom: 10,
  },
  signupConsentRow: {
    width: '100%',
    minHeight: 42,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#F0D5D1',
    backgroundColor: '#FFF8F5',
    gap: 7,
    paddingHorizontal: 11,
    paddingVertical: 10,
    marginBottom: 8,
  },
  signupConsentToggle: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  signupConsentPolicyLinks: {
    minHeight: 24,
    paddingLeft: 30,
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    columnGap: 5,
    rowGap: 2,
  },
  signupConsentPolicyPrefix: {
    color: '#6D5B57',
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '600',
  },
  signupConsentBox: {
    width: 20,
    height: 20,
    borderRadius: 5,
    borderWidth: 1.5,
    borderColor: '#D7B5AE',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  signupConsentBoxChecked: {
    borderColor: BRAND_COLOR,
    backgroundColor: BRAND_COLOR,
  },
  signupConsentCheck: {
    color: '#FFFFFF',
    fontSize: 14,
    lineHeight: 17,
    fontWeight: '900',
  },
  signupConsentText: {
    flex: 1,
    color: '#6D5B57',
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '600',
  },
  signupConsentLink: {
    color: BRAND_COLOR,
    textDecorationLine: 'underline',
    fontWeight: '900',
  },
  emailSignupPrompt: {
    color: '#7A6B66',
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '700',
    textAlign: 'center',
    textTransform: 'uppercase',
    letterSpacing: 0,
    marginTop: 18,
    marginBottom: 0,
  },
  inputLabel: {
    color: '#2E2E32',
    fontSize: 15,
    lineHeight: 19,
    fontWeight: '700',
    marginBottom: 7,
  },
  passwordLabel: {
    marginTop: 8,
  },
  inputShell: {
    minHeight: 44,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E8D0C3',
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    gap: 11,
  },
  textInput: {
    flex: 1,
    color: '#2B2B2F',
    fontSize: 15,
    minHeight: 42,
    paddingVertical: 0,
  },
  eyeButton: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
  },
  forgotButton: {
    alignSelf: 'flex-end',
    paddingTop: 6,
    paddingBottom: 4,
  },
  forgotText: {
    color: BRAND_COLOR,
    fontSize: 13,
    textDecorationLine: 'underline',
    fontWeight: '600',
  },
  loginButton: {
    height: 44,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: BRAND_COLOR,
    shadowColor: BRAND_COLOR,
    shadowOpacity: 0.28,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 5 },
    elevation: 5,
    marginTop: 4,
  },
  loginButtonDisabled: {
    opacity: 0.72,
  },
  loginButtonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
  },
  signedInPanel: {
    alignItems: 'center',
    paddingVertical: 4,
  },
  oneAppSignedInPanel: {
    paddingVertical: 0,
  },
  signedInTitle: {
    color: BRAND_COLOR,
    fontSize: 14,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0,
  },
  signedInName: {
    width: '100%',
    color: '#2E2E32',
    fontSize: 19,
    lineHeight: 25,
    fontWeight: '700',
    textAlign: 'center',
    marginTop: 8,
    marginBottom: 14,
  },
  oneAppSignedInName: {
    fontSize: 15,
    lineHeight: 19,
    marginTop: 3,
    marginBottom: 7,
  },
  coupleMenuCard: {
    width: '100%',
    minHeight: 118,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#F0D5CF',
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    gap: 12,
    marginBottom: 11,
    shadowColor: '#D9A49C',
    shadowOpacity: 0.12,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 7 },
    elevation: 5,
  },
  oneAppMenuCard: {
    minHeight: 76,
    borderRadius: 14,
    padding: 8,
    gap: 8,
    marginBottom: 7,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  coupleMenuCopy: {
    flex: 1,
    minWidth: 0,
  },
  coupleMenuTitleRow: {
    minHeight: 18,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  coupleMenuEyebrow: {
    color: BRAND_COLOR,
    fontSize: 10,
    lineHeight: 13,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 0,
  },
  coupleMenuTitle: {
    color: '#2E2E32',
    fontSize: 17,
    lineHeight: 21,
    fontWeight: '900',
    marginTop: 2,
  },
  coupleMenuDescription: {
    color: '#756662',
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '700',
    marginTop: 5,
  },
  coupleMenuImage: {
    width: 102,
    height: 102,
    marginLeft: 8,
  },
  oneAppMenuImage: {
    width: 70,
    height: 70,
    marginLeft: 4,
  },
  qrMenuCard: {
    backgroundColor: '#FFFCFA',
    borderColor: '#EAD2CC',
  },
  qrMenuCardDisabled: {
    backgroundColor: '#F1F0EF',
    borderColor: '#D8D4D2',
    shadowOpacity: 0.04,
    elevation: 1,
  },
  qrMenuTitleDisabled: {
    color: '#716D6B',
  },
  qrMenuTextDisabled: {
    color: '#8A8582',
  },
  qrMenuImageDisabled: {
    opacity: 0.48,
  },
  qrMenuEventDate: {
    color: '#9B3E36',
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '900',
    marginTop: 7,
  },
  qrMenuEventVenue: {
    color: '#756662',
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '800',
    marginTop: 1,
  },
  qrMenuUnavailableText: {
    color: '#716D6B',
    fontSize: 10,
    lineHeight: 13,
    fontWeight: '900',
    marginTop: 2,
  },
  vendorMenuIconWrap: {
    width: 94,
    height: 94,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#9B3E36',
  },
  vendorMenuDashboardIcon: {
    backgroundColor: '#4F6F68',
  },
  vendorMenuChatIcon: {
    backgroundColor: BRAND_COLOR,
  },
  vendorRaffleButton: {
    marginTop: 10,
    backgroundColor: '#9B3E36',
  },
  raffleModalBackdrop: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(23, 23, 27, 0.62)',
    padding: 22,
  },
  raffleModalCard: {
    width: '100%',
    maxWidth: 420,
    maxHeight: '90%',
    borderRadius: 22,
    backgroundColor: '#FFF8F5',
    overflow: 'hidden',
    shadowColor: '#000000',
    shadowOpacity: 0.22,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 12 },
    elevation: 12,
  },
  raffleModalBody: {
    flexShrink: 1,
  },
  raffleModalCardContent: {
    padding: 20,
    paddingBottom: 16,
  },
  raffleModalEyebrow: {
    color: BRAND_COLOR,
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 0,
  },
  raffleModalTitle: {
    color: '#2E2E32',
    fontSize: 23,
    lineHeight: 28,
    fontWeight: '900',
    marginTop: 6,
  },
  raffleModalVendor: {
    color: '#9B3E36',
    fontSize: 14,
    lineHeight: 19,
    fontWeight: '900',
    marginTop: 4,
  },
  raffleModalText: {
    color: '#5F5552',
    fontSize: 14,
    lineHeight: 21,
    fontWeight: '700',
    marginTop: 12,
  },
  raffleTermsLink: {
    color: BRAND_COLOR,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '900',
    textDecorationLine: 'underline',
    marginTop: 12,
  },
  raffleModalActions: {
    flexDirection: 'row',
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: '#EAD2CC',
    backgroundColor: '#FFF8F5',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 20,
  },
  raffleCancelButton: {
    flex: 1,
    minHeight: 46,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#EAD2CC',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 12,
  },
  raffleCancelText: {
    color: '#5F5552',
    fontSize: 14,
    fontWeight: '900',
  },
  raffleEnterButton: {
    flex: 1,
    minHeight: 46,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: BRAND_COLOR,
    paddingHorizontal: 12,
  },
  raffleEnterText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '900',
  },
  vendorRaffleBackdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(23, 23, 27, 0.46)',
  },
  vendorRaffleSheet: {
    height: '92%',
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    backgroundColor: '#FFF8F5',
    paddingTop: 18,
    paddingHorizontal: 18,
    paddingBottom: Platform.OS === 'ios' ? 34 : 22,
  },
  vendorRaffleScroll: {
    flex: 1,
  },
  vendorRaffleHeader: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 12,
  },
  vendorRaffleEyebrow: {
    color: BRAND_COLOR,
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 0,
  },
  vendorRaffleTitle: {
    color: '#2E2E32',
    fontSize: 24,
    lineHeight: 29,
    fontWeight: '900',
  },
  vendorRaffleHeaderText: {
    color: '#756662',
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '700',
    marginTop: 4,
    maxWidth: 292,
  },
  vendorRaffleClose: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#EAD2CC',
  },
  vendorRaffleLoading: {
    minHeight: 260,
    alignItems: 'center',
    justifyContent: 'center',
  },
  vendorRaffleVendor: {
    color: '#9B3E36',
    fontSize: 16,
    lineHeight: 21,
    fontWeight: '900',
    marginBottom: 10,
  },
  vendorRaffleGuideCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#EAD2CC',
    backgroundColor: '#FFFFFF',
    marginBottom: 14,
    overflow: 'hidden',
  },
  vendorRaffleGuideHeader: {
    minHeight: 60,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 13,
    paddingVertical: 10,
  },
  vendorRaffleGuideCopy: {
    flex: 1,
    paddingRight: 12,
  },
  vendorRaffleGuideTitle: {
    color: '#2E2E32',
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '900',
  },
  vendorRaffleGuideText: {
    color: '#756662',
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '700',
    marginTop: 2,
  },
  vendorRaffleGuideContent: {
    borderTopWidth: 1,
    borderTopColor: '#EAD2CC',
    paddingTop: 12,
  },
  vendorRaffleWizardCard: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#E3C5BF',
    backgroundColor: '#FFFDFC',
    padding: 14,
    marginBottom: 14,
  },
  vendorRaffleWizardHeading: {
    marginTop: 14,
    marginBottom: 14,
  },
  vendorRaffleWizardCount: {
    color: '#AA565D',
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  vendorRaffleWizardDescription: {
    color: '#655956',
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '700',
    marginTop: 5,
  },
  vendorRaffleWizardActions: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 10,
    marginTop: 14,
  },
  vendorRaffleWizardButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    minWidth: 0,
  },
  vendorRaffleInfographicFrame: {
    alignSelf: 'center',
    marginBottom: 14,
  },
  vendorRaffleInfographicTrack: {
    alignItems: 'center',
  },
  vendorRaffleInfographic: {
    borderRadius: 18,
    overflow: 'hidden',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#EAD2CC',
  },
  vendorRaffleCarouselCue: {
    alignItems: 'center',
    marginTop: 8,
    gap: 7,
  },
  vendorRaffleCarouselCueText: {
    color: '#AA565D',
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '900',
    textAlign: 'center',
  },
  vendorRaffleCarouselDots: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
  },
  vendorRaffleCarouselDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#E7C9C3',
  },
  vendorRaffleCarouselDotActive: {
    width: 18,
    backgroundColor: '#AA565D',
  },
  vendorRaffleScrollCue: {
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 0,
    marginBottom: 10,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: '#FFF0ED',
    borderWidth: 1,
    borderColor: '#EACBC6',
  },
  vendorRaffleScrollCueText: {
    color: '#AA565D',
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '900',
  },
  vendorRaffleToggleRow: {
    minHeight: 74,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#EAD2CC',
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    marginBottom: 14,
  },
  vendorRaffleToggle: {
    width: 52,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#E7DED9',
    padding: 3,
  },
  vendorRaffleToggleOn: {
    backgroundColor: BRAND_COLOR,
  },
  vendorRaffleToggleKnob: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
  },
  vendorRaffleToggleKnobOn: {
    transform: [{ translateX: 22 }],
  },
  vendorRaffleToggleCopy: {
    flex: 1,
  },
  vendorRaffleToggleTitle: {
    color: '#2E2E32',
    fontSize: 15,
    lineHeight: 19,
    fontWeight: '900',
  },
  vendorRaffleToggleText: {
    color: '#756662',
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '700',
    marginTop: 2,
  },
  vendorRaffleWinnerCountOptions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 7,
  },
  vendorRaffleWinnerCountOption: {
    flex: 1,
    minHeight: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#EAD2CC',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  vendorRaffleWinnerCountOptionSelected: {
    borderColor: '#AA565D',
    backgroundColor: '#AA565D',
  },
  vendorRaffleWinnerCountOptionText: {
    color: '#AA565D',
    fontSize: 17,
    lineHeight: 21,
    fontWeight: '900',
  },
  vendorRaffleWinnerCountOptionTextSelected: {
    color: '#FFFFFF',
  },
  vendorRaffleRulesLink: {
    color: '#AA565D',
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '900',
  },
  vendorRaffleRulesLinkButton: {
    minHeight: 40,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E4C2BE',
    backgroundColor: '#FFF8F6',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  vendorRaffleRulesCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#EAD2CC',
    backgroundColor: '#FFF8F6',
    marginBottom: 14,
    overflow: 'hidden',
  },
  vendorRaffleRulesHeader: {
    minHeight: 68,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 13,
    paddingVertical: 12,
  },
  vendorRaffleRulesHeaderCopy: {
    flex: 1,
    paddingRight: 8,
  },
  vendorRaffleRulesTitle: {
    color: '#2E2E32',
    fontSize: 15,
    lineHeight: 19,
    fontWeight: '900',
  },
  vendorRaffleRulesSummary: {
    color: '#756662',
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '700',
    marginTop: 3,
  },
  vendorRaffleRulesHeaderAction: {
    flexShrink: 0,
    alignItems: 'flex-end',
    justifyContent: 'center',
    gap: 3,
  },
  vendorRaffleRulesHeaderActionText: {
    color: '#8A454B',
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '900',
  },
  vendorRaffleRulesChevronOpen: {
    transform: [{ rotate: '180deg' }],
  },
  vendorRaffleRulesContent: {
    borderTopWidth: 1,
    borderTopColor: '#EAD2CC',
    backgroundColor: '#FFFDFC',
    padding: 11,
    gap: 8,
  },
  vendorRaffleInfoCard: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#EAD2CC',
    backgroundColor: '#FFF8F6',
    padding: 11,
    marginBottom: 0,
  },
  vendorRaffleInfoTitle: {
    color: '#2E2E32',
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '900',
    marginBottom: 5,
  },
  vendorRaffleInfoText: {
    color: '#655956',
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '700',
    marginTop: 3,
  },
  vendorRaffleAgreementPanel: {
    borderTopWidth: 1,
    borderTopColor: '#EAD2CC',
    backgroundColor: '#FFFFFF',
    padding: 13,
    gap: 12,
  },
  vendorRaffleAgreementText: {
    color: '#433D3B',
    fontSize: 13,
    lineHeight: 19,
    fontWeight: '800',
  },
  vendorRaffleProcessRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 12,
  },
  vendorRaffleProcessPill: {
    flexGrow: 1,
    minWidth: '46%',
    minHeight: 38,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#F0D5D1',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 10,
  },
  vendorRaffleProcessPillActive: {
    borderColor: '#8A454B',
    backgroundColor: '#8A454B',
  },
  vendorRaffleProcessNumber: {
    width: 20,
    height: 20,
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: '#AA565D',
    color: '#FFFFFF',
    fontSize: 11,
    lineHeight: 20,
    fontWeight: '900',
    textAlign: 'center',
  },
  vendorRaffleProcessNumberActive: {
    backgroundColor: '#FFFFFF',
    color: '#8A454B',
  },
  vendorRaffleProcessText: {
    color: '#2E2E32',
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '900',
  },
  vendorRaffleProcessTextActive: {
    color: '#FFFFFF',
  },
  vendorRaffleTextAreaShell: {
    minHeight: 92,
    alignItems: 'flex-start',
  },
  vendorRaffleTextArea: {
    minHeight: 72,
    textAlignVertical: 'top',
  },
  vendorRaffleFieldHelp: {
    color: '#756662',
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '700',
    marginTop: 7,
  },
  vendorRaffleDisabledContent: {
    opacity: 0.42,
  },
  vendorRaffleEmailPreview: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#F0D4D1',
    backgroundColor: '#FFF8F7',
    padding: 10,
    marginTop: 14,
    marginBottom: 12,
  },
  vendorRafflePreviewHeader: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  vendorRafflePreviewEyebrow: {
    color: '#AA565D',
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '900',
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  vendorRafflePreviewMeta: {
    color: '#AA565D',
    fontSize: 10,
    lineHeight: 14,
    fontWeight: '900',
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  vendorRafflePreviewPaper: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#EFE2DE',
    backgroundColor: '#FFFFFF',
    padding: 14,
  },
  vendorRafflePreviewLogo: {
    width: 142,
    height: 42,
    alignSelf: 'flex-start',
  },
  vendorRafflePreviewDivider: {
    height: 1,
    backgroundColor: '#E6DED9',
    marginTop: 10,
    marginBottom: 12,
  },
  vendorRafflePreviewSubject: {
    color: '#2E2E32',
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '900',
    marginBottom: 10,
  },
  vendorRafflePreviewBody: {
    color: '#2F2B2C',
    fontSize: 13,
    lineHeight: 19,
    fontWeight: '600',
    marginTop: 5,
  },
  vendorRafflePreviewBox: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#EED4D1',
    backgroundColor: '#FFF7F6',
    padding: 11,
    marginTop: 13,
    marginBottom: 8,
  },
  vendorRafflePreviewSection: {
    color: '#AA565D',
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '900',
    textTransform: 'uppercase',
    marginTop: 10,
    marginBottom: 1,
  },
  vendorRafflePreviewButton: {
    alignSelf: 'flex-start',
    borderRadius: 7,
    backgroundColor: '#AA565D',
    paddingHorizontal: 13,
    paddingVertical: 9,
    marginTop: 10,
    marginBottom: 4,
  },
  vendorRafflePreviewButtonText: {
    color: '#FFFFFF',
    fontSize: 12,
    lineHeight: 15,
    fontWeight: '900',
  },
  vendorRafflePreviewFooter: {
    color: '#2F2B2C',
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '700',
    marginTop: 12,
  },
  vendorRaffleStatsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 16,
  },
  vendorRaffleStat: {
    flex: 1,
    minWidth: '28%',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#EAD2CC',
    backgroundColor: '#FFFFFF',
    padding: 14,
  },
  vendorRaffleStatValue: {
    color: BRAND_COLOR,
    fontSize: 24,
    lineHeight: 28,
    fontWeight: '900',
  },
  vendorRaffleStatLabel: {
    color: '#756662',
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '900',
    textTransform: 'uppercase',
    marginTop: 2,
  },
  vendorRaffleExportRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 12,
    marginBottom: 10,
  },
  vendorRaffleAutosaveRow: {
    height: 58,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#EFD8D6',
    backgroundColor: '#FFF5F4',
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 12,
    overflow: 'hidden',
  },
  vendorRaffleSaveIndicatorSlot: {
    width: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  vendorRaffleSaveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#3E8A5A',
  },
  vendorRaffleSaveDotIssue: {
    backgroundColor: '#B84B52',
  },
  vendorRaffleSaveHint: {
    color: '#756662',
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '800',
    textAlign: 'center',
    flexShrink: 1,
    flex: 1,
  },
  vendorRaffleSaveHintIssue: {
    color: '#9A3F46',
  },
  vendorRaffleSaveRetry: {
    minHeight: 34,
    borderRadius: 9,
    backgroundColor: '#AA565D',
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  vendorRaffleSaveRetryText: {
    color: '#FFFFFF',
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '900',
  },
  vendorRaffleHint: {
    color: '#756662',
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '800',
    textAlign: 'center',
    marginTop: 8,
  },
  vendorRaffleSectionEyebrow: {
    color: '#AA565D',
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '900',
    textTransform: 'uppercase',
    marginTop: 14,
  },
  vendorRaffleSectionTitle: {
    color: '#2E2E32',
    fontSize: 22,
    lineHeight: 27,
    fontWeight: '900',
    marginTop: 2,
  },
  vendorRaffleDrawStatusCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#EFD8D6',
    backgroundColor: '#FFFFFF',
    padding: 12,
    marginTop: 10,
  },
  vendorRaffleDrawStatusLabel: {
    color: '#AA565D',
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  vendorRaffleDrawStatusText: {
    color: '#2E2E32',
    fontSize: 14,
    lineHeight: 19,
    fontWeight: '800',
    marginTop: 3,
  },
  vendorRaffleWinnerSteps: {
    gap: 8,
    marginTop: 10,
    marginBottom: 12,
  },
  vendorRaffleWinnerStep: {
    minHeight: 70,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#EFD8D6',
    backgroundColor: '#FFF8F7',
    flexDirection: 'row',
    padding: 11,
  },
  vendorRaffleWinnerStepNumber: {
    width: 24,
    height: 24,
    flexShrink: 0,
    marginRight: 10,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#AA565D',
    color: '#FFFFFF',
    fontSize: 12,
    lineHeight: 24,
    fontWeight: '900',
    textAlign: 'center',
  },
  vendorRaffleWinnerStepCopy: {
    width: '82%',
    flexShrink: 1,
    minWidth: 0,
  },
  vendorRaffleWinnerStepTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  vendorRaffleWinnerStepTitle: {
    color: '#2E2E32',
    fontSize: 13,
    lineHeight: 17,
    fontWeight: '900',
    flex: 1,
  },
  vendorRaffleWinnerStepText: {
    color: '#756662',
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '700',
    marginTop: 3,
  },
  vendorRaffleExplainGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 12,
    marginBottom: 12,
  },
  vendorRaffleExplainCard: {
    flexGrow: 1,
    flexBasis: '47%',
    minHeight: 78,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#EFD8D6',
    backgroundColor: '#FFF8F7',
    padding: 11,
  },
  vendorRaffleExplainTitle: {
    color: '#2E2E32',
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '900',
  },
  vendorRaffleExplainText: {
    color: '#756662',
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '700',
    marginTop: 3,
  },
  vendorRaffleWinnerCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#BBF7D0',
    backgroundColor: '#F0FFF4',
    padding: 12,
    marginTop: 12,
  },
  vendorRaffleWinnerTitle: {
    color: '#168044',
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  vendorRaffleWinnerName: {
    color: '#2E2E32',
    fontSize: 16,
    lineHeight: 20,
    fontWeight: '900',
    marginTop: 3,
  },
  vendorRaffleWinnerText: {
    color: '#5F5552',
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '700',
    marginTop: 2,
  },
  vendorRaffleContactSearch: {
    minHeight: 48,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E4CFCA',
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    paddingHorizontal: 12,
    marginTop: 12,
  },
  vendorRaffleContactSearchInput: {
    flex: 1,
    minHeight: 46,
    color: '#2E2E32',
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '700',
    paddingVertical: 8,
  },
  vendorRaffleContactSearchClear: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F5EFED',
  },
  vendorRaffleContactFilters: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 9,
  },
  vendorRaffleContactFilter: {
    flex: 1,
    minHeight: 40,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E4CFCA',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
    paddingVertical: 7,
  },
  vendorRaffleContactFilterSelected: {
    borderColor: '#AA565D',
    backgroundColor: '#FFF3F2',
  },
  vendorRaffleContactFilterText: {
    color: '#756662',
    fontSize: 10,
    lineHeight: 13,
    fontWeight: '900',
    textAlign: 'center',
  },
  vendorRaffleContactFilterTextSelected: {
    color: '#8A454B',
  },
  vendorRaffleContactCount: {
    color: '#756662',
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '800',
    marginTop: 8,
  },
  vendorRaffleEntrantCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#EAD2CC',
    backgroundColor: '#FFFFFF',
    padding: 14,
    marginTop: 10,
    shadowColor: '#2E2E32',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 1,
  },
  vendorRaffleEntrantHeading: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 10,
  },
  vendorRaffleEntrantIdentity: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  vendorRaffleEntrantAvatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 1,
    borderColor: '#E8C9C5',
    backgroundColor: '#FFF3F2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  vendorRaffleEntrantAvatarText: {
    color: '#8A454B',
    fontSize: 13,
    lineHeight: 17,
    fontWeight: '900',
  },
  vendorRaffleEntrantCopy: {
    flex: 1,
    minWidth: 0,
  },
  vendorRaffleEntrantStatus: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#BBF7D0',
    backgroundColor: '#F0FFF4',
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  vendorRaffleEntrantStatusExcluded: {
    borderColor: '#F0D4D1',
    backgroundColor: '#FFF5F4',
  },
  vendorRaffleEntrantStatusText: {
    color: '#168044',
    fontSize: 10,
    lineHeight: 13,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  vendorRaffleEntrantStatusTextExcluded: {
    color: '#9B3E36',
  },
  vendorRaffleContactGrid: {
    gap: 7,
    marginTop: 13,
  },
  vendorRaffleContactItem: {
    minHeight: 54,
    borderRadius: 10,
    backgroundColor: '#FAF7F6',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 11,
    paddingVertical: 9,
  },
  vendorRaffleContactItemCopy: {
    flex: 1,
    minWidth: 0,
  },
  vendorRaffleContactLabel: {
    color: '#8B7C78',
    fontSize: 9,
    lineHeight: 12,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  vendorRaffleContactValue: {
    color: '#4D3F3C',
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '800',
    marginTop: 1,
  },
  vendorRaffleEntryManageButton: {
    minHeight: 44,
    borderTopWidth: 1,
    borderTopColor: '#EEE2DF',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 11,
    paddingTop: 10,
  },
  vendorRaffleEntryManageButtonText: {
    color: '#8A454B',
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '900',
  },
  vendorRaffleEntryManageChevronOpen: {
    transform: [{ rotate: '180deg' }],
  },
  vendorRaffleEntryManagement: {
    borderRadius: 10,
    backgroundColor: '#FCF9F8',
    padding: 11,
    marginTop: 4,
  },
  vendorRaffleEntryReference: {
    color: '#8B7C78',
    fontSize: 10,
    lineHeight: 14,
    fontWeight: '800',
    marginTop: 4,
  },
  vendorRaffleContactEmpty: {
    borderRadius: 12,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: '#E4CFCA',
    backgroundColor: '#FCF9F8',
    alignItems: 'center',
    padding: 20,
    marginTop: 10,
  },
  vendorRaffleContactEmptyTitle: {
    color: '#2E2E32',
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '900',
  },
  vendorRaffleContactEmptyText: {
    color: '#756662',
    fontSize: 11,
    lineHeight: 16,
    fontWeight: '700',
    textAlign: 'center',
    marginTop: 3,
  },
  vendorRaffleExclusionReason: {
    color: '#756662',
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '800',
    marginTop: 10,
  },
  vendorRaffleSmallDangerButton: {
    minHeight: 40,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2AAA6',
    backgroundColor: '#FFF5F4',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    marginTop: 9,
  },
  vendorRaffleSmallDangerButtonText: {
    color: '#9B3E36',
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '900',
  },
  vendorRaffleSmallRestoreButton: {
    minHeight: 40,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#98D8AF',
    backgroundColor: '#F0FFF4',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    marginTop: 9,
  },
  vendorRaffleSmallRestoreButtonText: {
    color: '#168044',
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '900',
  },
  vendorRaffleNoticeSent: {
    color: '#168044',
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '900',
    marginTop: 10,
  },
  vendorRaffleEntryRow: {
    borderBottomWidth: 1,
    borderBottomColor: '#EAD2CC',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingVertical: 10,
  },
  vendorRaffleEntryName: {
    color: '#2E2E32',
    fontSize: 13,
    lineHeight: 17,
    fontWeight: '900',
  },
  vendorRaffleEntryText: {
    color: '#756662',
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '700',
  },
  vendorRaffleError: {
    color: '#9B3E36',
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '800',
    marginBottom: 10,
  },
  qrOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 120,
    elevation: 120,
    backgroundColor: '#17171B',
    paddingTop: Platform.OS === 'ios' ? 62 : 34,
    paddingHorizontal: 18,
    paddingBottom: Platform.OS === 'ios' ? 34 : 22,
  },
  qrHeader: {
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  qrEyebrow: {
    color: '#F0CFC8',
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 0,
  },
  qrTitle: {
    color: '#FFFFFF',
    fontSize: 25,
    lineHeight: 30,
    fontWeight: '900',
  },
  qrSubTitle: {
    color: '#F4D8D2',
    fontSize: 14,
    lineHeight: 19,
    fontWeight: '700',
    marginTop: -8,
    marginBottom: 6,
  },
  qrCloseButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },
  qrCameraFrame: {
    height: '38%',
    minHeight: 260,
    borderRadius: 24,
    overflow: 'hidden',
    backgroundColor: '#28282D',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.16)',
  },
  qrCamera: {
    flex: 1,
  },
  qrFrameShade: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.18)',
  },
  qrFocusBox: {
    width: '72%',
    aspectRatio: 1,
    maxWidth: 280,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qrCorner: {
    position: 'absolute',
    width: 44,
    height: 44,
    borderColor: '#FFFFFF',
  },
  qrCornerTopLeft: {
    top: 0,
    left: 0,
    borderTopWidth: 4,
    borderLeftWidth: 4,
    borderTopLeftRadius: 22,
  },
  qrCornerTopRight: {
    top: 0,
    right: 0,
    borderTopWidth: 4,
    borderRightWidth: 4,
    borderTopRightRadius: 22,
  },
  qrCornerBottomLeft: {
    bottom: 0,
    left: 0,
    borderBottomWidth: 4,
    borderLeftWidth: 4,
    borderBottomLeftRadius: 22,
  },
  qrCornerBottomRight: {
    right: 0,
    bottom: 0,
    borderRightWidth: 4,
    borderBottomWidth: 4,
    borderBottomRightRadius: 22,
  },
  qrPermissionPanel: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    backgroundColor: '#FFF8F5',
  },
  qrPermissionTitle: {
    color: '#2E2E32',
    fontSize: 22,
    lineHeight: 27,
    fontWeight: '900',
    marginTop: 16,
    textAlign: 'center',
  },
  qrPermissionText: {
    color: '#756662',
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '700',
    marginTop: 8,
    textAlign: 'center',
  },
  qrPermissionButton: {
    height: 48,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: BRAND_COLOR,
    paddingHorizontal: 24,
    marginTop: 18,
  },
  qrPermissionButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '900',
  },
  qrSavingPill: {
    position: 'absolute',
    right: 16,
    bottom: 16,
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(198, 106, 106, 0.94)',
  },
  qrCameraFeedback: {
    position: 'absolute',
    left: 18,
    right: 18,
    bottom: 18,
    minHeight: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: 'rgba(46, 46, 50, 0.88)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.22)',
  },
  qrCameraFeedbackSuccess: {
    backgroundColor: 'rgba(22, 128, 68, 0.92)',
  },
  qrCameraFeedbackDuplicate: {
    backgroundColor: 'rgba(166, 106, 17, 0.94)',
  },
  qrCameraFeedbackError: {
    backgroundColor: 'rgba(155, 62, 54, 0.94)',
  },
  qrCameraFeedbackText: {
    color: '#FFFFFF',
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '900',
    textAlign: 'center',
  },
  qrFooter: {
    flex: 1,
    borderRadius: 18,
    backgroundColor: '#FFF8F5',
    padding: 16,
    marginTop: 14,
  },
  qrProgressHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  qrFooterTitle: {
    color: '#2E2E32',
    fontSize: 17,
    lineHeight: 21,
    fontWeight: '900',
  },
  qrProgressPercent: {
    color: BRAND_COLOR,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '900',
  },
  qrProgressTrack: {
    width: '100%',
    height: 14,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: '#EAD2CC',
    backgroundColor: '#FFFFFF',
    overflow: 'hidden',
    marginTop: 10,
  },
  qrProgressFill: {
    height: '100%',
    borderRadius: 7,
    backgroundColor: BRAND_COLOR,
  },
  qrFooterText: {
    color: '#756662',
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '700',
    marginTop: 5,
  },
  qrLastScanText: {
    color: '#7A4D48',
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '900',
    marginTop: 9,
  },
  qrLastScanComplete: {
    color: '#168044',
  },
  qrLastScanDuplicate: {
    color: '#A66A11',
  },
  qrLastScanError: {
    color: '#9B3E36',
  },
  qrErrorText: {
    color: '#9B3E36',
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '800',
    marginTop: 8,
  },
  qrGridLoading: {
    minHeight: 120,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qrVendorList: {
    flex: 1,
    marginTop: 12,
  },
  qrVendorGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingBottom: 8,
  },
  qrVendorTile: {
    width: '31.8%',
    minHeight: 118,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E6DAD6',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
    paddingVertical: 8,
    opacity: 0.72,
  },
  qrVendorTileScanned: {
    opacity: 1,
    borderColor: BRAND_COLOR,
    backgroundColor: '#FFF1EE',
  },
  qrVendorImage: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#F3E8E4',
    marginBottom: 8,
  },
  qrVendorImagePlaceholder: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F3E8E4',
    marginBottom: 8,
  },
  qrVendorName: {
    color: '#4A4442',
    fontSize: 10,
    lineHeight: 13,
    fontWeight: '900',
    textAlign: 'center',
  },
  qrVendorCheck: {
    position: 'absolute',
    top: 7,
    right: 7,
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: BRAND_COLOR,
  },
  qrVendorCheckText: {
    color: '#FFFFFF',
    fontSize: 14,
    lineHeight: 17,
    fontWeight: '900',
  },
  chatEntry: {
    width: '100%',
    minHeight: 72,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#EAD2CC',
    backgroundColor: '#FFFCFA',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 13,
    paddingVertical: 12,
    gap: 12,
    marginBottom: 12,
  },
  chatIconWrap: {
    width: 42,
    height: 42,
    borderRadius: 8,
    backgroundColor: '#F8E7E3',
    alignItems: 'center',
    justifyContent: 'center',
  },
  chatCopy: {
    flex: 1,
    minWidth: 0,
  },
  chatTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  chatTitle: {
    color: '#2E2E32',
    fontSize: 16,
    lineHeight: 21,
    fontWeight: '800',
  },
  chatBadge: {
    minWidth: 24,
    height: 22,
    borderRadius: 8,
    backgroundColor: BRAND_COLOR,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  chatBadgeText: {
    color: '#FFFFFF',
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '800',
  },
  chatSubtitle: {
    color: '#7D6B68',
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
    marginTop: 3,
  },
  chatBubble: {
    position: 'absolute',
    right: 18,
    bottom: Platform.OS === 'ios' ? 34 : 22,
    width: 62,
    height: 62,
    borderRadius: 31,
    backgroundColor: BRAND_COLOR,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: BRAND_COLOR,
    shadowOpacity: 0.35,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 10,
    zIndex: 50,
  },
  chatBubbleBadge: {
    position: 'absolute',
    top: -3,
    right: -2,
    minWidth: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#FFFFFF',
    backgroundColor: '#2E2E32',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 5,
  },
  chatBubbleBadgeText: {
    color: '#FFFFFF',
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '900',
  },
  coupleBottomNav: {
    position: 'absolute',
    left: 14,
    right: 14,
    bottom: Platform.OS === 'ios' ? 7 : 5,
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 5,
    paddingVertical: 4,
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    elevation: 70,
    zIndex: 70,
  },
  coupleBottomNavItem: {
    flex: 1,
    minWidth: 0,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    borderRadius: 13,
  },
  coupleBottomNavIconWrap: {
    width: 25,
    height: 25,
    alignItems: 'center',
    justifyContent: 'center',
  },
  coupleBottomNavLabel: {
    color: '#3A3332',
    fontSize: 9,
    lineHeight: 11,
    fontWeight: '900',
    textAlign: 'center',
  },
  coupleBottomNavBadge: {
    position: 'absolute',
    top: -6,
    right: -7,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#AA565D',
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  coupleBottomNavBadgeText: {
    color: '#FFFFFF',
    fontSize: 8,
    lineHeight: 10,
    fontWeight: '900',
  },
  browserReturnButton: {
    position: 'absolute',
    left: 14,
    bottom: Platform.OS === 'ios' ? 7 : 5,
    width: 58,
    minHeight: 58,
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    elevation: 70,
    zIndex: 70,
  },
  coupleBottomNavSpacer: {
    height: 8,
  },
  coupleMenuPill: {
    position: 'absolute',
    bottom: Platform.OS === 'ios' ? 38 : 26,
    alignSelf: 'center',
    minHeight: 34,
    paddingHorizontal: 16,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.82)',
    backgroundColor: 'rgba(46, 46, 50, 0.72)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000000',
    shadowOpacity: 0.18,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
    elevation: 8,
    zIndex: 45,
  },
  coupleMenuPillText: {
    color: '#FFFFFF',
    fontSize: 12,
    lineHeight: 15,
    fontWeight: '800',
  },
  chatNativeShell: {
    flex: 1,
    backgroundColor: '#FFF8F5',
  },
  chatNativeContent: {
    flex: 1,
  },
  chatNativeHeader: {
    minHeight: 58,
    borderBottomWidth: 1,
    borderBottomColor: '#F0E2DE',
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
  },
  chatRefreshButton: {
    minWidth: 68,
    height: 38,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFF8F5',
  },
  chatRefreshText: {
    color: BRAND_COLOR,
    fontSize: 13,
    fontWeight: '800',
  },
  chatErrorBanner: {
    backgroundColor: '#FFF1EE',
    borderBottomWidth: 1,
    borderBottomColor: '#F2C6BE',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  chatErrorText: {
    color: '#91433A',
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '700',
  },
  chatNoticeBanner: {
    backgroundColor: '#F2F8F4',
    borderBottomWidth: 1,
    borderBottomColor: '#C9E2D1',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  chatNoticeText: {
    color: '#2F6743',
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '700',
  },
  chatReportedNotice: {
    marginHorizontal: 12,
    marginTop: 10,
    marginBottom: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#F2C6BE',
    backgroundColor: '#FFF1EE',
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  chatReportedNoticeText: {
    flex: 1,
    color: '#8A514C',
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '800',
  },
  chatNativeBody: {
    flex: 1,
  },
  chatConversationList: {
    flex: 1,
    backgroundColor: '#FFF8F5',
  },
  chatConversationScroll: {
    flex: 1,
  },
  chatConversationContent: {
    flexGrow: 1,
    paddingHorizontal: 10,
    paddingBottom: 18,
  },
  chatConversationRow: {
    minHeight: 74,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F3E2DE',
    backgroundColor: '#FFF8F5',
    gap: 10,
  },
  chatConversationRowUnread: {
    backgroundColor: '#FFF1EE',
  },
  chatInboxPanel: {
    maxHeight: 238,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#F0E2DE',
  },
  chatInboxToolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 8,
  },
  chatSortChip: {
    height: 30,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#EBD7D1',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  chatSortChipActive: {
    backgroundColor: BRAND_COLOR,
    borderColor: BRAND_COLOR,
  },
  chatSortChipText: {
    color: '#6C5A56',
    fontSize: 12,
    fontWeight: '900',
  },
  chatSortChipTextActive: {
    color: '#FFFFFF',
  },
  chatInboxHeaderRow: {
    minHeight: 30,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    borderTopWidth: 1,
    borderTopColor: '#F6ECE9',
    borderBottomWidth: 1,
    borderBottomColor: '#F0E2DE',
    backgroundColor: '#FFFCFA',
  },
  chatInboxHeaderText: {
    color: '#4A3E3C',
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  chatInboxHeaderContact: {
    flex: 1.25,
  },
  chatInboxHeaderMessage: {
    flex: 1.35,
  },
  chatInboxHeaderDate: {
    width: 82,
    textAlign: 'right',
  },
  chatInboxList: {
    maxHeight: 150,
  },
  chatInboxListContent: {
    paddingVertical: 2,
  },
  chatInboxRow: {
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F6ECE9',
    backgroundColor: '#FFFFFF',
    gap: 9,
  },
  chatInboxRowActive: {
    backgroundColor: '#FFF6F3',
  },
  chatInboxContactCell: {
    flex: 1.25,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  chatInboxNameWrap: {
    flex: 1,
    minWidth: 0,
  },
  chatConversationTitleLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  chatConversationPreviewLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 3,
  },
  chatInboxName: {
    flex: 1,
    minWidth: 0,
    color: '#2E2E32',
    fontSize: 15,
    lineHeight: 19,
    fontWeight: '900',
  },
  chatInboxUnreadLabel: {
    color: BRAND_COLOR,
    fontSize: 10,
    lineHeight: 13,
    fontWeight: '900',
    marginTop: 1,
  },
  chatInboxLastMessage: {
    flex: 1,
    minWidth: 0,
    color: '#7D6B68',
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
  },
  chatInboxDateCell: {
    width: 82,
    alignItems: 'flex-end',
    gap: 4,
  },
  chatInboxDateText: {
    color: '#9A8884',
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '700',
  },
  chatInboxEmpty: {
    minHeight: 58,
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  chatInboxEmptyText: {
    color: '#8A7672',
    fontSize: 13,
    fontWeight: '700',
  },
  chatThreadRail: {
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#F0E2DE',
  },
  chatThreadRailContent: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
  },
  chatThreadPill: {
    maxWidth: 210,
    minHeight: 38,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#EBD7D1',
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    gap: 8,
  },
  chatThreadAvatar: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: '#F8E7E3',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  chatThreadAvatarImage: {
    width: '100%',
    height: '100%',
  },
  chatAvatarInitial: {
    color: '#8A514C',
    fontSize: 16,
    fontWeight: '900',
  },
  chatThreadPillActive: {
    backgroundColor: BRAND_COLOR,
    borderColor: BRAND_COLOR,
  },
  chatThreadPillTitle: {
    flexShrink: 1,
    color: '#4A3E3C',
    fontSize: 13,
    fontWeight: '800',
  },
  chatThreadPillTitleActive: {
    color: '#FFFFFF',
  },
  chatThreadUnread: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#2E2E32',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 5,
  },
  chatThreadUnreadText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '900',
  },
  chatThreadProfileBar: {
    minHeight: 62,
    borderBottomWidth: 1,
    borderBottomColor: '#F0E2DE',
    backgroundColor: '#FFFCFA',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  chatThreadProfileCopy: {
    flex: 1,
    minWidth: 0,
  },
  chatThreadProfileName: {
    color: '#2E2E32',
    fontSize: 15,
    lineHeight: 19,
    fontWeight: '900',
  },
  chatThreadProfileStatus: {
    color: '#8A7672',
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '700',
    marginTop: 1,
  },
  chatEmptyPill: {
    minHeight: 38,
    borderRadius: 8,
    backgroundColor: '#FFF8F5',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  chatEmptyPillText: {
    color: '#8A7672',
    fontSize: 13,
    fontWeight: '700',
  },
  chatEmptyHint: {
    color: '#8A7672',
    fontSize: 12,
    lineHeight: 16,
    textAlign: 'center',
  },
  chatMessages: {
    flex: 1,
  },
  chatMessagesContent: {
    flexGrow: 1,
    padding: 14,
    gap: 9,
  },
  chatJumpToLatest: {
    position: 'absolute',
    right: 18,
    bottom: Platform.OS === 'ios' ? 112 : 90,
    minHeight: 40,
    borderRadius: 20,
    backgroundColor: BRAND_COLOR,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 14,
    shadowColor: '#5D302D',
    shadowOpacity: 0.22,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
    zIndex: 4,
  },
  chatJumpToLatestText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
  },
  chatCenteredState: {
    flex: 1,
    minHeight: 220,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingHorizontal: 28,
  },
  chatCenteredText: {
    color: '#7D6B68',
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    fontWeight: '700',
  },
  chatMessageRow: {
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'flex-start',
    alignItems: 'flex-end',
    gap: 7,
  },
  chatMessageRowMine: {
    justifyContent: 'flex-end',
  },
  chatMessageAvatar: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#F8E7E3',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    marginBottom: 2,
  },
  chatMessageAvatarImage: {
    width: '100%',
    height: '100%',
  },
  chatMessageAvatarInitial: {
    color: '#8A514C',
    fontSize: 10,
    fontWeight: '900',
  },
  chatMessageBubble: {
    maxWidth: '74%',
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#F0E2DE',
    paddingHorizontal: 12,
    paddingVertical: 9,
    overflow: 'hidden',
  },
  chatMessageBubbleMine: {
    backgroundColor: BRAND_COLOR,
    borderColor: BRAND_COLOR,
  },
  chatMessageText: {
    color: '#2E2E32',
    fontSize: 15,
    lineHeight: 21,
    fontWeight: '500',
  },
  chatMessageTextWithImage: {
    marginTop: 8,
  },
  chatMessageTextMine: {
    color: '#FFFFFF',
  },
  chatMessageDeliveryText: {
    color: 'rgba(255, 255, 255, 0.82)',
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '700',
    marginTop: 5,
    textAlign: 'right',
  },
  chatMessageDeliveryFailed: {
    color: '#FFE2DC',
  },
  chatMessageImage: {
    width: 220,
    height: 160,
    maxWidth: '100%',
    borderRadius: 8,
    backgroundColor: '#F7EDEA',
  },
  chatImagePreviewBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(14, 12, 14, 0.96)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingVertical: 44,
  },
  chatImagePreviewImage: {
    width: '100%',
    height: '100%',
  },
  chatImagePreviewClose: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 54 : 22,
    right: 18,
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(255, 255, 255, 0.16)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  chatComposer: {
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#F0E2DE',
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 10,
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: Platform.OS === 'ios' ? 24 : 12,
  },
  chatImagesDisabledNotice: {
    backgroundColor: '#FFF8F5',
    borderTopWidth: 1,
    borderTopColor: '#F0E2DE',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 2,
  },
  chatImagesDisabledNoticeText: {
    color: '#765B56',
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '600',
  },
  chatClosedComposer: {
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#F0E2DE',
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: Platform.OS === 'ios' ? 24 : 14,
  },
  chatClosedComposerText: {
    flex: 1,
    color: '#8A514C',
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '800',
  },
  chatImageButton: {
    width: 44,
    height: 44,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFF8F5',
    borderWidth: 1,
    borderColor: '#F0D5D1',
  },
  chatComposerInput: {
    flex: 1,
    maxHeight: 110,
    minHeight: 44,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E8D0C3',
    color: '#2E2E32',
    backgroundColor: '#FFFCFA',
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    lineHeight: 21,
  },
  chatSendButton: {
    minWidth: 66,
    height: 44,
    borderRadius: 8,
    backgroundColor: BRAND_COLOR,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  chatSendButtonDisabled: {
    opacity: 0.55,
  },
  chatSendText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '900',
  },
  profileInputShell: {
    width: '100%',
    minHeight: 46,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E8D0C3',
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 13,
    gap: 10,
    marginBottom: 9,
  },
  readOnlyInput: {
    flex: 1,
    color: '#2E2E32',
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '600',
  },
  placeholderText: {
    color: '#A8A8AD',
    fontWeight: '500',
  },
  profileHint: {
    width: '100%',
    color: '#8B6461',
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '600',
    marginTop: -2,
    marginBottom: 9,
  },
  weddingDatePicker: {
    width: '100%',
    marginTop: -6,
    marginBottom: 8,
  },
  profileRow: {
    width: '100%',
    flexDirection: 'row',
    gap: 9,
    marginBottom: 9,
  },
  profileSmallInput: {
    flex: 1,
    minHeight: 46,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E8D0C3',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 12,
  },
  secondaryAction: {
    width: '100%',
    height: 48,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: BRAND_COLOR,
  },
  secondaryActionPending: {
    opacity: 0.72,
  },
  secondaryActionText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  signOutButton: {
    marginTop: 10,
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  bottomLeftSignOutButton: {
    alignSelf: 'flex-start',
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    marginLeft: 2,
  },
  anchoredSignOutButton: {
    position: 'absolute',
    left: 16,
    bottom: 10,
    zIndex: 4,
    marginTop: 0,
    marginLeft: 0,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: '#EADAD5',
    backgroundColor: 'rgba(255,255,255,0.88)',
  },
  signOutText: {
    color: '#7D7D80',
    fontSize: 14,
    fontWeight: '700',
  },
  orRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginVertical: 12,
  },
  orLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#DDD8D4',
  },
  orText: {
    color: '#8D8D92',
    fontSize: 13,
    fontWeight: '600',
  },
  createButton: {
    height: 48,
    borderRadius: 8,
    borderWidth: 1.2,
    borderColor: BRAND_COLOR,
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 11,
  },
  createButtonSubtle: {
    marginTop: 10,
  },
  createButtonText: {
    color: BRAND_COLOR,
    fontSize: 17,
    fontWeight: '700',
  },
  googleButton: {
    width: '100%',
    height: 44,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#D7DCE3',
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    marginTop: 8,
  },
  googleMark: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E5E7EC',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },
  googleMarkText: {
    color: '#4285F4',
    fontSize: 17,
    fontWeight: '800',
  },
  googleButtonText: {
    color: '#3C4043',
    fontSize: 16,
    fontWeight: '700',
  },
  appleButton: {
    width: '100%',
    height: 44,
    marginTop: 8,
  },
  appleButtonDisabled: {
    opacity: 0.72,
  },
  supportLink: {
    alignItems: 'center',
    marginTop: 8,
    gap: 3,
  },
  supportText: {
    color: '#38383D',
    fontSize: 13,
    lineHeight: 17,
    textAlign: 'center',
    fontWeight: '500',
  },
  container: {
    flex: 1,
    backgroundColor: '#FFF8F5',
  },
  webContainer: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  chatScreenHeader: {
    minHeight: 58,
    borderBottomWidth: 1,
    borderBottomColor: '#F0E2DE',
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
  },
  chatBackButton: {
    width: 42,
    height: 42,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFF8F5',
  },
  chatScreenTitleWrap: {
    flex: 1,
    alignItems: 'flex-start',
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  chatScreenTitle: {
    color: '#2E2E32',
    fontSize: 18,
    lineHeight: 22,
    fontWeight: '800',
  },
  chatScreenSubtitle: {
    color: '#8A7672',
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '600',
    marginTop: 1,
  },
  chatReportButton: {
    height: 38,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 5,
    backgroundColor: '#FFF1EE',
    paddingHorizontal: 9,
    marginRight: 8,
  },
  chatReportButtonDisabled: {
    opacity: 0.62,
  },
  chatReportText: {
    color: '#8A514C',
    fontSize: 12,
    fontWeight: '900',
  },
  chatHeaderSpacer: {
    width: 42,
    height: 42,
  },
  webview: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  webviewWithCoupleBottomNav: {
    marginBottom: Platform.OS === 'ios' ? 66 : 60,
  },
  wedWebsiteWebview: {
    marginTop: 36,
  },
  browserNavControls: {
    position: 'absolute',
    top: 8,
    alignSelf: 'center',
    height: 38,
    borderRadius: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.94)',
    borderWidth: 1,
    borderColor: '#F0E2DE',
    flexDirection: 'row',
    alignItems: 'center',
    overflow: 'hidden',
    shadowColor: '#2E2E32',
    shadowOpacity: 0.12,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 5,
    zIndex: 40,
  },
  browserNavControlsCompact: {
    top: 2,
    height: 32,
    borderRadius: 7,
  },
  browserNavButton: {
    width: 44,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
  },
  browserNavButtonCompact: {
    width: 38,
    height: 32,
  },
  browserNavButtonDisabled: {
    opacity: 0.55,
  },
  browserNavDivider: {
    width: 1,
    height: 22,
    backgroundColor: '#F0E2DE',
  },
  browserNavDividerCompact: {
    height: 18,
  },
  loading: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },
  topLoader: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 58 : 46,
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center',
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 1,
    borderColor: '#F0D8D2',
    backgroundColor: 'rgba(255, 255, 255, 0.96)',
    shadowColor: '#2E2E32',
    shadowOpacity: 0.14,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    zIndex: 60,
    elevation: 60,
  },
  errorView: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    backgroundColor: '#FFFFFF',
  },
  errorTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#3B3433',
    marginTop: 16,
  },
  errorText: {
    fontSize: 14,
    color: '#6E6E73',
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 21,
  },
  retryButton: {
    marginTop: 24,
    paddingHorizontal: 28,
    paddingVertical: 12,
    backgroundColor: BRAND_COLOR,
    borderRadius: 24,
  },
  retryText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },
});
