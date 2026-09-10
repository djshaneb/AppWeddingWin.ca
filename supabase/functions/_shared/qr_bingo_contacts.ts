import { normalizeContactEmail } from "./contact_email.ts";
import {
  type BdWeddingDateCall,
  BdWeddingDateSyncError,
  syncExistingBdWeddingDateMetadata,
} from "./bd_wedding_date.ts";

export type QrContactProfile = {
  event_key: string;
  couple_id: string;
  name: string;
  email: string;
  phone: string;
  wedding_date: string;
  wedding_venue: string;
  version: number;
  saved: boolean;
  complete: boolean;
  missing_fields: string[];
  updated_at: string | null;
  date_sync_pending: boolean;
};
export class QrContactError extends Error {
  constructor(
    message: string,
    public code = "contact_profile_invalid",
    public status = 400,
    public diagnostic?: string,
  ) {
    super(message);
    this.name = "QrContactError";
  }
}
export function qrContactDirectEmail(value: unknown) {
  if (typeof value !== "string" || /[\u0000-\u001f\u007f,;]/.test(value)) {
    throw new QrContactError("Enter a valid contact email.");
  }
  let email = "";
  try {
    email = normalizeContactEmail(value);
  } catch {
    throw new QrContactError("Enter a valid contact email.");
  }
  if (email.endsWith("@privaterelay.appleid.com")) {
    throw new QrContactError(
      "Use a contact email other than your Apple private relay address.",
    );
  }
  return email;
}
export function qrContactWeddingDate(value: unknown) {
  if (typeof value !== "string") {
    throw new QrContactError("Choose a valid wedding date.");
  }
  const date = value.trim();
  if (!date) return "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new QrContactError("Choose a valid wedding date.");
  }
  const [year, month, day] = date.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (
    year < 1900 || parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 || parsed.getUTCDate() !== day
  ) {
    throw new QrContactError("Choose a real wedding date.");
  }
  return date;
}
function safeText(value: unknown, max: number) {
  if (typeof value !== "string" || /[<>\u0000-\u001f\u007f]/.test(value)) {
    return "";
  }
  const text = value.trim().replace(/ +/g, " ");
  return text.length <= max ? text : "";
}
export function qrContactWeddingVenue(value: unknown) {
  if (
    typeof value !== "string" || /[<>\u0000-\u001f\u007f]/.test(value) ||
    value.trim().length > 200
  ) {
    throw new QrContactError(
      "Enter a wedding venue of 200 characters or fewer.",
    );
  }
  return value.trim().replace(/ +/g, " ");
}
export function qrContactMissing(
  profile: { name: string; email: string; phone: string },
) {
  const missing: string[] = [];
  if (
    !profile.name ||
    ["couple", "weddingwin", "weddingwin couple"].includes(
      profile.name.toLowerCase(),
    )
  ) missing.push("name");
  try {
    qrContactDirectEmail(profile.email);
  } catch {
    missing.push("email");
  }
  const digits = profile.phone.replace(/\D/g, "");
  if (!profile.phone || digits.length < 7 || digits.length > 15) {
    missing.push("phone number");
  }
  return missing;
}
export function qrContactProfileFromRow(
  eventKey: string,
  coupleId: string,
  row: Record<string, unknown> | null,
  user: Record<string, unknown>,
): QrContactProfile {
  const saved = Boolean(row);
  let email = "", weddingDate = "";
  try {
    email = qrContactDirectEmail(row ? row.email : user.email);
  } catch { /* editable prefill */ }
  try {
    weddingDate = qrContactWeddingDate(
      row
        ? row.wedding_date
        : String(user.wedding_date || "").replace(/^0000-00-00$/, ""),
    );
  } catch { /* no guessed date */ }
  const profile = {
    event_key: eventKey,
    couple_id: coupleId,
    name: safeText(
      row
        ? row.name
        : [user.first_name, user.last_name].filter(Boolean).join(" "),
      160,
    ),
    email,
    phone: safeText(
      row ? row.phone : user.phone_number || user.phone || "",
      80,
    ),
    wedding_date: weddingDate,
    wedding_venue: weddingDate ? safeText(row?.wedding_venue ?? "", 200) : "",
    version: saved ? Number(row!.version) : 0,
    saved,
    complete: false,
    missing_fields: [] as string[],
    updated_at: saved ? String(row!.updated_at || "") : null,
    date_sync_pending: row?.date_sync_pending === true,
  };
  if (
    ["couple", "weddingwin", "weddingwin couple"].includes(
      profile.name.toLowerCase(),
    )
  ) profile.name = "";
  profile.missing_fields = qrContactMissing(profile);
  profile.complete = saved && profile.missing_fields.length === 0;
  if (!saved && !profile.missing_fields.length) {
    profile.missing_fields = ["contact details"];
  }
  return profile;
}
export async function loadQrContactProfile(
  db: any,
  eventKey: string,
  coupleId: string,
  user: Record<string, unknown>,
) {
  const { data, error } = await db.from("qr_bingo_contact_profiles")
    .select(
      "event_key,couple_bd_user_id,name,email,phone,wedding_date,wedding_venue,version,updated_at,date_sync_pending",
    )
    .eq("event_key", eventKey).eq("couple_bd_user_id", coupleId).maybeSingle();
  if (error) {
    throw new QrContactError(
      "QR Bingo contact details are temporarily unavailable. Please try again.",
      "contact_profile_unavailable",
      503,
    );
  }
  if (
    data && (data.event_key !== eventKey || data.couple_bd_user_id !== coupleId)
  ) {
    throw new QrContactError(
      "QR Bingo contact details could not be verified.",
      "contact_profile_unavailable",
      503,
    );
  }
  if (
    data &&
    (!Number.isSafeInteger(Number(data.version)) || Number(data.version) < 1)
  ) {
    throw new QrContactError(
      "QR Bingo contact details could not be verified.",
      "contact_profile_unavailable",
      503,
    );
  }
  return qrContactProfileFromRow(eventKey, coupleId, data, user);
}
export function validateQrContactSave(
  input: unknown,
  current: QrContactProfile,
) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new QrContactError("Add your contact details for QR Bingo.");
  }
  const body = input as Record<string, unknown>;
  const allowed = [
    "name",
    "email",
    "phone",
    "wedding_date",
    "wedding_venue",
    "expected_version",
  ];
  if (Object.keys(body).some((key) => !allowed.includes(key))) {
    throw new QrContactError(
      "The contact request contains unsupported fields.",
    );
  }
  if (
    !Number.isSafeInteger(body.expected_version) ||
    Number(body.expected_version) < 0
  ) {
    throw new QrContactError(
      "Reload your QR Bingo details before saving.",
      "contact_profile_conflict",
      409,
    );
  }
  const profile = {
    name: safeText(body.name, 160),
    email: qrContactDirectEmail(body.email),
    phone: safeText(body.phone, 80),
    wedding_date: Object.prototype.hasOwnProperty.call(body, "wedding_date")
      ? qrContactWeddingDate(body.wedding_date)
      : current.wedding_date,
  };
  const requestedVenue =
    Object.prototype.hasOwnProperty.call(body, "wedding_venue")
      ? qrContactWeddingVenue(body.wedding_venue)
      : current.wedding_venue || "";
  const weddingVenue = profile.wedding_date ? requestedVenue : "";
  const missing = qrContactMissing(profile);
  if (missing.length) {
    throw new QrContactError(`Add your ${missing.join(", ")} for QR Bingo.`);
  }
  return {
    ...profile,
    wedding_venue: weddingVenue,
    expected_version: Number(body.expected_version),
    sync_date: Object.prototype.hasOwnProperty.call(body, "wedding_date"),
  };
}
export async function saveQrContactProfile(
  db: any,
  eventKey: string,
  coupleId: string,
  user: Record<string, unknown>,
  input: unknown,
) {
  const current = await loadQrContactProfile(db, eventKey, coupleId, user);
  const profile = validateQrContactSave(input, current);
  const { data, error } = await db.rpc(
    "save_qr_bingo_contact_profile_with_venue",
    {
      p_event_key: eventKey,
      p_couple_id: coupleId,
      p_expected_version: profile.expected_version,
      p_name: profile.name,
      p_email: profile.email,
      p_phone: profile.phone,
      p_wedding_date: profile.wedding_date,
      p_sync_date: profile.sync_date,
      p_wedding_venue: profile.wedding_venue,
    },
  );
  if (error) {
    if (error.code === "42501") {
      throw new QrContactError(
        "This account is no longer available. Please sign in again.",
        "member_deleted",
        401,
      );
    }
    if (error.code === "23505") {
      throw new QrContactError(
        "That contact email is already entered in one of your vendor draws. Use a different contact email.",
        "contact_email_conflict",
        409,
      );
    }
    throw new QrContactError(
      "QR Bingo details could not be saved. Please try again.",
      "contact_profile_unavailable",
      503,
    );
  }
  if (!data?.ok) {
    throw new QrContactError(
      "Your QR Bingo details changed in another session. Reload them and try again.",
      "contact_profile_conflict",
      409,
    );
  }
  return await loadQrContactProfile(db, eventKey, coupleId, user);
}
export function qrContactUser<T extends Record<string, unknown>>(
  user: T,
  profile: QrContactProfile,
) {
  // Identity, plan, token, and vendor authorization always come from the actual
  // authenticated BD member; only these draw-contact fields are replaced.
  return {
    ...user,
    first_name: profile.name,
    last_name: "",
    email: profile.email,
    phone_number: profile.phone,
    phone: profile.phone,
    wedding_date: profile.wedding_date,
    wedding_venue: profile.wedding_venue,
    custom_wedding_date: "",
  };
}

