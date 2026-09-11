const app = await Deno.readTextFile(
  new URL("../../../app/(tabs)/index.tsx", import.meta.url),
);
const termsPage = await Deno.readTextFile(
  new URL(
    "../../../brilliant-directories/pages/about-terms.html",
    import.meta.url,
  ),
);

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

function block(source: string, marker: string) {
  const start = source.indexOf(marker);
  assert(start >= 0, marker + " is missing");
  const open = source.indexOf("{", start);
  assert(open >= 0, marker + " has no block");
  let depth = 0;
  for (let index = open; index < source.length; index++) {
    if (source[index] === "{") depth++;
    if (source[index] === "}") depth--;
    if (!depth) return source.slice(start, index + 1);
  }
  throw new Error(marker + " is unterminated");
}

const start = app.indexOf("function NativeQrScanner(");
const end = app.indexOf("\ntype BottomNavIcon", start);
assert(start >= 0 && end > start, "native QR scanner is missing");
const scanner = app.slice(start, end);
const noticeStart = scanner.indexOf(") : showingParticipationNotice ? (");
const noticeEnd = scanner.indexOf(") : scanWindowClosed ? (", noticeStart);
assert(
  noticeStart >= 0 && noticeEnd > noticeStart,
  "pre-camera agreement is missing",
);
const notice = scanner.slice(noticeStart, noticeEnd);
const modal = scanner.slice(scanner.indexOf("<Modal"));
const noticeVersion = "2026-09-04-pre-scan-draw-consent";

