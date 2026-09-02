export type WinnerVerificationEvidence = {
  date: string;
  method: string;
  reference: string;
  additionalNotes: string;
  normalized: string;
};

const MAX_EVIDENCE_LENGTH = 1100;
const MAX_METHOD_LENGTH = 300;
const MAX_REFERENCE_LENGTH = 300;
const MAX_ADDITIONAL_NOTES_LENGTH = 400;
const UNSAFE_PLAIN_TEXT = /[<>\u0000-\u001f\u007f\u2028\u2029]/;

function validCalendarDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const candidate = new Date(0);
  candidate.setUTCHours(0, 0, 0, 0);
  candidate.setUTCFullYear(year, month - 1, day);
  return candidate.getUTCFullYear() === year &&
    candidate.getUTCMonth() === month - 1 &&
    candidate.getUTCDate() === day;
}

function boundedPlainText(value: string, maxLength: number) {
  const normalized = value.trim().replace(/ {2,}/g, " ");
  if (
    !normalized || normalized.length > maxLength ||
    UNSAFE_PLAIN_TEXT.test(normalized)
  ) {
    return "";
  }
  return normalized;
}

export function parseWinnerVerificationEvidence(
  value: unknown,
): WinnerVerificationEvidence | null {
  if (typeof value !== "string" || value.length > MAX_EVIDENCE_LENGTH) {
    return null;
  }
  const normalizedLines = value.replace(/\r\n?/g, "\n").trim();
  const match =
    /^Date: ([^\n]*)\nMethod: ([^\n]*)\nReference: ([^\n]*)(?:\nAdditional notes: ([^\n]*))?$/
      .exec(
        normalizedLines,
      );
  if (!match || !validCalendarDate(match[1])) return null;

  const method = boundedPlainText(match[2], MAX_METHOD_LENGTH);
  const reference = boundedPlainText(match[3], MAX_REFERENCE_LENGTH);
  const additionalNotes = match[4] === undefined
    ? ""
    : boundedPlainText(match[4], MAX_ADDITIONAL_NOTES_LENGTH);
  if (!method || !reference || (match[4] !== undefined && !additionalNotes)) {
    return null;
  }

  const lines = [
    `Date: ${match[1]}`,
    `Method: ${method}`,
    `Reference: ${reference}`,
  ];
  if (additionalNotes) lines.push(`Additional notes: ${additionalNotes}`);
  return {
    date: match[1],
    method,
    reference,
    additionalNotes,
    normalized: lines.join("\n"),
  };
}
