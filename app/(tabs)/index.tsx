import { useCallback, useEffect, useMemo, useRef, useState, type ComponentType } from 'react';
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
import { useFocusEffect } from '@react-navigation/native';
import { useNavigation } from 'expo-router';
import {
  WebView,
  type WebViewNavigation,
} from 'react-native-webview';
import * as AuthSession from 'expo-auth-session';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';
import {
  CameraView,
  useCameraPermissions,
  type BarcodeScanningResult,
} from 'expo-camera';
import Constants from 'expo-constants';
import { StatusBar } from 'expo-status-bar';
import { createAudioPlayer, setAudioModeAsync } from 'expo-audio';
import * as Haptics from 'expo-haptics';
import * as Notifications from 'expo-notifications';
import * as SecureStore from 'expo-secure-store';
import * as WebBrowser from 'expo-web-browser';
import DateTimePicker from '@react-native-community/datetimepicker';
import {
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Eye,
  Globe2,
  LayoutDashboard,
  LockKeyhole,
  Mail,
  MessageCircle,
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
type NativeChatSyncAction = 'list' | 'read' | 'send' | 'report' | 'open_vendor_profile';
type QrBingoVendor = {
  id: string;
  name: string;
  cover_photo?: string;
  full_filename?: string;
  user_id?: string;
};
type QrBingoRaffleOffer = {
  app_review_fixture?: boolean;
  outbound_email_suppressed?: boolean;
  vendor_id: string;
  vendor_name: string;
  prize_title: string;
  prize_description?: string;
  prize_approx_value_cad?: number;
  eligibility_region?: string;
  entry_closes_at?: string;
  draw_at?: string;
  odds_basis?: string;
  no_purchase_required?: boolean;
  skill_testing_question_required?: boolean;
  alternate_free_entry_url?: string;
  eligibility_exclusions?: string;
  terms_url: string;
  consent_version: string;
  potential_winner_share_fields?: string[];
  administrator_name?: string;
  co_sponsor_name?: string;
  prize_provider_name?: string;
  apple_non_sponsor_disclaimer?: string;
};
type QrBingoGrandPrizeOffer = {
  prize_title: string;
  prize_description: string;
  prize_approx_value_cad: number;
  eligibility_region: string;
  entry_closes_at: string;
  draw_at: string;
  odds_basis: string;
  no_purchase_required: boolean;
  skill_testing_question_required: boolean;
  alternate_free_entry_url: string;
  eligibility_exclusions: string;
  prize_provider_name: string;
  administrator_name: string;
  sponsor_name: string;
  terms_url: string;
  consent_version: string;
  apple_non_sponsor_disclaimer: string;
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
  grand_prize_available?: boolean;
  grand_prize_entry_confirmed?: boolean;
  grand_prize_offer?: QrBingoGrandPrizeOffer | null;
};
type QrBingoRaffleSettings = {
  enabled: boolean;
  prize_title: string;
  prize_description: string;
  prize_approx_value_cad?: number | null;
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
  selection_status?: 'legacy' | 'potential' | 'verified' | 'disqualified';
  eligibility_verified_at?: string;
  skill_question_verified_at?: string;
  verified_at?: string;
};
type QrBingoVendorRaffleResponse = {
  ok?: boolean;
  error?: string;
  detail?: string;
  conflict?: boolean;
  vendor?: QrBingoVendor;
  settings?: QrBingoRaffleSettings;
  entries?: QrBingoRaffleEntry[];
  draws?: QrBingoRaffleDraw[];
  can_draw?: boolean;
  max_draws?: number;
  draws_remaining?: number;
  draw_limit_reached?: boolean;
  entry_count?: number;
  material_terms_locked?: boolean;
  can_send_verified_winner_notice?: boolean;
  verified_potential_winner_notice_pending?: boolean;
  outbound_email_enabled?: boolean;
  app_review_fixture?: boolean;
  outbound_email_suppressed?: boolean;
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
  administrator_name?: string;
  co_sponsor_name?: string;
  prize_provider_name?: string;
  apple_non_sponsor_disclaimer?: string;
  email_result?: {
    vendor?: { sent?: boolean; error?: string };
    couple?: { sent?: boolean; error?: string };
    error?: string;
  };
};
type QrScanFeedbackTone = 'idle' | 'success' | 'duplicate' | 'error';

const TARGET_URL = 'https://www.weddingwin.ca';
const WEBSITE_LOGOUT_URL = `${TARGET_URL}/account/logout`;
const DEFAULT_BRIDGE_TARGET_PATH = '/account/home';
const COUPLE_MEMBERSHIP_PLAN_ID = '18';
const VENDOR_MEMBERSHIP_PLAN_ID = '17';
const VENDOR_MEMBERSHIP_PLAN_IDS = new Set(['17', '27', '28']);
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
const ACCOUNT_DELETED_EVENT_KEY = 'weddingwin.accountDeleted.v1';
const CHAT_STATUS_POLL_MS = 30000;
const DEFAULT_CHAT_INBOX_PATH = '/account/chat_messages';
const CHAT_REPORTED_NOTICE =
  'Member blocked: This conversation is closed and future messages from this member will not appear while WeddingWin reviews your report.';
const CHAT_IMAGES_DISABLED_NOTICE =
  'Photo sharing is temporarily unavailable while WeddingWin completes image-safety review. Text messages are still available.';
const CHAT_DING_SOUND = require('../../assets/sounds/chat-ding.wav');
const QR_VENDOR_DRAW_MOBILE_SLIDES = [
  require('../../assets/images/qr-bingo/vendor-draw-mobile/vendor-draw-mobile-slide-01.webp'),
  require('../../assets/images/qr-bingo/vendor-draw-mobile/vendor-draw-mobile-slide-02.webp'),
  require('../../assets/images/qr-bingo/vendor-draw-mobile/vendor-draw-mobile-slide-03.webp'),
  require('../../assets/images/qr-bingo/vendor-draw-mobile/vendor-draw-mobile-slide-04.webp'),
  require('../../assets/images/qr-bingo/vendor-draw-mobile/vendor-draw-mobile-slide-05.webp'),
];
const CHAT_INBOX_PATHS = new Set([
  '/account/chat_messages',
  '/account/chat/messages',
]);
// Immutable compatibility map from the original active tag-27 roster sorted by
// BD user_id. Only vendors that are also active in the October tag-30 roster
// are accepted; tag-30-only member 37878 never had an NWS25 code.
const LEGACY_NWS25_VENDOR_IDS: Readonly<Record<string, string>> = Object.freeze({
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
});
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
    return isTrustedWebsiteBridgeUrl(parsed.toString()) &&
      parsed.pathname === '/app-login' &&
      /^[A-Za-z0-9_-]{43}$/.test(parsed.searchParams.get('code') || '');
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
    return parsed.protocol === 'https:' && parsed.hostname.toLowerCase() === 'accounts.google.com';
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
  codeChallenge: string,
  consent?: SignupConsent
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
  return globalThis.btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function createGooglePkcePair() {
  const codeVerifier = base64UrlFromBytes(await Crypto.getRandomBytesAsync(32));
  const base64Challenge = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    codeVerifier,
    { encoding: Crypto.CryptoEncoding.BASE64 }
  );
  return {
    codeVerifier,
    codeChallenge: base64Challenge.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''),
  };
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
    if (parsed.protocol !== 'https:' || !isWeddingWinHost(parsed.hostname)) return '';
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
    (inboxPath) => normalized === inboxPath || normalized.startsWith(`${inboxPath}/view/`)
  );
}

function chatThreadTokenFromPath(path: string): string {
  const normalized = path.replace(/\/+$/, '') || '/';
  for (const inboxPath of CHAT_INBOX_PATHS) {
    const prefix = `${inboxPath}/view/`;
    if (!normalized.startsWith(prefix)) continue;
    try {
      return decodeURIComponent(normalized.slice(prefix.length).split('/')[0] || '').trim();
    } catch {
      return '';
    }
  }
  return '';
}

function isVendorConnectPath(path: string): boolean {
  const parts = path.replace(/^\/+|\/+$/g, '').split('/').filter(Boolean);
  return parts.length >= 2 && parts[parts.length - 1] === 'connect';
}

