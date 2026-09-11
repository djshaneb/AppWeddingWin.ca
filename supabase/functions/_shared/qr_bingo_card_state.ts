export type QrBingoCardState = {
  event_key: string;
  couple_id: string;
  generation: number;
  scan_reset_after: string | null;
};

export class QrBingoCardStateError extends Error {
  constructor(
    message =
      "QR Bingo card status is temporarily unavailable. Refresh before continuing.",
    public status = 503,
    public code = "card_state_unavailable",
  ) {
    super(message);
  }
}

export function parseQrBingoCardState(
  value: unknown,
  event: string,
  couple: string,
): QrBingoCardState {
  const row = value as QrBingoCardState | null;
  if (
    !row || row.event_key !== event || row.couple_id !== couple ||
    !Number.isSafeInteger(row.generation) || row.generation < 0 ||
    (row.generation === 0
      ? row.scan_reset_after !== null
      : typeof row.scan_reset_after !== "string" ||
        !Number.isFinite(Date.parse(row.scan_reset_after)))
  ) {
    throw new QrBingoCardStateError();
  }
  return {
    event_key: event,
    couple_id: couple,
    generation: row.generation,
    scan_reset_after: row.scan_reset_after,
  };
}

// Capture this state BEFORE reading website/fixture scan proof. A reset racing
// with that read is rejected atomically by the entry generation trigger.
export async function loadQrBingoCardState(
  db: any,
  event: string,
  couple: string,
): Promise<QrBingoCardState> {
  let result;
  try {
    result = await db.rpc("read_qr_bingo_card_state", {
      p_event_key: event,
      p_couple_id: couple,
    });
  } catch {
    throw new QrBingoCardStateError();
  }
  if (result?.error) throw new QrBingoCardStateError();
  return parseQrBingoCardState(result?.data, event, couple);
}

export function assertQrBingoCardGeneration(
  state: QrBingoCardState,
  supplied?: unknown,
): number {
  // Existing native builds have no generation field; their fresh server read
  // still binds the subsequent scan proof and entry transaction to one epoch.
  if (
    supplied !== undefined &&
    (!Number.isSafeInteger(supplied) || supplied !== state.generation)
  ) {
    throw new QrBingoCardStateError(
      "An administrator reset this Bingo card. Refresh and scan the vendor again.",
      409,
      "stale_card_generation",
    );
  }
  return state.generation;
}
