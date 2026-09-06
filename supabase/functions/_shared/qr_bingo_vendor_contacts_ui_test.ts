function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function section(source: string, startMarker: string, endMarker: string) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert(start >= 0 && end > start, `Missing source section: ${startMarker}`);
  return source.slice(start, end);
}

const appUrl = new URL("../../../app/(tabs)/index.tsx", import.meta.url);

Deno.test("vendor contacts use plain wording and keep technical references internal", async () => {
  const app = await Deno.readTextFile(appUrl);
  const contacts = section(
    app,
    '<View testID="vendor-draw-step-couples">',
    '<View testID="vendor-draw-step-winner">',
  );
  const compact = contacts.replace(/\s+/g, " ");

  for (
    const text of [
      "Couples entered",
      "Can be picked",
      "Picked so far",
      "Your contact list",
      "Removing someone from the draw keeps their contact details in your list.",
      "Remove from draw",
      "Add back to draw",
      "Download all contacts, including couples removed from the draw.",
      "Use their shared details for this draw and wedding-related offers.",
    ]
  ) {
    assert(compact.includes(text), `Missing simple contact wording: ${text}`);
  }
  for (
    const staleText of [
      "member IDs",
      "database IDs",
      "Entry reference:",
      "entry/consent evidence",
      "In selection pool",
      "Selection pool paused",
      "audit record",
    ]
  ) {
    assert(
      !contacts.includes(staleText),
      `Technical UI wording returned: ${staleText}`,
    );
  }
  for (
    const testId of [
      "vendor-draw-load-contacts",
      "vendor-draw-contact-search",
      "vendor-draw-download-contacts",
    ]
  ) {
    assert(
      contacts.includes(`testID="${testId}"`),
      `${testId} must stay stable`,
    );
  }
  assert(
    compact.includes(
      "const participantReference = entry.participant_reference;",
    ) &&
      contacts.includes("key={participantReference}") &&
      contacts.includes("isExpanded ? null : participantReference"),
    "opaque references must remain internal keys for the correct contact",
  );
  assert(
    contacts.includes("`mailto:${entrantEmail}`") &&
      contacts.includes("`tel:${dialValue}`") &&
      contacts.includes("entry.couple_wedding_date"),
    "email, phone, and wedding date must remain available on contact cards",
  );
});

Deno.test("renamed contact filters still use the real selection state and search every shared field", async () => {
  const app = await Deno.readTextFile(appUrl);
  const memo = section(
    app,
    "const vendorRaffleVisibleEntries = useMemo(() => {",
    "}, [vendorRaffleEntries, vendorRaffleEntryFilter, vendorRaffleEntryQuery]);",
  );
  const body = memo.slice(memo.indexOf("{") + 1);
  const filterContacts = new Function(
    "vendorRaffleEntries",
    "vendorRaffleEntryFilter",
    "vendorRaffleEntryQuery",
    body,
  );
  const statuses = [
    "included",
    "excluded",
    "already_selected",
    "previous_winner",
    "disqualified",
    "reacceptance_required",
    "in_person_scan_required",
  ];
  const contacts = statuses.map((status, index) => ({
    participant_reference: `fictional-contact-${index}`,
    couple_name: `Test Couple ${index}`,
    couple_email: `couple${index}@example.invalid`,
    couple_phone: `555-010${index}`,
    couple_wedding_date: `2027-10-${String(index + 1).padStart(2, "0")}`,
    included: status !== "excluded",
    in_selection_pool: status === "included",
    pool_status: status,
  }));

  assert(
    filterContacts(contacts, "all", "").length === 7,
    "all contacts must retain removed and previous winners",
  );
  const included = filterContacts(contacts, "included", "");
  assert(
    included.length === 1 && included[0] === contacts[0],
    "Can be picked must not include protected or excluded entries",
  );
  assert(
    filterContacts(contacts, "excluded", "").length === 6,
    "Cannot be picked must include every currently protected state",
  );
  for (
    const query of [
      "TEST COUPLE 3",
      "couple3@example.invalid",
      "555-0103",
      "2027-10-04",
    ]
  ) {
    const results = filterContacts(contacts, "all", query);
    assert(
      results.length === 1 && results[0] === contacts[3],
      `Search did not retain ${query}`,
    );
  }
  assert(
    filterContacts(contacts, "included", "Test Couple 3").length === 0,
    "search must not bypass the selected filter",
  );
  assert(
    contacts.length === 7 && contacts[1].included === false,
    "filtering must not mutate the contact list",
  );
});

Deno.test("simple add and remove prompts retain confirmation, reasons, and pending-winner locks", async () => {
  const app = await Deno.readTextFile(appUrl);
  const update = section(
    app,
    "const updateVendorRaffleEntry = async (",
    "const drawVendorWinner = async () => {",
  );
  const compact = update.replace(/\s+/g, " ");
  for (
    const guard of [
      "vendorRaffleHasPendingPotentialWinner",
      "vendorRaffleEntryUpdatingReference",
      "vendorRaffleActionInFlightRef.current",
      "if (!participantReference)",
      "if (!included && !reason)",
      "await prepareVendorRaffleAction(actionKey)",
      "accountMutationIsCurrent(deletionGeneration)",
    ]
  ) {
    assert(update.includes(guard), `Contact changes lost guard: ${guard}`);
  }
  assert(
    update.includes(
      "included ? 'Add back to the draw?' : 'Remove from the draw?'",
    ) &&
      update.includes("text: 'Cancel'") &&
      update.includes("text: included ? 'Add back' : 'Remove'") &&
      compact.includes(
        "action: 'vendor_raffle_entry_update', native_session: nativeSession, participant_reference: participantReference, included, reason, exclusion_reason: reason",
      ),
    "plain prompts must still confirm a scoped update to the original couple record",
  );
  assert(
    !/protected participant reference|selection pool|entrant CSV/.test(update),
    "technical contact prompt wording returned",
  );
});

Deno.test("short contact download copy does not weaken the complete vendor-scoped CSV contract", async () => {
  const app = await Deno.readTextFile(appUrl);
  const download = section(
    app,
    "const downloadVendorParticipationReport = async () => {",
    "const vendorDrawPrizePreview =",
  );
  for (
    const guard of [
      "data.report.contains_contact_data !== true",
      "data.report.marketing_consent_included !== true",
      "data.report.report_kind !== 'named_vendor_draw_contacts'",
      "data.report.rules_version !== expectedRulesVersion",
      "data.report.event_key !== expectedEventKey",
      "data.report.event_revision !== expectedEventRevision",
      "data.report.vendor_bingo_id !== expectedVendorBingoId",
      "data.report.vendor_bd_user_id !== expectedVendorBdUserId",
      "data.report.vendor_name !== expectedVendorName",
      "reportFile.write(data.report.csv)",
    ]
  ) {
    assert(download.includes(guard), `CSV contract lost ${guard}`);
  }
  assert(
    download.indexOf("if (data.report.row_count < 1)") <
        download.indexOf("Sharing.isAvailableAsync()") &&
      download.includes("'No current entrants'") &&
      download.includes("There are no couples to download for this draw yet."),
    "the empty list must show a friendly message before opening file sharing",
  );
  assert(
    !download.includes("vendorRaffleVisibleEntries"),
    "CSV must not be narrowed to the current search or filter",
  );
});
