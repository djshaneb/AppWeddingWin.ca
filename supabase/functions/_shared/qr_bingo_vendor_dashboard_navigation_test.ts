import {
  isVendorDrawDashboardUrl,
  webViewSubframeUrlAllowed,
  webViewUrlAction,
} from "../../../lib/webview_url_policy.ts";

const source = await Deno.readTextFile(
  new URL("../../../app/(tabs)/index.tsx", import.meta.url),
);
const drawUrl = "https://www.weddingwin.ca/qr-bingo-vendor-draw";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

// Execute the actual app callback bodies with local effects. No React render,
// network, phone, account changes, or privilege-bearing bridge is started.
function callbackBody(name: string) {
  const start = source.indexOf(`const ${name} = useCallback(`);
  const arrow = source.indexOf("=> {", start);
  assert(start >= 0 && arrow > start, `Missing callback ${name}`);
  const bodyStart = arrow + "=> {".length;
  let depth = 1;
  for (let index = bodyStart; index < source.length; index++) {
    if (source[index] === "{") depth++;
    if (source[index] === "}") depth--;
    if (depth === 0) return source.slice(bodyStart, index);
  }
  throw new Error(`Unterminated callback ${name}`);
}

function appCallback(
  name: string,
  argument: string,
  context: Record<string, unknown>,
) {
  return new Function(...Object.keys(context), argument, callbackBody(name))
    .bind(null, ...Object.values(context));
}

function harness(overrides: Record<string, unknown> = {}) {
  let openRequests = 0;
  let generation = 1;
  let navigationIntent = 1;
  let browserHidden = false;
  let loading = true;
  let target: string | null = null;
  const member = { user_id: "39029", account_role: "vendor" };
  const session = {
    user_id: "39029",
    token: "fictional-token-not-a-credential",
  };
  const context: Record<string, unknown> = {
    nativeMemberRef: { current: member },
    nativeBridgeSessionRef: { current: session },
    nativeMember: member,
    nativeBridgeSession: session,
    accountDeletionIsInFlight: () => false,
    logoutInFlightRef: { current: false },
    pendingAppLogoutRef: { current: false },
    memberAccountRole: (value: { account_role?: string }) =>
      value.account_role || "couple",
    hasNativeTokenSession: (value: { user_id?: string; token?: string }) =>
      Boolean(value?.user_id && value?.token),
    hasNativeBridgeSession: (
      value: { user_id?: string; token?: string; cookie?: string },
    ) => Boolean(value?.user_id && (value?.token || value?.cookie)),
    isVendorDrawDashboardUrl,
    historyNavigationTimerRef: { current: null },
    vendorDrawOpenSequenceRef: { current: 0 },
    invalidateNavigationIntent: () => navigationIntent++,
    clearLoadingTimeout() {},
    clearTimeout() {},
    webviewRef: { current: { stopLoading() {} } },
    setPendingDashboardRedirect() {},
    setPendingBridgeTargetPath() {},
    DEFAULT_BRIDGE_TARGET_PATH: "/account/home",
    setShowNativeChat() {},
    setNativeChatThreadOpen() {},
    setError() {},
    setLoading: (value: boolean) => loading = value,
    hideWebsiteBrowser: () => {
      generation++;
      browserHidden = true;
    },
    setVendorDrawOpenRequestId: (value: number) => openRequests = value,
    addDebugLine() {},
    getWeddingWinPath: (url: string) => {
      const parsed = new URL(url);
      return ["www.weddingwin.ca", "weddingwin.ca"].includes(parsed.hostname)
        ? parsed.pathname
        : "";
    },
    isBdAppGoogleLoginUrl: () => false,
    isOAuthStartUrl: () => false,
    isGoogleIdentityUrl: () => false,
    isWeddingWinLogoutActionUrl: () => false,
    isChatInboxPath: () => false,
    isVendorConnectPath: () => false,
    webViewSubframeUrlAllowed,
    webViewUrlAction,
    navigateWebViewTo: (url: string) => target = url,
    ...overrides,
  };
  const open = appCallback("openVendorDrawSettings", "unused", context);
  context.openVendorDrawSettings = open;
  const intercept = appCallback(
    "interceptVendorDrawNavigation",
    "url",
    context,
  );
  context.interceptVendorDrawNavigation = intercept;
  const shouldStart = appCallback("handleShouldStart", "request", context);
  const navigationChanged = appCallback(
    "handleNavigationStateChange",
    "s",
    context,
  );
  const openWindow = appCallback("handleOpenWindow", "event", context);
  const mountedGeneration = generation;
  return {
    intercept,
    shouldStart,
    navigationChanged,
    openWindow,
    fromMountedWebView: (url = drawUrl) =>
      generation === mountedGeneration &&
      shouldStart({ url, isTopFrame: true }),
    state: () => ({
      openRequests,
      generation,
      navigationIntent,
      browserHidden,
      loading,
      target,
    }),
  };
}

