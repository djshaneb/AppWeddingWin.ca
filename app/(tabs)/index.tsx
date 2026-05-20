import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  ActivityIndicator,
  Image,
  ImageBackground,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  Vibration,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from 'expo-router';
import {
  WebView,
  type WebViewNavigation,
} from 'react-native-webview';
import * as AuthSession from 'expo-auth-session';
import * as AppleAuthentication from 'expo-apple-authentication';
import {
  CameraView,
  useCameraPermissions,
  type BarcodeScanningResult,
} from 'expo-camera';
import Constants from 'expo-constants';
import { createAudioPlayer, setAudioModeAsync } from 'expo-audio';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import * as Notifications from 'expo-notifications';
import * as SecureStore from 'expo-secure-store';
import * as WebBrowser from 'expo-web-browser';
import DateTimePicker from '@react-native-community/datetimepicker';
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Eye,
  LockKeyhole,
  Mail,
  ImagePlus,
  MessageCircle,
  QrCode,
  ScanLine,
  Store,
  TriangleAlert as AlertTriangle,
  X,
  UserPlus,
  UserRound,
} from 'lucide-react-native';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

type ShouldStartLoadRequest = { url: string };
type SignupRole = 'couple' | 'vendor';
type LoginCredentials = { email: string; password: string; role?: SignupRole };
type ContactProfile = {
  firstName: string;
  email: string;
  weddingDate: string;
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
type ChatStatus = {
  unread_count?: number;
  latest_label?: string;
  inbox_path?: string;
};
type NativeChatThread = {
  id: string;
  token: string;
  title: string;
  avatar_url?: string;
  subtitle: string;
  updated_at: string;
  unread_count: number;
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
};
type NativeChatSyncResponse = {
  ok?: boolean;
  error?: string;
  detail?: string;
  threads?: NativeChatThread[];
  selected_thread_token?: string;
  messages?: NativeChatMessage[];
  unread_count?: number;
};
type QrScanAction = 'open-in-app' | 'open-external' | 'raw-code';
type QrBingoVendor = {
  id: string;
  name: string;
  cover_photo?: string;
  full_filename?: string;
  user_id?: string;
};
type QrBingoRaffleOffer = {
  vendor_id: string;
  vendor_name: string;
  prize_title: string;
  prize_description?: string;
  terms_url: string;
  consent_version: string;
  share_fields: string[];
};
type QrBingoSyncResponse = {
  ok?: boolean;
  error?: string;
  detail?: string;
  vendors?: QrBingoVendor[];
  scanned?: string[];
  scanned_count?: number;
  total_count?: number;
  matched_vendor?: QrBingoVendor;
  raffle_offer?: QrBingoRaffleOffer | null;
  completed?: boolean;
};
type QrBingoRaffleSettings = {
  enabled: boolean;
  prize_title: string;
  prize_description: string;
  claim_instructions: string;
  legal_terms_accepted: boolean;
  draw_opens_at: string;
};
type QrBingoRaffleEntry = {
  id: string;
  couple_name: string;
  couple_email: string;
  couple_phone: string;
  couple_wedding_date: string;
  consented_at?: string;
  created_at?: string;
};
type QrBingoRaffleDraw = {
  id: string;
  winner_name: string;
  winner_email: string;
  prize_title: string;
  draw_number: number;
  draw_reason: string;
  drawn_at: string;
  email_error?: string;
};
type QrBingoVendorRaffleResponse = {
  ok?: boolean;
  error?: string;
  detail?: string;
  vendor?: QrBingoVendor;
  settings?: QrBingoRaffleSettings;
  entries?: QrBingoRaffleEntry[];
  draws?: QrBingoRaffleDraw[];
  can_draw?: boolean;
  draw_opens_at?: string;
  terms_url?: string;
  exports?: {
    csv?: string;
    txt?: string;
  };
};
type QrScanFeedbackTone = 'idle' | 'success' | 'duplicate' | 'error';

const TARGET_URL = 'https://www.weddingwin.ca';
const WEBSITE_LOGOUT_URL = `${TARGET_URL}/account/logout`;
const DEFAULT_BRIDGE_TARGET_PATH = '/account/home';
const COUPLE_MEMBERSHIP_PLAN_ID = '18';
const VENDOR_MEMBERSHIP_PLAN_ID = '17';
const TERMS_URL = `${TARGET_URL}/about/terms`;
const PRIVACY_URL = `${TARGET_URL}/about/privacy`;
const TERMS_VERSION = '2026-05-17';
const PRIVACY_VERSION = '2026-05-17';
const APP_BACKEND_URL = 'https://pszcjoyabwvzsxxjtkhs.supabase.co';
const APP_BACKEND_PUBLISHABLE_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBzemNqb3lhYnd2enN4eGp0a2hzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg2OTMxMTYsImV4cCI6MjA5NDI2OTExNn0.QLCEmNcn1WAks0IHkCLmI3iY5K4GnRxZ9Sfy89GYrLo';
const QR_BINGO_SYNC_FUNCTION_URL = `${APP_BACKEND_URL}/functions/v1/bd-qr-bingo-sync`;
const VENDOR_RAFFLE_FUNCTION_URL = `${APP_BACKEND_URL}/functions/v1/bd-qr-bingo-vendor-sync`;
const BRAND_COLOR = '#C66A6A';
const OAUTH_RETURN_URL = 'https://www.weddingwin.ca/auth-callback';
const APP_UA_TAG = 'WeddingWinApp/1.0';
const NATIVE_MEMBER_SESSION_KEY = 'weddingwin.nativeMember.v1';
const NATIVE_BRIDGE_SESSION_KEY = 'weddingwin.nativeBridgeSession.v1';
const CHAT_UNREAD_SESSION_KEY = 'weddingwin.chatUnread.v1';
const PUSH_TOKEN_SESSION_KEY = 'weddingwin.expoPushToken.v1';
const CHAT_STATUS_POLL_MS = 30000;
const DEFAULT_CHAT_INBOX_PATH = '/account/chat_messages';
const CHAT_DING_SOUND = require('../../assets/sounds/chat-ding.wav');
const CHAT_INBOX_PATHS = new Set([
  '/account/chat_messages',
  '/account/chat/messages',
]);
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
    if (
      host.endsWith('.supabase.co') &&
      u.pathname.startsWith('/auth/v1/authorize')
    ) {
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

function isBdAppGoogleLoginUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return (
      u.hostname.toLowerCase().endsWith('weddingwin.ca') &&
      u.pathname === '/login' &&
      u.searchParams.get('ww_app_oauth') === '1'
    );
  } catch {
    return false;
  }
}

function membershipPlanForRole(role: SignupRole) {
  return role === 'vendor' ? VENDOR_MEMBERSHIP_PLAN_ID : COUPLE_MEMBERSHIP_PLAN_ID;
}

function buildNativeGoogleStartUrl(
  returnUrl: string,
  role: SignupRole,
  consent?: SignupConsent
): string {
  const url = new URL('/auth/google-start', TARGET_URL);
  url.searchParams.set('redirect_to', returnUrl);
  url.searchParams.set('subscription_id', membershipPlanForRole(role));
  if (consent) {
    url.searchParams.set('accepted_terms', '1');
    url.searchParams.set('accepted_privacy', '1');
    url.searchParams.set('accepted_at', consent.acceptedAt);
    url.searchParams.set('terms_version', consent.termsVersion);
    url.searchParams.set('privacy_version', consent.privacyVersion);
  }
  return url.toString();
}

function decodeBase64UrlJson<T>(value: string | null): T | null {
  try {
    if (!value || typeof globalThis.atob !== 'function') return null;
    const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(
      normalized.length + ((4 - (normalized.length % 4)) % 4),
      '='
    );
    const decoded = globalThis.atob(padded);
    const unicodeDecoded = decodeURIComponent(
      decoded
        .split('')
        .map((char) => `%${char.charCodeAt(0).toString(16).padStart(2, '0')}`)
        .join('')
    );
    return JSON.parse(unicodeDecoded);
  } catch {
    return null;
  }
}

function buildTokenLoginUrl(token: string, accountPath: string): string {
  const directPath = accountPath
    .replace(/^\/account\/?/, '/')
    .replace(/^\/$/, '/home');

  return `${TARGET_URL}/login/token/${encodeURIComponent(token)}${directPath}`;
}

const IOS_USER_AGENT =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1 ' +
  APP_UA_TAG;
const ANDROID_USER_AGENT =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36 ' +
  APP_UA_TAG;

const USER_AGENT = Platform.OS === 'android' ? ANDROID_USER_AGENT : IOS_USER_AGENT;
const HERO_IMAGE = {
  uri: `${TARGET_URL}/images/Happy-Couple-on-Wedding-Day_1.jpg`,
} as const;
const LOGO_IMAGE = {
  uri: `${TARGET_URL}/images/CoralLogoTransB.png`,
} as const;
const COUPLE_MENU_WEBSITE_IMAGE = require('../../assets/images/couple-menu/website-builder.webp');
const COUPLE_MENU_DASHBOARD_IMAGE = require('../../assets/images/couple-menu/vendor-dashboard.webp');
const COUPLE_MENU_CHAT_IMAGE = require('../../assets/images/couple-menu/private-chat.webp');

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

    if (!host.endsWith('weddingwin.ca')) return false;

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

    if (!host.endsWith('weddingwin.ca')) return false;

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
    if (!parsed.hostname.toLowerCase().endsWith('weddingwin.ca')) return '';
    return parsed.pathname.replace(/\/+$/, '') || '/';
  } catch {
    return '';
  }
}

function isWedWebsiteUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname.replace(/^www\./, '').toLowerCase();
    return host === 'wedwebsite.ca' || host.endsWith('.wedwebsite.ca');
  } catch {
    return false;
  }
}

function isChatInboxPath(path: string): boolean {
  return CHAT_INBOX_PATHS.has(path.replace(/\/+$/, '') || '/');
}

function needsContactProfile(member: NativeMember | null): boolean {
  if (!member?.email) return false;
  const firstName = String(member.first_name || '').trim();
  return (
    isApplePrivateRelayEmail(member.email) ||
    !firstName ||
    firstName.toLowerCase() === 'weddingwin couple' ||
    !String(member.wedding_date || '').trim()
  );
}

function isCoupleAccount(member: NativeMember | null): boolean {
  const planId = member?.subscription_id;
  return planId != null && String(planId) === COUPLE_MEMBERSHIP_PLAN_ID;
}

function isApplePrivateRelayEmail(email?: string): boolean {
  return String(email || '').trim().toLowerCase().endsWith('@privaterelay.appleid.com');
}

function isValidRealEmail(email: string): boolean {
  const clean = email.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean) && !isApplePrivateRelayEmail(clean);
}

function formatWeddingDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function parseWeddingDate(value?: string): Date {
  if (value && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split('-').map(Number);
    return new Date(year, month - 1, day);
  }
  const fallback = new Date();
  fallback.setMonth(fallback.getMonth() + 6);
  return fallback;
}

function classifyQrScan(value: string): QrScanAction {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    return host === 'weddingwin.ca' ||
      host.endsWith('.weddingwin.ca') ||
      host === 'wedwebsite.ca' ||
      host.endsWith('.wedwebsite.ca')
      ? 'open-in-app'
      : 'open-external';
  } catch {
    return 'raw-code';
  }
}

function matchQrBingoVendor(value: string, vendors: QrBingoVendor[]) {
  const raw = value.trim();
  if (!raw) return null;

  const normalizedUrl = (() => {
    try {
      const url = new URL(raw);
      url.hash = '';
      return url.toString().replace(/\/+$/, '');
    } catch {
      return '';
    }
  })();

  const directUrlMatch = normalizedUrl
    ? vendors.find((vendor) => {
        const vendorUrl = String(vendor.full_filename || '').replace(/\/+$/, '');
        return vendorUrl === normalizedUrl;
      })
    : null;
  if (directUrlMatch) return directUrlMatch;

  const prefix = 'nws://vendor/';
  let id = '';
  if (raw.toLowerCase().startsWith(prefix)) {
    id = raw.slice(prefix.length).trim();
  } else if (/^\d+$/.test(raw)) {
    id = raw;
  }

  if (!id) return null;
  return vendors.find((vendor) => vendor.id === id || String(vendor.user_id || '') === id) || null;
}

