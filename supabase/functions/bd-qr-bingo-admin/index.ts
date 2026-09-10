import { createClient } from "npm:@supabase/supabase-js@2.58.0";
import {
  handleQrAdminDrawReset,
  QrAdminDrawResetError,
} from "../_shared/qr_bingo_admin_draw_reset.ts";
import {
  handleQrAdminData,
  QrAdminDataError,
} from "../_shared/qr_bingo_admin_data.ts";
import {
  handleQrAdminContactMutation,
  QrAdminContactError,
} from "../_shared/qr_bingo_admin_contacts.ts";
import {
  loadPublishedQrBingoConfig,
  publicQrBingoEventConfig,
} from "../_shared/qr_bingo_config.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ||
  "";
const QR_BINGO_ADMIN_HMAC_SECRET =
  Deno.env.get("QR_BINGO_ADMIN_HMAC_SECRET")?.trim() || "";
const MAX_CLOCK_SKEW_SECONDS = 300;

const admin = SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  : null;

const corsHeaders = {
  "Access-Control-Allow-Origin": "https://www.weddingwin.ca",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, X-WW-Timestamp, X-WW-Nonce, X-WW-Signature",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function requireAdmin() {
  if (!admin) throw new Error("Supabase service role is not configured.");
  return admin;
}

function cleanHeader(request: Request, name: string, max = 256) {
  return String(request.headers.get(name) || "").trim().slice(0, max);
}

function objectValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function plainText(value: unknown, max: number) {
  return typeof value === "string"
    ? value.trim().replace(/ +/g, " ").slice(0, max + 1)
    : "";
}

function exactBoundedText(value: unknown, max: number) {
  return typeof value === "string" && value.length > 0 &&
      value.length <= max && !/[\u0000-\u001f\u007f]/.test(value)
    ? value
    : "";
}

function validOptionalIsoDate(value: string) {
  if (!value) return true;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const candidate = new Date(Date.UTC(year, month - 1, day));
  return candidate.getUTCFullYear() === year &&
    candidate.getUTCMonth() === month - 1 && candidate.getUTCDate() === day;
}

function requiredIsoTimestamp(value: unknown) {
  const normalized = plainText(value, 40);
  if (
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/
      .test(normalized)
  ) {
    return "";
  }
  const milliseconds = new Date(normalized).getTime();
  return Number.isFinite(milliseconds)
    ? new Date(milliseconds).toISOString()
    : "";
}

// Offer versions are PostgreSQL timestamps and may contain six fractional
// digits. Keep the trusted token intact instead of round-tripping through
// JavaScript Date, which would silently discard microseconds.
function requiredExactIsoTimestamp(value: unknown) {
  const normalized = plainText(value, 40);
  if (
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/
      .test(normalized)
  ) {
    return "";
  }
  return Number.isFinite(new Date(normalized).getTime()) ? normalized : "";
}

