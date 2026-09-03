const appSource = await Deno.readTextFile(
  new URL('../../../app/(tabs)/index.tsx', import.meta.url),
);
const aboutSource = await Deno.readTextFile(
  new URL('../../../app/(tabs)/about.tsx', import.meta.url),
);
const chatSource = await Deno.readTextFile(
  new URL('../bd-chat-sync/index.ts', import.meta.url),
);
const sharedChatSource = await Deno.readTextFile(
  new URL('./bd_chat.ts', import.meta.url),
);
const pushSource = await Deno.readTextFile(
  new URL('../bd-register-push-token/index.ts', import.meta.url),
);
const deletionGuardSource = await Deno.readTextFile(
  new URL('../../../lib/account_deletion_state.ts', import.meta.url),
);
const outboxMigration = await Deno.readTextFile(
  new URL(
    '../../migrations/20260902070000_chat_send_idempotency_and_outbox_leases.sql',
    import.meta.url,
  ),
);

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

Deno.test(
  'rapid app actions are synchronously owned instead of state-only guarded',
  () => {
    for (const required of [
      'bottomNavigationFrameRef',
      'navigationIntentGenerationRef',
      'authOperationInFlightRef',
      'logoutOperationGenerationRef',
      'nativeChatSendInFlightRef',
      'nativeChatSendRequestGenerationRef',
      'nativeChatImagePickerInFlightRef',
      'nativeChatReportInFlightRef',
      'scanInFlightRef',
      'raffleOfferInFlightRef',
      'raffleEntryInFlightRef',
      'vendorRaffleActionInFlightRef',
      'vendorRaffleEntriesRequestGenerationRef',
    ]) {
      assert(
        appSource.includes(required),
        `missing rapid-action owner: ${required}`,
      );
    }
    assert(
      appSource.includes('finishLogoutInFlightRef.current') &&
        appSource.includes(
          'logoutOperationGenerationRef.current !== logoutGeneration',
        ) &&
        /beginAuthOperation[\s\S]*?logoutInFlightRef\.current[\s\S]*?pendingAppLogoutRef\.current/.test(
          appSource,
        ),
      'sign-out, website logout, and a new login must not race each other',
    );
    assert(
      aboutSource.includes('deleteInFlightRef.current = true') &&
        aboutSource.includes('deleteInFlightRef.current = false') &&
        aboutSource.includes('beginAccountDeletion') &&
        deletionGuardSource.includes('accountDeletionIsInFlight') &&
        appSource.includes('accountDeletionIsInFlight()'),
      'account deletion must reject same-frame duplicate taps',
    );
    assert(
      appSource.includes('webViewSessionGenerationRef') &&
        appSource.includes('hideWebsiteBrowser') &&
        /hideWebsiteBrowser[\s\S]*?advanceWebViewSession\(\)[\s\S]*?setShowBrowser\(false\)/.test(
          appSource,
        ),
      'retired WebViews must become inert before they are hidden',
    );
  },
);

