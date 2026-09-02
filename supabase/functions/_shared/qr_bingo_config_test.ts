import {
  parseQrBingoEventConfig,
  publicQrBingoEventConfig,
} from "./qr_bingo_config.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function assertThrows(run: () => unknown, expected: RegExp) {
  try {
    run();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    assert(expected.test(message), `Unexpected error: ${message}`);
    return;
  }
  throw new Error("Expected operation to throw.");
}

const validConfig = {
  id: "00000000-0000-4000-8000-000000000001",
  event_key: "niagara-wedding-show-2026",
  revision: 1,
  published: true,
  event_name: "Niagara Wedding Show",
  vendor_tag_id: 30,
  history_starts_at: "2026-08-01T00:00:00.000Z",
  scan_enabled: true,
  vendor_draws_enabled: true,
  email_delivery_mode: "disabled",
  send_vendor_email: true,
  send_couple_email: true,
  vendor_email_subject:
    "WeddingWin QR Bingo Vendor: Winner Contact Information",
  couple_email_subject: "Your name was selected for a QR Bingo booth draw",
  rules_version: "2026-08-28",
  official_rules_url: "https://www.weddingwin.ca/qr-bingo-vendor-draw-rules",
  alternate_free_entry_url: "https://www.weddingwin.ca/qr-bingo-free-entry",
  eligibility_region:
    "Ontario, Canada residents who have reached the age of majority",
  draw_opens_at: "2026-10-18T19:00:00.000Z",
  entry_closes_at: "2026-10-18T19:00:00.000Z",
  draw_at: "2026-10-18T19:00:00.000Z",
};

Deno.test("published QR Bingo config is validated and sanitized", () => {
  const parsed = parseQrBingoEventConfig(validConfig);
  const publicConfig = publicQrBingoEventConfig(parsed);
  assert(publicConfig.revision === 1, "revision should survive sanitization");
  assert(publicConfig.published === true, "published state should be explicit");
  assert(
    publicConfig.vendor_tag_id === 30,
    "vendor tag should survive sanitization",
  );
  assert(!("id" in publicConfig), "internal config id must not be public");
  assert(!("created_by" in publicConfig), "audit actor must not be public");
});

Deno.test("unsafe or unusable QR Bingo configs fail closed", () => {
  assertThrows(
    () =>
      parseQrBingoEventConfig({
        ...validConfig,
        official_rules_url: "http://weddingwin.ca/rules",
      }),
    /HTTPS/,
  );
  for (
    const deceptiveUrl of [
      "https://example.com/rules",
      "https://weddingwin.ca.example.com/rules",
      "https://weddingwin.ca@evil.example/rules",
      "https://weddingwin.ca/rules#unexpected-fragment",
    ]
  ) {
    assertThrows(
      () =>
        parseQrBingoEventConfig({
          ...validConfig,
          official_rules_url: deceptiveUrl,
        }),
      /WeddingWin HTTPS/,
    );
  }
  assertThrows(
    () =>
      parseQrBingoEventConfig({
        ...validConfig,
        email_delivery_mode: "production_verified_fulfillment",
        send_vendor_email: false,
        send_couple_email: false,
      }),
    /recipient channel/,
  );
  assertThrows(
    () =>
      parseQrBingoEventConfig({
        ...validConfig,
        entry_closes_at: "2026-10-19T19:00:00.000Z",
      }),
    /draw time/,
  );
});

Deno.test("website and both app endpoints use the canonical config", async () => {
  const root = new URL("../../../", import.meta.url);
  const [sync, vendor, scanner, admin] = await Promise.all([
    Deno.readTextFile(
      new URL("supabase/functions/bd-qr-bingo-sync/index.ts", root),
    ),
    Deno.readTextFile(
      new URL("supabase/functions/bd-qr-bingo-vendor-sync/index.ts", root),
    ),
    Deno.readTextFile(
      new URL(
        "brilliant-directories/widgets/258-julian-qr-code-bingo.php",
        root,
      ),
    ),
    Deno.readTextFile(
      new URL("supabase/functions/bd-qr-bingo-admin/index.ts", root),
    ),
  ]);

  for (const source of [sync, vendor]) {
    assert(
      source.includes("loadPublishedQrBingoConfig"),
      "Edge endpoint must load canonical config",
    );
    assert(
      source.includes("event_config: eventConfig"),
      "Edge response must expose revision metadata",
    );
    assert(
      source.includes("AsyncLocalStorage<QrBingoEventConfig>"),
      "config must be isolated per concurrent request",
    );
    assert(
      !source.includes('Deno.env.get("QR_BINGO_VENDOR_TAG_ID")'),
      "tag must not fall back to an Edge secret",
    );
  }
  assert(
    scanner.includes("bd-qr-bingo-admin?action=public_config"),
    "website must load public config endpoint",
  );
  assert(
    !scanner.includes("$eventTagId = 30"),
    "website must not hardcode vendor tag 30",
  );
  assert(
    admin.includes("x-ww-signature"),
    "admin endpoint must verify a server signature",
  );
  assert(
    admin.includes("consume_qr_bingo_admin_nonce"),
    "admin endpoint must reject replayed signatures",
  );
});