function validateAlternateEntrySubmission(body: Record<string, unknown>) {
  const submission = objectValue(body.submission);
  const expectedRevision = Number(body.expected_revision);
  const submittedEventRevision = Number(submission?.submitted_event_revision);
  const eventKey = plainText(body.event_key, 100);
  if (!submission) return null;

  const vendorBingoId = plainText(submission.vendor_bingo_id, 20);
  const formInquiryId = plainText(submission.form_inquiry_id, 128);
  const formSubmittedAt = requiredIsoTimestamp(submission.form_submitted_at);
  const submittedRulesVersion = plainText(
    submission.submitted_rules_version,
    80,
  );
  const vendorOfferVersion = requiredExactIsoTimestamp(
    submission.vendor_offer_version,
  );
  const participantResponsibilityDisclosure = exactBoundedText(
    submission.participant_responsibility_disclosure,
    2000,
  );
  const coupleName = plainText(submission.couple_name, 160);
  const coupleEmail = plainText(submission.couple_email, 254).toLowerCase();
  const couplePhone = plainText(submission.couple_phone, 80);
  const coupleWeddingDate = plainText(submission.couple_wedding_date, 10);
  const operatorIdentity = plainText(submission.operator_identity, 160);
  const unsafeText = /[<>\u0000-\u001f\u007f]/;

  if (
    !Number.isSafeInteger(expectedRevision) || expectedRevision < 1 ||
    !Number.isSafeInteger(submittedEventRevision) ||
    submittedEventRevision < 1 ||
    !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(eventKey) ||
    !/^[1-9][0-9]{0,19}$/.test(vendorBingoId) ||
    !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(formInquiryId) ||
    !formSubmittedAt ||
    !participantResponsibilityDisclosure ||
    !/^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/.test(submittedRulesVersion) ||
    !coupleName || coupleName.length > 160 || unsafeText.test(coupleName) ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(coupleEmail) ||
    coupleEmail.length > 254 || unsafeText.test(coupleEmail) ||
    couplePhone.length > 80 || unsafeText.test(couplePhone) ||
    !validOptionalIsoDate(coupleWeddingDate) ||
    operatorIdentity.length < 3 || operatorIdentity.length > 160 ||
    unsafeText.test(operatorIdentity)
  ) return null;

  const confirmations = [
    "age_of_majority_confirmed",
    "eligible_residency_confirmed",
    "not_excluded_confirmed",
    "rules_acknowledged",
    "promotion_responsibility_acknowledged",
    "contact_share_consent_confirmed",
    "apple_non_sponsor_acknowledged",
  ] as const;
  if (confirmations.some((key) => submission[key] !== true)) return null;

  return {
    expectedRevision,
    eventKey,
    vendorBingoId,
    formInquiryId,
    formSubmittedAt,
    submittedEventRevision,
    submittedRulesVersion,
    vendorOfferVersion,
    participantResponsibilityDisclosure,
    coupleName,
    coupleEmail,
    couplePhone,
    coupleWeddingDate,
    contactShareConsentConfirmed: true,
    operatorIdentity,
  };
}

function bytesToHex(bytes: Uint8Array) {
  return Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join(
    "",
  );
}

function constantTimeEqualHex(left: string, right: string) {
  if (left.length !== right.length || !/^[0-9a-f]+$/i.test(left + right)) {
    return false;
  }
  let different = 0;
  for (let index = 0; index < left.length; index += 1) {
    different |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return different === 0;
}

async function hmacSha256Hex(secret: string, payload: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(payload),
  );
  return bytesToHex(new Uint8Array(signature));
}

async function requireSignedAdminRequest(request: Request, rawBody: string) {
  const timestampText = cleanHeader(request, "x-ww-timestamp", 24);
  const nonce = cleanHeader(request, "x-ww-nonce", 128).toLowerCase();
  const signature = cleanHeader(request, "x-ww-signature", 128).toLowerCase();
  const timestamp = Number(timestampText);
  const nowSeconds = Math.floor(Date.now() / 1000);
  if (
    !Number.isSafeInteger(timestamp) ||
    Math.abs(nowSeconds - timestamp) > MAX_CLOCK_SKEW_SECONDS ||
    !/^[0-9a-f]{32,128}$/.test(nonce) ||
    !/^[0-9a-f]{64}$/.test(signature)
  ) {
    throw new Error("QR Bingo admin request signature is invalid.");
  }

  const db = requireAdmin();
  let secret = QR_BINGO_ADMIN_HMAC_SECRET;
  if (!secret) {
    const { data: secretValue, error: secretError } = await db.rpc(
      "get_qr_bingo_admin_hmac_secret",
    );
    if (secretError) {
      throw new Error(
        `QR Bingo admin credential unavailable: ${secretError.message}`,
      );
    }
    secret = typeof secretValue === "string" ? secretValue.trim() : "";
  }
  if (secret.length < 32) {
    throw new Error("QR Bingo admin credential is not configured.");
  }

  const expected = await hmacSha256Hex(
    secret,
    `${timestampText}.${nonce}.${rawBody}`,
  );
  if (!constantTimeEqualHex(expected, signature)) {
    throw new Error("QR Bingo admin request signature is invalid.");
  }

  const expiresAt = new Date((timestamp + MAX_CLOCK_SKEW_SECONDS) * 1000)
    .toISOString();
  const { data: nonceAccepted, error: nonceError } = await db.rpc(
    "consume_qr_bingo_admin_nonce",
    { p_nonce: nonce, p_expires_at: expiresAt },
  );
  if (nonceError) {
    throw new Error(`QR Bingo replay check failed: ${nonceError.message}`);
  }
  if (nonceAccepted !== true) {
    throw new Error("QR Bingo admin request was already used.");
  }
}

