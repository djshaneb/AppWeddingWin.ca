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