function vendorNameFromConnectUrl(url: string): string {
  try {
    const parsed = new URL(url, TARGET_URL);
    const parts = parsed.pathname.replace(/^\/+|\/+$/g, '').split('/').filter(Boolean);
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

function needsContactProfile(member: NativeMember | null): boolean {
  if (!member?.email) return false;
  const firstName = String(member.first_name || '').trim();
  return (
    isApplePrivateRelayEmail(member.email) ||
    !firstName ||
    firstName.toLowerCase() === 'weddingwin couple' ||
    !normalizeWeddingDate(member.wedding_date)
  );
}

function normalizeMemberRole(value: unknown): SignupRole | null {
  const role = String(value || '').trim().toLowerCase();
  if (!role) return null;
  if (/^(couple|couples|bride|groom|engaged|wedding couple)$/.test(role)) return 'couple';
  if (/^(vendor|business|professional|wedding vendor)$/.test(role)) return 'vendor';
  return null;
}

function memberAccountRole(
  member: NativeMember | null,
  fallbackRole: SignupRole = 'couple'
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
  if (String(member.first_name || '').trim().toLowerCase() === 'weddingwin couple') {
    return 'couple';
  }

  // Unknown/missing plan data must not silently grant vendor-only UI. The
  // selected login role is persisted as account_role whenever it is available.
  return fallbackRole;
}

function withMemberRole(member: NativeMember, fallbackRole: SignupRole): NativeMember {
  return {
    ...member,
    account_role: memberAccountRole(member, fallbackRole),
  };
}

function isCoupleAccount(member: NativeMember | null): boolean {
  return !!member && memberAccountRole(member) === 'couple';
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

function formatPromotionDate(value?: string): string {
  const date = new Date(value || '');
  if (!Number.isFinite(date.getTime())) return 'See official rules';
  return date.toLocaleString('en-CA', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
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
    return vendors.find((vendor) => vendorIdentityTokens(vendor).has(legacyVendorId)) || null;
  }

  const candidates = qrVendorTokens(raw);
  if (!candidates.size) return null;
  return vendors.find((vendor) => {
    const identities = vendorIdentityTokens(vendor);
    return [...candidates].some((candidate) => identities.has(candidate));
  }) || null;
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
  const requestCameraPermissionRef = useRef(requestPermission);
  const canRequestCameraPermission = Boolean(
    permission && !permission.granted && permission.canAskAgain
  );
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
  const [raffleRulesViewedVersion, setRaffleRulesViewedVersion] = useState('');
  const [grandPrizeOffer, setGrandPrizeOffer] = useState<QrBingoGrandPrizeOffer | null>(null);
  const [grandPrizeRulesViewedVersion, setGrandPrizeRulesViewedVersion] = useState('');
  const [grandPrizeSaving, setGrandPrizeSaving] = useState(false);
  const [ageOfMajorityAttested, setAgeOfMajorityAttested] = useState(false);
  const [residencyAttested, setResidencyAttested] = useState(false);
  const [exclusionsAttested, setExclusionsAttested] = useState(false);
  const scanFeedbackClearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    requestCameraPermissionRef.current = requestPermission;
  }, [requestPermission]);

  const resetEligibilityAttestations = useCallback(() => {
    setAgeOfMajorityAttested(false);
    setResidencyAttested(false);
    setExclusionsAttested(false);
  }, []);

  const clearScanFeedbackTimer = useCallback(() => {
    if (scanFeedbackClearTimerRef.current) {
      clearTimeout(scanFeedbackClearTimerRef.current);
      scanFeedbackClearTimerRef.current = null;
    }
  }, []);

  const showScanFeedback = useCallback((
    label: string,
    tone: QrScanFeedbackTone,
    clearAfterMs?: number,
  ) => {
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
  }, [clearScanFeedbackTimer]);

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
      setGrandPrizeOffer(data.grand_prize_offer || null);
    } catch (error) {
      setBingoError(error instanceof Error ? error.message : 'QR Bingo is unavailable right now.');
    } finally {
      setLoadingBingo(false);
    }
  }, [nativeSession]);

  useEffect(() => {
    if (!visible) {
      showScanFeedback('', 'idle');
      return;
    }
    setScanLocked(false);
    showScanFeedback('', 'idle');
    setRaffleOffer(null);
    setRaffleRulesViewedVersion('');
    setGrandPrizeOffer(null);
    setGrandPrizeRulesViewedVersion('');
    setAgeOfMajorityAttested(false);
    setResidencyAttested(false);
    setExclusionsAttested(false);
    setBingoTotalCount(null);
    loadBingoCard();
    if (canRequestCameraPermission) {
      requestCameraPermissionRef.current().catch(() => {});
    }
  }, [canRequestCameraPermission, loadBingoCard, showScanFeedback, visible]);

  useEffect(() => clearScanFeedbackTimer, [clearScanFeedbackTimer]);

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
      showScanFeedback(
        data.completed
          ? data.grand_prize_entry_confirmed
            ? 'QR Bingo complete. Your grand-prize entry is confirmed.'
            : data.grand_prize_offer
              ? 'QR Bingo complete. Review the official rules to choose whether to enter the grand-prize draw.'
              : 'QR Bingo card complete. Grand-prize entry is not currently open.'
          : `Scanned: ${vendor.name}`,
        'success',
        data.completed ? undefined : 5000
      );
      if (data.raffle_offer) {
        setRaffleRulesViewedVersion('');
        setAgeOfMajorityAttested(false);
        setResidencyAttested(false);
        setExclusionsAttested(false);
        setRaffleOffer(data.raffle_offer);
      }
      setGrandPrizeRulesViewedVersion('');
      setGrandPrizeOffer(data.grand_prize_offer || null);
      return true;
    } catch (error) {
      setBingoError(error instanceof Error ? error.message : 'This vendor scan could not be saved.');
      return false;
    } finally {
      setSavingBingo(false);
    }
  }, [nativeSession, showScanFeedback, vendors]);

  const handleBarcodeScanned = useCallback(async (result: BarcodeScanningResult) => {
    const value = result.data?.trim();
    if (scanLocked || !value) return;
    setScanLocked(true);
    const matched = matchQrBingoVendor(value, vendors);
    if (!matched) {
      showScanFeedback('Unrecognized QR', 'error', 5000);
      setTimeout(() => setScanLocked(false), 1600);
      return;
    }

    if (scannedVendorIds.has(matched.id)) {
      setBingoError(null);
      showScanFeedback(`Already scanned: ${matched.name}`, 'duplicate', 5000);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      setTimeout(() => setScanLocked(false), 1200);
      return;
    }

    const saved = await saveBingoScan(matched);
    if (saved) {
      onScan(value);
    }
    setTimeout(() => setScanLocked(false), 1600);
  }, [onScan, saveBingoScan, scanLocked, scannedVendorIds, showScanFeedback, vendors]);

  const enterRaffle = useCallback(async () => {
    if (!raffleOffer || raffleSaving || !nativeSession?.user_id || !nativeSession?.token) return;
    if (raffleRulesViewedVersion !== raffleOffer.consent_version) {
      setBingoError('Open the official rules before choosing to enter this vendor draw.');
      return;
    }
    if (!ageOfMajorityAttested || !residencyAttested || !exclusionsAttested) {
      setBingoError('Confirm all three eligibility statements before entering this vendor draw.');
      return;
    }
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
          consent_version: raffleOffer.consent_version,
          rules_viewed: true,
          apple_non_sponsor_acknowledged: true,
          age_of_majority_attested: ageOfMajorityAttested,
          residency_attested: residencyAttested,
          exclusions_attested: exclusionsAttested,
        }),
      });
      const data = await response.json();
      if (!response.ok || data?.ok === false) {
        throw new Error(data?.detail || data?.error || 'Could not enter this draw.');
      }
      showScanFeedback(
        data.already_entered
          ? 'You are already entered for this vendor draw.'
          : `Entered: ${raffleOffer.vendor_name} draw`,
        'success'
      );
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      setRaffleOffer(null);
      resetEligibilityAttestations();
    } catch (error) {
      setBingoError(error instanceof Error ? error.message : 'Could not enter this draw.');
    } finally {
      setRaffleSaving(false);
    }
  }, [ageOfMajorityAttested, exclusionsAttested, nativeSession, raffleOffer, raffleRulesViewedVersion, raffleSaving, resetEligibilityAttestations, residencyAttested, showScanFeedback]);

  const enterGrandPrize = useCallback(async () => {
    if (!grandPrizeOffer || grandPrizeSaving || !nativeSession?.user_id || !nativeSession?.token) return;
    if (grandPrizeRulesViewedVersion !== grandPrizeOffer.consent_version) {
      setBingoError('Open the official rules before choosing to enter the grand-prize draw.');
      return;
    }
    if (!ageOfMajorityAttested || !residencyAttested || !exclusionsAttested) {
      setBingoError('Confirm all three eligibility statements before entering the grand-prize draw.');
      return;
    }
    setGrandPrizeSaving(true);
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
          action: 'grand_prize_opt_in',
          native_session: nativeSession,
          consent_version: grandPrizeOffer.consent_version,
          rules_viewed: true,
          apple_non_sponsor_acknowledged: true,
          age_of_majority_attested: ageOfMajorityAttested,
          residency_attested: residencyAttested,
          exclusions_attested: exclusionsAttested,
        }),
      });
      const data = await response.json();
      if (!response.ok || data?.ok === false) {
        throw new Error(data?.detail || data?.error || 'Could not confirm the grand-prize entry.');
      }
      showScanFeedback('QR Bingo complete. Your grand-prize entry is confirmed.', 'success');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      setGrandPrizeOffer(null);
      resetEligibilityAttestations();
    } catch (error) {
      setBingoError(error instanceof Error ? error.message : 'Could not confirm the grand-prize entry.');
    } finally {
      setGrandPrizeSaving(false);
    }
  }, [ageOfMajorityAttested, exclusionsAttested, grandPrizeOffer, grandPrizeRulesViewedVersion, grandPrizeSaving, nativeSession, resetEligibilityAttestations, residencyAttested, showScanFeedback]);

  if (!visible) return null;

  const hasPermission = permission?.granted;
  const canAskPermission = permission?.canAskAgain !== false;
  const scannedCount = scannedVendorIds.size;
  const totalCount = bingoTotalCount ?? vendors.length;
  const totalLabel = totalCount > 0 ? String(totalCount) : '...';
  const progressPercent = totalCount > 0 ? Math.round((scannedCount / totalCount) * 100) : 0;
  const completed = totalCount > 0 && scannedCount === totalCount;
  const eligibilityConfirmed = ageOfMajorityAttested && residencyAttested && exclusionsAttested;

  return (
    <View
      style={styles.qrOverlay}
      accessibilityViewIsModal
      importantForAccessibility="yes"
      onAccessibilityEscape={onClose}>
      <StatusBar style="light" animated />
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
              accessible={false}
              importantForAccessibility="no-hide-descendants"
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
                pointerEvents="none"
                accessible={false}
                importantForAccessibility="no-hide-descendants">
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
                accessibilityLabel="Allow camera access for QR Bingo">
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
            ]}
            accessibilityRole="text"
            accessibilityLabel={`QR scan result: ${lastScanLabel}`}>
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
                  style={[styles.qrVendorTile, isScanned && styles.qrVendorTileScanned]}
                  accessible
                  accessibilityRole="text"
                  accessibilityLabel={`${vendor.name}. ${isScanned ? 'Scanned' : 'Not scanned'}`}>
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
        onRequestClose={() => { setRaffleOffer(null); resetEligibilityAttestations(); }}>
        <View style={styles.raffleModalBackdrop}>
          <ScrollView
            style={styles.raffleModalCard}
            contentContainerStyle={styles.raffleModalCardContent}
            showsVerticalScrollIndicator={false}>
            <Text style={styles.raffleModalEyebrow}>Vendor Draw</Text>
            <Text style={styles.raffleModalTitle}>{raffleOffer?.prize_title || 'Enter vendor draw'}</Text>
            <Text style={styles.raffleModalVendor}>{raffleOffer?.vendor_name}</Text>
            {raffleOffer?.app_review_fixture ? (
              <Text style={styles.raffleModalText}>
                App Review test fixture only. This is not a real promotion, no prize is awarded, and outbound email is disabled.
              </Text>
            ) : null}
            {raffleOffer?.prize_description ? (
              <Text style={styles.raffleModalText}>{raffleOffer.prize_description}</Text>
            ) : null}
            <Text style={styles.raffleModalText}>
              Approximate retail value: ${Number(raffleOffer?.prize_approx_value_cad || 0).toFixed(2)} CAD{`\n`}
              Eligibility: {raffleOffer?.eligibility_region}{`\n`}
              Entries close: {formatPromotionDate(raffleOffer?.entry_closes_at)}{`\n`}
              Draw: {formatPromotionDate(raffleOffer?.draw_at)}
            </Text>
            <Text style={styles.raffleModalText}>
              No purchase necessary. {raffleOffer?.odds_basis} A potential winner must correctly answer a mathematical skill-testing question before the prize is awarded.
            </Text>
            <Text style={styles.raffleModalText}>
              Wedding Win Inc. uses entry data only to administer this draw. The vendor receives contact details only if you are selected as a potential winner, solely for verification and prize fulfillment—not marketing.
            </Text>
            <Text style={styles.raffleModalText}>
              Wedding Win Inc. administers and co-sponsors the in-app draw. {raffleOffer?.prize_provider_name || raffleOffer?.vendor_name} supplies and fulfills the prize.
            </Text>
            <Text style={styles.raffleModalText}>
              {raffleOffer?.apple_non_sponsor_disclaimer || 'Apple Inc. is not a sponsor of and is not involved in this promotion.'}
            </Text>
            <TouchableOpacity
              activeOpacity={0.76}
              onPress={() => {
                if (!raffleOffer?.terms_url) return;
                Linking.openURL(raffleOffer.terms_url)
                  .then(() => setRaffleRulesViewedVersion(raffleOffer.consent_version))
                  .catch(() => setBingoError('The official rules could not be opened.'));
              }}
              accessibilityRole="link"
              accessibilityLabel="View vendor draw rules">
              <Text style={styles.raffleTermsLink}>View draw rules</Text>
            </TouchableOpacity>
            <TouchableOpacity
              activeOpacity={0.76}
              onPress={() => raffleOffer?.alternate_free_entry_url && Linking.openURL(raffleOffer.alternate_free_entry_url).catch(() => setBingoError('The alternate free entry route could not be opened.'))}
              accessibilityRole="link"
              accessibilityLabel="Open alternate free entry method">
              <Text style={styles.raffleTermsLink}>Alternate free entry — no booth scan or attendance required</Text>
            </TouchableOpacity>
            <Text style={styles.raffleModalText}>
              {raffleRulesViewedVersion === raffleOffer?.consent_version
                ? 'Rules opened. Enter Draw now records your acceptance.'
                : 'Open the rules before the entry button becomes available.'}
            </Text>
            <TouchableOpacity
              style={styles.signupConsentToggle}
              onPress={() => setAgeOfMajorityAttested((value) => !value)}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: ageOfMajorityAttested }}>
              <View style={[styles.signupConsentBox, ageOfMajorityAttested && styles.signupConsentBoxChecked]}>
                {ageOfMajorityAttested ? <Text style={styles.signupConsentCheck}>{'\u2713'}</Text> : null}
              </View>
              <Text style={styles.signupConsentText}>I have reached the age of majority.</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.signupConsentToggle}
              onPress={() => setResidencyAttested((value) => !value)}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: residencyAttested }}>
              <View style={[styles.signupConsentBox, residencyAttested && styles.signupConsentBoxChecked]}>
                {residencyAttested ? <Text style={styles.signupConsentCheck}>{'\u2713'}</Text> : null}
              </View>
              <Text style={styles.signupConsentText}>I reside in the eligible region shown above.</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.signupConsentToggle}
              onPress={() => setExclusionsAttested((value) => !value)}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: exclusionsAttested }}>
              <View style={[styles.signupConsentBox, exclusionsAttested && styles.signupConsentBoxChecked]}>
                {exclusionsAttested ? <Text style={styles.signupConsentCheck}>{'\u2713'}</Text> : null}
              </View>
              <Text style={styles.signupConsentText}>I am not an employee, prize provider, or excluded household member under the rules.</Text>
            </TouchableOpacity>
            <View style={styles.raffleModalActions}>
              <TouchableOpacity
                style={styles.raffleCancelButton}
                activeOpacity={0.78}
                onPress={() => { setRaffleOffer(null); resetEligibilityAttestations(); }}
                disabled={raffleSaving}
                accessibilityRole="button"
                accessibilityLabel="Decline vendor draw entry">
                <Text style={styles.raffleCancelText}>No Thanks</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.raffleEnterButton}
                activeOpacity={0.86}
                onPress={enterRaffle}
                disabled={raffleSaving || raffleRulesViewedVersion !== raffleOffer?.consent_version || !eligibilityConfirmed}
                accessibilityRole="button"
                accessibilityLabel="Enter vendor draw">
                {raffleSaving ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.raffleEnterText}>
                    {raffleRulesViewedVersion === raffleOffer?.consent_version && eligibilityConfirmed ? 'Accept Rules & Enter' : 'Review & Confirm Eligibility'}
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </Modal>
      <Modal
        visible={!!grandPrizeOffer && !raffleOffer}
        transparent
        animationType="fade"
        onRequestClose={() => { setGrandPrizeOffer(null); resetEligibilityAttestations(); }}>
        <View style={styles.raffleModalBackdrop}>
          <ScrollView
            style={styles.raffleModalCard}
            contentContainerStyle={styles.raffleModalCardContent}
            showsVerticalScrollIndicator={false}>
            <Text style={styles.raffleModalEyebrow}>QR Bingo Complete</Text>
            <Text style={styles.raffleModalTitle}>{grandPrizeOffer?.prize_title || 'Grand-prize draw'}</Text>
            <Text style={styles.raffleModalText}>{grandPrizeOffer?.prize_description}</Text>
            <Text style={styles.raffleModalText}>
              Approximate retail value: ${Number(grandPrizeOffer?.prize_approx_value_cad || 0).toFixed(2)} CAD{`\n`}
              Eligibility: {grandPrizeOffer?.eligibility_region}{`\n`}
              Entries close: {formatPromotionDate(grandPrizeOffer?.entry_closes_at)}{`\n`}
              Draw: {formatPromotionDate(grandPrizeOffer?.draw_at)}
            </Text>
            <Text style={styles.raffleModalText}>
              No purchase necessary. {grandPrizeOffer?.odds_basis} A potential winner must correctly answer a mathematical skill-testing question before the prize is awarded.
            </Text>
            <Text style={styles.raffleModalText}>
              Wedding Win Inc. administers and sponsors this in-app promotion. {grandPrizeOffer?.prize_provider_name} supplies or fulfills the prize.
            </Text>
            <Text style={styles.raffleModalText}>
              {grandPrizeOffer?.apple_non_sponsor_disclaimer || 'Apple Inc. is not a sponsor of and is not involved in this promotion.'}
            </Text>
            <Text style={styles.raffleModalText}>
              Entry data is used only to administer, verify, and fulfill this promotion—not for marketing.
            </Text>
            <TouchableOpacity
              activeOpacity={0.76}
              onPress={() => {
                if (!grandPrizeOffer?.terms_url) return;
                Linking.openURL(grandPrizeOffer.terms_url)
                  .then(() => setGrandPrizeRulesViewedVersion(grandPrizeOffer.consent_version))
                  .catch(() => setBingoError('The official rules could not be opened.'));
              }}
              accessibilityRole="link"
              accessibilityLabel="View grand-prize official rules">
              <Text style={styles.raffleTermsLink}>View official rules</Text>
            </TouchableOpacity>
            <TouchableOpacity
              activeOpacity={0.76}
              onPress={() => grandPrizeOffer?.alternate_free_entry_url && Linking.openURL(grandPrizeOffer.alternate_free_entry_url).catch(() => setBingoError('The alternate free entry route could not be opened.'))}
              accessibilityRole="link"
              accessibilityLabel="Open alternate free grand-prize entry method">
              <Text style={styles.raffleTermsLink}>Alternate free entry — no booth scan or attendance required</Text>
            </TouchableOpacity>
            <Text style={styles.raffleModalText}>
              {grandPrizeRulesViewedVersion === grandPrizeOffer?.consent_version
                ? 'Rules opened. Confirm Entry now records your acceptance.'
                : 'Completing the QR card does not enter you automatically. Open the rules before confirming.'}
            </Text>
            <TouchableOpacity
              style={styles.signupConsentToggle}
              onPress={() => setAgeOfMajorityAttested((value) => !value)}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: ageOfMajorityAttested }}>
              <View style={[styles.signupConsentBox, ageOfMajorityAttested && styles.signupConsentBoxChecked]}>
                {ageOfMajorityAttested ? <Text style={styles.signupConsentCheck}>{'\u2713'}</Text> : null}
              </View>
              <Text style={styles.signupConsentText}>I have reached the age of majority.</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.signupConsentToggle}
              onPress={() => setResidencyAttested((value) => !value)}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: residencyAttested }}>
              <View style={[styles.signupConsentBox, residencyAttested && styles.signupConsentBoxChecked]}>
                {residencyAttested ? <Text style={styles.signupConsentCheck}>{'\u2713'}</Text> : null}
              </View>
              <Text style={styles.signupConsentText}>I reside in the eligible region shown above.</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.signupConsentToggle}
              onPress={() => setExclusionsAttested((value) => !value)}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: exclusionsAttested }}>
              <View style={[styles.signupConsentBox, exclusionsAttested && styles.signupConsentBoxChecked]}>
                {exclusionsAttested ? <Text style={styles.signupConsentCheck}>{'\u2713'}</Text> : null}
              </View>
              <Text style={styles.signupConsentText}>I am not an employee, prize provider, or excluded household member under the rules.</Text>
            </TouchableOpacity>
            <View style={styles.raffleModalActions}>
              <TouchableOpacity
                style={styles.raffleCancelButton}
                activeOpacity={0.78}
                onPress={() => { setGrandPrizeOffer(null); resetEligibilityAttestations(); }}
                disabled={grandPrizeSaving}
                accessibilityRole="button"
                accessibilityLabel="Decline grand-prize entry">
                <Text style={styles.raffleCancelText}>No Thanks</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.raffleEnterButton}
                activeOpacity={0.86}
                onPress={enterGrandPrize}
                disabled={grandPrizeSaving || grandPrizeRulesViewedVersion !== grandPrizeOffer?.consent_version || !eligibilityConfirmed}
                accessibilityRole="button"
                accessibilityLabel="Accept rules and confirm grand-prize entry">
                {grandPrizeSaving ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.raffleEnterText}>
                    {grandPrizeRulesViewedVersion === grandPrizeOffer?.consent_version && eligibilityConfirmed ? 'Accept Rules & Enter' : 'Review & Confirm Eligibility'}
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </ScrollView>
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
  onOpenWebsiteBuilder,
  onOpenDashboard,
  onOpenChat,
  onOpenQrScanner,
  chatUnreadCount,
}: {
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
    badgeCount = 0
  ) => (
    <TouchableOpacity
      testID={testID}
      accessible
      style={styles.coupleBottomNavItem}
      activeOpacity={0.78}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}>
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
      pointerEvents="auto">
      {renderItem('couple-bottom-nav-website', 'Website', 'Open wedding website builder', Globe2, onOpenWebsiteBuilder)}
      {renderItem('couple-bottom-nav-vendors', 'Vendors', 'Open vendor search dashboard', Search, onOpenDashboard)}
      {renderItem('couple-bottom-nav-messages', 'Messages', 'Open private messages', MessageCircle, onOpenChat, chatUnreadCount)}
      {renderItem('couple-bottom-nav-qr-bingo', 'QR Bingo', 'Open QR Bingo scanner', QrCode, onOpenQrScanner)}
    </View>
  );
}