Deno.test(
  'sign out is separated at bottom left and always asks for confirmation',
  () => {
    assert(
      appSource.includes('signOutConfirmationVisibleRef') &&
        appSource.includes('const requestSignOut = () =>') &&
        appSource.includes(
          'if (signOutConfirmationVisibleRef.current) return',
        ) &&
        appSource.includes("'Sign out of WeddingWin?'") &&
        appSource.includes(
          "'Are you sure you want to sign out of your account?'",
        ) &&
        appSource.includes("style: 'cancel'") &&
        appSource.includes("style: 'destructive'") &&
        appSource.includes('onPress={requestSignOut}'),
      'native sign out must reject rapid repeats and require an explicit destructive confirmation',
    );
    assert(
      appSource.includes('styles.bottomLeftSignOutButton') &&
        appSource.includes('styles.anchoredSignOutButton') &&
        appSource.includes('styles.loginBackdropWithAnchoredSignOut') &&
        /bottomLeftSignOutButton:\s*\{[\s\S]*?alignSelf: 'flex-start'/.test(
          appSource,
        ) &&
        /bottomLeftSignOutButton:\s*\{[\s\S]*?minHeight: 44/.test(appSource) &&
        /anchoredSignOutButton:\s*\{[\s\S]*?position: 'absolute'[\s\S]*?left: 16[\s\S]*?bottom: 10/.test(
          appSource,
        ) &&
        /loginBackdropWithAnchoredSignOut:\s*\{[\s\S]*?paddingBottom: 64/.test(
          appSource,
        ) &&
        appSource.includes('testID="native-sign-out"') &&
        appSource.includes('<LogOut'),
      'the sign-out control must be anchored outside the action panel at the lower left',
    );
  },
);

Deno.test(
  'chat retries are idempotent and delivery completion is transactional',
  () => {
    assert(
      outboxMigration.includes('app_native_chat_messages_client_message_key') &&
        outboxMigration.includes('enqueue_app_native_chat_message_delivery') &&
        outboxMigration.includes('complete_bd_chat_send') &&
        outboxMigration.includes('park_bd_chat_outbox') &&
        outboxMigration.includes('for update') &&
        outboxMigration.includes('claim_token = p_claim_token'),
      'message insert, retry identity, lease ownership, and completion must be durable',
    );
    assert(
      chatSource.includes('client_message_id') &&
        sharedChatSource.includes('await completeOutboxSend(') &&
        sharedChatSource.includes('String(row.message_token || "")') &&
        sharedChatSource.includes('findBdMessageByToken') &&
        sharedChatSource.includes('property: "message_token"') &&
        sharedChatSource.includes('.eq("message_owner", owner)') &&
        sharedChatSource.includes(
          'String(candidate.message_owner || "").trim() === owner',
        ),
      'the client id, sender identity, and stable website id must survive an ambiguous retry',
    );
    assert(
      outboxMigration.indexOf('with ranked_send as') <
        outboxMigration.indexOf('bd_chat_outbox_send_client_message_key') &&
        outboxMigration.indexOf('with ranked_close as') <
          outboxMigration.indexOf('bd_chat_outbox_pending_close_key') &&
        outboxMigration.includes('enqueue_bd_chat_close') &&
        outboxMigration.includes(
          'grant execute on function public.enqueue_bd_chat_close(text, text) to service_role',
        ) &&
        outboxMigration.includes(
          'create or replace function public.purge_weddingwin_member_data(',
        ) &&
        outboxMigration.includes(
          'purge_weddingwin_member_data_without_fixture_participants_v1',
        ) &&
        outboxMigration.includes(
          'lock table public.bd_chat_outbox in share row exclusive mode',
        ) &&
        sharedChatSource.includes('admin.rpc(\n    "enqueue_bd_chat_close"'),
      'duplicate sends and closes must be reconciled before atomic unique queues are enabled',
    );
  },
);

Deno.test(
  'cold website chat identity and thread creation converge across workers',
  () => {
    for (const required of [
      'bd_create_token',
      'reserve_bd_chat_identity',
      'confirm_bd_chat_identity',
      'identity_synced_at',
      'pg_advisory_xact_lock',
    ]) {
      assert(
        outboxMigration.includes(required),
        `missing identity invariant: ${required}`,
      );
    }
    assert(
      sharedChatSource.includes('"reserve_bd_chat_identity"') &&
        sharedChatSource.includes('"confirm_bd_chat_identity"') &&
        sharedChatSource.includes('findBdThreadByToken') &&
        sharedChatSource.includes('String(data.bd_create_token') &&
        sharedChatSource.includes('.eq("bd_create_token", threadToken)') &&
        sharedChatSource.includes(
          'The app conversation mapping was not persisted.',
        ),
      'workers must reserve one member identity and reconcile one stable website thread token',
    );
  },
);

Deno.test(
  'chat outbox preserves ordering without letting a paused photo block text',
  () => {
    assert(
      outboxMigration.includes('claim_bd_chat_outbox') &&
        outboxMigration.includes('distinct on') &&
        outboxMigration.includes('skip locked') &&
        outboxMigration.includes('linked_thread.thread_token') &&
        outboxMigration.includes('app_thread.bd_thread_token') &&
        outboxMigration.includes(
          "app_thread.bd_create_token = nullif(outbox.thread_token, '')",
        ) &&
        outboxMigration.includes(
          "app_thread.bd_create_token = nullif(outbox.app_thread_token, '')",
        ),
      'workers must claim at most one eligible operation per conversation',
    );
    assert(
      /markOutboxPaused[\s\S]*?parkOutbox\(row, 10/.test(sharedChatSource) &&
        /CHAT_IMAGES_ENABLED[\s\S]*?Delivery paused:%/.test(sharedChatSource) &&
        sharedChatSource.includes('renew_bd_chat_outbox_claim'),
      'a gated photo must park outside the active queue and resume only when the image gate opens',
    );
  },
);

Deno.test(
  'push replacement, logout retry, and native overlays are stress-safe',
  () => {
    assert(
      appSource.includes('pushRegistrationSerialRef') &&
        appSource.includes('PENDING_PUSH_UNREGISTER_KEY') &&
        appSource.includes('retryPendingPushUnregister') &&
        pushSource.includes(
          '.eq("bd_member_token", String(nativeSession.token || ""))',
        ),
      'a stale push cleanup must not disable a newer login and failed logout cleanup must retry',
    );
    assert(
      /openChatWithBridge[\s\S]*?beginNavigationIntent\(\)[\s\S]*?setShowNativeQrScanner\(false\)/.test(
        appSource,
      ) &&
        /openNativeQrScanner[\s\S]*?invalidateNavigationIntent\(\)[\s\S]*?setShowNativeChat\(false\)/.test(
          appSource,
        ),
      'QR and Messages must be mutually exclusive and cancel older bridge navigation',
    );
  },
);

Deno.test(
  'concurrent read receipts merge and acknowledge without erasing newer ids',
  () => {
    assert(
      outboxMigration.includes('bd_chat_outbox_pending_read_key') &&
        outboxMigration.includes('enqueue_bd_chat_read_receipt') &&
        outboxMigration.includes('pg_advisory_xact_lock') &&
        outboxMigration.includes('acknowledge_bd_chat_read_receipts') &&
        outboxMigration.includes('p_processed_message_ids') &&
        !/acknowledge_bd_chat_read_receipts[\s\S]*?limit 500/i.test(
          outboxMigration,
        ),
      'read producers and workers must merge against the live row without silent truncation',
    );
    assert(
      sharedChatSource.includes('admin.rpc("enqueue_bd_chat_read_receipt"') &&
        sharedChatSource.includes(
          'admin.rpc("acknowledge_bd_chat_read_receipts"',
        ),
      'the worker must use the atomic read-receipt RPCs',
    );
  },
);

Deno.test(
  'push cleanup and chat sends retain ownership across account and thread switches',
  () => {
    assert(
      appSource.includes('pendingPushUnregisterMutationRef') &&
        appSource.includes('deletePendingPushUnregisterIfCurrent') &&
        /deletePendingPushUnregisterIfCurrent[\s\S]*?currentRaw !== expectedRaw[\s\S]*?deleteItemAsync\(PENDING_PUSH_UNREGISTER_KEY\)/.test(
          appSource,
        ) &&
        /retryPendingPushUnregister[\s\S]*?deletePendingPushUnregisterIfCurrent\(raw\)/.test(
          appSource,
        ),
      'an older push cleanup must compare the serialized record before deleting it',
    );
    assert(
      appSource.includes('nativeChatPendingTextSendsRef') &&
        appSource.includes('nativeChatPendingImageSendsRef') &&
        appSource.includes('new Map<') &&
        appSource.includes('sendThreadStillSelected') &&
        appSource.includes(
          'const pendingSendKey = `${capturedNativeSession.user_id}:${selectedChatThreadToken}`',
        ) &&
        appSource.includes(
          'const pendingSendKey = `${capturedNativeSession.user_id}:${sendThreadToken}`',
        ) &&
        appSource.includes('nativeSessionGenerationRef.current ===') &&
        appSource.includes('pendingSend.threadToken') &&
        appSource.includes('pendingImage.threadToken'),
      'ambiguous retry ids and visible send results must remain scoped to their originating thread',
    );
    assert(
      /const sendOperationId = Crypto\.randomUUID\(\)[\s\S]*?nativeChatSendInFlightRef\.current === sendOperationId[\s\S]*?setNativeChatSending\(false\)/.test(
        appSource,
      ) &&
        /const imageOperationId = Crypto\.randomUUID\(\)[\s\S]*?nativeChatImagePickerInFlightRef\.current === imageOperationId[\s\S]*?nativeChatSendInFlightRef\.current === imageOperationId/.test(
          appSource,
        ),
      "an old account operation must not release a newer account's send or picker lock",
    );
  },
);

Deno.test(
  'native and website destinations are exclusive even while vendor settings close',
  () => {
    assert(
      /prepareExclusiveWebsiteDestination[\s\S]*?nativeChatRequestGenerationRef\.current \+= 1[\s\S]*?setShowNativeChat\(false\)[\s\S]*?setShowNativeQrScanner\(false\)/.test(
        appSource,
      ) &&
        /openDashboardWithBridge[\s\S]*?prepareExclusiveWebsiteDestination\(\)/.test(
          appSource,
        ) &&
        /openWebsiteBuilderWithBridge[\s\S]*?prepareExclusiveWebsiteDestination\(\)/.test(
          appSource,
        ),
      'Dashboard and Website Builder must retire native overlays before bridge navigation',
    );
    assert(
      appSource.includes('vendorDrawCloserRef') &&
        appSource.includes('onRegisterVendorDrawCloser') &&
        /openChatWithBridge[\s\S]*?await closeVendorDraw\(\)[\s\S]*?navigationIntentGenerationRef\.current !== navigationIntent/.test(
          appSource,
        ),
      'opening chat must save-and-close the vendor modal and abandon a superseded navigation',
    );
  },
);

Deno.test(
  'vendor draw saves serialize with mutations and use monotonic edit ownership',
  () => {
    assert(
      appSource.includes('vendorRaffleLocalEditGenerationRef.current += 1') &&
        !appSource.includes(
          'vendorRaffleLastLocalEditRef.current = Date.now()',
        ) &&
        appSource.includes('vendorRaffleSavePromiseRef') &&
        appSource.includes('runVendorRaffleSave') &&
        appSource.includes('flushVendorRaffleSaveBeforeAction'),
      'autosave must coalesce and compare an edit generation instead of wall-clock milliseconds',
    );
    assert(
      /flushVendorRaffleSaveBeforeAction[\s\S]*?clearTimeout\(vendorRaffleSaveTimerRef\.current\)[\s\S]*?await pendingSave[\s\S]*?runVendorRaffleSave/.test(
        appSource,
      ) &&
        /vendorRaffleActionInFlightRef\.current[\s\S]*?Waiting for the current draw action[\s\S]*?runVendorRaffleSave/.test(
          appSource,
        ),
      'a draw action must flush an existing or scheduled save and pause autosave',
    );
    assert(
      appSource.includes(
        'if (signature === vendorRaffleLastSavedRef.current) {',
      ) &&
        appSource.includes('/saving|waiting/i.test(current)') &&
        appSource.includes("'Saved to the app and website.'"),
      'returning rapidly to an already-saved value must not strand the saving indicator',
    );
    assert(
      appSource.includes('vendorRaffleSettingsMutationBusy') &&
        appSource.includes('editable={!vendorRafflePrizeControlsDisabled}') &&
        appSource.includes('disabled={vendorRaffleSettingsMutationBusy}') &&
        appSource.includes('disabled={vendorRafflePrizeControlsDisabled}'),
      'settings controls must remain read-only while an action response can replace the dashboard',
    );
    for (const action of [
      'entry:${participantReference}',
      'draw-winner',
      'send-winner:${draw.id}',
      'review:${drawId}:${decision}',
      'export-entrants',
    ]) {
      const actionIndex = appSource.indexOf(action);
      assert(actionIndex >= 0, `missing vendor action marker: ${action}`);
      assert(
        appSource
          .slice(actionIndex, actionIndex + 700)
          .includes('await prepareVendorRaffleAction(actionKey)'),
        `vendor action must flush settings before mutation: ${action}`,
      );
    }
  },
);

Deno.test(
  'a deferred vendor action makes every settings control read-only until its dashboard response settles',
  () => {
    assert(
      /vendorRaffleSettingsMutationBusy = Boolean\([\s\S]*?vendorRaffleDrawing[\s\S]*?vendorRaffleSendingDrawId[\s\S]*?vendorRaffleReviewing[\s\S]*?vendorRaffleExporting[\s\S]*?vendorRaffleEntryUpdatingReference/.test(
        appSource,
      ),
      'each slow full-dashboard mutation must participate in the settings read-only state',
    );
    assert(
      (appSource.match(/disabled=\{vendorRaffleSettingsMutationBusy\}/g) || [])
        .length >= 2 &&
        (appSource.match(/vendorRafflePrizeControlsDisabled/g) || []).length >=
          8,
      'acceptance, open/close, prize, winner-count, and no-repeat controls must be disabled',
    );
  },
);

Deno.test('WebView retry ignores stale failures and same-frame repeats', () => {
  assert(
    appSource.includes('webViewReloadOwnerRef') &&
      /handleError[\s\S]*?failedUrl !== currentUrlRef\.current[\s\S]*?setError\(/.test(
        appSource,
      ) &&
      /const reload = useCallback[\s\S]*?webViewReloadOwnerRef\.current\) return[\s\S]*?advanceWebViewSession\(\)/.test(
        appSource,
      ),
    'retry must have synchronous ownership and stale WebView instances must be retired',
  );
});

Deno.test(
  'About contact has a useful fallback when no mail app is configured',
  () => {
    assert(
      aboutSource.includes(
        'async function openExternal(url: string, fallbackUrl?: string)',
      ) &&
        aboutSource.includes('await Linking.openURL(fallbackUrl)') &&
        aboutSource.includes('url="mailto:info@weddingwin.ca"') &&
        aboutSource.includes('fallbackUrl={`${SITE_URL}/about/contact`}'),
      "the Contact row must fall back to WeddingWin's web contact form when mailto cannot open",
    );
  },
);