async function dashboardStats(
  config: Awaited<ReturnType<typeof loadPublishedQrBingoConfig>>,
) {
  const db = requireAdmin();
  const [
    settings,
    enabled,
    accepted,
    entries,
    alternateEntries,
    pendingNotices,
  ] = await Promise
    .all([
      db.from("qr_bingo_raffle_settings").select("id", {
        count: "exact",
        head: true,
      })
        .eq("event_key", config.event_key),
      db.from("qr_bingo_raffle_settings").select("id", {
        count: "exact",
        head: true,
      })
        .eq("event_key", config.event_key).eq("enabled", true),
      db.from("qr_bingo_raffle_settings").select("id", {
        count: "exact",
        head: true,
      })
        .eq("event_key", config.event_key).eq("legal_terms_accepted", true),
      db.from("qr_bingo_raffle_entries").select("id", {
        count: "exact",
        head: true,
      })
        .eq("event_key", config.event_key),
      db.from("qr_bingo_raffle_entries").select("id", {
        count: "exact",
        head: true,
      })
        .eq("event_key", config.event_key)
        .eq("entry_method", "alternate_free_entry"),
      db.from("qr_bingo_raffle_draws").select(
        "vendor_email_sent_at,couple_email_sent_at",
      )
        .eq("event_key", config.event_key).eq("selection_status", "verified"),
    ]);
  for (
    const result of [
      settings,
      enabled,
      accepted,
      entries,
      alternateEntries,
      pendingNotices,
    ]
  ) {
    if (result.error) throw result.error;
  }
  return {
    vendors_configured: settings.count || 0,
    vendors_enabled: enabled.count || 0,
    vendors_terms_accepted: accepted.count || 0,
    entries: entries.count || 0,
    alternate_entries_reconciled: alternateEntries.count || 0,
    verified_notices_pending:
      (pendingNotices.data || []).filter((row) =>
        (config.send_vendor_email && !row.vendor_email_sent_at) ||
        (config.send_couple_email && !row.couple_email_sent_at)
      ).length,
  };
}

