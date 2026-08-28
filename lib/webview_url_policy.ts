export type WebViewUrlAction = "in-app" | "system-browser" | "external-app" | "block";

export function hostMatchesDomain(host: unknown, domain: string) {
  const normalizedHost = String(host || "").replace(/\.$/, "").toLowerCase();
  const normalizedDomain = domain.toLowerCase();
  return normalizedHost === normalizedDomain || normalizedHost.endsWith(`.${normalizedDomain}`);
}

export function isWeddingWinHost(host: unknown) {
  return hostMatchesDomain(host, "weddingwin.ca");
}

export function isWedWebsiteHost(host: unknown) {
  return hostMatchesDomain(host, "wedwebsite.ca");
}

export function qrPayloadUrlAllowed(value: unknown) {
  const raw = String(value || "").trim();
  if (!raw) return false;
  if (/^nws25[-_:]\s*\d{3}$/i.test(raw)) return true;

  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    // Plain vendor ids remain compatible, but malformed URL-like payloads do
    // not get to smuggle a trusted vendor id through a query string.
    return !/^[a-z][a-z0-9+.-]*:/i.test(raw);
  }

  const protocol = parsed.protocol.toLowerCase();
  if (protocol === "https:") return isWeddingWinHost(parsed.hostname);
  return protocol === "nws:" && parsed.hostname.toLowerCase() === "vendor";
}

export function webViewSubframeUrlAllowed(value: unknown) {
  const raw = String(value || "").trim();
  if (raw === "about:blank") return true;

  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return false;
  }

  // Embedded account pages legitimately use third-party HTTPS iframes (for
  // example Vimeo). Keep those subframes inside the WebView, while refusing
  // insecure and active-content schemes. Top-frame navigation still uses the
  // stricter host policy in webViewUrlAction.
  return parsed.protocol.toLowerCase() === "https:";
}

export function webViewUrlAction(value: unknown): WebViewUrlAction {
  const raw = String(value || "").trim();
  if (raw === "about:blank") return "in-app";

  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return "block";
  }

  const protocol = parsed.protocol.toLowerCase();
  if (protocol === "https:") {
    return isWeddingWinHost(parsed.hostname) || isWedWebsiteHost(parsed.hostname)
      ? "in-app"
      : "system-browser";
  }
  if (["mailto:", "tel:", "sms:", "itms-apps:", "itms-appss:", "maps:"].includes(protocol)) {
    return "external-app";
  }
  return "block";
}
