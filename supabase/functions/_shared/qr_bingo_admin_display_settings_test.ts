function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const adminWidgetUrl = new URL(
  "../../../brilliant-directories/widgets/ww-qr-bingo-settings.php",
  import.meta.url,
);

Deno.test("QR Bingo admin publishes the app card and venue settings", async () => {
  const source = await Deno.readTextFile(adminWidgetUrl);

  assert(
    source.includes("'event_name', 'venue_name'") &&
      source.includes(
        "'history_starts_at', 'app_card_enabled', 'scan_enabled'",
      ) &&
      source.includes(
        "ww_qrbs_post_scalar($source, 'venue_name', $errors)",
      ) &&
      source.includes("ww_qrbs_is_plain_text($venueName, 1, 160, false)") &&
      source.includes("'venue_name' => $venueName") &&
      source.includes(
        "'app_card_enabled' => ww_qrbs_post_boolean($source, 'app_card_enabled', $errors)",
      ),
    "venue_name and app_card_enabled must be allowlisted, validated, and included in the published config",
  );

  assert(
    source.includes("$ww_qrbs_form_config = $ww_qrbs_current_config;") &&
      source.includes("'venue_name' => ''") &&
      source.includes("'app_card_enabled' => false") &&
      source.includes(
        "value=\"<?php echo ww_qrbs_escape($ww_qrbs_form_config['venue_name']); ?>\"",
      ) &&
      source.includes(
        "ww_qrbs_truthy($ww_qrbs_form_config['app_card_enabled'])",
      ),
    "the form must initialize both settings from the current DTO and use safe defaults only when absent",
  );
});

Deno.test("QR Bingo admin explains app-card status and show dates plainly", async () => {
  const source = await Deno.readTextFile(adminWidgetUrl);

  assert(
    source.includes('name="venue_name" type="text" maxlength="160" required') &&
      source.includes('name="app_card_enabled" type="checkbox" value="1"') &&
      source.includes(
        "When this is off, the card is grey and says “Available at Wedding Shows”.",
      ),
    "the admin UI must expose the venue and clearly explain the app-card toggle",
  );
  assert(
    source.includes(
      '<label for="ww-qrbs-history-start">Wedding show starts</label>',
    ) &&
      source.includes(
        '<label for="ww-qrbs-entry-close">Wedding show ends (and prize entries close)</label>',
      ) &&
      !source.includes("Start counting booth visits</label>") &&
      !source.includes("Prize entries close</label>"),
    "the two operational timestamps must use clear wedding-show labels without changing their field names",
  );
});