function NativeQrScanner({
  visible,
  onClose,
  onScan,
  nativeSession,
}: {
  visible: boolean;
  onClose: () => void;
  onScan: (value: string) => void;
  nativeSession: NativeBridgeSession | null;
}) {
  const [permission, requestPermission] = useCameraPermissions();
  const [scanLocked, setScanLocked] = useState(false);
  const [loadingBingo, setLoadingBingo] = useState(false);
  const [savingBingo, setSavingBingo] = useState(false);
  const [bingoError, setBingoError] = useState<string | null>(null);
  const [vendors, setVendors] = useState<QrBingoVendor[]>([]);
  const [bingoTotalCount, setBingoTotalCount] = useState<number | null>(null);
  const [scannedVendorIds, setScannedVendorIds] = useState<Set<string>>(() => new Set());
  const [lastScanLabel, setLastScanLabel] = useState('');
  const [lastScanTone, setLastScanTone] = useState<QrScanFeedbackTone>('idle');
  const [raffleOffer, setRaffleOffer] = useState<QrBingoRaffleOffer | null>(null);
  const [raffleSaving, setRaffleSaving] = useState(false);

  const loadBingoCard = useCallback(async () => {
    if (!nativeSession?.user_id || !nativeSession?.token) {
      setBingoError('Sign in to your WeddingWin account before scanning booth QR codes.');
      return;
    }

    setLoadingBingo(true);
    setBingoError(null);

    try {
      const response = await fetch(QR_BINGO_SYNC_FUNCTION_URL, {
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
      });
      const data = (await response.json()) as QrBingoSyncResponse;
      if (!response.ok || data?.ok === false) {
        throw new Error(data?.detail || data?.error || 'QR Bingo is unavailable right now.');
      }

      setVendors(data.vendors || []);
      setBingoTotalCount(typeof data.total_count === 'number' ? data.total_count : data.vendors?.length || 0);
      setScannedVendorIds(new Set((data.scanned || []).map(String)));
    } catch (error) {
      setBingoError(error instanceof Error ? error.message : 'QR Bingo is unavailable right now.');
    } finally {
      setLoadingBingo(false);
    }
  }, [nativeSession]);

  useEffect(() => {
    if (!visible) return;
    setScanLocked(false);
    setLastScanLabel('');
    setLastScanTone('idle');
    setRaffleOffer(null);
    setBingoTotalCount(null);
    loadBingoCard();
    if (permission && !permission.granted && permission.canAskAgain) {
      requestPermission().catch(() => {});
    }
  }, [loadBingoCard, permission, requestPermission, visible]);

  const saveBingoScan = useCallback(async (vendor: QrBingoVendor) => {
    if (!nativeSession?.user_id || !nativeSession?.token) {
      setBingoError('Sign in to your WeddingWin account before scanning booth QR codes.');
      return false;
    }

    setSavingBingo(true);
    setBingoError(null);

    try {
      const response = await fetch(QR_BINGO_SYNC_FUNCTION_URL, {
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
        }),
      });
      const data = (await response.json()) as QrBingoSyncResponse;
      if (!response.ok || data?.ok === false) {
        throw new Error(data?.detail || data?.error || 'This vendor scan could not be saved.');
      }

      setVendors(data.vendors || vendors);
      setBingoTotalCount(typeof data.total_count === 'number' ? data.total_count : data.vendors?.length || vendors.length);
      setScannedVendorIds(new Set((data.scanned || [vendor.id]).map(String)));
      setLastScanLabel(
        data.completed
          ? 'Grand prize entry complete! You scanned every vendor booth. You are entered to win.'
          : `Scanned: ${vendor.name}`
      );
      setLastScanTone('success');
      if (data.raffle_offer) {
        setRaffleOffer(data.raffle_offer);
      }
      return true;
    } catch (error) {
      setBingoError(error instanceof Error ? error.message : 'This vendor scan could not be saved.');
      return false;
    } finally {
      setSavingBingo(false);
    }
  }, [nativeSession, vendors]);

  const handleBarcodeScanned = useCallback(async (result: BarcodeScanningResult) => {
    const value = result.data?.trim();
    if (scanLocked || !value) return;
    setScanLocked(true);
    const matched = matchQrBingoVendor(value, vendors);
    if (!matched) {
      setLastScanLabel('Unrecognized QR');
      setLastScanTone('error');
      onScan(value);
      setTimeout(() => setScanLocked(false), 1600);
      return;
    }

    if (scannedVendorIds.has(matched.id)) {
      setBingoError(null);
      setLastScanLabel(`Already scanned: ${matched.name}`);
      setLastScanTone('duplicate');
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      setTimeout(() => setScanLocked(false), 1200);
      return;
    }

    const saved = await saveBingoScan(matched);
    if (saved) {
      onScan(value);
    }
    setTimeout(() => setScanLocked(false), 1600);
  }, [onScan, saveBingoScan, scanLocked, scannedVendorIds, vendors]);

  const enterRaffle = useCallback(async () => {
    if (!raffleOffer || raffleSaving || !nativeSession?.user_id || !nativeSession?.token) return;
    setRaffleSaving(true);
    setBingoError(null);

    try {
      const response = await fetch(QR_BINGO_SYNC_FUNCTION_URL, {
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
        }),
      });
      const data = await response.json();
      if (!response.ok || data?.ok === false) {
        throw new Error(data?.detail || data?.error || 'Could not enter this draw.');
      }
      setLastScanLabel(data.already_entered ? 'You are already entered for this vendor draw.' : `Entered: ${raffleOffer.vendor_name} draw`);
      setLastScanTone('success');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      setRaffleOffer(null);
    } catch (error) {
      setBingoError(error instanceof Error ? error.message : 'Could not enter this draw.');
    } finally {
      setRaffleSaving(false);
    }
  }, [nativeSession, raffleOffer, raffleSaving]);

  if (!visible) return null;

  const hasPermission = permission?.granted;
  const canAskPermission = permission?.canAskAgain !== false;
  const scannedCount = scannedVendorIds.size;
  const totalCount = bingoTotalCount ?? vendors.length;
  const totalLabel = totalCount > 0 ? String(totalCount) : '...';
  const progressPercent = totalCount > 0 ? Math.round((scannedCount / totalCount) * 100) : 0;
  const completed = totalCount > 0 && scannedCount === totalCount;

  return (
    <View style={styles.qrOverlay}>
      <View style={styles.qrHeader}>
        <View>
          <Text style={styles.qrEyebrow}>Niagara Wedding Show</Text>
          <Text style={styles.qrTitle}>QR Bingo</Text>
        </View>
        <TouchableOpacity
          style={styles.qrCloseButton}
          activeOpacity={0.78}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Close QR scanner">
          <X size={22} color="#2E2E32" strokeWidth={2.2} />
        </TouchableOpacity>
      </View>

      <Text style={styles.qrSubTitle}>Visit every vendor booth. Scan each QR. Fill your card.</Text>

      <View style={styles.qrCameraFrame}>
        {hasPermission ? (
          <>
            <CameraView
              style={styles.qrCamera}
              facing="back"
              barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
              onBarcodeScanned={scanLocked ? undefined : handleBarcodeScanned}
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
                  lastScanTone === 'duplicate' && styles.qrCameraFeedbackDuplicate,
                  lastScanTone === 'error' && styles.qrCameraFeedbackError,
                  lastScanTone === 'success' && styles.qrCameraFeedbackSuccess,
                ]}
                pointerEvents="none">
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
                onPress={() => requestPermission()}>
                <Text style={styles.qrPermissionButtonText}>Allow Camera</Text>
              </TouchableOpacity>
            ) : (
              <Text style={styles.qrPermissionText}>
                Camera access is blocked in settings. Enable it there, then reopen the scanner.
              </Text>
            )}
          </View>
        )}
      </View>

      <View style={styles.qrFooter}>
        <View style={styles.qrProgressHeader}>
          <Text style={styles.qrFooterTitle}>{scannedCount} / {totalLabel} scanned</Text>
          <Text style={styles.qrProgressPercent}>{progressPercent}%</Text>
        </View>
        <View
          style={styles.qrProgressTrack}
          accessibilityRole="progressbar"
          accessibilityValue={{ min: 0, max: totalCount, now: scannedCount }}>
          <View style={[styles.qrProgressFill, { width: `${progressPercent}%` }]} />
        </View>
        {lastScanLabel ? (
          <Text
            style={[
              styles.qrLastScanText,
              lastScanTone === 'duplicate' && styles.qrLastScanDuplicate,
              lastScanTone === 'error' && styles.qrLastScanError,
              completed && styles.qrLastScanComplete,
            ]}>
            {lastScanLabel}
          </Text>
        ) : (
          <Text style={styles.qrFooterText}>Scan the QR code at each vendor booth to unlock their card.</Text>
        )}
        {bingoError ? <Text style={styles.qrErrorText}>{bingoError}</Text> : null}
        {loadingBingo ? (
          <View style={styles.qrGridLoading}>
            <ActivityIndicator size="small" color={BRAND_COLOR} />
          </View>
        ) : (
          <ScrollView
            style={styles.qrVendorList}
            contentContainerStyle={styles.qrVendorGrid}
            showsVerticalScrollIndicator={false}>
            {vendors.map((vendor) => {
              const isScanned = scannedVendorIds.has(vendor.id);
              return (
                <View
                  key={vendor.id}
                  style={[styles.qrVendorTile, isScanned && styles.qrVendorTileScanned]}>
                  {vendor.cover_photo ? (
                    <Image source={{ uri: vendor.cover_photo }} style={styles.qrVendorImage} />
                  ) : (
                    <View style={styles.qrVendorImagePlaceholder}>
                      <QrCode size={22} color="#BFAFAA" strokeWidth={1.7} />
                    </View>
                  )}
                  <Text style={styles.qrVendorName} numberOfLines={2}>{vendor.name}</Text>
                  {isScanned ? (
                    <View style={styles.qrVendorCheck}>
                      <Text style={styles.qrVendorCheckText}>{'\u2713'}</Text>
                    </View>
                  ) : null}
                </View>
              );
            })}
          </ScrollView>
        )}
      </View>
      <Modal
        visible={!!raffleOffer}
        transparent
        animationType="fade"
        onRequestClose={() => setRaffleOffer(null)}>
        <View style={styles.raffleModalBackdrop}>
          <View style={styles.raffleModalCard}>
            <Text style={styles.raffleModalEyebrow}>Vendor Draw</Text>
            <Text style={styles.raffleModalTitle}>{raffleOffer?.prize_title || 'Enter vendor draw'}</Text>
            <Text style={styles.raffleModalVendor}>{raffleOffer?.vendor_name}</Text>
            {raffleOffer?.prize_description ? (
              <Text style={styles.raffleModalText}>{raffleOffer.prize_description}</Text>
            ) : null}
            <Text style={styles.raffleModalText}>
              If you enter, Wedding Win Inc. will share your name, email, phone number, and wedding date with this vendor for their draw. This opt-in is final.
            </Text>
            <TouchableOpacity
              activeOpacity={0.76}
              onPress={() => raffleOffer?.terms_url && Linking.openURL(raffleOffer.terms_url).catch(() => {})}>
              <Text style={styles.raffleTermsLink}>View draw rules</Text>
            </TouchableOpacity>
            <View style={styles.raffleModalActions}>
              <TouchableOpacity
                style={styles.raffleCancelButton}
                activeOpacity={0.78}
                onPress={() => setRaffleOffer(null)}
                disabled={raffleSaving}>
                <Text style={styles.raffleCancelText}>No Thanks</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.raffleEnterButton}
                activeOpacity={0.86}
                onPress={enterRaffle}
                disabled={raffleSaving}>
                {raffleSaving ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.raffleEnterText}>Enter Draw</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function NativeHome({
  onOpenUrl,
  onOpenWebsiteBuilder,
  onOpenDashboard,
  onOpenChat,
  onOpenQrScanner,
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
}: {
  onOpenUrl: (path: string) => void;
  onOpenWebsiteBuilder: () => void;
  onOpenDashboard: () => void;
  onOpenChat: () => void;
  onOpenQrScanner: () => void;
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
  onSignOut: () => void;
  nativeSession: NativeBridgeSession | null;
}) {
  const [role, setRole] = useState<'couple' | 'vendor'>('couple');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('login');
  const [wizardStep, setWizardStep] = useState<1 | 2>(1);
  const [profileFirstName, setProfileFirstName] = useState(member?.first_name || '');
  const [profileEmail, setProfileEmail] = useState(
    isApplePrivateRelayEmail(member?.email) ? '' : member?.email || ''
  );
  const [profileWeddingDate, setProfileWeddingDate] = useState(member?.wedding_date || '');
  const [showWeddingPicker, setShowWeddingPicker] = useState(false);
  const [signupConsentAccepted, setSignupConsentAccepted] = useState(false);
  const [showVendorRaffle, setShowVendorRaffle] = useState(false);
  const [vendorRaffleLoading, setVendorRaffleLoading] = useState(false);
  const [vendorRaffleSaving, setVendorRaffleSaving] = useState(false);
  const [vendorRaffleDrawing, setVendorRaffleDrawing] = useState(false);
  const [vendorRaffleError, setVendorRaffleError] = useState<string | null>(null);
  const [vendorRaffle, setVendorRaffle] = useState<QrBingoVendorRaffleResponse | null>(null);
  const [raffleEnabled, setRaffleEnabled] = useState(false);
  const [rafflePrizeTitle, setRafflePrizeTitle] = useState('');
  const [rafflePrizeDescription, setRafflePrizeDescription] = useState('');
  const [raffleClaimInstructions, setRaffleClaimInstructions] = useState('');
  const [raffleLegalAccepted, setRaffleLegalAccepted] = useState(false);

  useEffect(() => {
    setProfileFirstName(member?.first_name || '');
    setProfileEmail(isApplePrivateRelayEmail(member?.email) ? '' : member?.email || '');
    setProfileWeddingDate(member?.wedding_date || '');
  }, [
    member?.email,
    member?.first_name,
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
      'Please agree to WeddingWin\'s Terms of Use and Privacy Policy before creating an account.'
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
        'Add your email and password to sign in.'
      );
      return;
    }
    onEmailLogin({ email: cleanEmail, password: password.trim(), role });
  };

  const createMemberAccount = () => {
    if (signupLoading) return;

    const cleanEmail = email.trim();
    if (
      !cleanEmail ||
      !password.trim()
    ) {
      Alert.alert(
        'Finish your account',
        'Add your email and password.'
      );
      return;
    }

    if (!isValidRealEmail(cleanEmail)) {
      Alert.alert(
        'Use your real email',
        'Please enter your regular email address for website login and vendor alerts.'
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
      password: password.trim(),
      weddingDate: '',
      consent: buildSignupConsent(),
    });
  };

  const memberIsCouple = isCoupleAccount(member);
  const displayName =
    !memberIsCouple && member?.company
      ? member.company
      : [member?.first_name, member?.last_name].filter(Boolean).join(' ') ||
        member?.company ||
        member?.email;
  const shouldCompleteProfile = memberIsCouple && needsContactProfile(member);
  const mustReplaceRelayEmail = isApplePrivateRelayEmail(member?.email);
  const isVendorRole = role === 'vendor';
  const showCoupleMenu = !!member && memberIsCouple;
  const showVendorMenu = !!member && !memberIsCouple;

  const applyVendorRaffle = (data: QrBingoVendorRaffleResponse) => {
    setVendorRaffle(data);
    setRaffleEnabled(Boolean(data.settings?.enabled));
    setRafflePrizeTitle(data.settings?.prize_title || '');
    setRafflePrizeDescription(data.settings?.prize_description || '');
    setRaffleClaimInstructions(data.settings?.claim_instructions || '');
    setRaffleLegalAccepted(Boolean(data.settings?.legal_terms_accepted));
  };

  const fetchVendorRaffle = async () => {
    if (!nativeSession?.user_id || !nativeSession?.token) {
      setVendorRaffleError('Sign in again before opening vendor draw tools.');
      return;
    }
    setVendorRaffleLoading(true);
    setVendorRaffleError(null);
    try {
      const response = await fetch(VENDOR_RAFFLE_FUNCTION_URL, {
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
      });
      const data = (await response.json()) as QrBingoVendorRaffleResponse;
      if (!response.ok || data?.ok === false) {
        throw new Error(data?.detail || data?.error || 'Vendor draw tools are unavailable.');
      }
      applyVendorRaffle(data);
    } catch (error) {
      setVendorRaffleError(error instanceof Error ? error.message : 'Vendor draw tools are unavailable.');
    } finally {
      setVendorRaffleLoading(false);
    }
  };

  const openVendorRaffle = () => {
    setShowVendorRaffle(true);
    fetchVendorRaffle();
  };

  const saveVendorRaffle = async () => {
    if (!nativeSession?.user_id || !nativeSession?.token || vendorRaffleSaving) return;
    setVendorRaffleSaving(true);
    setVendorRaffleError(null);
    try {
      const response = await fetch(VENDOR_RAFFLE_FUNCTION_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${APP_BACKEND_PUBLISHABLE_KEY}`,
          apikey: APP_BACKEND_PUBLISHABLE_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'vendor_raffle_update',
          native_session: nativeSession,
          enabled: raffleEnabled,
          prize_title: rafflePrizeTitle,
          prize_description: rafflePrizeDescription,
          claim_instructions: raffleClaimInstructions,
          legal_terms_accepted: raffleLegalAccepted,
        }),
      });
      const data = (await response.json()) as QrBingoVendorRaffleResponse;
      if (!response.ok || data?.ok === false) {
        throw new Error(data?.detail || data?.error || 'Could not save this draw.');
      }
      applyVendorRaffle(data);
      Alert.alert('Saved', 'Your QR Bingo vendor draw settings are saved.');
    } catch (error) {
      setVendorRaffleError(error instanceof Error ? error.message : 'Could not save this draw.');
    } finally {
      setVendorRaffleSaving(false);
    }
  };

  const drawVendorWinner = async (reason = 'initial') => {
    if (!nativeSession?.user_id || !nativeSession?.token || vendorRaffleDrawing) return;
    Alert.alert(
      'Pick a winner?',
      'Wedding Win Inc. will generate emails for both you and the selected couple. You can redraw later for an extra prize or unclaimed prize.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Pick Winner',
          onPress: async () => {
            setVendorRaffleDrawing(true);
            setVendorRaffleError(null);
            try {
              const response = await fetch(VENDOR_RAFFLE_FUNCTION_URL, {
                method: 'POST',
                headers: {
                  Authorization: `Bearer ${APP_BACKEND_PUBLISHABLE_KEY}`,
                  apikey: APP_BACKEND_PUBLISHABLE_KEY,
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  action: 'vendor_raffle_draw',
                  native_session: nativeSession,
                  draw_reason: reason,
                }),
              });
              const data = (await response.json()) as QrBingoVendorRaffleResponse & { draw?: QrBingoRaffleDraw };
              if (!response.ok || data?.ok === false) {
                throw new Error(data?.detail || data?.error || 'Could not pick a winner.');
              }
              applyVendorRaffle(data);
              Alert.alert('Winner Selected', data.draw?.winner_name || 'Winner selected.');
            } catch (error) {
              setVendorRaffleError(error instanceof Error ? error.message : 'Could not pick a winner.');
            } finally {
              setVendorRaffleDrawing(false);
            }
          },
        },
      ]
    );
  };

  const shareVendorExport = (kind: 'csv' | 'txt') => {
    const content = vendorRaffle?.exports?.[kind];
    if (!content) {
      Alert.alert('Nothing to export', 'No couples have opted in yet.');
      return;
    }
    Share.share({
      title: `WeddingWin QR Bingo draw ${kind.toUpperCase()}`,
      message: content,
    }).catch(() => {});
  };

  const saveProfile = () => {
    if (profileSaveLoading) return;

    if (
      !profileFirstName.trim() ||
      !profileEmail.trim() ||
      !profileWeddingDate.trim()
    ) {
      Alert.alert(
        'Finish your profile',
        'Add your first name, email address, and wedding date so WeddingWin can complete your couple account.'
      );
      return;
    }

    if (!isValidRealEmail(profileEmail)) {
      Alert.alert(
        'Use your real email',
        'Please enter your regular email address. Apple private relay emails cannot be used for WeddingWin vendor alerts or website account access.'
      );
      return;
    }

    onCompleteProfile({
      firstName: profileFirstName.trim(),
      email: profileEmail.trim().toLowerCase(),
      weddingDate: profileWeddingDate.trim(),
    });
  };

  return (
    <SafeAreaView style={styles.nativeContainer} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.nativeContent}
        showsVerticalScrollIndicator={false}>
        <ImageBackground source={HERO_IMAGE} style={styles.loginBackdrop}>
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

          <View style={styles.logoWrap}>
            <Image
              source={LOGO_IMAGE}
              style={styles.brandLogo}
              resizeMode="contain"
              accessibilityLabel="WeddingWin.ca"
            />
            <Text style={styles.countryLabel}>CANADA</Text>
          </View>
          <Text style={styles.tagline}>
            {isVendorRole
              ? 'Where the perfect couples can find you'
              : 'Find your perfect venue & vendors'}
          </Text>

          {!member && wizardStep === 1 ? (
            <View style={styles.pathWizard}>
              <Text style={styles.pathTitle}>Choose your path</Text>
              <View style={styles.pathDivider}>
                <View style={styles.pathLine} />
                <Text style={styles.pathHeart}>{'\u2665'}</Text>
                <View style={styles.pathLine} />
              </View>
              <Text style={styles.pathIntro}>
                {"Tell us how you'd like to use WeddingWin so we can personalize your experience."}
              </Text>

              <TouchableOpacity
                style={[
                  styles.pathCard,
                  role === 'couple' && styles.pathCardActive,
                ]}
                activeOpacity={0.88}
                onPress={() => setRole('couple')}>
                <View style={[styles.pathIconCircle, styles.pathIconCircleCouple]}>
                  <UserRound size={44} color={BRAND_COLOR} strokeWidth={1.45} />
                </View>
                <View style={styles.pathCopy}>
                  <Text
                    style={[
                      styles.pathCardTitle,
                      role === 'couple' && styles.pathCardTitleActive,
                    ]}>
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
                  ]}>
                  {role === 'couple' ? <Text style={styles.pathRadioCheck}>{'\u2713'}</Text> : null}
                </View>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.pathCard,
                  role === 'vendor' && styles.pathCardActive,
                ]}
                activeOpacity={0.88}
                onPress={() => setRole('vendor')}>
                <View style={[styles.pathIconCircle, styles.pathIconCircleVendor]}>
                  <Store size={44} color="#B9882E" strokeWidth={1.45} />
                </View>
                <View style={styles.pathCopy}>
                  <Text
                    style={[
                      styles.pathCardTitle,
                      role === 'vendor' && styles.pathCardTitleActive,
                    ]}>
                    Vendor
                  </Text>
                  <Text style={styles.pathCardText}>
                    Showcase your business, get discovered, and connect with engaged couples.
                  </Text>
                </View>
                <View
                  style={[
                    styles.pathRadio,
                    role === 'vendor' && styles.pathRadioActive,
                  ]}>
                  {role === 'vendor' ? <Text style={styles.pathRadioCheck}>{'\u2713'}</Text> : null}
                </View>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.pathContinueButton}
                activeOpacity={0.9}
                onPress={continueFromPath}>
                <Text style={styles.pathContinueText}>Continue</Text>
              </TouchableOpacity>

              <View style={styles.pathLoginRow}>
                <Text style={styles.pathLoginCopy}>Already have an account?</Text>
                <TouchableOpacity
                  activeOpacity={0.76}
                  onPress={showExistingLogin}>
                  <Text style={styles.pathLoginLink}>Log In</Text>
                </TouchableOpacity>
              </View>

              <Text style={styles.pathStepText}>Step 1 of 3</Text>
              <View style={styles.stepDots}>
                <View style={[styles.stepDot, styles.stepDotActive]} />
                <View style={styles.stepDot} />
                <View style={styles.stepDot} />
              </View>
              <Text style={styles.pathFooter}>Your wedding journey starts here</Text>
            </View>
          ) : null}

          {member || wizardStep === 2 ? (
          <View style={styles.loginCard}>
            {member ? (
              <View style={styles.signedInPanel}>
                <Text style={styles.signedInTitle}>
                  {shouldCompleteProfile ? 'Finish your profile' : 'You are signed in'}
                </Text>
                <Text style={styles.signedInName} numberOfLines={1}>
                  {displayName}
                </Text>
                {shouldCompleteProfile ? (
                  <>
                    <View style={styles.profileInputShell}>
                      <UserRound size={20} color="#7D7D80" strokeWidth={1.7} />
                      <TextInput
                        value={profileFirstName}
                        onChangeText={setProfileFirstName}
                        placeholder="First name"
                        placeholderTextColor="#A8A8AD"
                        textContentType="givenName"
                        style={styles.textInput}
                      />
                    </View>
                    <View style={styles.profileInputShell}>
                      <Mail size={20} color="#7D7D80" strokeWidth={1.7} />
                      {mustReplaceRelayEmail ? (
                        <TextInput
                          value={profileEmail}
                          onChangeText={setProfileEmail}
                          placeholder="Your real email address"
                          placeholderTextColor="#A8A8AD"
                          keyboardType="email-address"
                          autoCapitalize="none"
                          autoCorrect={false}
                          textContentType="emailAddress"
                          style={styles.textInput}
                        />
                      ) : (
                        <Text
                          style={styles.readOnlyInput}
                          numberOfLines={1}>
                          {member.email}
                        </Text>
                      )}
                    </View>
                    {mustReplaceRelayEmail ? (
                      <Text style={styles.profileHint}>
                        Apple hid your email. Add your regular email so vendor alerts and website login work.
                      </Text>
                    ) : null}
                    <TouchableOpacity
                      style={styles.profileInputShell}
                      activeOpacity={0.82}
                      onPress={() => setShowWeddingPicker((shown) => !shown)}>
                      <CalendarDays size={20} color="#7D7D80" strokeWidth={1.7} />
                      <Text style={[styles.readOnlyInput, !profileWeddingDate && styles.placeholderText]}>
                        {profileWeddingDate || 'Wedding date'}
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
                            setProfileWeddingDate(formatWeddingDate(selectedDate));
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
                      onPress={saveProfile}>
                      {profileSaveLoading ? (
                        <ActivityIndicator size="small" color="#FFFFFF" />
                      ) : (
                        <Text style={styles.secondaryActionText}>Save & Open Dashboard</Text>
                      )}
                    </TouchableOpacity>
                    {!mustReplaceRelayEmail ? (
                      <TouchableOpacity
                        style={styles.signOutButton}
                        activeOpacity={0.82}
                        onPress={onOpenDashboard}>
                        <Text style={styles.signOutText}>Skip for now</Text>
                      </TouchableOpacity>
                    ) : null}
                  </>
                ) : showCoupleMenu ? (
                  <>
                    <TouchableOpacity
                      style={styles.coupleMenuCard}
                      activeOpacity={0.86}
                      onPress={onOpenWebsiteBuilder}>
                      <View style={styles.coupleMenuCopy}>
                        <Text style={styles.coupleMenuEyebrow}>Create</Text>
                        <Text style={styles.coupleMenuTitle}>Wedding Website Builder</Text>
                        <Text style={styles.coupleMenuDescription}>
                          Build and edit your wedding website.
                        </Text>
                      </View>
                      <Image
                        source={COUPLE_MENU_WEBSITE_IMAGE}
                        style={styles.coupleMenuImage}
                        resizeMode="cover"
                      />
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.coupleMenuCard}
                      activeOpacity={0.86}
                      onPress={onOpenDashboard}>
                      <View style={styles.coupleMenuCopy}>
                        <Text style={styles.coupleMenuEyebrow}>Plan</Text>
                        <Text style={styles.coupleMenuTitle}>Vendor Search Dashboard</Text>
                        <Text style={styles.coupleMenuDescription}>
                          Search vendors and manage your saved finds.
                        </Text>
                      </View>
                      <Image
                        source={COUPLE_MENU_DASHBOARD_IMAGE}
                        style={styles.coupleMenuImage}
                        resizeMode="cover"
                      />
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.coupleMenuCard}
                      activeOpacity={0.86}
                      onPress={onOpenChat}>
                      <View style={styles.coupleMenuCopy}>
                        <View style={styles.coupleMenuTitleRow}>
                          <Text style={styles.coupleMenuEyebrow}>Connect</Text>
                          {chatUnreadCount > 0 ? (
                            <View style={styles.chatBadge}>
                              <Text style={styles.chatBadgeText}>
                                {chatUnreadCount > 99 ? '99+' : chatUnreadCount}
                              </Text>
                            </View>
                          ) : null}
                        </View>
                        <Text style={styles.coupleMenuTitle}>Private Chat Messages</Text>
                        <Text style={styles.coupleMenuDescription} numberOfLines={2}>
                          {chatUnreadCount > 0 ? chatStatusLabel : 'Open your synced WeddingWin inbox.'}
                        </Text>
                      </View>
                      <Image
                        source={COUPLE_MENU_CHAT_IMAGE}
                        style={styles.coupleMenuImage}
                        resizeMode="cover"
                      />
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.coupleMenuCard, styles.qrMenuCard]}
                      activeOpacity={0.86}
                      onPress={onOpenQrScanner}>
                      <View style={styles.coupleMenuCopy}>
                        <Text style={styles.coupleMenuEyebrow}>Events</Text>
                        <Text style={styles.coupleMenuTitle}>QR Bingo Scanner</Text>
                        <Text style={styles.coupleMenuDescription}>
                          Scan WeddingWin QR codes at wedding shows.
                        </Text>
                        <Text style={styles.qrMenuEventDate}>October 18, 2026</Text>
                        <Text style={styles.qrMenuEventVenue}>
                          Americana Niagara Resort • Niagara Falls
                        </Text>
                      </View>
                      <View style={styles.qrMenuIconWrap}>
                        <QrCode size={48} color="#FFFFFF" strokeWidth={1.7} />
                      </View>
                    </TouchableOpacity>
                  </>
                ) : showVendorMenu ? (
                  <>
                    <TouchableOpacity
                      style={styles.coupleMenuCard}
                      activeOpacity={0.86}
                      onPress={onOpenDashboard}>
                      <View style={styles.coupleMenuCopy}>
                        <Text style={styles.coupleMenuEyebrow}>Dashboard</Text>
                        <Text style={styles.coupleMenuTitle}>Vendor Dashboard</Text>
                        <Text style={styles.coupleMenuDescription}>
                          Open your full WeddingWin account dashboard and business tools.
                        </Text>
                      </View>
                      <View style={[styles.vendorMenuIconWrap, styles.vendorMenuDashboardIcon]}>
                        <Store size={42} color="#FFFFFF" strokeWidth={1.8} />
                      </View>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.coupleMenuCard}
                      activeOpacity={0.86}
                      onPress={onOpenChat}>
                      <View style={styles.coupleMenuCopy}>
                        <View style={styles.coupleMenuTitleRow}>
                          <Text style={styles.coupleMenuEyebrow}>Messages</Text>
                          {chatUnreadCount > 0 ? (
                            <View style={styles.chatBadge}>
                              <Text style={styles.chatBadgeText}>
                                {chatUnreadCount > 99 ? '99+' : chatUnreadCount}
                              </Text>
                            </View>
                          ) : null}
                        </View>
                        <Text style={styles.coupleMenuTitle}>Private Chat Messages</Text>
                        <Text style={styles.coupleMenuDescription} numberOfLines={2}>
                          {chatUnreadCount > 0 ? chatStatusLabel : 'Reply to couples from your WeddingWin inbox.'}
                        </Text>
                      </View>
                      <View style={[styles.vendorMenuIconWrap, styles.vendorMenuChatIcon]}>
                        <MessageCircle size={42} color="#FFFFFF" strokeWidth={1.8} />
                      </View>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.coupleMenuCard, styles.qrMenuCard]}
                      activeOpacity={0.86}
                      onPress={openVendorRaffle}>
                      <View style={styles.coupleMenuCopy}>
                        <Text style={styles.coupleMenuEyebrow}>QR Bingo</Text>
                        <Text style={styles.coupleMenuTitle}>Vendor Draw Settings</Text>
                        <Text style={styles.coupleMenuDescription}>
                          Set your booth prize, view opt-ins, export couples, and pick a winner.
                        </Text>
                      </View>
                      <View style={styles.vendorMenuIconWrap}>
                        <QrCode size={44} color="#FFFFFF" strokeWidth={1.7} />
                      </View>
                    </TouchableOpacity>
                  </>
                ) : (
                  <>
                    <TouchableOpacity
                      style={styles.secondaryAction}
                      activeOpacity={0.82}
                      onPress={onOpenDashboard}>
                      <Text style={styles.secondaryActionText}>Open Website Account</Text>
                    </TouchableOpacity>
                  </>
                )}
                <TouchableOpacity
                  style={styles.signOutButton}
                  activeOpacity={0.82}
                  onPress={onSignOut}>
                  <Text style={styles.signOutText}>Sign Out</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <>
            <TouchableOpacity
              style={styles.wizardBackButton}
              activeOpacity={0.76}
              onPress={() => setWizardStep(1)}>
              <ChevronLeft size={18} color={BRAND_COLOR} strokeWidth={2.2} />
              <Text style={styles.wizardBackText}>Change path</Text>
            </TouchableOpacity>
            <Text style={styles.authStepText}>Step 2 of 3</Text>
            <Text style={styles.authTitle}>
              {isVendorRole
                ? 'Create your vendor account'
                : authMode === 'signup'
                  ? 'Create your couple account'
                  : 'Log in to WeddingWin'}
            </Text>
            <Text style={styles.authIntro}>
              {isVendorRole
                ? 'Sign up with Apple or Google to start connecting with couples.'
                : authMode === 'signup'
                  ? 'Sign up with Apple or Google to start planning faster.'
                  : 'Welcome back. Open your dashboard and messages.'}
            </Text>

            {authMode === 'signup' ? (
              <>
                <TouchableOpacity
                  style={styles.signupConsentRow}
                  activeOpacity={0.82}
                  onPress={() => setSignupConsentAccepted((accepted) => !accepted)}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: signupConsentAccepted }}>
                  <View
                    style={[
                      styles.signupConsentBox,
                      signupConsentAccepted && styles.signupConsentBoxChecked,
                    ]}>
                    {signupConsentAccepted ? (
                      <Text style={styles.signupConsentCheck}>{'\u2713'}</Text>
                    ) : null}
                  </View>
                  <Text style={styles.signupConsentText}>
                    {"I agree to WeddingWin's "}
                    <Text
                      style={styles.signupConsentLink}
                      onPress={() => openPolicyLink(TERMS_URL)}>
                      Terms of Use
                    </Text>
                    {' '}and{' '}
                    <Text
                      style={styles.signupConsentLink}
                      onPress={() => openPolicyLink(PRIVACY_URL)}>
                      Privacy Policy
                    </Text>
                    .
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.googleButton,
                    (googleLoginLoading || !signupConsentAccepted) &&
                      styles.loginButtonDisabled,
                  ]}
                  disabled={googleLoginLoading}
                  activeOpacity={0.86}
                  onPress={startGoogleSignup}>
                  {googleLoginLoading ? (
                    <ActivityIndicator size="small" color="#3C4043" />
                  ) : (
                    <>
                      <View style={styles.googleMark}>
                        <Text style={styles.googleMarkText}>G</Text>
                      </View>
                      <Text style={styles.googleButtonText}>Sign up with Google</Text>
                    </>
                  )}
                </TouchableOpacity>

                {Platform.OS === 'ios' ? (
                  <AppleAuthentication.AppleAuthenticationButton
                    buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_UP}
                    buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
                    cornerRadius={8}
                    style={[
                      styles.appleButton,
                      !signupConsentAccepted && styles.appleButtonDisabled,
                    ]}
                    onPress={startAppleSignup}
                  />
                ) : null}

                <Text style={styles.emailSignupPrompt}>Sign up with email</Text>
              </>
            ) : null}

            <Text style={[styles.inputLabel, authMode === 'signup' && styles.passwordLabel]}>
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
                style={styles.textInput}
                returnKeyType="next"
              />
            </View>

            <Text style={[styles.inputLabel, styles.passwordLabel]}>Password</Text>
            <View style={styles.inputShell}>
              <LockKeyhole size={22} color="#7D7D80" strokeWidth={1.7} />
              <TextInput
                value={password}
                onChangeText={setPassword}
                placeholder="Enter your password"
                placeholderTextColor="#A8A8AD"
                secureTextEntry={!showPassword}
                textContentType="password"
                style={styles.textInput}
                returnKeyType="done"
                onSubmitEditing={
                  authMode === 'signup' ? createMemberAccount : openLogin
                }
              />
              <TouchableOpacity
                style={styles.eyeButton}
                hitSlop={10}
                onPress={() => setShowPassword((value) => !value)}>
                <Eye size={24} color="#8A8A8D" strokeWidth={1.7} />
              </TouchableOpacity>
            </View>

            {authMode !== 'signup' ? (
              <TouchableOpacity
                style={styles.forgotButton}
                activeOpacity={0.75}
                onPress={() => onOpenUrl('/login/retrieval')}>
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
              disabled={emailLoginLoading || signupLoading}
              activeOpacity={0.9}
              onPress={authMode === 'signup' ? createMemberAccount : openLogin}>
              {(authMode === 'signup' && signupLoading) || emailLoginLoading ? (
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
                onPress={() => setAuthMode('signup')}>
                <UserPlus size={24} color={BRAND_COLOR} strokeWidth={1.8} />
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
                onPress={() => onGoogleSignIn(role)}>
                {googleLoginLoading ? (
                  <ActivityIndicator size="small" color="#3C4043" />
                ) : (
                  <>
                    <View style={styles.googleMark}>
                      <Text style={styles.googleMarkText}>G</Text>
                    </View>
                    <Text style={styles.googleButtonText}>Sign in with Google</Text>
                  </>
                )}
              </TouchableOpacity>
            ) : null}

            {Platform.OS === 'ios' && authMode === 'login' ? (
              <AppleAuthentication.AppleAuthenticationButton
                buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
                buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
                cornerRadius={8}
                style={styles.appleButton}
                onPress={() => onAppleSignIn(role)}
              />
            ) : null}
              </>
            )}
          </View>
          ) : null}

          <TouchableOpacity
            style={styles.supportLink}
            activeOpacity={0.75}
            onPress={() => Linking.openURL('mailto:hello@weddingwin.ca').catch(() => {})}>
            <MessageCircle size={18} color={BRAND_COLOR} strokeWidth={1.8} />
            <Text style={styles.supportText}>
              Plan your dream day with{'\n'}trusted wedding professionals
            </Text>
          </TouchableOpacity>
        </ImageBackground>
      </ScrollView>
      <Modal
        visible={showVendorRaffle}
        transparent
        animationType="slide"
        onRequestClose={() => setShowVendorRaffle(false)}>
        <View style={styles.vendorRaffleBackdrop}>
          <View style={styles.vendorRaffleSheet}>
            <View style={styles.vendorRaffleHeader}>
              <View>
                <Text style={styles.vendorRaffleEyebrow}>QR Bingo</Text>
                <Text style={styles.vendorRaffleTitle}>Vendor Draw</Text>
              </View>
              <TouchableOpacity
                style={styles.vendorRaffleClose}
                activeOpacity={0.78}
                onPress={() => setShowVendorRaffle(false)}>
                <X size={22} color="#2E2E32" strokeWidth={2.2} />
              </TouchableOpacity>
            </View>
            {vendorRaffleLoading ? (
              <View style={styles.vendorRaffleLoading}>
                <ActivityIndicator size="large" color={BRAND_COLOR} />
              </View>
            ) : (
              <ScrollView showsVerticalScrollIndicator={false}>
                {vendorRaffleError ? <Text style={styles.vendorRaffleError}>{vendorRaffleError}</Text> : null}
                <Text style={styles.vendorRaffleVendor} numberOfLines={1}>
                  {vendorRaffle?.vendor?.name || displayName || 'Vendor account'}
                </Text>
                <TouchableOpacity
                  style={styles.vendorRaffleToggleRow}
                  activeOpacity={0.8}
                  onPress={() => setRaffleEnabled((value) => !value)}>
                  <View style={[styles.vendorRaffleToggle, raffleEnabled && styles.vendorRaffleToggleOn]}>
                    <View style={[styles.vendorRaffleToggleKnob, raffleEnabled && styles.vendorRaffleToggleKnobOn]} />
                  </View>
                  <View style={styles.vendorRaffleToggleCopy}>
                    <Text style={styles.vendorRaffleToggleTitle}>Offer a vendor draw</Text>
                    <Text style={styles.vendorRaffleToggleText}>Couples can opt in after scanning your booth QR code.</Text>
                  </View>
                </TouchableOpacity>
                <Text style={styles.inputLabel}>Prize title</Text>
                <View style={styles.inputShell}>
                  <TextInput
                    value={rafflePrizeTitle}
                    onChangeText={setRafflePrizeTitle}
                    placeholder="Example: Engagement photo session"
                    placeholderTextColor="#A8A8AD"
                    style={styles.textInput}
                  />
                </View>
                <Text style={[styles.inputLabel, styles.passwordLabel]}>Prize details</Text>
                <View style={[styles.inputShell, styles.vendorRaffleTextAreaShell]}>
                  <TextInput
                    value={rafflePrizeDescription}
                    onChangeText={setRafflePrizeDescription}
                    placeholder="What is included?"
                    placeholderTextColor="#A8A8AD"
                    style={[styles.textInput, styles.vendorRaffleTextArea]}
                    multiline
                  />
                </View>
                <Text style={[styles.inputLabel, styles.passwordLabel]}>Claim instructions</Text>
                <View style={[styles.inputShell, styles.vendorRaffleTextAreaShell]}>
                  <TextInput
                    value={raffleClaimInstructions}
                    onChangeText={setRaffleClaimInstructions}
                    placeholder="How should the winner claim the prize?"
                    placeholderTextColor="#A8A8AD"
                    style={[styles.textInput, styles.vendorRaffleTextArea]}
                    multiline
                  />
                </View>
                <TouchableOpacity
                  style={styles.signupConsentRow}
                  activeOpacity={0.82}
                  onPress={() => setRaffleLegalAccepted((accepted) => !accepted)}>
                  <View style={[styles.signupConsentBox, raffleLegalAccepted && styles.signupConsentBoxChecked]}>
                    {raffleLegalAccepted ? <Text style={styles.signupConsentCheck}>{'\u2713'}</Text> : null}
                  </View>
                  <Text style={styles.signupConsentText}>
                    I agree to the vendor draw rules and understand Wedding Win Inc. will send winner emails.
                    {' '}
                    <Text
                      style={styles.signupConsentLink}
                      onPress={() => vendorRaffle?.terms_url && Linking.openURL(vendorRaffle.terms_url).catch(() => {})}>
                      View rules
                    </Text>
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.loginButton, vendorRaffleSaving && styles.loginButtonDisabled]}
                  activeOpacity={0.9}
                  disabled={vendorRaffleSaving}
                  onPress={saveVendorRaffle}>
                  {vendorRaffleSaving ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <Text style={styles.loginButtonText}>Save Draw Settings</Text>
                  )}
                </TouchableOpacity>
                <View style={styles.vendorRaffleStatsRow}>
                  <View style={styles.vendorRaffleStat}>
                    <Text style={styles.vendorRaffleStatValue}>{vendorRaffle?.entries?.length || 0}</Text>
                    <Text style={styles.vendorRaffleStatLabel}>Opt-ins</Text>
                  </View>
                  <View style={styles.vendorRaffleStat}>
                    <Text style={styles.vendorRaffleStatValue}>{vendorRaffle?.draws?.length || 0}</Text>
                    <Text style={styles.vendorRaffleStatLabel}>Draws</Text>
                  </View>
                </View>
                <View style={styles.vendorRaffleExportRow}>
                  <TouchableOpacity style={styles.raffleCancelButton} activeOpacity={0.78} onPress={() => shareVendorExport('csv')}>
                    <Text style={styles.raffleCancelText}>Export CSV</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.raffleCancelButton} activeOpacity={0.78} onPress={() => shareVendorExport('txt')}>
                    <Text style={styles.raffleCancelText}>Export TXT</Text>
                  </TouchableOpacity>
                </View>
                <TouchableOpacity
                  style={[styles.raffleEnterButton, (!vendorRaffle?.can_draw || vendorRaffleDrawing) && styles.loginButtonDisabled]}
                  activeOpacity={0.88}
                  disabled={!vendorRaffle?.can_draw || vendorRaffleDrawing}
                  onPress={() => drawVendorWinner(vendorRaffle?.draws?.length ? 'additional_prize_or_redraw' : 'initial')}>
                  {vendorRaffleDrawing ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <Text style={styles.raffleEnterText}>
                      {vendorRaffle?.draws?.length ? 'Pick Another Winner' : 'Pick Winner'}
                    </Text>
                  )}
                </TouchableOpacity>
                {!vendorRaffle?.can_draw ? (
                  <Text style={styles.vendorRaffleHint}>Draws open after 3:00 PM on October 18, 2026.</Text>
                ) : null}
                {(vendorRaffle?.draws || []).map((draw) => (
                  <View key={draw.id} style={styles.vendorRaffleWinnerCard}>
                    <Text style={styles.vendorRaffleWinnerTitle}>Winner #{draw.draw_number}</Text>
                    <Text style={styles.vendorRaffleWinnerName}>{draw.winner_name}</Text>
                    <Text style={styles.vendorRaffleWinnerText}>{draw.winner_email}</Text>
                    {draw.email_error ? <Text style={styles.vendorRaffleError}>{draw.email_error}</Text> : null}
                  </View>
                ))}
                {(vendorRaffle?.entries || []).slice(0, 12).map((entry) => (
                  <View key={entry.id} style={styles.vendorRaffleEntryRow}>
                    <View>
                      <Text style={styles.vendorRaffleEntryName}>{entry.couple_name || 'Couple'}</Text>
                      <Text style={styles.vendorRaffleEntryText}>{entry.couple_email}</Text>
                    </View>
                    <Text style={styles.vendorRaffleEntryText}>{entry.couple_wedding_date || ''}</Text>
                  </View>
                ))}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

type ChatThreadSort = 'recent' | 'unread' | 'name';

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
  threads,
  messages,
  selectedThreadToken,
  loading,
  sending,
  error,
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
}: {
  threads: NativeChatThread[];
  messages: NativeChatMessage[];
  selectedThreadToken: string;
  loading: boolean;
  sending: boolean;
  error: string | null;
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
}) {
  const [threadSort, setThreadSort] = useState<ChatThreadSort>('recent');
  const [chatView, setChatView] = useState<'list' | 'thread'>('list');
  const selectedThread = threads.find((thread) => thread.token === selectedThreadToken);
  const isThreadView = chatView === 'thread' && !!selectedThread;
  const selectedInitial = (selectedThread?.title || 'W').trim().charAt(0).toUpperCase();
  const sortedThreads = useMemo(() => {
    return [...threads].sort((a, b) => {
      if (threadSort === 'name') return a.title.localeCompare(b.title);
      if (threadSort === 'unread') {
        const unreadDelta = b.unread_count - a.unread_count;
        if (unreadDelta !== 0) return unreadDelta;
      }
      return chatThreadTimeValue(b.updated_at) - chatThreadTimeValue(a.updated_at);
    });
  }, [threadSort, threads]);
  const openThread = (threadToken: string) => {
    setChatView('thread');
    onSelectThread(threadToken);
  };
  const goBack = () => {
    if (isThreadView) {
      setChatView('list');
      return;
    }

    onClose();
  };

  useEffect(() => {
    onThreadViewChange(isThreadView);
  }, [isThreadView, onThreadViewChange]);

  return (
    <SafeAreaView style={styles.chatNativeShell} edges={['top']}>
      <View style={styles.chatNativeHeader}>
        <TouchableOpacity
          style={styles.chatBackButton}
          activeOpacity={0.76}
          onPress={goBack}
          accessibilityRole="button"
          accessibilityLabel={isThreadView ? 'Back to conversations' : 'Close messages'}>
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
            style={styles.chatReportButton}
            activeOpacity={0.76}
            onPress={onReport}
            disabled={!selectedThreadToken}
            accessibilityRole="button"
            accessibilityLabel="Report conversation">
            <AlertTriangle size={17} color="#8A514C" strokeWidth={2.2} />
            <Text style={styles.chatReportText}>Report</Text>
          </TouchableOpacity>
        ) : null}
        <TouchableOpacity
          style={styles.chatRefreshButton}
          activeOpacity={0.76}
          onPress={onRefresh}
          accessibilityRole="button"
          accessibilityLabel="Refresh messages">
          <Text style={styles.chatRefreshText}>Refresh</Text>
        </TouchableOpacity>
      </View>

      {error ? (
        <View style={styles.chatErrorBanner}>
          <Text style={styles.chatErrorText}>{error}</Text>
        </View>
      ) : null}

      <KeyboardAvoidingView
        style={styles.chatNativeBody}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {!isThreadView ? (
          <View style={styles.chatConversationList}>
          <View style={styles.chatInboxToolbar}>
            {([
              ['recent', 'Recent'],
              ['unread', 'Unread'],
              ['name', 'A-Z'],
            ] as const).map(([value, label]) => (
              <TouchableOpacity
                key={value}
                style={[
                  styles.chatSortChip,
                  threadSort === value && styles.chatSortChipActive,
                ]}
                activeOpacity={0.78}
                onPress={() => setThreadSort(value)}>
                <Text
                  style={[
                    styles.chatSortChipText,
                    threadSort === value && styles.chatSortChipTextActive,
                  ]}>
                  {label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <ScrollView
            style={styles.chatConversationScroll}
            contentContainerStyle={styles.chatConversationContent}
            showsVerticalScrollIndicator={false}>
            {loading && threads.length === 0 ? (
              <View style={styles.chatCenteredState}>
                <ActivityIndicator size="small" color={BRAND_COLOR} />
                <Text style={styles.chatCenteredText}>Loading conversations...</Text>
              </View>
            ) : null}
            {threads.length === 0 && !loading ? (
              <View style={styles.chatCenteredState}>
                <MessageCircle size={36} color={BRAND_COLOR} strokeWidth={1.7} />
                <Text style={styles.chatCenteredText}>
                  Your synced WeddingWin chats will appear here.
                </Text>
              </View>
            ) : null}
            {sortedThreads.map((thread) => (
              <TouchableOpacity
                key={thread.token}
                style={[
                  styles.chatConversationRow,
                  thread.unread_count > 0 && styles.chatConversationRowUnread,
                ]}
                activeOpacity={0.82}
                onPress={() => openThread(thread.token)}>
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
                    <Text style={styles.chatInboxDateText} numberOfLines={1}>
                      {formatChatThreadDate(thread.updated_at)}
                    </Text>
                  </View>
                  <View style={styles.chatConversationPreviewLine}>
                    <Text style={styles.chatInboxLastMessage} numberOfLines={1}>
                      {thread.subtitle || 'No messages yet'}
                    </Text>
                    {thread.unread_count > 0 ? (
                      <View style={styles.chatThreadUnread}>
                        <Text style={styles.chatThreadUnreadText}>
                          {thread.unread_count > 99 ? '99+' : thread.unread_count}
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
              <Text style={styles.chatMessageAvatarInitial}>{selectedInitial}</Text>
            )}
          </View>
          <View style={styles.chatThreadProfileCopy}>
            <Text style={styles.chatThreadProfileName} numberOfLines={1}>
              {selectedThread?.title}
            </Text>
            <Text style={styles.chatThreadProfileStatus}>Synced with website chat</Text>
          </View>
        </View>

        <ScrollView
          style={styles.chatMessages}
          contentContainerStyle={styles.chatMessagesContent}
          showsVerticalScrollIndicator={false}>
          {loading && messages.length === 0 ? (
            <View style={styles.chatCenteredState}>
              <ActivityIndicator size="small" color={BRAND_COLOR} />
              <Text style={styles.chatCenteredText}>Loading messages...</Text>
            </View>
          ) : null}
          {!loading && messages.length === 0 ? (
            <View style={styles.chatCenteredState}>
              <MessageCircle size={36} color={BRAND_COLOR} strokeWidth={1.7} />
              <Text style={styles.chatCenteredText}>
                {threads.length === 0
                  ? 'Your synced WeddingWin chats will appear here.'
                  : 'No messages in this conversation yet.'}
              </Text>
            </View>
          ) : null}
          {messages.map((message) => (
            <View
              key={message.id}
              style={[
                styles.chatMessageRow,
                message.is_mine && styles.chatMessageRowMine,
              ]}>
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
                ]}>
                {message.image_urls?.map((url, index) => (
                  <TouchableOpacity
                    key={`${message.id}-image-${index}`}
                    activeOpacity={0.86}
                    onPress={() => Linking.openURL(url).catch(() => {})}>
                    <Image
                      source={{ uri: url }}
                      style={styles.chatMessageImage}
                      resizeMode="cover"
                    />
                  </TouchableOpacity>
                ))}
                {message.content ? (
                  <Text
                    style={[
                      styles.chatMessageText,
                      message.is_mine && styles.chatMessageTextMine,
                      message.image_urls?.length ? styles.chatMessageTextWithImage : null,
                    ]}>
                    {message.content}
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
                    <Text style={styles.chatMessageAvatarInitial}>Me</Text>
                  )}
                </View>
              ) : null}
            </View>
          ))}
        </ScrollView>

        <View style={styles.chatComposer}>
          <TouchableOpacity
            style={[
              styles.chatImageButton,
              (sending || !selectedThreadToken) && styles.chatSendButtonDisabled,
            ]}
            disabled={sending || !selectedThreadToken}
            activeOpacity={0.82}
            onPress={onAttachImage}
            accessibilityRole="button"
            accessibilityLabel="Send an image">
            <ImagePlus size={21} color={BRAND_COLOR} strokeWidth={2.2} />
          </TouchableOpacity>
          <TextInput
            value={draft}
            onChangeText={onDraftChange}
            placeholder="Write a message..."
            placeholderTextColor="#9D8D89"
            multiline
            style={styles.chatComposerInput}
          />
          <TouchableOpacity
            style={[
              styles.chatSendButton,
              (!draft.trim() || sending || !selectedThreadToken) && styles.chatSendButtonDisabled,
            ]}
            disabled={!draft.trim() || sending || !selectedThreadToken}
            activeOpacity={0.82}
            onPress={onSend}>
            {sending ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Text style={styles.chatSendText}>Send</Text>
            )}
          </TouchableOpacity>
        </View>
          </>
        )}
      </KeyboardAvoidingView>
      {chatUnreadCount > 0 ? (
        <TouchableOpacity
          style={styles.chatBubble}
          activeOpacity={0.82}
          onPress={() => setChatView('list')}
          accessibilityRole="button"
          accessibilityLabel="View unread WeddingWin messages">
          <MessageCircle size={27} color="#FFFFFF" strokeWidth={2.2} />
          <View style={styles.chatBubbleBadge}>
            <Text style={styles.chatBubbleBadgeText}>
              {chatUnreadCount > 99 ? '99+' : chatUnreadCount}
            </Text>
          </View>
        </TouchableOpacity>
      ) : null}
    </SafeAreaView>
  );
}

export default function HomeScreen() {
  const webviewRef = useRef<WebView>(null);
  const navigation = useNavigation();
  const currentUrlRef = useRef(TARGET_URL);
  const loadingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const historyNavigationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [showBrowser, setShowBrowser] = useState(false);
  const [sourceUri, setSourceUri] = useState(TARGET_URL);
  const [isWedWebsiteSite, setIsWedWebsiteSite] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [canGoBack, setCanGoBack] = useState(false);
  const [canGoForward, setCanGoForward] = useState(false);
  const [googleLoginLoading, setGoogleLoginLoading] = useState(false);
  const [emailLoginLoading, setEmailLoginLoading] = useState(false);
  const [signupLoading, setSignupLoading] = useState(false);
  const [profileSaveLoading, setProfileSaveLoading] = useState(false);
  const [nativeMember, setNativeMember] = useState<NativeMember | null>(null);
  const [nativeBridgeSession, setNativeBridgeSession] =
    useState<NativeBridgeSession | null>(null);
  const [chatUnreadCount, setChatUnreadCount] = useState(0);
  const [chatStatusLabel, setChatStatusLabel] = useState('Synced with website chat');
  const [chatInboxPath, setChatInboxPath] = useState(DEFAULT_CHAT_INBOX_PATH);
  const [isChatPage, setIsChatPage] = useState(false);
  const [showNativeChat, setShowNativeChat] = useState(false);
  const [nativeChatThreads, setNativeChatThreads] = useState<NativeChatThread[]>([]);
  const [nativeChatMessages, setNativeChatMessages] = useState<NativeChatMessage[]>([]);
  const [selectedChatThreadToken, setSelectedChatThreadToken] = useState('');
  const [nativeChatLoading, setNativeChatLoading] = useState(false);
  const [nativeChatSending, setNativeChatSending] = useState(false);
  const [nativeChatError, setNativeChatError] = useState<string | null>(null);
  const [nativeChatDraft, setNativeChatDraft] = useState('');
  const [nativeChatThreadOpen, setNativeChatThreadOpen] = useState(false);
  const [showNativeQrScanner, setShowNativeQrScanner] = useState(false);
  const [pendingDashboardRedirect, setPendingDashboardRedirect] = useState(false);
  const [pendingBridgeTargetPath, setPendingBridgeTargetPath] = useState(
    DEFAULT_BRIDGE_TARGET_PATH
  );
  const pendingBdFormLoginRef = useRef<LoginCredentials | null>(null);
  const pendingBdFormLoginSubmittedRef = useRef(false);
  const pendingAppLogoutRef = useRef(false);
  const chatUnreadSnapshotRef = useRef<number | null>(null);
  const chatDingPlayerRef = useRef<ReturnType<typeof createAudioPlayer> | null>(null);
  const nativeChatThreadOpenRef = useRef(false);
  const selectedChatThreadTokenRef = useRef('');
  const pushRegistrationKeyRef = useRef('');

  const addDebugLine = useCallback((_line: string) => {}, []);

  useEffect(() => {
    nativeChatThreadOpenRef.current = nativeChatThreadOpen;
  }, [nativeChatThreadOpen]);

  useEffect(() => {
    selectedChatThreadTokenRef.current = selectedChatThreadToken;
  }, [selectedChatThreadToken]);

  const registerPushNotifications = useCallback(async (session: NativeBridgeSession | null) => {
    if (Platform.OS === 'web' || !session?.user_id || !session?.token) return;

    const registrationKey = `${session.user_id}:${session.token}`;
    if (pushRegistrationKeyRef.current === registrationKey) return;

    try {
      const existingPermission = await Notifications.getPermissionsAsync();
      let finalStatus = existingPermission.status;
      if (finalStatus !== 'granted') {
        const requestedPermission = await Notifications.requestPermissionsAsync();
        finalStatus = requestedPermission.status;
      }
      if (finalStatus !== 'granted') return;

      const projectId =
        Constants.easConfig?.projectId ||
        (Constants.expoConfig?.extra?.eas as { projectId?: string } | undefined)?.projectId;
      const tokenResult = projectId
        ? await Notifications.getExpoPushTokenAsync({ projectId })
        : await Notifications.getExpoPushTokenAsync();
      const expoPushToken = tokenResult.data;
      if (!expoPushToken) return;

      await fetch(`${APP_BACKEND_URL}/functions/v1/bd-register-push-token`, {
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
      });

      pushRegistrationKeyRef.current = registrationKey;
      SecureStore.setItemAsync(PUSH_TOKEN_SESSION_KEY, expoPushToken).catch(() => {});
    } catch {
      // Push is helpful, but chat should keep working even if registration fails.
    }
  }, []);

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
    registerPushNotifications(nativeBridgeSession);
  }, [nativeBridgeSession, registerPushNotifications]);

  const playChatNotificationCue = useCallback(() => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
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
    setShowNativeChat(false);
    setNativeChatThreadOpen(false);
    setShowNativeQrScanner(true);
  }, []);

  useEffect(() => {
    navigation.setOptions({
      tabBarStyle: showBrowser ? { display: 'none' } : TAB_BAR_STYLE,
    });

    return () => {
      navigation.setOptions({ tabBarStyle: TAB_BAR_STYLE });
    };
  }, [navigation, showBrowser]);

  const clearNativeSession = useCallback(() => {
    pendingBdFormLoginRef.current = null;
    pendingBdFormLoginSubmittedRef.current = false;
    setNativeMember(null);
    setNativeBridgeSession(null);
    setChatUnreadCount(0);
    setChatStatusLabel('Synced with website chat');
    setChatInboxPath(DEFAULT_CHAT_INBOX_PATH);
    setShowNativeChat(false);
    setNativeChatThreads([]);
    setNativeChatMessages([]);
    setSelectedChatThreadToken('');
    setNativeChatError(null);
    setNativeChatDraft('');
    chatUnreadSnapshotRef.current = null;
    pushRegistrationKeyRef.current = '';
    setPendingDashboardRedirect(false);
    setPendingBridgeTargetPath(DEFAULT_BRIDGE_TARGET_PATH);
    SecureStore.deleteItemAsync(NATIVE_MEMBER_SESSION_KEY).catch(() => {});
    SecureStore.deleteItemAsync(NATIVE_BRIDGE_SESSION_KEY).catch(() => {});
    SecureStore.deleteItemAsync(CHAT_UNREAD_SESSION_KEY).catch(() => {});
    SecureStore.deleteItemAsync(PUSH_TOKEN_SESSION_KEY).catch(() => {});
  }, []);

  const clearWebsiteStorage = useCallback(() => {
    webviewRef.current?.injectJavaScript(`
      try {
        window.localStorage && window.localStorage.clear();
        window.sessionStorage && window.sessionStorage.clear();
      } catch (e) {}
      true;
    `);
  }, []);

  const finishLogoutInApp = useCallback((reason: string) => {
    addDebugLine(`logout synced: ${reason}`);
    pendingAppLogoutRef.current = false;
    clearNativeSession();
    clearWebsiteStorage();
    setError(null);
    setTimeout(() => {
      setShowBrowser(false);
      setLoading(false);
    }, 350);
  }, [addDebugLine, clearNativeSession, clearWebsiteStorage]);

  useEffect(() => {
    let alive = true;

    Promise.all([
      SecureStore.getItemAsync(NATIVE_MEMBER_SESSION_KEY),
      SecureStore.getItemAsync(NATIVE_BRIDGE_SESSION_KEY),
    ])
      .then(([storedMember, storedBridge]) => {
        if (!alive) return;

        const member = storedMember
          ? (JSON.parse(storedMember) as NativeMember)
          : null;
        const bridge = storedBridge
          ? (JSON.parse(storedBridge) as NativeBridgeSession)
          : null;

        if (member?.email && bridge?.user_id && bridge?.token) {
          setNativeMember(member);
          setNativeBridgeSession(bridge);
          return;
        }

        if (member?.email || bridge?.user_id || bridge?.token) {
          addDebugLine('cleared old native session');
          SecureStore.deleteItemAsync(NATIVE_MEMBER_SESSION_KEY).catch(() => {});
          SecureStore.deleteItemAsync(NATIVE_BRIDGE_SESSION_KEY).catch(() => {});
        }
      })
      .catch(() => {});

    return () => {
      alive = false;
    };
  }, [addDebugLine]);

  const openUrl = useCallback((path: string) => {
    const url = new URL(path, TARGET_URL);
    const nextUrl = url.toString();
    setError(null);
    setLoading(true);
    setIsChatPage(isChatInboxPath(getWeddingWinPath(nextUrl)));
    setIsWedWebsiteSite(isWedWebsiteUrl(nextUrl));
    currentUrlRef.current = nextUrl;
    setSourceUri(nextUrl);
    setShowBrowser(true);
  }, []);

  const openAbsoluteUrl = useCallback((url: string) => {
    addDebugLine(`open ${url.replace(TARGET_URL, '')}`);
    setError(null);
    setLoading(true);
    setIsChatPage(isChatInboxPath(getWeddingWinPath(url)));
    setIsWedWebsiteSite(isWedWebsiteUrl(url));
    currentUrlRef.current = url;
    setSourceUri(url);
    setShowBrowser(true);
  }, [addDebugLine]);

  const startBridgeRedirect = useCallback((targetPath = DEFAULT_BRIDGE_TARGET_PATH) => {
    setPendingBridgeTargetPath(targetPath);
    setPendingDashboardRedirect(true);
  }, []);

  const runEmailLogin = useCallback(async (credentials: LoginCredentials) => {
    setEmailLoginLoading(true);

    try {
      const response = await fetch(`${APP_BACKEND_URL}/functions/v1/bd-email-login`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${APP_BACKEND_PUBLISHABLE_KEY}`,
          apikey: APP_BACKEND_PUBLISHABLE_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(credentials),
      });
      const data = await response.json();

      if (!response.ok || !data?.ok || !data?.user?.email) {
        const detail =
          typeof data?.detail === 'string' && data.detail
            ? `: ${data.detail}`
            : '';
        addDebugLine(`email login failed ${response.status}${detail}`);
        Alert.alert(
          'Login failed',
          data?.error || 'Please check your email and password.'
        );
        return;
      }

      const websiteLoginUrl =
        typeof data.app_login_url === 'string' && data.app_login_url
          ? data.app_login_url
          : data.login_url;

      if (typeof websiteLoginUrl !== 'string' || !websiteLoginUrl) {
        Alert.alert(
          'Login failed',
          'WeddingWin did not return a website login link for this account.'
        );
        return;
      }

      addDebugLine(
        websiteLoginUrl.includes('/app-login')
          ? 'email login ok -> app-login bridge'
          : websiteLoginUrl.includes('/login/fromsignup/')
            ? 'email login ok -> BD fromsignup login'
            : websiteLoginUrl.includes('/login/token/')
              ? 'email login ok -> BD token login'
              : 'email login ok -> fallback login url'
      );
      setNativeMember(data.user);
      setNativeBridgeSession(data.native_session || null);
      SecureStore.setItemAsync(
        NATIVE_MEMBER_SESSION_KEY,
        JSON.stringify(data.user)
      ).catch(() => {});
      if (data.native_session) {
        SecureStore.setItemAsync(
          NATIVE_BRIDGE_SESSION_KEY,
          JSON.stringify(data.native_session)
        ).catch(() => {});
      }

      if (isCoupleAccount(data.user)) {
        setShowBrowser(false);
        return;
      }

      startBridgeRedirect();
      openAbsoluteUrl(websiteLoginUrl);
    } catch {
      Alert.alert('Login unavailable', 'Please check your connection and try again.');
    } finally {
      setEmailLoginLoading(false);
    }
  }, [addDebugLine, openAbsoluteUrl, startBridgeRedirect]);

  const saveNativeSession = useCallback((user: NativeMember, session?: NativeBridgeSession | null) => {
    setNativeMember(user);
    setNativeBridgeSession(session || null);
    SecureStore.setItemAsync(
      NATIVE_MEMBER_SESSION_KEY,
      JSON.stringify(user)
    ).catch(() => {});
    if (session) {
      SecureStore.setItemAsync(
        NATIVE_BRIDGE_SESSION_KEY,
        JSON.stringify(session)
      ).catch(() => {});
    }
  }, []);

  const runMemberSignup = useCallback(async (signup: MemberSignup) => {
    setSignupLoading(true);

    try {
      const endpoint =
        signup.role === 'vendor' ? 'bd-vendor-signup' : 'bd-couple-signup';
      const response = await fetch(`${APP_BACKEND_URL}/functions/v1/${endpoint}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${APP_BACKEND_PUBLISHABLE_KEY}`,
          apikey: APP_BACKEND_PUBLISHABLE_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          first_name: signup.firstName,
          email: signup.email,
          password: signup.password,
          wedding_date: signup.weddingDate,
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
        }),
      });
      const data = await response.json();

      if (!response.ok || !data?.ok || !data?.user?.email) {
        const detail =
          typeof data?.detail === 'string' && data.detail
            ? `\n\n${data.detail}`
            : '';
        Alert.alert(
          'Account not created',
          `${data?.error || `WeddingWin could not create your ${signup.role} account yet.`}${detail}`
        );
        return;
      }

      addDebugLine(`${signup.role} signup ok -> app-login bridge`);
      const signedUpUser = {
        ...data.user,
        subscription_id:
          data.user?.subscription_id || membershipPlanForRole(signup.role),
      };
      saveNativeSession(signedUpUser, data.native_session || null);
      if (isCoupleAccount(signedUpUser)) {
        setShowBrowser(false);
        return;
      }

      startBridgeRedirect();
      openAbsoluteUrl(data.app_login_url || `${TARGET_URL}/account/home`);
    } catch {
      Alert.alert('Signup unavailable', 'Please check your connection and try again.');
    } finally {
      setSignupLoading(false);
    }
  }, [addDebugLine, openAbsoluteUrl, saveNativeSession, startBridgeRedirect]);

  const runCompleteProfile = useCallback(async (profile: ContactProfile) => {
    if (!nativeBridgeSession?.user_id || !nativeBridgeSession?.token) {
      Alert.alert('Sign in again', 'Please sign in once more before saving your profile.');
      return;
    }

    setProfileSaveLoading(true);

    try {
      const response = await fetch(`${APP_BACKEND_URL}/functions/v1/bd-complete-profile`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${APP_BACKEND_PUBLISHABLE_KEY}`,
          apikey: APP_BACKEND_PUBLISHABLE_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          native_session: nativeBridgeSession,
          profile: {
            first_name: profile.firstName,
            email: profile.email,
            wedding_date: profile.weddingDate,
          },
        }),
      });
      const data = await response.json();

      if (response.ok && data?.email_confirmation_required) {
        Alert.alert(
          'Confirm your email',
          data?.message ||
            'Please check your email and tap the confirmation link before continuing.'
        );
        return;
      }

      if (!response.ok || !data?.ok || !data?.user?.email) {
        const detail = typeof data?.detail === 'string' ? data.detail.trim() : '';
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
        wedding_date: data.user?.wedding_date || profile.weddingDate,
        subscription_id:
          data.user?.subscription_id ||
          nativeMember?.subscription_id ||
          COUPLE_MEMBERSHIP_PLAN_ID,
      };
      saveNativeSession(completedUser, data.native_session || nativeBridgeSession);
      setShowBrowser(false);
    } catch {
      Alert.alert('Profile not saved', 'Please check your connection and try again.');
    } finally {
      setProfileSaveLoading(false);
    }
  }, [nativeBridgeSession, nativeMember, saveNativeSession]);

  const openDashboardWithBridge = useCallback(async () => {
    if (!nativeBridgeSession?.user_id || !nativeBridgeSession?.token) {
      if (nativeMember?.email) {
        addDebugLine('open dashboard with existing web session');
        openAbsoluteUrl(`${TARGET_URL}/account/home`);
        return;
      }
      addDebugLine('no bridge session; sign in required');
      setNativeMember(null);
      setNativeBridgeSession(null);
      SecureStore.deleteItemAsync(NATIVE_MEMBER_SESSION_KEY).catch(() => {});
      SecureStore.deleteItemAsync(NATIVE_BRIDGE_SESSION_KEY).catch(() => {});
      setShowBrowser(false);
      Alert.alert('Sign in again', 'Please sign in once more so the app can create a website session.');
      return;
    }

    addDebugLine('open dashboard with saved BD token');
    startBridgeRedirect();
    openAbsoluteUrl(buildTokenLoginUrl(nativeBridgeSession.token, '/account/home'));
  }, [addDebugLine, nativeBridgeSession, nativeMember, openAbsoluteUrl, startBridgeRedirect]);

  const openWebsiteBuilderWithBridge = useCallback(async () => {
    if (!nativeBridgeSession?.user_id || !nativeBridgeSession?.token) {
      if (nativeMember?.email) {
        addDebugLine('open website builder with existing web session');
        openAbsoluteUrl(`${TARGET_URL}/builder-sso`);
        return;
      }
      addDebugLine('no bridge session for website builder');
      setNativeMember(null);
      setNativeBridgeSession(null);
      SecureStore.deleteItemAsync(NATIVE_MEMBER_SESSION_KEY).catch(() => {});
      SecureStore.deleteItemAsync(NATIVE_BRIDGE_SESSION_KEY).catch(() => {});
      setShowBrowser(false);
      Alert.alert('Sign in again', 'Please sign in once more so the app can open your wedding website builder.');
      return;
    }

    addDebugLine('open website builder with saved BD token');
    startBridgeRedirect('/builder-sso');
    openAbsoluteUrl(buildTokenLoginUrl(nativeBridgeSession.token, '/builder-sso'));
  }, [addDebugLine, nativeBridgeSession, nativeMember, openAbsoluteUrl, startBridgeRedirect]);

  const handleNativeQrScan = useCallback((rawValue: string) => {
    const value = rawValue.trim();
    if (!value) return;

    playChatNotificationCue();
  }, [playChatNotificationCue]);

  const syncNativeChat = useCallback(async (
    action: 'list' | 'read' | 'send' = 'list',
    options: { threadToken?: string; message?: string; imageDataUri?: string; quiet?: boolean } = {}
  ) => {
    if (!nativeBridgeSession?.user_id || !nativeBridgeSession?.token) {
      if (!options.quiet) {
        setNativeChatError('Please sign in to use WeddingWin messages.');
      }
      return null;
    }

    if (!options.quiet) {
      setNativeChatLoading(action === 'list');
      setNativeChatError(null);
    }

    try {
      const response = await fetch(`${APP_BACKEND_URL}/functions/v1/bd-chat-sync`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${APP_BACKEND_PUBLISHABLE_KEY}`,
          apikey: APP_BACKEND_PUBLISHABLE_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action,
          native_session: nativeBridgeSession,
          thread_token: options.threadToken || selectedChatThreadToken,
          message: options.message,
          image_data_uri: options.imageDataUri,
        }),
      });
      const data = (await response.json()) as NativeChatSyncResponse;

      if (!response.ok || data?.ok === false) {
        const detail = data?.detail ? ` ${data.detail}` : '';
        throw new Error(`${data?.error || 'Chat sync failed.'}${detail}`);
      }

      const threads = data.threads || [];
      const nextThreadToken = data.selected_thread_token || options.threadToken || threads[0]?.token || '';
      setNativeChatThreads(threads);
      setSelectedChatThreadToken(nextThreadToken);
      setNativeChatMessages(data.messages || []);
      const unreadCount = Number(data.unread_count || 0);
      const shouldSuppressAlert =
        action === 'read' ||
        (nativeChatThreadOpenRef.current &&
          !!selectedChatThreadTokenRef.current &&
          (options.threadToken || selectedChatThreadToken) === selectedChatThreadTokenRef.current);
      if (
        !shouldSuppressAlert &&
        chatUnreadSnapshotRef.current !== null &&
        unreadCount > chatUnreadSnapshotRef.current
      ) {
        playChatNotificationCue();
      }
      chatUnreadSnapshotRef.current = Number.isFinite(unreadCount) ? unreadCount : 0;
      SecureStore.setItemAsync(
        CHAT_UNREAD_SESSION_KEY,
        String(chatUnreadSnapshotRef.current)
      ).catch(() => {});
      setChatUnreadCount(chatUnreadSnapshotRef.current);
      setChatStatusLabel(
        chatUnreadSnapshotRef.current > 0
          ? `${chatUnreadSnapshotRef.current} new message${chatUnreadSnapshotRef.current === 1 ? '' : 's'} waiting`
          : 'No new messages'
      );
      return data;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Chat sync failed.';
      if (!options.quiet) {
        setNativeChatError(message);
      }
      return null;
    } finally {
      if (!options.quiet) {
        setNativeChatLoading(false);
      }
    }
  }, [nativeBridgeSession, playChatNotificationCue, selectedChatThreadToken]);

  useEffect(() => {
    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      if (response.notification.request.content.data?.screen !== 'chat') return;
      if (!nativeBridgeSession?.user_id || !nativeBridgeSession?.token) return;
      setShowNativeChat(true);
      syncNativeChat('list');
    });

    return () => subscription.remove();
  }, [nativeBridgeSession, syncNativeChat]);

  const openChatWithBridge = useCallback(() => {
    if (!nativeBridgeSession?.user_id || !nativeBridgeSession?.token) {
      openUrl(chatInboxPath || DEFAULT_CHAT_INBOX_PATH);
      return;
    }

    addDebugLine('open native messages');
    setNativeChatThreadOpen(false);
    setShowNativeChat(true);
    syncNativeChat('list');
  }, [addDebugLine, chatInboxPath, nativeBridgeSession, openUrl, syncNativeChat]);

  const selectNativeChatThread = useCallback((threadToken: string) => {
    setSelectedChatThreadToken(threadToken);
    syncNativeChat('read', { threadToken });
  }, [syncNativeChat]);

  const sendNativeChatMessage = useCallback(async () => {
    const message = nativeChatDraft.trim();
    if (!message || !selectedChatThreadToken) return;

    setNativeChatSending(true);
    const sent = await syncNativeChat('send', {
      threadToken: selectedChatThreadToken,
      message,
    });
    if (sent) setNativeChatDraft('');
    setNativeChatSending(false);
  }, [nativeChatDraft, selectedChatThreadToken, syncNativeChat]);

  const sendNativeChatImage = useCallback(async () => {
    if (!selectedChatThreadToken) return;

    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Photos permission needed', 'Allow photo access to send images in chat.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: false,
      quality: 0.7,
      base64: true,
    });
    if (result.canceled) return;

    const asset = result.assets[0];
    if (!asset?.base64) {
      Alert.alert('Image unavailable', 'Please choose a different image.');
      return;
    }

    const mimeType = asset.mimeType || (asset.uri.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg');
    if (!/^image\/(png|jpe?g|gif|webp)$/i.test(mimeType)) {
      Alert.alert('Unsupported image', 'Please choose a JPG, PNG, GIF, or WebP image.');
      return;
    }
    const imageDataUri = `data:${mimeType};base64,${asset.base64}`;
    setNativeChatSending(true);
    const sent = await syncNativeChat('send', {
      threadToken: selectedChatThreadToken,
      message: nativeChatDraft.trim(),
      imageDataUri,
    });
    if (sent) setNativeChatDraft('');
    setNativeChatSending(false);
  }, [nativeChatDraft, selectedChatThreadToken, syncNativeChat]);

  const reportNativeChatConversation = useCallback(() => {
    if (!selectedChatThreadToken) {
      Alert.alert('Choose a conversation', 'Select a message thread before reporting it.');
      return;
    }

    Alert.alert(
      'Report conversation?',
      'WeddingWin will open the report page for this message thread.',
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Report',
          style: 'destructive',
          onPress: () => {
            setShowNativeChat(false);
            const reportPath = `${chatInboxPath || DEFAULT_CHAT_INBOX_PATH}?thread_token=${encodeURIComponent(selectedChatThreadToken)}`;
            openUrl(reportPath);
          },
        },
      ]
    );
  }, [chatInboxPath, openUrl, selectedChatThreadToken]);

  const refreshChatStatus = useCallback(async () => {
    if (!nativeBridgeSession?.user_id || !nativeBridgeSession?.token) {
      setChatUnreadCount(0);
      setChatStatusLabel('Synced with website chat');
      setChatInboxPath(DEFAULT_CHAT_INBOX_PATH);
      chatUnreadSnapshotRef.current = null;
      return;
    }

    try {
      const response = await fetch(`${APP_BACKEND_URL}/functions/v1/bd-chat-status`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${APP_BACKEND_PUBLISHABLE_KEY}`,
          apikey: APP_BACKEND_PUBLISHABLE_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          native_session: nativeBridgeSession,
          active_thread_token: nativeChatThreadOpenRef.current
            ? selectedChatThreadTokenRef.current
            : '',
        }),
      });
      const data = (await response.json()) as ChatStatus & { ok?: boolean; error?: string };

      if (!response.ok || data?.ok === false) {
        setChatStatusLabel('Website chat sync paused');
        return;
      }

      const nextUnread = Number(data.unread_count || 0);
      const unreadCount = Number.isFinite(nextUnread) ? nextUnread : 0;
      const storedUnread = await SecureStore.getItemAsync(CHAT_UNREAD_SESSION_KEY);
      const storedSnapshot =
        storedUnread !== null && Number.isFinite(Number(storedUnread))
          ? Number(storedUnread)
          : null;

      if (chatUnreadSnapshotRef.current === null) {
        chatUnreadSnapshotRef.current = storedSnapshot ?? unreadCount;
      }

      if (!nativeChatThreadOpenRef.current && unreadCount > chatUnreadSnapshotRef.current) {
        playChatNotificationCue();
      }

      chatUnreadSnapshotRef.current = unreadCount;
      SecureStore.setItemAsync(CHAT_UNREAD_SESSION_KEY, String(unreadCount)).catch(() => {});
      setChatUnreadCount(unreadCount);
      setChatInboxPath(data.inbox_path || DEFAULT_CHAT_INBOX_PATH);
      setChatStatusLabel(
        unreadCount > 0
          ? `${unreadCount} new message${unreadCount === 1 ? '' : 's'} waiting`
          : data.latest_label || 'No new messages'
      );
    } catch {
      setChatStatusLabel('Website chat sync paused');
    }
  }, [nativeBridgeSession, playChatNotificationCue]);

  useEffect(() => {
    if (!nativeBridgeSession?.user_id || !nativeBridgeSession?.token) {
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
  }, [nativeBridgeSession?.token, nativeBridgeSession?.user_id, refreshChatStatus]);

  useEffect(() => {
    if (!showNativeChat) return;
    const poll = setInterval(() => {
      if (nativeChatThreadOpenRef.current && selectedChatThreadTokenRef.current) {
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
      Alert.alert('Apple sign-in unavailable', 'Sign in with Apple is available on iPhone.');
      return;
    }

    try {
      const available = await AppleAuthentication.isAvailableAsync();
      if (!available) {
        Alert.alert(
          'Apple sign-in unavailable',
          'This device is not ready for Sign in with Apple.'
        );
        return;
      }

      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });

      if (!credential.identityToken) {
        Alert.alert('Apple sign-in failed', 'Apple did not return a sign-in token.');
        return;
      }

      const response = await fetch(`${APP_BACKEND_URL}/functions/v1/apple-native-login`, {
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
      });
      const data = await response.json();
      if (!response.ok || !data?.redirect_url) {
        const diagnostic = data?.diagnostic_id ? `\n\nDiagnostic: ${data.diagnostic_id}` : '';
        Alert.alert(
          'Apple sign-in setup needed',
          `${data?.error || 'Apple sign-in is not configured yet.'}${diagnostic}`
        );
        return;
      }

      if (data?.user?.email) {
        saveNativeSession(data.user, data.native_session || null);
      }

      if (data?.user?.email && needsContactProfile(data.user)) {
        setShowBrowser(false);
        return;
      }

      if (data?.user?.email && isCoupleAccount(data.user)) {
        setShowBrowser(false);
        return;
      }

      startBridgeRedirect();
      openAbsoluteUrl(data.redirect_url);
    } catch (e) {
      const code = e && typeof e === 'object' && 'code' in e ? String(e.code) : '';
      if (code === 'ERR_REQUEST_CANCELED') return;
      Alert.alert('Apple sign-in failed', 'Please try again.');
    }
  },
  [openAbsoluteUrl, saveNativeSession, startBridgeRedirect]
  );

  const runOAuthInSystemBrowser = useCallback(async (authUrl: string) => {
    try {
      const result = await WebBrowser.openAuthSessionAsync(
        authUrl,
        OAUTH_RETURN_URL,
        { showInRecents: true }
      );

      if (result.type !== 'success' || !result.url) return;

      webviewRef.current?.injectJavaScript(
        `window.location.href = ${JSON.stringify(result.url)}; true;`
      );
    } catch {
      // user dismissed or system browser failed; leave WebView as-is
    }
  }, []);

  const runBdGoogleLoginInSystemBrowser = useCallback(async (
    role: SignupRole = 'couple',
    consent?: SignupConsent
  ) => {
    const returnUrl = AuthSession.makeRedirectUri({
      scheme: 'weddingwin',
      path: BD_GOOGLE_RETURN_PATH,
    });

    setGoogleLoginLoading(true);
    try {
      const result = await WebBrowser.openAuthSessionAsync(
        buildNativeGoogleStartUrl(returnUrl, role, consent),
        returnUrl,
        { showInRecents: true }
      );

      if (result.type !== 'success' || !result.url) return;

      const callbackUrl = new URL(result.url);
      const errorMessage =
        callbackUrl.searchParams.get('error_description') ||
        callbackUrl.searchParams.get('error');
      if (errorMessage) {
        Alert.alert('Google sign-in failed', errorMessage);
        return;
      }

      const appLoginUrl = callbackUrl.searchParams.get('app_login_url');
      const user = decodeBase64UrlJson<NativeMember>(
        callbackUrl.searchParams.get('user')
      );
      const nativeSession = decodeBase64UrlJson<NativeBridgeSession>(
        callbackUrl.searchParams.get('native_session')
      );

      if (appLoginUrl && user?.email) {
        addDebugLine('Google login ok -> app-login bridge');
        saveNativeSession(user, nativeSession || null);
        if (isCoupleAccount(user)) {
          setShowBrowser(false);
          return;
        }

        startBridgeRedirect();
        openAbsoluteUrl(appLoginUrl);
        return;
      }

      const token = callbackUrl.searchParams.get('token');
      if (!token) {
        Alert.alert(
          'Google sign-in failed',
          'WeddingWin could not finish the app login session.'
        );
        return;
      }

      const loginUrl = `${TARGET_URL}/login/token/${encodeURIComponent(token)}/home`;
      startBridgeRedirect();
      openAbsoluteUrl(loginUrl);
    } catch {
      // user dismissed or system browser failed; leave WebView as-is
    } finally {
      setGoogleLoginLoading(false);
    }
  }, [addDebugLine, openAbsoluteUrl, saveNativeSession, startBridgeRedirect]);

  const applyChatPageChrome = useCallback(() => {
    webviewRef.current?.injectJavaScript(`
(function() {
  try {
    var path = window.location.pathname.replace(/\\/+$/, '') || '/';
    var isChat = path === '/account/chat_messages' || path === '/account/chat/messages';
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
      const weddingWinPath = getWeddingWinPath(url);

      if (weddingWinPath) {
        addDebugLine(`should start ${weddingWinPath}`);
      }

      if (isWeddingWinLogoutActionUrl(url)) {
        finishLogoutInApp('website logout started');
        return true;
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

      if (
        url.startsWith('http://') ||
        url.startsWith('https://') ||
        url.startsWith('about:') ||
        url.startsWith('data:') ||
        url === 'about:blank'
      ) {
        return true;
      }

      if (
        url.startsWith('mailto:') ||
        url.startsWith('tel:') ||
        url.startsWith('sms:') ||
        url.startsWith('itms-apps:') ||
        url.startsWith('itms-appss:') ||
        url.startsWith('maps:')
      ) {
        setLoading(false);
        Linking.openURL(url).catch(() => {});
        return false;
      }

      try {
        const parsed = new URL(url);
        const tail =
          (parsed.pathname || '') + (parsed.search || '') + (parsed.hash || '');
        const redirectTo = `${TARGET_URL}${tail || '/'}`;
        webviewRef.current?.injectJavaScript(
          `window.location.replace(${JSON.stringify(redirectTo)}); true;`
        );
      } catch {
        webviewRef.current?.injectJavaScript(
          `window.location.replace(${JSON.stringify(TARGET_URL)}); true;`
        );
      }
      return false;
    },
    [
      addDebugLine,
      finishLogoutInApp,
      nativeBridgeSession,
      nativeMember,
      openDashboardWithBridge,
      pendingDashboardRedirect,
      runBdGoogleLoginInSystemBrowser,
      runOAuthInSystemBrowser,
    ]
  );

  const handleNavigationStateChange = useCallback((s: WebViewNavigation) => {
    currentUrlRef.current = s.url;
    setCanGoBack(s.canGoBack);
    setCanGoForward(s.canGoForward);
    setIsWedWebsiteSite(isWedWebsiteUrl(s.url));
    const weddingWinPath = getWeddingWinPath(s.url);
    setIsChatPage(isChatInboxPath(weddingWinPath));

    if (weddingWinPath) {
      addDebugLine(`nav ${weddingWinPath}`);
    }

    if (isWeddingWinLoggedOutUrl(s.url)) {
      addDebugLine('BD logged-out URL seen');
      if (pendingBdFormLoginRef.current && pendingBdFormLoginSubmittedRef.current) {
        addDebugLine('BD form login returned to login');
        clearNativeSession();
        Alert.alert('Login failed', 'Please check your email and password.');
      } else if (pendingDashboardRedirect && !isWeddingWinLogoutActionUrl(s.url)) {
        addDebugLine('BD logged-out URL seen during bridge; keeping native session');
      } else {
        finishLogoutInApp(
          pendingAppLogoutRef.current ? 'app logout confirmed by website' : 'website logout finished'
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
      const bridgeTargetPath = pendingBridgeTargetPath || DEFAULT_BRIDGE_TARGET_PATH;
      addDebugLine(`bridge guard from ${weddingWinPath} to ${bridgeTargetPath}`);
      setPendingDashboardRedirect(false);
      setPendingBridgeTargetPath(DEFAULT_BRIDGE_TARGET_PATH);
      webviewRef.current?.injectJavaScript(
        `window.location.replace(${JSON.stringify(`${TARGET_URL}${bridgeTargetPath}`)}); true;`
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
        `window.location.replace(${JSON.stringify(`${TARGET_URL}${pendingBridgeTargetPath}`)}); true;`
      );
    } else if (weddingWinPath.startsWith('/account')) {
      addDebugLine('account page reached');
      const pendingLogin = pendingBdFormLoginRef.current;
      if (pendingLogin) {
        pendingBdFormLoginRef.current = null;
        pendingBdFormLoginSubmittedRef.current = false;
        setNativeMember({ email: pendingLogin.email });
        SecureStore.setItemAsync(
          NATIVE_MEMBER_SESSION_KEY,
          JSON.stringify({ email: pendingLogin.email })
        ).catch(() => {});
      }
      setPendingDashboardRedirect(false);
      setPendingBridgeTargetPath(DEFAULT_BRIDGE_TARGET_PATH);
      applyChatPageChrome();
    }

  }, [
    addDebugLine,
    applyChatPageChrome,
    clearNativeSession,
    finishLogoutInApp,
    pendingBridgeTargetPath,
    pendingDashboardRedirect,
  ]);

  const handleMessage = useCallback(
    (event: { nativeEvent: { data?: string } }) => {
      const data = event.nativeEvent.data || '';
      if (data.startsWith('ww-bd-login:')) {
        addDebugLine(data);
        return;
      }

      try {
        const message = JSON.parse(data) as { type?: string };
        if (message.type === 'bd-app-login-cookies-set') {
          addDebugLine('BD bridge reported cookies set');
        } else if (message.type === 'bd-app-logout') {
          finishLogoutInApp('website logout message');
        }
      } catch {
        // Ignore unrelated website messages.
      }
    },
    [addDebugLine, finishLogoutInApp]
  );

  const handleOpenWindow = useCallback(
    (event: { nativeEvent: { targetUrl?: string } }) => {
      const target = event.nativeEvent.targetUrl;
      if (!target) return;

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

      if (target.startsWith('http://') || target.startsWith('https://')) {
        addDebugLine(`open window ${target.replace(TARGET_URL, '')}`);
        setError(null);
        setLoading(true);
        setIsChatPage(isChatInboxPath(getWeddingWinPath(target)));
        setIsWedWebsiteSite(isWedWebsiteUrl(target));
        currentUrlRef.current = target;
        setSourceUri(target);
        return;
      }

      setLoading(false);
      Linking.openURL(target).catch(() => {});
    },
    [addDebugLine, runBdGoogleLoginInSystemBrowser, runOAuthInSystemBrowser]
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

  const clearLoadingTimeout = useCallback(() => {
    if (loadingTimeoutRef.current) {
      clearTimeout(loadingTimeoutRef.current);
      loadingTimeoutRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      if (historyNavigationTimerRef.current) {
        clearTimeout(historyNavigationTimerRef.current);
        historyNavigationTimerRef.current = null;
      }
      clearLoadingTimeout();
    };
  }, [clearLoadingTimeout]);

  const handleLoadStart = useCallback(() => {
    clearLoadingTimeout();
    setLoading(true);
    loadingTimeoutRef.current = setTimeout(() => {
      setLoading(false);
      loadingTimeoutRef.current = null;
    }, 12000);
  }, [clearLoadingTimeout]);

  const handleLoadEnd = useCallback(() => {
    clearLoadingTimeout();
    setLoading(false);
    applyChatPageChrome();
    if (pendingBdFormLoginRef.current && getWeddingWinPath(currentUrlRef.current) === '/login') {
      submitPendingBdFormLogin();
    }
  }, [applyChatPageChrome, clearLoadingTimeout, submitPendingBdFormLogin]);

  const handleError = useCallback(
    ({ nativeEvent }: { nativeEvent: { description?: string; code?: number } }) => {
      if (nativeEvent.code === -999) return;
      clearLoadingTimeout();
      setLoading(false);
      setError(nativeEvent.description || 'Connection failed');
    },
    [clearLoadingTimeout]
  );

  const reload = useCallback(() => {
    setError(null);
    webviewRef.current?.reload();
  }, []);

  const runHistoryNavigation = useCallback(
    (direction: 'back' | 'forward') => {
      if (historyNavigationTimerRef.current) {
        clearTimeout(historyNavigationTimerRef.current);
        historyNavigationTimerRef.current = null;
      }

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
    [clearLoadingTimeout]
  );

  const goBackInBrowser = useCallback(() => {
    if (!canGoBack) return;
    runHistoryNavigation('back');
  }, [canGoBack, runHistoryNavigation]);

  const goForwardInBrowser = useCallback(() => {
    if (!canGoForward) return;
    runHistoryNavigation('forward');
  }, [canGoForward, runHistoryNavigation]);

  const signOutEverywhere = useCallback(() => {
    addDebugLine('sign out app + website');
    pendingAppLogoutRef.current = true;
    clearNativeSession();
    clearWebsiteStorage();
    openAbsoluteUrl(`${WEBSITE_LOGOUT_URL}?ww_app_logout=${Date.now()}`);
  }, [addDebugLine, clearNativeSession, clearWebsiteStorage, openAbsoluteUrl]);

  const returnToCoupleMenu = useCallback(() => {
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
    setShowBrowser(false);
  }, [clearLoadingTimeout]);

  const renderLoading = useCallback(function renderLoading() {
    return (
      <View style={styles.loading} pointerEvents="none">
        <ActivityIndicator size="large" color={BRAND_COLOR} />
      </View>
    );
  }, []);

  const renderNativeChatOverlay = () => (
    showNativeChat ? (
      <View style={styles.nativeChatOverlay}>
      <NativeChatScreen
        threads={nativeChatThreads}
        messages={nativeChatMessages}
        selectedThreadToken={selectedChatThreadToken}
        loading={nativeChatLoading}
        sending={nativeChatSending}
        error={nativeChatError}
        draft={nativeChatDraft}
        onDraftChange={setNativeChatDraft}
        onSelectThread={selectNativeChatThread}
        onSend={sendNativeChatMessage}
        onAttachImage={sendNativeChatImage}
        onReport={reportNativeChatConversation}
        onRefresh={() => syncNativeChat('list')}
        onClose={() => {
          setNativeChatThreadOpen(false);
          setShowNativeChat(false);
        }}
        onThreadViewChange={setNativeChatThreadOpen}
        chatUnreadCount={chatUnreadCount}
      />
      </View>
    ) : null
  );

  if (!showBrowser) {
    return (
      <View style={styles.nativeShell}>
        <NativeHome
          onOpenUrl={openUrl}
          onOpenWebsiteBuilder={openWebsiteBuilderWithBridge}
          onOpenDashboard={openDashboardWithBridge}
          onOpenChat={openChatWithBridge}
          onOpenQrScanner={openNativeQrScanner}
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
        />
        {nativeMember && chatUnreadCount > 0 ? (
          <TouchableOpacity
            style={styles.chatBubble}
            activeOpacity={0.82}
            onPress={openChatWithBridge}
            accessibilityRole="button"
            accessibilityLabel="Open WeddingWin messages">
            <MessageCircle size={27} color="#FFFFFF" strokeWidth={2.2} />
            {chatUnreadCount > 0 ? (
              <View style={styles.chatBubbleBadge}>
                <Text style={styles.chatBubbleBadgeText}>
                  {chatUnreadCount > 99 ? '99+' : chatUnreadCount}
                </Text>
              </View>
            ) : null}
          </TouchableOpacity>
        ) : null}
        {renderNativeChatOverlay()}
        <NativeQrScanner
          visible={showNativeQrScanner}
          onClose={() => setShowNativeQrScanner(false)}
          onScan={handleNativeQrScan}
          nativeSession={nativeBridgeSession}
        />
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
              onPress={() => setShowBrowser(false)}>
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
          ref={webviewRef}
          source={{ uri: sourceUri }}
          userAgent={USER_AGENT}
          sharedCookiesEnabled
          thirdPartyCookiesEnabled
          domStorageEnabled
          javaScriptEnabled
          allowsBackForwardNavigationGestures
          pullToRefreshEnabled
          startInLoadingState
          originWhitelist={['*']}
          setSupportMultipleWindows
          allowsInlineMediaPlayback
          mediaPlaybackRequiresUserAction
          allowsPictureInPictureMediaPlayback={false}
          mediaCapturePermissionGrantType="grant"
          javaScriptCanOpenWindowsAutomatically
          decelerationRate="normal"
          contentInsetAdjustmentBehavior="never"
          automaticallyAdjustContentInsets={false}
          keyboardDisplayRequiresUserAction={false}
          hideKeyboardAccessoryView
          injectedJavaScriptBeforeContentLoaded={CLOAK_INJECTION}
          onShouldStartLoadWithRequest={handleShouldStart}
          onOpenWindow={handleOpenWindow}
          onNavigationStateChange={handleNavigationStateChange}
          onMessage={handleMessage}
          onLoadStart={handleLoadStart}
          onLoadEnd={handleLoadEnd}
          onError={handleError}
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
            ]}>
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
              accessibilityLabel="Go back">
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
              accessibilityLabel="Go forward">
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
            <TouchableOpacity onPress={reload} style={styles.retryButton}>
              <Text style={styles.retryText}>Try Again</Text>
            </TouchableOpacity>
          </View>
        )}

        {loading && !error && (
          <View style={styles.topLoader} pointerEvents="none">
            <ActivityIndicator size="small" color={BRAND_COLOR} />
          </View>
        )}

        {nativeMember && !showNativeChat ? (
          <TouchableOpacity
            style={styles.coupleMenuPill}
            activeOpacity={0.78}
            onPress={returnToCoupleMenu}
            accessibilityRole="button"
            accessibilityLabel="Back to app menu">
            <Text style={styles.coupleMenuPillText}>App Menu</Text>
          </TouchableOpacity>
        ) : null}

        {nativeMember && chatUnreadCount > 0 ? (
          <TouchableOpacity
            style={styles.chatBubble}
            activeOpacity={0.82}
            onPress={openChatWithBridge}
            accessibilityRole="button"
            accessibilityLabel="Open WeddingWin messages">
            <MessageCircle size={27} color="#FFFFFF" strokeWidth={2.2} />
            {chatUnreadCount > 0 ? (
              <View style={styles.chatBubbleBadge}>
                <Text style={styles.chatBubbleBadgeText}>
                  {chatUnreadCount > 99 ? '99+' : chatUnreadCount}
                </Text>
              </View>
            ) : null}
          </TouchableOpacity>
        ) : null}

        {renderNativeChatOverlay()}
        <NativeQrScanner
          visible={showNativeQrScanner}
          onClose={() => setShowNativeQrScanner(false)}
          onScan={handleNativeQrScan}
          nativeSession={nativeBridgeSession}
        />
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
  nativeChatOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 80,
    elevation: 80,
    backgroundColor: '#FFF8F5',
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
  brandLogo: {
    width: '100%',
    height: 72,
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
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingHorizontal: 11,
    paddingVertical: 10,
    marginBottom: 8,
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
    width: 94,
    height: 94,
    borderRadius: 16,
    backgroundColor: '#FFF3EF',
  },
  qrMenuCard: {
    backgroundColor: '#FFFCFA',
    borderColor: '#EAD2CC',
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
  qrMenuIconWrap: {
    width: 94,
    height: 94,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: BRAND_COLOR,
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
    borderRadius: 22,
    backgroundColor: '#FFF8F5',
    padding: 20,
    shadowColor: '#000000',
    shadowOpacity: 0.22,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 12 },
    elevation: 12,
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
    marginTop: 18,
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
    maxHeight: '92%',
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    backgroundColor: '#FFF8F5',
    paddingTop: 18,
    paddingHorizontal: 18,
    paddingBottom: Platform.OS === 'ios' ? 34 : 22,
  },
  vendorRaffleHeader: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
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
  vendorRaffleClose: {
    width: 42,
    height: 42,
    borderRadius: 21,
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
  vendorRaffleTextAreaShell: {
    minHeight: 92,
    alignItems: 'flex-start',
  },
  vendorRaffleTextArea: {
    minHeight: 72,
    textAlignVertical: 'top',
  },
  vendorRaffleStatsRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 16,
  },
  vendorRaffleStat: {
    flex: 1,
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
  vendorRaffleHint: {
    color: '#756662',
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '800',
    textAlign: 'center',
    marginTop: 8,
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
  chatMessages: {
    flex: 1,
  },
  chatMessagesContent: {
    flexGrow: 1,
    padding: 14,
    gap: 9,
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
  chatMessageImage: {
    width: 220,
    height: 160,
    maxWidth: '100%',
    borderRadius: 8,
    backgroundColor: '#F7EDEA',
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
