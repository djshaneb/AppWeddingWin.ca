// Administrative demonstration provenance is never vendor or couple consent.
export const SYNTHETIC_FIXTURE_EVENT_KEY = "app-review-willow-demo-2026-38970";
export const SYNTHETIC_FIXTURE_PREVIOUS_EVENT_KEY = "app-review-weddingwin-2026-38970";
export const SYNTHETIC_FIXTURE_PREVIOUS_ID = "623e7f5c-5d47-46dc-9d58-1df9e192667f";
export const SYNTHETIC_FIXTURE_VENDOR_NAME = "Willow & Bloom Floral Studio";
export const SYNTHETIC_FIXTURE_PRIZE_TITLE = "Floral design consultation — demonstration";
export const SYNTHETIC_FIXTURE_PRIZE_DESCRIPTION = "Fictional demonstration only. No prize, booking, entry, winner or external message is created.";
export const SYNTHETIC_FIXTURE_DISCLOSURE = "This is a nonbinding WeddingWin demonstration for John and Jane with Willow & Bloom Floral Studio. No legal agreement, draw entry, prize, booking, winner or external message is created. Choose No to keep only the sample scan.";
export const SYNTHETIC_FIXTURE_DISPLAY_ONLY_MESSAGE = "This nonbinding demonstration is for viewing only. No draw entry or winner can be created.";

type Row = Record<string, unknown>;
type PublishedConfig = { event_key: string; rules_version: string; revision: number };
export type SyntheticFixtureSetup = Row & {
  id: string;
  fixture_id: string;
  event_key: string;
  vendor_offer_version: string;
};