/** Account email is never changed here. Failed/contended date propagation is
 * durable and retried by contact GET; it is never reported as a full save. */
export async function syncQrContactWeddingDate(
  db: any,
  profile: QrContactProfile,
  user: Record<string, unknown>,
  deps: {
    callBd: BdWeddingDateCall;
    fetchUser: (id: string) => Promise<Record<string, unknown> | undefined>;
  },
) {
  let latest = profile;
  let failureStage = "contact_sync_contention";
  for (let attempt = 0; attempt < 3 && latest.date_sync_pending; attempt++) {
    const body = new URLSearchParams({
      user_id: latest.couple_id,
      wedding_date: latest.wedding_date,
    });
    if (!latest.wedding_date) body.set("__clear_fields", "wedding_date");
    const update = await deps.callBd("/api/v2/user/update", {
      method: "PUT",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });
    if (!update.response.ok || update.body.status !== "success") {
      failureStage = !update.response.ok
        ? `bd_update_http_${
          Number.isInteger(update.response.status)
            ? update.response.status
            : "error"
        }`
        : "bd_update_rejected";
      break;
    }
    try {
      await syncExistingBdWeddingDateMetadata(
        deps.callBd,
        latest.couple_id,
        latest.wedding_date,
      );
    } catch (error) {
      if (!(error instanceof BdWeddingDateSyncError)) throw error;
      failureStage = error.diagnostic;
      break;
    }
    const readback = await deps.fetchUser(latest.couple_id);
    if (
      !readback || String(readback.user_id) !== latest.couple_id ||
      !Object.prototype.hasOwnProperty.call(readback, "wedding_date")
    ) {
      failureStage = "bd_date_readback_missing";
      break;
    }
    const actual = String(readback.wedding_date ?? "").trim().replace(
      /^0000-00-00$/,
      "",
    );
    const current = await loadQrContactProfile(
      db,
      latest.event_key,
      latest.couple_id,
      user,
    );
    if (current.version !== latest.version) {
      // Our older BD write may have landed after a newer save finished syncing.
      // Mark that newer version pending again before repairing its date.
      const marked = await db.from("qr_bingo_contact_profiles").update({
        date_sync_pending: true,
      })
        .eq("event_key", current.event_key).eq(
          "couple_bd_user_id",
          current.couple_id,
        ).eq("version", current.version);
      if (marked.error) {
        failureStage = "contact_pending_write_failed";
        break;
      }
      latest = await loadQrContactProfile(
        db,
        current.event_key,
        current.couple_id,
        user,
      );
      continue;
    }
    if (actual !== latest.wedding_date) {
      failureStage = "bd_date_readback_mismatch";
      break;
    }
    const cleared = await db.from("qr_bingo_contact_profiles").update({
      date_sync_pending: false,
    })
      .eq("event_key", latest.event_key).eq(
        "couple_bd_user_id",
        latest.couple_id,
      ).eq("version", latest.version)
      .select("version");
    if (cleared.error) {
      failureStage = "contact_sync_ack_failed";
      break;
    }
    latest = await loadQrContactProfile(
      db,
      latest.event_key,
      latest.couple_id,
      user,
    );
  }
  if (latest.date_sync_pending) {
    throw new QrContactError(
      "Your QR Bingo contacts are saved, but your wedding date has not synced yet. Please try again.",
      "contact_date_sync_pending",
      503,
      failureStage,
    );
  }
  return latest;
}