async function alternateEntryReconciliationStatus(
  config: Awaited<ReturnType<typeof loadPublishedQrBingoConfig>>,
) {
  const db = requireAdmin();
  const [declarationResult, reconciliationResult] = await Promise.all([
    db.from("qr_bingo_alternate_entry_reconciliation_closures")
      .select(
        "event_revision,entry_closes_at,declared_at,declared_by,attestation_version,all_timely_submissions_reviewed",
      )
      .eq("event_key", config.event_key)
      .eq("event_revision", config.revision)
      .order("declared_at", { ascending: false })
      .limit(1),
    db.from("qr_bingo_raffle_entries")
      .select("reconciled_at")
      .eq("event_key", config.event_key)
      .eq("entry_method", "alternate_free_entry")
      .order("reconciled_at", { ascending: false })
      .limit(1),
  ]);
  if (declarationResult.error) throw declarationResult.error;
  if (reconciliationResult.error) throw reconciliationResult.error;

  const declaration = declarationResult.data?.[0] || null;
  const latestReconciledAt = String(
    reconciliationResult.data?.[0]?.reconciled_at || "",
  );
  let staleReason: string | null = null;
  if (!declaration) staleReason = "not_declared";
  else if (Date.now() < new Date(config.entry_closes_at).getTime()) {
    staleReason = "entry_period_open";
  } else if (
    latestReconciledAt &&
    new Date(latestReconciledAt).getTime() >
      new Date(String(declaration.declared_at)).getTime()
  ) {
    staleReason = "reconciliation_recorded_after_declaration";
  }

  return {
    event_revision: config.revision,
    entry_closes_at: config.entry_closes_at,
    declared_at: declaration?.declared_at || null,
    declared_by: declaration?.declared_by || null,
    attestation_version: declaration?.attestation_version || "2026-08-30",
    all_timely_submissions_reviewed:
      declaration?.all_timely_submissions_reviewed === true,
    latest_reconciled_at: latestReconciledAt || null,
    stale: staleReason !== null,
    stale_reason: staleReason,
    draw_selection_allowed: staleReason === null,
  };
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    if (request.method === "GET") {
      const action = new URL(request.url).searchParams.get("action") ||
        "public_config";
      if (action !== "public_config") {
        return jsonResponse({
          ok: false,
          error: "Unsupported QR Bingo admin action.",
        }, 400);
      }
      const config = await loadPublishedQrBingoConfig(requireAdmin());
      return jsonResponse({
        ok: true,
        event_config: publicQrBingoEventConfig(config),
      });
    }

    if (request.method !== "POST") {
      return jsonResponse({ ok: false, error: "Method not allowed." }, 405);
    }

    const rawBody = await request.text();
    await requireSignedAdminRequest(request, rawBody);
    const body = JSON.parse(rawBody || "{}") as Record<string, unknown>;
    const action = String(body.action || "");

    if (action === "draw_reset") {
      try {
        return jsonResponse(await handleQrAdminDrawReset(requireAdmin(), body));
      } catch (error) {
        if (error instanceof QrAdminDrawResetError) {
          return jsonResponse({
            ok: false,
            code: error.code,
            error: error.message,
          }, error.status);
        }
        throw error;
      }
    }

    if (["contact_add", "contact_remove", "contact_restore"].includes(action)) {
      try {
        return jsonResponse(
          await handleQrAdminContactMutation(requireAdmin(), body),
        );
      } catch (error) {
        if (error instanceof QrAdminContactError) {
          return jsonResponse({
            ok: false,
            code: error.code,
            error: error.message,
            ...(error.current_version === undefined
              ? {}
              : { current_version: error.current_version }),
          }, error.status);
        }
        throw error;
      }
    }

    if (["data_list", "data_export", "data_export_audit"].includes(action)) {
      try {
        return jsonResponse(await handleQrAdminData(requireAdmin(), body));
      } catch (error) {
        if (error instanceof QrAdminDataError) {
          return jsonResponse(
            { ok: false, error: error.message },
            error.status,
          );
        }
        throw error;
      }
    }

    if (action === "admin_get") {
      const config = await loadPublishedQrBingoConfig(requireAdmin());
      return jsonResponse({
        ok: true,
        event_config: publicQrBingoEventConfig(config),
        stats: await dashboardStats(config),
      });
    }

    if (
      action === "declare_alternate_entry_reconciliation_complete" ||
      action === "reconcile_alternate_free_entry"
    ) {
      return jsonResponse({
        ok: false,
        code: "offsite_entry_retired",
        error:
          "Off-site entry is retired. Vendor draws are available only after a couple visits the booth and scans its QR code at the wedding show.",
      }, 410);
    }

    if (action === "declare_alternate_entry_reconciliation_complete") {
      const config = await loadPublishedQrBingoConfig(requireAdmin());
      const eventKey = plainText(body.event_key, 100);
      const expectedRevision = Number(body.expected_revision);
      const operatorIdentity = plainText(body.operator_identity, 160);
      if (
        eventKey !== config.event_key ||
        !Number.isSafeInteger(expectedRevision) || expectedRevision < 1 ||
        operatorIdentity.length < 3 ||
        /[<>\u0000-\u001f\u007f]/.test(operatorIdentity) ||
        body.all_timely_submissions_reviewed !== true
      ) {
        return jsonResponse({
          ok: false,
          code: "closure_attestation_required",
          error:
            "Confirm that every timely Form 354 submission was reviewed and enter a valid operator identity.",
        }, 400);
      }
      const { data, error } = await requireAdmin().rpc(
        "declare_qr_bingo_alternate_entry_reconciliation_complete",
        {
          p_event_key: eventKey,
          p_expected_revision: expectedRevision,
          p_all_timely_submissions_reviewed: true,
          p_actor: `brilliant-directories-admin:${operatorIdentity}`,
        },
      );
      if (error) {
        console.error("alternate-entry reconciliation closure RPC failed", {
          code: error.code,
          message: error.message,
        });
        return jsonResponse({
          ok: false,
          code: "closure_unavailable",
          error: "The reconciliation declaration could not be recorded safely.",
        }, 503);
      }
      const result = objectValue(data) || {};
      if (result.ok !== true) {
        const code = String(result.code || "closure_rejected");
        return jsonResponse(
          {
            ok: false,
            code,
            error: String(
              result.error || "The reconciliation declaration was rejected.",
            ),
          },
          code === "stale_event_config"
            ? 409
            : code === "entry_period_open"
            ? 422
            : 400,
        );
      }
      return jsonResponse({
        ok: true,
        alternate_entry_reconciliation: result,
        message:
          "The Form 354 queue completion attestation was recorded for this exact event revision.",
      });
    }

    if (action === "reconcile_alternate_free_entry") {
      const alternateSubmission = objectValue(body.submission);
      if (
        !alternateSubmission ||
        !requiredExactIsoTimestamp(alternateSubmission.vendor_offer_version) ||
        !exactBoundedText(
          alternateSubmission.participant_responsibility_disclosure,
          2000,
        )
      ) {
        return jsonResponse({
          ok: false,
          code: "stale_vendor_offer",
          error:
            "The exact vendor offer version is missing or invalid. Reload the Form 354 record and the current offers before retrying.",
        }, 409);
      }
      const validated = validateAlternateEntrySubmission(body);
      if (!validated) {
        return jsonResponse({
          ok: false,
          code: "invalid_submission",
          error:
            "Enter valid Form 354 details and confirm every eligibility and disclosure item.",
        }, 400);
      }

      const { data, error } = await requireAdmin().rpc(
        "reconcile_qr_bingo_alternate_free_entry",
        {
          p_event_key: validated.eventKey,
          p_expected_revision: validated.expectedRevision,
          p_submitted_event_revision: validated.submittedEventRevision,
          p_vendor_bingo_id: validated.vendorBingoId,
          p_form_inquiry_id: validated.formInquiryId,
          p_form_submitted_at: validated.formSubmittedAt,
          p_submitted_rules_version: validated.submittedRulesVersion,
          p_vendor_offer_version: validated.vendorOfferVersion,
          p_participant_responsibility_disclosure:
            validated.participantResponsibilityDisclosure,
          p_couple_name: validated.coupleName,
          p_couple_email: validated.coupleEmail,
          p_couple_phone: validated.couplePhone,
          p_couple_wedding_date: validated.coupleWeddingDate,
          p_age_of_majority_confirmed: true,
          p_eligible_residency_confirmed: true,
          p_not_excluded_confirmed: true,
          p_rules_acknowledged: true,
          p_promotion_responsibility_acknowledged: true,
          p_contact_share_consent_confirmed:
            validated.contactShareConsentConfirmed,
          p_apple_non_sponsor_acknowledged: true,
          p_actor: `brilliant-directories-admin:${validated.operatorIdentity}`,
        },
      );
      if (error) {
        console.error("alternate free-entry reconciliation RPC failed", {
          code: error.code,
          message: error.message,
        });
        const staleVendorOffer = String(error.message || "").includes(
          "stale_vendor_offer",
        );
        return jsonResponse({
          ok: false,
          code: staleVendorOffer
            ? "stale_vendor_offer"
            : "reconciliation_unavailable",
          error: staleVendorOffer
            ? "The vendor offer changed. Reload and verify the immutable Form 354 offer details."
            : "The inquiry could not be reconciled safely. No entry or scan progress was changed.",
        }, staleVendorOffer ? 409 : 503);
      }

      const result = objectValue(data) || {};
      if (result.ok !== true) {
        const code = String(result.code || "reconciliation_rejected");
        const conflictCodes = new Set([
          "duplicate_source",
          "duplicate_entry",
          "stale_event_config",
          "stale_form_rules",
          "stale_vendor_offer",
        ]);
        const unavailableCodes = new Set([
          "event_unavailable",
          "draws_disabled",
          "entry_not_open",
          "entry_closed",
          "unknown_vendor",
          "draw_not_enabled",
          "vendor_terms_stale",
        ]);
        const status = conflictCodes.has(code)
          ? 409
          : unavailableCodes.has(code)
          ? 422
          : 400;
        return jsonResponse({
          ok: false,
          code,
          error: String(
            result.error ||
              "The inquiry did not meet the current reconciliation requirements.",
          ),
        }, status);
      }

      return jsonResponse({
        ok: true,
        reconciliation: result,
        message:
          "The validated Form 354 inquiry was added to this vendor draw without creating QR scan or Bingo progress.",
      });
    }

    if (action === "publish") {
      const expectedRevision = Number(body.expected_revision);
      if (!Number.isSafeInteger(expectedRevision) || expectedRevision <= 0) {
        return jsonResponse({
          ok: false,
          error: "A valid expected revision is required.",
        }, 400);
      }
      if (
        !body.config || typeof body.config !== "object" ||
        Array.isArray(body.config)
      ) {
        return jsonResponse({
          ok: false,
          error: "A valid configuration is required.",
        }, 400);
      }

      const currentConfig = await loadPublishedQrBingoConfig(requireAdmin());
      const requestedConfig = body.config as Record<string, unknown>;
      if (
        requestedConfig.event_key &&
        String(requestedConfig.event_key) !== currentConfig.event_key
      ) {
        return jsonResponse({
          ok: false,
          error:
            "The active QR Bingo event key cannot be changed from this panel.",
        }, 400);
      }

      const { data, error } = await requireAdmin().rpc(
        "publish_qr_bingo_event_config",
        {
          p_expected_revision: expectedRevision,
          p_config: { ...requestedConfig, event_key: currentConfig.event_key },
          p_actor: "brilliant-directories-admin",
        },
      );
      if (error) {
        const conflict = /revision|stale|conflict/i.test(error.message || "");
        return jsonResponse(
          {
            ok: false,
            conflict,
            error: conflict
              ? "Settings changed in another session. Reload and review the latest revision."
              : error.message,
          },
          conflict ? 409 : 400,
        );
      }
      const publishResult = data && typeof data === "object"
        ? data as Record<string, unknown>
        : {};
      if (publishResult.ok === false) {
        const conflict = publishResult.conflict === true;
        return jsonResponse({
          ok: false,
          conflict,
          error: conflict
            ? "Settings changed in another session. Reload and review the latest revision."
            : String(
              publishResult.error ||
                "QR Bingo settings could not be published.",
            ),
        }, conflict ? 409 : 400);
      }
      const config = await loadPublishedQrBingoConfig(requireAdmin());
      return jsonResponse({
        ok: true,
        event_config: publicQrBingoEventConfig(config),
        published: data,
        stats: await dashboardStats(config),
      });
    }

    return jsonResponse({
      ok: false,
      error: "Unsupported QR Bingo admin action.",
    }, 400);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const unauthorized = /signature|credential|already used|replay/i.test(
      message,
    );
    console.error("bd-qr-bingo-admin request failed", { message });
    return jsonResponse(
      {
        ok: false,
        error: unauthorized
          ? "QR Bingo admin authorization failed."
          : "QR Bingo configuration is unavailable.",
      },
      unauthorized ? 401 : 503,
    );
  }
});
