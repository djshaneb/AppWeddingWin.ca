import {
  hostMatchesDomain,
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
    /mediaCapturePermissionGrantType="prompt"/.test(source),
    "website camera and microphone access must require an OS prompt",
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
});
