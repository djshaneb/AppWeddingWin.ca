import { memo, useCallback, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  WebView,
  type WebViewNavigation,
  type ShouldStartLoadRequest,
  type WebViewMessageEvent,
} from 'react-native-webview';
import * as WebBrowser from 'expo-web-browser';
import {
  RefreshCw,
  ArrowLeft,
  ArrowRight,
  TriangleAlert as AlertTriangle,
} from 'lucide-react-native';

const TARGET_URL = 'https://weddingwin.ca';
const BRAND_COLOR = '#C9A227';
const OAUTH_REDIRECT = 'weddingwin://auth-callback';
const APP_UA_TAG = 'WeddingWinApp/1.0';

const IOS_USER_AGENT =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1 ' +
  APP_UA_TAG;
const ANDROID_USER_AGENT =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36 ' +
  APP_UA_TAG;

const USER_AGENT = Platform.OS === 'android' ? ANDROID_USER_AGENT : IOS_USER_AGENT;
const SOURCE = { uri: TARGET_URL } as const;

const CLOAK_INJECTION = `
(function() {
  try {
    var HOME_URL = ${JSON.stringify(TARGET_URL)};
    var isOwnSite = false;
    var isSupabase = false;
    try {
      isOwnSite = /(^|\\.)weddingwin\\.ca$/i.test(window.location.hostname);
      isSupabase = /(^|\\.)supabase\\.co$/i.test(window.location.hostname);
    } catch(e) {}

    if (isOwnSite) {
      try {
        window.WeddingWinApp = {
          version: '1.0',
          openGoogleOAuth: function(authUrl) {
            try {
              window.ReactNativeWebView.postMessage(JSON.stringify({
                type: 'GOOGLE_OAUTH',
                url: authUrl
              }));
            } catch(e) {}
          }
        };
        try {
          var evt = new Event('WeddingWinAppReady');
          window.dispatchEvent(evt);
        } catch(e) {}
      } catch(e) {}
    }

    if (isOwnSite || isSupabase) {
      try {
        var returnUrlKey = '__ww_oauth_return';
        window.open = function(url) {
          try {
            if (url) {
              try { sessionStorage.setItem(returnUrlKey, window.location.href); } catch(e) {}
              window.location.href = url;
            }
          } catch(e) {}
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

      try {
        window.close = function() {
          try {
            var ret = null;
            try { ret = sessionStorage.getItem('__ww_oauth_return'); } catch(e) {}
            try { sessionStorage.removeItem('__ww_oauth_return'); } catch(e) {}
            if (ret && ret !== window.location.href) {
              window.location.href = ret;
            } else if (window.history.length > 1) {
              window.history.back();
            } else {
              window.location.href = HOME_URL;
            }
          } catch(e) {}
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

function safeHostname(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
}

const Header = memo(function Header({
  hostname,
  canGoBack,
  canGoForward,
  onBack,
  onForward,
  onReload,
}: {
  hostname: string;
  canGoBack: boolean;
  canGoForward: boolean;
  onBack: () => void;
  onForward: () => void;
  onReload: () => void;
}) {
  return (
    <View style={styles.header}>
      <View style={styles.headerLeft}>
        <TouchableOpacity
          onPress={onBack}
          disabled={!canGoBack}
          style={[styles.iconButton, !canGoBack && styles.iconButtonDisabled]}
          hitSlop={10}>
          <ArrowLeft
            size={22}
            color={canGoBack ? '#1C1C1E' : '#C7C7CC'}
            strokeWidth={2}
          />
        </TouchableOpacity>
        <TouchableOpacity
          onPress={onForward}
          disabled={!canGoForward}
          style={[styles.iconButton, !canGoForward && styles.iconButtonDisabled]}
          hitSlop={10}>
          <ArrowRight
            size={22}
            color={canGoForward ? '#1C1C1E' : '#C7C7CC'}
            strokeWidth={2}
          />
        </TouchableOpacity>
      </View>

      <View style={styles.headerCenter}>
        <Text style={styles.brand}>WeddingWin</Text>
        <Text style={styles.brandSub} numberOfLines={1}>
          {hostname}
        </Text>
      </View>

      <View style={styles.headerRight}>
        <TouchableOpacity onPress={onReload} style={styles.iconButton} hitSlop={10}>
          <RefreshCw size={20} color="#1C1C1E" strokeWidth={2} />
        </TouchableOpacity>
      </View>
    </View>
  );
});

export default function HomeScreen() {
  const webviewRef = useRef<WebView>(null);
  const [navState, setNavState] = useState({
    canGoBack: false,
    canGoForward: false,
    hostname: safeHostname(TARGET_URL),
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const handleShouldStart = useCallback((request: ShouldStartLoadRequest) => {
    const { url } = request;

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
  }, []);

  const handleNavigationStateChange = useCallback((s: WebViewNavigation) => {
    const host = safeHostname(s.url);
    setNavState((prev) => {
      if (
        prev.canGoBack === s.canGoBack &&
        prev.canGoForward === s.canGoForward &&
        prev.hostname === host
      ) {
        return prev;
      }
      return {
        canGoBack: s.canGoBack,
        canGoForward: s.canGoForward,
        hostname: host,
      };
    });
  }, []);

  const handleMessage = useCallback(async (event: WebViewMessageEvent) => {
    let payload: { type?: string; url?: string } | null = null;
    try {
      payload = JSON.parse(event.nativeEvent.data);
    } catch {
      return;
    }
    if (!payload || payload.type !== 'GOOGLE_OAUTH' || !payload.url) return;

    try {
      const result = await WebBrowser.openAuthSessionAsync(
        payload.url,
        OAUTH_REDIRECT,
        { showInRecents: true }
      );

      if (result.type !== 'success' || !result.url) {
        webviewRef.current?.injectJavaScript(
          `window.dispatchEvent(new CustomEvent('WeddingWinOAuthCancelled')); true;`
        );
        return;
      }

      const parsed = new URL(result.url);
      const hash = parsed.hash || '';
      const search = parsed.search || '';

      webviewRef.current?.injectJavaScript(
        `(function(){
          try {
            window.dispatchEvent(new CustomEvent('WeddingWinOAuthCallback', {
              detail: { hash: ${JSON.stringify(hash)}, search: ${JSON.stringify(search)} }
            }));
          } catch(e) {}
        })(); true;`
      );
    } catch {
      webviewRef.current?.injectJavaScript(
        `window.dispatchEvent(new CustomEvent('WeddingWinOAuthCancelled')); true;`
      );
    }
  }, []);

  const handleOpenWindow = useCallback(
    (event: { nativeEvent: { targetUrl?: string } }) => {
      const target = event.nativeEvent.targetUrl;
      if (!target) return;
      webviewRef.current?.injectJavaScript(
        `window.location.href = ${JSON.stringify(target)}; true;`
      );
    },
    []
  );

  const handleLoadStart = useCallback(() => setLoading(true), []);
  const handleLoadEnd = useCallback(() => setLoading(false), []);

  const handleError = useCallback(
    ({ nativeEvent }: { nativeEvent: { description?: string; code?: number } }) => {
      if (nativeEvent.code === -999) return;
      setError(nativeEvent.description || 'Connection failed');
    },
    []
  );

  const reload = useCallback(() => {
    setError(null);
    webviewRef.current?.reload();
  }, []);

  const goBack = useCallback(() => webviewRef.current?.goBack(), []);
  const goForward = useCallback(() => webviewRef.current?.goForward(), []);

  const renderLoading = useMemo(
    () => () =>
      (
        <View style={styles.loading} pointerEvents="none">
          <ActivityIndicator size="large" color={BRAND_COLOR} />
        </View>
      ),
    []
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <Header
        hostname={navState.hostname}
        canGoBack={navState.canGoBack}
        canGoForward={navState.canGoForward}
        onBack={goBack}
        onForward={goForward}
        onReload={reload}
      />

      <View style={styles.webContainer}>
        <WebView
          ref={webviewRef}
          source={SOURCE}
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
          onMessage={handleMessage}
          onNavigationStateChange={handleNavigationStateChange}
          onLoadStart={handleLoadStart}
          onLoadEnd={handleLoadEnd}
          onError={handleError}
          renderLoading={renderLoading}
          style={styles.webview}
        />

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
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 0.5,
    borderBottomColor: '#E5E5EA',
    backgroundColor: '#FFFFFF',
  },
  headerLeft: {
    flexDirection: 'row',
    width: 80,
    gap: 4,
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
  },
  headerRight: {
    width: 80,
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  brand: {
    fontSize: 17,
    fontWeight: '700',
    color: '#1C1C1E',
    letterSpacing: 0.2,
  },
  brandSub: {
    fontSize: 11,
    color: '#8A8A8E',
    marginTop: 1,
  },
  iconButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconButtonDisabled: {
    opacity: 0.4,
  },
  webContainer: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  webview: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  loading: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },
  topLoader: {
    position: 'absolute',
    top: 8,
    right: 12,
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
    color: '#1C1C1E',
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