Deno.test("only the exact canonical HTTPS vendor-draw route qualifies for native tools", () => {
  for (
    const url of [
      drawUrl,
      `${drawUrl}/`,
      `${drawUrl}?source=dashboard#prize`,
      "https://weddingwin.ca:443/qr-bingo-vendor-draw",
    ]
  ) {
    assert(
      isVendorDrawDashboardUrl(url),
      `Valid dashboard URL rejected: ${url}`,
    );
  }
  for (
    const url of [
      "/qr-bingo-vendor-draw",
      `${drawUrl}-rules`,
      `${drawUrl}/other`,
      `${drawUrl}//`,
      `${drawUrl}?logout=1`,
      `${drawUrl}?ww_app_logout=1`,
      "http://www.weddingwin.ca/qr-bingo-vendor-draw",
      "https://www.weddingwin.ca:444/qr-bingo-vendor-draw",
      "https://user:password@www.weddingwin.ca/qr-bingo-vendor-draw",
      "https://evil.weddingwin.ca/qr-bingo-vendor-draw",
      "https://weddingwin.ca.attacker.example/qr-bingo-vendor-draw",
      "https://wedwebsite.ca/qr-bingo-vendor-draw",
      "https://www.weddingwin.ca/qr-bingo-vendor-draw%2Frules",
      "javascript:nativeVendorBingo()",
      "data:text/html,qr-bingo-vendor-draw",
    ]
  ) {
    assert(
      !isVendorDrawDashboardUrl(url),
      `Untrusted or different URL opened native tools: ${url}`,
    );
  }
});