function VendorBottomNav({
  onOpenVendorDashboard,
  onOpenChat,
  onOpenVendorDraw,
  chatUnreadCount,
}: {
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
    badgeCount = 0
  ) => (
    <TouchableOpacity
      testID={testID}
      accessible
      style={styles.coupleBottomNavItem}
      activeOpacity={0.78}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}>
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
      pointerEvents="auto">
      {renderItem('vendor-bottom-nav-dashboard', 'Dashboard', 'Open vendor dashboard', LayoutDashboard, onOpenVendorDashboard)}
      {renderItem('vendor-bottom-nav-messages', 'Messages', 'Open private messages', MessageCircle, onOpenChat, chatUnreadCount)}
      {renderItem('vendor-bottom-nav-draw', 'Draw', 'Open QR Bingo vendor draw settings', QrCode, onOpenVendorDraw)}
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
  vendorDrawOpenRequestId,
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
  onSignOut: () => void | Promise<void>;
  nativeSession: NativeBridgeSession | null;
  vendorDrawOpenRequestId: number;
}) {
  const { width: viewportWidth, height: viewportHeight } = useWindowDimensions();
  const vendorDrawSlideWidth = Math.min(Math.max(viewportWidth - 82, 260), 380);
  const vendorDrawSlideHeight = Math.round(vendorDrawSlideWidth * (1920 / 1088));
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
  const [profileWeddingDate, setProfileWeddingDate] = useState(
    normalizeWeddingDate(member?.wedding_date)
  );
  const [showWeddingPicker, setShowWeddingPicker] = useState(false);
  const [signupConsentAccepted, setSignupConsentAccepted] = useState(false);
  const [showVendorRaffle, setShowVendorRaffle] = useState(false);
  const [vendorRaffleLoading, setVendorRaffleLoading] = useState(false);
  const [vendorRaffleSaving, setVendorRaffleSaving] = useState(false);
  const [vendorRaffleDrawing, setVendorRaffleDrawing] = useState(false);
  const [vendorRaffleError, setVendorRaffleError] = useState<string | null>(null);
  const [vendorRaffle, setVendorRaffle] = useState<QrBingoVendorRaffleResponse | null>(null);
  const [vendorRaffleSlideIndex, setVendorRaffleSlideIndex] = useState(0);
  const [raffleEnabled, setRaffleEnabled] = useState(false);
  const [rafflePrizeTitle, setRafflePrizeTitle] = useState('');
  const [rafflePrizeDescription, setRafflePrizeDescription] = useState('');
  const [rafflePrizeApproxValueCad, setRafflePrizeApproxValueCad] = useState('');
  const [raffleLegalAccepted, setRaffleLegalAccepted] = useState(false);
  const [vendorRaffleRulesViewedVersion, setVendorRaffleRulesViewedVersion] = useState('');
  const [vendorRaffleSaveMessage, setVendorRaffleSaveMessage] = useState('');
  const vendorRaffleHydratingRef = useRef(false);
  const vendorRaffleLoadedRef = useRef(false);
  const vendorRaffleSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const vendorRaffleLastSavedRef = useRef('');
  const vendorRaffleSaveInFlightRef = useRef(false);
  const vendorRaffleSaveSeqRef = useRef(0);
  const vendorRaffleLastLocalEditRef = useRef(0);
  const lastVendorDrawOpenRequestRef = useRef(0);

  useEffect(() => {
    setProfileFirstName(member?.first_name || '');
    setProfileEmail(isApplePrivateRelayEmail(member?.email) ? '' : member?.email || '');
    setProfileWeddingDate(normalizeWeddingDate(member?.wedding_date));
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
  const showOneAppMenu = !!member && !shouldCompleteProfile && (showCoupleMenu || showVendorMenu);
  const compactOneAppMenu = showOneAppMenu || viewportHeight < 740;
  const vendorRaffleRulesVersion =
    vendorRaffle?.rules_version || vendorRaffle?.settings?.legal_terms_version || '2026-08-28';

  const vendorRaffleSignature = useCallback(
    (
      enabled: boolean,
      prizeDescription: string,
      prizeApproxValueCad: string,
      legalAccepted: boolean
    ) =>
      JSON.stringify({
        enabled,
        prize_description: prizeDescription,
        prize_approx_value_cad: prizeApproxValueCad,
        legal_terms_accepted: legalAccepted,
      }),
    []
  );

  const markVendorRaffleLocalEdit = () => {
    vendorRaffleLastLocalEditRef.current = Date.now();
  };

  const finishVendorRaffleHydration = useCallback(() => {
    setTimeout(() => {
      vendorRaffleHydratingRef.current = false;
      vendorRaffleLoadedRef.current = true;
    }, 0);
  }, []);

  const applyVendorRaffle = useCallback((data: QrBingoVendorRaffleResponse) => {
    vendorRaffleHydratingRef.current = true;
    setVendorRaffle(data);
    setRaffleEnabled(Boolean(data.settings?.enabled));
    setRafflePrizeTitle(data.settings?.prize_title || '');
    setRafflePrizeDescription(data.settings?.prize_description || '');
    setRafflePrizeApproxValueCad(
      data.settings?.prize_approx_value_cad ? String(data.settings.prize_approx_value_cad) : ''
    );
    const currentRulesAccepted = Boolean(data.settings?.legal_terms_accepted && data.rules_current !== false);
    setRaffleLegalAccepted(currentRulesAccepted);
    setVendorRaffleRulesViewedVersion(currentRulesAccepted ? data.rules_version || '' : '');
    vendorRaffleLastSavedRef.current = vendorRaffleSignature(
      Boolean(data.settings?.enabled),
      data.settings?.prize_description || '',
      data.settings?.prize_approx_value_cad ? String(data.settings.prize_approx_value_cad) : '',
      Boolean(data.settings?.legal_terms_accepted)
    );
    setVendorRaffleSaveMessage('Changes save automatically to the app and website.');
    finishVendorRaffleHydration();
  }, [finishVendorRaffleHydration, vendorRaffleSignature]);

  const fetchVendorRaffle = useCallback(async () => {
    vendorRaffleLoadedRef.current = false;
    vendorRaffleHydratingRef.current = false;
    setVendorRaffle(null);
    setVendorRaffleError(null);
    if (!nativeSession?.user_id || !nativeSession?.token) {
      setVendorRaffleLoading(false);
      setVendorRaffleError('Sign in again before opening vendor draw tools.');
      return;
    }
    setVendorRaffleLoading(true);
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
      if (!data?.vendor) {
        throw new Error('Vendor draw tools did not return an eligible vendor.');
      }
      applyVendorRaffle(data);
    } catch (error) {
      setVendorRaffle(null);
      setVendorRaffleError(error instanceof Error ? error.message : 'Vendor draw tools are unavailable.');
    } finally {
      setVendorRaffleLoading(false);
    }
  }, [applyVendorRaffle, nativeSession]);

  const openVendorRaffle = useCallback(() => {
    vendorRaffleLoadedRef.current = false;
    setVendorRaffleSaveMessage('');
    setVendorRaffleSlideIndex(0);
    setShowVendorRaffle(true);
    fetchVendorRaffle();
  }, [fetchVendorRaffle]);

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

  const saveVendorRaffle = useCallback(async (options: { silent?: boolean } = {}) => {
    if (!nativeSession?.user_id || !nativeSession?.token || vendorRaffleSaveInFlightRef.current) return;
    const saveStartedAt = Date.now();
    const saveSeq = vendorRaffleSaveSeqRef.current + 1;
    vendorRaffleSaveSeqRef.current = saveSeq;
    const draftEnabled = raffleEnabled;
    const draftPrizeTitle = rafflePrizeTitle;
    const draftPrizeDescription = rafflePrizeDescription;
    const draftPrizeApproxValueCad = rafflePrizeApproxValueCad;
    const draftLegalAccepted = raffleLegalAccepted;
    const draftRulesViewed =
      draftLegalAccepted && vendorRaffleRulesViewedVersion === vendorRaffleRulesVersion;
    const savedSignature = vendorRaffleSignature(
      draftEnabled,
      draftPrizeDescription,
      draftPrizeApproxValueCad,
      draftLegalAccepted
    );
    vendorRaffleSaveInFlightRef.current = true;
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
          enabled: draftEnabled,
          prize_title: draftPrizeDescription.trim().split(/\r?\n/)[0]?.trim() || draftPrizeTitle,
          prize_description: draftPrizeDescription,
          prize_approx_value_cad: Number(draftPrizeApproxValueCad),
          legal_terms_accepted: draftLegalAccepted,
          consent_version: vendorRaffleRulesVersion,
          rules_viewed: draftRulesViewed,
          apple_non_sponsor_acknowledged: draftRulesViewed,
          settings_updated_at: vendorRaffle?.settings?.updated_at || '',
        }),
      });
      const data = (await response.json()) as QrBingoVendorRaffleResponse;
      if (!response.ok || data?.ok === false) {
        if (response.status === 409 || data?.conflict) {
          const userKeptTyping = vendorRaffleLastLocalEditRef.current > saveStartedAt;
          if (userKeptTyping) {
            setVendorRaffle(data);
            vendorRaffleLastSavedRef.current = vendorRaffleSignature(
              Boolean(data.settings?.enabled),
              data.settings?.prize_description || '',
              data.settings?.prize_approx_value_cad ? String(data.settings.prize_approx_value_cad) : '',
              Boolean(data.settings?.legal_terms_accepted)
            );
          } else {
            applyVendorRaffle(data);
          }
          const message =
            data?.detail ||
            data?.error ||
            'This draw was updated in another tab. Review the latest settings before saving again.';
          if (!options.silent) Alert.alert('Updated in another tab', message);
          throw new Error(message);
        }
        throw new Error(data?.detail || data?.error || 'Could not save this draw.');
      }
      setVendorRaffle(data);
      vendorRaffleLastSavedRef.current = savedSignature;
      if (vendorRaffleLastLocalEditRef.current <= saveStartedAt && saveSeq === vendorRaffleSaveSeqRef.current) {
        vendorRaffleHydratingRef.current = true;
        setRaffleEnabled(Boolean(data.settings?.enabled));
        setRafflePrizeTitle(data.settings?.prize_title || '');
        setRafflePrizeDescription(data.settings?.prize_description || '');
        setRafflePrizeApproxValueCad(
          data.settings?.prize_approx_value_cad ? String(data.settings.prize_approx_value_cad) : ''
        );
        const currentRulesAccepted = Boolean(data.settings?.legal_terms_accepted && data.rules_current !== false);
        setRaffleLegalAccepted(currentRulesAccepted);
        setVendorRaffleRulesViewedVersion(currentRulesAccepted ? data.rules_version || '' : '');
        finishVendorRaffleHydration();
      }
      setVendorRaffleSaveMessage(
        vendorRaffleLastLocalEditRef.current > saveStartedAt
          ? 'Saving your latest changes...'
          : 'Saved to the app and website.'
      );
      if (!options.silent) {
        Alert.alert('Saved', 'Your QR Bingo vendor draw settings are synced in the app and on the website.');
      }
    } catch (error) {
      setVendorRaffleError(error instanceof Error ? error.message : 'Could not save this draw.');
      setVendorRaffleSaveMessage('Could not autosave. Check the message above and try again.');
    } finally {
      vendorRaffleSaveInFlightRef.current = false;
      setVendorRaffleSaving(false);
    }
  }, [
    applyVendorRaffle,
    finishVendorRaffleHydration,
    nativeSession,
    raffleEnabled,
    raffleLegalAccepted,
    rafflePrizeDescription,
    rafflePrizeApproxValueCad,
    rafflePrizeTitle,
    vendorRaffle,
    vendorRaffleRulesVersion,
    vendorRaffleRulesViewedVersion,
    vendorRaffleSignature,
  ]);

  useEffect(() => {
    if (!showVendorRaffle || !vendorRaffle || !vendorRaffleLoadedRef.current || vendorRaffleHydratingRef.current) {
      return;
    }
    const signature = vendorRaffleSignature(
      raffleEnabled,
      rafflePrizeDescription,
      rafflePrizeApproxValueCad,
      raffleLegalAccepted
    );
    if (signature === vendorRaffleLastSavedRef.current) return;
    if (vendorRaffleSaving || vendorRaffleSaveInFlightRef.current) {
      setVendorRaffleSaveMessage('Saving your latest changes...');
      return;
    }

    setVendorRaffleSaveMessage('Saving after you pause...');
    if (vendorRaffleSaveTimerRef.current) clearTimeout(vendorRaffleSaveTimerRef.current);
    vendorRaffleSaveTimerRef.current = setTimeout(() => {
      vendorRaffleSaveTimerRef.current = null;
      saveVendorRaffle({ silent: true });
    }, 1200);

    return () => {
      if (vendorRaffleSaveTimerRef.current) {
        clearTimeout(vendorRaffleSaveTimerRef.current);
        vendorRaffleSaveTimerRef.current = null;
      }
    };
  }, [
    raffleEnabled,
    raffleLegalAccepted,
    rafflePrizeDescription,
    rafflePrizeApproxValueCad,
    saveVendorRaffle,
    showVendorRaffle,
    vendorRaffle,
    vendorRaffleSaving,
    vendorRaffleSignature,
  ]);

  const drawVendorWinner = async (reason = 'initial') => {
    if (!nativeSession?.user_id || !nativeSession?.token || vendorRaffleDrawing) return;
    Alert.alert(
      vendorRaffleWillSendVerifiedNotice ? 'Send verified potential-winner notices?' : 'Select a potential winner?',
      vendorRaffleWillSendVerifiedNotice
        ? 'Wedding Win has verified eligibility and the skill-testing answer. Potential-winner notices may now be sent for prize fulfillment only.'
        : 'WeddingWin will randomly select one potential winner. No fulfillment email or prize claim is allowed until Wedding Win verifies eligibility and the skill-testing answer.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: vendorRaffleWillSendVerifiedNotice ? 'Send Notices' : 'Select Potential Winner',
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
              Alert.alert(
                data.email_result ? 'Potential-Winner Notices' : 'Potential Winner Selected',
                data.email_result
                  ? `${data.draw?.winner_name || 'Verified potential winner'}: fulfillment notices were processed.`
                  : `${data.draw?.winner_name || 'Potential winner selected.'}\n\nNo fulfillment notice or prize claim has been sent. Wedding Win must complete eligibility and skill-testing verification first.`
              );
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

  const vendorDrawPrizePreview =
    rafflePrizeDescription.trim().split(/\r?\n/)[0]?.trim() || rafflePrizeTitle.trim() || 'Your prize';
  const vendorDrawNamePreview = vendorRaffle?.vendor?.name || displayName || 'your business';
  const vendorRaffleDrawCount = (vendorRaffle?.draws || []).filter((draw) =>
    draw.selection_status === 'potential' || draw.selection_status === 'verified'
  ).length;
  const vendorRaffleMaxDraws = vendorRaffle?.max_draws || 1;
  const vendorRaffleDrawsRemaining =
    typeof vendorRaffle?.draws_remaining === 'number'
      ? vendorRaffle.draws_remaining
      : Math.max(0, vendorRaffleMaxDraws - vendorRaffleDrawCount);
  const vendorRaffleLimitReached = Boolean(vendorRaffle?.draw_limit_reached || vendorRaffleDrawsRemaining <= 0);
  const vendorRaffleCanPickWinner = Boolean(raffleEnabled && vendorRaffle?.can_draw);
  const vendorRaffleWillSendVerifiedNotice = Boolean(vendorRaffle?.can_send_verified_winner_notice);
  const vendorRaffleOutboundEmailBlocked = Boolean(
    vendorRaffle?.verified_potential_winner_notice_pending && !vendorRaffle?.outbound_email_enabled
  );
  const vendorRaffleMaterialLocked = Boolean(vendorRaffle?.material_terms_locked);

  const saveProfile = () => {
    if (profileSaveLoading) return;

    if (
      !profileFirstName.trim() ||
      !profileEmail.trim() ||
      (memberIsCouple && !profileWeddingDate.trim())
    ) {
      Alert.alert(
        'Finish your profile',
        memberIsCouple
          ? 'Add your first name, email address, and wedding date so WeddingWin can complete your couple account.'
          : 'Add your name and email address so WeddingWin can complete your vendor account.'
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
      ...(memberIsCouple ? { weddingDate: profileWeddingDate.trim() } : {}),
    });
  };

  return (
    <SafeAreaView style={styles.nativeContainer} edges={['top']}>
      <ScrollView
        scrollEnabled
        contentContainerStyle={[
          styles.nativeContent,
        ]}
        showsVerticalScrollIndicator={false}>
        <ImageBackground
          source={HERO_IMAGE}
          style={[
            styles.loginBackdrop,
            compactOneAppMenu && styles.loginBackdropCompact,
          ]}>
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

          <View style={[styles.logoWrap, compactOneAppMenu && styles.logoWrapCompact]}>
            <Image
              source={LOGO_IMAGE}
              style={[styles.brandLogo, compactOneAppMenu && styles.brandLogoCompact]}
              resizeMode="contain"
              accessibilityLabel="WeddingWin.ca"
            />
            {!compactOneAppMenu ? <Text style={styles.countryLabel}>CANADA</Text> : null}
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
                {"Tell us how you'd like to use WeddingWin so we can personalize your experience."}
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
                accessibilityState={{ checked: role === 'couple' }}>
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
                onPress={() => setRole('vendor')}
                accessibilityRole="radio"
                accessibilityLabel="Choose vendor account"
                accessibilityState={{ checked: role === 'vendor' }}>
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
                onPress={continueFromPath}
                accessibilityRole="button"
                accessibilityLabel={`Continue with ${role} account`}>
                <Text style={styles.pathContinueText}>Continue</Text>
              </TouchableOpacity>

              <View style={styles.pathLoginRow}>
                <Text style={styles.pathLoginCopy}>Already have an account?</Text>
                <TouchableOpacity
                  activeOpacity={0.76}
                  onPress={showExistingLogin}
                  accessibilityRole="button"
                  accessibilityLabel={`Log in as ${role}`}>
                  <Text style={styles.pathLoginLink}>Log In</Text>
                </TouchableOpacity>
              </View>

              <Text style={styles.pathFooter}>Your wedding journey starts here</Text>
            </View>
          ) : null}

          {member || wizardStep === 2 ? (
          <View
            style={[
              styles.loginCard,
              showOneAppMenu && styles.oneAppLoginCard,
            ]}>
            {member ? (
              <View style={[styles.signedInPanel, showOneAppMenu && styles.oneAppSignedInPanel]}>
                <Text style={styles.signedInTitle}>
                  {shouldCompleteProfile ? 'Finish your profile' : 'You are signed in'}
                </Text>
                <Text
                  style={[styles.signedInName, showOneAppMenu && styles.oneAppSignedInName]}
                  numberOfLines={1}>
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
                        accessibilityLabel="First name"
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
                          accessibilityLabel="Real email address"
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
                      onPress={() => setShowWeddingPicker((shown) => !shown)}
                      accessibilityRole="button"
                      accessibilityLabel="Choose wedding date">
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
                      onPress={saveProfile}
                      accessibilityRole="button"
                      accessibilityLabel="Save profile and open dashboard">
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
                        onPress={onOpenDashboard}
                        accessibilityRole="button"
                        accessibilityLabel="Skip profile for now and open dashboard">
                        <Text style={styles.signOutText}>Skip for now</Text>
                      </TouchableOpacity>
                    ) : null}
                  </>
                ) : showCoupleMenu ? (
                  <>
                    <TouchableOpacity
                      style={[styles.coupleMenuCard, styles.oneAppMenuCard]}
                      activeOpacity={0.86}
                      onPress={onOpenWebsiteBuilder}
                      accessibilityRole="button"
                      accessibilityLabel="Open wedding website builder">
                      <View style={styles.coupleMenuCopy}>
                        <Text style={styles.coupleMenuEyebrow}>Create</Text>
                        <Text style={styles.coupleMenuTitle}>Wedding Website Builder</Text>
                        <Text style={styles.coupleMenuDescription}>
                          Build and edit your wedding website.
                        </Text>
                      </View>
                      <Image
                        source={COUPLE_MENU_WEBSITE_AI_IMAGE}
                        style={[styles.coupleMenuImage, styles.oneAppMenuImage]}
                        resizeMode="contain"
                      />
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.coupleMenuCard, styles.oneAppMenuCard]}
                      activeOpacity={0.86}
                      onPress={onOpenDashboard}
                      accessibilityRole="button"
                      accessibilityLabel="Open vendor search dashboard">
                      <View style={styles.coupleMenuCopy}>
                        <Text style={styles.coupleMenuEyebrow}>Plan</Text>
                        <Text style={styles.coupleMenuTitle}>Vendor Search</Text>
                        <Text style={styles.coupleMenuDescription}>
                          Search vendors and manage your saved finds.
                        </Text>
                      </View>
                      <Image
                        source={COUPLE_MENU_VENDOR_AI_IMAGE}
                        style={[styles.coupleMenuImage, styles.oneAppMenuImage]}
                        resizeMode="contain"
                      />
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.coupleMenuCard, styles.oneAppMenuCard]}
                      activeOpacity={0.86}
                      onPress={onOpenChat}
                      accessibilityRole="button"
                      accessibilityLabel="Open private messages">
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
                        <Text style={styles.coupleMenuTitle}>Private Messages</Text>
                        <Text style={styles.coupleMenuDescription} numberOfLines={2}>
                          {chatUnreadCount > 0 ? chatStatusLabel : 'Open your synced WeddingWin inbox.'}
                        </Text>
                      </View>
                      <Image
                        source={COUPLE_MENU_MESSAGES_AI_IMAGE}
                        style={[styles.coupleMenuImage, styles.oneAppMenuImage]}
                        resizeMode="contain"
                      />
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.coupleMenuCard, styles.oneAppMenuCard, styles.qrMenuCard]}
                      activeOpacity={0.86}
                      onPress={onOpenQrScanner}
                      accessibilityRole="button"
                      accessibilityLabel="Open QR Bingo scanner">
                      <View style={styles.coupleMenuCopy}>
                        <Text style={styles.coupleMenuEyebrow}>Events</Text>
                        <Text style={styles.coupleMenuTitle}>QR Bingo Scanner</Text>
                        <Text style={styles.coupleMenuDescription}>
                          Scan WeddingWin QR codes at wedding shows.
                        </Text>
                      </View>
                      <Image
                        source={COUPLE_MENU_QR_AI_IMAGE}
                        style={[styles.coupleMenuImage, styles.oneAppMenuImage]}
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
                      accessibilityLabel="Open vendor dashboard">
                      <View style={styles.coupleMenuCopy}>
                        <Text style={styles.coupleMenuEyebrow}>Account</Text>
                        <Text style={styles.coupleMenuTitle}>Vendor Dashboard</Text>
                        <Text style={styles.coupleMenuDescription}>
                          Manage your profile, leads, messages, and WeddingWin account.
                        </Text>
                      </View>
                      <Image
                        source={VENDOR_MENU_DASHBOARD_AI_IMAGE}
                        style={[styles.coupleMenuImage, styles.oneAppMenuImage]}
                        resizeMode="contain"
                      />
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.coupleMenuCard, styles.oneAppMenuCard]}
                      activeOpacity={0.86}
                      onPress={onOpenChat}
                      accessibilityRole="button"
                      accessibilityLabel="Open private chat messages">
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
                      <Image
                        source={COUPLE_MENU_MESSAGES_AI_IMAGE}
                        style={[styles.coupleMenuImage, styles.oneAppMenuImage]}
                        resizeMode="contain"
                      />
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.coupleMenuCard, styles.oneAppMenuCard, styles.qrMenuCard]}
                      activeOpacity={0.86}
                      onPress={openVendorRaffle}
                      accessibilityRole="button"
                      accessibilityLabel="Open QR Bingo vendor draw settings">
                      <View style={styles.coupleMenuCopy}>
                        <Text style={styles.coupleMenuEyebrow}>QR Bingo</Text>
                        <Text style={styles.coupleMenuTitle}>Vendor Draw Settings</Text>
                        <Text style={styles.coupleMenuDescription}>
                          Set your booth prize, view entry totals, and select a potential winner for Wedding Win verification.
                        </Text>
                      </View>
                      <Image
                        source={COUPLE_MENU_QR_AI_IMAGE}
                        style={[styles.coupleMenuImage, styles.oneAppMenuImage]}
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
                      accessibilityLabel="Open website account">
                      <Text style={styles.secondaryActionText}>Open Website Account</Text>
                    </TouchableOpacity>
                  </>
                )}
                <TouchableOpacity
                  style={[styles.signOutButton, showOneAppMenu && styles.oneAppSignOutButton]}
                  activeOpacity={0.82}
                  onPress={onSignOut}
                  accessibilityRole="button"
                  accessibilityLabel="Sign out of WeddingWin">
                  <Text style={styles.signOutText}>Sign Out</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <>
            <TouchableOpacity
              style={styles.wizardBackButton}
              activeOpacity={0.76}
              onPress={() => setWizardStep(1)}
              accessibilityRole="button"
              accessibilityLabel="Change account path">
              <ChevronLeft size={18} color={BRAND_COLOR} strokeWidth={2.2} />
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
                    onPress={() => setSignupConsentAccepted((accepted) => !accepted)}
                    accessibilityRole="checkbox"
                    accessibilityLabel="Agree to WeddingWin terms and privacy policy"
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
                      {"I agree to WeddingWin's Terms of Use and Privacy Policy."}
                    </Text>
                  </TouchableOpacity>
                  <View style={styles.signupConsentPolicyLinks}>
                    <Text style={styles.signupConsentPolicyPrefix}>Read:</Text>
                    <TouchableOpacity
                      activeOpacity={0.72}
                      onPress={() => openPolicyLink(TERMS_URL)}
                      accessibilityRole="link"
                      accessibilityLabel="Read WeddingWin Terms of Use">
                      <Text style={styles.signupConsentLink}>Terms of Use</Text>
                    </TouchableOpacity>
                    <Text style={styles.signupConsentPolicyPrefix}>and</Text>
                    <TouchableOpacity
                      activeOpacity={0.72}
                      onPress={() => openPolicyLink(PRIVACY_URL)}
                      accessibilityRole="link"
                      accessibilityLabel="Read WeddingWin Privacy Policy">
                      <Text style={styles.signupConsentLink}>Privacy Policy</Text>
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
                  accessibilityLabel="Sign up with Google">
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
                accessibilityLabel="Email"
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
                accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}>
                <Eye size={24} color="#8A8A8D" strokeWidth={1.7} />
              </TouchableOpacity>
            </View>

            {authMode !== 'signup' ? (
              <TouchableOpacity
                style={styles.forgotButton}
                activeOpacity={0.75}
                onPress={() => onOpenUrl('/login/retrieval')}
                accessibilityRole="button"
                accessibilityLabel="Forgot password">
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
              onPress={authMode === 'signup' ? createMemberAccount : openLogin}
              accessibilityRole="button"
              accessibilityLabel={authMode === 'signup' ? `Create ${role} account` : `Log in as ${role}`}>
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
                onPress={() => setAuthMode('signup')}
                accessibilityRole="button"
                accessibilityLabel="Create couple account">
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
                onPress={() => onGoogleSignIn(role)}
                accessibilityRole="button"
                accessibilityLabel="Sign in with Google">
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

          {!showOneAppMenu ? (
            <TouchableOpacity
              style={styles.supportLink}
              activeOpacity={0.75}
              onPress={() => Linking.openURL('mailto:hello@weddingwin.ca').catch(() => {})}
              accessibilityRole="link"
              accessibilityLabel="Email WeddingWin support">
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
        onRequestClose={() => setShowVendorRaffle(false)}>
        <View style={styles.vendorRaffleBackdrop}>
          <View style={styles.vendorRaffleSheet}>
            <View style={styles.vendorRaffleHeader}>
              <View>
                <Text style={styles.vendorRaffleEyebrow}>Wedding show tools</Text>
                <Text style={styles.vendorRaffleTitle}>QR Bingo Vendor Draw</Text>
                <Text style={styles.vendorRaffleHeaderText}>
                  Run a booth prize without paper ballots. Couples opt in from their own phone, so your team can spend more time talking with them and less time managing forms.
                </Text>
              </View>
              <TouchableOpacity
                style={styles.vendorRaffleClose}
                activeOpacity={0.78}
                onPress={() => setShowVendorRaffle(false)}
                accessibilityRole="button"
                accessibilityLabel="Close vendor draw settings">
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
                {vendorRaffle?.vendor ? (
                  <>
                {vendorRaffle.app_review_fixture ? (
                  <View style={styles.vendorRaffleDrawStatusCard}>
                    <Text style={styles.vendorRaffleDrawStatusLabel}>Isolated App Review fixture</Text>
                    <Text style={styles.vendorRaffleDrawStatusText}>
                      Test-only data is separated from the production event. Early selection is enabled for review, no real prize is awarded, outbound email is suppressed, and the private vendor listing remains inactive.
                    </Text>
                  </View>
                ) : null}
                <View style={styles.vendorRaffleScrollCue}>
                  <ChevronDown size={16} color="#AA565D" strokeWidth={2.4} />
                  <Text style={styles.vendorRaffleScrollCueText}>Scroll down after the slides to set up your draw</Text>
                </View>
                <View style={[styles.vendorRaffleInfographicFrame, { width: vendorDrawSlideWidth }]}>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    decelerationRate="fast"
                    disableIntervalMomentum
                    snapToInterval={vendorDrawSlideWidth}
                    snapToAlignment="start"
                    onMomentumScrollEnd={(event) => {
                      const nextIndex = Math.round(event.nativeEvent.contentOffset.x / vendorDrawSlideWidth);
                      setVendorRaffleSlideIndex(
                        Math.max(0, Math.min(QR_VENDOR_DRAW_MOBILE_SLIDES.length - 1, nextIndex))
                      );
                    }}
                    contentContainerStyle={styles.vendorRaffleInfographicTrack}>
                    {QR_VENDOR_DRAW_MOBILE_SLIDES.map((slide, index) => (
                      <Image
                        key={index}
                        source={slide}
                        style={[
                          styles.vendorRaffleInfographic,
                          { width: vendorDrawSlideWidth, height: vendorDrawSlideHeight },
                        ]}
                        resizeMode="cover"
                      />
                    ))}
                  </ScrollView>
                  <View style={styles.vendorRaffleCarouselCue}>
                    <Text style={styles.vendorRaffleCarouselCueText}>Swipe left to see the next step</Text>
                    <View style={styles.vendorRaffleCarouselDots}>
                      {QR_VENDOR_DRAW_MOBILE_SLIDES.map((_, index) => (
                        <View
                          key={index}
                          style={[
                            styles.vendorRaffleCarouselDot,
                            index === vendorRaffleSlideIndex && styles.vendorRaffleCarouselDotActive,
                          ]}
                        />
                      ))}
                    </View>
                  </View>
                </View>
                <Text style={styles.vendorRaffleSectionEyebrow}>Prize setup</Text>
                <Text style={styles.vendorRaffleSectionTitle}>1. Set up your prize</Text>
                <Text style={styles.vendorRaffleHint}>
                  Add the prize in one clear box. Everything saves automatically and stays synced with the app.
                </Text>
                <Text style={styles.vendorRaffleHint}>
                  Wedding Win Inc. administers and co-sponsors the in-app draw. {vendorRaffle?.vendor?.name || 'Your business'} supplies and fulfills the prize. {vendorRaffle?.apple_non_sponsor_disclaimer || 'Apple Inc. is not a sponsor of and is not involved in this promotion.'}
                </Text>
                <TouchableOpacity
                  activeOpacity={0.72}
                  onPress={() => {
                    if (!vendorRaffle?.terms_url) return;
                    Linking.openURL(vendorRaffle.terms_url)
                      .then(() => setVendorRaffleRulesViewedVersion(vendorRaffleRulesVersion))
                      .catch(() => setVendorRaffleError('The official rules could not be opened.'));
                  }}
                  accessibilityRole="link"
                  accessibilityLabel="View vendor draw official rules">
                  <Text style={styles.vendorRaffleRulesLink}>View vendor draw official rules</Text>
                </TouchableOpacity>
                <Text style={styles.vendorRaffleHint}>
                  {vendorRaffleRulesViewedVersion === vendorRaffleRulesVersion
                    ? 'Current rules opened. Turning on entries records your acceptance.'
                    : 'Open the current rules before you can accept prize entries.'}
                </Text>
                <TouchableOpacity
                  style={styles.vendorRaffleToggleRow}
                  activeOpacity={0.8}
                  onPress={() => {
                    markVendorRaffleLocalEdit();
                    setRaffleEnabled((value) => {
                      const nextValue = !value;
                      if (nextValue && !(vendorRaffle?.alternate_free_entry_url || vendorRaffle?.settings?.alternate_free_entry_url)) {
                        Alert.alert('Alternate free entry required', 'Wedding Win must configure a live entry route that does not require attendance, purchase, or QR scanning before entries can open.');
                        return false;
                      }
                      if (nextValue && vendorRaffleRulesViewedVersion !== vendorRaffleRulesVersion) {
                        Alert.alert('Review the official rules first', 'Open the current vendor draw rules before accepting entries.');
                        return false;
                      }
                      if (nextValue && !rafflePrizeDescription.trim()) {
                        Alert.alert('Add the prize first', 'Describe the prize before accepting entries.');
                        return false;
                      }
                      if (nextValue && !(Number(rafflePrizeApproxValueCad) > 0)) {
                        Alert.alert('Add the prize value', 'Enter the approximate retail value in Canadian dollars before accepting entries.');
                        return false;
                      }
                      if (nextValue) setRaffleLegalAccepted(true);
                      return nextValue;
                    });
                  }}
                  accessibilityRole="switch"
                  accessibilityLabel="Accept prize entries"
                  accessibilityState={{ checked: raffleEnabled }}>
                  <View style={[styles.vendorRaffleToggle, raffleEnabled && styles.vendorRaffleToggleOn]}>
                    <View style={[styles.vendorRaffleToggleKnob, raffleEnabled && styles.vendorRaffleToggleKnobOn]} />
                  </View>
                  <View style={styles.vendorRaffleToggleCopy}>
                    <Text style={styles.vendorRaffleToggleTitle}>Accept prize entries</Text>
                    <Text style={styles.vendorRaffleToggleText}>
                      {raffleEnabled
                        ? 'Entries are open under the rules you accepted. Selection creates only a potential winner; fulfillment notices remain blocked until Wedding Win verification.'
                        : 'Turn this on when your prize details are ready. Couples can still scan you for QR Bingo, but they will not see your prize entry option.'}
                    </Text>
                  </View>
                </TouchableOpacity>
                <View style={!raffleEnabled && styles.vendorRaffleDisabledContent}>
                  <Text style={styles.inputLabel}>Prize details</Text>
                  <View style={[styles.inputShell, styles.vendorRaffleTextAreaShell]}>
                    <TextInput
                      value={rafflePrizeDescription}
                      editable={!vendorRaffleMaterialLocked}
                      onChangeText={(value) => {
                        markVendorRaffleLocalEdit();
                        setRafflePrizeDescription(value);
                      }}
                      placeholder={'Example: Free engagement photo session\nIncludes a 30-minute session and 10 edited photos.'}
                      placeholderTextColor="#A8A8AD"
                      style={[styles.textInput, styles.vendorRaffleTextArea]}
                      accessibilityLabel="Prize details"
                      multiline
                    />
                  </View>
                  <Text style={styles.vendorRaffleFieldHelp}>
                    {vendorRaffleMaterialLocked
                      ? 'Prize and draw terms are locked because entries exist. A materially different prize requires a separately versioned promotion.'
                      : 'Use the first line as the prize name. Add accurate restrictions and fulfillment details below.'}
                  </Text>
                  <Text style={styles.inputLabel}>Approximate retail value (CAD)</Text>
                  <View style={styles.inputShell}>
                    <TextInput
                      value={rafflePrizeApproxValueCad}
                      editable={!vendorRaffleMaterialLocked}
                      onChangeText={(value) => {
                        markVendorRaffleLocalEdit();
                        setRafflePrizeApproxValueCad(value.replace(/[^0-9.]/g, ''));
                      }}
                      placeholder="Example: 250"
                      placeholderTextColor="#A8A8AD"
                      style={styles.textInput}
                      keyboardType="decimal-pad"
                      accessibilityLabel="Approximate prize value in Canadian dollars"
                    />
                  </View>
                  <Text style={styles.vendorRaffleFieldHelp}>
                    Required before entries can open. Couples see this amount before opting in.
                  </Text>
                  <Text style={styles.vendorRaffleHint}>
                    No purchase necessary. Eligibility: {vendorRaffle?.eligibility_region || vendorRaffle?.settings?.eligibility_region || 'see official rules'}.{`\n`}
                    Entries close: {formatPromotionDate(vendorRaffle?.entry_closes_at || vendorRaffle?.settings?.entry_closes_at)}.{`\n`}
                    Scheduled draw: {formatPromotionDate(vendorRaffle?.draw_at || vendorRaffle?.settings?.draw_at)}.{`\n`}
                    {vendorRaffle?.odds_basis || vendorRaffle?.settings?.odds_basis || 'Odds depend on eligible entries received.'}{`\n`}
                    A potential winner must correctly answer a mathematical skill-testing question before award.
                  </Text>
                  {vendorRaffle?.alternate_free_entry_url || vendorRaffle?.settings?.alternate_free_entry_url ? (
                    <TouchableOpacity
                      onPress={() => Linking.openURL(String(vendorRaffle?.alternate_free_entry_url || vendorRaffle?.settings?.alternate_free_entry_url)).catch(() => setVendorRaffleError('The alternate free entry route could not be opened.'))}
                      accessibilityRole="link"
                      accessibilityLabel="View alternate free entry route">
                      <Text style={styles.vendorRaffleRulesLink}>View alternate free entry route</Text>
                    </TouchableOpacity>
                  ) : (
                    <Text style={styles.vendorRaffleError}>Entries must remain off until Wedding Win configures a live alternate free entry route that does not require attendance, purchase, or QR scanning.</Text>
                  )}
                  <View style={styles.vendorRaffleEmailPreview}>
                    <Text style={styles.vendorRafflePreviewEyebrow}>Verified potential-winner email preview</Text>
                    <Text style={styles.vendorRafflePreviewMeta}>Sent only after Wedding Win verifies eligibility and the skill-testing answer</Text>
                    <View style={styles.vendorRafflePreviewPaper}>
                      <Image
                        source={{ uri: 'https://www.weddingwin.ca/images/CoralLogoTransB.png' }}
                        style={styles.vendorRafflePreviewLogo}
                        resizeMode="contain"
                        accessibilityLabel="WeddingWin.ca"
                      />
                      <View style={styles.vendorRafflePreviewDivider} />
                      <Text style={styles.vendorRafflePreviewSubject}>
                        Subject: Your QR Bingo prize eligibility is verified
                      </Text>
                      <Text style={styles.vendorRafflePreviewBody}>Hi First Name,</Text>
                      <Text style={styles.vendorRafflePreviewBody}>
                        Wedding Win verified your eligibility and skill-testing answer for {vendorDrawNamePreview}&apos;s draw.
                      </Text>
                      <View style={styles.vendorRafflePreviewBox}>
                        <Text style={styles.vendorRafflePreviewSection}>Your draw</Text>
                        <Text style={styles.vendorRafflePreviewBody}>Vendor: {vendorDrawNamePreview}</Text>
                        <Text style={styles.vendorRafflePreviewBody}>Draw item: {vendorDrawPrizePreview}</Text>
                      </View>
                      <Text style={styles.vendorRafflePreviewSection}>What happens next</Text>
                      <Text style={styles.vendorRafflePreviewBody}>
                        {vendorDrawNamePreview} may contact you only to arrange prize fulfillment. Entry data cannot be used for marketing without separate consent.
                      </Text>
                      <View style={styles.vendorRafflePreviewButton}>
                        <Text style={styles.vendorRafflePreviewButtonText}>View vendor profile</Text>
                      </View>
                      <Text style={styles.vendorRafflePreviewSection}>Why you received this</Text>
                      <Text style={styles.vendorRafflePreviewBody}>
                        You opted in after scanning this vendor{'\u2019s'} QR code at the wedding show.
                      </Text>
                      <Text style={styles.vendorRafflePreviewFooter}>WeddingWin.ca</Text>
                    </View>
                  </View>
                  <View style={styles.vendorRaffleAutosaveRow}>
                    {vendorRaffleSaving ? <ActivityIndicator size="small" color="#AA565D" /> : null}
                    <Text style={styles.vendorRaffleSaveHint}>
                      {vendorRaffleSaveMessage || 'Changes save automatically to the app and website.'}
                    </Text>
                  </View>
                  <View style={styles.vendorRaffleStatsRow}>
                    <View style={styles.vendorRaffleStat}>
                      <Text style={styles.vendorRaffleStatValue}>{vendorRaffle?.entry_count || 0}</Text>
                      <Text style={styles.vendorRaffleStatLabel}>Couples entered</Text>
                    </View>
                    <View style={styles.vendorRaffleStat}>
                      <Text style={styles.vendorRaffleStatValue}>
                        {vendorRaffleDrawCount}/{vendorRaffleMaxDraws}
                      </Text>
                      <Text style={styles.vendorRaffleStatLabel}>Active selection</Text>
                    </View>
                  </View>
                  <Text style={styles.vendorRaffleHint}>
                    Entrant contact data is not exposed or exportable. Only the selected potential winner appears below, solely for verification and prize fulfillment; marketing use is prohibited without separate consent.
                  </Text>
                  <Text style={styles.vendorRaffleSectionEyebrow}>Potential-winner selection</Text>
                  <Text style={styles.vendorRaffleSectionTitle}>2. Select and verify</Text>
                  <View style={styles.vendorRaffleDrawStatusCard}>
                    <Text style={styles.vendorRaffleDrawStatusLabel}>
                      {vendorRaffleOutboundEmailBlocked ? 'Outbound notices disabled' : vendorRaffleWillSendVerifiedNotice ? 'Verification complete' : vendorRaffleCanPickWinner ? 'Selection is available' : vendorRaffleLimitReached ? 'Awaiting Wedding Win verification' : 'Selection opens after entry closes'}
                    </Text>
                    <Text style={styles.vendorRaffleDrawStatusText}>
                      {vendorRaffleOutboundEmailBlocked
                        ? 'The verified potential-winner record is preserved, but outbound email is fail-closed until Wedding Win explicitly enables the production fulfillment delivery mode.'
                        : vendorRaffleWillSendVerifiedNotice
                        ? 'Eligibility and the skill-testing answer are verified. Potential-winner fulfillment notices may now be sent.'
                        : vendorRaffleCanPickWinner
                        ? `${vendorRaffleDrawsRemaining} of ${vendorRaffleMaxDraws} potential-winner selections available.`
                        : vendorRaffleLimitReached
                          ? 'A potential winner is awaiting verification. No fulfillment notice or prize claim is allowed yet.'
                          : `Selection is available after ${formatPromotionDate(vendorRaffle?.draw_opens_at)}.`}
                    </Text>
                  </View>
                  <View style={styles.vendorRaffleWinnerSteps}>
                    <View style={styles.vendorRaffleWinnerStep}>
                      <Text style={styles.vendorRaffleWinnerStepNumber}>1</Text>
                      <View style={styles.vendorRaffleWinnerStepCopy}>
                        <Text style={styles.vendorRaffleWinnerStepTitle}>Select a potential winner</Text>
                        <Text style={styles.vendorRaffleWinnerStepText}>WeddingWin randomly selects one eligible entry after all closing/draw times have passed.</Text>
                      </View>
                    </View>
                    <View style={styles.vendorRaffleWinnerStep}>
                      <Text style={styles.vendorRaffleWinnerStepNumber}>2</Text>
                      <View style={styles.vendorRaffleWinnerStepCopy}>
                        <Text style={styles.vendorRaffleWinnerStepTitle}>Wedding Win verifies</Text>
                        <Text style={styles.vendorRaffleWinnerStepText}>Wedding Win staff verify eligibility and a correctly answered mathematical skill-testing question. No fulfillment notice or prize claim is allowed before this step.</Text>
                      </View>
                    </View>
                    <View style={styles.vendorRaffleWinnerStep}>
                      <Text style={styles.vendorRaffleWinnerStepNumber}>3</Text>
                      <View style={styles.vendorRaffleWinnerStepCopy}>
                        <Text style={styles.vendorRaffleWinnerStepTitle}>Fulfill the prize only</Text>
                        <Text style={styles.vendorRaffleWinnerStepText}>After verification, send potential-winner fulfillment notices and use contact details only to arrange fulfillment—not marketing.</Text>
                      </View>
                    </View>
                  </View>
                  <TouchableOpacity
                    style={[styles.raffleEnterButton, (!vendorRaffleCanPickWinner || vendorRaffleDrawing) && styles.loginButtonDisabled]}
                    activeOpacity={0.88}
                    disabled={!vendorRaffleCanPickWinner || vendorRaffleDrawing}
                    onPress={() => drawVendorWinner(vendorRaffleWillSendVerifiedNotice ? 'verified_notice' : 'initial')}
                    accessibilityRole="button"
                    accessibilityLabel={vendorRaffleWillSendVerifiedNotice ? 'Send verified potential-winner notices' : 'Select potential winner'}>
                    {vendorRaffleDrawing ? (
                      <ActivityIndicator size="small" color="#FFFFFF" />
                    ) : (
                      <Text style={styles.raffleEnterText}>
                        {vendorRaffleOutboundEmailBlocked ? 'Outbound Notices Disabled' : vendorRaffleWillSendVerifiedNotice ? 'Send Potential-Winner Notices' : vendorRaffleLimitReached ? 'Awaiting Verification' : 'Select Potential Winner'}
                      </Text>
                    )}
                  </TouchableOpacity>
                  {vendorRaffleOutboundEmailBlocked ? (
                    <Text style={styles.vendorRaffleHint}>A trusted operator must enable and test the production verified-fulfillment email mode before this notice control becomes available.</Text>
                  ) : vendorRaffleWillSendVerifiedNotice ? (
                    <Text style={styles.vendorRaffleHint}>Verification is complete. Sending now delivers potential-winner notices for prize fulfillment only.</Text>
                  ) : vendorRaffleLimitReached ? (
                    <Text style={styles.vendorRaffleHint}>Wedding Win must verify or disqualify the potential winner. A disqualified selection can be replaced while preserving its audit record.</Text>
                  ) : !vendorRaffle?.can_draw ? (
                    <Text style={styles.vendorRaffleHint}>Selection opens only after the entry close, scheduled draw, and draw-open timestamps have all passed.</Text>
                  ) : null}
                  {(vendorRaffle?.draws || []).map((draw) => (
                    <View key={draw.id} style={styles.vendorRaffleWinnerCard}>
                      <Text style={styles.vendorRaffleWinnerTitle}>
                        Selection #{draw.draw_number}: {draw.selection_status === 'legacy' ? 'historical record' : draw.selection_status || 'potential'}
                      </Text>
                      <Text style={styles.vendorRaffleWinnerName}>{draw.winner_name}</Text>
                      <Text style={styles.vendorRaffleWinnerText}>{draw.winner_email}</Text>
                      {draw.email_error ? <Text style={styles.vendorRaffleError}>{draw.email_error}</Text> : null}
                    </View>
                  ))}
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

function cleanNativeChatThread(thread: NativeChatThread): NativeChatThread | null {
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

  if (!hasRealMessage && !hasReadableTitle && !thread.reported && !thread.closed) return null;

  return {
    ...thread,
    title: hasReadableTitle ? title : 'WeddingWin Member',
    subtitle: hasRealMessage ? subtitle : thread.closed || thread.reported ? subtitle : 'Open conversation',
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
  syncDebug,
  draft,
  onDraftChange,
  onSelectThread,
  onSend,
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
  syncDebug?: NativeChatSyncResponse['sync_debug'] | null;
  draft: string;
  onDraftChange: (value: string) => void;
  onSelectThread: (threadToken: string) => void;
  onSend: () => void;
  onReport: () => void;
  onRefresh: () => void;
  onClose: () => void;
  onThreadViewChange: (isThreadView: boolean) => void;
  chatUnreadCount: number;
  openThreadRequestId: number;
  openingConversationLabel?: string;
}) {
  // This App Store release is intentionally text-only. Keep this local and
  // immutable so a backend response cannot silently enable photo collection.
  const imagesEnabled = false;
  const [threadSort, setThreadSort] = useState<ChatThreadSort>('recent');
  const [chatView, setChatView] = useState<'list' | 'thread'>('list');
  const handledOpenThreadRequestRef = useRef(0);
  // Expo SDK 54 forces Android edge-to-edge, which breaks adjustResize and
  // KeyboardAvoidingView - the keyboard just covers the composer. Track the
  // keyboard frame ourselves and pad the chat body to keep the input and
  // send button visible. Seeding from Keyboard.metrics() also covers the
  // case where the keyboard is already open when this overlay mounts
  // (e.g. tapping Send Message while a website form field has focus).
  const [keyboardHeight, setKeyboardHeight] = useState(
    () => Keyboard.metrics()?.height ?? 0
  );
  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
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
  useEffect(() => {
    if (keyboardHeight > 0) {
      messagesScrollRef.current?.scrollToEnd({ animated: true });
    }
  }, [keyboardHeight]);
  const displayThreads = useMemo(() => {
    return threads
      .map((thread) => {
        const cleaned = cleanNativeChatThread(thread);
        if (cleaned) return cleaned;
        return thread.token === selectedThreadToken
          ? { ...thread, title: 'WeddingWin Member', subtitle: 'Open conversation' }
          : null;
      })
      .filter((thread): thread is NativeChatThread => !!thread);
  }, [selectedThreadToken, threads]);
  const selectedThread = displayThreads.find((thread) => thread.token === selectedThreadToken);
  const isThreadView = chatView === 'thread' && !!selectedThread;
  const accountLabel = useMemo(() => {
    const memberId = String(member?.user_id || nativeSession?.user_id || '').trim();
    const email = String(member?.email || nativeSession?.email || '').trim();
    const company = String(member?.company || '').trim();
    const name = [member?.first_name, member?.last_name].filter(Boolean).join(' ').trim();
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
    const appCount = Number(syncDebug.visible_app_threads ?? syncDebug.app_threads ?? 0);
    return `Sync checked this account: ${bdCount} website chat${bdCount === 1 ? '' : 's'}, ${appCount} app chat${appCount === 1 ? '' : 's'}.`;
  }, [syncDebug]);
  const selectedThreadIsAppNative = selectedThreadToken.startsWith('app:');
  const selectedThreadClosed = !!selectedThread?.closed || !!selectedThread?.reported;
  const selectedThreadNotice = selectedThreadClosed
    ? selectedThread?.report_notice || CHAT_REPORTED_NOTICE
    : '';
  const selectedInitial = (selectedThread?.title || 'W').trim().charAt(0).toUpperCase();
  const sortedThreads = useMemo(() => {
    return [...displayThreads].sort((a, b) => {
      if (threadSort === 'name') return a.title.localeCompare(b.title);
      if (threadSort === 'unread') {
        const unreadDelta = b.unread_count - a.unread_count;
        if (unreadDelta !== 0) return unreadDelta;
      }
      return chatThreadTimeValue(b.updated_at) - chatThreadTimeValue(a.updated_at);
    });
  }, [displayThreads, threadSort]);
  const isOpeningConversation =
    !!openingConversationLabel && loading && !selectedThread && displayThreads.length === 0;
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
            testID="chat-report-button"
            style={[
              styles.chatReportButton,
              (selectedThreadClosed || reporting) && styles.chatReportButtonDisabled,
            ]}
            activeOpacity={0.76}
            onPress={onReport}
            disabled={!selectedThreadToken || selectedThreadClosed || reporting}
            accessibilityRole="button"
            accessibilityLabel="Report conversation and block member">
            <AlertTriangle size={17} color="#8A514C" strokeWidth={2.2} />
            <Text style={styles.chatReportText}>
              {selectedThreadClosed ? 'Blocked' : reporting ? 'Blocking' : 'Report & Block'}
            </Text>
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

      {notice ? (
        <View style={styles.chatNoticeBanner} accessibilityRole="text">
          <Text style={styles.chatNoticeText}>{notice}</Text>
        </View>
      ) : null}

      <View style={[styles.chatNativeBody, { paddingBottom: keyboardHeight }]}>
        {!isThreadView ? (
          <View style={styles.chatConversationList}>
          {!isOpeningConversation ? (
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
                onPress={() => setThreadSort(value)}
                accessibilityRole="button"
                accessibilityLabel={`Sort conversations by ${label}`}
                accessibilityState={{ selected: threadSort === value }}>
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
          ) : null}

          <ScrollView
            style={styles.chatConversationScroll}
            contentContainerStyle={styles.chatConversationContent}
            showsVerticalScrollIndicator={false}>
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
                <Text style={styles.chatCenteredText}>Loading conversations...</Text>
              </View>
            ) : null}
            {displayThreads.length === 0 && !loading && !isOpeningConversation ? (
              <View style={styles.chatCenteredState}>
                <MessageCircle size={36} color={BRAND_COLOR} strokeWidth={1.7} />
                <Text style={styles.chatCenteredText}>
                  Your synced WeddingWin chats will appear here.
                </Text>
                {accountLabel ? (
                  <View style={styles.chatEmptyPill}>
                    <Text style={styles.chatEmptyPillText}>{accountLabel}</Text>
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
                  thread.unread_count > 0 && styles.chatConversationRowUnread,
                ]}
                activeOpacity={0.82}
                onPress={() => openThread(thread.token)}
                accessibilityRole="button"
                accessibilityLabel={`Open conversation with ${thread.title}`}>
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
                      {thread.closed || thread.reported
                        ? thread.report_notice || CHAT_REPORTED_NOTICE
                        : !imagesEnabled && /^\[image\]$/i.test(thread.subtitle || '')
                          ? 'Open conversation'
                          : thread.subtitle || 'No messages yet'}
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
            <Text style={styles.chatThreadProfileStatus}>
              {selectedThreadClosed
                ? 'Member blocked while WeddingWin reviews it'
                : selectedThreadIsAppNative ? 'WeddingWin app chat' : 'Synced with website chat'}
            </Text>
          </View>
        </View>

        <ScrollView
          ref={messagesScrollRef}
          style={styles.chatMessages}
          contentContainerStyle={styles.chatMessagesContent}
          keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
          keyboardShouldPersistTaps="handled"
          onContentSizeChange={() => {
            messagesScrollRef.current?.scrollToEnd({ animated: false });
          }}
          showsVerticalScrollIndicator={false}>
          {selectedThreadClosed ? (
            <View style={styles.chatReportedNotice}>
              <AlertTriangle size={18} color="#8A514C" strokeWidth={2.2} />
              <Text style={styles.chatReportedNoticeText}>{selectedThreadNotice}</Text>
            </View>
          ) : null}
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
              {threads.length === 0 && accountLabel ? (
                <View style={styles.chatEmptyPill}>
                  <Text style={styles.chatEmptyPillText}>{accountLabel}</Text>
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
                {imagesEnabled ? message.image_urls?.map((url, index) => (
                  <TouchableOpacity
                    key={`${message.id}-image-${index}`}
                    activeOpacity={0.86}
                    onPress={() => Linking.openURL(url).catch(() => {})}
                    accessibilityRole="link"
                    accessibilityLabel="Open message image">
                    <Image
                      source={{ uri: url }}
                      style={styles.chatMessageImage}
                      resizeMode="cover"
                    />
                  </TouchableOpacity>
                )) : null}
                {message.content ? (
                  <Text
                    style={[
                      styles.chatMessageText,
                      message.is_mine && styles.chatMessageTextMine,
                      imagesEnabled && message.image_urls?.length ? styles.chatMessageTextWithImage : null,
                    ]}>
                    {message.content}
                  </Text>
                ) : null}
                {chatMessageDeliveryLabel(message) ? (
                  <Text
                    style={[
                      styles.chatMessageDeliveryText,
                      message.delivery_state === 'failed' && styles.chatMessageDeliveryFailed,
                    ]}
                    accessibilityLabel={`Message delivery status: ${chatMessageDeliveryLabel(message)}`}>
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
                    <Text style={styles.chatMessageAvatarInitial}>Me</Text>
                  )}
                </View>
              ) : null}
            </View>
          ))}
        </ScrollView>

        {selectedThreadClosed ? (
          <View style={styles.chatClosedComposer}>
            <AlertTriangle size={18} color="#8A514C" strokeWidth={2.2} />
            <Text style={styles.chatClosedComposerText}>{selectedThreadNotice}</Text>
          </View>
        ) : (
        <>
        {!imagesEnabled ? (
          <View style={styles.chatImagesDisabledNotice} accessibilityRole="text">
            <Text style={styles.chatImagesDisabledNoticeText}>{CHAT_IMAGES_DISABLED_NOTICE}</Text>
          </View>
        ) : null}
        <View style={styles.chatComposer}>
          <TextInput
            testID="chat-message-input"
            value={draft}
            onChangeText={onDraftChange}
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
              (!draft.trim() || sending || !selectedThreadToken) && styles.chatSendButtonDisabled,
            ]}
            disabled={!draft.trim() || sending || !selectedThreadToken}
            activeOpacity={0.82}
            onPress={onSend}
            accessibilityRole="button"
            accessibilityLabel="Send message">
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
  const lastNotificationResponse = Notifications.useLastNotificationResponse();
  const webviewRef = useRef<WebView>(null);
  const navigation = useNavigation();
  const currentUrlRef = useRef(TARGET_URL);
  const sourceUriRef = useRef(TARGET_URL);
  const loadingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const historyNavigationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const logoutCleanupTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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
  const [nativeMember, setNativeMember] = useState<NativeMember | null>(null);
  const [nativeBridgeSession, setNativeBridgeSession] =
    useState<NativeBridgeSession | null>(null);
  const [nativeSessionHydrated, setNativeSessionHydrated] = useState(false);
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
  const [nativeChatReporting, setNativeChatReporting] = useState(false);
  const [nativeChatError, setNativeChatError] = useState<string | null>(null);
  const [nativeChatNotice, setNativeChatNotice] = useState<string | null>(null);
  const [nativeChatDraft, setNativeChatDraft] = useState('');
  const [nativeChatSyncDebug, setNativeChatSyncDebug] =
    useState<NativeChatSyncResponse['sync_debug'] | null>(null);
  const [nativeChatThreadOpen, setNativeChatThreadOpen] = useState(false);
  const [nativeChatOpenRequestId, setNativeChatOpenRequestId] = useState(0);
  const [nativeChatOpeningLabel, setNativeChatOpeningLabel] = useState('');
  const [showNativeQrScanner, setShowNativeQrScanner] = useState(false);
  const [vendorDrawOpenRequestId, setVendorDrawOpenRequestId] = useState(0);
  const [pendingDashboardRedirect, setPendingDashboardRedirect] = useState(false);
  const [pendingBridgeTargetPath, setPendingBridgeTargetPath] = useState(
    DEFAULT_BRIDGE_TARGET_PATH
  );
  const pendingBdFormLoginRef = useRef<LoginCredentials | null>(null);
  const pendingBdFormLoginSubmittedRef = useRef(false);
  const pendingAppLogoutRef = useRef(false);
  const signedOutRecoveryIntentRef = useRef(false);
  const chatUnreadSnapshotRef = useRef<number | null>(null);
  const chatDingPlayerRef = useRef<ReturnType<typeof createAudioPlayer> | null>(null);
  const nativeBridgeSessionRef = useRef<NativeBridgeSession | null>(null);
  const bridgeSessionWaitersRef = useRef<((session: NativeBridgeSession | null) => void)[]>([]);
  const websiteBridgeNonceRef = useRef('');
  const nativeChatThreadOpenRef = useRef(false);
  const selectedChatThreadTokenRef = useRef('');
  const pushRegistrationKeyRef = useRef('');
  const expoPushTokenRef = useRef('');
  const handledNotificationResponseIdsRef = useRef(new Set<string>());
  const vendorConnectNativeUrlRef = useRef('');
  const vendorConnectNativeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const addDebugLine = useCallback((_line: string) => {}, []);

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
    const shouldForceNavigation =
      sourceUriRef.current === nextUrl && !!webviewRef.current;
    sourceUriRef.current = nextUrl;

    if (shouldForceNavigation) {
      webviewRef.current?.stopLoading();
      webviewRef.current?.injectJavaScript(`
(function() {
  try { window.location.assign(${JSON.stringify(nextUrl)}); } catch (e) {}
})();
true;
`);
      return;
    }

    setSourceUri(nextUrl);
  }, []);

  useEffect(() => {
    nativeChatThreadOpenRef.current = nativeChatThreadOpen;
  }, [nativeChatThreadOpen]);

  useEffect(() => {
    selectedChatThreadTokenRef.current = selectedChatThreadToken;
  }, [selectedChatThreadToken]);

  useEffect(() => {
    nativeBridgeSessionRef.current = nativeBridgeSession;
  }, [nativeBridgeSession]);

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
      if (!projectId && !__DEV__) {
        console.warn('Push registration skipped: EAS project ID is not configured.');
        return;
      }
      const tokenResult = projectId
        ? await Notifications.getExpoPushTokenAsync({ projectId })
        : await Notifications.getExpoPushTokenAsync();
      const expoPushToken = tokenResult.data;
      if (!expoPushToken) return;

      const registrationResponse = await fetch(`${APP_BACKEND_URL}/functions/v1/bd-register-push-token`, {
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

      const registrationBody = await registrationResponse.json().catch(() => null);
      if (!registrationResponse.ok || registrationBody?.ok !== true) {
        throw new Error(
          String(registrationBody?.error || `Push registration failed (${registrationResponse.status})`)
        );
      }

      pushRegistrationKeyRef.current = registrationKey;
      expoPushTokenRef.current = expoPushToken;
      SecureStore.setItemAsync(PUSH_TOKEN_SESSION_KEY, expoPushToken).catch(() => {});
    } catch {
      // Push is helpful, but chat should keep working even if registration fails.
    }
  }, []);

  const unregisterPushNotifications = useCallback(async (
    session: NativeBridgeSession | null | undefined
  ) => {
    if (Platform.OS === 'web') return true;
    const expoPushToken = expoPushTokenRef.current ||
      await SecureStore.getItemAsync(PUSH_TOKEN_SESSION_KEY).catch(() => null) || '';
    if (!expoPushToken) return true;
    if (!session?.user_id || !session.token) return false;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    try {
      const response = await fetch(`${APP_BACKEND_URL}/functions/v1/bd-register-push-token`, {
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
      });
      const body = await response.json().catch(() => null);
      if (!response.ok || body?.ok !== true) return false;
      expoPushTokenRef.current = '';
      await SecureStore.deleteItemAsync(PUSH_TOKEN_SESSION_KEY).catch(() => {});
      return true;
    } catch {
      return false;
    } finally {
      clearTimeout(timeout);
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
    const nativeModalVisible = showNativeChat || showNativeQrScanner;
    navigation.setOptions({
      tabBarStyle: showBrowser || nativeModalVisible ? { display: 'none' } : TAB_BAR_STYLE,
    });

    return () => {
      navigation.setOptions({ tabBarStyle: TAB_BAR_STYLE });
    };
  }, [navigation, showBrowser, showNativeChat, showNativeQrScanner]);

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
    setNativeChatNotice(null);
    setNativeChatDraft('');
    chatUnreadSnapshotRef.current = null;
    pushRegistrationKeyRef.current = '';
    expoPushTokenRef.current = '';
    setPendingDashboardRedirect(false);
    setPendingBridgeTargetPath(DEFAULT_BRIDGE_TARGET_PATH);
    signedOutRecoveryIntentRef.current = false;
    SecureStore.deleteItemAsync(NATIVE_MEMBER_SESSION_KEY).catch(() => {});
    SecureStore.deleteItemAsync(NATIVE_BRIDGE_SESSION_KEY).catch(() => {});
    SecureStore.deleteItemAsync(CHAT_UNREAD_SESSION_KEY).catch(() => {});
    SecureStore.deleteItemAsync(PUSH_TOKEN_SESSION_KEY).catch(() => {});
    updateAppBadge(0);
  }, [updateAppBadge]);

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
    setWebViewSessionKey((key) => key + 1);
  }, [clearLoadingTimeout]);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      SecureStore.getItemAsync(ACCOUNT_DELETED_EVENT_KEY)
        .then((deletedAt) => {
          if (!active || !deletedAt) return;
          clearNativeSession();
          clearWebsiteStorage();
          resetWebsiteBrowser();
          setShowBrowser(false);
          SecureStore.deleteItemAsync(ACCOUNT_DELETED_EVENT_KEY).catch(() => {});
        })
        .catch(() => {});
      return () => {
        active = false;
      };
    }, [clearNativeSession, clearWebsiteStorage, resetWebsiteBrowser])
  );

  const finishLogoutInApp = useCallback(async (reason: string) => {
    addDebugLine(`logout synced: ${reason}`);
    pendingAppLogoutRef.current = false;
    await unregisterPushNotifications(nativeBridgeSessionRef.current);
    clearNativeSession();
    setError(null);
    if (logoutCleanupTimerRef.current) clearTimeout(logoutCleanupTimerRef.current);
    // Give the website logout request a short window to invalidate its server
    // session, then destroy the non-persistent WebView and all local browsing
    // state before a signed-out route (such as password recovery) can reopen.
    logoutCleanupTimerRef.current = setTimeout(() => {
      logoutCleanupTimerRef.current = null;
      clearWebsiteStorage();
      resetWebsiteBrowser();
      setShowBrowser(false);
    }, 500);
  }, [addDebugLine, clearNativeSession, clearWebsiteStorage, resetWebsiteBrowser, unregisterPushNotifications]);

  useEffect(() => {
    return () => {
      if (logoutCleanupTimerRef.current) clearTimeout(logoutCleanupTimerRef.current);
    };
  }, []);

  useEffect(() => {
    let alive = true;

    Promise.all([
      SecureStore.getItemAsync(NATIVE_MEMBER_SESSION_KEY),
      SecureStore.getItemAsync(NATIVE_BRIDGE_SESSION_KEY),
      SecureStore.getItemAsync(PUSH_TOKEN_SESSION_KEY),
    ])
      .then(([storedMember, storedBridge, storedPushToken]) => {
        if (!alive) return;

        expoPushTokenRef.current = storedPushToken || '';

        const member = storedMember
          ? (JSON.parse(storedMember) as NativeMember)
          : null;
        const bridge = storedBridge
          ? (JSON.parse(storedBridge) as NativeBridgeSession)
          : null;

        if (member?.email && bridge?.user_id && bridge?.token) {
          setNativeMember(withMemberRole(member, member.account_role || 'couple'));
          setNativeBridgeSession(bridge);
          return;
        }

        if (member?.email || bridge?.user_id || bridge?.token) {
          addDebugLine('cleared old native session');
          SecureStore.deleteItemAsync(NATIVE_MEMBER_SESSION_KEY).catch(() => {});
          SecureStore.deleteItemAsync(NATIVE_BRIDGE_SESSION_KEY).catch(() => {});
        }
      })
      .catch(() => {})
      .finally(() => {
        if (alive) setNativeSessionHydrated(true);
      });

    return () => {
      alive = false;
    };
  }, [addDebugLine]);

  const openUrl = useCallback((path: string) => {
    const url = new URL(path, TARGET_URL);
    const nextUrl = url.toString();
    const nextPath = getWeddingWinPath(nextUrl);
    signedOutRecoveryIntentRef.current = !nativeMember && nextPath === '/login/retrieval';
    if (!nativeMember && nextPath.startsWith('/login')) {
      // Mount a fresh private WebView for signed-out auth pages so stale site
      // cookies cannot turn Forgot password into an authenticated account view.
      setWebViewSessionKey((key) => key + 1);
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
  }, [nativeMember, navigateWebViewTo, startLoadingFeedback]);

  const openAbsoluteUrl = useCallback((url: string) => {
    signedOutRecoveryIntentRef.current = false;
    addDebugLine(`open ${url.replace(TARGET_URL, '')}`);
    setError(null);
    startLoadingFeedback();
    setIsChatPage(isChatInboxPath(getWeddingWinPath(url)));
    setIsWedWebsiteSite(isWedWebsiteUrl(url));
    currentUrlRef.current = url;
    navigateWebViewTo(url);
    setShowBrowser(true);
  }, [addDebugLine, navigateWebViewTo, startLoadingFeedback]);

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
          data?.error || 'Please check your email and password.'
        );
        return;
      }

      addDebugLine('email login ok -> native session');
      const signedInUser = withMemberRole(
        data.user as NativeMember,
        credentials.role || 'couple'
      );
      setNativeMember(signedInUser);
      setNativeBridgeSession(data.native_session);
      SecureStore.setItemAsync(
        NATIVE_MEMBER_SESSION_KEY,
        JSON.stringify(signedInUser)
      ).catch(() => {});
      SecureStore.setItemAsync(
        NATIVE_BRIDGE_SESSION_KEY,
        JSON.stringify(data.native_session)
      ).catch(() => {});

      setShowBrowser(false);
    } catch {
      Alert.alert('Login unavailable', 'Please check your connection and try again.');
    } finally {
      setEmailLoginLoading(false);
    }
  }, [addDebugLine]);

  const saveNativeSession = useCallback((
    user: NativeMember,
    session?: NativeBridgeSession | null,
    fallbackRole: SignupRole = 'couple'
  ) => {
    const normalizedUser = withMemberRole(user, fallbackRole);
    setNativeMember(normalizedUser);
    setNativeBridgeSession(session || null);
    SecureStore.setItemAsync(
      NATIVE_MEMBER_SESSION_KEY,
      JSON.stringify(normalizedUser)
    ).catch(() => {});
    if (session) {
      SecureStore.setItemAsync(
        NATIVE_BRIDGE_SESSION_KEY,
        JSON.stringify(session)
      ).catch(() => {});
    }
  }, []);

  const createWebsiteLoginBridge = useCallback(async (
    session: NativeBridgeSession,
    targetPath: '/account/home' | '/builder-sso'
  ) => {
    const response = await fetch(`${APP_BACKEND_URL}/functions/v1/bd-email-login`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${APP_BACKEND_PUBLISHABLE_KEY}`,
        apikey: APP_BACKEND_PUBLISHABLE_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ native_session: session, target_path: targetPath }),
    });
    const data = await response.json().catch(() => ({}));
    const bridgeUrl = typeof data?.app_login_url === 'string' ? data.app_login_url : '';
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
      throw new Error(data?.error || 'A secure website session could not be created.');
    }

    if (data.native_session) {
      const refreshedSession = { ...session, ...data.native_session };
      setNativeBridgeSession(refreshedSession);
      SecureStore.setItemAsync(
        NATIVE_BRIDGE_SESSION_KEY,
        JSON.stringify(refreshedSession)
      ).catch(() => {});
    }
    return parsedBridge.toString();
  }, []);

  const runMemberSignup = useCallback(async (signup: MemberSignup) => {
    setSignupLoading(true);

    try {
      const endpoint =
        signup.role === 'vendor' ? 'bd-vendor-signup' : 'bd-couple-signup';
      const signupPayload = {
        first_name: signup.firstName,
        email: signup.email,
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
      const response = await fetch(`${APP_BACKEND_URL}/functions/v1/${endpoint}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${APP_BACKEND_PUBLISHABLE_KEY}`,
          apikey: APP_BACKEND_PUBLISHABLE_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(signupPayload),
      });
      const data = await response.json();

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
      saveNativeSession(signedUpUser, data.native_session);
      setShowBrowser(false);
    } catch {
      Alert.alert('Signup unavailable', 'Please check your connection and try again.');
    } finally {
      setSignupLoading(false);
    }
  }, [addDebugLine, saveNativeSession]);

  const runCompleteProfile = useCallback(async (profile: ContactProfile) => {
    if (!nativeBridgeSession?.user_id || !nativeBridgeSession?.token) {
      Alert.alert('Sign in again', 'Please sign in once more before saving your profile.');
      return;
    }

    setProfileSaveLoading(true);

    try {
      const profilePayload = {
        first_name: profile.firstName,
        email: profile.email,
        ...(profile.weddingDate ? { wedding_date: profile.weddingDate } : {}),
      };
      const response = await fetch(`${APP_BACKEND_URL}/functions/v1/bd-complete-profile`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${APP_BACKEND_PUBLISHABLE_KEY}`,
          apikey: APP_BACKEND_PUBLISHABLE_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          native_session: nativeBridgeSession,
          profile: profilePayload,
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
        wedding_date: data.user?.wedding_date || profile.weddingDate || nativeMember?.wedding_date,
        subscription_id:
          data.user?.subscription_id ||
          nativeMember?.subscription_id ||
          COUPLE_MEMBERSHIP_PLAN_ID,
      };
      const completedSession: NativeBridgeSession = {
        ...nativeBridgeSession,
        ...(data.native_session || {}),
      };
      saveNativeSession(withMemberRole(completedUser, 'couple'), completedSession);

      // Match the button promise: a successful save should continue directly
      // into the authenticated website dashboard, not stop at the app menu.
      const websiteLoginUrl = await createWebsiteLoginBridge(
        completedSession,
        '/account/home'
      );
      startBridgeRedirect();
      openAbsoluteUrl(websiteLoginUrl);
    } catch {
      Alert.alert('Profile not saved', 'Please check your connection and try again.');
    } finally {
      setProfileSaveLoading(false);
    }
  }, [addDebugLine, createWebsiteLoginBridge, nativeBridgeSession, nativeMember, openAbsoluteUrl, saveNativeSession, startBridgeRedirect]);

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

    try {
      addDebugLine('open dashboard with one-time website bridge');
      const bridgeUrl = await createWebsiteLoginBridge(nativeBridgeSession, '/account/home');
      startBridgeRedirect();
      openAbsoluteUrl(bridgeUrl);
    } catch (error) {
      Alert.alert(
        'Dashboard unavailable',
        error instanceof Error ? error.message : 'Please sign in again and try once more.'
      );
    }
  }, [addDebugLine, createWebsiteLoginBridge, nativeBridgeSession, nativeMember, openAbsoluteUrl, startBridgeRedirect]);

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

    try {
      addDebugLine('open website builder with one-time website bridge');
      const bridgeUrl = await createWebsiteLoginBridge(nativeBridgeSession, '/builder-sso');
      startBridgeRedirect('/builder-sso');
      openAbsoluteUrl(bridgeUrl);
    } catch (error) {
      Alert.alert(
        'Website builder unavailable',
        error instanceof Error ? error.message : 'Please sign in again and try once more.'
      );
    }
  }, [addDebugLine, createWebsiteLoginBridge, nativeBridgeSession, nativeMember, openAbsoluteUrl, startBridgeRedirect]);

  const requestWebsiteSessionBridge = useCallback(() => {
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

  const waitForWebsiteSessionBridge = useCallback((timeoutMs = 650) => {
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
        bridgeSessionWaitersRef.current = bridgeSessionWaitersRef.current.filter(
          (waiter) => waiter !== finish
        );
        finish(nativeBridgeSessionRef.current);
      }, timeoutMs);
    });
  }, [requestWebsiteSessionBridge]);

  const refreshNativeBridgeSession = useCallback(async (
    session: NativeBridgeSession | null | undefined
  ) => {
    if (!hasNativeBridgeSession(session)) return null;
    const bridgeSession = session as NativeBridgeSession;

    try {
      const sessionForRefresh = {
        ...bridgeSession,
        email: bridgeSession.email || nativeBridgeSessionRef.current?.email || nativeMember?.email || '',
      };
      const response = await fetch(`${APP_BACKEND_URL}/functions/v1/bd-email-login`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${APP_BACKEND_PUBLISHABLE_KEY}`,
          apikey: APP_BACKEND_PUBLISHABLE_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ native_session: sessionForRefresh }),
      });
      const data = await response.json();
      if (!response.ok || !data?.ok || !data?.native_session) return null;

      const refreshedSession = data.native_session as NativeBridgeSession;
      const refreshedUser = data.user as NativeMember | undefined;
      nativeBridgeSessionRef.current = refreshedSession;
      setNativeBridgeSession(refreshedSession);
      SecureStore.setItemAsync(
        NATIVE_BRIDGE_SESSION_KEY,
        JSON.stringify(refreshedSession)
      ).catch(() => {});
      if (refreshedUser?.email) {
        const normalizedUser = withMemberRole(
          { ...(nativeMember || {}), ...refreshedUser },
          memberAccountRole(nativeMember)
        );
        setNativeMember(normalizedUser);
        SecureStore.setItemAsync(
          NATIVE_MEMBER_SESSION_KEY,
          JSON.stringify(normalizedUser)
        ).catch(() => {});
      }
      return refreshedSession;
    } catch {
      return null;
    }
  }, [nativeMember]);

  const handleNativeQrScan = useCallback((rawValue: string) => {
    const value = rawValue.trim();
    if (!value) return;

    playChatNotificationCue();
  }, [playChatNotificationCue]);

  const syncNativeChat = useCallback(async (
    action: NativeChatSyncAction = 'list',
    options: {
      threadToken?: string;
      threadId?: string;
      requestUri?: string;
      message?: string;
      imageDataUri?: string;
      connectUrl?: string;
      threadTitle?: string;
      nativeSession?: NativeBridgeSession | null;
      sessionRetryAttempted?: boolean;
      quiet?: boolean;
      fallbackToWebsite?: boolean;
    } = {}
  ) => {
    const activeNativeSession = options.nativeSession || nativeBridgeSessionRef.current || nativeBridgeSession;
    requestWebsiteSessionBridge();

    if (!hasNativeBridgeSession(activeNativeSession)) {
      if (!options.quiet) {
        setNativeChatError('Please sign in to use WeddingWin messages.');
      }
      return null;
    }

    if (!options.quiet) {
      setNativeChatLoading(action === 'list' || action === 'open_vendor_profile');
      setNativeChatError(null);
      if (action !== 'send') setNativeChatNotice(null);
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
          native_session: activeNativeSession,
          thread_token: options.threadToken || selectedChatThreadToken,
          selected_thread_id: options.threadId,
          selected_thread_title: options.threadTitle,
          selected_thread_request_uri: options.requestUri,
          message: options.message,
          image_data_uri: options.imageDataUri,
          connect_url: options.connectUrl,
        }),
      });
      const data = (await response.json()) as NativeChatSyncResponse;

      if (!response.ok || data?.ok === false) {
        const detail = data?.detail ? ` ${data.detail}` : '';
        throw new Error(`${data?.error || 'Chat sync failed.'}${detail}`);
      }

      if ((data as { partial?: boolean }).partial) {
        // Send succeeded but the backend hit the website API rate limit while
        // rebuilding the thread list. Keep the current UI; next poll refreshes.
        return data;
      }

      const threads = data.threads || [];
      setNativeChatSyncDebug(data.sync_debug || null);
      const nextThreadToken = data.selected_thread_token || options.threadToken || threads[0]?.token || '';
      setNativeChatThreads(threads);
      setSelectedChatThreadToken(nextThreadToken);
      setNativeChatMessages(data.messages || []);
      setNativeChatError((current) =>
        current && /login needs to be refreshed|native session expired|sign in again/i.test(current)
          ? null
          : current
      );
      if (action === 'open_vendor_profile') {
        setNativeChatOpeningLabel('');
      }
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
      updateAppBadge(chatUnreadSnapshotRef.current);
      setChatStatusLabel(
        chatUnreadSnapshotRef.current > 0
          ? `${chatUnreadSnapshotRef.current} new message${chatUnreadSnapshotRef.current === 1 ? '' : 's'} waiting`
          : 'No new messages'
      );
      return data;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Chat sync failed.';
      if (/native session expired/i.test(message) && !options.sessionRetryAttempted) {
        const backendRefreshedSession = await refreshNativeBridgeSession(activeNativeSession);
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
      if (!options.quiet && options.fallbackToWebsite && /native session expired/i.test(message)) {
        addDebugLine('native chat session expired');
        setNativeChatError('Your app login needs to be refreshed before messages can open. Please sign out and sign back in, then try Send Message again.');
        return null;
      }
      if (!options.quiet) {
        setNativeChatError(
          /native session expired/i.test(message)
            ? 'Your app login needs to be refreshed before messages can open. Please sign out and sign back in, then try Send Message again.'
            : message
        );
        if (action === 'open_vendor_profile') {
          setNativeChatOpeningLabel('');
        }
      }
      return null;
    } finally {
      if (!options.quiet) {
        setNativeChatLoading(false);
      }
    }
  }, [
    addDebugLine,
    nativeBridgeSession,
    playChatNotificationCue,
    refreshNativeBridgeSession,
    requestWebsiteSessionBridge,
    selectedChatThreadToken,
    updateAppBadge,
    waitForWebsiteSessionBridge,
  ]);

  // A keyboard opened by a website form must never linger under the native
  // chat overlay - blur the WebView's focused field and dismiss it before the
  // overlay mounts, otherwise it covers the composer and send button.
  const dismissAnyKeyboard = useCallback(() => {
    webviewRef.current?.injectJavaScript(
      '(function(){try{if(document.activeElement&&document.activeElement.blur){document.activeElement.blur();}}catch(e){}})();true;'
    );
    Keyboard.dismiss();
  }, []);

  const openChatWithBridge = useCallback(() => {
    const activeNativeSession = nativeBridgeSessionRef.current || nativeBridgeSession;
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
    setShowNativeChat(true);
    syncNativeChat('list', { fallbackToWebsite: true });
  }, [addDebugLine, chatInboxPath, dismissAnyKeyboard, nativeBridgeSession, openUrl, requestWebsiteSessionBridge, syncNativeChat]);

  useEffect(() => {
    if (!nativeSessionHydrated || !lastNotificationResponse) return;
    if (
      lastNotificationResponse.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER ||
      lastNotificationResponse.notification.request.content.data?.screen !== 'chat'
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
  }, [lastNotificationResponse, nativeBridgeSession, nativeSessionHydrated, openChatWithBridge]);

  useEffect(() => {
    if (Platform.OS === 'web' || !nativeSessionHydrated) return;

    const syncBadge = () => {
      updateAppBadge(hasNativeBridgeSession(nativeBridgeSessionRef.current) ? chatUnreadCount : 0);
    };
    syncBadge();

    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') syncBadge();
    });
    return () => subscription.remove();
  }, [chatUnreadCount, nativeBridgeSession, nativeSessionHydrated, updateAppBadge]);

  const openNativeChatDeepLink = useCallback(async (path: string) => {
    const activeNativeSession = nativeBridgeSessionRef.current || nativeBridgeSession;
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
    if (threadToken) setSelectedChatThreadToken(threadToken);
    setShowNativeChat(true);

    const data = await syncNativeChat(threadToken ? 'read' : 'list', {
      threadToken,
      nativeSession: activeNativeSession,
      fallbackToWebsite: true,
    });
    if (threadToken && data?.selected_thread_token) {
      setNativeChatOpenRequestId((value) => value + 1);
    }
  }, [dismissAnyKeyboard, nativeBridgeSession, requestWebsiteSessionBridge, syncNativeChat]);

  const openVendorConnectChat = useCallback(async (connectUrl: string) => {
    if (vendorConnectNativeUrlRef.current === connectUrl) return;
    vendorConnectNativeUrlRef.current = connectUrl;
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
    setShowNativeChat(true);
    requestWebsiteSessionBridge();

    try {
      let activeNativeSession = nativeBridgeSessionRef.current || nativeBridgeSession;
      if (!hasNativeBridgeSession(activeNativeSession)) {
        activeNativeSession = await waitForWebsiteSessionBridge(350);
      }
      if (!hasNativeBridgeSession(activeNativeSession)) {
        setNativeChatError('Please sign in through the app before starting a private message.');
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
  }, [addDebugLine, dismissAnyKeyboard, nativeBridgeSession, requestWebsiteSessionBridge, syncNativeChat, waitForWebsiteSessionBridge]);

  const interceptVendorConnectChat = useCallback((connectUrl: string) => {
    if (vendorConnectNativeUrlRef.current === connectUrl) {
      setLoading(false);
      return;
    }
    openVendorConnectChat(connectUrl);
  }, [openVendorConnectChat]);

  const selectNativeChatThread = useCallback((threadToken: string) => {
    setSelectedChatThreadToken(threadToken);
    syncNativeChat('read', { threadToken });
  }, [syncNativeChat]);

  const sendNativeChatMessage = useCallback(async () => {
    const message = nativeChatDraft.trim();
    if (!message || !selectedChatThreadToken) return;
    const selectedThread = nativeChatThreads.find((thread) => thread.token === selectedChatThreadToken);
    if (selectedThread?.closed || selectedThread?.reported) {
      setNativeChatError(selectedThread.report_notice || CHAT_REPORTED_NOTICE);
      return;
    }

    setNativeChatSending(true);
    setNativeChatNotice(null);
    const sent = await syncNativeChat('send', {
      threadToken: selectedChatThreadToken,
      threadId: selectedThread?.thread_id || selectedThread?.id,
      threadTitle: selectedThread?.title,
      requestUri: selectedThread?.request_uri,
      message,
    });
    if (
      sent?.send_delivery_state === 'stored' ||
      sent?.send_delivery_state === 'delivered' ||
      sent?.send_delivery_state === 'queued'
    ) {
      setNativeChatDraft('');
      if (sent.send_delivery_state === 'queued') {
        setNativeChatNotice('Message saved and queued for website delivery.');
      }
    } else if (sent?.send_delivery_state === 'failed') {
      setNativeChatError(
        sent.send_delivery_error || 'Message delivery failed. Your draft is still here so you can try again.'
      );
    } else if (sent) {
      setNativeChatError(
        sent.send_delivery_error || 'WeddingWin could not confirm delivery. Your draft is still here so you can try again.'
      );
    }
    setNativeChatSending(false);
  }, [nativeChatDraft, nativeChatThreads, selectedChatThreadToken, syncNativeChat]);

  const reportNativeChatConversation = useCallback(() => {
    if (!selectedChatThreadToken) {
      Alert.alert('Choose a conversation', 'Select a message thread before reporting it.');
      return;
    }

    const selectedThread = nativeChatThreads.find((thread) => thread.token === selectedChatThreadToken);
    if (selectedThread?.closed || selectedThread?.reported) {
      Alert.alert('Chat already reported', selectedThread.report_notice || CHAT_REPORTED_NOTICE);
      return;
    }

    Alert.alert(
      'Report and block this member?',
      "WeddingWin will close this conversation, block new conversations between these accounts, and review your report. Neither party can continue messaging through the app while the block is active.",
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Report & Block',
          style: 'destructive',
          onPress: async () => {
            setNativeChatReporting(true);
            try {
              // Use the mirror-backed report action so the member block,
              // report aliases, and durable website-close outbox row are
              // committed together before the UI confirms success.
              const reported = await syncNativeChat('report', {
                threadToken: selectedChatThreadToken,
                fallbackToWebsite: false,
              });
              if (!reported?.selected_thread_reported) {
                throw new Error(reported?.error || 'Chat report failed.');
              }
              const notice = reported.report_notice || CHAT_REPORTED_NOTICE;
              setNativeChatDraft('');
              setNativeChatError(null);
              Alert.alert('Member blocked and chat reported', notice);
            } catch (error) {
              const message = error instanceof Error ? error.message : 'Chat report failed.';
              setNativeChatError(message);
            } finally {
              setNativeChatReporting(false);
            }
          },
        },
      ]
    );
  }, [nativeChatThreads, selectedChatThreadToken, syncNativeChat]);

  const refreshChatStatus = useCallback(async () => {
    let activeNativeSession = nativeBridgeSessionRef.current || nativeBridgeSession;
    if (!hasNativeBridgeSession(activeNativeSession)) {
      setChatUnreadCount(0);
      setChatStatusLabel('Synced with website chat');
      setChatInboxPath(DEFAULT_CHAT_INBOX_PATH);
      chatUnreadSnapshotRef.current = null;
      return;
    }

    try {
      const initialStatusSession = activeNativeSession as NativeBridgeSession;
      const requestStatus = (session: NativeBridgeSession) => fetch(`${APP_BACKEND_URL}/functions/v1/bd-chat-status`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${APP_BACKEND_PUBLISHABLE_KEY}`,
          apikey: APP_BACKEND_PUBLISHABLE_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          native_session: session,
          active_thread_token: nativeChatThreadOpenRef.current
            ? selectedChatThreadTokenRef.current
            : '',
        }),
      });

      let response = await requestStatus(initialStatusSession);
      let data = (await response.json()) as ChatStatus & { ok?: boolean; error?: string };

      if (!response.ok && /native session expired/i.test(String(data?.error || ''))) {
        const refreshedSession = await refreshNativeBridgeSession(activeNativeSession);
        if (hasNativeBridgeSession(refreshedSession)) {
          activeNativeSession = refreshedSession as NativeBridgeSession;
          response = await requestStatus(activeNativeSession);
          data = (await response.json()) as ChatStatus & { ok?: boolean; error?: string };
        }
      }

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
      updateAppBadge(unreadCount);
      setChatInboxPath(data.inbox_path || DEFAULT_CHAT_INBOX_PATH);
      setChatStatusLabel(
        unreadCount > 0
          ? `${unreadCount} new message${unreadCount === 1 ? '' : 's'} waiting`
          : data.latest_label || 'No new messages'
      );
    } catch {
      setChatStatusLabel('Website chat sync paused');
    }
  }, [nativeBridgeSession, playChatNotificationCue, refreshNativeBridgeSession, updateAppBadge]);

  useEffect(() => {
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
      if (!response.ok || (!data?.user?.email && !data?.redirect_url)) {
        const diagnostic = data?.diagnostic_id ? `\n\nDiagnostic: ${data.diagnostic_id}` : '';
        Alert.alert(
          'Apple sign-in setup needed',
          `${data?.error || 'Apple sign-in is not configured yet.'}${diagnostic}`
        );
        return;
      }

      const hasNativeAppleSession = Boolean(
        data?.native_session?.user_id && data?.native_session?.token
      );

      if (data?.user?.email && hasNativeAppleSession) {
        saveNativeSession(data.user, data.native_session || null, role);
      }

      if (data?.user?.email && hasNativeAppleSession && needsContactProfile(data.user)) {
        setShowBrowser(false);
        return;
      }

      if (data?.user?.email && hasNativeAppleSession) {
        setShowBrowser(false);
        return;
      }

      if (!data?.redirect_url) {
        Alert.alert('Apple sign-in failed', 'WeddingWin could not create an app session.');
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
      const { codeVerifier, codeChallenge } = await createGooglePkcePair();
      const result = await WebBrowser.openAuthSessionAsync(
        buildNativeGoogleStartUrl(returnUrl, role, codeChallenge, consent),
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

      const exchangeCode = callbackUrl.searchParams.get('exchange_code');
      if (!exchangeCode) {
        Alert.alert(
          'Google sign-in failed',
          'WeddingWin could not finish the app login session.'
        );
        return;
      }

      const exchangeResponse = await fetch(
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
        }
      );
      const exchange = await exchangeResponse.json();
      if (
        !exchangeResponse.ok ||
        !exchange?.ok ||
        !exchange?.user?.email ||
        !hasNativeTokenSession(exchange?.native_session)
      ) {
        Alert.alert(
          'Google sign-in failed',
          exchange?.error || 'The secure Google login exchange expired. Please try again.'
        );
        return;
      }

      addDebugLine('Google login ok -> one-time native exchange');
      saveNativeSession(exchange.user, exchange.native_session, role);
      setShowBrowser(false);
    } catch {
      Alert.alert('Google sign-in failed', 'Please check your connection and try again.');
    } finally {
      setGoogleLoginLoading(false);
    }
  }, [addDebugLine, saveNativeSession]);

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
        nativeMember ||
          hasNativeBridgeSession(nativeBridgeSessionRef.current || nativeBridgeSession)
      );
      const weddingWinPath = getWeddingWinPath(url);

      if (weddingWinPath) {
        addDebugLine(`should start ${weddingWinPath}`);
      }

      if (
        hasSignedInAppSession &&
        (isBdAppGoogleLoginUrl(url) || isOAuthStartUrl(url) || isGoogleIdentityUrl(url))
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
        setWebViewSessionKey((key) => key + 1);
        setCanGoBack(false);
        setCanGoForward(false);
        currentUrlRef.current = signedOutUrl;
        navigateWebViewTo(signedOutUrl);
        return false;
      }

      if (
        weddingWinPath &&
        isChatInboxPath(weddingWinPath) &&
        hasNativeBridgeSession(nativeBridgeSessionRef.current || nativeBridgeSession)
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
      if (navigationAction === 'system-browser' || navigationAction === 'external-app') {
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
    ]
  );

  const handleNavigationStateChange = useCallback((s: WebViewNavigation) => {
    currentUrlRef.current = s.url;
    setCanGoBack(s.canGoBack);
    setCanGoForward(s.canGoForward);
    setIsWedWebsiteSite(isWedWebsiteUrl(s.url));
    const weddingWinPath = getWeddingWinPath(s.url);
    if (weddingWinPath.startsWith('/login') && weddingWinPath !== '/login/retrieval') {
      signedOutRecoveryIntentRef.current = false;
    }
    setIsChatPage(isChatInboxPath(weddingWinPath));

    if (weddingWinPath) {
      addDebugLine(`nav ${weddingWinPath}`);
    }

    if (
      weddingWinPath &&
      isChatInboxPath(weddingWinPath) &&
      hasNativeBridgeSession(nativeBridgeSessionRef.current || nativeBridgeSession)
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
      requestWebsiteSessionBridge();
      const pendingLogin = pendingBdFormLoginRef.current;
      if (pendingLogin) {
        pendingBdFormLoginRef.current = null;
        pendingBdFormLoginSubmittedRef.current = false;
        const bridgedMember = withMemberRole(
          { email: pendingLogin.email },
          pendingLogin.role || 'couple'
        );
        setNativeMember(bridgedMember);
        SecureStore.setItemAsync(
          NATIVE_MEMBER_SESSION_KEY,
          JSON.stringify(bridgedMember)
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
    interceptVendorConnectChat,
    nativeBridgeSession,
    openNativeChatDeepLink,
    pendingBridgeTargetPath,
    pendingDashboardRedirect,
    requestWebsiteSessionBridge,
  ]);

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
        const message = JSON.parse(data) as { type?: string; bridge_nonce?: string };
        if (message.type === 'bd-app-login-cookies-set') {
          addDebugLine('BD bridge reported cookies set');
        } else if (message.type === 'bd-cookie-session') {
          if (!message.bridge_nonce || message.bridge_nonce !== websiteBridgeNonceRef.current) {
            addDebugLine('ignored stale WebView bridge response');
            return;
          }
          websiteBridgeNonceRef.current = '';
          const bridged = (message as { native_session?: NativeBridgeSession }).native_session;
          if (bridged?.user_id && (bridged.token || bridged.cookie)) {
            const confirmedBridge = bridged;
            const currentMemberId = String(nativeMember?.user_id || '').trim();
            const bridgedMemberId = String(confirmedBridge.user_id || '').trim();
            if (!currentMemberId || currentMemberId === bridgedMemberId) {
              const refreshedSession = {
                ...nativeBridgeSession,
                ...confirmedBridge,
                email: confirmedBridge.email || nativeMember?.email || nativeBridgeSession?.email,
              };
              nativeBridgeSessionRef.current = refreshedSession;
              setNativeBridgeSession(refreshedSession);
              SecureStore.setItemAsync(
                NATIVE_BRIDGE_SESSION_KEY,
                JSON.stringify(refreshedSession)
              ).catch(() => {});
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
    [addDebugLine, finishLogoutInApp, nativeBridgeSession, nativeMember]
  );

  const handleOpenWindow = useCallback(
    (event: { nativeEvent: { targetUrl?: string } }) => {
      const target = event.nativeEvent.targetUrl;
      if (!target) return;
      const hasSignedInAppSession = Boolean(
        nativeMember ||
          hasNativeBridgeSession(nativeBridgeSessionRef.current || nativeBridgeSession)
      );

      if (
        hasSignedInAppSession &&
        (isBdAppGoogleLoginUrl(target) || isOAuthStartUrl(target) || isGoogleIdentityUrl(target))
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
          hasNativeBridgeSession(nativeBridgeSessionRef.current || nativeBridgeSession)
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
      if (navigationAction === 'system-browser' && isGoogleIdentityUrl(target)) {
        setLoading(false);
        addDebugLine('blocked unsolicited Google identity window');
        return;
      }
      if (navigationAction === 'system-browser' || navigationAction === 'external-app') {
        setLoading(false);
        Linking.openURL(target).catch(() => {});
        return;
      }
      setLoading(false);
      addDebugLine('blocked non-allowlisted WebView window');
    },
    [addDebugLine, interceptVendorConnectChat, nativeBridgeSession, nativeMember, navigateWebViewTo, openNativeChatDeepLink, runBdGoogleLoginInSystemBrowser, runOAuthInSystemBrowser, startLoadingFeedback]
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
  }, [clearLoadingTimeout]);

  const handleLoadStart = useCallback(() => {
    startLoadingFeedback();
  }, [startLoadingFeedback]);

  const handleLoadEnd = useCallback(() => {
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
    if (pendingBdFormLoginRef.current && getWeddingWinPath(currentUrlRef.current) === '/login') {
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

  const signOutEverywhere = useCallback(async () => {
    addDebugLine('sign out app + website');
    pendingAppLogoutRef.current = true;
    await unregisterPushNotifications(nativeBridgeSessionRef.current);
    clearNativeSession();
    openAbsoluteUrl(`${WEBSITE_LOGOUT_URL}?ww_app_logout=${Date.now()}`);
  }, [addDebugLine, clearNativeSession, openAbsoluteUrl, unregisterPushNotifications]);

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
    setShowBrowser(false);
    setVendorDrawOpenRequestId((requestId) => requestId + 1);
  }, [clearLoadingTimeout]);

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
    setShowBrowser(false);
  }, [clearLoadingTimeout, dismissWrappedWebsiteMenus]);

  const runBottomNavigationAction = useCallback(
    (action: () => void | Promise<void>) => {
      if (historyNavigationTimerRef.current) {
        clearTimeout(historyNavigationTimerRef.current);
        historyNavigationTimerRef.current = null;
      }
      clearLoadingTimeout();
      setLoading(false);
      webviewRef.current?.stopLoading();
      dismissWrappedWebsiteMenus();
      requestAnimationFrame(() => {
        void action();
      });
    },
    [clearLoadingTimeout, dismissWrappedWebsiteMenus]
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
    setNativeChatNotice(null);
    setNativeChatOpenRequestId(0);
    setNativeChatThreadOpen(false);
    setShowNativeChat(false);
  }, []);

  const renderNativeChatOverlay = () => (
    showNativeChat ? (
      <View
        style={styles.nativeChatOverlay}
        accessibilityViewIsModal
        importantForAccessibility="yes"
        onAccessibilityEscape={closeNativeChat}>
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
        syncDebug={nativeChatSyncDebug}
        draft={nativeChatDraft}
        onDraftChange={setNativeChatDraft}
        onSelectThread={selectNativeChatThread}
        onSend={sendNativeChatMessage}
        onReport={reportNativeChatConversation}
        onRefresh={() => syncNativeChat('list')}
        onClose={closeNativeChat}
        onThreadViewChange={setNativeChatThreadOpen}
        chatUnreadCount={chatUnreadCount}
        openThreadRequestId={nativeChatOpenRequestId}
        openingConversationLabel={nativeChatOpeningLabel}
      />
      </View>
    ) : null
  );
  const nativeMemberIsCouple = isCoupleAccount(nativeMember);

  if (!showBrowser) {
    const nativeOverlayVisible = showNativeChat || showNativeQrScanner;
    return (
      <View style={styles.nativeShell}>
        <View
          style={styles.nativeHomeLayer}
          accessibilityElementsHidden={nativeOverlayVisible}
          importantForAccessibility={nativeOverlayVisible ? 'no-hide-descendants' : 'auto'}>
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
            vendorDrawOpenRequestId={vendorDrawOpenRequestId}
          />
        </View>
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
              onPress={closeBrowserToApp}
              accessibilityRole="button"
              accessibilityLabel="Back to WeddingWin app">
              <ChevronLeft size={24} color="#2E2E32" strokeWidth={2.2} />
            </TouchableOpacity>
            <View style={styles.chatScreenTitleWrap}>
              <Text style={styles.chatScreenTitle}>Messages</Text>
              <Text style={styles.chatScreenSubtitle}>WeddingWin chat</Text>
            </View>
            <View style={styles.chatHeaderSpacer} />
          </View>
        ) : (
          <TouchableOpacity
            style={[
              styles.browserCloseButton,
              isWedWebsiteSite && styles.browserCloseButtonCompact,
            ]}
            activeOpacity={0.78}
            onPress={closeBrowserToApp}
            accessibilityRole="button"
            accessibilityLabel="Back to WeddingWin app">
            <X size={17} color="#2E2E32" strokeWidth={2.3} />
            <Text style={styles.browserCloseButtonText}>Back to app</Text>
          </TouchableOpacity>
        )}
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
            nativeMember && !showNativeChat
              ? styles.webviewWithCoupleBottomNav
              : undefined
          }
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
            <TouchableOpacity
              onPress={reload}
              style={styles.retryButton}
              accessibilityRole="button"
              accessibilityLabel="Try loading again">
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
            onOpenWebsiteBuilder={openWebsiteBuilderFromBottomNav}
            onOpenDashboard={openDashboardFromBottomNav}
            onOpenChat={openChatFromBottomNav}
            onOpenQrScanner={openQrScannerFromBottomNav}
            chatUnreadCount={chatUnreadCount}
          />
        ) : nativeMember && !showNativeChat ? (
          <VendorBottomNav
            onOpenVendorDashboard={openDashboardFromBottomNav}
            onOpenChat={openChatFromBottomNav}
            onOpenVendorDraw={openVendorDrawFromBottomNav}
            chatUnreadCount={chatUnreadCount}
          />
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
  nativeHomeLayer: {
    flex: 1,
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
  loginBackdropCompact: {
    paddingHorizontal: 16,
    paddingTop: 5,
    paddingBottom: 5,
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
  raffleModalCardContent: {
    padding: 20,
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
  vendorRaffleRulesLink: {
    color: '#AA565D',
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '900',
    textDecorationLine: 'underline',
    marginTop: 5,
  },
  vendorRaffleInfoCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#EAD2CC',
    backgroundColor: '#FFF8F6',
    padding: 13,
    marginBottom: 14,
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
  vendorRaffleProcessText: {
    color: '#2E2E32',
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '900',
  },
  vendorRaffleGrandPrizeText: {
    color: '#7C5C57',
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '800',
    marginTop: 12,
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
  vendorRaffleAutosaveRow: {
    minHeight: 34,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#EFD8D6',
    backgroundColor: '#FFF5F4',
    paddingHorizontal: 12,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 12,
  },
  vendorRaffleSaveHint: {
    color: '#756662',
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '800',
    textAlign: 'center',
    flexShrink: 1,
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
    gap: 10,
    padding: 11,
  },
  vendorRaffleWinnerStepNumber: {
    width: 24,
    height: 24,
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
    flex: 1,
  },
  vendorRaffleWinnerStepTitle: {
    color: '#2E2E32',
    fontSize: 13,
    lineHeight: 17,
    fontWeight: '900',
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
  oneAppSignOutButton: {
    marginTop: 0,
    paddingVertical: 5,
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
  browserCloseButton: {
    position: 'absolute',
    top: 8,
    left: 10,
    minHeight: 38,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#F0E2DE',
    backgroundColor: 'rgba(255, 255, 255, 0.96)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingHorizontal: 10,
    shadowColor: '#2E2E32',
    shadowOpacity: 0.12,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
    zIndex: 45,
  },
  browserCloseButtonCompact: {
    top: 2,
    minHeight: 32,
    borderRadius: 7,
    paddingHorizontal: 8,
  },
  browserCloseButtonText: {
    color: '#2E2E32',
    fontSize: 12,
    lineHeight: 15,
    fontWeight: '800',
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