Deno.test("one linked short agreement appears before the camera, with full details on the terms page", () => {
  const checkbox = notice.indexOf('testID="qr-bingo-terms-acknowledgement"');
  const above = notice.slice(
    0,
    notice.lastIndexOf("<TouchableOpacity", checkbox),
  )
    .replace(/\s+/g, " ");
  assert(
    notice.includes('testID="qr-bingo-pre-scan-agreement"') &&
      notice.includes(
        'accessibilityLabel="I have read and agree to the QR Bingo Terms and Draw Rules."',
      ) &&
      /<Text style=\{styles\.signupConsentText\}>\s*I have read and agree to the QR Bingo Terms and Draw Rules\.\s*<\/Text>/
        .test(notice) &&
      (scanner.match(/accessibilityRole="checkbox"/g) || []).length === 1 &&
      !modal.includes('accessibilityRole="checkbox"'),
    "exactly one agreement belongs before the scanner and no checkbox belongs in the vendor offer",
  );
  for (
    const text of [
      "Scanning records QR Bingo progress. It does not enter a draw.",
      "While the organizer has opened QR scanning, including early access, scanning a vendor whose draw is on can offer an optional entry.",
      "Read and agree to the QR Bingo Terms and Draw Rules before scanning.",
      "When asked whether to enter the named vendor's draw, choose Yes to enter under that agreement or No to keep only the scan.",
      "The displayed entry closing time and scheduled draw time still apply.",
      "I have read and agree to the QR Bingo Terms and Draw Rules.",
      "I confirm I meet the age and residency requirements and am not excluded under those rules.",
      "If I choose Yes to enter a named vendor's draw, Wedding Win Inc. will share my name, email address,",
      "phone number, wedding date, wedding venue if provided, and entry/consent evidence with that named vendor.",
      "offers and promotions",
      "unsubscribe from vendor marketing",
      "Each vendor is responsible for its draw, winner verification, and prize fulfilment.",
      "Wedding Win Inc. provides the technical system.",
      "Apple Inc. is not a sponsor of and is not involved in these promotions.",
    ]
  ) {
    assert(
      termsPage.replace(/\s+/g, " ").includes(text),
      "linked QR terms must preserve the disclosure: " + text,
    );
  }
  for (
    const text of [
      "Scanning records your booth visit",
      "When I choose Enter Draw",
      "The named vendor is responsible",
    ]
  ) {
    assert(
      !notice.includes(text),
      "main agreement must not duplicate linked legal paragraphs",
    );
  }
  assert(
    termsPage.includes('id="qr-bingo"') &&
      app.includes("const QR_BINGO_TERMS_URL = `${TERMS_URL}#qr-bingo`;") &&
      above.includes("Linking.openURL(QR_BINGO_TERMS_URL)") &&
      above.includes("Linking.openURL(eventConfig.official_rules_url)") &&
      above.includes("Linking.openURL(PRIVACY_URL)") &&
      (above.match(/accessibilityRole="link"/g) || []).length === 3 &&
      !/onPress=\{acceptParticipationNotice\}|enterRaffle\(/.test(above),
    "separate accessible terms/rules/privacy links must never accept consent or enter a draw",
  );
  assert(
    noticeEnd < scanner.indexOf("<CameraView") &&
      scanner.includes('testID="qr-bingo-live-camera"') &&
      /!participationNoticeAccepted[\s\S]*?requestCameraPermissionRef\.current\(\)/
        .test(scanner),
    "the camera and permission request must remain behind current notice acceptance",
  );
});

Deno.test("stored participation acceptance rotates for account, event, rules and notice version", () => {
  assert(
    app.includes(
      "const QR_BINGO_PARTICIPATION_NOTICE_VERSION = '" + noticeVersion + "';",
    ),
    "materially changed pre-camera consent must use the new shared notice version",
  );
  const keyExpression = block(scanner, "const participationNoticeKey = useMemo")
    .replace("const participationNoticeKey = useMemo(", "");
  const makeKey = new Function(
    "member",
    "nativeSession",
    "eventConfig",
    "QR_BINGO_PARTICIPATION_NOTICE_VERSION",
    "return (" + keyExpression + ")();",
  );
  const member = { user_id: "test-couple" };
  const session = { user_id: "test-couple" };
  const event = { event_key: "test-event", rules_version: "rules-v1" };
  const current = makeKey(member, session, event, noticeVersion);
  const acceptedExpression = scanner.slice(
    scanner.indexOf("const participationNoticeAccepted ="),
    scanner.indexOf("// The pre-camera agreement"),
  );
  const isAccepted = new Function(
    "participationNoticeKey",
    "acceptedParticipationNoticeKey",
    acceptedExpression + "\nreturn participationNoticeAccepted;",
  );
  assert(
    !isAccepted(current, "") && isAccepted(current, current),
    "only the exact current saved acknowledgement may unlock scanning",
  );
  for (
    const changed of [
      makeKey(
        { user_id: "other-couple" },
        { user_id: "other-couple" },
        event,
        noticeVersion,
      ),
      makeKey(
        member,
        session,
        { ...event, event_key: "other-event" },
        noticeVersion,
      ),
      makeKey(
        member,
        session,
        { ...event, rules_version: "rules-v2" },
        noticeVersion,
      ),
      makeKey(member, session, event, "2026-09-01-in-person-entry"),
      "",
    ]
  ) {
    assert(
      changed !== current && !isAccepted(current, changed),
      "stale account, event or version acceptance must not unlock the camera",
    );
  }
  assert(
    scanner.includes("SecureStore.getItemAsync(participationNoticeKey)") &&
      scanner.includes("value === '1' ? participationNoticeKey : ''") &&
      scanner.includes("if (active) setAcceptedParticipationNoticeKey") &&
      scanner.includes("active = false;"),
    "asynchronous restore must remain bound to its original key and ignore a disposed request",
  );
});

Deno.test("accepting before the scanner stores only the acknowledgement and never enters a draw", () => {
  const callback = block(
    scanner,
    "const acceptParticipationNotice = useCallback",
  )
    .replace("const acceptParticipationNotice = useCallback(", "");
  for (const complete of [true, false]) {
    let accepted = "";
    const writes: string[][] = [];
    const accept = new Function(
      "participationNoticeKey",
      "contactProfileComplete",
      "nativeSession",
      "accountDeletionIsInFlight",
      "setAcceptedParticipationNoticeKey",
      "setBingoError",
      "SecureStore",
      "reviewingParticipationNoticeRef",
      "setReviewingParticipationNotice",
      "return " + callback + ";",
    )(
      "current-notice-key",
      complete,
      { user_id: "test-couple", token: "local-stub" },
      () => false,
      (key: string) => accepted = key,
      () => {},
      {
        setItemAsync: (key: string, value: string) => {
          writes.push([key, value]);
          return Promise.resolve();
        },
      },
      { current: false },
      () => {},
    ) as () => void;
    accept();
    assert(
      accepted === (complete ? "current-notice-key" : ""),
      "incomplete contact details cannot be acknowledged past the profile gate",
    );
    assert(
      writes.length === (complete ? 1 : 0),
      "only an explicit valid acknowledgement is stored",
    );
    if (complete) {
      assert(writes[0][1] === "1", "store the version-bound acknowledgement");
    }
  }
  assert(
    !callback.includes("enterRaffle") &&
      !callback.includes("fetchQrBingoJsonWithTimeout"),
    "acceptance must never send a draw entry or contact-sharing request",
  );
});

Deno.test("the agreement is content-sized with accessible links and no inner legal scroll", () => {
  const compact = block(app, "qrAgreementFrame:");
  const cameraFrame = block(app, "qrCameraFrame:");
  const panel = block(app, "qrConsentPanel:");
  const links = block(app, "qrConsentLinks:");
  const link = block(app, "qrConsentLink:");
  const agreement = block(app, "qrConsentAgreement:");
  const actions = notice.indexOf("<View style={styles.qrConsentActions}>");
  const checkbox = notice.indexOf('testID="qr-bingo-terms-acknowledgement"');
  assert(
    /showingParticipationNotice && styles\.qrAgreementFrame/.test(scanner) &&
      compact.includes("height: 'auto'") && compact.includes("minHeight: 0") &&
      !compact.includes("flex: 1") && !panel.includes("flex: 1") &&
      cameraFrame.includes("height: '38%'") &&
      cameraFrame.includes("minHeight: 260"),
    "agreement must size to its short contents, leaving the accepted scanner camera sizing unchanged",
  );
  assert(
    notice.indexOf("Before you scan") < actions &&
      !notice.includes("<ScrollView") &&
      !notice.includes("Scroll to read") &&
      checkbox > actions &&
      link.includes("minHeight: 44") && agreement.includes("minHeight: 44") &&
      links.includes("flexWrap: 'wrap'") &&
      !notice.includes("onScroll=") &&
      !notice.slice(checkbox, notice.indexOf("</TouchableOpacity>", checkbox))
        .includes("disabled="),
    "links must wrap with separate 44-point targets and the checkbox must remain reachable without an inner legal scroll",
  );
});

Deno.test("accepted users can review the agreement without rewriting consent or running the camera", () => {
  const open = block(scanner, "const reviewParticipationNotice = useCallback")
    .replace("const reviewParticipationNotice = useCallback(", "");
  const close = block(
    scanner,
    "const returnFromParticipationNotice = useCallback",
  )
    .replace("const returnFromParticipationNotice = useCallback(", "");
  for (const blocked of ["", "unaccepted", "scan", "offer", "entry"]) {
    const reviewing = { current: false };
    const changes: boolean[] = [];
    const review = new Function(
      "participationNoticeAccepted",
      "scanInFlightRef",
      "raffleOfferInFlightRef",
      "raffleEntryInFlightRef",
      "reviewingParticipationNoticeRef",
      "setReviewingParticipationNotice",
      "return " + open + ";",
    )(
      blocked !== "unaccepted",
      { current: blocked === "scan" },
      { current: blocked === "offer" },
      { current: blocked === "entry" },
      reviewing,
      (value: boolean) => changes.push(value),
    );
    review();
    assert(
      reviewing.current === !blocked && changes.length === (blocked ? 0 : 1),
      "review must be read-only and cannot interrupt an in-flight draw or scan",
    );
    const back = new Function(
      "reviewingParticipationNoticeRef",
      "setReviewingParticipationNotice",
      "return " + close + ";",
    )(reviewing, (value: boolean) => changes.push(value));
    back();
    assert(
      !reviewing.current && changes.at(-1) === false,
      "return closes the read-only review",
    );
  }
  assert(
    !/SecureStore|setAcceptedParticipationNoticeKey|enterRaffle|fetchQrBingo/
      .test(open + close) &&
      scanner.includes(
        "(!participationNoticeAccepted || reviewingParticipationNotice)",
      ) &&
      scanner.includes(
        "if (reviewingParticipationNoticeRef.current) return;",
      ) &&
      notice.includes('testID="qr-bingo-agreement-accepted"') &&
      notice.includes('testID="qr-bingo-agreement-return"') &&
      scanner.includes('testID="qr-bingo-agreement-review"'),
    "review must show a non-interactive accepted row, unmount the camera, and never reset or resubmit consent",
  );
});

Deno.test("post-scan vendor offer is only the named prompt and Yes or No under the prior agreement", () => {
  assert(
    modal.replace(/\s+/g, "").includes(
      "visible={vendorDrawsEnabled&&participationNoticeAccepted&&!!raffleOffer}",
    ) && modal.includes("raffleOffer?.vendor_name") &&
      !modal.includes("prize_description") && !modal.includes("eligibility_region") &&
      !modal.includes("entry_access") && !modal.includes("View vendor draw rules"),
    "the offer must stay a simple named Yes/No choice after the existing pre-camera agreement",
  );
  const enterStart = modal.indexOf("styles.raffleEnterButton");
  const enter = modal.slice(enterStart, modal.indexOf("</TouchableOpacity>", enterStart));
  assert(enter.includes("onPress={enterRaffle}") && enter.includes("disabled={raffleEntryDisabled}") &&
    /<Text style=\{styles\.raffleEnterText\}>\s*Yes\s*<\/Text>/.test(enter),
    "Yes must be the only explicit draw entry action");
  const declineStart = modal.indexOf("styles.raffleCancelButton");
  const decline = modal.slice(declineStart, modal.indexOf("</TouchableOpacity>", declineStart));
  assert(decline.includes(">No</Text>") && decline.includes("setRaffleOffer(null)") &&
    !decline.includes("enterRaffle") && !decline.includes("setAcceptedParticipationNoticeKey"),
    "No closes the offer without entering or erasing the prior agreement");
});

Deno.test("booth scan and repeat scan cannot create a draw entry", () => {
  for (
    const marker of [
      "const saveBingoScan = useCallback",
      "const handleBarcodeScanned = useCallback",
    ]
  ) {
    const scan = block(scanner, marker);
    assert(
      scan.includes("!participationNoticeAccepted") &&
        !scan.includes("action: 'raffle_opt_in'") &&
        !scan.includes("enterRaffle("),
      marker + " must require acceptance and never submit a draw entry",
    );
  }
  const reopen = block(scanner, "const reopenVendorDrawOffer = useCallback");
  assert(
    reopen.includes("!participationNoticeAccepted") &&
      reopen.includes("action: 'raffle_offer'") &&
      !reopen.includes("action: 'raffle_opt_in'"),
    "previous booth tiles must not bypass the pre-camera agreement or enter automatically",
  );
});

Deno.test("explicit entry retains current-notice, eligibility, stale-offer and in-flight audit gates", () => {
  const derived = scanner.slice(
    scanner.indexOf("const raffleRulesViewedVersion ="),
    scanner.indexOf(
      "useEffect",
      scanner.indexOf("const raffleRulesViewedVersion ="),
    ),
  );
  const derive = new Function(
    "participationNoticeAccepted",
    "raffleOffer",
    "eventConfig",
    derived +
      "\nreturn { rules: raffleRulesViewedVersion, age: ageOfMajorityAttested, residency: residencyAttested, exclusions: exclusionsAttested, sharing: promotionResponsibilityAccepted };",
  );
  const current = derive(true, { consent_version: "rules-v1" }, {
    rules_version: "rules-v1",
  });
  const absent = derive(false, { consent_version: "rules-v1" }, {
    rules_version: "rules-v1",
  });
  const stale = derive(true, { consent_version: "old" }, {
    rules_version: "rules-v1",
  });
  assert(
    current.rules === "rules-v1" && current.age && current.residency &&
      current.exclusions && current.sharing,
    "current pre-camera terms plus explicit Enter supply the existing attestation fields",
  );
  assert(
    !absent.rules && !absent.age && !absent.residency && !absent.exclusions &&
      !absent.sharing && !stale.rules,
    "absent acceptance or stale offer rules cannot satisfy entry validation",
  );
  const entry = block(scanner, "const enterRaffle = useCallback");
  const staleTerms = block(
    entry,
    "if (raffleRulesViewedVersion !== raffleOffer.consent_version)",
  );
  assert(
    staleTerms.includes("setRaffleOffer(null)") &&
      staleTerms.includes("setAcceptedParticipationNoticeKey('')") &&
      staleTerms.includes(
        "Review the current QR Bingo terms before continuing.",
      ),
    "stale or missing terms must return to the pre-camera agreement, not ask for a removed draw checkbox",
  );
  const lock = entry.search(
    /raffleEntryInFlightRef\.current = true;\s*setRaffleSaving\(true\);/,
  );
  assert(lock >= 0, "entry must acquire the synchronous submission lock");
  for (
    const guard of [
      "eventVendorDrawsEnabled !== true",
      "raffleEntryInFlightRef.current",
      "!Number.isFinite(Date.parse(vendorOfferVersion))",
      "raffleRulesViewedVersion !== raffleOffer.consent_version",
      "!ageOfMajorityAttested",
      "!residencyAttested",
      "!exclusionsAttested",
      "!promotionResponsibilityAccepted",
      "if (!participantResponsibilityDisclosure)",
    ]
  ) assert(entry.slice(0, lock).includes(guard), "entry lost guard " + guard);
  assert(
    entry.indexOf("fetchQrBingoJsonWithTimeout") > lock &&
      entry.includes("participation_notice_version:") &&
      entry.includes("QR_BINGO_PARTICIPATION_NOTICE_VERSION") &&
      /vendor_marketing_consent_acknowledged:\s*promotionResponsibilityAccepted/
        .test(entry) &&
      /draw_administration_contact_share_acknowledged:\s*promotionResponsibilityAccepted/
        .test(entry),
    "entry must carry the current pre-camera notice and explicit named-vendor consent after validation",
  );
});