function row(value: unknown): Row {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Row : {};
}
function uuid(value: unknown) {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
function timestamp(value: unknown) {
  return typeof value === "string" && value.trim() !== "" ? Date.parse(value) : NaN;
}
function blank(value: unknown) { return value === null || value === undefined || value === ""; }

/** Caller must load the fixture and setup from their authoritative service-only tables. */
export function syntheticFixtureContextMatches(
  fixtureValue: unknown, setupValue: unknown, authenticatedMemberId: string,
  publishedConfig: PublishedConfig, now = Date.now(),
): boolean {
  const fixture = row(fixtureValue), setup = row(setupValue);
  return Boolean(
    ["38971", "38970"].includes(authenticatedMemberId) &&
    fixture.couple_bd_user_id === "38971" && fixture.vendor_bd_user_id === "38970" && fixture.vendor_bingo_id === "38970" &&
    setup.couple_bd_user_id === "38971" && setup.vendor_bd_user_id === "38970" && setup.vendor_bingo_id === "38970" &&
    fixture.enabled === true && fixture.allow_early_draw === false && fixture.suppress_outbound_email === true && blank(fixture.primary_superseded_at) &&
    !Object.hasOwn(fixture, "outbound_recipient_email") &&
    uuid(fixture.id) && uuid(setup.id) && uuid(setup.request_id) && uuid(setup.previous_fixture_id) &&
    fixture.synthetic_fixture_setup_id === setup.id && fixture.id === setup.fixture_id && fixture.id !== setup.previous_fixture_id &&
    fixture.event_key === SYNTHETIC_FIXTURE_EVENT_KEY && fixture.event_key !== publishedConfig.event_key &&
    setup.event_key === fixture.event_key && setup.previous_event_key === SYNTHETIC_FIXTURE_PREVIOUS_EVENT_KEY &&
    setup.previous_event_key !== publishedConfig.event_key && setup.previous_fixture_id === SYNTHETIC_FIXTURE_PREVIOUS_ID &&
    setup.published_config_revision === publishedConfig.revision && setup.rules_version === publishedConfig.rules_version &&
    fixture.vendor_name === SYNTHETIC_FIXTURE_VENDOR_NAME && setup.vendor_name === SYNTHETIC_FIXTURE_VENDOR_NAME &&
    setup.provenance === "synthetic_fixture_setup" && typeof setup.operator_identity === "string" && setup.operator_identity.trim().length > 0 &&
    typeof setup.reason === "string" && setup.reason.trim().length > 0 &&
    timestamp(setup.created_at) <= now && setup.created_at === setup.vendor_offer_version &&
    timestamp(setup.expires_at) <= timestamp(setup.created_at) + 7 * 24 * 60 * 60 * 1000 &&
    timestamp(setup.expires_at) > now && timestamp(fixture.expires_at) === timestamp(setup.expires_at) &&
    setup.prize_title === SYNTHETIC_FIXTURE_PRIZE_TITLE && setup.prize_description === SYNTHETIC_FIXTURE_PRIZE_DESCRIPTION &&
    setup.prize_approx_value_cad === 0 && setup.participant_disclosure === SYNTHETIC_FIXTURE_DISCLOSURE
  );
}

export function syntheticFixtureOfferMatches(
  settingsValue: unknown, snapshotValue: unknown, fixtureValue: unknown, setupValue: unknown,
  authenticatedCoupleId: string, publishedConfig: PublishedConfig, now = Date.now(),
): boolean {
  if (authenticatedCoupleId !== "38971" || !syntheticFixtureContextMatches(fixtureValue, setupValue, authenticatedCoupleId, publishedConfig, now)) return false;
  const settings = row(settingsValue), snapshot = row(snapshotValue), setup = row(setupValue);
  for (const value of [settings, snapshot]) {
    if (value.synthetic_fixture_setup_id !== setup.id || value.event_key !== setup.event_key ||
      value.vendor_bd_user_id !== "38970" || value.vendor_bingo_id !== "38970" || value.vendor_name !== SYNTHETIC_FIXTURE_VENDOR_NAME ||
      value.enabled !== false || value.prize_title !== SYNTHETIC_FIXTURE_PRIZE_TITLE || value.prize_description !== SYNTHETIC_FIXTURE_PRIZE_DESCRIPTION ||
      value.prize_approx_value_cad !== 0 || value.participant_responsibility_disclosure_text !== SYNTHETIC_FIXTURE_DISCLOSURE ||
      !blank(value.vendor_responsibility_disclosure_text) || !blank(value.vendor_responsibility_version) ||
      value.legal_terms_accepted !== false || !blank(value.legal_terms_accepted_at) || !blank(value.rules_viewed_at) ||
      value.vendor_responsibility_acknowledged !== false || !blank(value.vendor_responsibility_acknowledged_at) ||
      value.apple_non_sponsor_acknowledged !== false || value.prize_provider_name !== SYNTHETIC_FIXTURE_VENDOR_NAME ||
      value.official_rules_url !== setup.official_rules_url || value.entry_closes_at !== setup.expires_at ||
      value.draw_opens_at !== setup.expires_at || value.draw_at !== setup.expires_at ||
      value.max_winners !== 1 || value.exclude_previous_winners !== true) return false;
  }
  return Boolean(
    settings.updated_at === setup.vendor_offer_version && snapshot.vendor_offer_version === setup.vendor_offer_version &&
    snapshot.offer_enterable === false && snapshot.activation_excluded_as_legacy_qa === false &&
    snapshot.event_revision === setup.published_config_revision && snapshot.rules_version === setup.rules_version &&
    settings.legal_terms_version === setup.rules_version &&
    settings.legal_terms_accepted === false && blank(settings.legal_terms_accepted_at) && blank(settings.rules_viewed_at) &&
    settings.vendor_responsibility_acknowledged === false && blank(settings.vendor_responsibility_acknowledged_at) &&
    settings.apple_non_sponsor_acknowledged === false &&
    timestamp(snapshot.entry_closes_at) > now
  );
}

export function syntheticFixtureActionIsBlocked(action: string): boolean {
  return ["raffle_opt_in", "vendor_raffle_update", "vendor_raffle_draw", "vendor_raffle_replace",
    "vendor_raffle_review", "vendor_raffle_entry_update", "vendor_raffle_send_notice"].includes(action);
}
