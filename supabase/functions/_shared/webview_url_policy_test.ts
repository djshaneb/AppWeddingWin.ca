import {
  hostMatchesDomain,
  qrPayloadUrlAllowed,
  webViewSubframeUrlAllowed,
  webViewUrlAction,
} from "../../../lib/webview_url_policy.ts";

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

Deno.test("WebView allows only WeddingWin and WedWebsite HTTPS origins", () => {
  for (const url of [
    "https://weddingwin.ca/account/home",
    "https://www.weddingwin.ca/vendor/connect",
    "https://couple.wedwebsite.ca/",
    "https://wedwebsite.ca/",
  ]) {
    assert(webViewUrlAction(url) === "in-app", `${url} should stay in app`);
  }
  assert(webViewUrlAction("about:blank") === "in-app", "blank window bootstrap should be allowed");
});

Deno.test("deceptive and unrelated HTTPS hosts leave the WebView", () => {
  for (const url of [
    "https://evilweddingwin.ca/account/home",
    "https://weddingwin.ca.attacker.example/",
    "https://wedwebsite.ca.attacker.example/",
    "https://example.com/terms",
  ]) {
    assert(webViewUrlAction(url) === "system-browser", `${url} should use the system browser`);
  }
  assert(!hostMatchesDomain("evilweddingwin.ca", "weddingwin.ca"), "suffix lookalike must not match");
});

Deno.test("insecure and active-content navigation fails closed", () => {
  for (const url of [
    "http://weddingwin.ca/",
    "data:text/html,<script>alert(1)</script>",
    "javascript:alert(1)",
    "file:///etc/passwd",
    "custom-scheme://payload",
  ]) {
    assert(webViewUrlAction(url) === "block", `${url} should be blocked`);
  }
  assert(webViewUrlAction("mailto:hello@weddingwin.ca") === "external-app", "mailto should leave the app");
  assert(webViewUrlAction("tel:+15551234567") === "external-app", "telephone links should leave the app");
});

Deno.test("safe HTTPS subframes stay embedded while unsafe schemes fail closed", () => {
  assert(
    webViewSubframeUrlAllowed("https://player.vimeo.com/video/123"),
    "Vimeo HTTPS iframe should stay inside the WebView",
  );
  assert(webViewSubframeUrlAllowed("about:blank"), "blank iframe bootstrap should be allowed");

  for (const url of [
    "http://player.vimeo.com/video/123",
    "javascript:alert(1)",
    "data:text/html,<script>alert(1)</script>",
    "file:///etc/passwd",
  ]) {
    assert(!webViewSubframeUrlAllowed(url), `${url} subframe should be blocked`);
  }

  assert(
    webViewUrlAction("https://player.vimeo.com/video/123") === "system-browser",
    "Vimeo top-level navigation should still leave the WebView",
  );
  assert(
    webViewUrlAction("https://weddingwin.ca.attacker.example/") === "system-browser",
    "deceptive top-level host should still leave the WebView",
  );
});

Deno.test("production QR payloads accept only canonical WeddingWin booth URLs", () => {
  for (const payload of [
    "https://www.weddingwin.ca/qr?vendor_id=38970",
    "https://weddingwin.ca/qr/?vendor_id=16849",
  ]) {
    assert(qrPayloadUrlAllowed(payload), `${payload} should be accepted as a QR payload`);
  }
  for (const payload of [
    "38970",
    "NWS25-002",
    "nws://vendor/38970",
    "https://www.weddingwin.ca/vendor/example",
    "https://www.weddingwin.ca/qr",
    "https://www.weddingwin.ca/qr?vendor_id=",
    "https://www.weddingwin.ca/qr?vendor_id=0",
    "https://www.weddingwin.ca/qr?vendor_id=38970&vendor_id=16849",
    "https://www.weddingwin.ca/qr?vendor_id=999&vendor=38970",
    "https://www.weddingwin.ca/qr?vendor=38970",
    "https://www.weddingwin.ca/qr?vendor_id=38970#vendor_id=16849",
    "https://user:password@www.weddingwin.ca/qr?vendor_id=38970",
    "https://www.weddingwin.ca:444/qr?vendor_id=38970",
    "https://evil.weddingwin.ca/qr?vendor_id=38970",
    "https://attacker.example/qr?vendor_id=38970",
    "http://weddingwin.ca/qr?vendor_id=38970",
    "javascript:38970",
    "data:text/plain,38970",
    "nws://attacker/38970",
  ]) {
    assert(!qrPayloadUrlAllowed(payload), `${payload} should be rejected as a QR payload`);
  }
});