Deno.test("dashboard taps open native UI once and retire duplicate WebView callbacks synchronously", () => {
  const h = harness();
  for (let tap = 0; tap < 12; tap++) {
    assert(
      h.fromMountedWebView() === false,
      "The vendor dashboard must not load behind the native wizard",
    );
  }
  const state = h.state();
  assert(
    state.openRequests === 1 && state.browserHidden,
    "Repeated taps opened more than one native wizard",
  );
  assert(
    state.generation === 2 && state.navigationIntent === 2 && !state.loading,
    "Native navigation must retire the WebView and invalidate pending browser work",
  );
  assert(
    state.target === null,
    "The draw website must not be loaded by a native-intercepted tap",
  );
  assert(
    /onShouldStartLoadWithRequest=\{\(request\) =>\s*webViewSessionGenerationRef.current === webViewSessionKey &&\s*handleShouldStart\(request\)/
      .test(source) &&
      /hideWebsiteBrowser = useCallback\(\(\) => \{[\s\S]*?advanceWebViewSession\(\);[\s\S]*?setShowBrowser\(false\)/
        .test(source),
    "Production callbacks must use the same synchronous stale-WebView guard tested here",
  );
});

Deno.test("redirect and new-window dashboard URLs open the same native wizard", () => {
  const redirect = harness();
  redirect.navigationChanged({ url: drawUrl });
  assert(
    redirect.state().openRequests === 1,
    "A top-level redirect missed native routing",
  );
  const popup = harness();
  popup.openWindow({ nativeEvent: { targetUrl: drawUrl } });
  assert(
    popup.state().openRequests === 1,
    "A new-window dashboard link missed native routing",
  );
});

Deno.test("handled vendor requests do not replay on menu remount or erase newer requests", () => {
  let pendingRequest = 12;
  const acknowledge = appCallback(
    "acknowledgeVendorDrawOpenRequest",
    "requestId",
    {
      setVendorDrawOpenRequestId: (update: (current: number) => number) => {
        pendingRequest = update(pendingRequest);
      },
    },
  );
  acknowledge(12);
  assert(pendingRequest === 0, "A handled request would replay after remount");
  pendingRequest = 13;
  acknowledge(12);
  assert(
    pendingRequest === 13,
    "A late acknowledgement discarded the next tap",
  );
  acknowledge(13);
  assert(
    Number(pendingRequest) === 0,
    "The newer request must also be consumed",
  );
  const open = callbackBody("openVendorDrawSettings");
  assert(
    open.includes("vendorDrawOpenSequenceRef.current += 1") &&
      open.includes(
        "setVendorDrawOpenRequestId(vendorDrawOpenSequenceRef.current)",
      ) &&
      source.includes(
        "onVendorDrawOpenRequestHandled(vendorDrawOpenRequestId)",
      ) &&
      source.includes(
        "onVendorDrawOpenRequestHandled={acknowledgeVendorDrawOpenRequest}",
      ),
    "Every native open must have a distinct ID acknowledged by the mounted menu",
  );
});

Deno.test("iframe loads and incomplete or non-vendor native sessions retain the normal website route", () => {
  const frame = harness();
  assert(
    frame.shouldStart({ url: drawUrl, isTopFrame: false }) === true,
    "Safe subframes retain their separate policy",
  );
  assert(
    frame.state().openRequests === 0,
    "An iframe must never open vendor tools",
  );
  for (
    const overrides of [
      { nativeMemberRef: { current: null } },
      {
        nativeMemberRef: {
          current: { user_id: "39029", account_role: "couple" },
        },
      },
      {
        nativeMemberRef: {
          current: { user_id: "39030", account_role: "vendor" },
        },
      },
      {
        nativeBridgeSessionRef: {
          current: { user_id: "39029", cookie: "fictional-cookie" },
        },
      },
      { nativeBridgeSessionRef: { current: null } },
      { accountDeletionIsInFlight: () => true },
      { logoutInFlightRef: { current: true } },
      { pendingAppLogoutRef: { current: true } },
    ]
  ) {
    const h = harness(overrides);
    assert(
      h.shouldStart({ url: drawUrl, isTopFrame: true }) === true,
      "Unavailable native vendor context must keep the normal authenticated website fallback",
    );
    assert(
      h.state().openRequests === 0 && !h.state().browserHidden,
      "Wrong account or ending session opened vendor tools",
    );
  }
});

Deno.test("vendor routing adds no postMessage privilege or membership bypass", () => {
  const h = harness();
  assert(
    h.intercept("https://evil.example/qr-bingo-vendor-draw") === false,
    "Untrusted URLs must not open native tools",
  );
  assert(
    h.state().openRequests === 0,
    "Untrusted navigation had a native effect",
  );
  assert(
    source.includes("action: 'vendor_raffle_get'") &&
      source.includes("native_session: nativeSession"),
    "The native wizard must still request authorized vendor data from the backend",
  );
  assert(
    !source.includes("message.type === 'nativeVendorBingo'"),
    "Do not add an unscoped website-to-native privilege command",
  );
  assert(
    webViewUrlAction(drawUrl) === "in-app",
    "Ordinary website routing must remain available when native interception does not apply",
  );
});
