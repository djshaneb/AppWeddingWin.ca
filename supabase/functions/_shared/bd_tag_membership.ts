const DIRECT_TAG_ID_FIELDS = ["tag_id", "tagId", "id"] as const;
const NESTED_TAG_COLLECTION_FIELDS = [
  "data",
  "items",
  "tags",
  "member_tags",
  "user_tags",
  "relationships",
] as const;
const USER_TAG_COLLECTION_FIELDS = [
  "tags",
  "member_tags",
  "tag_ids",
  "user_tags",
] as const;

function normalizedTagId(value: unknown) {
  if (typeof value === "number") {
    return Number.isSafeInteger(value) && value >= 0 ? String(value) : "";
  }
  if (typeof value !== "string") return "";
  const text = value.trim();
  return /^\d+$/.test(text) ? text : "";
}

function strictTagIdListContains(value: string, expectedTagId: string) {
  const text = value.trim();
  if (!/^\d+(?:\s*[,|]\s*\d+)*$/.test(text)) return false;
  return text.split(/[,|]/).some((item) => item.trim() === expectedTagId);
}

/**
 * Reads a Brilliant Directories tag collection without inspecting arbitrary
 * metadata. Live `include_tags=1` rows contain names and timestamps, so only
 * documented ID fields, strict numeric ID lists, and ID-keyed maps may grant
 * membership.
 */
export function bdTagCollectionHasId(
  value: unknown,
  expectedTagIdValue: string | number,
): boolean {
  const expectedTagId = normalizedTagId(expectedTagIdValue);
  if (
    !expectedTagId || value === null || value === undefined || value === false
  ) {
    return false;
  }

  if (Array.isArray(value)) {
    return value.some((item) => bdTagCollectionHasId(item, expectedTagId));
  }

  if (typeof value === "number") {
    return normalizedTagId(value) === expectedTagId;
  }

  if (typeof value === "string") {
    return strictTagIdListContains(value, expectedTagId);
  }

  if (typeof value !== "object") return false;
  const row = value as Record<string, unknown>;

  for (const field of DIRECT_TAG_ID_FIELDS) {
    if (normalizedTagId(row[field]) === expectedTagId) return true;
  }

  if (Object.prototype.hasOwnProperty.call(row, expectedTagId)) {
    const mappedValue = row[expectedTagId];
    if (
      mappedValue !== null && mappedValue !== undefined &&
      mappedValue !== false
    ) return true;
  }

  return NESTED_TAG_COLLECTION_FIELDS.some((field) =>
    Object.prototype.hasOwnProperty.call(row, field) &&
    bdTagCollectionHasId(row[field], expectedTagId)
  );
}

export function bdUserHasTag(
  user: Record<string, unknown> | null | undefined,
  expectedTagId: string | number,
) {
  if (!user) return false;
  return USER_TAG_COLLECTION_FIELDS.some((field) =>
    bdTagCollectionHasId(user[field], expectedTagId)
  );
}

export function bdUserIsActiveQrBingoVendor(
  user: Record<string, unknown> | null | undefined,
  expectedTagId: string | number,
) {
  return String(user?.active ?? "").trim() === "2" &&
    bdUserHasTag(user, expectedTagId);
}
