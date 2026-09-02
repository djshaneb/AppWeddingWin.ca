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

  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return false;
  }

  const normalizedPath = parsed.pathname.replace(/\/+$/, "") || "/";
  const vendorIds = parsed.searchParams.getAll("vendor_id");
  const queryEntries = Array.from(parsed.searchParams.entries());
  const qrHost = parsed.hostname.toLowerCase();
  return parsed.protocol.toLowerCase() === "https:" &&
    (qrHost === "weddingwin.ca" || qrHost === "www.weddingwin.ca") &&
    !parsed.username &&
    !parsed.password &&
    !parsed.hash &&
    (parsed.port === "" || parsed.port === "443") &&
    normalizedPath === "/qr" &&
    queryEntries.length === 1 &&
    queryEntries[0][0] === "vendor_id" &&
    vendorIds.length === 1 &&
    /^[1-9][0-9]{0,19}$/.test(vendorIds[0]);
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
