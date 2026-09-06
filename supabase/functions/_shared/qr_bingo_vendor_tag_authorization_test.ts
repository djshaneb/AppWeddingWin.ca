import {
  bdTagCollectionHasId,
  bdUserHasTag,
  bdUserIsActiveQrBingoVendor,
} from "./bd_tag_membership.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const syncUrls = [
  new URL("../bd-qr-bingo-sync/index.ts", import.meta.url),
  new URL("../bd-qr-bingo-vendor-sync/index.ts", import.meta.url),
];

Deno.test("every vendor dashboard action requires the published QR Bingo tag", async () => {
  for (const url of syncUrls) {
    const source = await Deno.readTextFile(url);
    const label = url.pathname.split("/").at(-2) || url.pathname;

    assert(
      source.includes("function hasCurrentQrBingoVendorTag") &&
        source.includes("bdUserHasTag(user, qrBingoConfig().vendor_tag_id)") &&
        source.includes("bdUserIsActiveQrBingoVendor(") &&
        source.includes('from "../_shared/bd_tag_membership.ts"') &&
        !source.includes("function containsBdTag"),
      `${label} does not resolve the currently published BD vendor tag`,
    );
    assert(
      source.includes(
        "const user = websiteCoupleUser || await fetchFullBdUserById(authenticatedMemberId);",
      ) &&
        !source.includes("? ({ user_id: nativeSession.user_id } as BdRow)"),
      `${label} can authorize an isolated vendor without loading current BD tags`,
    );
    assert(
      source.includes("async function resolveVendorForRaffleAction") &&
        source.includes("return hasCurrentQrBingoVendorTag(user)") &&
        source.includes("? isolatedFixtureVendor(reviewFixture)") &&
        source.includes(
          "return await resolveVendorForCurrentUser(page, user);",
        ) &&
        (source.match(/const vendor = await resolveVendorForRaffleAction\(/g) ||
            [])
            .length === 9,
      `${label} does not gate all nine vendor dashboard and read-only navigation routes`,
    );
    const replacement = source.slice(source.indexOf('if (action === "vendor_raffle_replace")'), source.indexOf('if (action === "vendor_raffle_review")'));
    assert(replacement.includes("await resolveVendorForRaffleAction(") && replacement.includes("return replacePotentialWinner("),
      `${label} replacement must use the same current vendor-tag authorization`);
    assert(
      source.includes(
        "if (!userId || !isEligibleVendor || !name) return null;",
      ),
      `${label} does not require active status and the event tag for production vendors`,
    );
    const access = source.slice(source.indexOf('if (action === "vendor_dashboard_access")'), source.indexOf("const isReviewCouple = Boolean("));
    assert(access.includes("await resolveVendorForRaffleAction(") &&
      !/getSettings|getVendorRaffleDashboard|loadVendorEntryPool|drawWinner/.test(access),
      `${label} navigation must enforce the same tag gate without initializing a draw or exposing contacts`);
    assert(source.includes("const authenticatedMemberId = websitePrincipal?.userId || String(nativeSession!.user_id)") &&
      source.includes("await verifyQrBingoWebsiteRequest(request, rawBody, body") &&
      source.includes("if (!await nativeSessionMatchesCachedBdIdentity(nativeSession))"),
      `${label} needs either signed website proof or the unchanged native cached identity`);
  }
});

Deno.test("BD tag membership accepts only authoritative tag IDs", () => {
  const liveUnrelatedTag = {
    id: "14",
    tag_name: "Vendor 30 showcase",
    group_tag_id: "9",
    added_by: "30",
    created_at: "2026-08-30 14:16:11",
    updated_at: "2030-01-01 00:00:00",
  };

  assert(
    !bdTagCollectionHasId([liveUnrelatedTag], "30"),
    "tag names, actor IDs, and timestamps must not grant membership",
  );
  assert(
    bdTagCollectionHasId([{ ...liveUnrelatedTag, id: "30" }], "30"),
    "the live include_tags id field must grant membership",
  );
  assert(
    bdTagCollectionHasId([{ tag_id: 30 }], "30"),
    "a relationship tag_id must grant membership",
  );
  assert(
    bdTagCollectionHasId("29, 30|31", "30"),
    "strict numeric tag ID lists must be supported",
  );
  assert(
    !bdTagCollectionHasId("booth 30", "30") &&
      !bdTagCollectionHasId("2026-08-30 14:16:11", "30"),
    "free text must never be interpreted as a tag ID list",
  );
});

Deno.test("production and private fixture vendor tag gates fail closed", () => {
  const activeWithoutTag = { active: "2", tags: [{ id: "29" }] };
  const inactiveWithTag = { active: "1", tags: [{ id: "30" }] };
  const activeWithTag = { active: "2", tags: [{ id: "30" }] };

  assert(
    !bdUserIsActiveQrBingoVendor(activeWithoutTag, 30),
    "an active production vendor without the event tag must be denied",
  );
  assert(
    !bdUserIsActiveQrBingoVendor(inactiveWithTag, 30),
    "an inactive ordinary vendor must be denied even when tagged",
  );
  assert(
    bdUserIsActiveQrBingoVendor(activeWithTag, 30),
    "an active tagged production vendor must be allowed",
  );
  assert(
    bdUserHasTag(inactiveWithTag, 30),
    "the explicitly isolated private review fixture may use tag-only authorization",
  );
  assert(
    !bdUserHasTag({ active: "1", tags: [{ id: "29" }] }, 30),
    "an isolated fixture without the current tag must be denied",
  );
});
