function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

const endpointUrls = [
  new URL("../bd-qr-bingo-sync/index.ts", import.meta.url),
  new URL("../bd-qr-bingo-vendor-sync/index.ts", import.meta.url),
];

function functionBody(source: string, name: string) {
  const marker = `function ${name}`;
  const start = source.indexOf(marker);
  assert(start >= 0, `${name} is missing`);
  const nextFunction = source.indexOf("\nfunction ", start + marker.length);
  const nextAsyncFunction = source.indexOf(
    "\nasync function ",
    start + marker.length,
  );
  const candidates = [nextFunction, nextAsyncFunction].filter((value) =>
    value >= 0
  );
  const end = candidates.length ? Math.min(...candidates) : source.length;
  return source.slice(start, end);
}

Deno.test("isolated QR fixtures use their own valid server terms while production stays exact", async () => {
  const sources = await Promise.all(
    endpointUrls.map((url) => Deno.readTextFile(url)),
  );

  for (const source of sources) {
    const fixtureMatch = functionBody(
      source,
      "isolatedFixtureMatchesSettings",
    );
    const enterable = functionBody(source, "isSettingsEnterable");

    for (
      const required of [
        "fixture?.enabled",
        "fixture.event_key !== config.event_key",
        "fixture.event_key === settings.event_key",
        "fixture.vendor_bingo_id === settings.vendor_bingo_id",
        "fixture.vendor_bd_user_id === settings.vendor_bd_user_id",
        "validPromotionTime(fixture.expires_at)",
        "new Date(fixture.expires_at).getTime() > Date.now()",
      ]
    ) {
      assert(
        fixtureMatch.includes(required),
        `isolated fixture identity gate is missing ${required}`,
      );
    }
    assert(
      !fixtureMatch.includes("startsWith") &&
        !fixtureMatch.includes("event_key.startsWith"),
      "an event-name prefix alone must never authorize isolated terms",
    );

    for (
      const required of [
        "const fixtureTerms = isolatedFixtureMatchesSettings(",
        "const scheduleIsValid =",
        "validPromotionTime(entryClosesAt)",
        "validPromotionTime(drawOpensAt)",
        "validPromotionTime(drawAt)",
        "const fixtureAllowsEarlyDraw = Boolean(",
        "fixtureTerms && isolatedFixture?.allow_early_draw === true",
        "fixtureAllowsEarlyDraw ||",
        "new Date(drawAt).getTime() >= new Date(entryClosesAt).getTime()",
        "const eventTermsMatch = fixtureTerms",
        "? Boolean(cleanText(settings?.eligibility_region, 300))",
        "settings?.event_key === config.event_key",
        "new Date(config.entry_closes_at).getTime()",
        "new Date(config.draw_opens_at).getTime()",
        "new Date(config.draw_at).getTime()",
        "scheduleIsValid",
        "eventTermsMatch",
      ]
    ) {
      assert(
        enterable.includes(required),
        `enterability gate is missing ${required}`,
      );
    }
    assert(
      !enterable.includes("alternateFreeEntryUrl") &&
        !enterable.includes("alternate_free_entry_url") &&
        !enterable.includes("validHttpsUrl"),
      "vendor entry must not depend on the retired off-site entry URL",
    );
    assert(
      /new Date\(drawOpensAt\)\.getTime\(\) >=\s*new Date\(entryClosesAt\)\.getTime\(\)/
        .test(enterable),
      "non-early fixture and production draws must not open before entries close",
    );

    assert(
      source.includes(
        "if (!isSettingsEnterable(settings, isolatedFixture)) return null;",
      ) &&
        source.includes(
          "if (!isSettingsEnterable(settings, isolatedFixture)) {",
        ) &&
        source.includes(
          "can_draw: entryPool.eligible_entry_count > 0 &&\n      isSettingsEnterable(settings, isolatedFixture)",
        ) &&
        source.includes(
          "{ ...settings, enabled: true },\n      isolatedFixture,",
        ),
      "offer, opt-in, draw, and dashboard rules-current paths must all receive fixture context",
    );

    assert(
      source.includes(
        "reviewFixture.event_key,\n            reviewFixture,",
      ) &&
        /reviewFixture && isReviewCouple &&\s*vendor\.id === reviewFixture\.vendor_bingo_id\s*\? reviewFixture\s*: null,/
          .test(
            source,
          ),
      "the exact authenticated fixture must reach couple scan, offer, and opt-in validation",
    );
  }
});