Deno.test("WebView release configuration disables third-party cookies and keeps the Meta Pixel block", async () => {
  const source = await Deno.readTextFile(
    new URL("../../../app/(tabs)/index.tsx", import.meta.url),
  );
  assert(/thirdPartyCookiesEnabled=\{false\}/.test(source), "third-party cookies must remain disabled");
  assert(
    source.includes("connect\\\\.facebook\\\\.net") && source.includes("fbevents\\\\.js"),
    "Meta Pixel script interception must remain installed",
  );
  assert(/webViewUrlAction\(url\)/.test(source), "top-level navigation must use the URL policy");
  assert(/webViewUrlAction\(target\)/.test(source), "new windows must use the URL policy");
  assert(
    source.includes("request.isTopFrame === false") &&
      source.includes("webViewSubframeUrlAllowed(url)"),
    "non-top-frame navigation must use the HTTPS-only subframe policy",
  );
  assert(
    source.indexOf("blocked signed-in website authentication request") <
      source.indexOf("request.isTopFrame === false"),
    "signed-in OAuth and Google blocks must run before subframe allowance",
  );
  assert(
    /originWhitelist=\{\['\*'\]\}/.test(source),
    "every navigation must reach the centralized URL policy instead of WebView's Linking fallback",
  );
  assert(
    /mediaCapturePermissionGrantType="deny"/.test(source),
    "the embedded website must not request camera or microphone access",
  );
  assert(
    source.includes("host === backendHost") &&
      source.includes("https://pszcjoyabwvzsxxjtkhs.supabase.co"),
    "OAuth interception and WebView origins must be scoped to this Supabase project",
  );
  assert(
    source.includes("isTrustedWebsiteBridgeUrl(event.nativeEvent.url)") &&
      source.includes("message.bridge_nonce !== websiteBridgeNonceRef.current"),
    "the native bridge must validate both source origin and a one-time nonce",
  );
  assert(
    source.includes("isGoogleIdentityUrl(url)") &&
      source.includes("isGoogleIdentityUrl(target)"),
    "unsolicited Google identity navigations and popup windows must stay out of Safari",
  );
  assert(
    source.includes("blocked signed-in website authentication request") &&
      source.includes("blocked signed-in website authentication window") &&
      source.match(
        /isBdAppGoogleLoginUrl\((url|target)\) \|\| isOAuthStartUrl\(\1\) \|\| isGoogleIdentityUrl\(\1\)/g,
      )?.length === 2,
    "a signed-in website must not launch app Google, Supabase OAuth, or Google identity flows",
  );
  assert(
    source.includes("WebBrowser.openAuthSessionAsync") &&
      source.includes("buildNativeGoogleStartUrl"),
    "the explicit native Google sign-in flow must remain available",
  );
});

Deno.test("iOS release metadata declares only the native camera capability", async () => {
  const config = JSON.parse(
    await Deno.readTextFile(new URL("../../../app.json", import.meta.url)),
  ) as {
    expo?: {
      ios?: { infoPlist?: Record<string, unknown> };
      plugins?: unknown[];
    };
  };
  const infoPlist = config.expo?.ios?.infoPlist || {};
  const cameraPlugin = config.expo?.plugins?.find((plugin) =>
    Array.isArray(plugin) && plugin[0] === "expo-camera"
  );

  assert(
    typeof infoPlist.NSCameraUsageDescription === "string" &&
      infoPlist.NSCameraUsageDescription.length > 0,
    "the native QR scanner must retain a camera usage description",
  );
  assert(!("NSMicrophoneUsageDescription" in infoPlist), "the app does not capture microphone input");
  assert(
    Array.isArray(cameraPlugin) &&
      typeof cameraPlugin[1] === "object" &&
      cameraPlugin[1] !== null &&
      (cameraPlugin[1] as Record<string, unknown>).microphonePermission === false &&
      (cameraPlugin[1] as Record<string, unknown>).recordAudioAndroid === false,
    "the camera config plugin must not add microphone permissions during native generation",
  );
  assert(!("NSPhotoLibraryUsageDescription" in infoPlist), "the app does not access the photo library");
  assert(
    !(Array.isArray(infoPlist.UIBackgroundModes) && infoPlist.UIBackgroundModes.length > 0),
    "ordinary push notifications must not declare silent background processing",
  );
});
